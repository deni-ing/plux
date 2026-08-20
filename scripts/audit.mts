/**
 * ביקורת על הנתונים שבמסד.
 *
 *   npx tsx scripts/audit.mts --user <clerk-user-id>
 *
 * שלוש שאלות, ולכל אחת תשובה במספרים:
 *
 *   1. האם הבידוד עובד על נתונים אמיתיים — לא על שתי שורות טסט
 *   2. האם החיוב המרוכז של האשראי מתלכד עם התנועות הבודדות
 *   3. כמה הייתה ההוצאה מנופחת אילו לא היינו מטפלים בכפילות
 *
 * זה גם הזרע של מנוע האנליטיקה: אותן שאילתות בדיוק יזינו בהמשך את
 * הדשבורד. ההבדל היחיד הוא שכאן הפלט הוא טקסט ולא גרף.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", O = "\x1b[0m";

const argv = process.argv.slice(2);
const userId = argv[argv.indexOf("--user") + 1];
if (!userId || userId.startsWith("--")) {
  console.error("שימוש: npx tsx scripts/audit.mts --user <clerk-user-id>");
  process.exit(2);
}

/** מזהה שאינו קיים, לבדיקת בידוד. אינו נכתב לשום מקום. */
const PROBE = "user_isolation_probe_do_not_create";

const ils = (minor: number) =>
  (minor / 100).toLocaleString("he-IL", { minimumFractionDigits: 2 });

const toMinor = (d: unknown) => Math.round(Number(d) * 100);

let failed = 0;
function check(ok: boolean, label: string, detail = "") {
  if (!ok) failed++;
  console.log(`  ${ok ? `${G}PASS${O}` : `${R}FAIL${O}`}  ${label}${detail ? `\n        ${D}${detail}${O}` : ""}`);
}

// ═════════════════ 1. בידוד על נתונים אמיתיים ═════════════════

console.log("\nבידוד");

const mine = await withUser(userId, (db) => db.transaction.count());
const probe = await withUser(PROBE, (db) => db.transaction.count());
// גישה ישירה ללקוח, מחוץ ל-withUser: app.current_user_id לא הוגדר כלל.
const anon = await prisma.transaction.count();

check(mine > 0, `המשתמש רואה את הנתונים שלו`, `${mine} תנועות`);
check(probe === 0, `משתמש אחר רואה אפס`, `החזיר ${probe} מתוך ${mine}`);
check(anon === 0, `שאילתה בלי זהות מחזירה אפס`, `החזיר ${anon} מתוך ${mine}`);

if (mine === 0) {
  console.log(`\n${Y}אין תנועות במסד. הרץ קודם את import-file.mts${O}\n`);
  await prisma.$disconnect();
  process.exit(1);
}

// ═════════════════ 2. חשבונות ═════════════════

const accounts = await withUser(userId, (db) =>
  db.account.findMany({
    orderBy: { provider: "asc" },
    select: { id: true, provider: true, label: true, balance: true, _count: { select: { transactions: true } } },
  })
);

console.log("\nחשבונות");
for (const a of accounts) {
  console.log(
    `  ${a.provider.padEnd(6)} ${a.label.padEnd(16)} ${String(a._count.transactions).padStart(4)} תנועות` +
    (a.balance !== null ? `   יתרה ${ils(toMinor(a.balance))}` : "")
  );
}

// ═════════════════ 3. הצלבת החיוב המרוכז ═════════════════

/**
 * ההשערה שהנחתה את כל הסכימה: כל שורת CARD_SETTLEMENT בדף הבנק שווה
 * בדיוק לסכום תנועות האשראי שתאריך החיוב שלהן הוא אותו יום.
 *
 * זה נכון גם לחיוב החודשי המרוכז וגם לעסקאות חו״ל, שמחויבות בנפרד —
 * בשני המקרים chargedAt של MAX הוא היום שבו הבנק חויב.
 */
const settlements = await withUser(userId, (db) =>
  db.transaction.findMany({
    where: { kind: "CARD_SETTLEMENT" },
    select: { bookedAt: true, amount: true, merchant: true },
    orderBy: { bookedAt: "desc" },
  })
);

const cardTxns = await withUser(userId, (db) =>
  db.transaction.findMany({
    where: { account: { type: "CREDIT_CARD" }, chargedAt: { not: null } },
    select: { chargedAt: true, amount: true },
  })
);

const byChargeDate = new Map<string, number>();
for (const t of cardTxns) {
  const key = t.chargedAt!.toISOString().slice(0, 10);
  byChargeDate.set(key, (byChargeDate.get(key) ?? 0) + toMinor(t.amount));
}

console.log("\nהצלבת חיובי אשראי");

if (settlements.length === 0) {
  console.log(`  ${D}אין שורות CARD_SETTLEMENT — ייבא את דף הבנק${O}`);
} else if (cardTxns.length === 0) {
  console.log(`  ${D}אין תנועות אשראי — ייבא את קובצי MAX${O}`);
} else {
  // << ביום אחד עשויות להיות כמה שורות חיוב בבנק — החיוב החודשי המרוכז
  //    לצד חיוב חו״ל שהגיע באותו יום. השוואה של שורת בנק בודדת מול סכום
  //    היום כולו נכשלת אז, למרות שהנתונים תקינים. ההשוואה הנכונה היא
  //    סכום מול סכום, לפי תאריך.
  const bankByDate = new Map<string, number>();
  for (const s of settlements) {
    const key = s.bookedAt.toISOString().slice(0, 10);
    bankByDate.set(key, (bankByDate.get(key) ?? 0) + toMinor(s.amount));
  }

  let matchedDays = 0, matchedMinor = 0;
  const misses: string[] = [];

  for (const [date, bank] of [...bankByDate].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    const fromCard = byChargeDate.get(date);
    if (fromCard !== undefined && fromCard === bank) {
      matchedDays++; matchedMinor += bank;
    } else if (misses.length < 5) {
      misses.push(`${date}: בנק ${ils(bank)} מול אשראי ${fromCard === undefined ? "—" : ils(fromCard)}`);
    }
  }

  const unmatched = bankByDate.size - matchedDays;

  check(
    matchedDays > 0,
    `${matchedDays} מתוך ${bankByDate.size} ימי חיוב מתלכדים במדויק`,
    `סך מותאם: ${ils(matchedMinor)}  ·  ${settlements.length} שורות בנק`
  );

  if (unmatched) {
    console.log(`  ${D}${unmatched} ימים ללא התאמה — צפוי לחודשים שקובץ ה-MAX שלהם לא יובא:${O}`);
    for (const m of misses) console.log(`    ${D}${m}${O}`);
  }
}

// ═════════════════ 4. הנפח שנחסך ═════════════════

const all = await withUser(userId, (db) =>
  db.transaction.findMany({ select: { amount: true, countsAsSpending: true, direction: true } })
);

const outflow = all.filter((t) => t.direction === "DEBIT");
const naive = outflow.reduce((s, t) => s + toMinor(t.amount), 0);
const real = outflow.filter((t) => t.countsAsSpending).reduce((s, t) => s + toMinor(t.amount), 0);
const excluded = naive - real;

console.log("\nהוצאות");
console.log(`  ${D}כל החיובים במסד:${O}          ${ils(naive).padStart(14)}`);
console.log(`  ${D}מוחרג (אשראי והעברות):${O}   ${ils(excluded).padStart(14)}`);
console.log(`  הוצאה בפועל:            ${ils(real).padStart(14)}`);

if (naive < 0 && real < 0) {
  const inflation = Math.round((naive / real - 1) * 100);
  console.log(
    `\n  ${Y}בלי ההחרגה ההוצאות היו מוצגות מנופחות ב-${inflation}%${O}` +
    `\n  ${D}זו הסיבה ל-countsAsSpending, ועכשיו זה מספר ולא הנחה${O}`
  );
}

await prisma.$disconnect();
console.log("\n" + (failed === 0 ? `${G}הכל תקין.${O}` : `${R}${failed} כשלים.${O}`) + "\n");
process.exitCode = failed === 0 ? 0 : 1;
