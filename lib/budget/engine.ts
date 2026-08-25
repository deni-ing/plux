/**
 * מנוע התקציב. פונקציות טהורות בלבד — כמו lib/savings/engine.ts.
 * אין כאן Prisma, אין Next.js, ואין שעון: "כמה הוצאת" ו"מה התקרה"
 * מגיעים כארגומנטים, לא נגזרים כאן מהמסד או מהתאריך.
 *
 * << סף 80% ל-"near" אינו שרירותי סתם — הוא נועד לתת התראה *לפני*
 *    שהתקציב נחצה, לא רק לדווח אחרי מעשה. תקציב שמתריע רק ב-100%+
 *    הוא דוח, לא כלי החלטה.
 */

import type { Agorot } from "../analytics/money";

export type BudgetStatus = "under" | "near" | "over";

const NEAR_THRESHOLD = 0.8;

/**
 * הוצאה שלילית (נטו החזרים) מטופלת כ-0, לא כשלילית — תקציב לא "מתחת
 * לאפס", הוא לכל היותר ריק לגמרי. cap<=0 עם הוצאה כלשהי הוא over
 * מיידי: תקרה שלא מוגדרת כראוי לא אמורה להיראות "בטוחה".
 */
export function budgetStatus(spent: Agorot, cap: Agorot): BudgetStatus {
  const s = Math.max(0, spent);
  if (cap <= 0) return s > 0 ? "over" : "under";

  const ratio = s / cap;
  if (ratio < NEAR_THRESHOLD) return "under";
  if (ratio <= 1) return "near";
  return "over";
}

/** אחוז מהתקרה שנוצל. יכול לעבור 100. */
export function budgetPct(spent: Agorot, cap: Agorot): number {
  const s = Math.max(0, spent);
  if (cap <= 0) return s > 0 ? 100 : 0;
  return Math.round((s / cap) * 100);
}
