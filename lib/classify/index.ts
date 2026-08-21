/**
 * נקודת הכניסה היחידה לסיווג.
 *
 * שים לב שכל השורות כאן הן ייצוא בלבד ואין בקובץ קוד שמשתמש בטיפוסים
 * האלה. זה מכוון: `export type { X } from "./y"` מייצא את X החוצה אבל
 * *לא* מכניס אותו למרחב השמות של הקובץ הזה. ביום 3 זה עלה בארבעה
 * דיפלויים אדומים ברצף, כי הקובץ גם ייצא טיפוס וגם השתמש בו בלי לייבא.
 */

export { classify, compileRules, normalizeForMatch } from "./engine";
export type { Classifiable, CompiledRule, Decision, MatchType, TxnKind } from "./engine";

export { SYSTEM_RULES } from "./rules";
export type { SystemRule } from "./rules";

export { MAX_CATEGORY_MAP, MAX_COARSE_CATEGORIES, mapMaxCategory } from "./provider-max";

export { ensureRules, loadRules, classifyTransactions, resetSystemRules } from "./store";
export type { ClassifyReport } from "./store";
