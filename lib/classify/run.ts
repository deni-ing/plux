import { withUser } from "../db/client";
import { ensureCategories } from "../categories/ensure";
import { ensureRules } from "./store";
import { classifyTransactions, type ClassifyReport } from "./store";

/**
 * הרצת סיווג מלאה: הכנת הקטגוריות, סנכרון הכללים, ואז הסיווג עצמו.
 *
 * שים לב שאלה **שלוש טרנזקציות נפרדות** ולא אחת גדולה, ושזו לא קוסמטיקה.
 * ייבוא של דף חשבון שנתי כותב 169 שורות; להוסיף לאותה טרנזקציה עוד 70
 * upsert של קטגוריות ועוד 90 של כללים זה להחזיק נעילות פתוחות הרבה יותר
 * זמן ממה שצריך, מאחורי pooler שמוגדר ל-transaction mode. טרנזקציה
 * ארוכה מאחורי pooler היא בדיוק סוג התקלה שמופיעה רק בייצור ורק בעומס.
 *
 * המחיר: אם הסיווג נכשל באמצע, הקטגוריות כבר נוצרו. זה בסדר גמור —
 * שתי הפעולות הראשונות אידמפוטנטיות, והרצה חוזרת פשוט תשלים.
 */
export async function runClassification(
  userId: string,
  opts: { force?: boolean; dryRun?: boolean } = {}
): Promise<ClassifyReport> {
  await withUser(userId, (db) => ensureCategories(db, userId));
  await withUser(userId, (db) => ensureRules(db, userId));
  return withUser(userId, (db) => classifyTransactions(db, userId, opts));
}
