/**
 * מודד כמה טוב המסווג האוטומטי, מול הכללים כאמת מידה.
 *
 *   npx tsx scripts/ai-eval.mts --user <clerk-user-id>
 *   npx tsx scripts/ai-eval.mts --user <id> --provider mock
 *
 * ─── הרעיון ───
 *
 * יש לנו 90 כללים דטרמיניסטיים שמסווגים נכון 386 תנועות. אלה בתי עסק
 * שאנחנו *יודעים* את התשובה עליהם. אז מסתירים מהמסווג את הכללים, נותנים
 * לו רק את השמות, ומשווים.
 *
 * זו הדרך היחידה לענות על השאלה "האם כדאי לחבר מודל" במספר ולא בתחושה.
 * מסווג שמדייק 60% יגרום ליותר נזק מתועלת: הוא ימלא את הדוחות בקטגוריות
 * שנראות סבירות ואינן נכונות, והמשתמש יגלה את זה רק כשהמספר החודשי יצא
 * מוזר — אם בכלל.
 *
 * ─── שלושה מדדים, ולא אחד ───
 *
 *   כיסוי   — על כמה מהשמות הוא בכלל ענה מעל סף הביטחון
 *   דיוק    — מתוך אלה, כמה זהים לכלל
 *   קרבה    — כמה נפלו לפחות תחת אותה קטגוריית-על
 *
 * ההפרדה חשובה: מסווג שעונה על 30% ומדייק 100% שימושי. מסווג שעונה על
 * 100% ומדייק 55% מזיק. מספר אחד ממוצע היה מסתיר את ההבדל.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";
import { getClassifier, MockClassifier } from "../lib/classify/ai/index";
import { allowedSlugsForAi } from "../lib/classify/ai/run";
import { parentSlug } from "../lib/categories/tree";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", O = "\x1b[0m";

const args = process.argv.slice(2);
const userId = args[args.indexOf("--user") + 1];
const providerArg = args.includes("--provider") ? args[args.indexOf("--provider") + 1] : null;
const minConfidence = args.includes("--min") ? Number(args[args.indexOf("--min") + 1]) : 0.75;

if (!userId || userId.startsWith("--")) {
  console.error("חסר --user <clerk-user-id>");
  process.exit(1);
}

const classifier = providerArg === "mock" ? new MockClassifier() : getClassifier();

if (classifier.name === "none") {
  console.log(`${Y}אין מסווג מוגדר.${O}`);
  console.log(`${D}הרץ עם --provider mock כדי לבדוק את הצינור,${O}`);
  console.log(`${D}או הגדר PLUX_AI_PROVIDER כשיחובר ספק אמיתי.${O}`);
  process.exit(0);
}

// ─────────── אמת המידה: מה שהכללים הכריעו ───────────

const truth = await withUser(userId, async (db) => {
  const rows = await db.transaction.findMany({
    // << עד סעיף 4.10, `categorySource = "RULE"` כיסה גם החלטות
    //    לפי סוג תנועה (עמלה, זיכוי, חיוב כרטיס) — מידע שהמסווג לא
    //    רואה ולעולם לא יראה, ולהשאיר אותן באמת המידה היה למדוד אותו
    //    על מה שלא נתנו לו. אחרי הפיצול ל-RULE / TXN_KIND, "RULE"
    //    כאן כבר אומר "כלל על שם בית עסק" ותו לא — בלי שום סינון נוסף.
    where: { userId, categorySource: "RULE", categoryId: { not: null } },
    select: { merchant: true, category: { select: { slug: true } } },
  });

  const map = new Map<string, string>();
  for (const r of rows) {
    if (!r.merchant || !r.category?.slug) continue;
    map.set(r.merchant, r.category.slug);
  }
  return map;
});

// רק בתי עסק שהכלל שלח אותם לתת-קטגוריה. קטגוריית-על אינה מדד הוגן,
// כי ממנה המסווג ממילא לא מתבקש לבחור.
const allowed = new Set(allowedSlugsForAi());
const pairs = [...truth.entries()].filter(([, slug]) => allowed.has(slug));

if (!pairs.length) {
  console.log(`${Y}אין נתוני אימון.${O} הרץ קודם את classify-check עם --write.`);
  process.exit(0);
}

console.log(`${D}מסווג: ${classifier.name} · סף ביטחון: ${minConfidence}${O}`);
console.log(`${D}נבדקים: ${pairs.length} בתי עסק שהכללים הכריעו${O}\n`);

// ─────────── ההרצה ───────────

const verdicts = await classifier.classify(
  pairs.map(([m]) => m),
  [...allowed]
);
const byMerchant = new Map(verdicts.map((v) => [v.merchant, v]));

let answered = 0;
let exact = 0;
let sameParent = 0;
const wrong: { merchant: string; expected: string; got: string; confidence: number }[] = [];

for (const [merchant, expected] of pairs) {
  const v = byMerchant.get(merchant);
  if (!v || !v.slug || v.confidence < minConfidence) continue;

  answered++;
  if (v.slug === expected) {
    exact++;
    sameParent++;
  } else if (parentSlug(v.slug) === parentSlug(expected)) {
    sameParent++;
    wrong.push({ merchant, expected, got: v.slug, confidence: v.confidence });
  } else {
    wrong.push({ merchant, expected, got: v.slug, confidence: v.confidence });
  }
}

const pct = (n: number, d: number) => (d ? ((n / d) * 100).toFixed(1) : "0.0");

console.log(`כיסוי:  ${answered}/${pairs.length}  (${pct(answered, pairs.length)}%)`);
console.log(`דיוק:   ${exact}/${answered}  (${pct(exact, answered)}%)   ${D}התאמה מדויקת${O}`);
console.log(`קרבה:   ${sameParent}/${answered}  (${pct(sameParent, answered)}%)   ${D}אותה קטגוריית-על${O}`);

if (wrong.length) {
  console.log(`\n${Y}חילוקי דעות${O} (${wrong.length}):`);
  for (const w of wrong.slice(0, 25)) {
    const near = parentSlug(w.got) === parentSlug(w.expected);
    const mark = near ? `${Y}~${O}` : `${R}✗${O}`;
    console.log(`  ${mark} ${w.merchant}`);
    console.log(`      ${D}כלל:${O} ${w.expected}   ${D}מסווג:${O} ${w.got}  (${w.confidence.toFixed(2)})`);
  }
}

// ─── הפרשנות, כדי שהמספר לא ייקרא לבד ───
console.log("");
if (answered === 0) {
  console.log(`${Y}המסווג לא ענה על אף שם מעל הסף. הורד את --min או בדוק את הפרומפט.${O}`);
} else if (Number(pct(exact, answered)) >= 90) {
  console.log(`${G}דיוק גבוה. שווה לחבר אותו לצינור לתנועות שהכללים לא תופסים.${O}`);
} else if (Number(pct(exact, answered)) >= 70) {
  console.log(`${Y}דיוק בינוני. שקול סף ביטחון גבוה יותר, או להציג את ההצעה למשתמש לאישור${O}`);
  console.log(`${Y}במקום לכתוב אותה ישירות.${O}`);
} else {
  console.log(`${R}דיוק נמוך. סיווג אוטומטי במצב הזה יזיק יותר משיועיל —${O}`);
  console.log(`${R}הוא ימלא את הדוחות בקטגוריות סבירות למראה ושגויות.${O}`);
}

await prisma.$disconnect();
// << לא process.exit(0) בכוונה: זו בדיוק הקריסה שנצפתה — process.exit()
// הורג את התהליך באמצע, ואם ל-Anthropic SDK יש עדיין socket keep-alive
// פתוח (undici), Windows תופס את זה כתקלת handle ברמת libuv. exitCode
// נותן ל-Node לסיים בעצמו ברגע שה-event loop מתרוקן — התהליך עדיין
// יוצא, רק בלי להרוג handle באמצע ניקוי.
process.exitCode = 0;
