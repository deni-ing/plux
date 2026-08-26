/**
 * הסנפשוט. סעיף 5.7.
 *
 * ─── מה זה ולמה ───
 *
 * `AnalyticsSnapshot` שומר את **תוצאות** המנוע לתקופה — לא את התנועות.
 * שלוש סיבות, ורק אחת מהן היא ביצועים:
 *
 * **1. זה מה שנשלח ל-AI בשלב 7.** המודל לא רואה תנועות גולמיות. הוא
 * רואה עובדות מחושבות: כמה הוצאת, על מה, מה השתנה, מה חוזר. זה גם גבול
 * פרטיות וגם גבול דיוק — **מודל שמקבל 400 שורות ומסכם אותן בעצמו יטעה
 * בחשבון, ומודל שמקבל סכום מחושב לא יכול לטעות בו.** החישוב נעשה בקוד
 * שיש עליו 102 טסטים; מה שנשאר למודל הוא לנסח.
 *
 * **2. תשובה שאפשר לשחזר.** אם המודל אמר "הוצאת ₪3,213 באוגוסט",
 * הסנפשוט שממנו הוא קרא שמור. אפשר לפתוח אותו ולראות בדיוק מה הוא ראה.
 * בלי זה, "למה הוא אמר את זה" היא שאלה בלי תשובה.
 *
 * **3. חישוב חוזר יקר.** להריץ את המנוע צריך לטעון חודשים של תנועות.
 * לצ׳אט שנשאל שלוש שאלות ברצף זה שלוש טעינות של אותו דבר.
 *
 * ─── ומה מסוכן בו ───
 *
 * **סנפשוט הוא מטמון, ולמטמון יש דרך אחת להיות שגוי: להיות ישן.**
 * אם הנוסחה בקוד השתנתה והערך השמור לא — הדוח יציג מספר שאף שורה בקוד
 * כבר לא מייצרת. זה גרוע מלא לשמור בכלל, כי הוא נראה תקין.
 *
 * ההגנה היא `SNAPSHOT_VERSION`. כל שינוי במשמעות של שדה מעלה אותה,
 * וסנפשוט בגרסה ישנה נחשב לא קיים ומחושב מחדש. **מספר גרסה שאף אחד לא
 * מעלה הוא חסר ערך** — ולכן הוא יושב ליד ההגדרה של המבנה, ולא בקובץ
 * הגדרות רחוק.
 */

import type { Agorot } from "./money";
import { isoDay, type Basis, type Period } from "./period";
import type { Breakdown, CategoryLine, Comparison } from "./spend";
import type { FeeReport } from "./fees";
import type { RecurringCharge } from "./recurring";
import type { Forecast } from "./forecast";

/**
 * להעלות בכל שינוי שמשנה **משמעות** של שדה, לא בכל תוספת.
 *
 *   1  — המבנה הראשון. הוצאה חיובית, אגורות, חלון חצי־פתוח.
 *   2  — `period.partial` שינה משמעות: "הנתונים נגמרים בתוך החודש"
 *        במקום "אין תנועה ביום האחרון". שדה זהה, תשובה אחרת — ובדיוק
 *        בשביל זה המספר הזה קיים. בלי ההעלאה, 13 סנפשוטים היו ממשיכים
 *        להחזיר `partial: true` על חודשים שלמים.
 *   3  — נוסף `forecast`. **תוספת שדה חובה היא שינוי משמעות מנקודת
 *        המבט של הקורא**: קוד שקורא `facts.forecast` יקבל undefined
 *        מסנפשוט ישן, והטיפוס מבטיח לו שלא. לכן מעלים גם על תוספת —
 *        בניגוד למה שכתוב בשורה הראשונה כאן, שהייתה חצי נכונה.
 *   4  — (26.08) שני שינויים בו-זמנית, שניהם משני את המשמעות של "חודש
 *        X" עצמו: (א) `monthPeriod`/`monthOf` עברו מגבול 1-בחודש
 *        ל-7-בחודש. (ב) תנועות עם `individualChargeDate=true` (היום:
 *        גיליון חו״ל/מט״ח) יצאו לגמרי מ-`lib/analytics/load.ts`, ולכן
 *        מ-`expense`/`categories`. סנפשוט ישן חושב את שני אלה אחרת.
 *   5  — (26.08) תשלומים שיצאו דרך ביט (`transfers_out.bit`, קטגוריית
 *        EXPENSE חדשה) עברו מ-`transfer.p2p` (מוחרג לגמרי) לקטגוריית
 *        הוצאה שנספרת. סנפשוט ישן עדיין מחסיר את הסכום הזה מ-`expense`.
 *   6  — (26.08) פילוח הקטגוריות עצמו השתנה: תנועת MAX מקבלת את
 *        קטגוריית ה-MAX שלה כמו שהיא (provider-max.ts) במקום פיצול
 *        לפי שם בית עסק, ונוספה קטגוריית "עמלות" לתשלומי לאומי בלי
 *        מקבילה ב-11 הקטגוריות של MAX. `expense` הכולל לא זז, אבל
 *        `categories`/`comparison` מפוצלים אחרת לגמרי — סנפשוט ישן
 *        עדיין מציג את הפיצול הישן.
 *   7  — (26.08) קטגוריית MAX נוספת התגלתה, "טיסות ותיירות" → יעד
 *        עצמאי חדש `travel` (במקום להישאר לא מסווג). כל תנועה שהייתה
 *        עד עכשיו unclassified בגלל הקטגוריה הזו זזה ל-`categories`,
 *        וגם כאן `expense` הכולל לא זז אבל הפילוח כן.
 */
export const SNAPSHOT_VERSION = 7;

/**
 * `children` תמיד קיים, גם כשהוא ריק.
 *
 * << לא סגנון: שדה אופציונלי הוא `undefined`, ו-`undefined` אינו קיים
 *    ב-JSON. הוא נעלם בכתיבה, והטיפוס ממשיך להבטיח שהוא אולי שם.
 *    **מבנה שנשמר כ-JSON לא צריך להכיל אופציונליים בכלל** — אחרת יש
 *    פער בין מה שהטיפוס אומר למה שבאמת נשמר, והוא מתגלה רק בקריאה.
 */
type CategoryFact = {
  slug: string | null;
  name: string;
  total: Agorot;
  count: number;
  share: number;
  children: CategoryFact[];
};

/**
 * מה שנשמר ב-`facts`, ומה שהמודל יראה.
 *
 * הכול באגורות ובמספרים שלמים, וכל תאריך הוא מחרוזת `YYYY-MM-DD`.
 * ‏`Date` שעובר דרך `JSON.stringify` חוזר כמחרוזת ISO עם שעה ואזור זמן,
 * ו-`new Date()` עליו מחזיר ערך שתלוי בסביבה. **טיפוס שנשמר ל-JSON
 * צריך להיראות כמו JSON כבר בקוד** — אחרת ההמרה קורית פעמיים, פעם
 * בכתיבה ופעם בקריאה, ורק אחת מהן נבדקת.
 */
export type SnapshotFacts = {
  version: number;
  basis: Basis;
  currency: "ILS";

  period: {
    key: string;
    label: string;
    from: string;
    to: string;
    /** עד לאן הגיעו הנתונים בפועל. */
    lastDataAt: string | null;
    daysCovered: number;
    daysInPeriod: number;
    partial: boolean;
  };

  totals: {
    expense: Agorot;
    income: Agorot;
    net: Agorot;
    txnCount: number;
    transfersExcluded: number;
    transfersTotal: Agorot;
  };

  classification: {
    countPct: number;
    amountPct: number;
    unclassifiedAmount: Agorot;
    unclassifiedCount: number;
  };

  categories: CategoryFact[];
  income_categories: CategoryFact[];

  comparison: {
    previousKey: string;
    previousLabel: string;
    /** false = ההשוואה אינה תקפה. חובה להציג את זה. */
    aligned: boolean;
    currentDays: number;
    previousDays: number;
    expenseDelta: Agorot;
    incomeDelta: Agorot;
    movers: {
      slug: string | null;
      name: string;
      delta: Agorot;
      deltaPct: number | null;
    }[];
  } | null;

  fees: {
    total: Agorot;
    count: number;
    shareOfExpense: number;
    byMerchant: { merchant: string; total: Agorot; count: number }[];
  };

  recurring: {
    merchant: string;
    categorySlug: string | null;
    amount: Agorot;
    cadence: string;
    /** "subscription" רק כשהספק הצהיר. אחרת "unknown". */
    kind: string;
    confidence: number;
    occurrences: number;
    /** תקף רק כש-kind הוא subscription. ראה recurring.ts. */
    annualized: Agorot;
    nextDueAt: string;
    stopped: boolean | null;
  }[];

  /** תחזית סוף חודש. `null` כשלא סופקה. */
  forecast: Forecast | null;
};

function toFact(line: CategoryLine, depth = 0): CategoryFact {
  return {
    slug: line.slug,
    name: line.name,
    total: line.total,
    count: line.count,
    share: line.share,
    // שתי שכבות בלבד, כמו עץ הקטגוריות עצמו.
    children: depth === 0 ? line.children.map((c) => toFact(c, depth + 1)) : [],
  };
}

export type BuildInput = {
  breakdown: Breakdown;
  comparison?: Comparison | null;
  fees: FeeReport;
  recurring: readonly RecurringCharge[];
  forecast?: Forecast | null;
  /** כמה שורות "מה השתנה" לשמור. */
  moversLimit?: number;
};

/**
 * בונה את מבנה העובדות. פונקציה טהורה — אין כאן מסד ואין שעון.
 */
export function buildSnapshot(input: BuildInput): SnapshotFacts {
  const { breakdown: b, comparison, fees, recurring, forecast } = input;
  const moversLimit = input.moversLimit ?? 8;

  const categories = b.categories.map((c) => toFact(c));
  if (b.unclassified) categories.push(toFact(b.unclassified));

  return {
    version: SNAPSHOT_VERSION,
    basis: b.basis,
    currency: "ILS",

    period: {
      key: b.period.key,
      label: b.period.label,
      from: isoDay(b.period.from),
      to: isoDay(b.period.to),
      lastDataAt: b.coverage.lastDataAt ? isoDay(b.coverage.lastDataAt) : null,
      daysCovered: b.coverage.daysCovered,
      daysInPeriod: b.coverage.daysInPeriod,
      partial: b.coverage.partial,
    },

    totals: {
      expense: b.expense,
      income: b.income,
      net: b.net,
      txnCount: b.txnCount,
      transfersExcluded: b.excluded.transfers,
      transfersTotal: b.excluded.transfersTotal,
    },

    classification: {
      countPct: b.classification.count.pct,
      amountPct: b.classification.amount.pct,
      unclassifiedAmount: b.unclassified?.total ?? 0,
      unclassifiedCount: b.unclassified?.count ?? 0,
    },

    categories,
    income_categories: b.incomeCategories.map((c) => toFact(c)),

    comparison: comparison
      ? {
          previousKey: comparison.previous.period.key,
          previousLabel: comparison.previous.period.label,
          aligned: comparison.window.aligned,
          currentDays: comparison.window.currentDays,
          previousDays: comparison.window.previousDays,
          expenseDelta: comparison.expenseDelta,
          incomeDelta: comparison.incomeDelta,
          movers: comparison.categories
            .filter((d) => d.delta !== 0)
            .slice(0, moversLimit)
            .map((d) => ({ slug: d.slug, name: d.name, delta: d.delta, deltaPct: d.deltaPct })),
        }
      : null,

    fees: {
      total: fees.total,
      count: fees.count,
      shareOfExpense: fees.shareOfExpense,
      byMerchant: fees.byMerchant.map((f) => ({
        merchant: f.merchant,
        total: f.total,
        count: f.count,
      })),
    },

    recurring: recurring.map((c) => ({
      merchant: c.merchant,
      categorySlug: c.categorySlug,
      amount: c.amount,
      cadence: c.cadence,
      kind: c.kind,
      confidence: c.confidence,
      occurrences: c.occurrences,
      annualized: c.annualized,
      nextDueAt: isoDay(c.nextDueAt),
      stopped: c.stopped,
    })),

    forecast: forecast ?? null,
  };
}

/** האם סנפשוט שמור עדיין תקף. */
export function isCurrent(facts: unknown): boolean {
  return (
    typeof facts === "object" &&
    facts !== null &&
    (facts as { version?: unknown }).version === SNAPSHOT_VERSION
  );
}

/** התקופות שסנפשוט צריך להישמר עבורן. */
export function snapshotKey(period: Period): { periodStart: Date; periodEnd: Date } {
  return { periodStart: period.from, periodEnd: period.to };
}
