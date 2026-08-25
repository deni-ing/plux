/**
 * שכבת המסד להמלצות. הקובץ היחיד כאן שיודע על Prisma — כמו
 * lib/budget/store.ts ו-lib/accounts/store.ts.
 */

import type { Db } from "../db/client";
import { availableMonths, factsFor, parseMonthKey } from "../analytics/facts";
import { loadRange } from "../analytics/load";
import { flattenSpend } from "../budget/store";
import { toAgorot, type Agorot } from "../analytics/money";
import { bankBalance } from "../accounts/store";
import { avgMonthlyExpense } from "../savings/store";
import {
  buildRecommendations,
  budgetOverStreak,
  detectSavingsTransfer,
  idleCashWorthChecking,
  type Recommendation,
} from "./engine";

/** דפוס חוזר נראה רק לאורך זמן — יותר מ-3 חודשים, אבל לא כל ההיסטוריה. */
const TRANSFER_LOOKBACK_MONTHS = 6;
/** "חרגת N חודשים ברצף" — כולל את החודש הנוכחי, גם אם הוא partial. */
const BUDGET_STREAK_MONTHS = 3;

export async function loadRecommendations(db: Db, userId: string): Promise<Recommendation[]> {
  const months = await availableMonths(db, userId); // מהחדש לישן
  if (months.length === 0) return [];

  // 1. הוראת קבע לחיסכון.
  const lookback = months
    .slice(0, TRANSFER_LOOKBACK_MONTHS)
    .map(parseMonthKey)
    .filter((p): p is NonNullable<typeof p> => p !== null);
  const txns =
    lookback.length > 0
      ? await loadRange(db, userId, lookback[lookback.length - 1].from, lookback[0].to)
      : [];
  const savingsTransfer = detectSavingsTransfer(txns);

  // 2. חריגת תקציב על שלושת החודשים האחרונים (כולל הנוכחי, גם אם חלקי —
  //    חריגה שכבר קרתה עם ימים שנותרו היא בדיוק מה ששווה לדעת עכשיו).
  const streakKeys = months.slice(0, BUDGET_STREAK_MONTHS);
  const spendByMonth: Map<string, Agorot>[] = [];
  for (const key of [...streakKeys].reverse()) {
    const period = parseMonthKey(key);
    if (!period) continue;
    const result = await factsFor(db, userId, period);
    spendByMonth.push(result ? flattenSpend(result.facts.categories) : new Map());
  }

  const budgetRows = await db.budget.findMany({
    where: { userId },
    include: { category: { select: { slug: true, name: true } } },
  });
  const caps = new Map(
    budgetRows.map((r) => [r.category.slug, { cap: toAgorot(r.monthlyCap), name: r.category.name }])
  );
  const budgetStreaks = budgetOverStreak(spendByMonth, caps);

  // 3. כסף עומד ללא ריבית — יתרת בנק מול הוצאה חודשית טיפוסית.
  const [balance, avgExpense] = await Promise.all([
    bankBalance(db, userId),
    avgMonthlyExpense(db, userId),
  ]);
  const idleCash =
    balance && idleCashWorthChecking(balance.current, avgExpense) && avgExpense !== null
      ? { balance: balance.current, avgMonthlyExpense: avgExpense }
      : null;

  return buildRecommendations({ savingsTransfer, budgetStreaks, idleCash });
}
