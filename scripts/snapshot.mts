/**
 * חישוב ושמירה של סנפשוטים. סעיף 5.7.
 *
 *   npx tsx scripts/snapshot.mts --user <id>            # מחשב מה שחסר
 *   npx tsx scripts/snapshot.mts --user <id> --force    # מחשב הכל מחדש
 *   npx tsx scripts/snapshot.mts --user <id> --show 2026-08
 *
 * << `--force` קיים כי סנפשוט הוא מטמון, ולמטמון צריך תמיד להיות כפתור
 *    שמבטל אותו. בלעדיו הדרך היחידה לתקן ערך שנשמר שגוי היא למחוק
 *    שורות ביד מהמסד.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";
import { formatILS } from "../lib/analytics/money";
import { monthPeriod } from "../lib/analytics/period";
import { readSnapshot, recomputeSnapshots } from "../lib/analytics/recompute";

const G = "\x1b[32m", Y = "\x1b[33m", B = "\x1b[1m", D = "\x1b[2m", O = "\x1b[0m";

const args = process.argv.slice(2);
const val = (flag: string) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const userId = val("--user");
if (!userId || userId.startsWith("--")) {
  console.error("חסר --user <clerk-user-id>");
  process.exit(1);
}

const show = val("--show");

if (show) {
  const m = /^(\d{4})-(\d{2})$/.exec(show);
  if (!m) {
    console.error("‏--show בפורמט YYYY-MM");
    process.exit(1);
  }
  const period = monthPeriod(Number(m[1]), Number(m[2]));
  const facts = await withUser(userId, (db) => readSnapshot(db, userId, period));
  if (!facts) {
    console.log(`${Y}אין סנפשוט תקף ל-${period.label}. הרץ בלי --show כדי לחשב.${O}`);
  } else {
    console.log(JSON.stringify(facts, null, 2));
  }
  await prisma.$disconnect();
  process.exit(0);
}

const report = await withUser(userId, (db) =>
  recomputeSnapshots(db, userId, { force: args.includes("--force") })
);

console.log(`\n${B}סנפשוטים${O}`);
console.log("─".repeat(52));
if (report.months.length === 0) {
  console.log(`${Y}אין תנועות למשתמש הזה.${O}`);
} else {
  console.log(`${report.months.length} חודשים בטווח: ${report.months.join(", ")}`);
  console.log(`${G}${report.written.length} נכתבו${O}${report.written.length ? `: ${report.written.join(", ")}` : ""}`);
  if (report.skipped.length) {
    console.log(`${D}${report.skipped.length} כבר עדכניים: ${report.skipped.join(", ")}${O}`);
  }
}

// הצצה מהירה לחודש האחרון, כדי שהריצה תראה משהו ולא רק תדווח על עצמה.
const last = report.months.at(-1);
if (last) {
  const [y, mm] = last.split("-").map(Number);
  const facts = await withUser(userId, (db) => readSnapshot(db, userId, monthPeriod(y, mm)));
  if (facts) {
    console.log(`\n${B}${facts.period.label}${O}`);
    console.log(
      `  הוצאה ${formatILS(facts.totals.expense)} · הכנסה ${formatILS(facts.totals.income)} · נטו ${formatILS(facts.totals.net)}`
    );
    console.log(
      `  ${D}${facts.categories.length} קטגוריות · ${facts.recurring.length} חיובים חוזרים · סווגו ${facts.classification.amountPct}% מהשקלים${O}`
    );
    if (facts.period.partial) {
      console.log(`  ${Y}חודש חלקי — נתונים עד ${facts.period.lastDataAt}${O}`);
    }
  }
}

console.log();
await prisma.$disconnect();
process.exit(0);
