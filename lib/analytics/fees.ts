/**
 * עמלות. סעיף 5.5.
 *
 * ─── למה זה סעיף נפרד ולא עוד קטגוריה ───
 *
 * עמלה שונה מכל הוצאה אחרת בשלושה דברים:
 *
 * **היא קטנה מכדי להיראות.** ‎₪17.90 בדוח של ‎₪8,000 הם 0.2% — שורה
 * שהעין מדלגת עליה. אבל היא חוזרת כל חודש, וכשמכפילים ב-12 מדובר
 * ב-‎₪214.80 בשנה שאפשר לבטל בשיחת טלפון אחת. **הפער בין "0.2% מהחודש"
 * ל-"‎₪215 בשנה" הוא כל ההבדל בין נתון לבין החלטה.**
 *
 * **היא לא נבחרה.** אף אחד לא החליט לקנות "עמל.ערוץ יש 11". היא נגבתה.
 * הוצאה שלא נבחרה היא המקום היחיד בדוח שבו כמעט תמיד יש מה לעשות.
 *
 * **היא מזוהה ודאית ולא בהסתברות.** `TxnKind.FEE` הוא עובדה מבנית מדף
 * החשבון, לא ניחוש של מסווג. לכן הדוח הזה יכול לומר מספר ולא הערכה.
 *
 * ─── מה כאן טהור ומה לא ───
 *
 * הכול. אין כאן מסד ואין שעון. גם `annualized` אינו מסתכל על התאריך
 * של היום — הוא מכפיל ממוצע חודשי ב-12, וזה חישוב ולא תחזית.
 */

import { type Agorot, share as pct } from "./money";
import { effectiveDate, inPeriod, type Basis, type Period, DEFAULT_BASIS } from "./period";
import type { AnalyticsTxn, Breakdown } from "./spend";

/**
 * הקטגוריות שנחשבות עמלה.
 *
 * `financial.taxes` **אינו** ברשימה: אגרת רישוי היא הוצאה שנגבית מבחוץ
 * אבל אין מה לעשות בה, ולערבב אותה עם עמלות בנק יהפוך את הדוח
 * מ-"הנה מה שאפשר לבטל" ל-"הנה עוד סכום". דוח שאי אפשר לפעול לפיו
 * הוא עוד מספר על המסך.
 */
export const FEE_SLUGS = [
  "financial.bank_fees",
  "financial.card_fees",
  "financial.interest",
] as const;

const FEE_SLUG_SET: ReadonlySet<string> = new Set(FEE_SLUGS);

/**
 * שני מקורות זיהוי, ובכוונה.
 *
 * ‏`kind === "FEE"` מגיע מהפרסר: לאומי מסמנת עמלה בדף החשבון. הקטגוריה
 * מגיעה מהמסווג. שניהם יכולים להחמיץ — הפרסר אם הפורמט השתנה, המסווג
 * אם שם העמלה חדש — ולכן `או` ולא `וגם`.
 */
export function isFee(t: AnalyticsTxn): boolean {
  if (t.kind === "FEE") return true;
  return t.categorySlug !== null && FEE_SLUG_SET.has(t.categorySlug);
}

export type FeeLine = {
  merchant: string;
  slug: string | null;
  /** חיובי. סך מה ששולם. */
  total: Agorot;
  count: number;
  /** מפתחות החודשים שבהם הופיעה, ממוינים. */
  months: string[];
  /** הסכומים השונים שנצפו. יותר מאחד = עמלה משתנה. */
  amounts: Agorot[];
};

export type FeeReport = {
  period: Period;
  basis: Basis;
  total: Agorot;
  count: number;
  /** אחוז מסך ההוצאה בתקופה. 0 אם לא סופק פילוח. */
  shareOfExpense: number;
  byMerchant: FeeLine[];
};

export type FeeOptions = {
  basis?: Basis;
  /** אם סופק, מחושב גם `shareOfExpense`. */
  breakdown?: Breakdown;
};

function collect(
  txns: readonly AnalyticsTxn[],
  keep: (t: AnalyticsTxn) => boolean,
  basis: Basis
): { lines: FeeLine[]; total: Agorot; count: number } {
  const byMerchant = new Map<string, FeeLine>();
  let total = 0;
  let count = 0;

  for (const t of txns) {
    if (!isFee(t) || !keep(t)) continue;

    // עמלה היא כסף שיוצא. סכום חיובי בקטגוריית עמלה הוא החזר עמלה —
    // קורה, ומקזז. לכן -amount ולא Math.abs.
    const value = -t.amount;
    total += value;
    count += 1;

    const key = t.merchant;
    const monthKey = effectiveDate(t, basis).toISOString().slice(0, 7);

    const line = byMerchant.get(key);
    if (line) {
      line.total += value;
      line.count += 1;
      if (!line.months.includes(monthKey)) line.months.push(monthKey);
      if (!line.amounts.includes(value)) line.amounts.push(value);
    } else {
      byMerchant.set(key, {
        merchant: key,
        slug: t.categorySlug,
        total: value,
        count: 1,
        months: [monthKey],
        amounts: [value],
      });
    }
  }

  const lines = [...byMerchant.values()].sort((a, b) => b.total - a.total);
  for (const l of lines) {
    l.months.sort();
    l.amounts.sort((a, b) => a - b);
  }
  return { lines, total, count };
}

/** כל העמלות בתקופה אחת. */
export function feeReport(
  txns: readonly AnalyticsTxn[],
  period: Period,
  options: FeeOptions = {}
): FeeReport {
  const basis = options.basis ?? DEFAULT_BASIS;
  const { lines, total, count } = collect(
    txns,
    (t) => inPeriod(effectiveDate(t, basis), period),
    basis
  );

  return {
    period,
    basis,
    total,
    count,
    shareOfExpense: options.breakdown ? pct(total, options.breakdown.expense) : 0,
    byMerchant: lines,
  };
}

export type RecurringFee = FeeLine & {
  /** בכמה מהחודשים שנסרקו היא הופיעה. */
  monthsSeen: number;
  monthsScanned: number;
  /** ממוצע לחודש שבו הופיעה. */
  monthlyAvg: Agorot;
  /** ‏monthlyAvg × 12. חישוב, לא תחזית. */
  annualized: Agorot;
  /** אותו סכום בכל פעם. עמלה קבועה קלה יותר לזיהוי ולביטול. */
  fixedAmount: boolean;
};

export type RecurringFeesResult = {
  months: string[];
  fees: RecurringFee[];
  /** סך העמלות בכל החלון. */
  total: Agorot;
  /** סך ההשלכה השנתית של החוזרות בלבד. */
  annualizedTotal: Agorot;
};

/**
 * עמלות שחוזרות לאורך כמה חודשים.
 *
 * `minMonths = 2` ולא 3: עמלה שנגבתה פעמיים ברצף היא כבר דפוס, ובחלון
 * של חמישה חודשי נתונים דרישה של שלושה מפספסת כל עמלה שהתחילה
 * באמצע. הסף חשוף כפרמטר במקום להיות קבוע בקוד, כי הוא **החלטה ולא
 * עובדה** — והוא ישתנה כשיהיו שנתיים של נתונים.
 */
export function recurringFees(
  txns: readonly AnalyticsTxn[],
  months: readonly Period[],
  options: FeeOptions & { minMonths?: number } = {}
): RecurringFeesResult {
  const basis = options.basis ?? DEFAULT_BASIS;
  const minMonths = options.minMonths ?? 2;

  if (months.length === 0) {
    return { months: [], fees: [], total: 0, annualizedTotal: 0 };
  }

  const from = months[0].from.getTime();
  const to = months[months.length - 1].to.getTime();

  const { lines, total } = collect(
    txns,
    (t) => {
      const d = effectiveDate(t, basis).getTime();
      return d >= from && d < to;
    },
    basis
  );

  const fees: RecurringFee[] = lines
    .filter((l) => l.months.length >= minMonths)
    .map((l) => {
      const monthlyAvg = Math.round(l.total / l.months.length);
      return {
        ...l,
        monthsSeen: l.months.length,
        monthsScanned: months.length,
        monthlyAvg,
        annualized: monthlyAvg * 12,
        fixedAmount: l.amounts.length === 1,
      };
    })
    .sort((a, b) => b.annualized - a.annualized);

  return {
    months: months.map((m) => m.key),
    fees,
    total,
    annualizedTotal: fees.reduce((s, f) => s + f.annualized, 0),
  };
}
