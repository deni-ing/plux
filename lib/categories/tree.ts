/**
 * עץ הקטגוריות המובנה.
 *
 * שתי שכבות: קטגוריית-על ותת-קטגוריה. ה-slug של תת-קטגוריה תמיד מתחיל
 * ב-slug של האם ואחריו נקודה — `transport.fuel`. זו לא רק מוסכמה יפה:
 * היא מאפשרת לגזור את האם מה-slug בלי לגעת במסד, וזה מה שמאפשר לכתוב
 * מיפויים וכללים בקוד בלי להחזיק מזהים.
 *
 * שלוש הערות על מה שהעץ הזה *לא*:
 *
 * 1. הוא לא סופי. המשתמש יכול להוסיף קטגוריות משלו, והן לא מסומנות
 *    isSystem ולכן ה-seed לא נוגע בהן.
 * 2. הוא לא זהה לקטגוריות של MAX. MAX מחזירה 11 ערכים גסים שמערבבים
 *    דברים שונים — "דלק, חשמל וגז" באותה קטגוריה. המיפוי ב-provider-max.ts
 *    מתרגם אותם, והכללים ב-rules.ts מתקנים את מה שהמיפוי לא יכול.
 * 3. הוא לא כולל "לא מסווג" כקטגוריה. תנועה לא מסווגת היא categoryId = null.
 *    קטגוריה בשם "לא מסווג" נראית זהה בדוח אבל מסתירה את ההבדל בין
 *    "החלטנו שזה שייך לכאן" ל"לא הצלחנו להחליט".
 */

export type CategoryKind = "EXPENSE" | "INCOME" | "TRANSFER";

export type CategoryDef = {
  slug: string;
  name: string;
  icon?: string;
  color?: string;
  children?: { slug: string; name: string }[];
};

export type CategoryGroup = {
  kind: CategoryKind;
  categories: CategoryDef[];
};

/** צבעים ברמת קטגוריית-העל בלבד. תת-קטגוריה יורשת את צבע האם. */
export const CATEGORY_TREE: CategoryGroup[] = [
  {
    kind: "EXPENSE",
    categories: [
      {
        slug: "food",
        name: "מזון",
        icon: "shopping-cart",
        color: "#2E7D32",
        children: [
          { slug: "food.groceries", name: "סופר ומכולת" },
          { slug: "food.restaurants", name: "מסעדות" },
          { slug: "food.cafe", name: "בתי קפה" },
          { slug: "food.delivery", name: "משלוחי אוכל" },
          { slug: "food.other", name: "מזון — אחר" },
        ],
      },
      {
        slug: "transport",
        name: "תחבורה",
        icon: "car",
        color: "#1565C0",
        children: [
          { slug: "transport.fuel", name: "דלק" },
          { slug: "transport.public", name: "תחבורה ציבורית" },
          { slug: "transport.taxi", name: "מוניות ושיתופי נסיעה" },
          { slug: "transport.parking", name: "חניה" },
          { slug: "transport.tolls", name: "כבישי אגרה" },
          { slug: "transport.vehicle", name: "טיפולים ורכב" },
          { slug: "transport.other", name: "תחבורה — אחר" },
        ],
      },
      {
        slug: "housing",
        name: "דיור",
        icon: "home",
        color: "#6A1B9A",
        children: [
          { slug: "housing.rent", name: "שכר דירה ומשכנתא" },
          { slug: "housing.municipal", name: "ארנונה" },
          { slug: "housing.electricity", name: "חשמל" },
          { slug: "housing.water", name: "מים" },
          { slug: "housing.gas", name: "גז" },
          { slug: "housing.building", name: "ועד בית" },
          { slug: "housing.other", name: "דיור — אחר" },
        ],
      },
      {
        slug: "telecom",
        name: "תקשורת",
        icon: "phone",
        color: "#00838F",
        children: [
          { slug: "telecom.mobile", name: "סלולר" },
          { slug: "telecom.internet", name: "אינטרנט" },
          { slug: "telecom.tv", name: "טלוויזיה" },
        ],
      },
      {
        slug: "health",
        name: "בריאות",
        icon: "heart",
        color: "#C62828",
        children: [
          { slug: "health.hmo", name: "קופת חולים" },
          { slug: "health.pharmacy", name: "בתי מרקחת" },
          { slug: "health.private", name: "רפואה פרטית" },
          { slug: "health.dental", name: "שיניים" },
          { slug: "health.optics", name: "אופטיקה" },
          { slug: "health.other", name: "בריאות — אחר" },
        ],
      },
      {
        slug: "shopping",
        name: "קניות",
        icon: "bag",
        color: "#AD1457",
        children: [
          { slug: "shopping.clothing", name: "ביגוד והנעלה" },
          { slug: "shopping.electronics", name: "אלקטרוניקה ומחשבים" },
          { slug: "shopping.home", name: "לבית ועיצוב" },
          { slug: "shopping.care", name: "טיפוח" },
          { slug: "shopping.gifts", name: "מתנות ופרחים" },
          { slug: "shopping.other", name: "קניות — אחר" },
        ],
      },
      {
        slug: "leisure",
        name: "פנאי",
        icon: "ticket",
        color: "#EF6C00",
        children: [
          { slug: "leisure.subscriptions", name: "מנויים דיגיטליים" },
          { slug: "leisure.culture", name: "תרבות ואירועים" },
          { slug: "leisure.sports", name: "ספורט וכושר" },
          { slug: "leisure.travel", name: "נופש וטיולים" },
          { slug: "leisure.gaming", name: "משחקים" },
          { slug: "leisure.other", name: "פנאי — אחר" },
        ],
      },
      {
        slug: "education",
        name: "חינוך וילדים",
        icon: "book",
        color: "#4527A0",
        children: [
          { slug: "education.daycare", name: "גן ומעון" },
          { slug: "education.activities", name: "חוגים" },
          { slug: "education.tuition", name: "שכר לימוד" },
          { slug: "education.supplies", name: "ציוד לימודי" },
        ],
      },
      {
        slug: "insurance",
        name: "ביטוח",
        icon: "shield",
        color: "#37474F",
        children: [
          { slug: "insurance.car", name: "רכב" },
          { slug: "insurance.home", name: "דירה" },
          { slug: "insurance.life", name: "חיים ובריאות" },
          { slug: "insurance.other", name: "ביטוח — אחר" },
        ],
      },
      {
        slug: "financial",
        name: "פיננסי",
        icon: "bank",
        color: "#455A64",
        children: [
          { slug: "financial.bank_fees", name: "עמלות בנק" },
          { slug: "financial.card_fees", name: "עמלות אשראי" },
          { slug: "financial.interest", name: "ריבית" },
          { slug: "financial.taxes", name: "מסים ואגרות" },
          { slug: "financial.other", name: "פיננסי — אחר" },
        ],
      },
      {
        slug: "giving",
        name: "תרומות",
        icon: "hand-heart",
        color: "#00695C",
        children: [
          { slug: "giving.donations", name: "תרומות" },
          { slug: "giving.support", name: "תמיכה במשפחה" },
        ],
      },
      {
        slug: "pets",
        name: "חיות מחמד",
        icon: "paw",
        color: "#795548",
        children: [
          { slug: "pets.food", name: "מזון לחיות" },
          { slug: "pets.vet", name: "וטרינר" },
        ],
      },
      {
        slug: "misc",
        name: "שונות",
        icon: "dots",
        color: "#757575",
        children: [
          { slug: "misc.cash", name: "משיכת מזומן" },
          { slug: "misc.other", name: "שונות — אחר" },
        ],
      },
    ],
  },

  {
    kind: "INCOME",
    categories: [
      {
        slug: "income",
        name: "הכנסות",
        icon: "trending-up",
        color: "#2E7D32",
        children: [
          { slug: "income.salary", name: "משכורת" },
          { slug: "income.freelance", name: "עצמאי" },
          { slug: "income.benefits", name: "מענקים וקצבאות" },
          { slug: "income.refunds", name: "החזרים וזיכויים" },
          { slug: "income.investments", name: "ריבית ודיבידנד" },
          { slug: "income.gifts", name: "מתנות שהתקבלו" },
          { slug: "income.other", name: "הכנסה — אחר" },
        ],
      },
    ],
  },

  {
    // << המפתח לכל האנליטיקה. תנועה שנופלת כאן לא נספרת כהוצאה ולא כהכנסה.
    //    בלי זה חיוב האשראי המרוכז נספר פעם אחת כשורה בבנק ופעם שנייה
    //    כאוסף השורות ב-MAX, וההוצאות מוצגות כפולות.
    kind: "TRANSFER",
    categories: [
      {
        slug: "transfer",
        name: "העברות",
        icon: "arrows",
        color: "#546E7A",
        children: [
          { slug: "transfer.card_settlement", name: "חיוב כרטיס אשראי" },
          { slug: "transfer.p2p", name: "העברות אישיות" },
          { slug: "transfer.internal", name: "בין חשבונות" },
          { slug: "transfer.other", name: "העברה — אחר" },
        ],
      },
    ],
  },
];

/** קטגוריית-העל של slug נתון. `food.groceries` → `food`. */
export function parentSlug(slug: string): string | null {
  const i = slug.indexOf(".");
  return i === -1 ? null : slug.slice(0, i);
}

/** כל ה-slugs המובנים, שטוח. משמש לאימות שמיפוי לא מצביע על קטגוריה שלא קיימת. */
export function allSlugs(): string[] {
  const out: string[] = [];
  for (const group of CATEGORY_TREE) {
    for (const cat of group.categories) {
      out.push(cat.slug);
      for (const child of cat.children ?? []) out.push(child.slug);
    }
  }
  return out;
}

const SLUG_SET = new Set(allSlugs());

/** האם ה-slug קיים בעץ. נקרא בזמן טעינה, לא בזמן ריצה על כל תנועה. */
export function isKnownSlug(slug: string): boolean {
  return SLUG_SET.has(slug);
}

/** ה-kind של slug, נגזר מקטגוריית-העל שלו. */
export function kindOf(slug: string): CategoryKind | null {
  const root = parentSlug(slug) ?? slug;
  for (const group of CATEGORY_TREE) {
    if (group.categories.some((c) => c.slug === root)) return group.kind;
  }
  return null;
}
