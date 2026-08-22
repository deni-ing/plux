/**
 * דוח ההוצאות. שלב 5 בשורת פקודה.
 *
 *   npx tsx scripts/spend.mts --user <id>                      # החודש האחרון שיש בו נתונים
 *   npx tsx scripts/spend.mts --user <id> --month 2026-08
 *   npx tsx scripts/spend.mts --user <id> --basis charged      # לפי תאריך חיוב
 *   npx tsx scripts/spend.mts --user <id> --months 5           # חלון לעמלות חוזרות
 *   npx tsx scripts/spend.mts --user <id> --json               # פלט לצריכה, לא לקריאה
 *
 * << כמו decide.mts: הסקריפט קודם למסך. אפשר לראות את המספרים ולוודא
 *    שהם נכונים לפני שמשקיעים בגרפים, והוא יישאר שימושי גם אחר כך.
 *
 * << אין כאן חישוב. כל שורה כאן היא טעינה, קריאה למנוע, או הדפסה.
 *    ברגע שסקריפט מתחיל לחשב, מופיעה גרסה שנייה של האמת.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";
import { formatILS } from "../lib/analytics/money";
import {
  firstDays,
  isoDay,
  monthPeriod,
  monthsBack,
  previousMonth,
  type Basis,
  type Period,
} from "../lib/analytics/period";
import { breakdownByCategory, compareBreakdowns } from "../lib/analytics/spend";
import { feeReport, recurringFees } from "../lib/analytics/fees";
import { findRecurring, stoppedCharges, worthReviewing } from "../lib/analytics/recurring";
import { categoryNames, loadMonths } from "../lib/analytics/load";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m", D = "\x1b[2m", O = "\x1b[0m";

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

const basis: Basis = val("--basis") === "charged" ? "charged" : "booked";
const windowMonths = Number(val("--months") ?? 6);
const asJson = args.includes("--json");

// ─── איזה חודש ───

let period: Period;
const monthArg = val("--month");
if (monthArg) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthArg);
  if (!m) {
    console.error("‏--month בפורמט YYYY-MM");
    process.exit(1);
  }
  period = monthPeriod(Number(m[1]), Number(m[2]));
} else {
  // << לא new Date(). "החודש הזה" בסקריפט על נתונים היסטוריים הוא כמעט
  //    תמיד חודש ריק. החודש הנבחר הוא זה שיש בו תנועות.
  const last = await withUser(userId, (db) =>
    db.transaction.findFirst({
      where: { userId },
      orderBy: { bookedAt: "desc" },
      select: { bookedAt: true },
    })
  );
  if (!last) {
    console.error("אין תנועות למשתמש הזה.");
    process.exit(1);
  }
  period = monthPeriod(last.bookedAt.getUTCFullYear(), last.bookedAt.getUTCMonth() + 1);
}

// ─── טעינה אחת לכל החלון ───

const months = monthsBack(period.from, windowMonths);

const { txns, names } = await withUser(userId, async (db) => ({
  txns: await loadMonths(db, userId, months),
  names: await categoryNames(db, userId),
}));

const current = breakdownByCategory(txns, period, { basis, names });

// << ההשוואה נעשית מול אותו מספר ימים. `--full-previous` מבטל את
//    היישור אם רוצים לראות במפורש חודש חלקי מול חודש שלם.
const prevFull = previousMonth(period);
const prev =
  current.coverage.partial && !args.includes("--full-previous")
    ? firstDays(prevFull, current.coverage.daysCovered)
    : prevFull;

const previous = breakdownByCategory(txns, prev, { basis, names });
const cmp = compareBreakdowns(current, previous);
const fees = feeReport(txns, period, { basis, breakdown: current });
const recurring = recurringFees(txns, months, { basis });

// << asOf נגזר מהנתונים ולא מהשעון: "מתי נגמרו הנתונים" הוא מה שקובע
//    אם חיוב מאחר, לא מתי במקרה הרצנו את הסקריפט.
const asOf = current.coverage.lastDataAt ?? period.to;
const charges = findRecurring(txns, { basis, asOf });
const review = worthReviewing(charges);
const stopped = stoppedCharges(charges);

if (asJson) {
  console.log(JSON.stringify({ current, comparison: cmp, fees, recurring, charges }, null, 2));
  await prisma.$disconnect();
  process.exit(0);
}

// ─── הדפסה ───

const money = (a: number) => formatILS(a).padStart(13);
const sign = (a: number) => (a > 0 ? `${R}▲${O}` : a < 0 ? `${G}▼${O}` : " ");

console.log(`\n${B}${period.label}${O}  ${D}· בסיס ${basis === "booked" ? "תאריך עסקה" : "תאריך חיוב"}${O}`);
console.log("─".repeat(52));

const cov = current.coverage;
if (cov.partial) {
  console.log(
    `${Y}חודש חלקי — נתונים עד ${isoDay(cov.lastDataAt!)} (${cov.daysCovered} מתוך ${cov.daysInPeriod} ימים)${O}`
  );
  console.log(
    cmp.window.aligned
      ? `${D}ההשוואה מול ${cov.daysCovered} הימים הראשונים של ${prevFull.label}${O}`
      : `${R}ההשוואה אינה מיושרת — ${cmp.window.currentDays} ימים מול ${cmp.window.previousDays}${O}`
  );
  console.log("─".repeat(52));
}

console.log(`הכנסות   ${money(current.income)}`);
console.log(`הוצאות   ${money(current.expense)}   ${sign(cmp.expenseDelta)} ${formatILS(cmp.expenseDelta)}`);
console.log(`${B}נטו      ${money(current.net)}${O}`);
console.log(`${D}${current.txnCount} תנועות · ${current.excluded.transfers} העברות הוחרגו (${formatILS(current.excluded.transfersTotal)})${O}`);

const cls = current.classification;
const clsColor = cls.amount.pct < 90 ? Y : G;
console.log(
  `${clsColor}סווגו ${cls.count.pct}% מהתנועות · ${cls.amount.pct}% מהשקלים${O}` +
    (cls.amount.pct < cls.count.pct - 5
      ? `  ${Y}← הפער אומר שתנועה גדולה לא סווגה${O}`
      : "")
);

if (current.fallbackDates > 0) {
  console.log(`${Y}${current.fallbackDates} תנועות בלי תאריך חיוב — נלקח תאריך העסקה${O}`);
}

console.log(`\n${B}לפי קטגוריה${O}`);
console.log("─".repeat(52));
for (const c of current.categories) {
  const d = cmp.categories.find((x) => x.slug === c.slug);
  const delta = d && d.previous !== 0 ? `${sign(d.delta)} ${String(d.deltaPct).padStart(6)}%` : `${D}   חדש${O}`;
  console.log(`${c.name.padEnd(14)} ${money(c.total)}  ${String(c.share).padStart(5)}%  ${delta}`);
  for (const ch of c.children) {
    console.log(`  ${D}${ch.name.padEnd(24)}${O} ${money(ch.total)}  ${D}${ch.count} תנועות${O}`);
  }
}
if (current.unclassified) {
  const u = current.unclassified;
  console.log(`${Y}${u.name.padEnd(14)}${O} ${money(u.total)}  ${String(u.share).padStart(5)}%  ${D}${u.count} תנועות${O}`);
}

if (current.incomeCategories.length) {
  console.log(`\n${B}הכנסות${O}`);
  console.log("─".repeat(52));
  for (const c of current.incomeCategories) {
    for (const ch of c.children) {
      console.log(`${ch.name.padEnd(14)} ${money(ch.total)}  ${D}${ch.count} תנועות${O}`);
    }
  }
}

console.log(`\n${B}מה השתנה הכי הרבה${O}  ${D}(מול ${previous.period.label})${O}`);
if (!cmp.window.aligned) {
  console.log(`${R}אזהרה: ${cmp.window.currentDays} ימים מול ${cmp.window.previousDays} — המספרים כאן אינם ברי־השוואה${O}`);
}
console.log("─".repeat(52));
for (const d of cmp.categories.slice(0, 6)) {
  if (d.delta === 0) continue;
  const pctText = d.deltaPct === null ? "חדש" : `${d.deltaPct}%`;
  console.log(`${sign(d.delta)} ${d.name.padEnd(14)} ${money(d.delta)}  ${D}${pctText}${O}`);
}

console.log(`\n${B}עמלות${O}`);
console.log("─".repeat(52));
if (fees.count === 0) {
  console.log(`${G}אין עמלות בחודש הזה.${O}`);
} else {
  console.log(`${money(fees.total)}  ${D}${fees.shareOfExpense}% מההוצאה · ${fees.count} חיובים${O}`);
  for (const f of fees.byMerchant) {
    console.log(`  ${f.merchant.padEnd(26)} ${money(f.total)}  ${D}${f.count}×${O}`);
  }
}

if (recurring.fees.length) {
  console.log(`\n${B}עמלות חוזרות${O}  ${D}(${recurring.months[0]} — ${recurring.months.at(-1)})${O}`);
  console.log("─".repeat(52));
  for (const f of recurring.fees) {
    const kind = f.fixedAmount ? "קבועה" : "משתנה";
    console.log(
      `${f.merchant.padEnd(26)} ${money(f.monthlyAvg)}/חודש  ${D}${f.monthsSeen}/${f.monthsScanned} חודשים · ${kind}${O}`
    );
    console.log(`  ${Y}${formatILS(f.annualized)} בשנה${O}`);
  }
  console.log(`\n${B}סך הכל בשנה: ${formatILS(recurring.annualizedTotal)}${O}`);
}

if (charges.length) {
  console.log(`\n${B}חיובים חוזרים${O}  ${D}(${months[0].key} — ${months.at(-1)!.key})${O}`);
  console.log("─".repeat(52));
  for (const c of review) {
    const src = c.declaredByProvider ? `${G}הוראת קבע${O}` : `${D}${Math.round(c.confidence * 100)}% ביטחון${O}`;
    console.log(`${c.merchant.padEnd(26)} ${money(c.amount)}  ${D}×${c.occurrences}${O}  ${src}`);

    // << סכום שנתי על חיוב שלא הוצהר הוא השלכה מותנית, לא עובדה.
    //    ניתוח בתשלומים ייגמר; מנוי לא. אותו מספר, שתי משמעויות — ולכן
    //    התנאי נכתב לצד המספר ולא בהערה מתחת. **הערה מסתייגת שמופיעה
    //    אחרי מספר בולט אינה מבטלת אותו.**
    console.log(
      c.declaredByProvider
        ? `  ${Y}${formatILS(c.annualized)} בשנה${O}  ${D}הבא: ${isoDay(c.nextDueAt)}${O}`
        : `  ${D}אם יימשך:${O} ${formatILS(c.annualized)} ${D}בשנה · ${c.occurrences} חיובים עד כה · הבא: ${isoDay(c.nextDueAt)}${O}`
    );
  }
  if (!review.length) console.log(`${D}אין חיוב חוזר מעל ₪500 בשנה.${O}`);

  const unsure = review.filter((c) => !c.declaredByProvider);
  if (unsure.length) {
    console.log(
      `\n${D}${unsure.length} מהם זוהו לפי דפוס בלבד. חיוב חודשי קבוע יכול להיות מנוי${O}`
    );
    console.log(`${D}וגם עסקה שפוצלה לתשלומים — ההבדל אינו בנתון, והוא שלך לקבוע.${O}`);
  }

  if (stopped.length) {
    console.log(`\n${B}הפסיקו להיגבות${O}  ${D}(אין חיוב מעל מחזור וחצי)${O}`);
    console.log("─".repeat(52));
    for (const c of stopped) {
      console.log(`${c.merchant.padEnd(26)} ${money(c.amount)}  ${D}אחרון: ${isoDay(c.lastSeenAt)}${O}`);
    }
  }
}

console.log();
await prisma.$disconnect();
process.exit(0);
