/**
 * יעדי חיסכון משורת הפקודה. שלב 8.
 *
 *   npx tsx scripts\savings-check.mts --user <id>
 *
 * << כמו spend.mts: קודם למסך. רואים את המספרים והריאליות לפני
 *    שמשקיעים בטופס, והסקריפט נשאר שימושי גם אחרי שהמסך קיים.
 *    אין כאן חישוב — רק טעינה, קריאה למנוע, והדפסה.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";
import { formatILS } from "../lib/analytics/money";
import { assessRealism, goalStatus } from "../lib/savings/engine";
import { avgMonthlyNet, listGoals } from "../lib/savings/store";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m", D = "\x1b[2m", O = "\x1b[0m";
const money = (a: number) => formatILS(a);

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

const { goals, net } = await withUser(userId, async (db) => ({
  goals: await listGoals(db, userId),
  net: await avgMonthlyNet(db, userId),
}));

console.log(`\n${B}יעדי חיסכון${O}  ${D}(${goals.length})${O}`);
console.log(
  net === null
    ? `${D}נטו חודשי ממוצע: אין עדיין מספיק חודשים${O}`
    : `${D}נטו חודשי ממוצע (עד 3 חודשים מלאים אחרונים): ${money(net)}${O}`
);

if (goals.length === 0) {
  console.log(`${D}אין יעדים.${O}\n`);
} else {
  const asOf = new Date();
  console.log("─".repeat(60));
  for (const g of goals) {
    const status = goalStatus(g, asOf);
    const realism = assessRealism(status.requiredMonthly, net);
    const tone =
      realism === "unrealistic" ? R : realism === "tight" ? Y : realism === "comfortable" ? G : D;

    console.log(`${B}${g.name}${O}`);
    console.log(
      `  ${money(g.saved)} / ${money(g.target)}  ${D}(${status.pct.toFixed(1)}%)${O}`
    );
    if (status.achieved) {
      console.log(`  ${G}היעד הושג${O}`);
    } else {
      console.log(
        `  נדרש ${money(status.requiredMonthly)}/חודש · ${status.monthsLeft} חודשים` +
          (status.overdue ? `  ${R}(התאריך עבר)${O}` : "")
      );
      console.log(`  ${tone}ריאליות: ${realism}${O}`);
    }
    console.log("─".repeat(60));
  }
  console.log();
}

await prisma.$disconnect();
process.exit(0);
