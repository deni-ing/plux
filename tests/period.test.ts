import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  effectiveDate,
  inPeriod,
  isoDay,
  monthOf,
  monthPeriod,
  monthsBack,
  nextMonth,
  previousMonth,
  usedFallback,
  utcDate,
} from "../lib/analytics/period";

// << מ-26.08: התקופה מתחילה ב-7 בחודש, לא ב-1. ראו ההערה ב-period.ts.

describe("monthPeriod", () => {
  it("בונה חלון חצי־פתוח שמתחיל ב-7 בחודש", () => {
    const aug = monthPeriod(2026, 8);
    assert.equal(isoDay(aug.from), "2026-08-07");
    assert.equal(isoDay(aug.to), "2026-09-07");
    assert.equal(aug.key, "2026-08");
    assert.equal(aug.label, "אוגוסט 2026");
  });

  it("מטפל בדצמבר בלי טיפול מיוחד", () => {
    const dec = monthPeriod(2026, 12);
    assert.equal(isoDay(dec.to), "2027-01-07");
    assert.equal(isoDay(nextMonth(dec).from), "2027-01-07");
    assert.equal(isoDay(previousMonth(monthPeriod(2027, 1)).from), "2026-12-07");
  });

  it("יום 7 קיים בכל חודש — אין גלישה לא-רצויה כמו שהייתה יכולה להיות ביום 31", () => {
    assert.equal(isoDay(monthPeriod(2028, 2).to), "2028-03-07");
    assert.equal(isoDay(monthPeriod(2026, 2).to), "2026-03-07");
  });
});

describe("inPeriod", () => {
  const aug = monthPeriod(2026, 8);

  it("כולל את ה-7 באוגוסט (תחילת התקופה)", () => {
    assert.equal(inPeriod(utcDate(2026, 8, 7), aug), true);
  });

  it("לא כולל את ה-6 באוגוסט (עדיין תקופת יולי)", () => {
    assert.equal(inPeriod(utcDate(2026, 8, 6), aug), false);
  });

  it("כולל את ה-6 בספטמבר (היום האחרון בתקופה)", () => {
    assert.equal(inPeriod(utcDate(2026, 9, 6), aug), true);
  });

  it("לא כולל את ה-7 בספטמבר (תחילת התקופה הבאה)", () => {
    assert.equal(inPeriod(utcDate(2026, 9, 7), aug), false);
  });

  it("חודשים עוקבים לא חופפים ולא משאירים חור", () => {
    const sep = monthPeriod(2026, 9);
    const boundary = utcDate(2026, 9, 7);
    assert.equal(inPeriod(boundary, aug), false);
    assert.equal(inPeriod(boundary, sep), true);
  });
});

describe("monthsBack", () => {
  it("מחזיר מהישן לחדש וכולל את החודש הקלנדרי של העוגן", () => {
    const list = monthsBack(utcDate(2026, 8, 22), 3);
    assert.deepEqual(list.map((p) => p.key), ["2026-06", "2026-07", "2026-08"]);
  });

  it("חוצה שנה", () => {
    const list = monthsBack(utcDate(2026, 2, 1), 4);
    assert.deepEqual(list.map((p) => p.key), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("בסיס התאריך", () => {
  // << 10 ולא 3, בכוונה: תאריך >= 7 כדי לא לערבב את בדיקת הבסיס עם
  //    בדיקת גבול התקופה (יש לה describe נפרד למעלה).
  const txn = { bookedAt: utcDate(2026, 8, 10), chargedAt: utcDate(2026, 9, 10) };

  it("booked לוקח את תאריך העסקה", () => {
    assert.equal(isoDay(effectiveDate(txn, "booked")), "2026-08-10");
  });

  it("charged לוקח את תאריך החיוב", () => {
    assert.equal(isoDay(effectiveDate(txn, "charged")), "2026-09-10");
  });

  /**
   * זה בדיוק המקרה של MAX: קנייה באוגוסט שמחויבת בספטמבר נופלת בחודש
   * אחר לגמרי לפי הבסיס.
   */
  it("אותה תנועה נופלת בחודשים שונים לפי הבסיס", () => {
    assert.equal(monthOf(effectiveDate(txn, "booked")).key, "2026-08");
    assert.equal(monthOf(effectiveDate(txn, "charged")).key, "2026-09");
  });

  it("בלי chargedAt נופלים חזרה — והנפילה מדווחת", () => {
    const bank = { bookedAt: utcDate(2026, 8, 10), chargedAt: null };
    assert.equal(isoDay(effectiveDate(bank, "charged")), "2026-08-10");
    assert.equal(usedFallback(bank, "charged"), true);
    assert.equal(usedFallback(bank, "booked"), false);
    assert.equal(usedFallback(txn, "charged"), false);
  });
});

describe("קריאת תאריך אינה תלויה באזור הזמן", () => {
  /**
   * ‏@db.Date מגיע כחצות UTC. הבדיקה מוודאת שאנחנו קוראים אותו
   * ב-getUTC* — לו היינו קוראים ב-getMonth המקומי, הטסט הזה היה עובר
   * בישראל ונכשל בכל אזור זמן שלילי.
   */
  it("‏10 באוגוסט בחצות UTC שייך לתקופת אוגוסט", () => {
    const d = new Date("2026-08-10T00:00:00.000Z");
    assert.equal(monthOf(d).key, "2026-08");
    assert.equal(inPeriod(d, monthPeriod(2026, 8)), true);
    assert.equal(inPeriod(d, monthPeriod(2026, 7)), false);
  });
});

describe("גלגול לתקופה הקודמת כשהיום בחודש קטן מ-7", () => {
  /**
   * זו בדיוק הסיבה למודל הזה: קובץ MAX ל"09/2026" מכיל תנועות
   * שנרשמו (bookedAt) בתחילת ספטמבר, אבל שייכות עדיין לתקופת אוגוסט
   * של המשתמש (7.8–6.9).
   */
  it("יום 3 בחודש שייך לתקופת החודש הקודם", () => {
    assert.equal(monthOf(utcDate(2026, 9, 3)).key, "2026-08");
  });

  it("יום 7 בחודש שייך לתקופת החודש עצמו", () => {
    assert.equal(monthOf(utcDate(2026, 9, 7)).key, "2026-09");
  });

  it("גלגול מינואר חוזר לדצמבר בשנה הקודמת", () => {
    assert.equal(monthOf(utcDate(2026, 1, 3)).key, "2025-12");
  });
});
