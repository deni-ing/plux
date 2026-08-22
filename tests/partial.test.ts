import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toAgorot } from "../lib/analytics/money";
import {
  dayOfPeriod,
  daysIn,
  firstDays,
  isoDay,
  monthPeriod,
  previousMonth,
  utcDate,
} from "../lib/analytics/period";
import {
  breakdownByCategory,
  compareBreakdowns,
  type AnalyticsTxn,
} from "../lib/analytics/spend";

function t(
  id: string,
  booked: [number, number, number],
  amount: string,
  slug: string | null = "food.groceries",
  countsAsSpending = true
): AnalyticsTxn {
  return {
    id,
    bookedAt: utcDate(...booked),
    chargedAt: null,
    amount: toAgorot(amount),
    merchant: id,
    categorySlug: slug,
    countsAsSpending,
  };
}

describe("עזרי ימים", () => {
  const AUG = monthPeriod(2026, 8);

  it("סופר ימים בחודש", () => {
    assert.equal(daysIn(AUG), 31);
    assert.equal(daysIn(monthPeriod(2026, 2)), 28);
    assert.equal(daysIn(monthPeriod(2028, 2)), 29);
    assert.equal(daysIn(monthPeriod(2026, 4)), 30);
  });

  it("היום בתקופה הוא 1-based", () => {
    assert.equal(dayOfPeriod(utcDate(2026, 8, 1), AUG), 1);
    assert.equal(dayOfPeriod(utcDate(2026, 8, 17), AUG), 17);
    assert.equal(dayOfPeriod(utcDate(2026, 8, 31), AUG), 31);
  });

  it("firstDays חותך חלון חצי־פתוח", () => {
    const w = firstDays(monthPeriod(2026, 7), 17);
    assert.equal(isoDay(w.from), "2026-07-01");
    assert.equal(isoDay(w.to), "2026-07-18");
    assert.equal(daysIn(w), 17);
  });

  it("firstDays לא חורג מהתקופה", () => {
    const w = firstDays(monthPeriod(2026, 2), 90);
    assert.equal(isoDay(w.to), "2026-03-01");
    assert.equal(daysIn(w), 28);
  });
});

describe("חודש חלקי", () => {
  const AUG = monthPeriod(2026, 8);

  /** התנועה האחרונה בנתונים האמיתיים היא ה-17 באוגוסט. */
  const partial = [
    t("א", [2026, 8, 3], "-100.00"),
    t("ב", [2026, 8, 17], "-200.00"),
  ];

  it("מזהה שהנתונים נגמרים באמצע", () => {
    const b = breakdownByCategory(partial, AUG);
    assert.equal(isoDay(b.coverage.lastDataAt!), "2026-08-17");
    assert.equal(b.coverage.daysCovered, 17);
    assert.equal(b.coverage.daysInPeriod, 31);
    assert.equal(b.coverage.partial, true);
  });

  it("חודש מלא אינו מסומן כחלקי", () => {
    const b = breakdownByCategory([...partial, t("ג", [2026, 8, 31], "-50.00")], AUG);
    assert.equal(b.coverage.daysCovered, 31);
    assert.equal(b.coverage.partial, false);
  });

  it("חודש ריק אינו חלקי — הוא ריק", () => {
    const b = breakdownByCategory([], AUG);
    assert.equal(b.coverage.lastDataAt, null);
    assert.equal(b.coverage.daysCovered, 0);
    assert.equal(b.coverage.partial, false);
  });

  it("גם העברה נחשבת עדות לכך שהחודש נקלט", () => {
    const b = breakdownByCategory(
      [t("א", [2026, 8, 3], "-100.00"), t("חיוב מקס", [2026, 8, 20], "-4000.00", "transfer.card_settlement", false)],
      AUG
    );
    assert.equal(b.coverage.daysCovered, 20);
  });
});

describe("השוואה מיושרת", () => {
  const AUG = monthPeriod(2026, 8);
  const JUL = monthPeriod(2026, 7);

  // יולי: 300 ₪ בחצי הראשון, 300 ₪ בחצי השני.
  const july = [
    t("י1", [2026, 7, 5], "-150.00"),
    t("י2", [2026, 7, 10], "-150.00"),
    t("י3", [2026, 7, 22], "-150.00"),
    t("י4", [2026, 7, 28], "-150.00"),
  ];
  // אוגוסט: 300 ₪ ב-17 הימים הראשונים. אותו קצב בדיוק.
  const august = [t("א1", [2026, 8, 5], "-150.00"), t("א2", [2026, 8, 17], "-150.00")];

  const current = breakdownByCategory(august, AUG);

  /**
   * הבדיקה שמצדיקה את כל הסעיף. ההרגלים זהים לחלוטין, ובהשוואה
   * הנאיבית זה נראה כמו קריסה של 50%.
   */
  it("השוואה לא מיושרת מציגה ירידה מדומה — ומסומנת ככזו", () => {
    const naive = compareBreakdowns(current, breakdownByCategory(july, JUL));
    assert.equal(naive.expenseDelta, -30000);
    assert.equal(naive.window.aligned, false);
    assert.equal(naive.window.currentDays, 17);
    assert.equal(naive.window.previousDays, 31);
  });

  it("השוואה מיושרת מראה שלא השתנה כלום", () => {
    const window = firstDays(previousMonth(AUG), current.coverage.daysCovered);
    const aligned = compareBreakdowns(current, breakdownByCategory(july, window));
    assert.equal(aligned.expenseDelta, 0);
    assert.equal(aligned.window.aligned, true);
    assert.equal(aligned.window.previousDays, 17);
  });

  it("חודש מלא מול חודש מלא מיושר מעצמו", () => {
    const full = breakdownByCategory([...august, t("א3", [2026, 8, 31], "-1.00")], AUG);
    const cmp = compareBreakdowns(full, breakdownByCategory(july, JUL));
    assert.equal(cmp.window.aligned, true);
  });
});

describe("כיסוי הסיווג", () => {
  const AUG = monthPeriod(2026, 8);

  /**
   * המקרה האמיתי מאוגוסט: 23 תנועות קטנות מסווגות ותנועה אחת גדולה
   * שלא. בספירת תנועות זה נראה מצוין; בשקלים זה שליש מהחודש.
   */
  const txns: AnalyticsTxn[] = [
    ...Array.from({ length: 23 }, (_, i) => t(`ק${i}`, [2026, 8, (i % 17) + 1], "-95.00")),
    t("הגדולה", [2026, 8, 12], "-1008.66", null),
  ];

  const b = breakdownByCategory(txns, AUG);

  it("‏96% מהתנועות — אבל רק 68% מהשקלים", () => {
    assert.equal(b.classification.count.total, 24);
    assert.equal(b.classification.count.classified, 23);
    assert.equal(b.classification.count.pct, 95.8);

    assert.equal(b.classification.amount.total, 218500 + 100866);
    assert.equal(b.classification.amount.classified, 218500);
    assert.equal(b.classification.amount.pct, 68.4);
  });

  it("הפער בין שני המדדים הוא הסימן", () => {
    assert.ok(b.classification.count.pct - b.classification.amount.pct > 20);
  });

  it("כשהכול מסווג שני המדדים 100", () => {
    const clean = breakdownByCategory(txns.slice(0, 23), AUG);
    assert.equal(clean.classification.count.pct, 100);
    assert.equal(clean.classification.amount.pct, 100);
  });

  it("חודש ריק מחזיר 0 ולא NaN", () => {
    const empty = breakdownByCategory([], AUG);
    assert.equal(empty.classification.count.pct, 0);
    assert.equal(empty.classification.amount.pct, 0);
  });
});
