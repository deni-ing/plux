/**
 * בדיקת שפיות לשלב 5 — האנליטיקה.
 *
 *   npx tsx scripts/analytics-check.mts --user <id>
 *
 * << מקביל ל-`classify-check.mts` של שלב 4 ול-`checkup.mts` הכללי.
 *    ‏`npm test` בודק את המנוע מול נתונים סינתטיים שהתשובה שלהם ידועה;
 *    הקובץ הזה בודק את **הנתונים שלך** מול אי-שוויונות שחייבים להתקיים.
 *    שתי שאלות שונות: הראשונה "האם החישוב נכון", השנייה "האם מה שיושב
 *    במסד עקבי עם עצמו ועם הקוד שרץ עכשיו".
 *
 * הבדיקה החשובה כאן היא **טריות הסנפשוט**: הסקריפט מחשב כל חודש מחדש
 * בזיכרון ומשווה למה ששמור. שני המספרים חייבים להיות זהים לחלוטין.
 * אם הם נפרדו, המסד מחזיק תשובה שהקוד כבר לא מייצר — וזה הכישלון
 * היחיד של מטמון, והוא שקט לגמרי.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";
import { formatILS } from "../lib/analytics/money";
import { monthOf, monthPeriod, previousMonth, type Period } from "../lib/analytics/period";
import { categoryNames, loadRange } from "../lib/analytics/load";
import { computeMonth, readSnapshot } from "../lib/analytics/recompute";
import { SNAPSHOT_VERSION, type SnapshotFacts } from "../lib/analytics/snapshot";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m", D = "\x1b[2m", O = "\x1b[0m";

const args = process.argv.slice(2);
const userId = args[args.indexOf("--user") + 1];
if (!userId || userId.startsWith("--")) {
  console.error("חסר --user <clerk-user-id>");
  process.exit(1);
}

let pass = 0, warn = 0, fail = 0;

function ok(label: string, detail = "") {
  pass++;
  console.log(`  ${G}✓${O} ${label}${detail ? ` ${D}${detail}${O}` : ""}`);
}
function bad(label: string, detail = "") {
  fail++;
  console.log(`  ${R}✗${O} ${label}${detail ? ` ${R}${detail}${O}` : ""}`);
}
function meh(label: string, detail = "") {
  warn++;
  console.log(`  ${Y}!${O} ${label}${detail ? ` ${Y}${detail}${O}` : ""}`);
}
function section(title: string) {
  console.log(`\n${B}${title}${O}`);
}

// ─────────────────────────── טעינה ───────────────────────────

const bounds = await withUser(userId, async (db) => {
  const [first, last] = await Promise.all([
    db.transaction.findFirst({ where: { userId }, orderBy: { bookedAt: "asc" }, select: { bookedAt: true } }),
    db.transaction.findFirst({ where: { userId }, orderBy: { bookedAt: "desc" }, select: { bookedAt: true } }),
  ]);
  return first && last ? { first: first.bookedAt, last: last.bookedAt } : null;
});

if (!bounds) {
  console.error("אין תנועות למשתמש הזה.");
  await prisma.$disconnect();
  process.exit(1);
}

const months: Period[] = [];
{
  const start = monthOf(bounds.first);
  const end = monthOf(bounds.last);
  let y = start.from.getUTCFullYear();
  let m = start.from.getUTCMonth() + 1;
  for (let guard = 0; guard < 600; guard++) {
    const p = monthPeriod(y, m);
    months.push(p);
    if (p.key === end.key) break;
    if (++m > 12) { m = 1; y++; }
  }
}

const { txns, names, stored } = await withUser(userId, async (db) => ({
  txns: await loadRange(db, userId, previousMonth(months[0]).from, months[months.length - 1].to),
  names: await categoryNames(db, userId),
  stored: await Promise.all(months.map((p) => readSnapshot(db, userId, p))),
}));

console.log(`\n${B}בדיקת אנליטיקה${O}  ${D}${months.length} חודשים · ${txns.length} תנועות נטענו${O}`);
console.log("═".repeat(56));

// ─────────────────────────── 1. סנפשוטים ───────────────────────────

section("1 · סנפשוטים");

const missing = months.filter((_, i) => stored[i] === null);
if (missing.length === 0) ok(`לכל ${months.length} החודשים יש סנפשוט תקף`);
else meh(`${missing.length} חודשים בלי סנפשוט תקף`, missing.map((p) => p.key).join(", ") + " — הרץ snapshot.mts");

const versions = new Set(stored.filter((s): s is SnapshotFacts => s !== null).map((s) => s.version));
if (versions.size === 0) meh("אין סנפשוט לבדוק גרסה");
else if (versions.size === 1 && versions.has(SNAPSHOT_VERSION)) ok(`כולם בגרסה ${SNAPSHOT_VERSION}`);
else bad("גרסאות מעורבות", [...versions].join(", "));

/**
 * השוואה שאינה תלויה בסדר המפתחות.
 *
 * << `JSON.stringify` אינו מבחן שוויון. הוא מייצר מחרוזת שסדר המפתחות
 *    בה משמעותי, והמשמעות של האובייקט אינה תלויה בו. Postgres שומר
 *    ‏`jsonb` בצורה מנורמלת ומחזיר את המפתחות בסדר משלו — לפי אורך
 *    ואז אלפביתית — ולכן סנפשוט שנקרא מהמסד לעולם לא יהיה זהה
 *    כמחרוזת לאותו אובייקט שנוצר בזיכרון, גם כשכל ערך בו זהה.
 *
 *    הגרסה הראשונה שלי כאן דיווחה על 13 סנפשוטים "לא תואמים" בזמן
 *    שהסכומים המודפסים לידם היו זהים בדיוק. **בדיקה שנכשלת ומדפיסה
 *    שני מספרים זהים מצביעה על עצמה, לא על הנתונים.**
 */
function canonical(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = canonical((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

let stale = 0;
for (let i = 0; i < months.length; i++) {
  const s = stored[i];
  if (!s) continue;
  const fresh = JSON.parse(JSON.stringify(computeMonth(txns, months[i], { names }))) as SnapshotFacts;
  if (JSON.stringify(canonical(fresh)) !== JSON.stringify(canonical(s))) {
    stale++;
    if (stale <= 3) {
      console.log(`  ${D}${months[i].key}: שמור ${formatILS(s.totals.expense)} · מחושב עכשיו ${formatILS(fresh.totals.expense)}${O}`);
    }
  }
}
if (stale === 0) ok("כל סנפשוט זהה לחישוב מחדש", "המטמון טרי");
else bad(`${stale} סנפשוטים אינם תואמים לחישוב מחדש`, "הרץ snapshot.mts --force");

// ─────────────────────── 2. שלמות פנימית ───────────────────────

section("2 · שלמות פנימית של כל סנפשוט");

let sumErr = 0, childErr = 0, netErr = 0, intErr = 0, dateErr = 0;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

for (const s of stored) {
  if (!s) continue;

  const catSum = s.categories.reduce((t, c) => t + c.total, 0);
  if (catSum !== s.totals.expense) {
    sumErr++;
    console.log(`  ${D}${s.period.key}: קטגוריות ${catSum} · הוצאה ${s.totals.expense}${O}`);
  }

  for (const c of s.categories) {
    if (c.children.length === 0) continue;
    const kids = c.children.reduce((t, k) => t + k.total, 0);
    if (kids !== c.total) childErr++;
  }

  if (s.totals.net !== s.totals.income - s.totals.expense) netErr++;

  const nums = [
    s.totals.expense, s.totals.income, s.totals.net, s.fees.total,
    ...s.categories.flatMap((c) => [c.total, ...c.children.map((k) => k.total)]),
    ...s.recurring.map((r) => r.annualized),
  ];
  if (nums.some((n) => !Number.isInteger(n))) intErr++;

  const dates = [s.period.from, s.period.to, ...s.recurring.map((r) => r.nextDueAt)];
  if (s.period.lastDataAt) dates.push(s.period.lastDataAt);
  if (dates.some((d) => !DATE.test(d))) dateErr++;
}

if (sumErr === 0) ok("סכום הקטגוריות שווה בדיוק לסך ההוצאה");
else bad(`${sumErr} חודשים לא מסתכמים`);

if (childErr === 0) ok("תת־קטגוריות מסתכמות לקטגוריית האם");
else bad(`${childErr} קטגוריות לא מסתכמות`);

if (netErr === 0) ok("נטו = הכנסה − הוצאה");
else bad(`${netErr} חודשים עם נטו שגוי`);

if (intErr === 0) ok("כל סכום שמור הוא אגורות שלמות");
else bad(`${intErr} חודשים עם מספר לא שלם`, "נקודה צפה דלפה פנימה");

if (dateErr === 0) ok("כל תאריך שמור בצורת YYYY-MM-DD");
else bad(`${dateErr} חודשים עם תאריך בצורה אחרת`);

// ─────────────────────── 3. משמעות ───────────────────────

section("3 · משמעות המספרים");

const partials = stored.filter((s): s is SnapshotFacts => s !== null && s.period.partial);
if (partials.length === 0) ok("אין חודש חלקי");
else {
  ok(`${partials.length} חודשים חלקיים מסומנים ככאלה`, partials.map((s) => `${s.period.key} עד ${s.period.lastDataAt}`).join(", "));
  const unaligned = partials.filter((s) => s.comparison && !s.comparison.aligned);
  if (unaligned.length === 0) ok("ההשוואה בחודש חלקי מיושרת לאותו מספר ימים");
  else bad(`${unaligned.length} חודשים חלקיים מושווים לחודש מלא`, unaligned.map((s) => s.period.key).join(", "));
}

const last = stored[stored.length - 1];
if (last) {
  const c = last.classification;
  if (c.amountPct >= 99) ok(`${last.period.label}: סווגו ${c.amountPct}% מהשקלים`);
  else if (c.amountPct >= 90) meh(`${last.period.label}: סווגו ${c.amountPct}% מהשקלים`, `${formatILS(c.unclassifiedAmount)} לא מסווגים`);
  else bad(`${last.period.label}: רק ${c.amountPct}% מהשקלים סווגו`, `${formatILS(c.unclassifiedAmount)} ב-${c.unclassifiedCount} תנועות`);

  if (c.countPct - c.amountPct > 10) {
    meh("פער בין כיסוי בתנועות לכיסוי בשקלים", `${c.countPct}% מול ${c.amountPct}% — תנועה גדולה לא סווגה`);
  } else {
    ok("כיסוי בתנועות ובשקלים קרובים זה לזה");
  }
}

// ─────────────────────── 4. חיובים חוזרים ───────────────────────

section("4 · חיובים חוזרים");

const charges = last?.recurring ?? [];
if (charges.length === 0) {
  meh("לא זוהה אף חיוב חוזר");
} else {
  ok(`${charges.length} חיובים חוזרים`);

  const declared = charges.filter((c) => c.kind === "subscription");
  const guessed = charges.filter((c) => c.kind !== "subscription");
  console.log(`  ${D}${declared.length} בהצהרת ספק · ${guessed.length} לפי דפוס בלבד${O}`);

  const perYear: Record<string, number> = { weekly: 52, monthly: 12, quarterly: 4, yearly: 1, irregular: 0 };
  const wrong = charges.filter((c) => c.annualized !== c.amount * (perYear[c.cadence] ?? 0));
  if (wrong.length === 0) ok("ההשלכה השנתית עקבית עם הקצב");
  else bad(`${wrong.length} חיובים עם השלכה שנתית לא עקבית`);

  const badConf = charges.filter((c) => c.confidence < 0 || c.confidence > 1);
  if (badConf.length === 0) ok("ביטחון בטווח 0..1");
  else bad(`${badConf.length} ערכי ביטחון מחוץ לטווח`);

  // חיוב שמסומן כמנוי חייב להיות מוצהר. אחרת ניחוש הוצג כעובדה.
  const overclaimed = declared.filter((c) => c.confidence < 1);
  if (overclaimed.length === 0) ok('רק חיוב מוצהר מסומן כ"מנוי"');
  else bad(`${overclaimed.length} חיובים מסומנים כמנוי בלי הצהרה`);

  const top = charges.slice(0, 3);
  for (const c of top) {
    const tag = c.kind === "subscription" ? `${G}מנוי${O}` : `${D}דפוס ${Math.round(c.confidence * 100)}%${O}`;
    console.log(`  ${D}·${O} ${c.merchant} ${formatILS(c.amount)}/${c.cadence} ${tag}`);
  }
}

// ─────────────────────── 5. תחזית ───────────────────────

section("5 · תחזית");

const fc = last?.forecast ?? null;
if (!fc) meh("אין תחזית בסנפשוט האחרון");
else {
  if (fc.floor <= fc.expected && fc.expected <= fc.ceiling) ok("רצפה ≤ צפוי ≤ תקרה");
  else bad("הטווח אינו מסודר", `${fc.floor} / ${fc.expected} / ${fc.ceiling}`);

  // הרצפה היא עובדה ‎+‎ ידוע. היא לא יכולה להיות קטנה ממה שכבר יצא.
  if (fc.floor >= fc.spent) ok("הרצפה אינה קטנה ממה שכבר יצא");
  else bad("הרצפה קטנה מההוצאה בפועל", "זה בלתי אפשרי");

  if (fc.assumptions.length > 0) ok(`${fc.assumptions.length} הנחות נשמרו עם המספרים`);
  else bad("תחזית בלי הנחות", "מספר בלי הקשר");

  if (fc.daysRemaining === 0) {
    ok("החודש הסתיים — התחזית היא ההוצאה בפועל");
  } else {
    console.log(`  ${D}רצפה ${formatILS(fc.floor)} · צפוי ${formatILS(fc.expected)} · תקרה ${formatILS(fc.ceiling)} · ביטחון ${fc.confidence}${O}`);
    if (fc.upcoming.length) {
      console.log(`  ${D}${fc.upcoming.length} חיובים ידועים שעוד צפויים${O}`);
    }
  }
}

// ─────────────────────── 6. עמלות ───────────────────────

section("6 · עמלות");

if (!last) meh("אין חודש אחרון לבדוק");
else if (last.fees.count === 0) ok("אין עמלות בחודש האחרון");
else {
  ok(`${last.fees.count} עמלות`, `${formatILS(last.fees.total)} · ${last.fees.shareOfExpense}% מההוצאה`);
  if (last.fees.total <= last.totals.expense) ok("סך העמלות אינו עולה על סך ההוצאה");
  else bad("סך העמלות גדול מסך ההוצאה", "זה בלתי אפשרי");
}

// ─────────────────────── סיכום ───────────────────────

console.log("\n" + "═".repeat(56));
console.log(
  `${G}${pass} עברו${O} · ${warn ? Y : D}${warn} אזהרות${O} · ${fail ? R : D}${fail} נכשלו${O}`
);
if (fail === 0 && warn === 0) console.log(`${G}${B}הכל ירוק.${O}`);
else if (fail === 0) console.log(`${Y}אין כשלים. האזהרות הן החלטות פתוחות, לא באגים.${O}`);
else console.log(`${R}${B}יש מה לתקן.${O}`);
console.log();

await prisma.$disconnect();
process.exit(fail === 0 ? 0 : 1);
