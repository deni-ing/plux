import type { Db } from "../db/client";
import { categoryIdBySlug } from "../categories/ensure";
import { isKnownSlug, kindOf } from "../categories/tree";

/**
 * תיקון ידני של המשתמש.
 *
 * זה החלק בשלב 4 שעובד מהיום הראשון ולא תלוי בשום מודל — ולדעתי הוא גם
 * החשוב מבין השניים.
 *
 * ─── שלוש התנהגויות שמגדירות אותו ───
 *
 *  1. **התיקון הופך לכלל.** משתמש שמסמן ש"פיימנט פתרונ-י" הוא שכר דירה
 *     לא רק מתקן שורה — הוא מלמד את המערכת. בפעם הבאה שאותו שם יופיע,
 *     הכלל יתפוס אותו לפני שאיש ישאל. שאלה נשאלת פעם אחת בחיים.
 *
 *  2. **התיקון מתפשט אחורה.** אותו בית עסק בכל ההיסטוריה מקבל את אותה
 *     קטגוריה — למעט שורות שהמשתמש כבר סימן ידנית אחרת. בלי זה הוא היה
 *     צריך לתקן את אותו דבר שלושים פעם.
 *
 *  3. **USER הוא סוף פסוק.** אף סיווג אוטומטי — כלל, מודל, קטגוריית ספק —
 *     לא ידרוס שורה שסומנה ידנית. גם לא `--force`. זו ההבטחה שמאפשרת
 *     למשתמש להשקיע בתיקון בלי לחשוש שהוא ייעלם בייבוא הבא.
 */

export type UserCategoryResult = {
  merchant: string;
  slug: string;
  rowsUpdated: number;
  ruleCreated: boolean;
};

export async function setUserCategory(
  db: Db,
  userId: string,
  input: {
    /** שם בית העסק המנורמל, כפי שהוא בשדה `merchant`. */
    merchant: string;
    slug: string;
    /** ברירת המחדל: כן. כבה כשהתיקון נכון לשורה בודדת ולא לבית העסק. */
    createRule?: boolean;
  }
): Promise<UserCategoryResult> {
  const { merchant, slug } = input;
  const createRule = input.createRule ?? true;

  if (!isKnownSlug(slug)) throw new Error(`slug לא קיים בעץ: ${slug}`);
  if (!merchant.trim()) throw new Error("merchant ריק");

  const byId = await categoryIdBySlug(db, userId);
  const categoryId = byId.get(slug);
  if (!categoryId) throw new Error(`הקטגוריה ${slug} לא קיימת אצל המשתמש`);

  const counts = kindOf(slug) !== "TRANSFER";

  // כל התנועות של אותו בית עסק. תנועה שכבר סומנה USER על קטגוריה *אחרת*
  // נשארת כפי שהיא — המשתמש כבר החליט עליה משהו ספציפי.
  const res = await db.transaction.updateMany({
    where: {
      userId,
      merchant,
      OR: [{ NOT: { categorySource: "USER" } }, { categoryId }],
    },
    data: { categoryId, categorySource: "USER", countsAsSpending: counts },
  });

  let ruleCreated = false;
  if (createRule) {
    // EXACT ולא CONTAINS: המשתמש אישר שם אחד, לא דפוס. כלל רחב שנוצר
    // מהחלטה על שורה אחת הוא בדיוק איך שמערכות לומדות דברים שגויים.
    // priority 10 — חזק מכל כלל מערכת.
    const existing = await db.categoryRule.findUnique({
      where: { userId_pattern_matchType: { userId, pattern: merchant, matchType: "EXACT" } },
      select: { id: true },
    });

    if (existing) {
      await db.categoryRule.update({
        where: { id: existing.id },
        data: { categoryId, priority: 10, isSystem: false, note: "תיקון ידני" },
      });
    } else {
      await db.categoryRule.create({
        data: {
          userId,
          categoryId,
          pattern: merchant,
          matchType: "EXACT",
          priority: 10,
          isSystem: false,
          note: "תיקון ידני",
        },
      });
      ruleCreated = true;
    }
  }

  return { merchant, slug, rowsUpdated: res.count, ruleCreated };
}

/**
 * מה שממתין להכרעת המשתמש: בתי עסק בלי קטגוריה, לפי סכום.
 *
 * << ממוין לפי סכום ולא לפי כמות בכוונה. שלוש הוראות קבע של ₪3,000 חשובות
 *    הרבה יותר מארבעים קניות של ₪12, גם אם הן פחות שורות. מסך שמסדר לפי
 *    כמות היה מבקש מהמשתמש להשקיע את תשומת הלב שלו במקום הלא נכון.
 */
export async function pendingDecisions(
  db: Db,
  userId: string,
  limit = 20
): Promise<{ merchant: string; count: number; total: number }[]> {
  const rows = await db.transaction.findMany({
    where: { userId, categoryId: null },
    select: { merchant: true, amount: true },
  });

  const agg = new Map<string, { count: number; total: number }>();
  for (const r of rows) {
    const key = r.merchant || "(ללא שם)";
    const prev = agg.get(key) ?? { count: 0, total: 0 };
    agg.set(key, { count: prev.count + 1, total: prev.total + Math.abs(Number(r.amount)) });
  }

  return [...agg.entries()]
    .map(([merchant, v]) => ({ merchant, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}
