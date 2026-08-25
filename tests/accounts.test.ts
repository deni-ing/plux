import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { summarizeBalance, type BalancePoint } from "../lib/accounts/engine";

const DAY_MS = 86_400_000;
const day = (n: number) => new Date(2026, 0, n);

describe("summarizeBalance", () => {
  it("בלי נקודות היסטוריה — אין דלתא, sparkline ריק", () => {
    const asOf = day(20);
    const summary = summarizeBalance(10_000_00, asOf, [], day(1));
    assert.equal(summary.current, 10_000_00);
    assert.equal(summary.asOf, asOf);
    assert.equal(summary.deltaVsPrior, null);
    assert.deepEqual(summary.sparkline, []);
  });

  it("מוצא את הנקודה האחרונה לפני priorCutoff ומחשב דלתא", () => {
    const points: BalancePoint[] = [
      { at: day(1), balance: 8_000_00 },
      { at: day(10), balance: 9_000_00 },
      { at: day(15), balance: 9_500_00 },
      { at: day(25), balance: 10_500_00 }, // אחרי ה-cutoff — לא אמור להיבחר
    ];
    const summary = summarizeBalance(10_000_00, day(31), points, day(20));
    // הנקודה האחרונה לפני day(20) היא day(15) עם 9,500
    assert.equal(summary.deltaVsPrior, 10_000_00 - 9_500_00);
  });

  it("כל הנקודות אחרי ה-cutoff — אין נקודת השוואה, לא מומצא אפס", () => {
    const points: BalancePoint[] = [{ at: day(25), balance: 9_000_00 }];
    const summary = summarizeBalance(10_000_00, day(31), points, day(20));
    assert.equal(summary.deltaVsPrior, null);
  });

  it("נקודה בדיוק על ה-cutoff לא נחשבת 'לפני' — גבול חד", () => {
    const cutoff = day(20);
    const points: BalancePoint[] = [
      { at: day(15), balance: 9_000_00 },
      { at: cutoff, balance: 9_800_00 },
    ];
    const summary = summarizeBalance(10_000_00, day(31), points, cutoff);
    assert.equal(summary.deltaVsPrior, 10_000_00 - 9_000_00);
  });

  it("sparkline מוגבל ל-20 הנקודות האחרונות", () => {
    const points: BalancePoint[] = Array.from({ length: 30 }, (_, i) => ({
      at: new Date(day(1).getTime() + i * DAY_MS),
      balance: 1_000_00 + i * 100,
    }));
    const summary = summarizeBalance(4_000_00, day(31), points, day(1));
    assert.equal(summary.sparkline.length, 20);
    assert.equal(summary.sparkline[0], points[10]);
    assert.equal(summary.sparkline[19], points[29]);
  });
});
