/**
 * זהות ויזואלית של קטגוריות: אייקון + צבע קבוע לכל slug של קטגוריית-על.
 *
 * ─── למה זה לא פשוט Category.color ───
 *
 * ל-Category יש כבר color מה-seed (lib/categories/tree.ts) — אבל הוא נבחר
 * לתחושה (גווני Material) ולא עבר שום ולידציה: "מזון" ו"הכנסה" חולקים
 * בטעות בדיוק את אותו ירוק (#2E7D32), ואין ערובה שצבעים שכנים נבדלים
 * מספיק תחת עיוורון צבעים. הפלטה כאן היא שמונה הגוונים הקטגוריאליים
 * שאומתו (dataviz skill, הסשן שבנה את הדונאט): fixed hue anchors, CVD
 * delta-E, ניגודיות מול המשטח שלנו — ראו --cat-1..8 ב-globals.css.
 *
 * ‏13 slug אפשריים על 8 סלוטים בטוחים — התאמה יציבה לפי זהות (לא לפי
 * דירוג/גודל החודש הזה, כדי שאותה קטגוריה תמיד תיראה אותו דבר), עם
 * חפיפה מכוונת בין קטגוריות שסביר שלא יופיעו גדולות באותו חודש.
 *
 * האייקון ממשיך לבוא מ-CATEGORY_TREE — אין צורך בשני מקורות אמת לצורה,
 * רק לצבע.
 */

import { CATEGORY_TREE } from "./tree";

export type CategorySlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

const SLOT_BY_SLUG: Record<string, CategorySlot> = {
  housing: 1,
  financial: 1,
  food: 2,
  pets: 2,
  transport: 3,
  giving: 3,
  shopping: 4,
  misc: 4,
  leisure: 5,
  health: 6,
  education: 7,
  insurance: 7,
  telecom: 8,
};

const DEFAULT_SLOT: CategorySlot = 4;

/** הסלוט (1–8) שממופה ל-`var(--cat-N)` / `bg-cat-N` ב-Tailwind. */
export function categorySlot(topSlug: string): CategorySlot {
  return SLOT_BY_SLUG[topSlug] ?? DEFAULT_SLOT;
}

const ICON_BY_SLUG: Record<string, string> = Object.fromEntries(
  CATEGORY_TREE.flatMap((g) => g.categories).map((c) => [c.slug, c.icon ?? "dots"])
);

/** מפתח האייקון (ל-CategoryIcon) עבור slug של קטגוריית-על. */
export function categoryIcon(topSlug: string): string {
  return ICON_BY_SLUG[topSlug] ?? "dots";
}

/**
 * `var(--cat-N)` עבור slug של קטגוריית-על — inline style, לא מחלקת
 * Tailwind דינמית: Tailwind סורק טקסט מילולי כדי לייצר CSS, ומחרוזת
 * שמורכבת ב-runtime משרשור לא נראית לו (התוצאה הייתה עיגול בלי צבע).
 * category-donut.tsx בונה טבלה מקומית זהה מאז לפני שהפונקציה הזו
 * נוספה — נשארה כמות שהיא כדי לא לגעת בקובץ עובד; צרכנים חדשים
 * (budget/parts.tsx) משתמשים בזו במקום להעתיק טבלה שלישית.
 */
const SLOT_VAR: Record<CategorySlot, string> = {
  1: "var(--cat-1)",
  2: "var(--cat-2)",
  3: "var(--cat-3)",
  4: "var(--cat-4)",
  5: "var(--cat-5)",
  6: "var(--cat-6)",
  7: "var(--cat-7)",
  8: "var(--cat-8)",
};

/** ה-CSS var (`var(--cat-N)`) של קטגוריית-על, נגזר מ-categorySlot. */
export function categoryColorVar(topSlug: string): string {
  return SLOT_VAR[categorySlot(topSlug)];
}

/**
 * ה-slug של קטגוריית-העל מתוך slug כלשהו — "food.groceries" -> "food".
 * לא משתמש ב-parentSlug של tree.ts (זה בודק גם isKnownSlug ומחזיר null
 * לתת-קטגוריה בלתי מוכרת); כאן מספיק החלק שלפני הנקודה הראשונה, כי
 * `facts.categories` תמיד נותן slug של קטגוריית-על ברמה העליונה.
 */
export function topLevelSlug(slug: string): string {
  const dot = slug.indexOf(".");
  return dot === -1 ? slug : slug.slice(0, dot);
}
