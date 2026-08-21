import type { Db } from "../db/client";
import { CATEGORY_TREE } from "./tree";

/**
 * מוודא שכל הקטגוריות המובנות קיימות אצל המשתמש.
 *
 * למה הקטגוריות שייכות למשתמש ולא גלובליות: כי המשתמש יערוך אותן — ישנה שם,
 * יסתיר קטגוריה שלא רלוונטית לו, יוסיף תת-קטגוריה משלו. טבלה גלובלית הייתה
 * מכריחה טבלת "התאמות אישיות" נפרדת שמחזיקה בדיוק את אותו מידע, פעמיים.
 *
 * ─── על מספר הסיבובים למסד ───
 *
 * הגרסה הראשונה כאן הריצה `upsert` אחד לכל קטגוריה: 71 שאילתות סדרתיות.
 * מקומית זה נראה מיידי. מול Supabase באירלנד כל סיבוב הוא ~70ms, וסך הכל
 * חצה את פסק הזמן של טרנזקציה ב-Prisma (5 שניות) — `P2028`.
 *
 * הפיתוי היה להאריך את פסק הזמן. זה היה מסתיר את הבעיה במקום לפתור אותה:
 * טרנזקציה שמחזיקה נעילות חמש שניות מאחורי pooler היא בעיה בפני עצמה,
 * גם כשהיא לא נכשלת. הגרסה הזו עושה את אותה עבודה בארבע שאילתות לכל היותר,
 * ובמקרה הרגיל — כשהכל כבר קיים — באחת.
 *
 * המחיר: אין כאן עדכון. שינוי צבע או אייקון בעץ לא יעדכן שורה קיימת.
 * זה מודע, וזו הסיבה שהסקריפט מציע `--resync` שמוחק ובונה מחדש.
 */
export async function ensureCategories(db: Db, userId: string): Promise<number> {
  // 1 — מה כבר קיים. זו גם הבדיקה המהירה: אם הכל שם, זו השאילתה היחידה.
  const existing = await db.category.findMany({
    where: { userId },
    select: { id: true, slug: true },
  });
  const idBySlug = new Map(existing.map((c) => [c.slug, c.id]));

  // 2 — קטגוריות-על חסרות, בכתיבה אחת.
  type NewRow = {
    userId: string;
    slug: string;
    name: string;
    icon?: string;
    color?: string;
    kind: "EXPENSE" | "INCOME" | "TRANSFER";
    isSystem: boolean;
    sortKey: number;
    parentId?: string;
  };

  const newParents: NewRow[] = [];
  let sortKey = 0;

  for (const group of CATEGORY_TREE) {
    for (const cat of group.categories) {
      const key = sortKey++;
      sortKey += (cat.children ?? []).length;
      if (idBySlug.has(cat.slug)) continue;
      newParents.push({
        userId,
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        kind: group.kind,
        isSystem: true,
        sortKey: key,
      });
    }
  }

  if (newParents.length) {
    await db.category.createMany({ data: newParents, skipDuplicates: true });

    // 3 — המזהים של מה שנוצר. `createMany` לא מחזיר אותם, והילדים צריכים
    //     parentId. שאילתה אחת לכל החדשים יחד.
    const created = await db.category.findMany({
      where: { userId, slug: { in: newParents.map((p) => p.slug) } },
      select: { id: true, slug: true },
    });
    for (const c of created) idBySlug.set(c.slug, c.id);
  }

  // 4 — תת-קטגוריות חסרות, בכתיבה אחת.
  const newChildren: NewRow[] = [];
  sortKey = 0;

  for (const group of CATEGORY_TREE) {
    for (const cat of group.categories) {
      sortKey++;
      const parentId = idBySlug.get(cat.slug);
      for (const child of cat.children ?? []) {
        const key = sortKey++;
        if (idBySlug.has(child.slug)) continue;
        if (!parentId) continue; // לא אמור לקרות; לא ממציאים ילד בלי הורה
        newChildren.push({
          userId,
          slug: child.slug,
          name: child.name,
          icon: cat.icon,
          color: cat.color,
          kind: group.kind,
          parentId,
          isSystem: true,
          sortKey: key,
        });
      }
    }
  }

  if (newChildren.length) {
    await db.category.createMany({ data: newChildren, skipDuplicates: true });
  }

  return newParents.length + newChildren.length;
}

/**
 * מוחק את כל הקטגוריות המובנות כדי שייבנו מחדש.
 *
 * << `onDelete: Cascade` על `parentId` מוחק גם את הבנות, ו-`SetNull` על
 *    `categoryId` בתנועות אומר שהתנועות עצמן שורדות אבל מאבדות את הסיווג.
 *    לכן אחרי resync חייבים להריץ סיווג מחדש. הסקריפט עושה את זה בעצמו.
 *
 * קטגוריות שהמשתמש יצר (isSystem = false) לא נמחקות.
 */
export async function resetSystemCategories(db: Db, userId: string): Promise<number> {
  const res = await db.category.deleteMany({ where: { userId, isSystem: true } });
  return res.count;
}

/**
 * מפה מ-slug ל-id, לשימוש חוזר בתוך ריצת סיווג אחת.
 *
 * הסיווג מריץ שאילתה אחת כאן ואז עובד בזיכרון. החלופה — שאילתה לכל תנועה —
 * הייתה מאות סיבובים בשביל ייבוא אחד.
 */
export async function categoryIdBySlug(
  db: Db,
  userId: string
): Promise<Map<string, string>> {
  const rows = await db.category.findMany({
    where: { userId },
    select: { id: true, slug: true },
  });
  return new Map(rows.map((r) => [r.slug, r.id]));
}
