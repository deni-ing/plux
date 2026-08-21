/**
 * 4.3 — כללי בתי עסק.
 *
 * כלל דטרמיניסטי עדיף על מודל בכל מקום שאפשר: הוא זול, מיידי, ניתן לבדיקה,
 * ונותן את אותה תשובה גם מחר. ה-AI בשלב 4.4 יקבל רק את מה שנשאר.
 *
 * כל כלל כאן נגזר מבית עסק שהופיע בפועל בנתונים — או שהוא כיסוי צפוי מראש
 * לרשת ידועה בישראל שסביר שתופיע. אין כאן כללים "ליתר ביטחון" על דברים
 * שאיש לא ראה, כי כלל שלא נבדק מול נתון אמיתי הוא ניחוש עם ביטחון עצמי.
 *
 * ההתאמה נעשית על השדה `merchant` המנורמל — זה שעבר פיצול על שני רווחים
 * ומעלה. בלי הנרמול הזה `APPLE.COM/BILL         ITUNES.COM    IE` לא היה
 * מתאים לשום דבר.
 *
 * עדיפות: מספר נמוך = חזק יותר.
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
    slug: "transfer.p2p",
    priority: 30,
    note: "BIT דרך כרטיס האשראי",
  },
  {
    pattern: "עמל",
    matchType: "PREFIX",
    slug: "financial.bank_fees",
    priority: 40,
    note: 'עמלות לאומי. "עמל.ערוץ יש 11" — 11 מופעים. PREFIX ולא CONTAINS כדי לא לתפוס מילים שמכילות עמל',
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

  // ─────────────── דלק ───────────────
  // MAX מסווגת "דלק, חשמל וגז" — קטגוריה אחת לשלושה דברים. הכללים כאן
  // מפרידים: תחנות דלק לתחבורה, חברות תשתית לדיור.
  {
    pattern: "דור אלון",
    matchType: "CONTAINS",
    slug: "transport.fuel",
    priority: 60,
    note: "רשת תחנות דלק",
  },
  {
    pattern: "סדש",
    matchType: "CONTAINS",
    slug: "transport.fuel",
    priority: 60,
    note: 'רשת תחנות דלק. הופיע כ"סדש אשדוד" וכ"רשת חנויות סדש"',
  },
  {
    pattern: "תחנת דלק",
    matchType: "CONTAINS",
    slug: "transport.fuel",
    priority: 60,
    note: "תחנה עצמאית",
  },
  { pattern: "פז ", matchType: "PREFIX", slug: "transport.fuel", priority: 60, note: "רשת דלק" },
  { pattern: "סונול", matchType: "CONTAINS", slug: "transport.fuel", priority: 60, note: "רשת דלק" },
  { pattern: "דלק מנטה", matchType: "CONTAINS", slug: "transport.fuel", priority: 60, note: "רשת דלק" },
  { pattern: "טן ", matchType: "PREFIX", slug: "transport.fuel", priority: 60, note: "רשת דלק" },

  // ─────────────── תשתיות הבית ───────────────
  // אותה קטגוריה של MAX, יעד הפוך.
  {
    pattern: "חברת החשמל",
    matchType: "CONTAINS",
    slug: "housing.electricity",
    priority: 50,
    note: 'גובר על "דלק, חשמל וגז" של MAX',
  },
  { pattern: "פזגז", matchType: "CONTAINS", slug: "housing.gas", priority: 50, note: "ספק גז ביתי" },
  { pattern: "סופרגז", matchType: "CONTAINS", slug: "housing.gas", priority: 50, note: "ספק גז ביתי" },
  { pattern: "אמישראגז", matchType: "CONTAINS", slug: "housing.gas", priority: 50, note: "ספק גז ביתי" },
  { pattern: "מי אשדוד", matchType: "CONTAINS", slug: "housing.water", priority: 50, note: "תאגיד מים" },
  { pattern: "מקורות", matchType: "CONTAINS", slug: "housing.water", priority: 50, note: "אספקת מים" },

  // ─────────────── מנויים דיגיטליים ───────────────
  // MAX קוראת לכל אלה "פנאי, בידור וספורט". ההפרדה כאן היא מה שיאפשר
  // בהמשך למצוא מנויים שנשכחו.
  {
    pattern: "APPLE.COM",
    matchType: "PREFIX",
    slug: "leisure.subscriptions",
    priority: 40,
    note: "חיוב חוזר של Apple. iCloud או אפליקציה",
  },
  {
    pattern: "TRADINGVIEW",
    matchType: "CONTAINS",
    slug: "leisure.subscriptions",
    priority: 40,
    note: "מנוי חודשי",
  },
  { pattern: "NETFLIX", matchType: "CONTAINS", slug: "leisure.subscriptions", priority: 40, note: "מנוי" },
  { pattern: "SPOTIFY", matchType: "CONTAINS", slug: "leisure.subscriptions", priority: 40, note: "מנוי" },
  { pattern: "GOOGLE", matchType: "PREFIX", slug: "leisure.subscriptions", priority: 70, note: "רחב בכוונה: Google One, YouTube ועוד" },
  { pattern: "OPENAI", matchType: "CONTAINS", slug: "leisure.subscriptions", priority: 40, note: "מנוי" },
  { pattern: "ANTHROPIC", matchType: "CONTAINS", slug: "leisure.subscriptions", priority: 40, note: "מנוי" },

  // ─────────────── משחקים ───────────────
  {
    pattern: "STEAM",
    matchType: "CONTAINS",
    slug: "leisure.gaming",
    priority: 40,
    note: 'הופיע בשתי צורות: "STEAMGAMES.COM" ו-"WL *STEAM PURCHASE"',
  },
  { pattern: "PLAYSTATION", matchType: "CONTAINS", slug: "leisure.gaming", priority: 40, note: "" },
  { pattern: "XBOX", matchType: "CONTAINS", slug: "leisure.gaming", priority: 40, note: "" },

  // ─────────────── תרבות וספורט ───────────────
  { pattern: "סינמה סיטי", matchType: "CONTAINS", slug: "leisure.culture", priority: 40, note: "גם קופות וגם מזנון" },
  { pattern: "יס פלאנט", matchType: "CONTAINS", slug: "leisure.culture", priority: 40, note: "בית קולנוע" },
  // הכלל הראשון כאן היה CONTAINS על "גים" — שנתפס גם ב"מעדני דגים".
  // כלל רחב מדי בעברית מסוכן במיוחד, כי אין גבולות מילה כמו באנגלית.
  { pattern: "דבליו גים", matchType: "CONTAINS", slug: "leisure.sports", priority: 40, note: "חדר כושר. הופיע בנתונים" },
  { pattern: "חדר כושר", matchType: "CONTAINS", slug: "leisure.sports", priority: 50, note: "" },
  { pattern: "הולמס פלייס", matchType: "CONTAINS", slug: "leisure.sports", priority: 50, note: "" },
  { pattern: "GYM", matchType: "CONTAINS", slug: "leisure.sports", priority: 60, note: "" },
  { pattern: "LAZUZ", matchType: "CONTAINS", slug: "leisure.sports", priority: 40, note: "השכרת מגרשי ספורט" },
  { pattern: "פאדליה", matchType: "CONTAINS", slug: "leisure.sports", priority: 40, note: "מגרשי פאדל" },

  // ─────────────── תחבורה ───────────────
  { pattern: "BIRD", matchType: "PREFIX", slug: "transport.taxi", priority: 40, note: "קורקינט שיתופי. MAX סיווגה כפנאי" },
  { pattern: "רב קו", matchType: "CONTAINS", slug: "transport.public", priority: 40, note: "טעינת רב-קו" },
  { pattern: "GETT", matchType: "CONTAINS", slug: "transport.taxi", priority: 40, note: "" },
  { pattern: "יאנגו", matchType: "CONTAINS", slug: "transport.taxi", priority: 40, note: "" },
  { pattern: "פנגו", matchType: "CONTAINS", slug: "transport.parking", priority: 40, note: "תשלום חניה" },
  { pattern: "סלופארק", matchType: "CONTAINS", slug: "transport.parking", priority: 40, note: "תשלום חניה" },
  { pattern: "כביש 6", matchType: "CONTAINS", slug: "transport.tolls", priority: 40, note: "" },
  { pattern: "משרד התחבורה", matchType: "CONTAINS", slug: "financial.taxes", priority: 40, note: "אגרת רישוי" },

  // ─────────────── מזון ───────────────
  { pattern: "סופר פאפא", matchType: "CONTAINS", slug: "food.groceries", priority: 40, note: "חמישה סניפים שונים בנתונים" },
  { pattern: "ויקטורי", matchType: "CONTAINS", slug: "food.groceries", priority: 60, note: "רשת סופרמרקטים" },
  { pattern: "רמי לוי", matchType: "CONTAINS", slug: "food.groceries", priority: 60, note: "רשת סופרמרקטים" },
  { pattern: "שופרסל", matchType: "CONTAINS", slug: "food.groceries", priority: 60, note: "רשת סופרמרקטים" },
  { pattern: "יוחננוף", matchType: "CONTAINS", slug: "food.groceries", priority: 60, note: "רשת סופרמרקטים" },
  { pattern: "אושר עד", matchType: "CONTAINS", slug: "food.groceries", priority: 60, note: "רשת סופרמרקטים" },
  { pattern: "מינימרקט", matchType: "CONTAINS", slug: "food.groceries", priority: 70, note: "" },
  {
    pattern: "כוורת",
    matchType: "CONTAINS",
    slug: "food.groceries",
    priority: 50,
    note: 'קנטינות צה"ל. הופיע גם כ"רשת כוורת בצה\'\'ל" וגם כ"כוורת" לבד — CONTAINS תופס את שניהם',
  },
  { pattern: "מעדני", matchType: "PREFIX", slug: "food.groceries", priority: 70, note: 'תופס "מעדני" ו"מעדניית"' },
  { pattern: "וולט", matchType: "CONTAINS", slug: "food.delivery", priority: 40, note: "Wolt" },
  { pattern: "WOLT", matchType: "CONTAINS", slug: "food.delivery", priority: 40, note: "" },
  { pattern: "TENBIS", matchType: "CONTAINS", slug: "food.delivery", priority: 40, note: "" },
  { pattern: "עשר ביס", matchType: "CONTAINS", slug: "food.delivery", priority: 40, note: "" },
  { pattern: "ארומה", matchType: "CONTAINS", slug: "food.cafe", priority: 60, note: "" },
  { pattern: "קפה ג", matchType: "PREFIX", slug: "food.cafe", priority: 60, note: "קפה גרג" },
  { pattern: "לנדוור", matchType: "CONTAINS", slug: "food.cafe", priority: 60, note: "" },
  { pattern: "שווארמה", matchType: "CONTAINS", slug: "food.restaurants", priority: 70, note: "" },
  { pattern: "בורגר", matchType: "CONTAINS", slug: "food.restaurants", priority: 70, note: 'תופס "זה בורגר" ו"בורגוס"' },

  // ─────────────── בריאות ───────────────
  { pattern: "סופר פארם", matchType: "CONTAINS", slug: "health.pharmacy", priority: 40, note: "" },
  { pattern: "בי דראגסטור", matchType: "CONTAINS", slug: "health.pharmacy", priority: 40, note: "" },
  { pattern: "מכבי", matchType: "PREFIX", slug: "health.hmo", priority: 60, note: "קופת חולים" },
  { pattern: "כללית", matchType: "CONTAINS", slug: "health.hmo", priority: 60, note: "קופת חולים" },
  { pattern: "מאוחדת", matchType: "CONTAINS", slug: "health.hmo", priority: 60, note: "קופת חולים" },

  // ─────────────── קניות ───────────────
  { pattern: "אייבורי", matchType: "CONTAINS", slug: "shopping.electronics", priority: 40, note: "חנות מחשבים" },
  { pattern: "KSP", matchType: "CONTAINS", slug: "shopping.electronics", priority: 40, note: "" },
  { pattern: "ALIEXPRESS", matchType: "PREFIX", slug: "shopping.other", priority: 50, note: 'MAX סיווגה "עיצוב הבית". AliExpress מוכר הכל — לא נכון לייחס לקטגוריה אחת' },
  { pattern: "AMAZON", matchType: "PREFIX", slug: "shopping.other", priority: 50, note: "אותה סיבה" },
  { pattern: "ורדינון", matchType: "CONTAINS", slug: "shopping.home", priority: 40, note: "מצעים וטקסטיל לבית" },
  { pattern: "איקאה", matchType: "CONTAINS", slug: "shopping.home", priority: 40, note: "" },
  { pattern: "פרחי", matchType: "PREFIX", slug: "shopping.gifts", priority: 50, note: 'MAX סיווגה "שונות"' },
  { pattern: "BOSS", matchType: "PREFIX", slug: "shopping.clothing", priority: 50, note: "" },
  { pattern: "פולו ראלף", matchType: "CONTAINS", slug: "shopping.clothing", priority: 40, note: "" },
  { pattern: "קסטרו", matchType: "CONTAINS", slug: "shopping.clothing", priority: 60, note: "" },
  { pattern: "פוקס", matchType: "CONTAINS", slug: "shopping.clothing", priority: 60, note: "" },

  // ─────────────── חינוך ───────────────
  { pattern: "מכון אקדמי", matchType: "CONTAINS", slug: "education.tuition", priority: 40, note: "שכר לימוד" },
  { pattern: "מכון טכנולוג", matchType: "CONTAINS", slug: "education.tuition", priority: 40, note: "שכר לימוד. הופיע גם בבנק וגם ב-MAX" },

  // ─────────────── מזומן ───────────────
  { pattern: "משיכת מזומן", matchType: "CONTAINS", slug: "misc.cash", priority: 40, note: "מזומן שיצא — לא ידוע לאן" },
  { pattern: "כספומט", matchType: "CONTAINS", slug: "misc.cash", priority: 40, note: "" },
];
