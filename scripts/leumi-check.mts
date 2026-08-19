/**
 * מריץ את פרסר לאומי על דף חשבון ומדפיס מה יצא.
 *
 *   npx tsx scripts/leumi-check.mts <קובץ.pdf>
 *   npx tsx scripts/leumi-check.mts --text <קובץ.txt>
 *
 * מצב --text מקבל טקסט שכבר חולץ, ומאפשר לבדוק את הלוגיקה בלי ספריית
 * ה-PDF. שימושי כדי להפריד בין "הפרסר טועה" ל"חילוץ הטקסט טועה".
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { parseLeumiLines } from "../lib/parsers/leumi";

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", O = "\x1b[0m";

const args = process.argv.slice(2);
const textMode = args[0] === "--text";
const file = textMode ? args[1] : args[0];

if (!file) {
  console.error("שימוש: npx tsx scripts/leumi-check.mts <קובץ.pdf>  |  --text <קובץ.txt>");
  process.exit(2);
}

const lines = textMode
  ? readFileSync(file, "utf8").split(/\r?\n/)
  : await (await import("../lib/parsers/pdf-text")).extractPdfLines(
      new Uint8Array(readFileSync(file))
    );

console.log(`\n${basename(file)}  ${D}(${lines.length} שורות טקסט)${O}`);

const r = parseLeumiLines(lines);

console.log(
  `  חשבון: ****${r.accountLast4 ?? "?"}   תקופה: ${r.statementPeriod ?? "?"}   תנועות: ${r.transactions.length}\n`
);

let failed = 0;
console.log("  אימות");
for (const c of r.checks) {
  if (!c.ok) failed++;
  console.log(`    ${c.ok ? `${G}PASS${O}` : `${R}FAIL${O}`}  ${c.label}: ${c.actual} (ציפינו ${c.expected})`);
}

if (r.warnings.length) {
  console.log("\n  אזהרות");
  for (const w of r.warnings) console.log(`    • ${w}`);
}

const byKind = new Map<string, { n: number; sum: number }>();
for (const t of r.transactions) {
  const e = byKind.get(t.kind) ?? { n: 0, sum: 0 };
  e.n++; e.sum += Math.round(Number(t.amount) * 100);
  byKind.set(t.kind, e);
}

console.log("\n  פילוח לפי סוג");
for (const [kind, e] of [...byKind].sort((a, b) => a[1].sum - b[1].sum)) {
  const v = (e.sum / 100).toLocaleString("he-IL", { minimumFractionDigits: 2 });
  console.log(`    ${kind.padEnd(16)} ${String(e.n).padStart(3)}  ${v.padStart(13)}`);
}

const settle = r.transactions.filter((t) => t.kind === "CARD_SETTLEMENT");
const settleSum = settle.reduce((s, t) => s + Math.round(Number(t.amount) * 100), 0);
console.log(
  `\n  ${D}מתוכן חיובי אשראי מרוכזים: ${settle.length} בסך ` +
  `${(settleSum / 100).toLocaleString("he-IL", { minimumFractionDigits: 2 })} — ` +
  `מוחרגים מהוצאות כדי לא לספור פעמיים את מה שכבר בא מ-MAX${O}`
);

console.log(
  "\n" + (failed === 0 ? `${G}כל האימותים עברו.${O}` : `${R}${failed} אימותים נכשלו.${O}`) + "\n"
);
process.exitCode = failed === 0 ? 0 : 1;
