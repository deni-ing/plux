/**
 * תקציב חודשי משורת הפקודה.
 *
 *   npx tsx scripts\budget-check.mts --user <id>
 *
 * << כמו savings-check.mts: קודם למסך, ונשאר שימושי אחרי שהמסך קיים.
 *    אין כאן חישוב — רק טעינת facts (אותה פונקציה שהדשבורד קורא לה),
 *    קריאה למנוע, והדפסה.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";
import { formatILS } from "../lib/analytics/money";
import { factsFor, latestPeriod, parseMonthKey } from "../lib/analytics/facts";
import { listBudgets } from "../lib/budget/store";
import { budgetPct, budgetStatus } from "../lib/budget/engine";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m", D = "\x1b[2m", O = "\x1b[0m";
const money = (a: number) => formatILS(a);

const args = process.argv.slice(2);
const val = (flag: string) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const userId = val("--user");
if (!userId || userId.startsWith("--")) {
  console.error("חסר --user <clerk-user-id>");
  process.exit(1);
}

const monthArg = val("--month");

const { budgets, periodLabel } = await withUser(userId, async (db) => {
  const period = monthArg ? parseMonthKey(monthArg) : await latestPeriod(db, userId);
  if (!period) return { budgets: await listBudgets(db, userId, null), periodLabel: null };

  const result = await factsFor(db, userId, period);
  const budgets = await listBudgets(db, userId, result?.facts ?? null);
  return { budgets, periodLabel: period.label };
});

console.log(`\n${B}תקציב חודשי${O}  ${D}(${budgets.length})${O}`);
console.log(periodLabel ? `${D}תקופה: ${periodLabel}${O}` : `${D}אין עדיין נתונים${O}`);

if (budgets.length === 0) {
  console.log(`${D}אין תקציבים.${O}\n`);
} else {
  console.log("─".repeat(60));
  for (const b of budgets) {
    const status = budgetStatus(b.spent, b.monthlyCap);
    const pct = budgetPct(b.spent, b.monthlyCap);
    const tone = status === "over" ? R : status === "near" ? Y : G;

    console.log(`${B}${b.categoryName}${O}`);
    console.log(`  ${money(b.spent)} / ${money(b.monthlyCap)}  ${tone}(${pct}%, ${status})${O}`);
    console.log("─".repeat(60));
  }
  console.log();
}

await prisma.$disconnect();
process.exit(0);
