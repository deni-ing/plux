/**
 * שכבת המסד לתקציב. הקובץ היחיד כאן שיודע על Prisma — כמו
 * lib/savings/store.ts ו-lib/classify/store.ts.
 */

import type { Db } from "../db/client";
import { fromAgorot, toAgorot, type Agorot } from "../analytics/money";
import { categoryIdBySlug } from "../categories/ensure";
import type { SnapshotFacts } from "../analytics/snapshot";

export type BudgetLine = {
  id: string;
  categorySlug: string;
  categoryName: string;
  monthlyCap: Agorot;
  /** ההוצאה בפועל בתקופה שנטענה. 0 כשאין facts או שהקטגוריה לא הוציאה. */
  spent: Agorot;
};

/**
 * `facts.categories` הוא שתי שכבות בלבד (קטגוריות-על + ילדים ישירים) —
 * בדיוק כמו שהדשבורד מציג. תקציב יכול להיות מוגדר על כל אחת מהשתיים,
 * ולכן שתיהן משוטחות למפה אחת לפי slug.
 */
function flattenSpend(categories: SnapshotFacts["categories"]): Map<string, Agorot> {
  const map = new Map<string, Agorot>();
  for (const c of categories) {
    if (c.slug) map.set(c.slug, c.total);
    for (const child of c.children) {
      if (child.slug) map.set(child.slug, child.total);
    }
  }
  return map;
}

export async function listBudgets(
  db: Db,
  userId: string,
  facts: SnapshotFacts | null
): Promise<BudgetLine[]> {
  const rows = await db.budget.findMany({
    where: { userId },
    include: { category: { select: { slug: true, name: true } } },
  });
  const spendBySlug = facts ? flattenSpend(facts.categories) : new Map<string, Agorot>();

  return rows
    .map((r) => ({
      id: r.id,
      categorySlug: r.category.slug,
      categoryName: r.category.name,
      monthlyCap: toAgorot(r.monthlyCap),
      spent: spendBySlug.get(r.category.slug) ?? 0,
    }))
    .sort((a, b) => a.categoryName.localeCompare(b.categoryName, "he"));
}

/**
 * יצירה או עדכון — upsert לפי [userId, categorySlug], לא שני מסלולים
 * נפרדים. משתמש שמגדיר תקציב שכבר קיים על אותה קטגוריה פשוט מעדכן את
 * התקרה; אין צורך במסך "ערוך" נפרד מ-"הוסף".
 *
 * מחזיר false כשה-slug לא ידוע אצל המשתמש — לא זורק, כמו setCategoryAction.
 */
export async function setBudget(
  db: Db,
  userId: string,
  input: { categorySlug: string; monthlyCap: Agorot }
): Promise<boolean> {
  const idBySlug = await categoryIdBySlug(db, userId);
  const categoryId = idBySlug.get(input.categorySlug);
  if (!categoryId) return false;

  await db.budget.upsert({
    where: { userId_categoryId: { userId, categoryId } },
    create: { userId, categoryId, monthlyCap: fromAgorot(input.monthlyCap) },
    update: { monthlyCap: fromAgorot(input.monthlyCap) },
  });
  return true;
}

export async function deleteBudget(db: Db, userId: string, budgetId: string): Promise<void> {
  await db.budget.deleteMany({ where: { id: budgetId, userId } });
}
