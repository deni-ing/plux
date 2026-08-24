/**
 * הלולאה שמדברת עם Claude. סעיף 7.2.
 *
 * ─── הממשק הצר, ולא טיפוסי ה-SDK ───
 *
 * ‏`ChatClient` למטה מוגדר כאן, לא מיובא מ-`@anthropic-ai/sdk`. שתי
 * סיבות, ורק אחת מהן זמנית:
 *
 * **הזמנית:** ה-registry של npm חסום בסביבת הפיתוח שלי, ולכן לא הצלחתי
 * להתקין את הספרייה ולאמת טיפוס-מול-טיפוס כמו לכל קובץ אחר בפרויקט
 * (וזה מה שקרה בפועל לכל שאר הקבצים — ראה תוצאות `npm test` על
 * `present.ts`). צורת הבקשה/תשובה כאן מגובה בדוגמאות קוד מהתיעוד הרשמי
 * של Anthropic ולא בניחוש, אבל **`npm run build` אצלך הוא האימות האמיתי
 * לגבול הזה** — לא הרגל, אלא הבדיקה היחידה שבאמת קיימת לו כרגע.
 *
 * **הקבועה:** גם בלי המגבלה, טיפוס מקומי צר בודק בדיוק את מה שהקוד
 * הזה משתמש בו — לא את כל מה שה-SDK מייצא. `new Anthropic()` מקיים
 * את הממשק הזה במובן המבני (structural typing) כי התשובה האמיתית
 * מכילה את `content` ו-`stop_reason`, לפי התיעוד. הבדיקה למטה מזריקה
 * לקוח מזויף שמקיים את אותו ממשק בדיוק, בלי לגעת ברשת בכלל.
 *
 * ─── ההגנות שקיימות כאן ───
 *
 * **1. תקרת סיבובים.** מודל שממשיך לבקש כלים בלי לענות הוא תקלה
 * אפשרית (כלי ששולח תשובה שהמודל לא מבין, ולכן מנסה שוב) — לא אמורה
 * לקרות, אבל ההגנה היא כנגד "לא אמורה" ולא כנגד "לא יכולה".
 *
 * **2. כלי שנכשל לא מפיל את השיחה.** שגיאה מ-`runTool` (מסד לא זמין,
 * חודש לא קיים) הופכת לתוצאת כלי שאומרת את זה, והמודל ממשיך משם —
 * בדיוק כמו ש-`NullClassifier` לא זורק במקום להחזיר תשובה ריקה.
 *
 * **3. טרנזקציית ה-DB לא נשארת פתוחה לאורך כל השיחה.** הגרסה הראשונה
 * קיבלה `db` מוכן מהקורא — טרנזקציה אחת שנפתחת ב-route ונסגרת רק אחרי
 * שהמודל סיים לענות. בפועל זה נכשל בייצור: Prisma סוגר טרנזקציה
 * אינטראקטיבית אחרי 5 שניות, וסיבוב עם קריאת כלי לוקח יותר מזה כי רוב
 * הזמן הוא המתנה לרשת ל-Claude, לא עבודה במסד. **טרנזקציה לא אמורה
 * להחזיק פתוח משהו שהיא לא שולטת במשך הזמן שלו** — ולכן `runChat`
 * ו-`streamChat` מקבלים `withUser` (פותח-טרנזקציה) ולא `db` מוכן, ופותחים
 * טרנזקציה קצרה חדשה לכל קריאת כלי בנפרד, לא אחת לכל השיחה.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { Db } from "../db/client";
import { TOOLS, runTool as runToolLive, type ToolDef } from "./tools";

/** אותה חתימה כמו `runTool` האמיתי — מאפשר להזריק גרסה מזויפת בטסטים. */
type RunTool = typeof runToolLive;

/**
 * פותח טרנזקציה קצרה, מריץ פונקציה, סוגר. בדיוק חתימת `withUser` /
 * `withCurrentUser` הקיימים ב-`lib/db/session.ts` — לא טיפוס חדש, רק
 * שם מקומי כדי שהקובץ הזה לא ייבא את Clerk או את Prisma ישירות.
 */
export type WithUser = <T>(fn: (db: Db) => Promise<T>) => Promise<T>;

export const CHAT_MODEL = process.env.PLUX_CHAT_MODEL ?? "claude-sonnet-5";

/** כמה סיבובי "המודל ביקש כלי" מותר לפני שעוצרים בכוח. */
const MAX_TOOL_ROUNDS = 6;

const MAX_TOKENS = 1024;

export const SYSTEM_PROMPT = `את/ה עוזר/ת פיננסי/ת בתוך Plux, אפליקציה שמנתחת דפי חשבון וכרטיסי
אשראי ישראליים. את/ה עונה למשתמש אחד, על הנתונים שלו בלבד.

כללים:
- כל סכום שהכלים מחזירים כבר בשקלים (₪), לא באגורות. אין צורך לחלק ב-100.
- אל תמציא/י מספרים. כל טענה עם סכום חייבת לבוא מקריאה לכלי. אם אין
  מידע מספיק — תגיד/י את זה, אל תנחש/י.
- שדה annualized בחיובים חוזרים יכול להיות null. זה לא באג וזה לא "אין
  מידע" — זה אומר שהחיוב חוזר בדפוס, אבל אף גורם לא הצהיר שזה מנוי
  קבוע (יכול להיות תשלומים שייגמרו). אם הוא null, אל תציג/י עלות שנתית
  ודאית — לכל היותר "אם זה יימשך בקצב הזה, ₪X בשנה".
- אם לא ברור אילו חודשים יש בכלל נתונים עליהם, קרא/י ל-listAvailableMonths
  לפני שאתה מנחש חודש.
- אין לך יכולת לסכם טווח של כמה חודשים בקריאת כלי אחת — כל קריאה
  מחזירה חודש בודד. אם נשאלת/ה על "כל הזמן" או טווח רחב, תגיד/י בפירוש
  שאת/ה יכול/ה לבדוק חודש-חודש ותציע/י זאת, במקום לנסות לכסות הכול.
- אם כלי מחזיר שגיאה — דווח/י בדיוק את מה שכתוב בה, או שאין לך תשובה.
  אסור להמציא סיבה טכנית (כמו "timeout" או "עומס") שלא מופיעה בפועל
  בתוצאת הכלי. סיבה מומצאת מזיקה יותר מ"אני לא יודע/ת".
- ל"חודש האחרון" אין קשר לתאריך של היום — אלה נתונים היסטוריים. תמיד
  תן/י ל-getMonthlyReport בלי month לקבל את החודש האחרון שיש עליו נתונים,
  במקום להניח שזה החודש הקלנדרי הנוכחי.
- עני/ה בעברית, בקצרה, במספרים קונקרטיים ולא בהערכות מעורפלות.`;

export type ChatMessage = { role: "user" | "assistant"; content: string };

type ChatBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

type ToolResultInput = { type: "tool_result"; tool_use_id: string; content: string };

type ChatApiMessage = { role: "user" | "assistant"; content: string | ChatBlock[] | ToolResultInput[] };

/** מה ש-`runChat` באמת צריך מהלקוח. ראה ההסבר למעלה. */
export type ChatClient = {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      tools: ToolDef[];
      messages: ChatApiMessage[];
    }): Promise<{ content: ChatBlock[]; stop_reason: string | null }>;
  };
};

function defaultClient(): ChatClient {
  // << ה-cast היחיד בקובץ עד כאן. הוא בדיוק הגבול שמתואר למעלה: המחלקה
  //    האמיתית עונה יותר ממה ש-ChatClient דורש, לא פחות.
  return new Anthropic() as unknown as ChatClient;
}

/**
 * מה ש-`streamChat` צריך מהלקוח. סעיף 7.3.
 *
 * ‏`stream()` מחזיר אובייקט שמפרסם אירועי טקסט תוך כדי קבלה, ומבטיח
 * הודעה סופית מלאה (content + stop_reason) — בדיוק כמו התשובה הרגילה
 * של `create`, רק אחרי שהטקסט כבר יצא החוצה חתיכה-חתיכה. הצורה הזו
 * מגובה בדוגמאות מהתיעוד הרשמי (helpers.md), לא בניחוש — אבל היא
 * חלק מאותה אי-ודאות שתוארה למעלה, ואותו `npm run build` הוא האימות.
 */
export type StreamChatClient = {
  messages: {
    stream(params: {
      model: string;
      max_tokens: number;
      system: string;
      tools: ToolDef[];
      messages: ChatApiMessage[];
    }): {
      on(event: "text", cb: (delta: string) => void): unknown;
      finalMessage(): Promise<{ content: ChatBlock[]; stop_reason: string | null }>;
    };
  };
};

function defaultStreamClient(): StreamChatClient {
  return new Anthropic() as unknown as StreamChatClient;
}

export type ChatTurn =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "limit"; rounds: number };

export type ChatResult = {
  reply: string;
  /** כל שלב בלולאה, כולל קריאות כלים — ליומן/דיבוג, לא למסך. */
  turns: ChatTurn[];
};

/**
 * מריץ את כל קריאות הכלים שביקש סיבוב אחד, ומחזיר את ה-tool_result
 * שצריך לצאת בהודעה הבאה. משותף ל-`runChat` ול-`streamChat` — הלוגיקה
 * הזו זהה בין השניים, ורק איך מתקבל הטקסט משתנה.
 */
async function dispatchToolCalls(
  withUser: WithUser,
  userId: string,
  toolUses: readonly Extract<ChatBlock, { type: "tool_use" }>[],
  runTool: RunTool,
  turns: ChatTurn[]
): Promise<ToolResultInput[]> {
  const results: ToolResultInput[] = [];
  for (const call of toolUses) {
    turns.push({ type: "tool_call", name: call.name, input: call.input });

    let result: unknown;
    try {
      // << טרנזקציה אחת קצרה לכל קריאת כלי — לא הטרנזקציה שפתח הקורא.
      //    ראה ההסבר למעלה: זו בדיוק הסיבה שיש WithUser ולא Db בחתימה.
      result = await withUser((db) =>
        runTool(db, userId, call.name, (call.input ?? {}) as Record<string, unknown>)
      );
    } catch (err) {
      result = { error: err instanceof Error ? err.message : String(err) };
    }

    turns.push({ type: "tool_result", name: call.name, result });
    results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
  }
  return results;
}

/**
 * מריץ שיחה אחת עד תשובה סופית, כולל כל קריאות הכלים שבדרך.
 *
 * `history` הוא כל השיחה עד כה (בלי system — זה קבוע ולא חלק מההיסטוריה
 * שהמשתמש רואה). הפונקציה לא כותבת ל-DB ולא שומרת שיחה — זה תפקיד
 * הקורא (ה-route), בדיוק כמו ש-`browse` לא מחליט מה מוצג.
 *
 * `withUser` הוא פותח-טרנזקציה (למשל `withCurrentUser` מ-`lib/db/session`
 * עם ה-userId כבר קשור), לא `db` מוכן — כל קריאת כלי פותחת טרנזקציה
 * משלה. ראה ההערה 3 בראש הקובץ.
 */
export async function runChat(
  withUser: WithUser,
  userId: string,
  history: readonly ChatMessage[],
  opts: { client?: ChatClient; runTool?: RunTool } = {}
): Promise<ChatResult> {
  const client = opts.client ?? defaultClient();
  const runTool = opts.runTool ?? runToolLive;
  const turns: ChatTurn[] = [];

  const messages: ChatApiMessage[] = history.map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    const textBlocks = response.content.filter(
      (b): b is Extract<ChatBlock, { type: "text" }> => b.type === "text"
    );
    const toolUses = response.content.filter(
      (b): b is Extract<ChatBlock, { type: "tool_use" }> => b.type === "tool_use"
    );

    for (const b of textBlocks) turns.push({ type: "text", text: b.text });

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      return { reply: textBlocks.map((b) => b.text).join("\n").trim(), turns };
    }

    messages.push({ role: "assistant", content: response.content });
    const results = await dispatchToolCalls(withUser, userId, toolUses, runTool, turns);
    messages.push({ role: "user", content: results });
  }

  // << לא תקלה שקטה: מה שהמשתמש רואה אומר במפורש שהתשובה לא הושלמה,
  //    במקום להיראות כמו תשובה רגילה שנקטעה סתם.
  turns.push({ type: "limit", rounds: MAX_TOOL_ROUNDS });
  return {
    reply: "השאלה דרשה יותר מדי שלבים ולא הגעתי לתשובה סופית. אפשר לנסח אותה מחדש או לפצל לשתי שאלות?",
    turns,
  };
}

/**
 * כמו `runChat`, אבל מזרימה את הטקסט של כל סיבוב דרך `onText` תוך כדי
 * קבלה — כולל טקסט שיוצא לפני שהמודל מחליט לבקש כלי ("בוא אבדוק...").
 * זה לא רק תשובה סופית שמוזרמת: זו בחירה מכוונת. **טקסט ביניים שמוצג
 * ברגע שהוא נוצר נותן למשתמש סימן שקורה משהו, במקום מסך דומם שמחכה
 * לתוצאה של קריאת כלי.**
 *
 * הערך המוחזר זהה ל-`runChat` (`reply`, `turns`) — לשמירה/דיבוג בצד
 * השרת, אחרי שהזרם כבר הגיע למסך.
 */
export async function streamChat(
  withUser: WithUser,
  userId: string,
  history: readonly ChatMessage[],
  onText: (delta: string) => void,
  opts: { client?: StreamChatClient; runTool?: RunTool } = {}
): Promise<ChatResult> {
  const client = opts.client ?? defaultStreamClient();
  const runTool = opts.runTool ?? runToolLive;
  const turns: ChatTurn[] = [];

  const messages: ChatApiMessage[] = history.map((m) => ({ role: m.role, content: m.content }));

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.messages.stream({
      model: CHAT_MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    let roundText = "";
    stream.on("text", (delta) => {
      roundText += delta;
      onText(delta);
    });

    const response = await stream.finalMessage();

    const toolUses = response.content.filter(
      (b): b is Extract<ChatBlock, { type: "tool_use" }> => b.type === "tool_use"
    );

    if (roundText) turns.push({ type: "text", text: roundText });

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      // << הטקסט כבר הוזרם למסך במלואו — לא צריך לחבר אותו שוב מ-response.content.
      return { reply: roundText.trim(), turns };
    }

    messages.push({ role: "assistant", content: response.content });
    const results = await dispatchToolCalls(withUser, userId, toolUses, runTool, turns);
    messages.push({ role: "user", content: results });
  }

  turns.push({ type: "limit", rounds: MAX_TOOL_ROUNDS });
  const limitMsg = "השאלה דרשה יותר מדי שלבים ולא הגעתי לתשובה סופית. אפשר לנסח אותה מחדש או לפצל לשתי שאלות?";
  onText(limitMsg);
  return { reply: limitMsg, turns };
}
