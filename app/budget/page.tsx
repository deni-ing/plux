/**
 * מסך התקציב החודשי.
 *
 * << טוען facts מאותה פונקציה בדיוק שהדשבורד משתמש בה (factsFor) —
 *    לא מסכם קטגוריות בעצמו. "מה שהוכח לא צריך להיכתב שוב", כמו
 *    שכתוב ב-app/dashboard/page.tsx.
 *
 * Server Component בלבד.
 */

import { redirect } from "next/navigation";

import { currentUserId, withCurrentUser } from "../../lib/db/session";
import { factsFor, latestPeriod, parseMonthKey } from "../../lib/analytics/facts";
import { listBudgets } from "../../lib/budget/store";
import { budgetPct, budgetStatus } from "../../lib/budget/engine";
import { BudgetRow, NewBudgetForm } from "../../components/budget/parts";
import { Nav } from "../../components/nav";

export const dynamic = "force-dynamic";

export default async function BudgetPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/sign-in");

  const { month } = await searchParams;

  const { budgets, periodLabel } = await withCurrentUser(async (db) => {
    const period = parseMonthKey(month) ?? (await latestPeriod(db, userId));
    if (!period) return { budgets: await listBudgets(db, userId, null), periodLabel: null };

    const result = await factsFor(db, userId, period);
    const budgets = await listBudgets(db, userId, result?.facts ?? null);
    return { budgets, periodLabel: period.label };
  });

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Nav current="/budget" />
      <h1 className="text-2xl font-semibold">תקציב חודשי</h1>
      {periodLabel ? <p className="mt-2 text-sm opacity-70">{periodLabel}</p> : null}

      {budgets.length === 0 ? (
        <p className="mt-4 text-sm opacity-70">אין עדיין תקציבים.</p>
      ) : (
        budgets.map((b) => (
          <BudgetRow
            key={b.id}
            budget={b}
            status={budgetStatus(b.spent, b.monthlyCap)}
            pct={budgetPct(b.spent, b.monthlyCap)}
          />
        ))
      )}

      <section className="mt-6 rounded-xl border border-border p-4">
        <h2 className="font-medium">תקציב חדש</h2>
        <NewBudgetForm />
      </section>
    </main>
  );
}
