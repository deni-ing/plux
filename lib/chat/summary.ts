/**
 * סיכום חודשי אוטומטי בשפה טבעית. משימה 7.5.
 *
 * ─── דוח מוכן-מראש, לא דחיפה ───
 *
 * לא cron, לא מייל, לא התראה. הסיכום נוצר לפי דרישה — בפעם הראשונה
 * שמישהו פותח את /dashboard לחודש נתון — ונשמר. הפתיחה הבאה לאותו
 * חודש קוראת שורה מהמסד ולא נוגעת ב-Claude בכלל. זו בדיוק הבחירה
 * שאושרה מול המשתמש (7.5): "דוח מוכן-מראש באפליקציה", לא סיכום יזום.
 *
 * ─── למה WithUser ולא Db ───
 *
 * אותו לקח בדיוק שכבר תועד ב-lib/chat/client.ts (הערה 3 שם): הפונקציה
 * הזו קוראת מהמסד, ואז ממתינה לרשת ל-Claude, ואז כותבת למסד — ואם כל
 * זה יקרה בתוך טרנזקציה אינטראקטיבית אחת, Prisma יסגור אותה אחרי 5
 * שניות בזמן שהיא עדיין ממתינה לתשובה. לכן שתי קריאות קצרות ל-`withUser`
 * (קריאה, אחר-כך כתיבה) עם קריאת הרשת בֵּיניהן, לא טרנזקציה אחת שמחזיקה
 * הכול.
 *
 * ─── למה בלי כלים (tools) ───
 *
 * ‏runChat/streamChat נותנים למודל לבקש נתונים בעצמו כי שיחה חופשית לא
 * יודעת מראש על מה תישאל. כאן כבר יודעים בדיוק: `AiFacts` לחודש אחד,
 * שהקורא (ה-route) כבר טען מ-`factsFor`. אין שאלה לענות עליה חוץ
 * מ"תנסח את זה" — ולכן אין תפקיד לכלים, וקריאה אחת ל-Claude מספיקה.
 */

import Anthropic from "@anthropic-ai/sdk";

import type { Db } from "../db/client";
import type { Period } from "../analytics/period";
import type { SnapshotFacts } from "../analytics/snapshot";
import { CHAT_MODEL, type ChatClient, type WithUser } from "./client";
import { factsForAi } from "./present";

const MAX_TOKENS = 350;

const SUMMARY_SYSTEM = `את/ה כותב/ת סיכום חודשי קצר לאפליקציית Plux, אפליקציית ניהול תקציב אישי בעברית.

תקבל/י JSON עם עובדות מחושבות על חודש אחד: הוצאות, הכנסות, פילוח לפי
קטגוריה, השוואה לחודש הקודם, חיובים חוזרים, עמלות ותחזית. כל הסכומים
כבר בשקלים.

כתוב/כתבי 2–4 משפטים בעברית, בגוף שני פונה (״הוצאת״, ״הכנסת״), בטון
ידידותי ולא שיפוטי. התמקד/י במה שהכי משמעותי: הסכום הכולל, השינוי
הבולט ביותר מול החודש הקודם (אם יש), וקטגוריה אחת או שתיים שבלטו.
אם period.partial הוא true, ציין/י במשפט אחד שהנתונים חלקיים ושהסיכום
עוד עשוי להשתנות — אל תציג/י אותם כמספר סופי.

אל תמציא/י מספרים שלא קיימים ב-JSON. אל תחזור/י על כל השדות — רק את
מה שחשוב לספר. בלי כותרת, בלי בולטים, טקסט רציף בלבד.`;

function defaultClient(): ChatClient {
  return new Anthropic() as unknown as ChatClient;
}

const FALLBACK_TEXT = "אין עדיין מספיק נתונים כדי לכתוב סיכום לחודש הזה.";

function extractText(response: { content: { type: string; text?: string }[] }): string {
  return response.content
    .filter((b): b is { type: "text"; text: string } => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * מחזיר סיכום קיים מהמסד, או יוצר אחד חדש ושומר אותו.
 *
 * `facts` מגיע מהקורא (בדיוק כמו ב-runTool.getMonthlyReport) — הפונקציה
 * הזו לא טוענת נתונים בעצמה, רק מנסחת אותם.
 */
export async function getMonthlySummary(
  withUser: WithUser,
  userId: string,
  period: Period,
  facts: SnapshotFacts,
  opts: { client?: ChatClient } = {}
): Promise<string> {
  const where = {
    userId_periodStart_periodEnd: {
      userId,
      periodStart: period.from,
      periodEnd: period.to,
    },
  };

  const cached = await withUser((db: Db) =>
    db.monthlySummary.findUnique({ where, select: { summary: true } })
  );
  if (cached) return cached.summary;

  const client = opts.client ?? defaultClient();
  const response = await client.messages.create({
    model: CHAT_MODEL,
    max_tokens: MAX_TOKENS,
    system: SUMMARY_SYSTEM,
    tools: [],
    messages: [{ role: "user", content: JSON.stringify(factsForAi(facts)) }],
  });

  const text = extractText(response) || FALLBACK_TEXT;

  await withUser((db: Db) =>
    db.monthlySummary.upsert({
      where,
      create: { userId, periodStart: period.from, periodEnd: period.to, summary: text },
      update: { summary: text },
    })
  );

  return text;
}
