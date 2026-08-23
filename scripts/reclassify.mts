/**
 * להעביר קטגוריה שלמה לקטגוריה אחרת.
 *
 *   npx tsx scripts/reclassify.mts --user <id> --from housing.rent --to transfer.internal
 *   npx tsx scripts/reclassify.mts --user <id> --from housing.rent --to transfer.internal --write
 *
 * ─── למה הכלי הזה קיים ───
 *
 * `decide.mts` מקבל שם בית עסק כארגומנט. זה עובד מצוין כשהשם באנגלית,
 * ונשבר בשקט כשהוא בעברית: **PowerShell 5 מעביר ארגומנטים ל-node.exe
 * לפי דף הקוד של המערכת, והעברית לא שורדת את המעבר.** התוצאה אינה
 * שגיאה — היא חיפוש אחרי מחרוזת משובשת, ודיווח מדויק ש"0 תנועות
 * עודכנו". תשובה נכונה לשאלה שגויה.
 *
 * הכלי הזה מקבל **שני slugs באנגלית בלבד**, מוצא את שמות בתי העסק
 * במסד, ומעביר אותם. שום מחרוזת עברית לא חוצה את גבול המעטפת.
 *
 * **ממשק שדורש ממחרוזת לשרוד את המעטפת הוא ממשק שיישבר** — לא כי
 * מישהו טעה, אלא כי הגבול הזה לא מבטיח כלום.
 *
 * ─── הרצה יבשה כברירת מחדל ───
 *
 * מגע בכמות נתונים דורש לראות קודם. `--write` הוא הצהרה מפורשת.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";
import { isKnownSlug, kindOf, nameOf } from "../lib/categories/tree";
import { setUserCategory } from "../lib/classify/user";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m", D = "\x1b[2m", O = "\x1b[0m";

const args = process.argv.slice(2);
const val = (flag: string) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : (args[i + 1] ?? null);
};

const userId = val("--user");
const from = val("--from");
const to = val("--to");
const write = args.includes("--write");

if (!userId || userId.startsWith("--")) {
  console.error("חסר --user <clerk-user-id>");
  process.exit(1);
}
if (!from || !to) {
  console.error("צריך --from <slug> ו---to <slug>");
  process.exit(1);
}
for (const s of [from, to]) {
  if (!isKnownSlug(s)) {
    console.error(`slug לא קיים בעץ: ${s}`);
    process.exit(1);
  }
}

const rows = await withUser(userId, (db) =>
  db.transaction.findMany({
    where: { userId, category: { slug: from } },
    select: { merchant: true, amount: true, categorySource: true },
  })
);

if (rows.length === 0) {
  console.log(`${Y}אין תנועות ב-${from}.${O}`);
  await prisma.$disconnect();
  process.exit(0);
}

// קיבוץ לפי בית עסק, כדי שההצגה תהיה קריאה וההחלטה מודעת.
const byMerchant = new Map<string, { count: number; total: number; manual: number }>();
for (const r of rows) {
  const cur = byMerchant.get(r.merchant) ?? { count: 0, total: 0, manual: 0 };
  cur.count += 1;
  cur.total += Number(r.amount);
  if (r.categorySource === "USER") cur.manual += 1;
  byMerchant.set(r.merchant, cur);
}

const fromKind = kindOf(from);
const toKind = kindOf(to);
const countsAfter = toKind !== "TRANSFER";

console.log(`\n${B}${nameOf(from) ?? from} → ${nameOf(to) ?? to}${O}`);
console.log(`${D}${from} (${fromKind}) → ${to} (${toKind})${O}`);
console.log("─".repeat(60));

for (const [merchant, s] of [...byMerchant].sort((a, b) => a[1].total - b[1].total)) {
  const manual = s.manual > 0 ? ` ${Y}(${s.manual} סומנו ידנית)${O}` : "";
  console.log(`  ${merchant}  ${D}${s.count} תנועות · ${s.total.toFixed(2)} ₪${O}${manual}`);
}

console.log("─".repeat(60));
console.log(`${rows.length} תנועות ב-${byMerchant.size} בתי עסק.`);

if (fromKind !== toKind) {
  console.log(
    `${Y}שינוי משפחה: ${fromKind} → ${toKind}. countsAsSpending יהפוך ל-${countsAfter}.${O}`
  );
  if (toKind === "TRANSFER") {
    console.log(`${Y}כלומר: התנועות האלה ייצאו מסך ההוצאות בכל החודשים.${O}`);
  }
}

if (!write) {
  console.log(`\n${D}הרצה יבשה. הוסף --write כדי לכתוב.${O}\n`);
  await prisma.$disconnect();
  process.exit(0);
}

let updated = 0;
for (const merchant of byMerchant.keys()) {
  const res = await withUser(userId, (db) =>
    setUserCategory(db, userId, { merchant, slug: to, createRule: true })
  );
  updated += res.rowsUpdated;
  console.log(`${G}✓${O} ${merchant} ${D}— ${res.rowsUpdated} שורות${O}`);
}

console.log(`\n${G}${B}${updated} תנועות עודכנו.${O}`);
console.log(`${D}הרץ עכשיו: snapshot.mts --force, ואז analytics-check.mts${O}\n`);

await prisma.$disconnect();
process.exit(0);
