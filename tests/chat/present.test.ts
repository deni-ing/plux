import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toAgorot } from "../../lib/analytics/money";
import { monthPeriod, previousMonth, utcDate } from "../../lib/analytics/period";
import { breakdownByCategory, compareBreakdowns, type AnalyticsTxn } from "../../lib/analytics/spend";
import { feeReport } from "../../lib/analytics/fees";
import { findRecurring } from "../../lib/analytics/recurring";
import { forecastMonth } from "../../lib/analytics/forecast";
import { buildSnapshot } from "../../lib/analytics/snapshot";
import { factsForAi, type AiCategoryFact, type AiFacts } from "../../lib/chat/present";

// << טיפוסים מפורשים בשלושה מקומות למטה, לא סתם דיוק-יתר: TypeScript
//    6 מדווח TS7022 ("implicitly has type any... referenced in its own
//    initializer") על .find() שמוחזר לתוך משתנה בלי אנוטציה, כשהטיפוס
//    של המערך עצמו רקורסיבי (AiCategoryFact מכיל AiCategoryFact[]) או
//    מגיע מגזירה מקוננת עמוקה (NonNullable<...>). tsx לא תפס את זה כי
//    הוא מתעתק בלי type-check — `tsc` בבנייה האמיתית כן היה נכשל עליו.
type Mover = NonNullable<AiFacts["comparison"]>["movers"][number];
type Upcoming = NonNullable<AiFacts["forecast"]>["upcoming"][number];

let seq = 0;
function t(
  merchant: string,
  booked: [number, number, number],
  amount: string,
  slug: string | null,
  extra: Partial<AnalyticsTxn> = {}
): AnalyticsTxn {
  return {
    id: `t${seq++}`,
    bookedAt: utcDate(...booked),
    chargedAt: null,
    amount: toAgorot(amount),
    merchant,
    categorySlug: slug,
    countsAsSpending: true,
    ...extra,
  };
}

const AUG = monthPeriod(2026, 8);
const ASOF = utcDate(2026, 8, 12);

const TXNS: AnalyticsTxn[] = [
  t("משכורת", [2026, 8, 1], "12000.00", "income.salary"),
  t("סופר פאפא", [2026, 8, 4], "-80.80", "food.groceries"),
  t("מינימרקט גוקר", [2026, 8, 7], "-38.00", "food.groceries", { categorySlug: "food.groceries" }),
  // מנוי מוצהר — kind: subscription, ולכן annualized אמור לצאת עם ערך.
  t("ביטוח בריאות", [2026, 8, 3], "-120.00", "financial.insurance", { note: "הוראת קבע" }),
  t("ביטוח בריאות", [2026, 7, 3], "-120.00", "financial.insurance", { note: "הוראת קבע" }),
  t("ביטוח בריאות", [2026, 6, 3], "-120.00", "financial.insurance", { note: "הוראת קבע" }),
  // דפוס חוזר לא מוצהר — kind: unknown, ולכן annualized אמור לצאת null.
  t("חדר כושר", [2026, 8, 26 - 20], "-199.00", "leisure.sports"),
  t("חדר כושר", [2026, 7, 26], "-199.00", "leisure.sports"),
  t("חדר כושר", [2026, 6, 26], "-199.00", "leisure.sports"),
  t("חדר כושר", [2026, 5, 26], "-199.00", "leisure.sports"),
  t("עמל.ערוץ יש 11", [2026, 8, 5], "-17.90", "financial.bank_fees", { kind: "FEE" as never }),
  t("לא ידוע", [2026, 8, 12], "-1008.66", null),
  t("סופר פאפא", [2026, 7, 4], "-120.00", "food.groceries"),
];

function build() {
  const current = breakdownByCategory(TXNS, AUG);
  const previous = breakdownByCategory(TXNS, previousMonth(AUG));
  const recurring = findRecurring(TXNS, { asOf: ASOF });
  const forecast = forecastMonth(TXNS, current, recurring);
  return buildSnapshot({
    breakdown: current,
    comparison: compareBreakdowns(current, previous),
    fees: feeReport(TXNS, AUG, { breakdown: current }),
    recurring,
    forecast,
  });
}

describe("factsForAi", () => {
  const facts = build();
  const ai = factsForAi(facts);

  it("ממיר סכומי totals לשקלים", () => {
    assert.equal(ai.totals.expense, facts.totals.expense / 100);
    assert.equal(ai.totals.income, facts.totals.income / 100);
    assert.equal(ai.totals.net, facts.totals.net / 100);
    // מספרים שאינם כסף עוברים כמו שהם.
    assert.equal(ai.totals.txnCount, facts.totals.txnCount);
    assert.equal(ai.totals.transfersExcluded, facts.totals.transfersExcluded);
  });

  it("ממיר classification.unclassifiedAmount, לא את האחוזים", () => {
    assert.equal(ai.classification.unclassifiedAmount, facts.classification.unclassifiedAmount / 100);
    assert.equal(ai.classification.countPct, facts.classification.countPct);
    assert.equal(ai.classification.amountPct, facts.classification.amountPct);
  });

  it("ממיר קטגוריות ותת-קטגוריות באותו עומק", () => {
    for (const c of facts.categories) {
      const match: AiCategoryFact | undefined = ai.categories.find((x) => x.slug === c.slug);
      assert.ok(match, `חסרה קטגוריה ${c.slug}`);
      assert.equal(match!.total, c.total / 100);
      assert.equal(match!.share, c.share); // אחוז, לא כסף — לא משתנה
      assert.equal(match!.children.length, c.children.length);
      for (const ch of c.children) {
        const chMatch: AiCategoryFact | undefined = match!.children.find((x) => x.slug === ch.slug);
        assert.equal(chMatch!.total, ch.total / 100);
      }
    }
  });

  it("ממיר movers בהשוואה, ושומר aligned כמות שהוא", () => {
    assert.equal(ai.comparison?.aligned, facts.comparison?.aligned);
    assert.equal(ai.comparison?.expenseDelta, facts.comparison!.expenseDelta / 100);
    for (const m of facts.comparison!.movers) {
      const match: Mover | undefined = ai.comparison!.movers.find((x) => x.name === m.name);
      assert.equal(match!.delta, m.delta / 100);
      assert.equal(match!.deltaPct, m.deltaPct);
    }
  });

  it("ממיר עמלות, כולל פירוט לפי בית עסק", () => {
    assert.equal(ai.fees.total, facts.fees.total / 100);
    assert.equal(ai.fees.count, facts.fees.count);
    for (const f of facts.fees.byMerchant) {
      const match = ai.fees.byMerchant.find((x) => x.merchant === f.merchant);
      assert.equal(match!.total, f.total / 100);
    }
  });

  describe("annualized — האזהרה מ-recurring.ts מיושמת בפועל", () => {
    it("מנוי מוצהר (kind=subscription) מקבל ערך בשקלים", () => {
      const sub = facts.recurring.find((r) => r.merchant === "ביטוח בריאות");
      assert.equal(sub?.kind, "subscription");
      const aiSub = ai.recurring.find((r) => r.merchant === "ביטוח בריאות");
      assert.equal(aiSub?.annualized, sub!.annualized / 100);
      assert.ok(typeof aiSub?.annualized === "number");
    });

    it("דפוס לא מוצהר (kind=unknown) מקבל null, לא ניחוש בשקלים", () => {
      const gym = facts.recurring.find((r) => r.merchant === "חדר כושר");
      assert.equal(gym?.kind, "unknown");
      assert.ok(gym!.annualized > 0); // המקור בפנים כן מחזיק מספר
      const aiGym = ai.recurring.find((r) => r.merchant === "חדר כושר");
      assert.equal(aiGym?.annualized, null); // אבל מה שיוצא למודל — לא
    });

    it("שאר שדות ה-recurring לא נפגעים מהתנאי", () => {
      const gym = facts.recurring.find((r) => r.merchant === "חדר כושר");
      const aiGym = ai.recurring.find((r) => r.merchant === "חדר כושר");
      assert.equal(aiGym?.amount, gym!.amount / 100);
      assert.equal(aiGym?.cadence, gym!.cadence);
      assert.equal(aiGym?.confidence, gym!.confidence);
      assert.equal(aiGym?.nextDueAt, gym!.nextDueAt);
    });
  });

  describe("forecast", () => {
    it("ממיר את כל שדות הכסף כולל upcoming, ולא נוגע בהנחות", () => {
      assert.ok(facts.forecast);
      assert.equal(ai.forecast?.spent, facts.forecast!.spent / 100);
      assert.equal(ai.forecast?.floor, facts.forecast!.floor / 100);
      assert.equal(ai.forecast?.expected, facts.forecast!.expected / 100);
      assert.equal(ai.forecast?.ceiling, facts.forecast!.ceiling / 100);
      assert.deepEqual(ai.forecast?.assumptions, facts.forecast!.assumptions);
      assert.equal(ai.forecast?.confidence, facts.forecast!.confidence);
      for (const u of facts.forecast!.upcoming) {
        const match: Upcoming | undefined = ai.forecast!.upcoming.find((x) => x.merchant === u.merchant);
        assert.equal(match!.amount, u.amount / 100);
        assert.equal(match!.dueAt, u.dueAt);
      }
    });

    it("forecast חסר נשאר null ולא הופך לאובייקט חלקי", () => {
      const current = breakdownByCategory(TXNS, AUG);
      const noForecast = buildSnapshot({
        breakdown: current,
        fees: feeReport(TXNS, AUG),
        recurring: [],
      });
      assert.equal(factsForAi(noForecast).forecast, null);
    });
  });

  it("comparison חסר נשאר null", () => {
    const current = breakdownByCategory(TXNS, AUG);
    const noComparison = buildSnapshot({
      breakdown: current,
      fees: feeReport(TXNS, AUG),
      recurring: [],
    });
    assert.equal(factsForAi(noComparison).comparison, null);
  });

  it("שדות שאינם כסף כלל — תאריכים, מטבע, בסיס — עוברים ללא שינוי", () => {
    assert.equal(ai.currency, facts.currency);
    assert.equal(ai.basis, facts.basis);
    assert.deepEqual(ai.period, facts.period);
  });

  it("עובר סבב JSON בלי לאבד דבר ובלי undefined", () => {
    const round = JSON.parse(JSON.stringify(ai));
    assert.deepEqual(round, ai);

    const walk = (v: unknown, path: string): void => {
      if (v === undefined) assert.fail(`undefined ב-${path}`);
      if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
      }
    };
    walk(ai, "ai");
  });
});
