/**
 * מייבא קובץ דוח מהדיסק אל המסד, תחת זהות משתמש.
 *
 *   npx tsx scripts/import-file.mts --user <clerk-user-id> <קובץ...>
 *   npx tsx scripts/import-file.mts --dry <קובץ...>
 *
 * --dry מפענח ומדפיס בלי לכתוב כלום. שימושי לבדוק קובץ חדש לפני
 * שנוגעים במסד, ולהפריד בין "הפרסר טועה" ל"הכתיבה נכשלת".
 *
 * הסקריפט הזה מקדים את מסך ההעלאה בכוונה: הוא מפעיל בדיוק את אותו נתיב
 * קוד שה-API יפעיל, בלי דפדפן ובלי העלאת קבצים. אם משהו נשבר, ברור
 * שהוא בשכבת הנתונים ולא בממשק.
 */

import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";
import "dotenv/config";
import { inlinePath } from "../lib/storage/paths";
import { parseStatement, isReconciled, UnsupportedFileError } from "../lib/parsers";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", O = "\x1b[0m";

const argv = process.argv.slice(2);
const dry = argv.includes("--dry");
const userIdx = argv.indexOf("--user");
const userId = userIdx === -1 ? null : argv[userIdx + 1];
const files = argv.filter((a, i) =>
  !a.startsWith("--") && i !== userIdx + 1
);

if (files.length === 0 || (!dry && !userId)) {
  console.error(
    "שימוש:\n" +
    "  npx tsx scripts/import-file.mts --user <clerk-user-id> <קובץ...>\n" +
    "  npx tsx scripts/import-file.mts --dry <קובץ...>\n\n" +
    "את מזהה המשתמש אפשר להעתיק מ-Clerk Dashboard → Users → המשתמש → User ID"
  );
  process.exit(2);
}

const money = (n: number) => (n / 100).toLocaleString("he-IL", { minimumFractionDigits: 2 });

let failed = 0;

for (const file of files) {
  console.log("\n" + "─".repeat(64));
  console.log(basename(file) + `  ${D}(${(statSync(file).size / 1024).toFixed(0)} KB)${O}`);

  let result;
  try {
    result = await parseStatement({ name: basename(file), bytes: new Uint8Array(readFileSync(file)) });
  } catch (e) {
    failed++;
    console.log(`  ${R}FAIL${O}  ${e instanceof UnsupportedFileError ? e.message : String(e)}`);
    continue;
  }

  console.log(
    `  ${result.provider} · ${result.accountLabel}` +
    `${result.accountLast4 ? ` (****${result.accountLast4})` : ""}` +
    `   תקופה: ${result.statementPeriod ?? "?"}   תנועות: ${result.transactions.length}`
  );

  for (const c of result.checks) {
    if (!c.ok) failed++;
    console.log(`    ${c.ok ? `${G}PASS${O}` : `${R}FAIL${O}`}  ${c.label}: ${c.actual} (ציפינו ${c.expected})`);
  }
  for (const w of result.warnings) console.log(`    ${Y}•${O} ${w}`);

  if (dry) {
    const spend = result.transactions.filter((t) => t.countsAsSpending);
    const sum = spend.reduce((s, t) => s + Math.round(Number(t.amount) * 100), 0);
    console.log(`  ${D}יבש — לא נכתב כלום. נספר כהוצאה: ${spend.length} בסך ${money(sum)}${O}`);
    continue;
  }

  // << אימות שנכשל אינו עוצר את הייבוא, אבל כן מסומן במסד. עדיף נתונים
  //    עם דגל אזהרה מאשר דלת סגורה שמסתירה מה קרה.
  if (!isReconciled(result)) {
    console.log(`  ${Y}אימות נכשל — הנתונים ייכתבו ויסומנו reconciled=false${O}`);
  }

  const { ingestStatement } = await import("../lib/import/ingest");
  const summary = await ingestStatement(userId!, result, {
    fileName: basename(file),
    storagePath: inlinePath(file),
  });

  console.log(
    `  ${G}נכתב${O}  חדשות: ${summary.rowsInserted}   כפילויות שדולגו: ${summary.rowsDuplicate}` +
    `   reconciled: ${summary.reconciled}`
  );
  console.log(`  ${D}ImportJob ${summary.importJobId}${O}`);
}

if (!dry) {
  const { prisma } = await import("../lib/db/client");
  await prisma.$disconnect();
}

console.log("\n" + (failed === 0 ? `${G}הושלם.${O}` : `${R}${failed} כשלים.${O}`) + "\n");
process.exitCode = failed === 0 ? 0 : 1;
