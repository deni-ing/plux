/**
 * תקופות, ובסיס התאריך.
 *
 * ─── שתי החלטות שכל השאר נשען עליהן ───
 *
 * **1. חלון חצי־פתוח: [from, to)**
 *
 * אוגוסט הוא `[2026-08-01, 2026-09-01)` — כולל את ההתחלה, לא כולל את
 * הסוף. הצורה השנייה, `[08-01, 08-31]`, נראית טבעית יותר לאדם ומייצרת
 * שתי תקלות: צריך לדעת אם לחודש יש 30 או 31 יום, וצריך את התרגיל
 * ‏`23:59:59.999` כדי לא לאבד תנועה בשעה האחרונה. בחלון חצי־פתוח שני
 * הדברים נעלמים, וחודשים עוקבים משיקים בלי חפיפה ובלי חור.
 *
 * **2. הכול ב-UTC**
 *
 * ‏`bookedAt` הוא `@db.Date` — יום בלי שעה. Prisma מחזיר אותו כ-Date
 * של JS שמצביע על חצות UTC. אם נקרא ממנו עם `getMonth()` — שעובד לפי
 * אזור הזמן של המכונה — נקבל תשובה שתלויה במכונה:
 *
 *   תנועה מ-2026-08-01, נקראת בשרת ב-America/New_York (UTC-4)
 *   → getMonth() מחזיר 6 (יולי). התנועה נופלת בחודש הקודם.
 *
 * במחשב שלו (Asia/Jerusalem, UTC+3) זה לא יקרה לעולם, ולכן זה בדיוק
 * סוג הבאג שמתגלה רק בפרודקשן. **תאריך בלי שעה חייב להיקרא בלי אזור
 * זמן.** כל הקובץ משתמש ב-`getUTC*` ו-`Date.UTC`, בלי יוצא מן הכלל.
 */

/**
 * **3. התקופה מתחילה ב-7 בחודש, לא ב-1 (מ-26.08)**
 *
 * << החלטה מפורשת של המשתמש: "אוגוסט" בפלוקס הוא [7 באוגוסט, 7
 *    בספטמבר) ולא [1 באוגוסט, 1 בספטמבר). לא שרירותי ולא ניחוש —
 *    זה פשוט התאריך שממנו הוא בפועל סופר את החודש שלו. `PERIOD_START_DAY`
 *    הוא המקום היחיד שהיום הזה כתוב בו; `monthPeriod` בונה ממנו את
 *    הגבולות, ו-`monthOf` מגלגל תאריך עם יום < 7 לתקופה של החודש
 *    *הקודם*. שינוי כזה משנה משמעות של כל סנפשוט שמור — ראו העלאת
 *    ‏`SNAPSHOT_VERSION` ב-lib/analytics/snapshot.ts.
 */
const PERIOD_START_DAY = 7;

/**
 * לפי איזה תאריך משייכים תנועה לחודש.
 *
 *   booked  — תאריך העסקה. "מתי הוצאתי".
 *   charged — תאריך החיוב. "מתי הכסף יצא מהחשבון".
 *
 * ההבדל אינו תיאורטי אצלו: קנייה ב-MAX מ-3 באוגוסט מחויבת ב-10
 * בספטמבר. בבסיס booked היא הוצאה של אוגוסט; בבסיס charged היא
 * הוצאה של ספטמבר. שתי התשובות נכונות לשתי שאלות שונות — הראשונה
 * להתנהגות, השנייה לתזרים — ולכן זה פרמטר ולא הכרעה.
 */
export type Basis = "booked" | "charged";

/**
 * ברירת המחדל היא booked.
 *
 * לא כי היא נכונה יותר, אלא כי היא עונה על השאלה שאדם שואל את עצמו:
 * "על מה הוצאתי החודש". תאריך החיוב הוא עובדה של הבנק, לא של ההתנהגות
 * — ובבסיס charged כל קניות אוגוסט ב-MAX מופיעות כגוש אחד ב-10.9,
 * מה שהופך את גרף הימים בחודש לחסר משמעות.
 */
export const DEFAULT_BASIS: Basis = "booked";

export type Period = {
  /** כולל */
  from: Date;
  /** לא כולל */
  to: Date;
  /** לתצוגה: "אוגוסט 2026" */
  label: string;
  /** יציב, למפתח במפה ולשמירה ב-AnalyticsSnapshot: "2026-08" */
  key: string;
};

const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

/** תאריך UTC נקי, בלי שעה. */
export function utcDate(year: number, month1to12: number, day: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, day));
}

/** "2026-08-01" — הצורה שבה תאריך נכתב ללוג, לקובץ ולמפתח. */
export function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * חודש שלם.
 *
 * ‏`Date.UTC(2026, 12, 1)` מחזיר את ינואר 2027 מעצמו — גלישת החודש
 * מטופלת בשפה, ואין צורך ב-if על דצמבר. זו אחת מהמקומות הבודדים שבהם
 * ‏Date של JS עושה בדיוק את הדבר הנכון.
 */
export function monthPeriod(year: number, month1to12: number): Period {
  const from = new Date(Date.UTC(year, month1to12 - 1, PERIOD_START_DAY));
  const to = new Date(Date.UTC(year, month1to12, PERIOD_START_DAY));
  // << from.getUTCMonth() תמיד שווה ל-month1to12-1 כאן: יום 7 לעולם
  //    לא גולש לחודש הבא (בניגוד ליום 31, למשל), אז אין הפתעה כאן —
  //    בשונה מ-`to`, שבכוונה כן גולש (דצמבר → ינואר בשנה הבאה).
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  return {
    from,
    to,
    label: `${MONTHS[m]} ${y}`,
    key: `${y}-${String(m + 1).padStart(2, "0")}`,
  };
}

/**
 * התקופה שבה נופל התאריך.
 *
 * << לא "החודש הקלנדרי שלו" — `PERIOD_START_DAY`. יום 3 בספטמבר נופל
 *    בתקופה "אוגוסט" (שמסתיימת ב-7 בספטמבר), לא ב"ספטמבר".
 */
export function monthOf(d: Date): Period {
  const day = d.getUTCDate();
  let y = d.getUTCFullYear();
  let m = d.getUTCMonth() + 1; // 1-12
  if (day < PERIOD_START_DAY) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return monthPeriod(y, m);
}

export function previousMonth(p: Period): Period {
  return monthPeriod(p.from.getUTCFullYear(), p.from.getUTCMonth());
}

export function nextMonth(p: Period): Period {
  return monthPeriod(p.from.getUTCFullYear(), p.from.getUTCMonth() + 2);
}

/** ‏n חודשים אחרונים כולל זה של `anchor`, מהישן לחדש. */
export function monthsBack(anchor: Date, n: number): Period[] {
  const out: Period[] = [];
  const y = anchor.getUTCFullYear();
  const m = anchor.getUTCMonth() + 1;
  for (let i = n - 1; i >= 0; i--) out.push(monthPeriod(y, m - i));
  return out;
}

/** תקופה חופשית, לטווח שהמשתמש בחר. */
export function customPeriod(from: Date, to: Date, label?: string): Period {
  return {
    from,
    to,
    label: label ?? `${isoDay(from)} — ${isoDay(to)}`,
    key: `${isoDay(from)}_${isoDay(to)}`,
  };
}

const DAY_MS = 86_400_000;

/** כמה ימים בתקופה. */
export function daysIn(p: Period): number {
  return Math.round((p.to.getTime() - p.from.getTime()) / DAY_MS);
}

/** היום הכמה בתקופה, 1-based. יום ההתחלה הוא 1. */
export function dayOfPeriod(d: Date, p: Period): number {
  return Math.floor((d.getTime() - p.from.getTime()) / DAY_MS) + 1;
}

/**
 * ‏n הימים הראשונים של תקופה.
 *
 * זה מה שהופך חודש חלקי להשוואה הוגנת: 17 ימי אוגוסט מול **17 הימים
 * הראשונים של יולי**, ולא מול יולי כולו. בלי זה כל חודש רץ מציג ירידה
 * בכל קטגוריה, וה"ירידה" היא ספירת ימים.
 */
export function firstDays(p: Period, days: number): Period {
  const to = new Date(Math.min(p.from.getTime() + days * DAY_MS, p.to.getTime()));
  return {
    from: p.from,
    to,
    label: `${p.label} · ${days} ימים ראשונים`,
    key: `${p.key}#${days}`,
  };
}

export function inPeriod(d: Date, p: Period): boolean {
  const t = d.getTime();
  return t >= p.from.getTime() && t < p.to.getTime();
}

export type Dated = { bookedAt: Date; chargedAt: Date | null };

/**
 * התאריך שקובע, לפי הבסיס הנבחר.
 *
 * ‏`chargedAt` הוא nullable — בדף חשבון לאומי אין תאריך חיוב נפרד, כי
 * החיוב *הוא* התנועה. בבסיס charged נופלים חזרה ל-bookedAt, וזו החלטה
 * נכונה אבל לא שקופה: תנועה שנפלה חזרה נראית בדוח בדיוק כמו תנועה עם
 * תאריך חיוב אמיתי.
 *
 * לכן `countFallbacks` סופרת אותן, והמנוע מדווח את המספר. **ברירת מחדל
 * שקטה שאי אפשר לספור היא הנחה, לא ברירת מחדל.**
 */
export function effectiveDate(t: Dated, basis: Basis): Date {
  if (basis === "charged") return t.chargedAt ?? t.bookedAt;
  return t.bookedAt;
}

export function usedFallback(t: Dated, basis: Basis): boolean {
  return basis === "charged" && t.chargedAt === null;
}
