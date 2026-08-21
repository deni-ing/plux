/**
 * בניית הפרומפט. פונקציה טהורה, בלי רשת ובלי מסד.
 *
 * הסיבה שזה קובץ נפרד: הפרומפט הוא החלק שקובע את איכות התשובה, והוא גם
 * החלק שהכי קל לשנות בטעות. כשהוא פונקציה שמחזירה מחרוזת אפשר להדפיס
 * אותו, להשוות שתי גרסאות, ולכתוב לו בדיקה — בלי לשלם על קריאה למודל.
 *
 * ארבעה עקרונות שמקודדים כאן:
 *
 *  1. **רשימה סגורה.** המודל בוחר מתוך slugs קיימים בלבד. קטגוריה שהומצאה
 *     היא באג שקט: היא לא תתאים לשום שורה במסד ותיעלם.
 *  2. **"לא יודע" היא תשובה לגיטימית.** בלי זה מודל יבחר תמיד משהו, ומדד
 *     הכיסוי יעלה בזמן שהדיוק יורד — הרעה בתחפושת של שיפור.
 *  3. **ציון ביטחון לכל שורה.** כדי שהסף ייקבע אצלנו ולא אצל המודל.
 *  4. **אצווה אחת, לא קריאה לכל תנועה.** מסווגים בתי עסק ייחודיים: 392
 *     תנועות הן 49 שמות. פי שמונה פחות עבודה, ואותה תוצאה בדיוק.
 */

export const SYSTEM_PROMPT = `אתה מסווג בתי עסק ישראליים לקטגוריות הוצאה.

תקבל רשימת שמות של בתי עסק כפי שהם מופיעים בדוח כרטיס אשראי או בדף חשבון
בנק ישראלי. השמות קטועים, מקוצרים, ולעיתים מכילים שם סניף או עיר.

עבור כל שם, בחר קטגוריה אחת מתוך הרשימה הסגורה שתינתן לך.

כללים מחייבים:
- בחר אך ורק מזהה שמופיע ברשימה. אל תמציא מזהה חדש.
- אם אינך יודע, החזר null. "לא יודע" עדיף על ניחוש.
- תיאור בנקאי גנרי שאין בו זהות של בית עסק — כמו "הוראת קבע" או שם של
  חברת סליקה — הוא null. המידע פשוט לא נמצא בשורה.
- ציון הביטחון משקף כמה השם עצמו מזהה את התחום, לא כמה הקטגוריה נפוצה.

החזר JSON בלבד, מערך של אובייקטים:
[{"merchant": "<השם כפי שהתקבל>", "slug": "<מזהה או null>", "confidence": <0..1>, "reason": "<עד 8 מילים>"}]`;

/**
 * גוף ההודעה. מקבל את השמות ואת הרשימה המותרת ומחזיר טקסט.
 *
 * << שים לב שלא עוברים כאן סכומים, תאריכים, מספרי כרטיס או יתרות. זו לא
 *    זהירות כללית אלא מדיניות: השלב הזה רץ רק אחרי שכל המקורות הוודאיים
 *    מוצו, ולכן המחרוזת היא ממילא כל מה שיש. אין מה להרוויח מלשלוח יותר.
 */
export function buildUserPrompt(merchants: string[], allowedSlugs: string[]): string {
  return [
    "קטגוריות מותרות:",
    allowedSlugs.join("\n"),
    "",
    `בתי עסק לסיווג (${merchants.length}):`,
    merchants.join("\n"),
  ].join("\n");
}

/**
 * פענוח התשובה. סלחני בכוונה כלפי הצורה, קפדני כלפי התוכן.
 *
 * מודלים עוטפים JSON בגדרות ```json, מוסיפים משפט פתיחה, או מחזירים
 * אובייקט במקום מערך. כל אלה שגיאות צורה שאפשר לסלוח להן. מה שאסור
 * לסלוח: slug שלא ברשימה, או ביטחון שאינו מספר.
 */
export function parseVerdicts(
  raw: string,
  allowedSlugs: Set<string>
): { merchant: string; slug: string | null; confidence: number; reason?: string }[] {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();

  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const out = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;

    const merchant = typeof o.merchant === "string" ? o.merchant : null;
    if (!merchant) continue;

    const slug = typeof o.slug === "string" && allowedSlugs.has(o.slug) ? o.slug : null;

    // ביטחון שאינו מספר נחשב אפס, לא "בטח". ברירת מחדל שמרנית.
    const confidence =
      typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1
        ? o.confidence
        : 0;

    out.push({
      merchant,
      slug,
      confidence: slug ? confidence : 0,
      reason: typeof o.reason === "string" ? o.reason.slice(0, 120) : undefined,
    });
  }
  return out;
}
