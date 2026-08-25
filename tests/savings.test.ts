import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  goalStatus,
  assessRealism,
  recommendSteps,
  type GoalStatus,
  type SavingsGoal,
} from "../lib/savings/engine";

function goal(over: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: "g1",
    name: "יעד לדוגמה",
    target: 100_000, // ₪1,000.00
    saved: 0,
    targetAt: new Date("2027-01-01T00:00:00Z"),
    ...over,
  };
}

function status(over: Partial<GoalStatus> = {}): GoalStatus {
  return {
    pct: 0,
    remaining: 100_000,
    monthsLeft: 10,
    requiredMonthly: 10_000,
    overdue: false,
    achieved: false,
    ...over,
  };
}

describe("goalStatus", () => {
  it("יעד חדש, שנה שלמה קדימה", () => {
    const s = goalStatus(goal(), new Date("2026-01-01T00:00:00Z"));
    assert.equal(s.pct, 0);
    assert.equal(s.remaining, 100_000);
    assert.equal(s.monthsLeft, 12);
    assert.equal(s.requiredMonthly, Math.ceil(100_000 / 12));
    assert.equal(s.achieved, false);
    assert.equal(s.overdue, false);
  });

  it("יעד שהושג — remaining ו-requiredMonthly הם 0, achieved true", () => {
    const s = goalStatus(goal({ saved: 100_000 }), new Date("2026-06-01T00:00:00Z"));
    assert.equal(s.achieved, true);
    assert.equal(s.remaining, 0);
    assert.equal(s.requiredMonthly, 0);
    assert.equal(s.pct, 100);
  });

  it("חסכון מעבר ליעד — pct עובר 100, remaining עדיין 0", () => {
    const s = goalStatus(goal({ saved: 150_000 }), new Date("2026-06-01T00:00:00Z"));
    assert.equal(s.pct, 150);
    assert.equal(s.remaining, 0);
    assert.equal(s.achieved, true);
  });

  it("תאריך שעבר ולא הושג — overdue, ועדיין monthsLeft לפחות 1", () => {
    const s = goalStatus(goal({ saved: 40_000 }), new Date("2027-06-01T00:00:00Z"));
    assert.equal(s.overdue, true);
    assert.equal(s.monthsLeft, 1);
    assert.equal(s.requiredMonthly, 60_000);
  });

  it("target=0 לא מתפוצץ — pct 0, לא NaN/Infinity", () => {
    const s = goalStatus(goal({ target: 0, saved: 0 }), new Date("2026-01-01T00:00:00Z"));
    assert.equal(s.pct, 0);
    assert.equal(Number.isFinite(s.pct), true);
  });
});

describe("assessRealism", () => {
  it("אין עדיין ממוצע (משתמש חדש) → unknown, לא unrealistic", () => {
    assert.equal(assessRealism(5_000, null), "unknown");
  });

  it("היעד כבר הושג (0 נדרש) → comfortable תמיד", () => {
    assert.equal(assessRealism(0, null), "comfortable");
    assert.equal(assessRealism(0, -10_000), "comfortable");
  });

  it("נטו שלילי בפועל ועדיין צריך לחסוך → unrealistic", () => {
    assert.equal(assessRealism(1_000, -5_000), "unrealistic");
  });

  it("נדרש עד חצי מהנטו הממוצע → comfortable", () => {
    assert.equal(assessRealism(4_000, 10_000), "comfortable");
    assert.equal(assessRealism(5_000, 10_000), "comfortable");
  });

  it("נדרש בין חצי לכל הנטו הממוצע → tight", () => {
    assert.equal(assessRealism(7_000, 10_000), "tight");
    assert.equal(assessRealism(10_000, 10_000), "tight");
  });

  it("נדרש יותר מהנטו הממוצע → unrealistic", () => {
    assert.equal(assessRealism(10_001, 10_000), "unrealistic");
  });
});

describe("recommendSteps", () => {
  it("יעד שהושג → צעד יחיד של ברכה, בלי קשר לריאליות", () => {
    const steps = recommendSteps(status({ achieved: true, remaining: 0 }), "comfortable", 10_000);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].id, "achieved");
  });

  it("תאריך עבר ולא הושג → כולל צעד overdue בנוסף לצעד הריאליות", () => {
    const steps = recommendSteps(status({ overdue: true }), "tight", 10_000);
    assert.equal(steps.some((s) => s.id === "overdue"), true);
    assert.equal(steps.some((s) => s.id === "tight"), true);
  });

  it("לא overdue → אין צעד overdue", () => {
    const steps = recommendSteps(status({ overdue: false }), "comfortable", 10_000);
    assert.equal(steps.some((s) => s.id === "overdue"), false);
  });

  it("comfortable → צעד יחיד comfortable", () => {
    const steps = recommendSteps(status(), "comfortable", 10_000);
    assert.deepEqual(
      steps.map((s) => s.id),
      ["comfortable"]
    );
  });

  it("unknown → צעד unknown, לא מזכיר מספרים", () => {
    const steps = recommendSteps(status(), "unknown", null);
    assert.deepEqual(
      steps.map((s) => s.id),
      ["unknown"]
    );
  });

  it("unrealistic עם נטו חיובי → מחשב extendedMonths מתוך remaining/avgMonthlyNet", () => {
    const steps = recommendSteps(
      status({ remaining: 100_000, monthsLeft: 5 }),
      "unrealistic",
      10_000
    );
    assert.equal(steps.length, 1);
    assert.equal(steps[0].id, "unrealistic-extend");
    assert.match(steps[0].text, /10 חודשים/); // 100_000 / 10_000 = 10
  });

  it("unrealistic עם נטו null → צעד גנרי, בלי חישוב חודשים", () => {
    const steps = recommendSteps(status(), "unrealistic", null);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].id, "unrealistic");
  });

  it("unrealistic עם נטו שלילי → צעד גנרי, בלי חלוקה במספר שלילי", () => {
    const steps = recommendSteps(status(), "unrealistic", -5_000);
    assert.equal(steps.length, 1);
    assert.equal(steps[0].id, "unrealistic");
  });
});
