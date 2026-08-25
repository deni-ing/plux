/**
 * מסווג מבוסס Claude. סעיף 4.8 — הספק האמיתי הראשון לשכבת הסיווג.
 *
 * << נפרד לגמרי מ-lib/chat/client.ts, למרות ששניהם קוראים ל-Anthropic:
 *    כאן אין כלים (tools), אין שיחה מרובת-סיבובים, ואין streaming —
 *    קריאה אחת, פרומפט קבוע (SYSTEM_PROMPT מ-prompt.ts, שכבר קיים
 *    ונבדק בטסטים משלו), ותשובת JSON שנפרסת ע"י parseVerdicts הקיים.
 *
 * ‏`ClassifyClient` למטה הוא אותה מדיניות בדיוק כמו `ChatClient` ב-
 * lib/chat/client.ts: ממשק צר שבודק רק את מה שהקוד הזה משתמש בו, לא
 * את כל מה שה-SDK מייצא. `new Anthropic()` מקיים אותו במובן המבני —
 * התשובה האמיתית מכילה `content`, לפי התיעוד — ו-`npm run build` אצלך
 * הוא האימות לגבול הזה, מאותה סיבה שמוסברת שם.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { AiVerdict, CategoryClassifier } from "./types";
import { SYSTEM_PROMPT, buildUserPrompt, parseVerdicts } from "./prompt";

/** אותו משתנה סביבה מקביל ל-PLUX_CHAT_MODEL, לשכבת הסיווג בנפרד. */
export const CLASSIFY_MODEL = process.env.PLUX_CLASSIFY_MODEL ?? "claude-sonnet-5";

/**
 * << הועלה מ-4096 אחרי הרצה אמיתית על 74 בתי עסק: JSON בעברית עם שדה
 *    reason חופשי לכל שורה מגיע בקלות ל-~60-80 טוקן לפריט (עברית
 *    מתפצלת ליותר טוקנים מאנגלית), ו-74×80 קרוב מדי ל-4096. תשובה
 *    שנקטעת שם לא מייצרת JSON חלקי שימושי — היא שוברת את המערך כולו,
 *    ולכן "0 נענו" נראה כמו כישלון בפענוח כשבפועל זו הייתה חתיכה.
 *    ראו הבדיקה למטה על stop_reason — זו בדיוק הלקח מ-lib/chat/client.ts
 *    (stop_reason=max_tokens הוא תשובה נקטעת, לא סופית) מיושם כאן.
 */
const MAX_TOKENS = 8192;

type ClassifyBlock = { type: string; text?: string };

/** מה ש-classify() באמת צריך מהלקוח. ראה ChatClient ב-lib/chat/client.ts. */
export type ClassifyClient = {
  messages: {
    create(params: {
      model: string;
      max_tokens: number;
      system: string;
      messages: { role: "user"; content: string }[];
    }): Promise<{ content: ClassifyBlock[]; stop_reason: string | null }>;
  };
};

function defaultClient(): ClassifyClient {
  // << ה-cast היחיד בקובץ הזה. אותו גבול בדיוק כמו defaultClient()
  //    ב-lib/chat/client.ts.
  return new Anthropic() as unknown as ClassifyClient;
}

export class ClaudeClassifier implements CategoryClassifier {
  readonly name = "claude";
  private readonly client: ClassifyClient;
  private readonly model: string;

  constructor(client: ClassifyClient = defaultClient(), model: string = CLASSIFY_MODEL) {
    this.client = client;
    this.model = model;
  }

  async classify(merchants: string[], allowedSlugs: string[]): Promise<AiVerdict[]> {
    // << רשימה ריקה לא שווה קריאת רשת. classifyWithAi כבר בודק את זה
    //    לפני שהוא קורא לכאן, אבל הבדיקה החוזרת זולה ומגנה על קורא עתידי.
    if (merchants.length === 0) return [];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserPrompt(merchants, allowedSlugs) }],
    });

    // << אותו לקח בדיוק כמו lib/chat/client.ts: stop_reason="max_tokens"
    //    הוא תשובה נקטעת, לא סופית. כאן זה קריטי עוד יותר משם — תשובה
    //    שנקטעת באמצע מערך JSON לא מפרסרת לחלקית, היא נופלת ל-[] שלם,
    //    וכל בתי העסק בבקשה הזו נראים כ"לא נענו" בלי שום רמז שהבעיה
    //    הייתה גודל האצווה ולא איכות התשובה. עדיף לזרוק בקול.
    if (response.stop_reason === "max_tokens") {
      throw new Error(
        `Claude חתך את התשובה (stop_reason=max_tokens) על אצווה של ${merchants.length} בתי עסק. ` +
          `פצל לאצוות קטנות יותר, או הגדל את MAX_TOKENS ב-lib/classify/ai/claude.ts.`
      );
    }

    const text = response.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("");

    const parsed = parseVerdicts(text, new Set(allowedSlugs));

    // << parseVerdicts כבר סלחני כלפי צורה שגויה בתוך שורה שכן הגיעה.
    //    זה כאן מטפל במקרה האחר: בית עסק שלא קיבל שורת תשובה בכלל
    //    (המודל דילג עליו). "לא נענה" נשאר גלוי במקום שהבית עסק פשוט
    //    ייעלם משקט מהתוצאה — אותה מדיניות בדיוק כמו null אצל classify()
    //    ב-lib/classify/engine.ts: "לא הכרענו" חייב להישאר גלוי.
    const bySrc = new Map(parsed.map((v) => [v.merchant, v]));
    return merchants.map(
      (m) => bySrc.get(m) ?? { merchant: m, slug: null, confidence: 0, reason: "לא נענה" }
    );
  }
}
