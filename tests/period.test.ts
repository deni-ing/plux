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

describe("monthPeriod", () => {
  it("בונה חלון חצי־פתוח", () => {
    const aug = monthPeriod(2026, 8);
    assert.equal(isoDay(aug.from), "2026-08-01");
    assert.equal(isoDay(aug.to), "2026-09-01");
    assert.equal(aug.key, "2026-08");
    assert.equal(aug.label, "אוגוסט 2026");
  });

  it("מטפל בדצמבר בלי טיפול מיוחד", () => {
    const dec = monthPeriod(2026, 12);
    assert.equal(isoDay(dec.to), "2027-01-01");
    assert.equal(isoDay(nextMonth(dec).from), "2027-01-01");
    assert.equal(isoDay(previousMonth(monthPeriod(2027, 1)).from), "2026-12-01");
  });

  it("‏פברואר מעוברת נגמר ב-1 במרץ", () => {
    assert.equal(isoDay(monthPeriod(2028, 2).to), "2028-03-01");
    assert.equal(isoDay(monthPeriod(2026, 2).to), "2026-03-01");
  });
});

describe("inPeriod", () => {
  const aug = monthPeriod(2026, 8);

  it("כולל את היום הראשון", () => {
    assert.equal(inPeriod(utcDate(2026, 8, 1), aug), true);
  });

  it("כולל את היום האחרון", () => {
    assert.equal(inPeriod(utcDate(2026, 8, 31), aug), true);
  });

  it("לא כולל את היום שאחרי", () => {
    assert.equal(inPeriod(utcDate(2026, 9, 1), aug), false);
  });

  it("חודשים עוקבים לא חופפים ולא משאירים חור", () => {
    const sep = monthPeriod(2026, 9);
    const boundary = utcDate(2026, 9, 1);
    assert.equal(inPeriod(boundary, aug), false);
    assert.equal(inPeriod(boundary, sep), true);
  });
});

describe("monthsBack", () => {
  it("מחזיר מהישן לחדש וכולל את החודש של העוגן", () => {
    const list = monthsBack(utcDate(2026, 8, 22), 3);
    assert.deepEqual(list.map((p) => p.key), ["2026-06", "2026-07", "2026-08"]);
  });

  it("חוצה שנה", () => {
    const list = monthsBack(utcDate(2026, 2, 1), 4);
    assert.deepEqual(list.map((p) => p.key), ["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("בסיס התאריך", () => {
  const txn = { bookedAt: utcDate(2026, 8, 3), chargedAt: utcDate(2026, 9, 10) };

  it("booked לוקח את תאריך העסקה", () => {
    assert.equal(isoDay(effectiveDate(txn, "booked")), "2026-08-03");
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
    const bank = { bookedAt: utcDate(2026, 8, 3), chargedAt: null };
    assert.equal(isoDay(effectiveDate(bank, "charged")), "2026-08-03");
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
  it("‏1 באוגוסט בחצות UTC שייך לאוגוסט", () => {
    const d = new Date("2026-08-01T00:00:00.000Z");
    assert.equal(monthOf(d).key, "2026-08");
    assert.equal(inPeriod(d, monthPeriod(2026, 8)), true);
    assert.equal(inPeriod(d, monthPeriod(2026, 7)), false);
  });
});
