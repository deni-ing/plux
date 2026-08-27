/**
 * GET /api/summary?month=YYYY-MM. משימה 7.5.
 *
 * לא מזרים (לא כמו /api/chat) — התשובה קצרה, וקל יותר ללקוח לצרוך
 * JSON אחד מ-`fetch` רגיל. אותה סיבה שהוזכרה שם לגבי `withUser`:
 * `currentUserId()` רץ פעם אחת למעלה, ואז `withUser` (בלי Clerk מחדש)
 * פותח טרנזקציה קצרה נפרדת לכל קריאת מסד — לא אחת שמחזיקה גם את
 * ההמתנה לרשת ל-Claude.
 */

import { currentUserId } from "../../../lib/db/session";
import { withUser } from "../../../lib/db/client";
import { factsFor, latestPeriod, parseMonthKey } from "../../../lib/analytics/facts";
import { getMonthlySummary } from "../../../lib/chat/summary";
import type { WithUser } from "../../../lib/chat/client";

export const dynamic = "force-dynamic";

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function GET(req: Request) {
  const userId = await currentUserId();
  if (!userId) return jsonError("לא מחובר.", 401);

  const month = new URL(req.url).searchParams.get("month") ?? undefined;
  const boundWithUser: WithUser = (fn) => withUser(userId, fn);

  const period = parseMonthKey(month) ?? (await boundWithUser((db) => latestPeriod(db, userId)));
  if (!period) return jsonError("אין עדיין נתונים.", 404);

  const result = await boundWithUser((db) => factsFor(db, userId, period));
  if (!result) return jsonError(`אין נתונים לחודש ${period.key}.`, 404);

  try {
    const summary = await getMonthlySummary(boundWithUser, userId, period, result.facts);
    return new Response(JSON.stringify({ summary, month: period.key }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (err) {
    console.error("GET /api/summary failed", err);
    return jsonError("השירות לא זמין כרגע. נסה שוב בעוד רגע.", 502);
  }
}
