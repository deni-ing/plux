import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ClaudeClassifier, type ClassifyClient } from "../lib/classify/ai/claude";

const ALLOWED = ["food.groceries", "food.restaurants", "transport.fuel"];

function textResponse(text: string, stopReason: string | null = "end_turn") {
  return { content: [{ type: "text" as const, text }], stop_reason: stopReason };
}

describe("ClaudeClassifier", () => {
  it("רשימה ריקה — לא קורא ללקוח בכלל", async () => {
    let calls = 0;
    const client: ClassifyClient = {
      messages: { create: async () => { calls++; return textResponse("[]"); } },
    };
    const out = await new ClaudeClassifier(client).classify([], ALLOWED);
    assert.deepEqual(out, []);
    assert.equal(calls, 0);
  });

  it("תשובה תקינה — כל בית עסק מקבל את הפסוקה שלו", async () => {
    const client: ClassifyClient = {
      messages: {
        create: async () =>
          textResponse(
            JSON.stringify([
              { merchant: "סופר יוסי", slug: "food.groceries", confidence: 0.9, reason: "שם" },
              { merchant: "פז דלק", slug: "transport.fuel", confidence: 0.95, reason: "שם" },
            ])
          ),
      },
    };
    const out = await new ClaudeClassifier(client).classify(
      ["סופר יוסי", "פז דלק"],
      ALLOWED
    );
    assert.deepEqual(out, [
      { merchant: "סופר יוסי", slug: "food.groceries", confidence: 0.9, reason: "שם" },
      { merchant: "פז דלק", slug: "transport.fuel", confidence: 0.95, reason: "שם" },
    ]);
  });

  it("בית עסק שלא קיבל שורת תשובה כלל — 'לא נענה', לא נעלם", async () => {
    const client: ClassifyClient = {
      messages: {
        create: async () =>
          textResponse(JSON.stringify([{ merchant: "סופר יוסי", slug: "food.groceries", confidence: 0.9 }])),
      },
    };
    const out = await new ClaudeClassifier(client).classify(
      ["סופר יוסי", "בית עסק לא ידוע"],
      ALLOWED
    );
    assert.equal(out.length, 2);
    assert.deepEqual(out[1], {
      merchant: "בית עסק לא ידוע",
      slug: null,
      confidence: 0,
      reason: "לא נענה",
    });
  });

  it("JSON עטוף בגדרות קוד — עדיין נפרס נכון (parseVerdicts הקיים)", async () => {
    const client: ClassifyClient = {
      messages: {
        create: async () =>
          textResponse(
            '```json\n[{"merchant": "סופר יוסי", "slug": "food.groceries", "confidence": 0.8}]\n```'
          ),
      },
    };
    const out = await new ClaudeClassifier(client).classify(["סופר יוסי"], ALLOWED);
    assert.equal(out[0].slug, "food.groceries");
  });

  it("slug שלא ברשימה המותרת נדחה ל-null (מדיניות parseVerdicts)", async () => {
    const client: ClassifyClient = {
      messages: {
        create: async () =>
          textResponse(
            JSON.stringify([{ merchant: "חנות זרה", slug: "made.up.slug", confidence: 0.9 }])
          ),
      },
    };
    const out = await new ClaudeClassifier(client).classify(["חנות זרה"], ALLOWED);
    assert.equal(out[0].slug, null);
  });

  it("stop_reason=max_tokens → זורק שגיאה ברורה, לא מחזיר '0 נענו' בשקט", async () => {
    const client: ClassifyClient = {
      messages: {
        create: async () =>
          textResponse('[{"merchant": "סופר יוסי", "slug": "food.groceries"', "max_tokens"),
      },
    };
    await assert.rejects(
      () => new ClaudeClassifier(client).classify(["סופר יוסי", "פז דלק"], ALLOWED),
      /max_tokens/
    );
  });

  it("stop_reason=end_turn רגיל — לא זורק, ממשיך לפענח כרגיל", async () => {
    const client: ClassifyClient = {
      messages: {
        create: async () =>
          textResponse(
            JSON.stringify([{ merchant: "סופר יוסי", slug: "food.groceries", confidence: 0.9 }]),
            "end_turn"
          ),
      },
    };
    const out = await new ClaudeClassifier(client).classify(["סופר יוסי"], ALLOWED);
    assert.equal(out[0].slug, "food.groceries");
  });

  it("שולח את allowedSlugs ואת שמות בתי העסק בגוף ההודעה", async () => {
    let seenSystem = "";
    let seenUser = "";
    const client: ClassifyClient = {
      messages: {
        create: async (params) => {
          seenSystem = params.system;
          seenUser = params.messages[0].content;
          return textResponse("[]");
        },
      },
    };
    await new ClaudeClassifier(client).classify(["חנות בדיקה"], ALLOWED);
    assert.match(seenSystem, /מסווג בתי עסק/);
    assert.match(seenUser, /חנות בדיקה/);
    assert.match(seenUser, /food\.groceries/);
  });
});
