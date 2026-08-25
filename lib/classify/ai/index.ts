/**
 * נקודת הכניסה לשכבת ה-AI.
 *
 * << הטיפוסים והמימוש הריק יושבים ב-types.ts ולא כאן, כדי ש-mock.ts יוכל
 *    לייבא אותם בלי לייבא את הקובץ הזה. אחרת נוצר מעגל: index צריך את
 *    Mock כדי לבחור בו, ו-Mock צריך את הממשק שהוגדר ב-index. מעגלי ייבוא
 *    ב-ESM לא תמיד קורסים — לפעמים הם רק מחזירים undefined בטעינה, וזה
 *    גרוע יותר מקריסה.
 */

import { NullClassifier, type CategoryClassifier } from "./types";
import { MockClassifier } from "./mock";
import { ClaudeClassifier } from "./claude";

export { NullClassifier } from "./types";
export type { AiVerdict, CategoryClassifier } from "./types";
export { MockClassifier } from "./mock";
export { ClaudeClassifier, CLASSIFY_MODEL } from "./claude";
export { SYSTEM_PROMPT, buildUserPrompt, parseVerdicts } from "./prompt";

/**
 * בוחר מסווג לפי משתנה סביבה `PLUX_AI_PROVIDER`.
 *
 * << סעיף 4.8: `claude` נוסף כאן והוא הספק האמיתי הראשון. שים לב
 *    שהוא נפרד לגמרי מהצ'אט — משתמש באותו `ANTHROPIC_API_KEY` שכבר
 *    מוגדר (הצ'אט כבר תלוי בו בייצור), אבל בקריאה נפרדת, בלי כלים,
 *    ובלי שיחה. להריץ `ai-eval` לפני שמחליפים `none`/`mock` ב-`claude`
 *    בייצור — דיוק נמוך מזיק יותר מכיסוי חסר.
 */
export function getClassifier(): CategoryClassifier {
  const kind = (process.env.PLUX_AI_PROVIDER ?? "none").toLowerCase();

  switch (kind) {
    case "none":
      return new NullClassifier();
    case "mock":
      // דטרמיניסטי, בלי רשת. לבדיקת הצינור ולסקריפט ההערכה.
      return new MockClassifier();
    case "claude":
      return new ClaudeClassifier();
    default:
      // ספק לא מוכר הוא כנראה שגיאת הקלדה ב-env, ועדיף לומר זאת בקול
      // מאשר לסווג בשקט אפס תנועות ולהיראות כאילו הכל תקין.
      throw new Error(`PLUX_AI_PROVIDER לא מוכר: "${kind}"`);
  }
}
