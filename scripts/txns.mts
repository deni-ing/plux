/**
 * להסתכל בשורות עצמן.
 *
 *   npx tsx scripts/txns.mts --user <id> --merchant "שכר דירה"
 *   npx tsx scripts/txns.mts --user <id> --slug housing.rent
 *   npx tsx scripts/txns.mts --user <id> --min 1000 --month 2026-06
 *   npx tsx scripts/txns.mts --user <id> --merchant "מקס" --raw
 *   npx tsx scripts/txns.mts --user <id> --slug housing.rent --json
 *
 * << הכלי הזה היה חסר כל היום. בכל פעם שמשהו נראה מוזר בדוח, השאלה
 *    הבאה הייתה "מה השורה שמאחוריו" — ולא הייתה דרך לענות עליה חוץ
 *    מלכתוב שאילתה חד־פעמית. **דוח שאי אפשר לצלול ממנו לנתון הוא
 *    טענה שאי אפשר לבדוק.**
 *
 * קריאה בלבד. הוא לא כותב כלום.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";
import { formatILS, toAgorot } from "../lib/analytics/money";
import { monthPeriod } from "../lib/analytics/period";

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

const merchant = val("--merchant");
const slug = val("--slug");
const min = val("--min");
const monthArg = val("--month");
const showRaw = args.includes("--raw");
const asJson = args.includes("--json");
const limit = Number(val("--limit") ?? 60);

if (!merchant && !slug && !min && !monthArg) {
  console.error("צריך לפחות אחד מ: --merchant | --slug | --min | --month");
  process.exit(1);
}

const where: Record<string, unknown> = { userId };

if (merchant) where.merchant = { contains: merchant };
if (slug) where.category = { slug };
if (min) {
  // סכומים שליליים = כסף יוצא. "מעל 1000" פירושו גדול ב**ערך מוחלט**.
  where.amount = { lte: -toAgorot(min) / 100 };
}
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
    orderBy: { bookedAt: "desc" },
    take: limit,
    select: {
      bookedAt: true,
      chargedAt: true,
      amount: true,
      merchant: true,
      merchantRaw: true,
      descriptor: true,
      note: true,
      kind: true,
      categorySource: true,
      countsAsSpending: true,
      providerCategory: true,
      cardLast4: true,
      category: { select: { slug: true, name: true } },
      account: { select: { label: true, provider: true } },
    },
  })
);

if (rows.length === 0) {
  console.log(`${Y}לא נמצאו תנועות.${O}`);
  await prisma.$disconnect();
  process.exit(0);
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const total = rows.reduce((s, r) => s + toAgorot(r.amount), 0);

// << פלט לצריכה. קיים כדי שלא יהיה צורך להעתיק שם עברי מטרמינל שמציג
//    אותו הפוך — העתקה ידנית של מחרוזת היא מקור טעויות שאפשר להימנע
//    ממנו לגמרי.
if (asJson) {
  const uniq = [...new Set(rows.map((r) => r.merchant))];
  console.log(
    JSON.stringify(
      {
        merchants: uniq,
        count: rows.length,
        total,
        rows: rows.map((r) => ({
          bookedAt: day(r.bookedAt),
          amount: toAgorot(r.amount),
          merchant: r.merchant,
          merchantRaw: r.merchantRaw,
          note: r.note,
          kind: r.kind,
          slug: r.category?.slug ?? null,
          source: r.categorySource,
          countsAsSpending: r.countsAsSpending,
          account: r.account.label,
        })),
      },
      null,
      2
    )
  );
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`\n${B}${rows.length} תנועות${O}  ${D}סה"כ ${formatILS(total)}${O}`);
console.log("─".repeat(76));

for (const r of rows) {
  const amount = formatILS(toAgorot(r.amount)).padStart(13);
  const cat = r.category ? `${r.category.slug}` : `${Y}לא מסווג${O}`;
  const flags = [
    r.countsAsSpending ? "" : `${D}[לא נספר]${O}`,
    r.categorySource === "USER" ? `${G}[ידני]${O}` : "",
    r.kind !== "PURCHASE" ? `${D}[${r.kind}]${O}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  console.log(`${day(r.bookedAt)}  ${amount}  ${r.merchant}`);
  console.log(
    `  ${D}${r.account.provider} ${r.account.label}${r.cardLast4 ? ` ·${r.cardLast4}` : ""} · חיוב ${day(r.chargedAt)}${O}  ${cat} ${flags}`
  );

  // << merchantRaw הוא מה שהיה בקובץ לפני הנרמול. כשקטגוריה נראית
  //    שגויה, ההבדל בין השניים הוא בדרך כלל ההסבר.
  if (showRaw || r.merchantRaw !== r.merchant) {
    console.log(`  ${D}גולמי: ${JSON.stringify(r.merchantRaw)}${O}`);
  }
  if (r.descriptor) console.log(`  ${D}תיאור: ${r.descriptor}${O}`);
  if (r.note) console.log(`  ${D}הערה: ${r.note}${O}`);
  if (r.providerCategory) console.log(`  ${D}קטגוריית הספק: ${r.providerCategory}${O}`);
  console.log();
}

await prisma.$disconnect();
process.exit(0);
