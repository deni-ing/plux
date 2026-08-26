/**
 * בדיקת כפילויות אמיתיות — תנועות שנראות זהות (אותו יום, אותו בית עסק,
 * אותו סכום) אבל קיבלו dedupHash שונה ונכנסו פעמיים במקום להידחות.
 *
 *   npx tsx scripts/dedupe-check.mts --user <id>
 *   npx tsx scripts/dedupe-check.mts --user <id> --month 2026-09
 *
 * << קריאה בלבד. לא מוחק ולא ממזג — רק מראה מה קרה ולמה, כדי שאפשר
 *    יהיה להחליט מה לתקן (בקוד) ואיך לנקות (בנתונים) בנפרד.
 *
 * ההיגיון: dedupHash בנוי מ-bookedAt+merchantRaw+originalAmount+
 * originalCurrency+cardLast4 (ראו lib/parsers/max.ts). שתי תנועות עם
 * אותו יום/בית עסק/סכום אבל dedupHash שונה — או שהן שתי עסקאות אמיתיות
 * שונות (יעד: cardLast4 שונה, כרטיס אחר), או שדה "יציב" השתנה בין קובץ
 * לקובץ ושבר את הדדופ. הפלט מראה בדיוק איזה שדה שונה, כדי לא לנחש.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";
import { formatILS, toAgorot } from "../lib/analytics/money";
import { monthPeriod } from "../lib/analytics/period";

// << Y (צהוב) לא היה בשימוש בפועל בדוח הזה — רק ירוק/אדום/ניטרלי.
const G = "\x1b[32m", R = "\x1b[31m", B = "\x1b[1m", D = "\x1b[2m", O = "\x1b[0m";

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

const monthArg = val("--month");
const where: Record<string, unknown> = { userId };
if (monthArg) {
  const m = /^(\d{4})-(\d{2})$/.exec(monthArg);
  if (!m) {
    console.error("‏--month בפורמט YYYY-MM");
    process.exit(1);
  }
  const p = monthPeriod(Number(m[1]), Number(m[2]));
  where.bookedAt = { gte: p.from, lt: p.to };
}

const rows = await withUser(userId, (db) =>
  db.transaction.findMany({
    where,
    orderBy: { bookedAt: "asc" },
    select: {
      id: true,
      bookedAt: true,
      chargedAt: true,
      amount: true,
      originalAmount: true,
      originalCurrency: true,
      merchant: true,
      merchantRaw: true,
      cardLast4: true,
      status: true,
      dedupHash: true,
      occurrence: true,
      importJobId: true,
      importJob: { select: { fileName: true, startedAt: true } },
      account: { select: { label: true, provider: true } },
    },
  })
);

console.log(`\n${B}${rows.length} תנועות נבדקות${O}`);

// קיבוץ לפי "מה שנראה כמו אותה עסקה": יום + בית עסק גולמי + סכום מקורי.
const key = (r: (typeof rows)[number]) =>
  `${r.bookedAt.toISOString().slice(0, 10)}|${r.merchantRaw}|${r.originalAmount ?? r.amount}`;

const groups = new Map<string, typeof rows>();
for (const r of rows) {
  const k = key(r);
  const list = groups.get(k);
  if (list) list.push(r);
  else groups.set(k, [r]);
}

let suspiciousCount = 0;
let suspiciousSum = 0;

for (const [k, list] of groups) {
  if (list.length < 2) continue;
  const hashes = new Set(list.map((r) => r.dedupHash));
  // כפילות אמיתית מאותו hash+occurrence הייתה נדחית ברמת המסד — לא
  // אמורה להגיע לכאן בכלל. מה שכן יכול לקרות: אותו hash עם occurrence
  // שונה (מכונת שתייה — לגיטימי), או hash שונה לגמרי (זה החשוד).
  if (hashes.size < 2) continue; // כולן עם אותו hash — תקין, occurrence מבדיל

  suspiciousCount++;
  const sum = list.reduce((s, r) => s + toAgorot(r.amount), 0);
  suspiciousSum += Math.abs(sum);

  console.log(`\n${R}חשוד:${O} ${B}${k}${O}  ${D}(${list.length} שורות, ${hashes.size} hash-ים שונים)${O}`);
  for (const r of list) {
    console.log(
      `  ${formatILS(toAgorot(r.amount)).padStart(12)}  ${r.bookedAt.toISOString().slice(0, 10)}` +
        `  כרטיס:${r.cardLast4 ?? "—"}  סטטוס:${r.status}` +
        `  ${D}חשבון:${r.account.provider}/${r.account.label}${O}`
    );
    console.log(
      `    ${D}hash:${r.dedupHash.slice(0, 12)}… occ:${r.occurrence} קובץ:${r.importJob?.fileName ?? "—"} (${r.importJob?.startedAt.toISOString().slice(0, 10) ?? "—"})${O}`
    );
  }
}

console.log("\n" + "─".repeat(76));
if (suspiciousCount === 0) {
  console.log(`${G}לא נמצאו כפילויות חשודות.${O}`);
} else {
  console.log(
    `${R}${B}${suspiciousCount} קבוצות חשודות${O}, סכום כולל מעורב: ${formatILS(suspiciousSum)}`
  );
}

await prisma.$disconnect();
process.exit(0);
