/**
 * כסף. במספרים שלמים בלבד.
 *
 * ─── למה לא number רגיל ───
 *
 * ‏JavaScript מחזיק מספרים בנקודה צפה בבסיס 2, ו-0.1 אינו ניתן לייצוג
 * מדויק בבסיס 2 — בדיוק כמו ש-1/3 אינו ניתן לייצוג מדויק בבסיס 10.
 * לכן:
 *
 *   0.1 + 0.2                    // 0.30000000000000004
 *   17.90 * 3                    // 53.699999999999996
 *   1.005.toFixed(2)             // "1.00"  ← לא "1.01"
 *
 * בסיכום של שלוש תנועות זה בלתי נראה. בסיכום של 392 תנועות זה אגורה או
 * שתיים, וזו בדיוק הצורה של באג שמתגלה חודשיים אחרי שנכתב: הדוח מסתדר
 * כמעט תמיד, והפעם שהוא לא מסתדר נראית כמו טעות בנתונים.
 *
 * **הפתרון אינו לעגל בסוף. הפתרון הוא לא לצאת משלמים מלכתחילה.**
 * כל המנוע עובד באגורות — ‎₪17.90 הוא 1790 — ומחזיר לשקלים רק בהצגה.
 *
 * ─── ולמה זה עובד ───
 *
 * מספר שלם בטווח ±2^53 מיוצג במדויק ב-JS. 2^53 אגורות הם כ-90 מיליארד
 * ₪. אין כאן שאלת דיוק בטווח שרלוונטי לאפליקציה הזו.
 *
 * ─── ההמרה ───
 *
 * ‏Prisma מחזיר ‎Decimal(14,2) כאובייקט Decimal, לא כ-number. אם נכתוב
 * ‎Number(txn.amount) נעבור דרך נקודה צפה בדיוק במקום שממנו ניסינו
 * להימלט. `toAgorot` קוראת את הייצוג העשרוני כטקסט ומפרקת אותו לספרות.
 */

/** סכום באגורות. שלילי = כסף יוצא. */
export type Agorot = number;

/** כל מה שאפשר לקרוא ממנו ייצוג עשרוני: Decimal של Prisma, מחרוזת, מספר. */
export type MoneyLike = string | number | { toString(): string };

const DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?$/;

/**
 * ייצוג עשרוני → אגורות.
 *
 *   toAgorot("17.90")    → 1790
 *   toAgorot("-1234.5")  → -123450
 *   toAgorot(0.1)        → 10
 *
 * מספר שמגיע כ-number עובר דרך toFixed(2) — הוא כבר איבד דיוק לפני
 * שהגיע לכאן, ואין מה לעשות בזה חוץ מלקבע אותו. זו הסיבה שהמסלול
 * הנכון הוא Decimal → מחרוזת → אגורות, בלי לעצור ב-number באמצע.
 */
export function toAgorot(value: MoneyLike): Agorot {
  const raw =
    typeof value === "string"
      ? value.trim()
      : typeof value === "number"
        ? (Number.isFinite(value) ? value.toFixed(2) : "")
        : String(value).trim();

  const m = DECIMAL.exec(raw);
  if (!m) throw new Error(`סכום לא חוקי: ${JSON.stringify(value)}`);

  const [, sign, whole, frac = ""] = m;
  const two = (frac + "00").slice(0, 2);
  let agorot = Number(whole) * 100 + Number(two);

  // ספרה שלישית ומעלה — לא אמורה להגיע מ-Decimal(14,2), אבל מגיעה
  // משערי המרה ומחישובי ממוצע. עיגול חצי כלפי מעלה על הערך המוחלט.
  const rest = frac.slice(2);
  if (rest && Number(rest[0]) >= 5) agorot += 1;

  return sign === "-" ? -agorot : agorot;
}

/** אגורות → שקלים. לתצוגה ולסריאליזציה בלבד, לא לחישוב המשך. */
export function toShekels(a: Agorot): number {
  return a / 100;
}

const NF = new Intl.NumberFormat("he-IL", {
  style: "currency",
  currency: "ILS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatILS(a: Agorot): string {
  return NF.format(toShekels(a));
}

export function sumAgorot(values: Iterable<Agorot>): Agorot {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/**
 * אחוז, בעיגול לספרה אחת אחרי הנקודה.
 *
 * ‏0 כשהמכנה 0 — ולא NaN ולא Infinity. חלוקה באפס באנליטיקה אינה מקרה
 * קצה נדיר: זה חודש בלי הוצאות, וזה קורה בחודש הראשון של כל משתמש.
 */
export function share(part: Agorot, whole: Agorot): number {
  if (whole === 0) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
