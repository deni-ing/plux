/**
 * המוסכמה של `ImportJob.storagePath`, במקום אחד.
 *
 * ─── למה הקובץ הזה קיים ───
 *
 * השדה `storagePath` יכול לשאת שלושה דברים שונים:
 *
 *   `<userId>/<jobId>/<שם>`   הקובץ הגולמי שמור בדלי
 *   `inline:<שם>`             הייבוא רץ בלי לשמור קובץ (סקריפט, בדיקה)
 *   `purged:<שם>`             הקובץ נמחק אחרי תקופת השמירה
 *
 * שלוש הצורות האלה נכתבו בשלושה מקומות שונים — מסלול ה-HTTP, סקריפט
 * הייבוא, ומשימת המחיקה — וכל אחד מהם החזיק את הידע בעצמו.
 *
 * התוצאה התגלתה בבדיקת השפיות: שמונה ייבואים נשאו `local:C:\Users\...`,
 * סימון שהיה בשימוש חצי יום לפני ש-`inline:` תפס את מקומו. שתי מחרוזות
 * לאותה משמעות בדיוק, ואף אחת מהן לא הייתה שגויה במקום שבו נכתבה.
 *
 * **ערך סימון שאין לו מקום אחד שמגדיר אותו יסתעף.** לא כי מישהו התרשל,
 * אלא כי אין נקודה שבה אפשר לראות שיש כבר צורה אחרת.
 *
 * ─── ומה עם הנתיב המקומי ───
 *
 * `local:` שמר גם את הנתיב המלא במערכת הקבצים — שם המשתמש בווינדוס ושם
 * הקובץ של דף החשבון. אין בזה סכנה מיידית, ואין בזה גם שום צורך.
 * `inlinePath()` שומר את שם הקובץ בלבד.
 */

export const INLINE = "inline:";
export const PURGED = "purged:";

/** סימון "הייבוא רץ בלי לשמור את הקובץ". שם בלבד, בלי נתיב. */
export function inlinePath(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() || "statement";
  return INLINE + base;
}

/** סימון "הקובץ היה ונמחק". */
export function purgedPath(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() || "statement";
  return PURGED + base;
}

/** האם יש קובץ גולמי בדלי, ששייך למשתמש הזה. */
export function isStored(path: string, userId: string): boolean {
  return path.startsWith(`${userId}/`);
}

export function isInline(path: string): boolean {
  return path.startsWith(INLINE);
}

export function isPurged(path: string): boolean {
  return path.startsWith(PURGED);
}

/**
 * צורות שהיו בשימוש בעבר ואינן נכתבות יותר.
 *
 * << לא נמחקות מהקוד: נתונים ישנים במסד ממשיכים לשאת אותן, וכלי שלא
 *    מכיר אותן ידווח עליהן כתקלה. `scripts/fix-storage-paths.mts` ממיר
 *    אותן, וכשהמסד נקי אפשר יהיה למחוק את השורה הזו.
 */
export const LEGACY_PREFIXES = ["local:"];

export function isLegacy(path: string): boolean {
  return LEGACY_PREFIXES.some((p) => path.startsWith(p));
}

/** לאיזו משפחה שייך הנתיב. משמש בדוחות ובבדיקות. */
export function classifyPath(
  path: string,
  userId: string
): "stored" | "inline" | "purged" | "legacy" | "unknown" {
  if (isStored(path, userId)) return "stored";
  if (isInline(path)) return "inline";
  if (isPurged(path)) return "purged";
  if (isLegacy(path)) return "legacy";
  return "unknown";
}
