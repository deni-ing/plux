/**
 * מדפיס את ה-storagePath של כל ייבוא, כדי לראות בעיניים מה יושב שם.
 *
 *   npx tsx scripts/storage-paths.mts --user <clerk-user-id>
 *
 * נכתב כי `checkup` דיווח על 8 ייבואים עם נתיב שלא מתחיל ב-userId, ואין
 * שום סיבה לנחש מה הם. סקריפט של עשרים שורות שמדפיס את הנתון האמיתי
 * זול מכל תיאוריה.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";

const D = "\x1b[2m", G = "\x1b[32m", Y = "\x1b[33m", O = "\x1b[0m";

const args = process.argv.slice(2);
const userId = args[args.indexOf("--user") + 1];
if (!userId || userId.startsWith("--")) {
  console.error("חסר --user <clerk-user-id>");
  process.exit(1);
}

const jobs = await withUser(userId, (db) =>
  db.importJob.findMany({
    where: { userId },
    orderBy: { startedAt: "asc" },
    select: {
      id: true,
      fileName: true,
      storagePath: true,
      startedAt: true,
      rowsInserted: true,
      status: true,
    },
  })
);

console.log(`${jobs.length} ייבואים\n`);

const groups = new Map<string, number>();

for (const j of jobs) {
  const p = j.storagePath;
  const kind = p.startsWith(`${userId}/`)
    ? "אחסון תקין"
    : p.startsWith("inline:")
      ? "ללא אחסון (inline)"
      : p.startsWith("purged:")
        ? "נמחק אחרי 30 יום"
        : "אחר";

  groups.set(kind, (groups.get(kind) ?? 0) + 1);

  const mark = kind === "אחר" ? `${Y}?${O}` : `${G}·${O}`;
  const when = j.startedAt.toISOString().slice(0, 16).replace("T", " ");
  console.log(`${mark} ${when}  ${String(j.rowsInserted).padStart(4)} שורות  ${j.fileName}`);
  console.log(`    ${D}${p}${O}`);
}

console.log("\nסיכום:");
for (const [k, n] of [...groups.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${k}`);
}

await prisma.$disconnect();
process.exit(0);
