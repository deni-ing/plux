/**
 * מנוע היתרה. פונקציות טהורות בלבד — כמו lib/budget/engine.ts.
 *
 * לא כל דבר כאן חדש: `Account.balance`/`balanceAt` כבר נשמרים בכל
 * ייבוא לאומי (lib/import/ingest.ts, latestBalance) — פשוט אף מסך לא
 * הציג אותם עד עכשיו. השכבה הזו לא ממציאה נתון, היא מנסחת נקודות
 * גולמיות (balanceAfter לאורך זמן) לצורה שמסך צריך: יתרה נוכחית, דלתא
 * מול נקודה קודמת, ורצף לגרף קטן.
 */

import type { Agorot } from "../analytics/money";

export type BalancePoint = { at: Date; balance: Agorot };

export type BalanceSummary = {
  current: Agorot;
  asOf: Date;
  /** null כשאין נקודת השוואה ישנה מספיק. */
  deltaVsPrior: Agorot | null;
  /** עד 20 נקודות, ממוינות מהישן לחדש, לגרף קטן. */
  sparkline: BalancePoint[];
};

/**
 * בונה את התקציר מנקודות גולמיות.
 *
 * `points` הוא כל היסטוריית ה-balanceAfter הידועה לחשבון, ממוינת
 * מהישן לחדש — כולל הנקודה העדכנית ביותר. `priorCutoff` הוא הגבול
 * ל"מול החודש שעבר": הנקודה האחרונה *לפני* הגבול הזה היא נקודת
 * ההשוואה. אם אין כזו — אין דלתא, לא מומצא אפס.
 */
export function summarizeBalance(
  current: Agorot,
  asOf: Date,
  points: readonly BalancePoint[],
  priorCutoff: Date
): BalanceSummary {
  let prior: BalancePoint | null = null;
  for (const p of points) {
    if (p.at.getTime() >= priorCutoff.getTime()) break;
    prior = p;
  }

  const spark = points.slice(-20);

  return {
    current,
    asOf,
    deltaVsPrior: prior ? current - prior.balance : null,
    sparkline: spark,
  };
}
