/**
 * חיובים חוזרים. סעיף 5.3.
 *
 * ─── מה הסעיף הזה יכול לדעת, ומה הוא לא ───
 *
 * מדף חשבון אפשר לראות **שכסף יוצא בקצב קבוע**. אי אפשר לראות למה,
 * ואי אפשר לראות אם השתמשת. שלוש הבחנות שנובעות מזה, וכל אחת מהן
 * שינתה את המבנה של הקובץ:
 *
 * **1. מנוי ותשלומים נראים זהים לחלוטין.**
 * ‏₪1,009 בחודש שלוש פעמים ברציפות יכולים להיות מנוי חודשי או ניתוח
 * שפוצל לתשלומים. ההבדל אינו בדפוס — הוא בכך שלתשלומים יש מספר סופי
 * שנקבע מראש, ואת זה אין בנתון. **כלי שיציג את שניהם כ"מנוי פעיל
 * שכדאי לשקול לבטל" ייתן עצה גרועה בביטחון גבוה**, וזו הצורה המסוכנת
 * של טעות: לא לא לדעת, אלא לדעת בטעות.
 *
 * לכן `kind` מחזיר `"unknown"` כברירת מחדל, ומשתדרג ל-`"subscription"`
 * רק כשיש הצהרה מהספק.
 *
 * **2. "מנוי לא בשימוש" אינו ניתן לזיהוי מכאן.**
 * סעיף 5.4 בלוח מבקש לזהות מנוי שאתה משלם עליו ולא משתמש בו. שימוש
 * אינו מופיע בדף חשבון בשום צורה. מה שכן אפשר לזהות זה **מנוי שהפסיק
 * להיגבות** (`stopped`) — וזה בדיוק ההפך. הדוח אומר "שווה בדיקה" ולא
 * "לא בשימוש", ומצרף את העלות השנתית כדי שההחלטה תהיה שלך.
 *
 * **3. ביטחון הוא חלק מהתשובה, לא הערת שוליים.**
 * שלוש חזרות בקצב אחיד ובסכום זהה אינן אותו דבר כמו שלוש חזרות בפערים
 * של 20 ו-45 יום. `confidence` נגזר משני הדברים בנפרד — יציבות הקצב
 * ויציבות הסכום — ומוצג תמיד.
 *
 * הכול כאן טהור. `asOf` מגיע כארגומנט ולא מהשעון.
 */

import { type Agorot } from "./money";
import { DEFAULT_BASIS, effectiveDate, type Basis } from "./period";
import type { AnalyticsTxn } from "./spend";

const DAY_MS = 86_400_000;

/** ההצהרה של לאומי בעמודת ההערות. עובדה, לא ניחוש. */
const STANDING_ORDER = /הוראת\s*קבע/;

export type Cadence = "weekly" | "monthly" | "quarterly" | "yearly" | "irregular";

export type RecurringKind =
  /** הספק הצהיר: הוראת קבע. */
  | "subscription"
  /** דפוס חוזר שזוהה סטטיסטית. יכול להיות מנוי, ויכול להיות תשלומים. */
  | "unknown";

export type RecurringCharge = {
  merchant: string;
  categorySlug: string | null;
  /** הסכום האופייני (חציון). חיובי. */
  amount: Agorot;
  /** כל הסכומים שנצפו, ממוינים. יותר מאחד = חיוב משתנה. */
  amounts: Agorot[];
  occurrences: number;
  firstSeenAt: Date;
  lastSeenAt: Date;
  /** הפער החציוני בימים בין חיובים. */
  intervalDays: number;
  cadence: Cadence;
  kind: RecurringKind;
  declaredByProvider: boolean;
  /** 0..1 */
  confidence: number;
  /** מתי צפוי החיוב הבא, לפי הקצב. */
  nextDueAt: Date;
  /**
   * האם החיוב מאחר. `null` כשלא סופק `asOf`.
   * מעל 1.5 מחזורים בלי חיוב — כנראה הופסק.
   */
  stopped: boolean | null;
  /**
   * ‏amount × מספר החיובים בשנה, לפי הקצב.
   *
   * << **המספר הזה תקף רק כש-`kind === "subscription"`.** על חיוב
   *    `unknown` הוא השלכה מותנית: תשלומים על ניתוח ייגמרו, ומנוי לא,
   *    ושניהם מייצרים כאן את אותו מספר. כל מציג — מסך, דוח, או תשובה
   *    של המודל — חייב להסתעף על `kind` לפני שהוא מציג אותו, ולומר
   *    "אם יימשך". טעינו בזה פעם אחת ב-spend.mts.
   */
  annualized: Agorot;
};

export type RecurringOptions = {
  basis?: Basis;
  /**
   * מינימום חזרות. 3 ולא 2 — **בשתי נקודות יש פער אחד, ומפער אחד אי
   * אפשר לדעת אם הוא קצב או צירוף מקרים.** קצב דורש שני פערים לפחות.
   */
  minOccurrences?: number;
  /** נקודת הייחוס לחישוב "מאחר". מגיע כארגומנט, לא מהשעון. */
  asOf?: Date;
};

// << מיוצאות (median/regularity/stability): המזהה החדש להעברה חוזרת
// לחיסכון (lib/recommendations/engine.ts) צריך בדיוק אותה סטטיסטיקה
// על TRANSFER_OUT, ש-findRecurring למעלה מדיר במפורש. שכפול הנוסחה
// היה יוצר שני מימושים לאותה הגדרה — בדיוק הלקח החוזר בפרויקט הזה.
export function median(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 0;
  const mid = n >> 1;
  return n % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * מהפער החציוני לשם.
 *
 * הטווחים רחבים בכוונה: חיוב "חודשי" ב-31 בינואר מגיע ב-28 בפברואר,
 * ומנוי שנגבה ביום עסקים ראשון זז בסופי שבוע. **קצב אמיתי אינו מדויק,
 * וכלי שדורש דיוק יסווג כל דבר כ"לא סדיר".**
 */
export function cadenceOf(intervalDays: number): Cadence {
  if (intervalDays >= 5 && intervalDays <= 9) return "weekly";
  if (intervalDays >= 25 && intervalDays <= 36) return "monthly";
  if (intervalDays >= 80 && intervalDays <= 100) return "quarterly";
  if (intervalDays >= 350 && intervalDays <= 380) return "yearly";
  return "irregular";
}

const PER_YEAR: Record<Cadence, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  irregular: 0,
};

/** 0..1 — כמה אחיד הקצב. פער יחיד מקבל 1 כי אין ממה לסטות. */
export function regularity(gaps: readonly number[]): number {
  if (gaps.length < 2) return 1;
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (mean === 0) return 0;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  return Math.max(0, 1 - Math.sqrt(variance) / mean);
}

/** 0..1 — כמה יציב הסכום. */
export function stability(amounts: readonly Agorot[]): number {
  const min = amounts[0];
  const max = amounts[amounts.length - 1];
  if (max === 0) return 0;
  if (min === max) return 1;
  return Math.max(0, 1 - (max - min) / max);
}

/**
 * מוצא חיובים חוזרים.
 *
 * מקבל את **כל** התנועות שנטענו, לא חלון של חודש: דפוס חוזר לא נראה
 * בחודש אחד מעצם הגדרתו.
 */
export function findRecurring(
  txns: readonly AnalyticsTxn[],
  options: RecurringOptions = {}
): RecurringCharge[] {
  const basis = options.basis ?? DEFAULT_BASIS;
  const minOccurrences = options.minOccurrences ?? 3;
  const asOf = options.asOf ?? null;

  const groups = new Map<string, AnalyticsTxn[]>();
  for (const t of txns) {
    // העברות אינן חיוב חוזר גם כשהן חוזרות: העברה חודשית לחשבון חיסכון
    // היא לא משהו ש"שווה לבטל".
    if (!t.countsAsSpending) continue;
    // רק כסף שיוצא. זיכוי חוזר אינו מנוי.
    if (t.amount >= 0) continue;
    const list = groups.get(t.merchant);
    if (list) list.push(t);
    else groups.set(t.merchant, [t]);
  }

  const out: RecurringCharge[] = [];

  for (const [merchant, list] of groups) {
    const declared = list.some((t) => t.note !== null && t.note !== undefined && STANDING_ORDER.test(t.note));

    if (list.length < minOccurrences && !(declared && list.length >= 2)) continue;

    const dated = list
      .map((t) => ({ t, at: effectiveDate(t, basis) }))
      .sort((a, b) => a.at.getTime() - b.at.getTime());

    const gaps: number[] = [];
    for (let i = 1; i < dated.length; i++) {
      gaps.push(Math.round((dated[i].at.getTime() - dated[i - 1].at.getTime()) / DAY_MS));
    }
    // שני חיובים באותו יום אינם מחזור. מסננים אותם מהפערים כדי שלא
    // ימשכו את החציון לאפס — אבל סופרים אותם כהתרחשויות.
    const realGaps = gaps.filter((g) => g > 0);
    if (realGaps.length === 0) continue;

    const intervalDays = median([...realGaps].sort((a, b) => a - b));
    const cadence = cadenceOf(intervalDays);

    const amounts = dated.map((d) => -d.t.amount).sort((a, b) => a - b);
    const amount = median(amounts);

    const firstSeenAt = dated[0].at;
    const lastSeenAt = dated[dated.length - 1].at;
    const nextDueAt = new Date(lastSeenAt.getTime() + intervalDays * DAY_MS);

    const stopped =
      asOf === null
        ? null
        : (asOf.getTime() - lastSeenAt.getTime()) / DAY_MS > intervalDays * 1.5;

    const confidence = declared
      ? 1
      : Math.round(
          Math.min(
            1,
            0.5 * regularity(realGaps) +
              0.3 * stability(amounts) +
              0.2 * Math.min(1, (dated.length - 2) / 3)
          ) * 100
        ) / 100;

    out.push({
      merchant,
      categorySlug: dated[dated.length - 1].t.categorySlug,
      amount,
      amounts: [...new Set(amounts)],
      occurrences: dated.length,
      firstSeenAt,
      lastSeenAt,
      intervalDays,
      cadence,
      kind: declared ? "subscription" : "unknown",
      declaredByProvider: declared,
      confidence,
      nextDueAt,
      stopped,
      annualized: amount * PER_YEAR[cadence],
    });
  }

  return out.sort((a, b) => b.annualized - a.annualized || b.amount - a.amount);
}

/**
 * מה שווה לבדוק. סעיף 5.4, בגרסה שהנתונים תומכים בה.
 *
 * הכותרת בלוח היא "מנוי לא בשימוש". שימוש אינו קיים בדף חשבון, ולכן
 * הפונקציה הזו **אינה** מזהה חוסר שימוש — היא ממיינת לפי מה שכן ידוע:
 * כמה זה עולה בשנה, וכמה בטוחים שזה חוזר. ההחלטה נשארת אצל בעל
 * החשבון, וזו לא התחמקות אלא הגבול האמיתי של הנתון.
 */
export function worthReviewing(
  charges: readonly RecurringCharge[],
  options: { minAnnual?: Agorot; minConfidence?: number } = {}
): RecurringCharge[] {
  const minAnnual = options.minAnnual ?? 50000; // ₪500 בשנה
  const minConfidence = options.minConfidence ?? 0.6;
  return charges
    .filter((c) => c.stopped !== true)
    .filter((c) => c.cadence !== "irregular")
    .filter((c) => c.annualized >= minAnnual && c.confidence >= minConfidence)
    .sort((a, b) => b.annualized - a.annualized);
}

/**
 * חיובים שהפסיקו להיגבות — כנראה בוטלו.
 *
 * << הגרסה הראשונה החזירה כל חיוב עם `stopped === true`, והתוצאה על
 *    הנתונים האמיתיים הייתה רשימה של ‎₪6 ממכונת שתייה, ‎₪14 מהסופר
 *    ו-‎₪38 ממעדנייה. **דברים שמעולם לא היו מנוי לא יכולים "להפסיק"** —
 *    הם פשוט לא נקנו החודש, וזו לא ידיעה.
 *
 *    ובאמצע הרעש הזה נקברה השורה שכן חשובה: שכר דירה של ‎₪3,000 שלא
 *    נגבה חודשיים. **רשימה שמערבבת אות ברעש מסתירה את האות** — ולכן
 *    אותו סינון איכות שיש ל-`worthReviewing` חל גם כאן.
 *
 * מה שסונן מדווח ב-`filtered` ולא נעלם בשקט: סף שאי אפשר לראות נראה
 * כמו "לא נמצא כלום".
 */
export function stoppedCharges(
  charges: readonly RecurringCharge[],
  options: { minAnnual?: Agorot; minConfidence?: number } = {}
): { charges: RecurringCharge[]; filtered: number } {
  const minAnnual = options.minAnnual ?? 30000; // ₪300 בשנה
  const minConfidence = options.minConfidence ?? 0.6;

  const all = charges.filter((c) => c.stopped === true);
  const kept = all
    .filter((c) => c.cadence !== "irregular")
    .filter((c) => c.annualized >= minAnnual && c.confidence >= minConfidence)
    .sort((a, b) => b.annualized - a.annualized);

  return { charges: kept, filtered: all.length - kept.length };
}
