import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toAgorot } from "../lib/analytics/money";
import { monthPeriod, monthsBack, utcDate } from "../lib/analytics/period";
import { breakdownByCategory, type AnalyticsTxn } from "../lib/analytics/spend";
import { feeReport, isFee, recurringFees } from "../lib/analytics/fees";

function fee(
  merchant: string,
  booked: [number, number, number],
  amount: string,
  slug: string | null = "financial.bank_fees",
  kind: AnalyticsTxn["kind"] = "FEE"
): AnalyticsTxn {
  return {
    id: `${merchant}-${booked.join("-")}`,
    bookedAt: utcDate(...booked),
    chargedAt: null,
    amount: toAgorot(amount),
    merchant,
    categorySlug: slug,
    countsAsSpending: true,
    kind,
  };
}

function purchase(
  merchant: string,
  booked: [number, number, number],
  amount: string,
  slug: string
): AnalyticsTxn {
  return {
    id: `${merchant}-${booked.join("-")}`,
    bookedAt: utcDate(...booked),
    chargedAt: null,
    amount: toAgorot(amount),
    merchant,
    categorySlug: slug,
    countsAsSpending: true,
    kind: "PURCHASE",
  };
}

describe("isFee", () => {
  it("מזהה לפי סוג התנועה גם בלי קטגוריה", () => {
    assert.equal(isFee(fee("עמל.ערוץ יש 11", [2026, 8, 1], "-17.90", null)), true);
  });

  it("מזהה לפי קטגוריה גם כשהסוג אינו FEE", () => {
    assert.equal(
      isFee(fee("דמי כרטיס", [2026, 8, 1], "-11.90", "financial.card_fees", "OTHER")),
      true
    );
  });

  it("אינו מזהה מסים כעמלה", () => {
    assert.equal(
      isFee(fee("אגרת רישוי", [2026, 8, 1], "-1500.00", "financial.taxes", "PURCHASE")),
      false
    );
  });

  it("אינו מזהה קנייה רגילה", () => {
    assert.equal(isFee(purchase("סופר", [2026, 8, 1], "-350.00", "food.groceries")), false);
  });
});

describe("feeReport", () => {
  const AUG = monthPeriod(2026, 8);
  const txns: AnalyticsTxn[] = [
    fee("עמל.ערוץ יש 11", [2026, 8, 5], "-17.90"),
    fee("דמי כרטיס", [2026, 8, 10], "-11.90", "financial.card_fees", "OTHER"),
    fee("ריבית חובה", [2026, 8, 28], "-4.20", "financial.interest", "OTHER"),
    fee("עמל.ערוץ יש 11", [2026, 7, 5], "-17.90"), // מחוץ לתקופה
    purchase("סופר", [2026, 8, 3], "-350.00", "food.groceries"),
    purchase("דלק", [2026, 8, 6], "-250.00", "transport.fuel"),
  ];

  const b = breakdownByCategory(txns, AUG);
  const r = feeReport(txns, AUG, { breakdown: b });

  it("מסכם רק את העמלות שבתקופה", () => {
    assert.equal(r.count, 3);
    assert.equal(r.total, 1790 + 1190 + 420);
  });

  it("מציג את חלקן מסך ההוצאה", () => {
    // 34.00 מתוך 634.00
    assert.equal(b.expense, 63400);
    assert.equal(r.shareOfExpense, 5.4);
  });

  it("מקבץ לפי בית עסק, מהגדול לקטן", () => {
    assert.deepEqual(
      r.byMerchant.map((l) => [l.merchant, l.total]),
      [
        ["עמל.ערוץ יש 11", 1790],
        ["דמי כרטיס", 1190],
        ["ריבית חובה", 420],
      ]
    );
  });

  it("החזר עמלה מקזז ואינו מנופח", () => {
    const withRefund = [...txns, fee("עמל.ערוץ יש 11", [2026, 8, 20], "17.90")];
    const rr = feeReport(withRefund, AUG);
    assert.equal(rr.byMerchant.find((l) => l.merchant === "עמל.ערוץ יש 11")?.total, 0);
    assert.equal(rr.total, 1190 + 420);
  });

  it("חודש בלי עמלות מחזיר 0 ולא נופל", () => {
    const r0 = feeReport([], AUG);
    assert.equal(r0.total, 0);
    assert.equal(r0.count, 0);
    assert.equal(r0.shareOfExpense, 0);
    assert.deepEqual(r0.byMerchant, []);
  });
});

describe("recurringFees", () => {
  const MONTHS = monthsBack(utcDate(2026, 8, 22), 5); // אפריל–אוגוסט

  const txns: AnalyticsTxn[] = [
    // עמלה קבועה, כל חמשת החודשים
    fee("עמל.ערוץ יש 11", [2026, 4, 5], "-17.90"),
    fee("עמל.ערוץ יש 11", [2026, 5, 5], "-17.90"),
    fee("עמל.ערוץ יש 11", [2026, 6, 5], "-17.90"),
    fee("עמל.ערוץ יש 11", [2026, 7, 5], "-17.90"),
    fee("עמל.ערוץ יש 11", [2026, 8, 5], "-17.90"),
    // עמלה משתנה, שלושה חודשים
    fee("ריבית חובה", [2026, 6, 28], "-4.20", "financial.interest", "OTHER"),
    fee("ריבית חובה", [2026, 7, 28], "-9.80", "financial.interest", "OTHER"),
    fee("ריבית חובה", [2026, 8, 28], "-1.10", "financial.interest", "OTHER"),
    // חד־פעמית
    fee("עמלת המרה", [2026, 6, 15], "-32.00", "financial.card_fees", "OTHER"),
    // מחוץ לחלון
    fee("עמל.ערוץ יש 11", [2026, 3, 5], "-17.90"),
    // רעש
    purchase("סופר", [2026, 8, 3], "-350.00", "food.groceries"),
  ];

  const r = recurringFees(txns, MONTHS);

  it("סורק את החלון הנכון ומתעלם ממה שלפניו", () => {
    assert.deepEqual(r.months, ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
    assert.equal(r.total, 1790 * 5 + 420 + 980 + 110 + 3200);
  });

  it("עמלה חד־פעמית אינה חוזרת", () => {
    assert.ok(!r.fees.some((f) => f.merchant === "עמלת המרה"));
  });

  /** זו השורה שכל הסעיף קיים בשבילה. */
  it("‏₪17.90 בחודש הם ₪214.80 בשנה", () => {
    const f = r.fees.find((x) => x.merchant === "עמל.ערוץ יש 11");
    assert.equal(f?.monthsSeen, 5);
    assert.equal(f?.monthsScanned, 5);
    assert.equal(f?.monthlyAvg, 1790);
    assert.equal(f?.annualized, 21480);
    assert.equal(f?.fixedAmount, true);
  });

  it("עמלה משתנה מזוהה ככזו, והממוצע הוא ממוצע", () => {
    const f = r.fees.find((x) => x.merchant === "ריבית חובה");
    assert.equal(f?.monthsSeen, 3);
    assert.equal(f?.fixedAmount, false);
    assert.deepEqual(f?.amounts, [110, 420, 980]);
    assert.equal(f?.monthlyAvg, Math.round((420 + 980 + 110) / 3)); // 503
  });

  it("מסודר לפי ההשלכה השנתית", () => {
    assert.deepEqual(
      r.fees.map((f) => f.merchant),
      ["עמל.ערוץ יש 11", "ריבית חובה"]
    );
    assert.equal(r.annualizedTotal, 21480 + 503 * 12);
  });

  it("סף minMonths ניתן להזזה", () => {
    const strict = recurringFees(txns, MONTHS, { minMonths: 5 });
    assert.deepEqual(strict.fees.map((f) => f.merchant), ["עמל.ערוץ יש 11"]);
  });

  it("חלון ריק אינו זורק", () => {
    const none = recurringFees(txns, []);
    assert.deepEqual(none.fees, []);
    assert.equal(none.total, 0);
    assert.equal(none.annualizedTotal, 0);
  });
});
