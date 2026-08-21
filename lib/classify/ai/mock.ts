import type { AiVerdict, CategoryClassifier } from "./types";

/**
 * מסווג מדומה, דטרמיניסטי, בלי רשת.
 *
 * הוא לא מנסה להיות חכם. תפקידו היחיד הוא לאפשר לבדוק את **הצינור**:
 * שהמועמדים נאספים נכון, שהסף נאכף, שהתוצאה נכתבת למסד, ושמה שמתחת לסף
 * באמת נזרק. בלי מסווג כזה כל בדיקה של המסלול הזה הייתה דורשת מפתח API,
 * רשת, ותשלום — ולכן לא הייתה נכתבת.
 *
 * << ההתאמות כאן מכוונות להיות *לא מושלמות*. שתיים מהן שגויות בכוונה
 *    (`ALIEXPRESS` ל-electronics במקום other, וכל מה שמכיל "מרקט"
 *    ל-groceries גם כשזה לא), כדי שסקריפט ההערכה יראה מספר שאינו 100%
 *    ונדע שהוא באמת משווה ולא מאשר את עצמו.
 */
const HINTS: { needle: string; slug: string; confidence: number }[] = [
  { needle: "סופר", slug: "food.groceries", confidence: 0.9 },
  { needle: "מרקט", slug: "food.groceries", confidence: 0.7 },
  { needle: "מעדני", slug: "food.groceries", confidence: 0.8 },
  { needle: "בורגר", slug: "food.restaurants", confidence: 0.85 },
  { needle: "שווארמה", slug: "food.restaurants", confidence: 0.85 },
  { needle: "קפה", slug: "food.cafe", confidence: 0.8 },
  { needle: "דלק", slug: "transport.fuel", confidence: 0.9 },
  { needle: "STEAM", slug: "leisure.gaming", confidence: 0.9 },
  { needle: "APPLE", slug: "leisure.subscriptions", confidence: 0.85 },
  { needle: "ALIEXPRESS", slug: "shopping.electronics", confidence: 0.6 },
  { needle: "סינמה", slug: "leisure.culture", confidence: 0.9 },
  { needle: "פארם", slug: "health.pharmacy", confidence: 0.9 },
];

export class MockClassifier implements CategoryClassifier {
  readonly name = "mock";

  async classify(merchants: string[], allowedSlugs: string[]): Promise<AiVerdict[]> {
    const allowed = new Set(allowedSlugs);

    return merchants.map((merchant) => {
      const upper = merchant.toUpperCase();
      const hit = HINTS.find((h) => upper.includes(h.needle.toUpperCase()));

      if (!hit || !allowed.has(hit.slug)) {
        return { merchant, slug: null, confidence: 0, reason: "אין התאמה" };
      }
      return {
        merchant,
        slug: hit.slug,
        confidence: hit.confidence,
        reason: `הכיל "${hit.needle}"`,
      };
    });
  }
}
