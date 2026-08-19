/**
 * בדיקת RLS — מוכיחה שהבידוד באמת אוכף, ולא רק מוגדר.
 *
 * הרצה מתיקיית הפרויקט:
 *   npx tsx scripts/rls-check.ts
 *
 * הסקריפט יוצר שני משתמשי בדיקה, כותב נתון אצל אחד, ומנסה להגיע אליו מכל
 * כיוון אחר. בסוף הוא מנקה אחריו. אין לו שום השפעה על נתונים אמיתיים.
 */

import "dotenv/config";
import { prisma, withUser } from "../lib/db/client";

const A = "rlstest_alice";
const B = "rlstest_bob";

const results: { label: string; pass: boolean; detail: string }[] = [];

function check(label: string, pass: boolean, detail = "") {
  results.push({ label, pass, detail });
  console.log(`  ${pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m"}  ${label}${detail ? `\n        ${detail}` : ""}`);
}

async function cleanup() {
  for (const u of [A, B]) {
    await withUser(u, async (db) => {
      await db.transaction.deleteMany({ where: { userId: u } });
      await db.account.deleteMany({ where: { userId: u } });
      await db.user.deleteMany({ where: { id: u } });
    });
  }
}

async function main() {
  // ── 0. מי אנחנו בכלל מול Postgres ──────────────────────────────
  // תפקיד עם התכונה BYPASSRLS מתעלם מכל מדיניות RLS, בשקט מוחלט.
  // זו התקלה הנפוצה ביותר בהגדרת RLS, ולכן היא נבדקת ראשונה.
  const who = (await prisma.$queryRaw<
    { current_user: string; bypassrls: boolean | null }[]
  >`SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls`)[0];

  console.log(`\n  מחובר כתפקיד: ${who.current_user}`);
  console.log(`  BYPASSRLS: ${who.bypassrls}\n`);

  check(
    "התפקיד שהאפליקציה מתחברת בו אינו עוקף RLS",
    who.bypassrls === false,
    who.bypassrls ? "התפקיד הזה מתעלם מכל מדיניות. כל שאר הבדיקות חסרות משמעות." : ""
  );

  await cleanup();

  // ── 1. הכנה: אליס כותבת נתון משלה ──────────────────────────────
  await withUser(A, async (db) => {
    await db.user.create({ data: { id: A, email: `${A}@test.local` } });
    const acc = await db.account.create({
      data: { userId: A, provider: "MAX", type: "CREDIT_CARD", label: "כרטיס בדיקה" },
    });
    await db.transaction.create({
      data: {
        userId: A,
        accountId: acc.id,
        bookedAt: new Date("2026-01-01"),
        amount: "-100.00",
        merchantRaw: "בדיקת RLS",
        merchant: "בדיקת RLS",
        direction: "DEBIT",
        dedupHash: "rlstest",
      },
    });
  });

  await withUser(B, async (db) => {
    await db.user.create({ data: { id: B, email: `${B}@test.local` } });
  });

  // ── 2. אליס רואה את עצמה ───────────────────────────────────────
  // בלי הבדיקה הזו, מדיניות ששוללת גישה מכולם הייתה "עוברת" את כל השאר.
  const mine = await withUser(A, (db) => db.transaction.count());
  check("אליס רואה את התנועה של עצמה", mine === 1, `נמצאו ${mine}, ציפינו ל-1`);

  // ── 3. בוב לא רואה את אליס ─────────────────────────────────────
  const his = await withUser(B, (db) => db.transaction.count());
  check("בוב לא רואה את התנועה של אליס", his === 0, `נמצאו ${his}, ציפינו ל-0`);

  // ── 4. בלי זהות כלל — לא רואים כלום ────────────────────────────
  // גישה ישירה ל-client, מחוץ ל-withUser. app.current_user_id לא הוגדר,
  // הפונקציה מחזירה NULL, וכל השוואה ל-NULL אינה אמת.
  const anon = await prisma.transaction.count();
  check("שאילתה בלי זהות מחזירה ריק", anon === 0, `נמצאו ${anon}, ציפינו ל-0`);

  // ── 5. בוב לא יכול לשתול שורה בשם אליס ─────────────────────────
  // זה מה ש-WITH CHECK אוכף. בלעדיו הקריאה מוגנת אבל הכתיבה לא.
  let blocked = false;
  let msg = "";
  try {
    await withUser(B, async (db) => {
      const acc = await db.account.create({
        data: { userId: A, provider: "OTHER", type: "BANK", label: "חדירה" },
      });
      return acc.id;
    });
  } catch (e) {
    blocked = true;
    msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
  }
  check("בוב לא יכול לכתוב שורה עם userId של אליס", blocked, blocked ? `נחסם: ${msg}` : "השורה נכתבה — WITH CHECK לא אוכף");

  // ── 6. אליס לא יכולה לעדכן שורה של בוב ─────────────────────────
  const touched = await withUser(B, (db) =>
    db.user.updateMany({ where: { id: A }, data: { displayName: "נדרס" } })
  );
  check("עדכון של שורת משתמש אחר לא נוגע בכלום", touched.count === 0, `עודכנו ${touched.count}, ציפינו ל-0`);

  await cleanup();

  // ── סיכום ──────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.pass);
  console.log(
    failed.length === 0
      ? `\n  \x1b[32m${results.length}/${results.length} עברו. הבידוד נאכף.\x1b[0m\n`
      : `\n  \x1b[31m${failed.length} מתוך ${results.length} נכשלו.\x1b[0m\n`
  );
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error("\n  הסקריפט נפל:\n", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
