/**
 * רכיבי מסך התקציב.
 *
 * << status (under/near/over) כבר הוכרע ב-lib/budget/engine.ts — הרכיב
 *    רק ממפה אותו לצבע. אותו כלל כמו savings/parts.tsx ו-dashboard.
 *
 * הכול Server Components וטפסים. אין `use client` בקובץ הזה.
 */

import { CATEGORY_TREE } from "../../lib/categories/tree";
import { formatILS } from "../../lib/analytics/money";
import type { BudgetLine } from "../../lib/budget/store";
import type { BudgetStatus } from "../../lib/budget/engine";
import { deleteBudgetAction, setBudgetAction } from "../../app/budget/actions";

const money = (a: number) => formatILS(a);

const STATUS_BAR_CLASS: Record<BudgetStatus, string> = {
  under: "bg-black/30 dark:bg-white/40",
  near: "bg-amber-500/70",
  over: "bg-red-500/70",
};

const STATUS_LABEL: Record<BudgetStatus, string> = {
  under: "בתוך התקציב",
  near: "מתקרב לתקרה",
  over: "חרג מהתקרה",
};

const STATUS_CLASS: Record<BudgetStatus, string> = {
  under: "opacity-60",
  near: "text-amber-600 dark:text-amber-400",
  over: "text-red-600 dark:text-red-400",
};

function ProgressBar({ pct, status }: { pct: number; status: BudgetStatus }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
      <div className={`h-1.5 rounded-full ${STATUS_BAR_CLASS[status]}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export function BudgetRow({
  budget,
  status,
  pct,
}: {
  budget: BudgetLine;
  status: BudgetStatus;
  pct: number;
}) {
  return (
    <section className="mt-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">{budget.categoryName}</h2>
        <span className={`text-xs ${STATUS_CLASS[status]}`}>{pct}%</span>
      </div>

      <p className="mt-2 tabular-nums text-sm">
        {money(budget.spent)} <span className="opacity-50">מתוך</span> {money(budget.monthlyCap)}
      </p>
      <ProgressBar pct={pct} status={status} />
      <p className={`mt-1 text-xs ${STATUS_CLASS[status]}`}>{STATUS_LABEL[status]}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={setBudgetAction} className="flex items-center gap-2">
          <input type="hidden" name="slug" value={budget.categorySlug} />
          <input
            type="number"
            name="monthlyCap"
            step="0.01"
            min="0.01"
            placeholder="תקרה חדשה"
            required
            className="w-32 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20"
          />
          <button
            type="submit"
            className="rounded-lg border border-black/20 px-3 py-1 text-xs hover:bg-black/[0.04] dark:border-white/20 dark:hover:bg-white/[0.06]"
          >
            עדכן תקרה
          </button>
        </form>

        <form action={deleteBudgetAction}>
          <input type="hidden" name="budgetId" value={budget.id} />
          <button
            type="submit"
            className="rounded-lg px-2 py-1 text-xs opacity-50 hover:text-red-600 hover:opacity-100"
          >
            מחק תקציב
          </button>
        </form>
      </div>
    </section>
  );
}

/**
 * רק קטגוריות EXPENSE — תקציב לא מוגדר על הכנסה או העברה. אותה
 * שכבתיות כמו CategoryPicker ב-transactions/parts.tsx, בלי optgroup
 * כי יש כאן קבוצה אחת בלבד.
 */
export function NewBudgetForm() {
  return (
    <form action={setBudgetAction} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs opacity-70">
        קטגוריה
        <select
          name="slug"
          required
          defaultValue=""
          className="w-40 rounded-lg border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        >
          <option value="" disabled>
            בחר קטגוריה
          </option>
          {CATEGORY_TREE.filter((group) => group.kind === "EXPENSE").flatMap((group) =>
            group.categories.flatMap((cat) => [
              <option key={cat.slug} value={cat.slug}>
                {cat.name}
              </option>,
              ...(cat.children ?? []).map((ch) => (
                <option key={ch.slug} value={ch.slug}>
                  {"  "}
                  {ch.name}
                </option>
              )),
            ])
          )}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs opacity-70">
        תקרה חודשית
        <input
          type="number"
          name="monthlyCap"
          step="0.01"
          min="0.01"
          required
          className="w-32 rounded-lg border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        />
      </label>
      <button
        type="submit"
        className="rounded-lg border border-black/20 px-3 py-1.5 text-sm hover:bg-black/[0.04] dark:border-white/20 dark:hover:bg-white/[0.06]"
      >
        שמור תקציב
      </button>
    </form>
  );
}
