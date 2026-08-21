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

export { NullClassifier } from "./types";
export type { AiVerdict, CategoryClassifier } from "./types";
export { MockClassifier } from "./mock";
export { SYSTEM_PROMPT, buildUserPrompt, parseVerdicts } from "./prompt";

/**
 * בוחר מסווג לפי משתנה סביבה `PLUX_AI_PROVIDER`.
 *
 * להוספת ספק אמיתי בעתיד, שלושה דברים ותו לא:
 *   1. קובץ חדש כאן שמממש `CategoryClassifier`.
 *   2. ענף נוסף ב-switch למטה.
 *   3. המפתח ב-`.env` וב-Vercel — **בלי** קידומת `NEXT_PUBLIC_`.
 *
 * שום קוד אחר בפרויקט לא צריך להשתנות. זו כל הנקודה של הממשק.
 */
export function getClassifier(): CategoryClassifier {
  const kind = (process.env.PLUX_AI_PROVIDER ?? "none").toLowerCase();

  switch (kind) {
    case "none":
      return new NullClassifier();
    case "mock":
      // דטרמיניסטי, בלי רשת. לבדיקת הצינור ולסקריפט ההערכה.
      return new MockClassifier();
    default:
      // ספק לא מוכר הוא כנראה שגיאת הקלדה ב-env, ועדיף לומר זאת בקול
      // מאשר לסווג בשקט אפס תנועות ולהיראות כאילו הכל תקין.
      throw new Error(`PLUX_AI_PROVIDER לא מוכר: "${kind}"`);
  }
}
