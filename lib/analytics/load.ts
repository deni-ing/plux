/**
 * הגשר בין המסד למנוע.
 *
 * זה הקובץ היחיד באנליטיקה שמכיר את Prisma. `spend.ts`, `fees.ts`,
 * `period.ts` ו-`money.ts` לא יודעים שיש מסד — ולכן אפשר להריץ אותם
 * מטסט, מסקריפט, ומתוך בקשת HTTP, ולקבל את אותה תשובה.
 *
 * ─── חוק הטעינה: המסד מצמצם, המנוע מכריע ───
 *
 * פיתוי טבעי הוא לסנן במסד לפי התקופה. הוא שגוי כאן, ובדיוק בגלל
 * שני בסיסי התאריך: תנועה שנקנתה ב-30 ביולי ומחויבת ב-10 באוגוסט
 * שייכת לאוגוסט בבסיס charged ולא תגיע לעולם אם סיננו על bookedAt.
 *
 * לכן ה-`where` מביא **איחוד** של שני התנאים — קצת יותר ממה שצריך —
 * והמנוע מסנן במדויק לפי הבסיס שנבחר. `excluded.outOfPeriod` בדוח סופר
 * בדיוק את העודף הזה, וזו הסיבה שהוא לא אפס.
 *
 * החלופה — לשנות את שאילתת ה-SQL לפי הבסיס — מפזרת את ההחלטה "מה שייך
 * לחודש" לשני מקומות: אחד ב-SQL ואחד ב-TypeScript. **שתי מימושים
 * לאותה הגדרה נפרדים.** ראינו את זה כבר עם `local:` ועם `storagePath`.
 */

import type { Db } from "../db/client";
import { toAgorot } from "./money";
import type { Period } from "./period";
import type { AnalyticsTxn } from "./spend";

/**
 * התנאי המינימלי שמכסה את שני הבסיסים.
 *
 * << `individualChargeDate: false` מ-26.08: תנועה עם תאריך חיוב פרטני
 *    אמיתי (היום: גיליון חו״ל/מט״ח של MAX) לא נכנסת לאנליטיקת ההוצאות
 *    כלל — לא לפי booked ולא לפי charged. היא מנוהלת בנפרד לגמרי דרך
 *    lib/accounts/store.ts (ממתינה → משולמת → יורדת מהיתרה), ולעולם לא
 *    כהוצאת קטגוריה. ראו ההערה על השדה בסכימה.
 */
function windowWhere(userId: string, from: Date, to: Date) {
  return {
    userId,
    individualChargeDate: false,
    OR: [
      { bookedAt: { gte: from, lt: to } },
      { chargedAt: { gte: from, lt: to } },
    ],
  };
}

const SELECT = {
  id: true,
  bookedAt: true,
  chargedAt: true,
  amount: true,
  merchant: true,
  kind: true,
  // << עמודת ההערות של לאומי. "הוראת קבע" שם היא ההצהרה היחידה שיש לנו
  //    שחיוב חוזר הוא מנוי ולא תשלומים.
  note: true,
  countsAsSpending: true,
  category: { select: { slug: true, name: true } },
} as const;

/**
 * טוען תנועות לחלון זמן.
 *
 * `from` ו-`to` הם החלון החיצוני — לא בהכרח חודש אחד. להשוואה בין
 * חודשים טוענים פעם אחת את כל הטווח ומריצים את המנוע על כל חודש
 * בנפרד, במקום שאילתה לחודש. 12 נסיעות הלוך־חזור לאירלנד הן כמעט
 * שנייה, ואת הלקח הזה שילמנו כבר ב-P2028.
 */
export async function loadRange(
  db: Db,
  userId: string,
  from: Date,
  to: Date
): Promise<AnalyticsTxn[]> {
  const rows = await db.transaction.findMany({
    where: windowWhere(userId, from, to),
    select: SELECT,
    orderBy: { bookedAt: "asc" },
  });

  return rows.map((r) => ({
    id: r.id,
    bookedAt: r.bookedAt,
    chargedAt: r.chargedAt,
    // Decimal → מחרוזת → אגורות. בלי לעצור ב-number באמצע.
    amount: toAgorot(r.amount),
    merchant: r.merchant,
    categorySlug: r.category?.slug ?? null,
    categoryName: r.category?.name ?? null,
    countsAsSpending: r.countsAsSpending,
    kind: r.kind,
    note: r.note,
  }));
}

/** נוחות: חודש אחד. */
export function loadPeriod(db: Db, userId: string, period: Period): Promise<AnalyticsTxn[]> {
  return loadRange(db, userId, period.from, period.to);
}

/** מספר חודשים ברצף, בשאילתה אחת. */
export function loadMonths(
  db: Db,
  userId: string,
  months: readonly Period[]
): Promise<AnalyticsTxn[]> {
  if (months.length === 0) return Promise.resolve([]);
  return loadRange(db, userId, months[0].from, months[months.length - 1].to);
}

/**
 * שמות הקטגוריות כפי שהם במסד.
 *
 * ‏`nameOf()` שבעץ מחזיר את השם המובנה. אם המשתמש שינה "מזון" ל-"אוכל",
 * השם שלו הוא הנכון — והמנוע לא ניגש למסד, ולכן המפה מגיעה אליו
 * כארגומנט.
 */
export async function categoryNames(db: Db, userId: string): Promise<Map<string, string>> {
  const rows = await db.category.findMany({
    where: { userId },
    select: { slug: true, name: true },
  });
  return new Map(rows.map((r) => [r.slug, r.name]));
}
