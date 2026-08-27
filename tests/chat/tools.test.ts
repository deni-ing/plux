import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runTool, type ToolResult } from "../../lib/chat/tools";
import { utcDate } from "../../lib/analytics/period";
import type { Db } from "../../lib/db/client";

/**
 * טסט יחידה לכל כלי. משימה 7.6.
 *
 * ‏tests/chat/client.test.ts בודק את לולאת הקריאה לכלים עם `runTool`
 * מזויף — ובכוונה לא נוגע במימוש האמיתי. הטסט הזה הוא ההשלמה: מריץ את
 * `runTool` האמיתי מ-lib/chat/tools.ts, שקורא בפועל ל-`factsFor`,
 * ל-`browse` ול-`availableMonths` — כל השכבה שביניהן ובין המסד.
 *
 * ‏`Db` האמיתי לא נחוץ: `FakeDb` למטה מקיים את אותו ממשק במובן המבני
 * (structural typing) בדיוק כמו ה-`ChatClient` המזויף ב-client.test.ts —
 * לא מוק גנרי של Prisma, רק שלוש השאילתות שהקוד הזה באמת שולח
 * (transaction.findMany/findFirst, category.findMany, ו-
 * analyticsSnapshot.findUnique שתמיד מחזיר null כדי לכפות את מסלול
 * החישוב החי, בדיוק כמו שהוא קורה כשאין עדיין סנפשוט שמור).
 */

type FakeTxn = {
  id: string;
  userId: string;
  bookedAt: Date;
  chargedAt: Date;
  amount: string;
  merchant: string;
  kind: string;
  note: string | null;
  countsAsSpending: boolean;
  individualChargeDate: boolean;
  categoryId: string | null;
  categorySource: string;
  category: { slug: string; name: string } | null;
  account: { label: string };
};

function txn(opts: {
  id: string;
  userId?: string;
  booked: [number, number, number];
  amount: string;
  slug?: string | null;
  name?: string;
  merchant?: string;
}): FakeTxn {
  const bookedAt = utcDate(...opts.booked);
  return {
    id: opts.id,
    userId: opts.userId ?? USER,
    bookedAt,
    chargedAt: bookedAt,
    amount: opts.amount,
    merchant: opts.merchant ?? opts.id,
    kind: "PURCHASE",
    note: null,
    countsAsSpending: true,
    individualChargeDate: false,
    categoryId: opts.slug ? opts.slug : null,
    categorySource: opts.slug ? "RULE" : "PROVIDER",
    category: opts.slug ? { slug: opts.slug, name: opts.name ?? opts.slug } : null,
    account: { label: "חשבון בדיקה" },
  };
}

const USER = "user_test";

/** תנאי `where` שהקוד הנבדק באמת שולח — לא מנוע שאילתות כללי. */
function matchWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (key === "OR") {
      const clauses = cond as Record<string, unknown>[];
      if (!clauses.some((c) => matchWhere(row, c))) return false;
      continue;
    }
    const val = row[key];
    if (cond === null) {
      if (val !== null && val !== undefined) return false;
      continue;
    }
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      const c = cond as { gte?: Date; lt?: Date; contains?: string };
      if (c.gte !== undefined || c.lt !== undefined) {
        const t = (val as Date).getTime();
        if (c.gte !== undefined && !(t >= c.gte.getTime())) return false;
        if (c.lt !== undefined && !(t < c.lt.getTime())) return false;
        continue;
      }
      if (c.contains !== undefined) {
        if (!(typeof val === "string" && val.includes(c.contains))) return false;
        continue;
      }
      // יחס מקונן, למשל category: { slug: "food.groceries" }.
      if (!matchWhere((val as Record<string, unknown>) ?? {}, cond as Record<string, unknown>)) return false;
      continue;
    }
    if (val !== cond) return false;
  }
  return true;
}

function sortRows<T extends Record<string, unknown>>(
  rows: T[],
  orderBy: Record<string, "asc" | "desc"> | Record<string, "asc" | "desc">[] | undefined
): T[] {
  if (!orderBy) return rows;
  const clauses = Array.isArray(orderBy) ? orderBy : [orderBy];
  const [clause] = clauses;
  if (!clause) return rows;
  const [[field, dir]] = Object.entries(clause);
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = a[field] as Date;
    const bv = b[field] as Date;
    return (av.getTime() - bv.getTime()) * sign;
  });
}

function fakeDb(txns: FakeTxn[]): Db {
  return {
    transaction: {
      findMany: async (args: { where: Record<string, unknown>; orderBy?: unknown; take?: number }) => {
        let rows = txns.filter((t) => matchWhere(t as unknown as Record<string, unknown>, args.where));
        rows = sortRows(rows, args.orderBy as never);
        if (args.take) rows = rows.slice(0, args.take);
        return rows;
      },
      findFirst: async (args: { where: Record<string, unknown>; orderBy?: unknown }) => {
        let rows = txns.filter((t) => matchWhere(t as unknown as Record<string, unknown>, args.where));
        rows = sortRows(rows, args.orderBy as never);
        return rows[0] ?? null;
      },
    },
    category: {
      findMany: async (args: { where: Record<string, unknown> }) => {
        const seen = new Map<string, { slug: string; name: string }>();
        for (const t of txns) {
          if (t.userId === args.where.userId && t.category) seen.set(t.category.slug, t.category);
        }
        return [...seen.values()];
      },
    },
    analyticsSnapshot: {
      // תמיד null: מכריח את מסלול החישוב החי (factsFor → computeMonth),
      // בדיוק כמו במשתמש שעוד לא הורץ עליו recomputeSnapshots.
      findUnique: async () => null,
    },
  } as unknown as Db;
}

// אוגוסט 2026 לפי PERIOD_START_DAY=7: 07-08 עד 06-09 כולל.
// << slugs שטוחים בכוונה, בלי נקודה: breakdownByCategory (lib/analytics/spend.ts)
//    מקבץ slug מנוקד תחת slug-האב שלו (parentSlug), והשם של קטגוריית-האב
//    עצמה נלקח מ-`names` (categoryNames) ולא מהתנועה — לא רלוונטי למה
//    שהטסט הזה בודק (חיווט runTool↔factsFor↔breakdownByCategory), אז
//    לא כדאי להיתלות גם בעץ הקטגוריות האמיתי וגם בהתנהגות ההורה/ילד.
//    ההתנהגות המקוננת עצמה כבר מכוסה ב-tests/spend.test.ts.
const FIXTURE: FakeTxn[] = [
  txn({ id: "t1", booked: [2026, 8, 10], amount: "-120.50", slug: "groceries", name: "מכולת", merchant: "שופרסל" }),
  txn({ id: "t2", booked: [2026, 8, 20], amount: "-300.00", slug: "fuel", name: "דלק", merchant: "פז" }),
  txn({ id: "t3", booked: [2026, 8, 25], amount: "-50.00", slug: null, merchant: "לא ידוע" }),
  txn({ id: "t4", booked: [2026, 7, 15], amount: "-80.00", slug: "groceries", name: "מכולת", merchant: "שופרסל" }),
  // משתמש אחר — לוודא שאף שאילתה לא חוצה גבול משתמשים.
  txn({ id: "other", userId: "user_other", booked: [2026, 8, 10], amount: "-999.00", slug: null }),
];

const DB = fakeDb(FIXTURE);
const EMPTY_DB = fakeDb([]);

describe("runTool — getMonthlyReport", () => {
  it("מחשב בפועל מתנועות (בלי snapshot שמור) ומחזיר בשקלים", async () => {
    const result = await runTool(DB, USER, "getMonthlyReport", { month: "2026-08" });
    assert.equal(result.tool, "getMonthlyReport");
    if (result.tool !== "getMonthlyReport" || !("facts" in result)) throw new Error("expected facts");

    assert.equal(result.facts.period.key, "2026-08");
    // t1 + t2 + t3 = 120.50 + 300 + 50 = 470.50 ₪.
    assert.equal(result.facts.totals.expense, 470.5);
    assert.equal(result.facts.classification.unclassifiedCount, 1);

    const groceries = result.facts.categories.find((c) => c.slug === "groceries");
    assert.ok(groceries, "קטגוריית groceries חסרה בתשובה");
    assert.equal(groceries?.name, "מכולת");
    assert.equal(groceries?.total, 120.5);
  });

  it("בלי month — נופל לחודש האחרון שיש בו נתונים (לא לחודש הקלנדרי)", async () => {
    const result = await runTool(DB, USER, "getMonthlyReport", {});
    assert.equal(result.tool, "getMonthlyReport");
    if (result.tool !== "getMonthlyReport" || !("facts" in result)) throw new Error("expected facts");
    assert.equal(result.facts.period.key, "2026-08");
  });

  it("חודש בלי נתונים — תוצאת שגיאה, לא זריקה", async () => {
    const result: ToolResult = await runTool(DB, USER, "getMonthlyReport", { month: "2020-01" });
    assert.equal(result.tool, "getMonthlyReport");
    assert.ok("error" in result && result.error.includes("2020-01"));
  });

  it("משתמש בלי אף תנועה — שגיאה כללית, לא קריסה על latestPeriod", async () => {
    const result = await runTool(EMPTY_DB, USER, "getMonthlyReport", {});
    assert.equal(result.tool, "getMonthlyReport");
    assert.ok("error" in result);
  });
});

describe("runTool — findTransactions", () => {
  it("מסנן לפי חודש ומחזיר מהחדש לישן", async () => {
    const result = await runTool(DB, USER, "findTransactions", { month: "2026-08" });
    assert.equal(result.tool, "findTransactions");
    if (result.tool !== "findTransactions") throw new Error("expected findTransactions");
    assert.deepEqual(
      result.transactions.map((t) => (t as { id: string }).id),
      ["t3", "t2", "t1"]
    );
  });

  it("מסנן לפי קטגוריה", async () => {
    const result = await runTool(DB, USER, "findTransactions", { category: "groceries" });
    assert.equal(result.tool, "findTransactions");
    if (result.tool !== "findTransactions") throw new Error("expected findTransactions");
    assert.equal(result.count, 2);
    assert.deepEqual(
      result.transactions.map((t) => (t as { id: string }).id).sort(),
      ["t1", "t4"]
    );
  });

  it("מסנן לפי חיפוש חופשי בשם בית העסק", async () => {
    const result = await runTool(DB, USER, "findTransactions", { merchant: "שופרסל" });
    assert.equal(result.tool, "findTransactions");
    if (result.tool !== "findTransactions") throw new Error("expected findTransactions");
    assert.equal(result.count, 2);
  });

  it("unclassifiedOnly מחזיר רק תנועות בלי קטגוריה, ולא של משתמש אחר", async () => {
    const result = await runTool(DB, USER, "findTransactions", { unclassifiedOnly: true });
    assert.equal(result.tool, "findTransactions");
    if (result.tool !== "findTransactions") throw new Error("expected findTransactions");
    assert.deepEqual(
      result.transactions.map((t) => (t as { id: string }).id),
      ["t3"]
    );
  });

  it("limit מוגבל ל-1..100", async () => {
    const result = await runTool(DB, USER, "findTransactions", { month: "2026-08", limit: 1 });
    assert.equal(result.tool, "findTransactions");
    if (result.tool !== "findTransactions") throw new Error("expected findTransactions");
    assert.equal(result.count, 1);
  });
});

describe("runTool — listAvailableMonths", () => {
  it("מהחדש לישן, רק החודשים שיש בהם נתונים למשתמש הזה", async () => {
    const result = await runTool(DB, USER, "listAvailableMonths", {});
    assert.equal(result.tool, "listAvailableMonths");
    if (result.tool !== "listAvailableMonths") throw new Error("expected listAvailableMonths");
    assert.deepEqual(result.months, ["2026-08", "2026-07"]);
  });

  it("משתמש בלי תנועות — מערך ריק, לא שגיאה", async () => {
    const result = await runTool(EMPTY_DB, USER, "listAvailableMonths", {});
    assert.equal(result.tool, "listAvailableMonths");
    if (result.tool !== "listAvailableMonths") throw new Error("expected listAvailableMonths");
    assert.deepEqual(result.months, []);
  });
});
