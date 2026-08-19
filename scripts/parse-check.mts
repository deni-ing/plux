/**
 * מריץ את הפרסר על קובצי MAX אמיתיים ומדפיס מה יצא.
 *
 *   npx tsx scripts/parse-check.mts <קובץ> [קובץ...]
 *
 * הבדיקה המרכזית אינה "האם הקוד רץ בלי לזרוק שגיאה", אלא **האם הסכום
 * שחישבנו שווה לסכום ש-MAX הצהירה עליו בתחתית הגיליון**. שורה שנקראה
 * לא נכון, שורה שדולגה או סכום שנקטע — כולם מזיזים את הסכום, וייתפסו כאן.
 * קוד יציאה 1 אם אימות כלשהו נכשל.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseMaxXlsx, type ParsedTxn } from "../lib/parsers/max";

const GREEN = "\x1b[32m", RED = "\x1b[31m", DIM = "\x1b[2m", OFF = "\x1b[0m";

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("שימוש: npx tsx scripts/parse-check.mts <קובץ.xlsx> [...]");
  process.exit(2);
}

function ils(minorSum: number): string {
  const sign = minorSum < 0 ? "-" : "";
  const a = Math.abs(minorSum);
  const whole = String(Math.floor(a / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${whole}.${String(a % 100).padStart(2, "0")}`;
}

function minor(t: ParsedTxn): number {
  return Math.round(Number(t.amount) * 100);
}

let failed = 0;

for (const file of files) {
  const result = parseMaxXlsx(readFileSync(file));

  console.log("\n" + "─".repeat(64));
  console.log(basename(file));
  console.log(
    `  כרטיס: ${result.accountLabel} (${result.cardLast4 ?? "?"})` +
    `   תקופה: ${result.statementPeriod ?? "?"}` +
    `   תנועות: ${result.transactions.length}`
  );

  console.log("\n  אימות מול הסכום המוצהר");
  for (const c of result.checks) {
    if (!c.ok) failed++;
    const mark = c.ok ? `${GREEN}PASS${OFF}` : `${RED}FAIL${OFF}`;
    console.log(`    ${mark}  ${c.label}: מוצהר ${c.expected}, חושב ${c.actual}`);
  }

  if (result.warnings.length) {
    console.log("\n  אזהרות");
    for (const w of result.warnings) console.log(`    • ${w}`);
  }

  // פילוח לפי סוג — מראה בעין אם הסיווג התפקשש.
  console.log("\n  פילוח לפי סוג");
  const byKind = new Map<string, { n: number; sum: number }>();
  for (const t of result.transactions) {
    const e = byKind.get(t.kind) ?? { n: 0, sum: 0 };
    e.n++; e.sum += minor(t);
    byKind.set(t.kind, e);
  }
  for (const [kind, e] of [...byKind].sort((a, b) => a[1].sum - b[1].sum)) {
    console.log(`    ${kind.padEnd(16)} ${String(e.n).padStart(3)}  ${ils(e.sum).padStart(12)}`);
  }

  const pending = result.transactions.filter((t) => t.status === "PENDING");
  if (pending.length) {
    console.log(`    ${DIM}מתוכן ממתינות (טרם נקלטו): ${pending.length}${OFF}`);
  }

  const spending = result.transactions.filter((t) => t.countsAsSpending);
  const excluded = result.transactions.filter((t) => !t.countsAsSpending);
  console.log(
    `\n  נספר כהוצאה: ${spending.length} (${ils(spending.reduce((s, t) => s + minor(t), 0))})` +
    `   הוחרג: ${excluded.length} (${ils(excluded.reduce((s, t) => s + minor(t), 0))})`
  );

  const repeats = result.transactions.filter((t) => t.occurrence > 0);
  if (repeats.length) {
    console.log(`\n  ${DIM}תנועות זהות באותו יום (נשמרו בנפרד, לא נמחקו):${OFF}`);
    for (const t of repeats) console.log(`    ${t.bookedAt}  ${t.merchant}  ${t.amount}  #${t.occurrence}`);
  }

  console.log(`\n  ${DIM}דוגמה:${OFF}`);
  for (const t of result.transactions.slice(0, 2)) {
    console.log("    " + JSON.stringify({
      bookedAt: t.bookedAt, merchant: t.merchant, amount: t.amount,
      kind: t.kind, status: t.status, countsAsSpending: t.countsAsSpending,
    }));
  }
}

console.log(
  "\n" + (failed === 0
    ? `${GREEN}כל האימותים עברו.${OFF}\n`
    : `${RED}${failed} אימותים נכשלו.${OFF}\n`)
);
process.exitCode = failed === 0 ? 0 : 1;
