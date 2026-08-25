import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { budgetPct, budgetStatus } from "../lib/budget/engine";

describe("budgetStatus", () => {
  it("מתחת ל-80% מהתקרה → under", () => {
    assert.equal(budgetStatus(5_000, 10_000), "under");
    assert.equal(budgetStatus(7_999, 10_000), "under");
  });

  it("בין 80% ל-100% → near", () => {
    assert.equal(budgetStatus(8_000, 10_000), "near");
    assert.equal(budgetStatus(10_000, 10_000), "near");
  });

  it("מעל 100% → over", () => {
    assert.equal(budgetStatus(10_001, 10_000), "over");
    assert.equal(budgetStatus(20_000, 10_000), "over");
  });

  it("cap=0 בלי הוצאה → under, עם הוצאה → over", () => {
    assert.equal(budgetStatus(0, 0), "under");
    assert.equal(budgetStatus(100, 0), "over");
  });

  it("הוצאה שלילית (נטו החזרים) מטופלת כ-0", () => {
    assert.equal(budgetStatus(-500, 10_000), "under");
    assert.equal(budgetStatus(-500, 0), "under");
  });
});

describe("budgetPct", () => {
  it("מחשב אחוז רגיל, מעוגל", () => {
    assert.equal(budgetPct(2_500, 10_000), 25);
    assert.equal(budgetPct(3_333, 10_000), 33);
  });

  it("יכול לעבור 100", () => {
    assert.equal(budgetPct(15_000, 10_000), 150);
  });

  it("cap=0: 0% בלי הוצאה, 100% עם הוצאה", () => {
    assert.equal(budgetPct(0, 0), 0);
    assert.equal(budgetPct(500, 0), 100);
  });

  it("הוצאה שלילית → 0%, לא שלילי", () => {
    assert.equal(budgetPct(-500, 10_000), 0);
  });
});
