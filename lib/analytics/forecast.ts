/**
 * תחזית סוף חודש. סעיף 5.6.
 *
 * ─── למה זה הסעיף המסוכן בשלב ───
 *
 * כל שאר האנליטיקה מדווחת על מה שקרה. הסעיף הזה אומר משהו על מה
 * שעוד לא קרה, ולכן הוא היחיד שיכול להיות **שקרי** ולא רק שגוי.
 *
 * הדרך הנאיבית: `הוצאה עד כה ÷ ימים שעברו × ימים בחודש`. היא נשמעת
 * סבירה ומייצרת מספרים גרועים, משלוש סיבות שכולן קיימות בנתונים שלך:
 *
 * **1. הוצאות אינן מתפרשׂות אחיד.** שכר דירה יורד ב-1, חדר הכושר ב-26,
 * חיוב האשראי ב-10. הכפלת קצב ממוצע מניחה שכל יום דומה לכל יום, וזו
 * הנחה שגלוי לעין שאינה נכונה.
 *
 * **2. הוצאה חד־פעמית גדולה מרעילה את הקצב.** ‏₪1,008 של תשלום על
 * ניתוח ביום ה-12 מתוך 17 מתורגמים ל-‎₪59 ליום ומוכפלים ב-14 הימים
 * שנותרו — ‎₪832 שלא יקרו.
 *
 * **3. מה שידוע לא צריך להיות מנוחש.** אנחנו **יודעים** שחדר הכושר
 * ייגבה ב-26. להכניס אותו לתוך ממוצע יומי זה להחליף עובדה בהערכה.
 *
 * ─── מה נבנה במקום ───
 *
 * ההוצאה מפוצלת לשניים, וכל חלק מטופל לפי מה שידוע עליו:
 *
 *   ידוע    חיובים חוזרים שזוהו וטרם נגבו החודש. נספרים בשמם ובסכומם.
 *   משתנה   כל השאר. מוערך לפי קצב יומי, **אחרי** ניכוי החוזרים.
 *
 * והתוצאה אינה מספר אחד אלא **טווח**:
 *
 *   רצפה    מה שכבר יצא ‎+‎ מה שידוע שייגבה. לא ייתכן פחות מזה.
 *   צפוי    רצפה ‎+‎ קצב משתנה ממוצע × ימים שנותרו.
 *   תקרה    רצפה ‎+‎ (ממוצע ‎+‎ סטיית תקן) × ימים שנותרו.
 *
 * **תחזית שמסתירה את ההנחות שלה היא ניחוש בחליפה.** לכן `assumptions`
 * הוא שדה במבנה ולא הערה בקוד: הוא נשמר בסנפשוט, ועובר למסך ולמודל
 * יחד עם המספרים. מי שמציג את הטווח מציג גם על מה הוא נשען.
 *
 * הכול טהור. אין שעון — `asOf` מגיע מכיסוי הנתונים.
 */

import { type Agorot } from "./money";
import { DEFAULT_BASIS, effectiveDate, inPeriod, type Basis, type Period } from "./period";
import type { RecurringCharge } from "./recurring";
import type { AnalyticsTxn, Breakdown } from "./spend";

const DAY_MS = 86_400_000;

export type UpcomingCharge = {
  merchant: string;
  amount: Agorot;
  dueAt: string;
  /** האם הספק הצהיר עליו. משפיע על כמה בטוח שהוא באמת יגיע. */
  declared: boolean;
  confidence: number;
};

export type Forecast = {
  period: string;
  basis: Basis;

  daysCovered: number;
  daysInPeriod: number;
  daysRemaining: number;

  /** מה שכבר יצא בפועל. עובדה. */
  spent: Agorot;

  /** חיובים חוזרים שזוהו וטרם נגבו החודש. */
  upcoming: UpcomingCharge[];
  upcomingTotal: Agorot;

  /** ההוצאה עד כה בניכוי החיובים החוזרים שכבר נגבו. */
  variableSoFar: Agorot;
  /** ממוצע יומי של החלק המשתנה. */
  variablePerDay: Agorot;

  /** ‏spent + upcomingTotal. פחות מזה לא ייתכן. */
  floor: Agorot;
  expected: Agorot;
  ceiling: Agorot;

  /** נגזר מכמה מהחודש כבר ידוע. */
  confidence: "low" | "medium" | "high";

  /** ההנחות, בשפה שאפשר להציג. נשמרות עם המספרים. */
  assumptions: string[];
};

export type ForecastOptions = {
  basis?: Basis;
  /** סף הביטחון שממנו חיוב חוזר נחשב "ידוע". */
  minConfidence?: number;
};

/** ממוצע וסטיית תקן של הוצאה יומית, כולל ימים בלי הוצאה. */
function dailyStats(
  daily: readonly Agorot[]
): { mean: number; std: number } {
  if (daily.length === 0) return { mean: 0, std: 0 };
  const mean = daily.reduce((s, d) => s + d, 0) / daily.length;
  const variance = daily.reduce((s, d) => s + (d - mean) ** 2, 0) / daily.length;
  return { mean, std: Math.sqrt(variance) };
}

/**
 * תחזית לסוף החודש.
 *
 * מקבלת את הפילוח (שכבר יודע עד לאן הנתונים מגיעים) ואת החיובים
 * החוזרים שזוהו על פני כל הטווח — לא רק על החודש הזה.
 */
export function forecastMonth(
  txns: readonly AnalyticsTxn[],
  breakdown: Breakdown,
  recurring: readonly RecurringCharge[],
  options: ForecastOptions = {}
): Forecast {
  const basis = options.basis ?? breakdown.basis ?? DEFAULT_BASIS;
  const minConfidence = options.minConfidence ?? 0.6;
  const period: Period = breakdown.period;

  const daysCovered = breakdown.coverage.daysCovered;
  const daysInPeriod = breakdown.coverage.daysInPeriod;
  const daysRemaining = Math.max(0, daysInPeriod - daysCovered);
  const spent = breakdown.expense;

  const assumptions: string[] = [];

  // ── חודש שהסתיים: אין מה לחזות ──
  if (daysRemaining === 0 || daysCovered === 0) {
    return {
      period: period.key,
      basis,
      daysCovered,
      daysInPeriod,
      daysRemaining,
      spent,
      upcoming: [],
      upcomingTotal: 0,
      variableSoFar: spent,
      variablePerDay: 0,
      floor: spent,
      expected: spent,
      ceiling: spent,
      confidence: daysCovered === 0 ? "low" : "high",
      assumptions:
        daysCovered === 0
          ? ["אין נתונים לחודש הזה."]
          : ["החודש הסתיים. המספר הוא ההוצאה בפועל, לא תחזית."],
    };
  }

  // ── מה ידוע שעוד יגיע ──
  const known = recurring.filter(
    (c) => c.cadence !== "irregular" && c.confidence >= minConfidence && c.stopped !== true
  );

  const upcoming: UpcomingCharge[] = [];
  for (const c of known) {
    // `nextDueAt` נגזר מהחיוב האחרון ‎+‎ המחזור. אם החיוב כבר היה החודש,
    // התאריך הבא נופל בחודש הבא ולכן הוא לא ייכנס לכאן.
    if (!inPeriod(c.nextDueAt, period)) continue;
    // וגם: רק אם הוא אחרי הנקודה שאליה הנתונים מגיעים.
    const cutoff = period.from.getTime() + daysCovered * DAY_MS;
    if (c.nextDueAt.getTime() < cutoff) continue;

    upcoming.push({
      merchant: c.merchant,
      amount: c.amount,
      dueAt: c.nextDueAt.toISOString().slice(0, 10),
      declared: c.declaredByProvider,
      confidence: c.confidence,
    });
  }
  upcoming.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const upcomingTotal = upcoming.reduce((s, c) => s + c.amount, 0);

  // ── החלק המשתנה: הכול חוץ ממה שזוהה כחוזר ──
  const recurringMerchants = new Set(known.map((c) => c.merchant));

  const dailyVariable = new Array<number>(daysCovered).fill(0);
  let variableSoFar = 0;

  for (const t of txns) {
    if (!t.countsAsSpending) continue;
    const when = effectiveDate(t, basis);
    if (!inPeriod(when, period)) continue;
    if (recurringMerchants.has(t.merchant)) continue;

    const value = -t.amount;
    // הכנסות אינן חלק מההוצאה המשתנה.
    if (t.categorySlug !== null && t.categorySlug.startsWith("income")) continue;

    const day = Math.floor((when.getTime() - period.from.getTime()) / DAY_MS);
    if (day >= 0 && day < daysCovered) dailyVariable[day] += value;
    variableSoFar += value;
  }

  const { mean, std } = dailyStats(dailyVariable);
  const variablePerDay = Math.round(mean);

  const floor = spent + upcomingTotal;
  const expected = floor + Math.round(mean * daysRemaining);
  const ceiling = floor + Math.round((mean + std) * daysRemaining);

  // ── הנחות, בכתב ──
  const coveredPct = Math.round((daysCovered / daysInPeriod) * 100);
  assumptions.push(`הנתונים מכסים ${daysCovered} מתוך ${daysInPeriod} ימים (${coveredPct}%).`);

  if (upcoming.length > 0) {
    assumptions.push(
      `${upcoming.length} חיובים חוזרים צפויים עוד החודש ונספרו בשמם, לא בהערכה.`
    );
    const guessed = upcoming.filter((c) => !c.declared).length;
    if (guessed > 0) {
      assumptions.push(
        `${guessed} מהם זוהו לפי דפוס בלבד — ייתכן שלא יגיעו, או שכבר הסתיימו.`
      );
    }
  } else {
    assumptions.push("לא זוהה חיוב חוזר שצפוי עוד החודש.");
  }

  assumptions.push(
    `ההוצאה המשתנה מוערכת לפי ממוצע יומי של ${(mean / 100).toFixed(2)} ₪, בניכוי החיובים החוזרים.`
  );

  if (std > mean * 1.5) {
    assumptions.push(
      "ההוצאה היומית מאוד לא אחידה, ולכן הטווח רחב. הצפוי כאן פחות משמעותי מהרצפה."
    );
  }

  const confidence: Forecast["confidence"] =
    coveredPct < 25 ? "low" : coveredPct < 60 ? "medium" : "high";

  if (confidence === "low") {
    assumptions.push("מעט מדי ימים כדי להעריך קצב. הרצפה אמינה, הצפוי לא.");
  }

  return {
    period: period.key,
    basis,
    daysCovered,
    daysInPeriod,
    daysRemaining,
    spent,
    upcoming,
    upcomingTotal,
    variableSoFar,
    variablePerDay,
    floor,
    expected,
    ceiling,
    confidence,
    assumptions,
  };
}
