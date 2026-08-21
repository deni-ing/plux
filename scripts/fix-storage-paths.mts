/**
 * ממיר סימוני נתיב ישנים לצורה הנוכחית.
 *
 *   npx tsx scripts/fix-storage-paths.mts --user <id>            # הרצה יבשה
 *   npx tsx scripts/fix-storage-paths.mts --user <id> --write    # כותב
 *
 * הרקע: לפני שהוספנו את ה-Storage, סקריפט הייבוא כתב
 * `local:C:\Users\...\<שם>` כדי לציין "אין קובץ שמור". אחר כך הצורה
 * הפכה ל-`inline:<שם>`, ושתיהן חיו זו לצד זו במסד.
 *
 * ההמרה עושה שני דברים:
 *   1. מאחדת את הסימון — `inline:` בלבד.
 *   2. מוחקת את הנתיב המקומי ומשאירה את שם הקובץ. שם המשתמש בווינדוס
 *      ומבנה התיקיות של המחשב אינם נתון שהאפליקציה צריכה.
 *
 * מגע חד-פעמי בנתונים קיימים, ולכן הרצה יבשה כברירת מחדל.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";
import { classifyPath, inlinePath, LEGACY_PREFIXES } from "../lib/storage/paths";

const G = "\x1b[32m", Y = "\x1b[33m", D = "\x1b[2m", O = "\x1b[0m";

const args = process.argv.slice(2);
const userId = args[args.indexOf("--user") + 1];
const write = args.includes("--write");

if (!userId || userId.startsWith("--")) {
  console.error("חסר --user <clerk-user-id>");
  process.exit(1);
}

const jobs = await withUser(userId, (db) =>
  db.importJob.findMany({
    where: { userId },
    select: { id: true, storagePath: true, fileName: true },
  })
);

const legacy = jobs.filter((j) => classifyPath(j.storagePath, userId) === "legacy");
const unknown = jobs.filter((j) => classifyPath(j.storagePath, userId) === "unknown");

console.log(`${jobs.length} ייבואים · ${legacy.length} בסימון ישן · ${unknown.length} לא מזוהים\n`);

if (unknown.length) {
  console.log(`${Y}לא מזוהים — לא נוגעים בהם:${O}`);
  for (const u of unknown) console.log(`  ${D}${u.storagePath}${O}`);
  console.log(`${D}אם יש כאן צורה חוקית שנשכחה, הוסף אותה ל-lib/storage/paths.ts${O}\n`);
}

if (!legacy.length) {
  console.log(`${G}אין מה להמיר.${O}`);
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`${LEGACY_PREFIXES.join(", ")} → inline:\n`);

for (const j of legacy) {
  // שם הקובץ נלקח מהשדה fileName ולא מהנתיב: הוא כבר מנוקה, והוא הנתון
  // הנכון. הנתיב המקומי לא מועתק לשום מקום.
  const next = inlinePath(j.fileName);
  console.log(`  ${D}${j.storagePath}${O}`);
  console.log(`  ${G}→${O} ${next}\n`);

  if (write) {
    await withUser(userId, (db) =>
      db.importJob.update({ where: { id: j.id }, data: { storagePath: next } })
    );
  }
}

console.log(
  write
    ? `${G}${legacy.length} שורות עודכנו.${O}`
    : `${D}הרצה יבשה. הוסף --write כדי לכתוב.${O}`
);

await prisma.$disconnect();
process.exit(0);
