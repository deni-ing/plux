import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { formatILS, share, sumAgorot, toAgorot, toShekels } from "../lib/analytics/money";

describe("toAgorot", () => {
  it("קורא ייצוג עשרוני רגיל", () => {
    assert.equal(toAgorot("17.90"), 1790);
    assert.equal(toAgorot("0.01"), 1);
    assert.equal(toAgorot("1234.56"), 123456);
  });

  it("משלים ספרות חסרות", () => {
    assert.equal(toAgorot("5"), 500);
    assert.equal(toAgorot("5.1"), 510);
  });

  it("שומר על הסימן", () => {
    assert.equal(toAgorot("-17.90"), -1790);
    assert.equal(toAgorot("-0.01"), -1);
    assert.equal(toAgorot("+3.00"), 300);
  });

  it("מקבל אובייקט עם toString — כמו Decimal של Prisma", () => {
    const decimalLike = { toString: () => "-1234.50" };
    assert.equal(toAgorot(decimalLike), -123450);
  });

  it("מעגל ספרה שלישית כלפי מעלה בערך המוחלט", () => {
    assert.equal(toAgorot("1.005"), 101);
    assert.equal(toAgorot("1.004"), 100);
    assert.equal(toAgorot("-1.005"), -101);
  });

  it("זורק על קלט שאינו מספר", () => {
    assert.throws(() => toAgorot("₪17.90"));
    assert.throws(() => toAgorot(""));
    assert.throws(() => toAgorot("abc"));
    assert.throws(() => toAgorot(Number.NaN));
  });
});

describe("סכימה", () => {
  /**
   * זו הבדיקה שכל הקובץ money.ts קיים בשבילה. אותו חישוב במספרים
   * עשרוניים נותן 0.30000000000000004.
   */
  it("0.1 + 0.2 = 0.3 בדיוק", () => {
    const total = sumAgorot([toAgorot("0.1"), toAgorot("0.2")]);
    assert.equal(total, 30);
    assert.equal(toShekels(total), 0.3);
  });

  it("‏392 תנועות של 17.90 מסתכמות בדיוק", () => {
    const many = Array.from({ length: 392 }, () => toAgorot("17.90"));
    assert.equal(sumAgorot(many), 701680); // 392 × 1790
    assert.equal(toShekels(sumAgorot(many)), 7016.8);
  });

  it("סכום של מערך ריק הוא 0", () => {
    assert.equal(sumAgorot([]), 0);
  });
});

describe("share", () => {
  it("מחזיר אחוז בעיגול לספרה אחת", () => {
    assert.equal(share(2500, 10000), 25);
    assert.equal(share(3333, 10000), 33.3);
  });

  it("מחזיר 0 כשהמכנה 0 — ולא NaN", () => {
    assert.equal(share(0, 0), 0);
    assert.equal(share(500, 0), 0);
  });
});

describe("formatILS", () => {
  it("מייצר מחרוזת שמכילה את הסכום", () => {
    // הפורמט המדויק תלוי ב-ICU של הסביבה, ולכן נבדק התוכן ולא התו.
    assert.match(formatILS(179000), /1,790\.00/);
  });
});
