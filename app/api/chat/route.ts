/**
 * POST /api/chat. סעיפים 7.2+7.3.
 *
 * מזרים טקסט לגוף התשובה ברגע שהוא נוצר — לא JSON אחד בסוף. הבדיקות
 * לפני הזרם (התחברות, צורת ה-body) עדיין מחזירות סטטוס ו-JSON רגילים,
 * כי אחרי שהזרם נפתח אי אפשר יותר לשנות קוד סטטוס או כותרות. **שגיאה
 * שיודעים עליה מראש נבדקת לפני שפותחים את הזרם; שגיאה שקורית באמצע
 * נכתבת לתוך הזרם עצמו**, כי זה כל מה שנשאר פתוח באותו שלב.
 *
 * ‏`turns` (יומן הכלים) נשאר בשרת ולא חוזר ללקוח: מידע לדיבוג, לא למסך —
 * אותה הבחנה שקיימת ב-`AiReport` של הסיווג.
 *
 * ‏`streamChat` מקבל `withUser` (פותח-טרנזקציה), לא `withCurrentUser`
 * שכבר רץ פעם אחת למעלה — כי `withCurrentUser` פותח טרנזקציה אחת
 * ומריץ הכול בתוכה, וזו בדיוק הטעות שתוקנה: השיחה עם Claude ממתינה
 * לרשת ולפעמים לוקחת יותר מ-5 שניות (תקרת הטרנזקציה האינטראקטיבית של
 * Prisma), אז `withUser` נקרא מחדש בתוך `client.ts`, פעם קצרה לכל קריאת
 * כלי — לא פעם אחת לכל השיחה. ה-userId כבר מאומת למעלה, אז `withUser`
 * (בלי Clerk מחדש) מספיק ונכון יותר.
 */

import { currentUserId } from "../../../lib/db/session";
import { withUser } from "../../../lib/db/client";
import { streamChat, type ChatMessage, type WithUser } from "../../../lib/chat/client";

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

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function POST(req: Request) {
  const userId = await currentUserId();
  if (!userId) return jsonError("לא מחובר.", 401);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("גוף הבקשה אינו JSON תקין.", 400);
  }

  const messages = (body as { messages?: unknown } | null)?.messages;
  if (!isValidHistory(messages) || messages.length === 0) {
    return jsonError("messages חייב להיות מערך לא ריק של {role, content}.", 400);
  }
  if (messages.length > MAX_MESSAGES) {
    return jsonError("השיחה ארוכה מדי. פתח שיחה חדשה.", 400);
  }

  const encoder = new TextEncoder();

  // << הכול בתוך start(), עם controller כפרמטר ולא כמשתנה חיצוני
  //    שנתפס בסגירה. גרסה קודמת עם `let controller = null` שהוקצה
  //    בתוך start() ונקרא מחוץ לו נכשלה ב-build האמיתי: TypeScript
  //    מצר את הטיפוס שלו ל-never כשההקצאה וההשימוש בשתי סגירות שונות.
  //    tsx לא תפס את זה (הוא לא בודק טיפוסים) — רק tsc/npm run build.
  const body_ = new ReadableStream<Uint8Array>({
    start(controller) {
      // << לא ממתינים ל-Promise הזה — הוא כותב לתוך ה-stream תוך כדי
      //    ריצה, וסוגר אותו כשמסתיים. ה-route מחזיר תשובה ברגע שהזרם
      //    נפתח, לא ברגע שיש טקסט סופי.
      const boundWithUser: WithUser = (fn) => withUser(userId, fn);

      (async () => {
        try {
          await streamChat(boundWithUser, userId, messages, (delta) => {
            controller.enqueue(encoder.encode(delta));
          });
        } catch (err) {
          // << אותה מדיניות כמו syncCurrentUser ב-3.13: לא חושפים שגיאת
          //    SDK/מסד גולמית, אבל כן אומרים במפורש שמשהו נכשל — לא
          //    נעלמים באמצע משפט בלי הסבר.
          console.error("POST /api/chat failed", err);
          controller.enqueue(encoder.encode("\n\n[השירות לא זמין כרגע. נסה שוב בעוד רגע.]"));
        } finally {
          controller.close();
        }
      })();
    },
  });

  return new Response(body_, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
