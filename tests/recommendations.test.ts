import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatILS, type Agorot } from "../lib/analytics/money";
import {
  buildRecommendations,
  budgetOverStreak,
  detectSavingsTransfer,
  idleCashWorthChecking,
  type BudgetStreak,
  type RecommendationTxn,
} from "../lib/recommendations/engine";

const DAY_MS = 86_400_000;
const base = new Date(2026, 0, 1);
const plusDays = (n: number) => new Date(base.getTime() + n * DAY_MS);

describe("detectSavingsTransfer", () => {
  it("4 העברות TRANSFER_OUT חודשיות קבועות באותו סכום → מזוהה", () => {
    const txns: RecommendationTxn[] = [0, 30, 60, 90].map((n) => ({
      bookedAt: plusDays(n),
      amount: -50_000, // ₪500-, שלילי = יוצא
      merchant: "בנק חיסכון",
      kind: "TRANSFER_OUT",
    }));
    const signal = detectSavingsTransfer(txns);
    assert.ok(signal);
    assert.equal(signal.merchant, "בנק חיסכון");
    assert.equal(signal.amount, 50_000);
    assert.equal(signal.occurrences, 4);
    assert.equal(signal.dayOfMonth, plusDays(90).getDate());
  });

  it("פחות מ-3 חזרות → null (MIN_OCCURRENCES)", () => {
    const txns: RecommendationTxn[] = [0, 30].map((n) => ({
      bookedAt: plusDays(n),
      amount: -50_000,
      merchant: "בנק חיסכון",
      kind: "TRANSFER_OUT",
    }));
    assert.equal(detectSavingsTransfer(txns), null);
  });

  it("קצב שבועי ולא חודשי → לא נחשב הוראת קבע לחיסכון", () => {
    const txns: RecommendationTxn[] = [0, 7, 14, 21].map((n) => ({
      bookedAt: plusDays(n),
      amount: -20_000,
      merchant: "מנוי כלשהו",
      kind: "TRANSFER_OUT",
    }));
    assert.equal(detectSavingsTransfer(txns), null);
  });

  it("קצב לא סדיר → ביטחון נמוך מהסף → null", () => {
    const txns: RecommendationTxn[] = [0, 30, 45, 100].map((n) => ({
      bookedAt: plusDays(n),
      amount: -50_000,
      merchant: "בנק חיסכון",
      kind: "TRANSFER_OUT",
    }));
    assert.equal(detectSavingsTransfer(txns), null);
  });

  it("מתעלם מתנועות שאינן TRANSFER_OUT", () => {
    const txns: RecommendationTxn[] = [0, 30, 60, 90].map((n) => ({
      bookedAt: plusDays(n),
      amount: -50_000,
      merchant: "סופר",
      kind: "PURCHASE",
    }));
    assert.equal(detectSavingsTransfer(txns), null);
  });

  it("כמה ספקים — בוחר את בעל הביטחון הגבוה ביותר", () => {
    const strong: RecommendationTxn[] = [0, 30, 60, 90].map((n) => ({
      bookedAt: plusDays(n),
      amount: -50_000,
      merchant: "חיסכון קבוע",
      kind: "TRANSFER_OUT",
    }));
    const weak: RecommendationTxn[] = [0, 30, 45, 100].map((n) => ({
      bookedAt: plusDays(n),
      amount: -30_000,
      merchant: "חיסכון לא סדיר",
      kind: "TRANSFER_OUT",
    }));
    const signal = detectSavingsTransfer([...strong, ...weak]);
    assert.ok(signal);
    assert.equal(signal.merchant, "חיסכון קבוע");
  });
});

describe("budgetOverStreak", () => {
  const caps = new Map([
    ["coffee", { cap: 300_00 as Agorot, name: "קפה" }],
    ["groceries", { cap: 2_000_00 as Agorot, name: "סופר" }],
  ]);

  it("קטגוריה שחרגה בכל החודשים (מהישן לחדש) → כלולה", () => {
    const monthlySpend = [
      new Map([["coffee", 350_00 as Agorot]]),
      new Map([["coffee", 400_00 as Agorot]]),
      new Map([["coffee", 500_00 as Agorot]]),
    ];
    const streaks = budgetOverStreak(monthlySpend, caps);
    assert.equal(streaks.length, 1);
    assert.equal(streaks[0].categorySlug, "coffee");
    assert.equal(streaks[0].monthsOver, 3);
    assert.equal(streaks[0].latestSpent, 500_00);
    assert.equal(streaks[0].cap, 300_00);
  });

  it("קטגוריה שלא חרגה בחודש אחד → לא כלולה", () => {
    const monthlySpend = [
      new Map([["coffee", 350_00 as Agorot]]),
      new Map([["coffee", 250_00 as Agorot]]), // מתחת לתקרה
      new Map([["coffee", 500_00 as Agorot]]),
    ];
    assert.deepEqual(budgetOverStreak(monthlySpend, caps), []);
  });

  it("קטגוריה בלי תקציב מוגדר לא יכולה 'לחרוג'", () => {
    const monthlySpend = [
      new Map([["rent", 5_000_00 as Agorot]]),
      new Map([["rent", 5_000_00 as Agorot]]),
    ];
    assert.deepEqual(budgetOverStreak(monthlySpend, caps), []);
  });

  it("ממוין לפי latestSpent יורד", () => {
    const monthlySpend = [
      new Map([
        ["coffee", 350_00 as Agorot],
        ["groceries", 2_500_00 as Agorot],
      ]),
      new Map([
        ["coffee", 400_00 as Agorot],
        ["groceries", 2_600_00 as Agorot],
      ]),
    ];
    const streaks = budgetOverStreak(monthlySpend, caps);
    assert.equal(streaks.length, 2);
    assert.equal(streaks[0].categorySlug, "groceries");
    assert.equal(streaks[1].categorySlug, "coffee");
  });

  it("מערך חודשים ריק → תוצאה ריקה", () => {
    assert.deepEqual(budgetOverStreak([], caps), []);
  });
});

describe("idleCashWorthChecking", () => {
  it("יתרה מעל פי 2 מההוצאה החודשית → true", () => {
    assert.equal(idleCashWorthChecking(30_000_00, 10_000_00), true);
  });

  it("יתרה בדיוק פי 2 → false (סף חד: > ולא >=)", () => {
    assert.equal(idleCashWorthChecking(20_000_00, 10_000_00), false);
  });

  it("balance null → false", () => {
    assert.equal(idleCashWorthChecking(null, 10_000_00), false);
  });

  it("avgMonthlyExpense null → false", () => {
    assert.equal(idleCashWorthChecking(30_000_00, null), false);
  });

  it("avgMonthlyExpense <= 0 → false", () => {
    assert.equal(idleCashWorthChecking(30_000_00, 0), false);
    assert.equal(idleCashWorthChecking(30_000_00, -100), false);
  });
});

describe("buildRecommendations", () => {
  it("שלושת האותות ביחד — סדר קבוע: העברה, תקציב, כסף עומד", () => {
    const savingsTransfer = { merchant: "בנק", amount: 50_000, dayOfMonth: 5, occurrences: 6 };
    const budgetStreaks: BudgetStreak[] = [
      { categorySlug: "coffee", categoryName: "קפה", monthsOver: 3, latestSpent: 500_00, cap: 300_00 },
    ];
    const idleCash = { balance: 30_000_00, avgMonthlyExpense: 10_000_00 };

    const recs = buildRecommendations({ savingsTransfer, budgetStreaks, idleCash });
    assert.equal(recs.length, 3);
    assert.equal(recs[0].id, "savings-transfer");
    assert.equal(recs[0].tone, "confirmed");
    assert.ok(recs[0].title.includes(formatILS(50_000)));
    assert.equal(recs[1].id, "budget-coffee");
    assert.equal(recs[1].tone, "action");
    assert.equal(recs[1].amount, 500_00 - 300_00);
    assert.equal(recs[2].id, "idle-cash");
    assert.equal(recs[2].tone, "tip");
    assert.equal(recs[2].amount, null);
  });

  it("budgetStreaks חתוך ל-2 הראשונים בלבד", () => {
    const budgetStreaks: BudgetStreak[] = [
      { categorySlug: "a", categoryName: "א", monthsOver: 3, latestSpent: 900_00, cap: 100_00 },
      { categorySlug: "b", categoryName: "ב", monthsOver: 3, latestSpent: 800_00, cap: 100_00 },
      { categorySlug: "c", categoryName: "ג", monthsOver: 3, latestSpent: 700_00, cap: 100_00 },
    ];
    const recs = buildRecommendations({ savingsTransfer: null, budgetStreaks, idleCash: null });
    assert.equal(recs.length, 2);
    assert.deepEqual(recs.map((r) => r.id), ["budget-a", "budget-b"]);
  });

  it("שלושת האותות ריקים → רשימה ריקה", () => {
    assert.deepEqual(
      buildRecommendations({ savingsTransfer: null, budgetStreaks: [], idleCash: null }),
      []
    );
  });
});
