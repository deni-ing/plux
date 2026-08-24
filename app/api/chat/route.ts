/**
 * POST /api/chat. סעיף 7.2.
 *
 * לא סטרימינג עדיין — זה 7.3. ה-route הזה מחזיר JSON אחד עם התשובה
 * הסופית, אחרי שהלולאה ב-`runChat` סיימה את כל סיבובי הכלים. **לבנות
 * את הלולאה נכון קודם, ולחבר סטרימינג עליה אחר כך, זה עדיף על שניהם
 * ביחד** — בדיוק כמו שהמנוע (5) נבנה ונבדק לפני הדשבורד (6) שמציג אותו.
 *
 * ‏`turns` (יומן הכלים) נשאר בשרת ולא חוזר ללקוח: זה מידע לדיבוג, לא
 * למסך — אותה הבחנה שקיימת ב-`AiReport` של הסיווג.
 */

import { NextResponse } from "next/server";

import { currentUserId, withCurrentUser } from "../../../lib/db/session";
import { runChat, type ChatMessage } from "../../../lib/chat/client";

export const dynamic = "force-dynamic";

/** תקרות סבירות למניעת ניצול — לא קשורות ללוגיקת השיחה עצמה. */
const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 4000;

function isValidHistory(v: unknown): v is ChatMessage[] {
  return (
    Array.isArray(v) &&
    v.every(
      (m) =>
        m &&
        typeof m === "object" &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.length > 0 &&
        m.content.length <= MAX_MESSAGE_CHARS
    )
  );
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "לא מחובר." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "גוף הבקשה אינו JSON תקין." }, { status: 400 });
  }

  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!isValidHistory(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "messages חייב להיות מערך לא ריק של {role, content}." },
      { status: 400 }
    );
  }
  if (messages.length > MAX_MESSAGES) {
    return NextResponse.json({ error: "השיחה ארוכה מדי. פתח שיחה חדשה." }, { status: 400 });
  }

  try {
    const result = await withCurrentUser((db) => runChat(db, userId, messages));
    return NextResponse.json({ reply: result.reply });
  } catch (err) {
    // << לא חושף את השגיאה הגולמית ללקוח — יכולה להכיל פרטי SDK/מסד.
    //    אותה מדיניות כמו syncCurrentUser ב-3.13: 503 עם הודעה שאומרת
    //    במפורש שהתשובה לא התקבלה, לא מסך שמתנהג כאילו הכול תקין.
    console.error("POST /api/chat failed", err);
    return NextResponse.json({ error: "השירות לא זמין כרגע. נסה שוב בעוד רגע." }, { status: 502 });
  }
}
