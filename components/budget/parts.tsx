/**
 * רכיבי מסך התקציב.
 *
 * << status (under/near/over) כבר הוכרע ב-lib/budget/engine.ts — הרכיב
 *    רק ממפה אותו לצבע. אותו כלל כמו savings/parts.tsx ו-dashboard.
 *
 * << עדכון עיצובי: תג אייקון של הקטגוריה (צבע+צורה אמיתיים, לא ניחוש) —
 *    אותו מקור אמת שכבר משמש את TopCategoryTiles בדשבורד
 *    (categorySlot/categoryIcon/topLevelSlug, דרך categoryColorVar),
 *    כדי שאותה קטגוריה תיראה זהה בכל מסך באפליקציה.
 *
 * הכול Server Components וטפסים. אין `use client` בקובץ הזה.
 */

import { CATEGORY_TREE } from "../../lib/categories/tree";
import { formatILS } from "../../lib/analytics/money";
import { categoryColorVar, categoryIcon, topLevelSlug } from "../../lib/categories/palette";
import { CategoryIcon } from "../categories/icon";
import type { BudgetLine } from "../../lib/budget/store";
import type { BudgetStatus } from "../../lib/budget/engine";
import { deleteBudgetAction, setBudgetAction } from "../../app/budget/actions";

const money = (a: number) => formatILS(a);

const STATUS_BAR_CLASS: Record<BudgetStatus, string> = {
  under: "bg-ink-2/50",
  near: "bg-warn",
  over: "bg-critical",
};

const STATUS_LABEL: Record<BudgetStatus, string> = {
  under: "בתוך התקציב",
  near: "מתקרב לתקרה",
  over: "חרג מהתקרה",
};

const STATUS_CLASS: Record<BudgetStatus, string> = {
  under: "text-muted",
  near: "text-warn",
  over: "text-critical",
};

function ProgressBar({ pct, status }: { pct: number; status: BudgetStatus }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-wash">
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
  const topSlug = topLevelSlug(budget.categorySlug);

  return (
    <section className="mt-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base text-white"
          style={{ backgroundColor: categoryColorVar(topSlug) }}
        >
          <CategoryIcon icon={categoryIcon(topSlug)} />
        </span>
        <div className="flex flex-1 items-baseline justify-between gap-3">
          <h2 className="font-medium">{budget.categoryName}</h2>
          <span className={`text-xs ${STATUS_CLASS[status]}`}>{pct}%</span>
        </div>
      </div>

      <div className="ms-[42px]">
        <p className="mt-2 tabular-nums text-sm text-ink">
          {money(budget.spent)} <span className="text-muted">מתוך</span> {money(budget.monthlyCap)}
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
              className="w-32 rounded-lg border border-border bg-transparent px-2 py-1 text-xs text-ink"
            />
            <button
              type="submit"
              className="rounded-lg border border-border px-3 py-1 text-xs text-ink-2 hover:bg-wash"
            >
              עדכן תקרה
            </button>
          </form>

          <form action={deleteBudgetAction}>
            <input type="hidden" name="budgetId" value={budget.id} />
            <button
              type="submit"
              className="rounded-lg px-2 py-1 text-xs text-muted hover:text-critical"
            >
              מחק תקציב
            </button>
          </form>
        </div>
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
      <label className="flex flex-col gap-1 text-xs text-muted">
        קטגוריה
        <select
          name="slug"
          required
          defaultValue=""
          className="w-40 rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-ink"
        >
          {/* << text-[#12181a] מפורש על כל option — אותה תקלה ואותו תיקון
              כמו ב-CategoryPicker (components/transactions/parts.tsx):
              בלי זה הטקסט יורש --ink ונראה כמעט בלתי-קריא בתפריט הנפתח
              הילידי של הדפדפן, שנפתח על רקע בהיר בלי קשר לערכת הנושא. */}
          <option value="" disabled className="text-[#12181a]">
            בחר קטגוריה
          </option>
          {CATEGORY_TREE.filter((group) => group.kind === "EXPENSE").flatMap((group) =>
            group.categories.flatMap((cat) => [
              <option key={cat.slug} value={cat.slug} className="text-[#12181a]">
                {cat.name}
              </option>,
              ...(cat.children ?? []).map((ch) => (
                <option key={ch.slug} value={ch.slug} className="text-[#12181a]">
                  {"  "}
                  {ch.name}
                </option>
              )),
            ])
          )}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        תקרה חודשית
        <input
          type="number"
          name="monthlyCap"
          step="0.01"
          min="0.01"
          required
          className="w-32 rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-ink"
        />
      </label>
      <button
        type="submit"
        className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-strong"
      >
        שמור תקציב
      </button>
    </form>
  );
}
