/**
 * seed משתמש דמו. משימה 9.1.
 *
 * שימוש:
 *   PLUX_DIRECT_DB=1 npx tsx scripts/seed-demo.mts
 *   PLUX_DIRECT_DB=1 npx tsx scripts/seed-demo.mts --user demo_user --months 4
 *   PLUX_DIRECT_DB=1 npx tsx scripts/seed-demo.mts --reset   # מוחק ובונה מחדש
 *
 * ב-PowerShell: $env:PLUX_DIRECT_DB=1; npx tsx scripts/seed-demo.mts
 *
 * ─── PLUX_DIRECT_DB=1 ולא ברירת מחדל ───
 *
 * אותה סיבה בדיוק שמתועדת ב-lib/db/client.ts ליד ההגדרה של הדגל: הסקריפט
 * עושה כמה createMany ברצף בטרנזקציה אחת ארוכה (עשרות תנועות), וזה בדיוק
 * הדפוס שגרם ל-FK-violation תמוה דרך ה-pooler. סקריפט חד-פעמי, לא ה-dev
 * server — אז החיבור הישיר בטוח כאן.
 *
 * ─── אין נתונים אמיתיים כאן ───
 *
 * בתי העסק, השמות והסכומים למטה **בדויים לגמרי** — לא מבוססים על שום קובץ
 * ייבוא אמיתי. המבנה (שמות עמודות, פיצול בין "עסקאות במועד החיוב" לחיוב
 * מרוכז, "הוראת קבע" כמסמן מנוי) מבוסס על מה שכבר קיים בקוד עצמו
 * (lib/import/ingest.ts, lib/analytics/recurring.ts) — לא על נתונים
 * אישיים של אף משתמש.
 *
 * ─── למה לא דרך lib/import/ingest.ts ───
 *
 * ‏ingest.ts קיים כדי לפרש קובץ MAX/לאומי אמיתי — עמודות גולמיות, בדיקות
 * דה-דופ, זיהוי TxnKind ממחרוזת. כאן אין קובץ: הנתונים כבר "מסווגים"
 * ברמת ההגדרה (אני בוחר את ה-slug ישירות). מעבר דרך ingest.ts היה מוסיף
 * שכבת ניחוש (parse-max.ts) בלי שום תועלת — אנחנו כבר יודעים את התשובה.
 *
 * ─── סדר הפעולות ───
 *
 * 1. User (upsert).
 * 2. שני חשבונות: כרטיס MAX ועו״ש לאומי — בדיוק כמו משתמש אמיתי.
 * 3. ensureCategories — אותה פונקציה שרצה על כל משתמש חדש באפליקציה,
 *    לא רשימה נפרדת שעלולה לסטות ממנה.
 * 4. תנועות: קבועות (משכורת/שכירות/מנויים, כל חודש) + מאגר משתנה
 *    (סופר/דלק/מסעדות...) שנדגם אקראית לכל חודש — כדי שהחודשים לא
 *    ייראו זהים אחד לשני.
 * 5. recomputeSnapshots — אותו קריאה שרצה אחרי ייבוא אמיתי, כדי
 *    שהדשבורד יהיה מיידי בלי לחכות לחישוב חי בפעם הראשונה.
 *
 * ─── כל התאריכים ביום 7 ומעלה ───
 *
 * ‏lib/analytics/period.ts מגדיר PERIOD_START_DAY=7: "אוגוסט" בעיני המנוע
 * הוא 07-08 עד 06-09, לא הראשון עד האחרון בחודש הקלנדרי. גרסה ראשונה של
 * הסקריפט הזו קבעה משכורת/שכירות ביום 1 — ונתקלתי בזה בפועל: הריצה
 * הראשונה הראתה income:0 בדוח "אוגוסט", כי תנועת יום 1 של אוגוסט שייכת
 * בפועל לתקופה של יולי. לכן כל תאריך כאן (קבועות ומאגר משתנה כאחד) הוא
 * 7 ומעלה — כולל `utc(y, m, 33)`-מהסוג-הזה, ש-Date.UTC מנרמל אל תוך
 * החודש הבא בכוונה, בדיוק כמו שהתקופה עצמה עושה.
 */

import "dotenv/config";
import { randomUUID } from "node:crypto";

import { prisma, withUser, type Db } from "../lib/db/client";
import { ensureCategories, categoryIdBySlug } from "../lib/categories/ensure";
import { recomputeSnapshots } from "../lib/analytics/recompute";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const val = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : (args[i + 1] ?? fallback);
};

const USER_ID = val("--user", "demo_user");
const MONTHS = Math.max(2, Number(val("--months", "4")));
const RESET = flag("--reset");

const rand = (min: number, max: number) => Math.round((min + Math.random() * (max - min)) * 100) / 100;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p: number) => Math.random() < p;

type Row = {
  bookedAt: Date;
  chargedAt: Date;
  amount: number; // חיובי = הכנסה, שלילי = הוצאה — כמו amount במסד.
  merchant: string;
  slug: string | null;
  providerCategory: string | null;
  kind: "PURCHASE" | "INCOME" | "TRANSFER_OUT" | "STANDING_ORDER" | "CARD_SETTLEMENT";
  countsAsSpending: boolean;
  note: string | null;
  channel: string | null;
  account: "max" | "bank";
};

function utc(y: number, m1to12: number, d: number): Date {
  return new Date(Date.UTC(y, m1to12 - 1, d));
}

/** מחזור החיוב של MAX: תנועה מ-DD/MM מחויבת ב-10 לחודש שאחריו. */
function maxBillingDate(bookedAt: Date): Date {
  const y = bookedAt.getUTCFullYear();
  const m = bookedAt.getUTCMonth(); // 0-based; +1 = החודש הבא
  return new Date(Date.UTC(y, m + 1, 10));
}

const GROCERIES = ["שופרסל דיל", "רמי לוי", "ויקטורי", "מינימרקט השכונה"];
const DINING = ["וולט", "קפה קפה", "ארומה אספרסו בר", "פיצה פרונטו"];
const FUEL = ["פז", "דלק"];
const SHOPPING = ["זארה", "קסטרו", "איקאה", "רבוע כחול"];
const CULTURE = ["סינמה סיטי", "תיאטרון הבימה"];

/** תנועות קבועות: אותו בית עסק וסכום (בערך) בכל חודש — כדי ש-findRecurring יזהה אותן. */
function recurringRows(y: number, m: number): Row[] {
  return [
    {
      bookedAt: utc(y, m, 8),
      chargedAt: utc(y, m, 8),
      amount: rand(11800, 12200),
      merchant: "מעביד בע\"מ - משכורת",
      slug: "income.salary",
      providerCategory: null,
      kind: "INCOME",
      countsAsSpending: true,
      note: null,
      channel: null,
      account: "bank",
    },
    {
      bookedAt: utc(y, m, 8),
      chargedAt: utc(y, m, 8),
      amount: -3200,
      merchant: "העברה - שכירות",
      slug: "housing.rent",
      providerCategory: null,
      kind: "STANDING_ORDER",
      countsAsSpending: true,
      note: "הוראת קבע",
      channel: null,
      account: "bank",
    },
    {
      bookedAt: utc(y, m, 12),
      chargedAt: utc(y, m, 12),
      amount: -rand(260, 340),
      merchant: "חברת חשמל",
      slug: "housing.electricity",
      providerCategory: null,
      kind: "STANDING_ORDER",
      countsAsSpending: true,
      note: "הוראת קבע",
      channel: null,
      account: "bank",
    },
    {
      bookedAt: utc(y, m, 10),
      chargedAt: utc(y, m, 10),
      amount: -89.9,
      merchant: "פרטנר תקשורת",
      slug: "telecom.mobile",
      providerCategory: null,
      kind: "STANDING_ORDER",
      countsAsSpending: true,
      note: "הוראת קבע",
      channel: null,
      account: "bank",
    },
    {
      bookedAt: utc(y, m, 12),
      chargedAt: maxBillingDate(utc(y, m, 12)),
      amount: -55.9,
      merchant: "NETFLIX.COM",
      slug: "leisure.subscriptions",
      providerCategory: "פנאי ותרבות",
      kind: "PURCHASE",
      countsAsSpending: true,
      note: "הוראת קבע",
      channel: "אינטרנט",
      account: "max",
    },
    {
      bookedAt: utc(y, m, 14),
      chargedAt: maxBillingDate(utc(y, m, 14)),
      amount: -19.9,
      merchant: "SPOTIFY",
      slug: "leisure.subscriptions",
      providerCategory: "פנאי ותרבות",
      kind: "PURCHASE",
      countsAsSpending: true,
      note: "הוראת קבע",
      channel: "אינטרנט",
      account: "max",
    },
    {
      bookedAt: utc(y, m, 9),
      chargedAt: maxBillingDate(utc(y, m, 9)),
      amount: -149,
      merchant: "פיטנס פלוס",
      slug: "leisure.sports",
      providerCategory: "פנאי ותרבות",
      kind: "PURCHASE",
      countsAsSpending: true,
      note: "הוראת קבע",
      channel: null,
      account: "max",
    },
  ];
}

/** מאגר משתנה — נדגם אקראית לכל חודש, כדי שהחודשים לא ייראו זהים. */
function variableRows(y: number, m: number): Row[] {
  const out: Row[] = [];

  const groceriesCount = Math.floor(rand(4, 6));
  for (let i = 0; i < groceriesCount; i++) {
    const day = Math.floor(rand(7, 33));
    const booked = utc(y, m, day);
    out.push({
      bookedAt: booked,
      chargedAt: maxBillingDate(booked),
      amount: -rand(60, 320),
      merchant: pick(GROCERIES),
      slug: "food.groceries",
      providerCategory: "מזון וצריכה",
      kind: "PURCHASE",
      countsAsSpending: true,
      note: null,
      channel: chance(0.3) ? "תשלום בנייד" : null,
      account: "max",
    });
  }

  const diningCount = Math.floor(rand(3, 5));
  for (let i = 0; i < diningCount; i++) {
    const day = Math.floor(rand(7, 33));
    const booked = utc(y, m, day);
    out.push({
      bookedAt: booked,
      chargedAt: maxBillingDate(booked),
      amount: -rand(25, 140),
      merchant: pick(DINING),
      slug: "food.restaurants",
      providerCategory: "מזון וצריכה",
      kind: "PURCHASE",
      countsAsSpending: true,
      note: null,
      channel: chance(0.5) ? "אינטרנט" : null,
      account: "max",
    });
  }

  for (let i = 0; i < 2; i++) {
    const day = Math.floor(rand(7, 33));
    const booked = utc(y, m, day);
    out.push({
      bookedAt: booked,
      chargedAt: maxBillingDate(booked),
      amount: -rand(200, 320),
      merchant: pick(FUEL),
      slug: "transport.fuel",
      providerCategory: "תחבורה ורכב",
      kind: "PURCHASE",
      countsAsSpending: true,
      note: null,
      channel: null,
      account: "max",
    });
  }

  if (chance(0.7)) {
    const day = Math.floor(rand(7, 33));
    const booked = utc(y, m, day);
    out.push({
      bookedAt: booked,
      chargedAt: maxBillingDate(booked),
      amount: -rand(90, 450),
      merchant: pick(SHOPPING),
      slug: "shopping.clothing",
      providerCategory: "קניות",
      kind: "PURCHASE",
      countsAsSpending: true,
      note: null,
      channel: "אינטרנט",
      account: "max",
    });
  }

  if (chance(0.6)) {
    const day = Math.floor(rand(7, 33));
    const booked = utc(y, m, day);
    out.push({
      bookedAt: booked,
      chargedAt: maxBillingDate(booked),
      amount: -rand(40, 120),
      merchant: "סופר-פארם",
      slug: "health.pharmacy",
      providerCategory: "בריאות",
      kind: "PURCHASE",
      countsAsSpending: true,
      note: null,
      channel: null,
      account: "max",
    });
  }

  if (chance(0.4)) {
    const day = Math.floor(rand(7, 33));
    const booked = utc(y, m, day);
    out.push({
      bookedAt: booked,
      chargedAt: maxBillingDate(booked),
      amount: -rand(60, 160),
      merchant: pick(CULTURE),
      slug: "leisure.culture",
      providerCategory: "פנאי ותרבות",
      kind: "PURCHASE",
      countsAsSpending: true,
      note: null,
      channel: "אינטרנט",
      account: "max",
    });
  }

  // << העברת BIT — כמו בקובץ ייצוא אמיתי: "העברת כספים" היא הקטגוריה
  //    שMAX עצמה מחזירה עבור תנועה כזו, לא סיווג פנימי שלנו.
  if (chance(0.5)) {
    const day = Math.floor(rand(7, 33));
    const booked = utc(y, m, day);
    out.push({
      bookedAt: booked,
      chargedAt: booked,
      amount: -rand(50, 300),
      merchant: "העברה ב BIT",
      slug: "transfer.p2p",
      providerCategory: "העברת כספים",
      kind: "TRANSFER_OUT",
      countsAsSpending: false,
      note: "למי: חבר/ה",
      channel: "טלפוני",
      account: "bank",
    });
  }

  // תנועה לא מסווגת אחת לחודש — כדי שגם המסך הזה לא יהיה ריק אצל הדמו.
  out.push({
    bookedAt: utc(y, m, Math.floor(rand(7, 33))),
    chargedAt: utc(y, m, Math.floor(rand(7, 33))),
    amount: -rand(20, 90),
    merchant: "עסק לא מזוהה",
    slug: null,
    providerCategory: null,
    kind: "PURCHASE",
    countsAsSpending: true,
    note: null,
    channel: null,
    account: "max",
  });

  return out;
}

async function seed() {
  console.log(`[seed-demo] userId=${USER_ID} months=${MONTHS} reset=${RESET}`);

  if (RESET) {
    const deleted = await prisma.user.deleteMany({ where: { id: USER_ID } });
    if (deleted.count) console.log(`[seed-demo] נמחק משתמש דמו קודם (${USER_ID})`);
  }

  await withUser(USER_ID, async (db: Db) => {
    const existing = await db.transaction.count({ where: { userId: USER_ID } });
    if (existing > 0) {
      console.error(
        `[seed-demo] יש כבר ${existing} תנועות אצל ${USER_ID}. הרץ עם --reset כדי לבנות מחדש.`
      );
      process.exitCode = 1;
      return;
    }

    await db.user.upsert({
      where: { id: USER_ID },
      create: { id: USER_ID, email: `${USER_ID}@plux.local`, displayName: "משתמש הדגמה" },
      update: {},
    });

    const maxAccount = await db.account.upsert({
      where: { userId_provider_label: { userId: USER_ID, provider: "MAX", label: "MAX ויזה" } },
      create: {
        userId: USER_ID,
        provider: "MAX",
        type: "CREDIT_CARD",
        label: "MAX ויזה",
        last4: "4291",
        billingCycleDay: 10,
      },
      update: {},
    });

    const bankAccount = await db.account.upsert({
      where: { userId_provider_label: { userId: USER_ID, provider: "LEUMI", label: "עו״ש לאומי" } },
      create: {
        userId: USER_ID,
        provider: "LEUMI",
        type: "BANK",
        label: "עו״ש לאומי",
        accountLast4: "5566",
        balance: "18400.00",
        balanceAt: new Date(),
        currency: "ILS",
      },
      update: {},
    });

    const created = await ensureCategories(db, USER_ID);
    console.log(`[seed-demo] ${created} קטגוריות נוצרו (מלבד מה שכבר קיים)`);
    const idBySlug = await categoryIdBySlug(db, USER_ID);

    const now = new Date();
    let totalRows = 0;

    for (let i = MONTHS - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;

      const monthRows = [...recurringRows(y, m), ...variableRows(y, m)];

      // חיוב MAX המרוכז בבנק — סוגר את המעגל: סך התנועות בכרטיס, גבייה
      // אחת בעו״ש. countsAsSpending=false כי היא כבר נספרה בכל שורה בכרטיס.
      const maxTotal = monthRows
        .filter((r) => r.account === "max")
        .reduce((sum, r) => sum + r.amount, 0);
      if (maxTotal < 0) {
        monthRows.push({
          bookedAt: utc(y, m, 10),
          chargedAt: utc(y, m, 10),
          amount: maxTotal,
          merchant: "מקס איט פיננסים",
          slug: "transfer.card_settlement",
          providerCategory: null,
          kind: "CARD_SETTLEMENT",
          countsAsSpending: false,
          note: null,
          channel: null,
          account: "bank",
        });
      }

      await db.transaction.createMany({
        data: monthRows.map((r) => ({
          userId: USER_ID,
          accountId: r.account === "max" ? maxAccount.id : bankAccount.id,
          bookedAt: r.bookedAt,
          chargedAt: r.chargedAt,
          amount: r.amount.toFixed(2),
          merchantRaw: r.merchant,
          merchant: r.merchant,
          providerCategory: r.providerCategory,
          categoryId: r.slug ? (idBySlug.get(r.slug) ?? null) : null,
          categorySource: r.slug ? "RULE" : "PROVIDER",
          kind: r.kind,
          direction: r.amount >= 0 ? "CREDIT" : "DEBIT",
          countsAsSpending: r.countsAsSpending,
          note: r.note,
          channel: r.channel,
          cardLast4: r.account === "max" ? maxAccount.last4 : null,
          txnType: "רגילה",
          dedupHash: randomUUID(),
        })),
      });

      totalRows += monthRows.length;
      console.log(`[seed-demo] ${y}-${String(m).padStart(2, "0")}: ${monthRows.length} תנועות`);
    }

    console.log(`[seed-demo] סה"כ ${totalRows} תנועות. מריץ recomputeSnapshots...`);
    const report = await recomputeSnapshots(db, USER_ID, { force: true });
    console.log(`[seed-demo] snapshots: ${report.written.length} נכתבו (${report.months.join(", ")})`);
  });

  console.log(`[seed-demo] סיום. userId לבדיקה ידנית: ${USER_ID}`);
}

seed()
  .catch((err) => {
    console.error("[seed-demo] נכשל:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
