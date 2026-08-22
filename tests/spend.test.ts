import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { monthPeriod, utcDate } from "../lib/analytics/period";
import { toAgorot } from "../lib/analytics/money";
import {
  breakdownByCategory,
  compareBreakdowns,
  type AnalyticsTxn,
} from "../lib/analytics/spend";

/**
 * מערך תנועות סינתטי שהתשובה שלו חושבה ביד לפני שנכתב הקוד.
 *
 * הוא קטן בכוונה — 13 שורות — וכל שורה קיימת כדי לייצג מקרה אחד
 * שראינו בנתונים האמיתיים:
 *
 *   • משכורת מהבנק, בלי תאריך חיוב
 *   • קניות MAX מאוגוסט שמחויבות ב-10 בספטמבר
 *   • חיוב MAX המרוכז בבנק — TRANSFER, לא נספר
 *   • העברת ביט — TRANSFER, לא נספרת
 *   • תנועה לא מסווגת
 *   • זיכוי חיובי בקטגוריית הוצאה
 *   • תנועה שנופלת מחוץ לתקופה בבסיס אחד ובתוכה בבסיס השני
 *   • עמלת בנק של ₪17.90
 *
 * **הטסט לא בודק שהקוד עושה מה שהוא עושה.** הוא בודק מול מספרים שחושבו
 * בנפרד ממנו. זה ההבדל בין טסט לבין תיעוד של באג.
 */
function txn(
  id: string,
  booked: [number, number, number],
  charged: [number, number, number] | null,
  amount: string,
  slug: string | null,
  countsAsSpending = true
): AnalyticsTxn {
  return {
    id,
    bookedAt: utcDate(...booked),
    chargedAt: charged ? utcDate(...charged) : null,
    amount: toAgorot(amount),
    merchant: id,
    categorySlug: slug,
    countsAsSpending,
  };
}

const AUG = monthPeriod(2026, 8);

const FIXTURE: AnalyticsTxn[] = [
  txn("משכורת", [2026, 8, 1], null, "12000.00", "income.salary"),
  txn("סופר א", [2026, 8, 5], [2026, 9, 10], "-350.50", "food.groceries"),
  txn("סופר ב", [2026, 8, 12], [2026, 9, 10], "-120.00", "food.groceries"),
  txn("מסעדה", [2026, 8, 14], [2026, 9, 10], "-89.00", "food.restaurants"),
  txn("דלק", [2026, 8, 6], [2026, 9, 10], "-250.00", "transport.fuel"),
  txn("חיוב מקס", [2026, 8, 10], null, "-4300.00", "transfer.card_settlement", false),
  txn("ביט", [2026, 8, 11], null, "-200.00", "transfer.p2p", false),
  txn("לא ידוע", [2026, 8, 20], null, "-49.90", null),
  txn("זיכוי נעליים", [2026, 8, 22], [2026, 9, 10], "200.00", "shopping.clothing"),
  txn("נעליים", [2026, 8, 3], [2026, 9, 10], "-300.00", "shopping.clothing"),
  txn("סופר יולי", [2026, 7, 30], [2026, 8, 10], "-100.00", "food.groceries"),
  txn("קפה", [2026, 8, 25], [2026, 9, 10], "-75.00", "food.cafe"),
  txn("עמלת ערוץ ישיר", [2026, 8, 31], null, "-17.90", "financial.bank_fees"),
];

describe("breakdownByCategory — בסיס booked", () => {
  const b = breakdownByCategory(FIXTURE, AUG, { basis: "booked" });

  it("סך ההוצאה חושב ביד: 1,052.30 ₪", () => {
    assert.equal(b.expense, 105230);
  });

  it("סך ההכנסה הוא המשכורת בלבד", () => {
    assert.equal(b.income, 1200000);
    assert.equal(b.net, 1094770);
  });

  it("‏10 תנועות נספרו, 2 העברות הוחרגו, אחת מחוץ לתקופה", () => {
    assert.equal(b.txnCount, 10);
    assert.equal(b.excluded.transfers, 2);
    assert.equal(b.excluded.transfersTotal, -450000);
    assert.equal(b.excluded.outOfPeriod, 1);
  });

  /**
   * הבדיקה החשובה ביותר בקובץ. בלי ההחרגה של TRANSFER סך ההוצאה היה
   * ‏5,552.30 ₪ — פי חמישה — וזה נראה סביר לגמרי בדוח.
   */
  it("חיוב האשראי המרוכז לא נספר כהוצאה", () => {
    const slugs = b.categories.map((c) => c.slug);
    assert.ok(!slugs.includes("transfer"));
    assert.ok(b.expense < 110000);
  });

  it("הקטגוריות מסודרות מהגדולה לקטנה", () => {
    assert.deepEqual(
      b.categories.map((c) => [c.slug, c.total]),
      [
        ["food", 63450],
        ["transport", 25000],
        ["shopping", 10000],
        ["financial", 1790],
      ]
    );
  });

  it("זיכוי מקזז את הקטגוריה שלו ואינו הכנסה", () => {
    const shopping = b.categories.find((c) => c.slug === "shopping");
    assert.equal(shopping?.total, 10000); // 300 − 200
    assert.equal(shopping?.count, 2);
    assert.equal(b.income, 1200000); // הזיכוי לא נכנס לכאן
  });

  it("תת־קטגוריות מסתכמות לקטגוריית האם", () => {
    const food = b.categories.find((c) => c.slug === "food");
    assert.equal(food?.count, 4);
    assert.deepEqual(
      food?.children.map((c) => [c.slug, c.total]),
      [
        ["food.groceries", 47050],
        ["food.restaurants", 8900],
        ["food.cafe", 7500],
      ]
    );
    const sum = food!.children.reduce((s, c) => s + c.total, 0);
    assert.equal(sum, food!.total);
  });

  it("הלא־מסווג מקבל שורה משלו ואינו נבלע ב'שונות'", () => {
    assert.equal(b.unclassified?.total, 4990);
    assert.equal(b.unclassified?.count, 1);
    assert.ok(!b.categories.some((c) => c.slug === "misc"));
  });

  it("כל השורות יחד שוות בדיוק לסך ההוצאה", () => {
    const sum =
      b.categories.reduce((s, c) => s + c.total, 0) + (b.unclassified?.total ?? 0);
    assert.equal(sum, b.expense);
  });

  it("אחוזים מסתכמים ל-100 עד כדי עיגול", () => {
    const total =
      b.categories.reduce((s, c) => s + c.share, 0) + (b.unclassified?.share ?? 0);
    assert.ok(Math.abs(total - 100) < 0.5, `סך האחוזים ${total}`);
  });

  it("בבסיס booked אין נפילות תאריך", () => {
    assert.equal(b.fallbackDates, 0);
  });
});

describe("breakdownByCategory — בסיס charged", () => {
  const b = breakdownByCategory(FIXTURE, AUG, { basis: "charged" });

  /**
   * אותן 13 תנועות בדיוק, תשובה אחרת לגמרי. זה מה שהופך את הבסיס
   * לפרמטר ולא להחלטה חד־פעמית.
   */
  it("קניות MAX מאוגוסט יוצאות מהחודש", () => {
    assert.equal(b.excluded.outOfPeriod, 7);
    assert.equal(b.txnCount, 4);
  });

  it("קניית יולי שחויבה באוגוסט נכנסת", () => {
    const food = b.categories.find((c) => c.slug === "food");
    assert.equal(food?.total, 10000);
    assert.equal(food?.count, 1);
  });

  it("סך ההוצאה שונה מהותית מבסיס booked", () => {
    assert.equal(b.expense, 16780); // 49.90 + 100 + 17.90
  });

  it("‏5 תנועות בנק נפלו חזרה ל-bookedAt, והמספר מדווח", () => {
    assert.equal(b.fallbackDates, 5);
  });
});

describe("מקרי קצה", () => {
  it("חודש ריק אינו זורק ואינו מחזיר NaN", () => {
    const b = breakdownByCategory([], AUG);
    assert.equal(b.expense, 0);
    assert.equal(b.income, 0);
    assert.equal(b.net, 0);
    assert.equal(b.categories.length, 0);
    assert.equal(b.unclassified, null);
    assert.equal(b.txnCount, 0);
  });

  it("חודש של העברות בלבד מציג 0 הוצאות ולא חודש חסר", () => {
    const only = FIXTURE.filter((t) => !t.countsAsSpending);
    const b = breakdownByCategory(only, AUG);
    assert.equal(b.expense, 0);
    assert.equal(b.excluded.transfers, 2);
  });

  it("תנועה שסווגה לקטגוריית־על ולא לתת־קטגוריה לא נספרת פעמיים", () => {
    const b = breakdownByCategory(
      [txn("סתם אוכל", [2026, 8, 4], null, "-50.00", "food")],
      AUG
    );
    const food = b.categories.find((c) => c.slug === "food");
    assert.equal(food?.total, 5000);
    assert.equal(food?.children.length, 0);
    assert.equal(b.expense, 5000);
  });

  it("‏slug שאינו בעץ נחשב הוצאה ולא מפיל את החישוב", () => {
    const b = breakdownByCategory(
      [txn("קטגוריה של המשתמש", [2026, 8, 4], null, "-50.00", "myown.thing")],
      AUG
    );
    assert.equal(b.expense, 5000);
    assert.equal(b.categories[0]?.slug, "myown");
  });

  it("ברירת המחדל היא booked", () => {
    const a = breakdownByCategory(FIXTURE, AUG);
    const b = breakdownByCategory(FIXTURE, AUG, { basis: "booked" });
    assert.equal(a.basis, "booked");
    assert.equal(a.expense, b.expense);
  });

  it("שם מהמסד גובר על השם שבעץ", () => {
    const names = new Map([["food", "אוכל שלי"]]);
    const b = breakdownByCategory(FIXTURE, AUG, { names });
    assert.equal(b.categories.find((c) => c.slug === "food")?.name, "אוכל שלי");
  });
});

describe("compareBreakdowns", () => {
  const JUL = monthPeriod(2026, 7);
  const july: AnalyticsTxn[] = [
    txn("סופר יולי", [2026, 7, 5], null, "-500.00", "food.groceries"),
    txn("חדר כושר", [2026, 7, 8], null, "-199.00", "leisure.sports"),
    txn("משכורת", [2026, 7, 1], null, "12000.00", "income.salary"),
  ];

  const cmp = compareBreakdowns(
    breakdownByCategory(FIXTURE, AUG),
    breakdownByCategory(july, JUL)
  );

  it("מחשב את ההפרש בסך ההוצאה", () => {
    assert.equal(cmp.previous.expense, 69900);
    assert.equal(cmp.current.expense, 105230);
    assert.equal(cmp.expenseDelta, 35330);
  });

  /**
   * ‏"מה השתנה הכי הרבה" אינו "מה הכי גדול". תחבורה עלתה ב-250 ₪ מאפס
   * ומזון עלה ב-134.50 ₪ — אף שמזון גדול ממנה פי שניים בערך המוחלט.
   * הסדר הוא לפי גודל השינוי, וכתבתי אותו כאן לא נכון בפעם הראשונה.
   */
  it("מסדר לפי גודל השינוי המוחלט, לא לפי גודל הקטגוריה", () => {
    assert.deepEqual(
      cmp.categories.slice(0, 3).map((c) => [c.slug, c.delta]),
      [
        ["transport", 25000],
        ["leisure", -19900],
        ["food", 13450],
      ]
    );
    const abs = cmp.categories.map((c) => Math.abs(c.delta));
    assert.deepEqual(abs, [...abs].sort((a, b) => b - a));
  });

  it("קטגוריה שנעלמה מופיעה עם ירידה מלאה", () => {
    const sports = cmp.categories.find((c) => c.slug === "leisure");
    assert.equal(sports?.current, 0);
    assert.equal(sports?.previous, 19900);
    assert.equal(sports?.delta, -19900);
    assert.equal(sports?.deltaPct, -100);
  });

  /** "עלייה של אינסוף אחוז" אינה מידע. */
  it("קטגוריה חדשה מקבלת deltaPct = null ולא Infinity", () => {
    const financial = cmp.categories.find((c) => c.slug === "financial");
    assert.equal(financial?.previous, 0);
    assert.equal(financial?.deltaPct, null);
  });
});
