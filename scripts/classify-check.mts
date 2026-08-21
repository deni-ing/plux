/**
 * מריץ את הסיווג ומדווח מה יצא.
 *
 *   npx tsx scripts/classify-check.mts --user <clerk-user-id>            # הרצה יבשה
 *   npx tsx scripts/classify-check.mts --user <id> --write               # כותב למסד
 *   npx tsx scripts/classify-check.mts --user <id> --write --force       # מסווג הכל מחדש
 *   npx tsx scripts/classify-check.mts --user <id> --write --resync      # בונה מחדש קטגוריות וכללים
 *   npx tsx scripts/classify-check.mts --user <id> --write --ai          # מפעיל גם את שכבת ה-AI
 *
 * ברירת המחדל היא הרצה יבשה בכוונה. סיווג הוא הפעולה הראשונה בפרויקט
 * שמשנה נתונים קיימים ולא רק מוסיפה חדשים, ולכן היא לא צריכה להיות זולה
 * מדי להפעלה בטעות.
 *
 * הפלט החשוב ביותר הוא דווקא הרשימה בסוף: בתי העסק שאף כלל לא ידע לסווג,
 * ממוינים לפי סכום. זו רשימת המשימות של שלב 4.4 — ואם שורה אחת שם שווה
 * אלפי שקלים, עדיף לכתוב לה כלל מאשר לשלוח אותה למודל.
 */

import "dotenv/config";
import { withUser } from "../lib/db/client";
import { ensureCategories, resetSystemCategories } from "../lib/categories/ensure";
import { ensureRules, classifyTransactions, resetSystemRules, coverage } from "../lib/classify/store";
import { classifyWithAi } from "../lib/classify/ai/run";
import { allSlugs, isKnownSlug } from "../lib/categories/tree";
import { SYSTEM_RULES } from "../lib/classify/rules";
import { MAX_CATEGORY_MAP } from "../lib/classify/provider-max";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", O = "\x1b[0m";

const args = process.argv.slice(2);
const userId = args[args.indexOf("--user") + 1];
const write = args.includes("--write");
const force = args.includes("--force");
const resync = args.includes("--resync");
const useAi = args.includes("--ai");

if (!userId || userId.startsWith("--")) {
  console.error("חסר --user <clerk-user-id>");
  process.exit(1);
}

// ─────────── 0. בדיקות שלא נוגעות במסד ───────────
// נכשלות מיד, לפני שנפתח חיבור. כלל ששולח לקטגוריה לא קיימת הוא באג שקט:
// הוא פשוט לא יסווג כלום, ואף אחד לא ישים לב.

let broken = 0;
for (const rule of SYSTEM_RULES) {
  if (!isKnownSlug(rule.slug)) {
    console.error(`${R}כלל שבור${O}: "${rule.pattern}" מצביע על ${rule.slug} שלא קיים בעץ`);
    broken++;
  }
}
for (const [maxCat, slug] of Object.entries(MAX_CATEGORY_MAP)) {
  if (slug !== null && !isKnownSlug(slug)) {
    console.error(`${R}מיפוי שבור${O}: "${maxCat}" → ${slug} שלא קיים בעץ`);
    broken++;
  }
}
if (broken) process.exit(1);

console.log(`${D}עץ: ${allSlugs().length} קטגוריות · כללים: ${SYSTEM_RULES.length}${O}\n`);

// ─────────── 1. הכנה ───────────
//
// כל שלב הוא טרנזקציה קצרה משלו. טרנזקציה אחת גדולה חוצה את פסק הזמן של
// Prisma (5 שניות) כשכל שאילתה היא סיבוב לאירלנד.

if (resync) {
  const droppedRules = await withUser(userId, (db) => resetSystemRules(db, userId));
  const droppedCats = await withUser(userId, (db) => resetSystemCategories(db, userId));
  console.log(`${Y}resync${O}: נמחקו ${droppedCats} קטגוריות מערכת ו-${droppedRules} כללי מערכת`);
  console.log(`${D}תנועות שהיו מסווגות איבדו את הקטגוריה. הרץ עם --write כדי לסווג מחדש.${O}`);
}

const created = await withUser(userId, (db) => ensureCategories(db, userId));
console.log(created ? `נוצרו ${created} קטגוריות` : "הקטגוריות כבר קיימות");

const rules = await withUser(userId, (db) => ensureRules(db, userId));
console.log(rules.created ? `נוצרו ${rules.created} כללים` : "הכללים כבר קיימים");
for (const s of rules.skipped) console.log(`  ${Y}דולג${O} ${s}`);

// ─────────── 2. סיווג ───────────

const report = await withUser(userId, (db) =>
  classifyTransactions(db, userId, { force, dryRun: !write })
);

const pct = report.scanned ? ((report.classified / report.scanned) * 100).toFixed(1) : "0.0";
console.log(`\n${write ? "נכתב" : "הרצה יבשה"}${force ? " · סיווג מחדש של הכל" : ""}`);
// המכנה כאן הוא "מה שנסרק בהרצה הזו", לא "כל התנועות". בלי הבהרה מפורשת
// המספר נקרא כנסיגה כשהוא בעצם התקדמות — קרה בדיוק כך ב-21.08.
console.log(`בהרצה זו: נסרקו ${report.scanned} · סווגו ${report.classified} (${pct}% מהנסרקים)`);
console.log(`סומנו כהעברה ולא ייספרו כהוצאה: ${report.markedAsTransfer}`);

console.log("\nלפי מקור ההחלטה:");
for (const [src, n] of Object.entries(report.bySource).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${src}`);
}

console.log("\nעשר הקטגוריות הגדולות:");
Object.entries(report.bySlug)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .forEach(([slug, n]) => console.log(`  ${String(n).padStart(4)}  ${slug}`));

if (report.unresolved.length) {
  console.log(`\n${Y}לא סווגו${O} — ${report.unresolved.length} בתי עסק, לפי סכום:`);
  for (const u of report.unresolved.slice(0, 20)) {
    console.log(`  ${u.total.toFixed(2).padStart(11)} ₪  x${String(u.count).padEnd(3)} ${u.merchant}`);
  }
} else {
  console.log(`\n${G}הכל סווג.${O}`);
}

// ─────────── 3. שכבת ה-AI ───────────

if (useAi) {
  const ai = await withUser(userId, (db) =>
    classifyWithAi(db, userId, { dryRun: !write })
  );
  console.log(`\nAI · מסווג: ${ai.classifier}`);
  if (ai.classifier === "none") {
    console.log(`  ${D}אין ספק מוגדר. PLUX_AI_PROVIDER=mock לבדיקת הצינור.${O}`);
  } else {
    console.log(`  מועמדים ${ai.candidates} · דולגו כלא-ניתנים-להסקה ${ai.skippedUninferable}`);
    console.log(`  התקבלו ${ai.accepted} · נדחו על ביטחון נמוך ${ai.rejectedLowConfidence}`);
    console.log(`  שורות שעודכנו: ${ai.rowsUpdated}`);
    for (const d of ai.decisions.filter((x) => x.slug).slice(0, 15)) {
      console.log(`    ${D}${d.confidence.toFixed(2)}${O}  ${d.merchant} → ${d.slug}`);
    }
  }
}

// ─────────── 4. הכיסוי הכולל ───────────
// זה המספר שמעניין. הוא נמדד מול כל התנועות ולא מול מה שנסרק כרגע.

const cov = await withUser(userId, (db) => coverage(db, userId));
const covPct = cov.total ? ((cov.classified / cov.total) * 100).toFixed(1) : "0.0";
console.log(`\n${G}כיסוי כולל:${O} ${cov.classified}/${cov.total} (${covPct}% מכלל התנועות)`);
if (cov.byUser) console.log(`  ${D}מתוכן ${cov.byUser} סווגו ידנית${O}`);
if (cov.byAi) console.log(`  ${D}מתוכן ${cov.byAi} סווגו על ידי מודל${O}`);

if (!write) console.log(`\n${D}שום דבר לא נכתב. הוסף --write.${O}`);

process.exit(0);
