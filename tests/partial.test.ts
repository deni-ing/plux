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

// << מ-26.08: כל התאריכים כאן על יום >= 7 בחודש — התקופה מתחילה עכשיו
//    ב-7, לא ב-1. "יום 17 בתקופה" הוא עכשיו 23 בחודש (7+16), ו"יום 31
//    בתקופה" (היום האחרון) הוא ה-6 בחודש הבא (7+30) — ראו lib/analytics/period.ts.

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
  const AUG = monthPeriod(2026, 8); // [2026-08-07, 2026-09-07)

  it("סופר ימים בחודש", () => {
    assert.equal(daysIn(AUG), 31);
    assert.equal(daysIn(monthPeriod(2026, 2)), 28);
    assert.equal(daysIn(monthPeriod(2028, 2)), 29);
    assert.equal(daysIn(monthPeriod(2026, 4)), 30);
  });

  it("היום בתקופה הוא 1-based", () => {
    assert.equal(dayOfPeriod(utcDate(2026, 8, 7), AUG), 1);
    assert.equal(dayOfPeriod(utcDate(2026, 8, 23), AUG), 17);
    assert.equal(dayOfPeriod(utcDate(2026, 9, 6), AUG), 31);
  });

  it("firstDays חותך חלון חצי־פתוח", () => {
    const w = firstDays(monthPeriod(2026, 7), 17);
    assert.equal(isoDay(w.from), "2026-07-07");
    assert.equal(isoDay(w.to), "2026-07-24");
    assert.equal(daysIn(w), 17);
  });

  it("firstDays לא חורג מהתקופה", () => {
    const w = firstDays(monthPeriod(2026, 2), 90);
    assert.equal(isoDay(w.to), "2026-03-07");
    assert.equal(daysIn(w), 28);
  });
});

describe("חודש חלקי", () => {
  const AUG = monthPeriod(2026, 8);

  /** התנועה האחרונה בנתונים האמיתיים היא היום ה-17 בתקופה (23 בחודש). */
  const partial = [
    t("א", [2026, 8, 9], "-100.00"),
    t("ב", [2026, 8, 23], "-200.00"),
  ];

  it("מזהה שהנתונים נגמרים באמצע", () => {
    const b = breakdownByCategory(partial, AUG);
    assert.equal(isoDay(b.coverage.lastDataAt!), "2026-08-23");
    assert.equal(b.coverage.daysCovered, 17);
    assert.equal(b.coverage.daysInPeriod, 31);
    assert.equal(b.coverage.partial, true);
  });

  it("חודש מלא אינו מסומן כחלקי", () => {
    // 2026-09-06 הוא היום האחרון בתקופת אוגוסט (7.8–6.9).
    const b = breakdownByCategory([...partial, t("ג", [2026, 9, 6], "-50.00")], AUG);
    assert.equal(b.coverage.daysCovered, 31);
    assert.equal(b.coverage.partial, false);
  });

  /**
   * הבאג שהבדיקה על הנתונים האמיתיים תפסה: שבעה חודשים מ-2025 סומנו
   * כחלקיים רק כי ביום האחרון שלהם לא הייתה קנייה. **"לא קניתי ביום
   * האחרון" הוא מידע לגיטימי, לא נתון חסר** — וההבחנה דורשת להסתכל
   * אל מחוץ לחודש.
   */
  it("חודש ישן שנגמר בלי קנייה ביום האחרון אינו חלקי", () => {
    const txns = [
      // יום לפני סוף תקופת אוקטובר (7.10–6.11 ב-2025) — לא ביום האחרון עצמו.
      t("אוקטובר", [2025, 11, 5], "-100.00"),
      // בתוך תקופת נובמבר עצמה — מוכיח שהנתונים נמשכים אחרי אוקטובר.
      t("נובמבר", [2025, 11, 10], "-100.00"),
      t("אוגוסט", [2026, 8, 23], "-100.00"),
    ];
    const oct = breakdownByCategory(txns, monthPeriod(2025, 10));
    assert.equal(isoDay(oct.coverage.lastDataAt!), "2025-11-05");
    assert.equal(oct.coverage.partial, false);
    assert.equal(oct.coverage.daysCovered, 31);

    // ורק החודש שבו הנתונים באמת נגמרים כן
    const aug = breakdownByCategory(txns, monthPeriod(2026, 8));
    assert.equal(aug.coverage.partial, true);
    assert.equal(aug.coverage.daysCovered, 17);
  });

  it("גם חודש ריק באמצע הטווח אינו חלקי", () => {
    const txns = [
      t("לפני", [2026, 5, 3], "-100.00"),
      t("אחרי", [2026, 8, 17], "-100.00"),
    ];
    const jun = breakdownByCategory(txns, monthPeriod(2026, 6));
    assert.equal(jun.coverage.lastDataAt, null);
    assert.equal(jun.coverage.daysCovered, 30);
    assert.equal(jun.coverage.partial, false);
    assert.equal(jun.expense, 0);
  });

  it("‏dataEndsAt מפורש גובר על הנגזר מהתנועות", () => {
    // 2026-09-06 — היום האחרון בתקופת אוגוסט, לא 31 באוגוסט.
    const b = breakdownByCategory(partial, AUG, { dataEndsAt: utcDate(2026, 9, 6) });
    assert.equal(b.coverage.partial, false);
    assert.equal(b.coverage.daysCovered, 31);
  });

  it("חודש ריק אינו חלקי — הוא ריק", () => {
    const b = breakdownByCategory([], AUG);
    assert.equal(b.coverage.lastDataAt, null);
    assert.equal(b.coverage.daysCovered, 0);
    assert.equal(b.coverage.partial, false);
  });

  it("גם העברה נחשבת עדות לכך שהחודש נקלט", () => {
    const b = breakdownByCategory(
      [t("א", [2026, 8, 9], "-100.00"), t("חיוב מקס", [2026, 8, 26], "-4000.00", "transfer.card_settlement", false)],
      AUG
    );
    assert.equal(b.coverage.daysCovered, 20);
  });
});

describe("השוואה מיושרת", () => {
  const AUG = monthPeriod(2026, 8); // [2026-08-07, 2026-09-07)
  const JUL = monthPeriod(2026, 7); // [2026-07-07, 2026-08-07)

  // יולי: 300 ₪ בתוך 17 הימים הראשונים של התקופה (7–23.7), 300 ₪ אחרי.
  const july = [
    t("י1", [2026, 7, 9], "-150.00"),
    t("י2", [2026, 7, 15], "-150.00"),
    t("י3", [2026, 7, 26], "-150.00"),
    t("י4", [2026, 8, 2], "-150.00"),
  ];
  // אוגוסט: 300 ₪ ב-17 הימים הראשונים של התקופה. אותו קצב בדיוק.
  const august = [t("א1", [2026, 8, 9], "-150.00"), t("א2", [2026, 8, 23], "-150.00")];

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
    // 2026-09-06 — היום האחרון בתקופת אוגוסט.
    const full = breakdownByCategory([...august, t("א3", [2026, 9, 6], "-1.00")], AUG);
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
    ...Array.from({ length: 23 }, (_, i) => t(`ק${i}`, [2026, 8, (i % 17) + 7], "-95.00")),
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
