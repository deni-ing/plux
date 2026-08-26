/**
 * 4.3 — כללי בתי עסק.
 *
 * << מ-26.08, החלטת משתמש: תנועה מ-MAX מסווגת לפי הקטגוריה שהיא הביאה
 *    איתה מהקובץ (ראו lib/classify/provider-max.ts) — לא לפי ניחוש על
 *    שם בית העסק. לכן רוב הכללים שהיו כאן הוסרו: הם היו קיימים בדיוק
 *    כדי *לפצל* קטגוריית MAX אחת (כמו "פנאי, בידור וספורט") לכמה
 *    קטגוריות מדויקות יותר — Netflix, Steam, חדר כושר בנפרד — וזה
 *    בדיוק מה שהמשתמש לא רוצה יותר.
 *
 * מה שנשאר כאן הוא לא ניחוש על *תוכן* קטגוריה — אלה עובדות מבניות
 * שהבנק (לאומי) אומר על עצמו בתיאור התנועה: זו עמלה, זו העברה, זה
 * חיוב מרוכז. לדף חשבון הבנק אין עמודת "קטגוריה" משלו כמו ב-MAX, אז
 * אין ממה "לסטות" — הכללים האלה *הם* המקור היחיד למידע הזה.
 *
 * ‏עדיפות: מספר נמוך = חזק יותר.
 *   10   כלל שנוצר מתיקון ידני של המשתמש (נוצר בזמן ריצה, לא כאן)
 *   40   כלל מדויק על שם מלא
 *   60   כלל על רשת מוכרת
 *   80   כלל רחב שעלול לתפוס יותר מדי
 */

export type SystemRule = {
  pattern: string;
  matchType: "EXACT" | "PREFIX" | "CONTAINS" | "REGEX";
  slug: string;
  priority: number;
  note: string;
};

export const SYSTEM_RULES: SystemRule[] = [
  // ─────────────── בנק לאומי: שורות מבניות ───────────────
  // אלה לא "בתי עסק" אלא תיאורי תנועה של הבנק. הם הכי חשובים כאן, כי הם
  // אלה שקובעים אם תנועה נספרת כהוצאה בכלל.
  {
    pattern: "מקס איט פיננ",
    matchType: "CONTAINS",
    slug: "transfer.card_settlement",
    priority: 20,
    note: "חיוב מרוכז של MAX. 86 מופעים. חייב להיות העברה — התנועות עצמן כבר נספרות מקובץ MAX",
  },
  {
    pattern: "BIT",
    matchType: "EXACT",
    slug: "transfers_out.bit",
    priority: 25,
    note: "מ-MAX: תשלום שיצא דרך ביט — שם בית העסק הוא בדיוק \"BIT\". כסף שיצא בפועל ולא חוזר, אז נספר כהוצאה (בניגוד לחיוב הכרטיס המרוכז). EXACT ולא CONTAINS כדי לא לתפוס דברים כמו BITCOIN",
  },
  {
    pattern: "הפועלים-ביט",
    matchType: "CONTAINS",
    slug: "transfer.p2p",
    priority: 30,
    note: "כסף נכנס מביט. העברה בין אנשים, לא הכנסה",
  },
  {
    pattern: "העברה דיגיטל",
    matchType: "CONTAINS",
    slug: "transfer.p2p",
    priority: 30,
    note: "העברה דרך האפליקציה של הבנק",
  },
  {
    pattern: "תשלום מיידי",
    matchType: "CONTAINS",
    slug: "transfer.p2p",
    priority: 30,
    note: "העברה מיידית יוצאת",
  },
  {
    pattern: "העברה ב BIT",
    matchType: "CONTAINS",
    slug: "transfers_out.bit",
    priority: 30,
    note: "תשלום שיצא מהבנק ישירות דרך ביט. << מ-26.08: כסף שיצא בפועל ולא חוזר, לכן עבר מ-transfer.p2p (מוחרג) לקטגוריית הוצאה",
  },
  {
    pattern: "עמל",
    matchType: "PREFIX",
    slug: "fees",
    priority: 40,
    note: '<< מ-26.08, עבר מ-financial.bank_fees ל-fees: עמלת לאומי בלי מקבילה ב-11 הקטגוריות של MAX. "עמל.ערוץ יש 11" — 11 מופעים. PREFIX ולא CONTAINS כדי לא לתפוס מילים שמכילות עמל',
  },
  {
    pattern: "החזר לאומי",
    matchType: "CONTAINS",
    slug: "income.refunds",
    priority: 40,
    note: "החזר עמלה מהבנק",
  },
  {
    pattern: "אל שרד",
    matchType: "CONTAINS",
    slug: "income.salary",
    priority: 40,
    note: "המעסיק. 12 זיכויים חודשיים",
  },
  {
    pattern: "מילוא",
    matchType: "CONTAINS",
    slug: "income.benefits",
    priority: 50,
    note: 'תגמולי מילואים. תופס גם "מופ"ת מילואי" וגם "מענק מילואים"',
  },
  {
    pattern: "אייסף",
    matchType: "CONTAINS",
    slug: "income.benefits",
    priority: 50,
    note: "מלגת קרן אייסף",
  },
  // שם של בנק אחר בשורת התיאור פירושו שהצד השני לתנועה הוא חשבון בבנק
  // הזה. זו העברה, לא קנייה. עדיפות חלשה כי זה היסק ולא הצהרה.
  { pattern: "בנק הפועלים", matchType: "CONTAINS", slug: "transfer.p2p", priority: 70, note: "העברה מול חשבון בבנק אחר" },
  { pattern: "מרכנתיל", matchType: "CONTAINS", slug: "transfer.p2p", priority: 70, note: "העברה מול חשבון בבנק אחר" },
  { pattern: "הע אינטרנט", matchType: "CONTAINS", slug: "transfer.p2p", priority: 60, note: "העברה שבוצעה באתר הבנק" },

  // ─────────────── תשתיות הבית (דף חשבון לאומי בלבד) ───────────────
  // << מ-26.08, עברו מ-housing.electricity/gas/water ל-fees: לדף החשבון
  //    של לאומי אין עמודת "קטגוריה" משלו כמו ל-MAX, ואין מקבילה ל-11
  //    הקטגוריות שלו. חשמל/מים/גז מתשלום ישיר מהבנק נופלים ל"עמלות"
  //    יחד עם עמלות בנק והוראות קבע בלי זיהוי ספציפי יותר.
  {
    pattern: "חברת החשמל",
    matchType: "CONTAINS",
    slug: "fees",
    priority: 50,
    note: "חברת חשמל — תשלום ישיר מהבנק, לא דרך MAX",
  },
  { pattern: "פזגז", matchType: "CONTAINS", slug: "fees", priority: 50, note: "ספק גז ביתי — תשלום ישיר מהבנק" },
  { pattern: "סופרגז", matchType: "CONTAINS", slug: "fees", priority: 50, note: "ספק גז ביתי — תשלום ישיר מהבנק" },
  { pattern: "אמישראגז", matchType: "CONTAINS", slug: "fees", priority: 50, note: "ספק גז ביתי — תשלום ישיר מהבנק" },
  { pattern: "מי אשדוד", matchType: "CONTAINS", slug: "fees", priority: 50, note: "תאגיד מים — תשלום ישיר מהבנק" },
  { pattern: "מקורות", matchType: "CONTAINS", slug: "fees", priority: 50, note: "אספקת מים — תשלום ישיר מהבנק" },

  // ─────────────── מזומן (דף חשבון לאומי בלבד) ───────────────
  // אין ל-MAX מושג של משיכת מזומן — זו עובדה שרק דף הבנק יכול לספר.
  { pattern: "משיכת מזומן", matchType: "CONTAINS", slug: "misc.cash", priority: 40, note: "מזומן שיצא — לא ידוע לאן" },
  { pattern: "כספומט", matchType: "CONTAINS", slug: "misc.cash", priority: 40, note: "" },
];
