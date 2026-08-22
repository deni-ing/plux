import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toAgorot } from "../lib/analytics/money";
import { monthPeriod, previousMonth, utcDate } from "../lib/analytics/period";
import { breakdownByCategory, compareBreakdowns, type AnalyticsTxn } from "../lib/analytics/spend";
import { feeReport } from "../lib/analytics/fees";
import { findRecurring } from "../lib/analytics/recurring";
import { buildSnapshot, isCurrent, SNAPSHOT_VERSION } from "../lib/analytics/snapshot";

let seq = 0;
function t(
  merchant: string,
  booked: [number, number, number],
  amount: string,
  slug: string | null,
  extra: Partial<AnalyticsTxn> = {}
): AnalyticsTxn {
  return {
    id: `t${seq++}`,
    bookedAt: utcDate(...booked),
    chargedAt: null,
    amount: toAgorot(amount),
    merchant,
    categorySlug: slug,
    countsAsSpending: true,
    ...extra,
  };
}

const AUG = monthPeriod(2026, 8);

const TXNS: AnalyticsTxn[] = [
  t("משכורת", [2026, 8, 1], "12000.00", "income.salary"),
  t("סופר פאפא", [2026, 8, 4], "-80.80", "food.groceries"),
  t("מינימרקט גוקר", [2026, 8, 7], "-38.00", "food.groceries"),
  t("TRADINGVIEW", [2026, 8, 2], "-659.77", "leisure.subscriptions"),
  t("עמל.ערוץ יש 11", [2026, 8, 5], "-17.90", "financial.bank_fees", { kind: "FEE" }),
  t("חיוב מקס", [2026, 8, 10], "-4300.00", "transfer.card_settlement", { countsAsSpending: false }),
  t("לא ידוע", [2026, 8, 12], "-1008.66", null),
  // יולי, להשוואה
  t("סופר פאפא", [2026, 7, 4], "-120.00", "food.groceries"),
  t("חדר כושר", [2026, 7, 26], "-199.00", "leisure.sports"),
  t("חדר כושר", [2026, 6, 26], "-199.00", "leisure.sports"),
  t("חדר כושר", [2026, 5, 26], "-199.00", "leisure.sports"),
];

function build() {
  const current = breakdownByCategory(TXNS, AUG);
  const previous = breakdownByCategory(TXNS, previousMonth(AUG));
  return buildSnapshot({
    breakdown: current,
    comparison: compareBreakdowns(current, previous),
    fees: feeReport(TXNS, AUG, { breakdown: current }),
    recurring: findRecurring(TXNS, { asOf: utcDate(2026, 8, 12) }),
  });
}

describe("buildSnapshot", () => {
  const f = build();

  it("נושא מספר גרסה", () => {
    assert.equal(f.version, SNAPSHOT_VERSION);
    assert.equal(isCurrent(f), true);
  });

  it("‏isCurrent פוסל גרסה ישנה ומבנה זר", () => {
    assert.equal(isCurrent({ ...f, version: 0 }), false);
    assert.equal(isCurrent(null), false);
    assert.equal(isCurrent("{}"), false);
    assert.equal(isCurrent({}), false);
  });

  it("הסכומים זהים למנוע", () => {
    const b = breakdownByCategory(TXNS, AUG);
    assert.equal(f.totals.expense, b.expense);
    assert.equal(f.totals.income, b.income);
    assert.equal(f.totals.net, b.net);
    assert.equal(f.totals.transfersExcluded, 1);
  });

  it("שומר את מצב החלקיות של החודש", () => {
    assert.equal(f.period.key, "2026-08");
    assert.equal(f.period.lastDataAt, "2026-08-12");
    assert.equal(f.period.partial, true);
    assert.equal(f.period.daysInPeriod, 31);
  });

  it("הלא־מסווג נכנס לרשימת הקטגוריות עם slug ריק", () => {
    const un = f.categories.find((c) => c.slug === null);
    assert.equal(un?.total, 100866);
    assert.equal(f.classification.unclassifiedAmount, 100866);
    assert.ok(f.classification.amountPct < f.classification.countPct);
  });

  it("דגל ההשוואה נשמר — ולא רק המספרים", () => {
    assert.equal(typeof f.comparison?.aligned, "boolean");
    assert.equal(f.comparison?.previousKey, "2026-07");
    assert.ok(f.comparison!.movers.length > 0);
    assert.ok(f.comparison!.movers.every((m) => m.delta !== 0));
  });

  it("סוג החיוב החוזר נשמר, לא רק הסכום השנתי", () => {
    const gym = f.recurring.find((r) => r.merchant === "חדר כושר");
    assert.equal(gym?.kind, "unknown");
    assert.equal(gym?.cadence, "monthly");
    assert.equal(gym?.amount, 19900);
    assert.ok(gym!.confidence > 0);
  });

  /**
   * זו הבדיקה שמגינה על השלב הבא. `JSON.stringify` על `Date` מחזיר
   * מחרוזת ISO עם שעה ואזור זמן; אם שדה תאריך היה נשאר `Date` בטיפוס,
   * הוא היה נכתב אחרת ממה שהטיפוס מבטיח, ורק בקריאה זה היה מתגלה.
   */
  it("עובר סבב JSON בלי לאבד דבר", () => {
    const round = JSON.parse(JSON.stringify(f));
    assert.deepEqual(round, f);
  });

  it("כל תאריך הוא YYYY-MM-DD", () => {
    const dates = [
      f.period.from,
      f.period.to,
      f.period.lastDataAt,
      ...f.recurring.map((r) => r.nextDueAt),
    ].filter((d): d is string => d !== null);
    for (const d of dates) assert.match(d, /^\d{4}-\d{2}-\d{2}$/);
  });

  it("כל סכום הוא מספר שלם — אגורות, לא שקלים", () => {
    const amounts = [
      f.totals.expense,
      f.totals.income,
      f.totals.net,
      f.fees.total,
      ...f.categories.map((c) => c.total),
      ...f.recurring.map((r) => r.annualized),
    ];
    for (const a of amounts) assert.equal(Number.isInteger(a), true, `${a} אינו שלם`);
  });

  it("אותו קלט נותן אותו פלט בדיוק", () => {
    assert.deepEqual(build(), build());
  });

  it("בלי השוואה השדה הוא null ולא חסר", () => {
    const current = breakdownByCategory(TXNS, AUG);
    const f2 = buildSnapshot({
      breakdown: current,
      fees: feeReport(TXNS, AUG),
      recurring: [],
    });
    assert.equal(f2.comparison, null);
    assert.ok("comparison" in f2);
  });
});

describe("המבנה בטוח ל-JSON", () => {
  const f = build();

  /**
   * ‏undefined אינו קיים ב-JSON: הוא נעלם בכתיבה בשקט, והטיפוס ממשיך
   * להבטיח שאולי הוא שם. הבדיקה עוברת על העץ כולו ומוודאת שאין אף אחד.
   */
  it("אין אף undefined בשום עומק", () => {
    const walk = (v: unknown, path: string): void => {
      if (v === undefined) assert.fail(`undefined ב-${path}`);
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
      }
    };
    walk(f, "facts");
  });

  it("לקטגוריה בלי תת־קטגוריות יש מערך ריק ולא שדה חסר", () => {
    for (const c of f.categories) assert.equal(Array.isArray(c.children), true);
  });
});
