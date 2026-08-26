import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { classify, compileRules, type CompiledRule } from "../lib/classify/engine";

function rule(over: Partial<Parameters<typeof compileRules>[0][number]> = {}) {
  return compileRules([
    {
      id: "r1",
      pattern: "סופר יוסי",
      matchType: "CONTAINS",
      slug: "food.groceries",
      priority: 10,
      isSystem: true,
      ...over,
    },
  ]);
}

describe("classify — מקור ההכרעה (4.10)", () => {
  it("התאמת כלל על שם בית עסק → source RULE", () => {
    const d = classify({ merchant: "סופר יוסי בע\"מ" }, rule());
    assert.equal(d?.source, "RULE");
    assert.equal(d?.slug, "food.groceries");
  });

  it("אין כלל תואם, אבל יש kind מוכר → source TXN_KIND ולא RULE", () => {
    const d = classify({ merchant: "עמלת ניהול חשבון", kind: "FEE" }, [] as CompiledRule[]);
    assert.equal(d?.source, "TXN_KIND");
    // << מ-26.08: עבר מ-financial.bank_fees ל-fees — ראו ההערה ב-KIND_SLUG.
    assert.equal(d?.slug, "fees");
  });

  it("כלל וגם kind באותה תנועה → הכלל גובר, עדיין RULE ולא TXN_KIND", () => {
    // הכלל תואם "סופר יוסי", וגם kind=FEE קיים — לפי סדר ההכרעה
    // (2-3 לפני 4) הכלל צריך לנצח.
    const d = classify({ merchant: "סופר יוסי", kind: "FEE" }, rule());
    assert.equal(d?.source, "RULE");
    assert.equal(d?.slug, "food.groceries");
  });

  it("אין כלל ואין kind מוכר, אבל יש providerCategory → source PROVIDER", () => {
    const d = classify(
      { merchant: "בית עסק לא מוכר", providerCategory: "מזון וצריכה" },
      [] as CompiledRule[]
    );
    assert.equal(d?.source, "PROVIDER");
  });

  it("שום מקור לא הכריע → null, לא TXN_KIND ולא RULE מומצא", () => {
    const d = classify({ merchant: "בית עסק לא מוכר" }, [] as CompiledRule[]);
    assert.equal(d, null);
  });

  it("kind=TRANSFER_IN ו-TRANSFER_OUT שניהם TXN_KIND, לאותו slug", () => {
    const inD = classify({ merchant: "העברה נכנסת", kind: "TRANSFER_IN" }, [] as CompiledRule[]);
    const outD = classify({ merchant: "העברה יוצאת", kind: "TRANSFER_OUT" }, [] as CompiledRule[]);
    assert.equal(inD?.source, "TXN_KIND");
    assert.equal(outD?.source, "TXN_KIND");
    assert.equal(inD?.slug, "transfer.p2p");
    assert.equal(outD?.slug, "transfer.p2p");
  });
});
