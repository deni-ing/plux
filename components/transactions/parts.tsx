/**
 * רכיבי מסך התנועות.
 *
 * ─── ההחלטה שדורשת הסבר ───
 *
 * בורר הקטגוריה פועל על **בית העסק**, לא על השורה. סיווג של "סופר
 * פאפא" מחיל את עצמו על כל התנועות של אותו שם — בעבר ובעתיד — ויוצר
 * כלל שיתפוס אותו גם בייבוא הבא.
 *
 * זו ההתנהגות הנכונה: **שאלה נשאלת פעם אחת בחיים.** אבל היא גם מפתיעה,
 * כי המשתמש לוחץ ליד שורה אחת ומשנה שלושים. לכן היקף הפעולה כתוב על
 * הכפתור עצמו — "יסווג 30 תנועות" — ולא בתיעוד.
 *
 * **פעולה שההיקף שלה גדול ממה שנראה חייבת להצהיר עליו במקום שבו
 * לוחצים.** אחרת היא נכונה ומפחידה.
 *
 * הכול Server Components וטפסים. אין `use client` בקובץ הזה.
 */

import { manualCategories } from "../../lib/categories/tree";
import { formatILS } from "../../lib/analytics/money";
import { setCategoryAction } from "../../app/transactions/actions";

const money = (a: number) => formatILS(a);

/**
 * בורר קטגוריה. טופס עם `select` ו-`submit` — בלי JavaScript בכלל.
 * << `onChange` שמגיש אוטומטית היה נוח יותר ודורש `use client`, ובעיקר
 *    היה הופך גלילה בטעות לשינוי נתונים.
 */
export function CategoryPicker({
  merchant,
  current,
  affects,
}: {
  merchant: string;
  current: string | null;
  affects: number;
}) {
  return (
    <form action={setCategoryAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="merchant" value={merchant} />
      {/* << מ-27.08, החלטת משתמש: לא כל העץ — רק 12 היעדים שקטגוריות
          MAX ממופות אליהם (manualCategories, lib/categories/tree.ts).
          כולן מסוג EXPENSE אחת, אז בלי optgroup — קבוצה אחת לא צריכה
          כותרת. גם text-[#12181a] מפורש על כל option: לפני זה הטקסט
          ירש את --ink (בהיר במצב כהה), ובתפריט הנפתח הילידי של
          הדפדפן — שנפתח על רקע בהיר כמעט תמיד, בלי קשר לערכת הנושא
          של האפליקציה — זה נראה כמו טקסט אפור-כמעט-לבן על רקע לבן. */}
      <select
        name="slug"
        defaultValue={current ?? ""}
        className="rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20"
      >
        <option value="" disabled className="text-[#12181a]">
          בחר קטגוריה
        </option>
        {manualCategories().map((cat) => (
          <option key={cat.slug} value={cat.slug} className="text-[#12181a]">
            {cat.name}
          </option>
        ))}
      </select>

      <button
        type="submit"
        className="rounded-lg border border-black/20 px-3 py-1 text-xs hover:bg-black/[0.04] dark:border-white/20 dark:hover:bg-white/[0.06]"
      >
        {affects > 1 ? `שמור · יסווג ${affects} תנועות` : "שמור"}
      </button>
    </form>
  );
}

export function PendingList({
  items,
}: {
  items: { merchant: string; count: number; total: number }[];
}) {
  if (items.length === 0) {
    return (
      <p className="mt-3 text-sm text-emerald-600">
        כל התנועות מסווגות. אין מה להכריע.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-4">
      {items.map((p) => (
        <li key={p.merchant} className="rounded-lg bg-amber-500/[0.06] p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate font-medium">{p.merchant}</span>
            <span className="tabular-nums text-sm">
              {money(p.total)}
              <span className="ms-2 text-xs opacity-50">{p.count} תנועות</span>
            </span>
          </div>
          <CategoryPicker merchant={p.merchant} current={null} affects={p.count} />
        </li>
      ))}
    </ul>
  );
}

export function TxnRow({
  row,
  affects,
}: {
  row: {
    id: string;
    bookedAt: string;
    amount: number;
    merchant: string;
    categorySlug: string | null;
    categoryName: string | null;
    source: string;
    countsAsSpending: boolean;
    account: string;
  };
  affects: number;
}) {
  return (
    <li className="border-t border-black/10 py-3 first:border-t-0 dark:border-white/10">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm">{row.merchant}</span>
        <span className="tabular-nums text-sm">{money(row.amount)}</span>
      </div>

      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-60">
        <span>{row.bookedAt}</span>
        <span>·</span>
        <span>{row.account}</span>
        <span>·</span>
        <span className={row.categorySlug ? "" : "text-amber-600"}>
          {row.categoryName ?? "לא מסווג"}
        </span>
        {row.source === "USER" ? <span className="text-emerald-600">· ידני</span> : null}
        {!row.countsAsSpending ? <span>· לא נספר כהוצאה</span> : null}
      </p>

      <details className="mt-1">
        <summary className="cursor-pointer list-none text-xs opacity-50 hover:opacity-90">
          שינוי סיווג
        </summary>
        <CategoryPicker merchant={row.merchant} current={row.categorySlug} affects={affects} />
      </details>
    </li>
  );
}
