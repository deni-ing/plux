import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { runChat, type ChatClient } from "../../lib/chat/client";

/**
 * ‏`Db` האמיתי לא נחוץ כאן בכלל: כל טסט מזריק גם client מזויף וגם
 * runTool מזויף, ולכן שום קוד לא נוגע במסד. מעביר אובייקט ריק, מוקלד
 * `as never`, כדי שהחתימה תתקמפל בלי לייבא את הטיפוס האמיתי.
 */
const DB = {} as never;
const USER = "user_test";

function textResponse(text: string) {
  return { content: [{ type: "text" as const, text }], stop_reason: "end_turn" };
}

function toolUseResponse(id: string, name: string, input: unknown) {
  return {
    content: [{ type: "tool_use" as const, id, name, input }],
    stop_reason: "tool_use",
  };
}

describe("runChat — לולאת הכלים", () => {
  it("תשובת טקסט בלי כלי כלל — סיבוב אחד, בלי לגעת ב-runTool", async () => {
    let calls = 0;
    const client: ChatClient = {
      messages: {
        create: async () => {
          calls++;
          return textResponse("שלום, איך אפשר לעזור?");
        },
      },
    };
    const runTool = async () => {
      throw new Error("לא אמור להיקרא");
    };

    const result = await runChat(DB, USER, [{ role: "user", content: "היי" }], { client, runTool });

    assert.equal(result.reply, "שלום, איך אפשר לעזור?");
    assert.equal(calls, 1);
    assert.deepEqual(result.turns, [{ type: "text", text: "שלום, איך אפשר לעזור?" }]);
  });

  it("סיבוב אחד עם כלי — מריץ, שולח תוצאה חזרה, ומחזיר את התשובה הסופית", async () => {
    let round = 0;
    const seenMessages: unknown[][] = [];
    const client: ChatClient = {
      messages: {
        create: async (params) => {
          seenMessages.push(params.messages);
          round++;
          if (round === 1) return toolUseResponse("toolu_1", "getMonthlyReport", { month: "2026-08" });
          return textResponse("הוצאת 3,200 ₪ באוגוסט.");
        },
      },
    };

    let toolCalledWith: unknown = null;
    const runTool = async (_db: never, _userId: string, name: string, input: Record<string, unknown>) => {
      toolCalledWith = { name, input };
      return { tool: "getMonthlyReport", facts: { totals: { expense: 3200 } } };
    };

    const result = await runChat(DB, USER, [{ role: "user", content: "כמה הוצאתי באוגוסט?" }], {
      client,
      runTool: runTool as never,
    });

    assert.equal(result.reply, "הוצאת 3,200 ₪ באוגוסט.");
    assert.equal(round, 2);
    assert.deepEqual(toolCalledWith, { name: "getMonthlyReport", input: { month: "2026-08" } });

    // ההודעה שנשלחה בסיבוב השני חייבת לכלול tool_result עם אותו tool_use_id.
    const secondCallMessages = seenMessages[1] as { role: string; content: unknown }[];
    const toolResultMsg = secondCallMessages[secondCallMessages.length - 1];
    assert.equal(toolResultMsg.role, "user");
    const block = (toolResultMsg.content as { type: string; tool_use_id: string; content: string }[])[0];
    assert.equal(block.type, "tool_result");
    assert.equal(block.tool_use_id, "toolu_1");
    assert.ok(block.content.includes("3200"));

    // היומן מתעד גם את קריאת הכלי וגם את התוצאה, לא רק את הטקסט.
    assert.deepEqual(
      result.turns.map((t) => t.type),
      ["tool_call", "tool_result", "text"]
    );
  });

  it("כלי שזורק לא מפיל את השיחה — השגיאה הופכת לתוצאת כלי, והמודל ממשיך", async () => {
    let round = 0;
    const client: ChatClient = {
      messages: {
        create: async () => {
          round++;
          if (round === 1) return toolUseResponse("toolu_x", "findTransactions", { month: "not-a-month" });
          return textResponse("לא הצלחתי למצוא נתונים לחודש הזה.");
        },
      },
    };
    const runTool = async () => {
      throw new Error("חודש לא תקין");
    };

    const result = await runChat(DB, USER, [{ role: "user", content: "תראה לי תנועות" }], {
      client,
      runTool: runTool as never,
    });

    assert.equal(result.reply, "לא הצלחתי למצוא נתונים לחודש הזה.");
    const toolResultTurn = result.turns.find((t) => t.type === "tool_result");
    assert.deepEqual(toolResultTurn, {
      type: "tool_result",
      name: "findTransactions",
      result: { error: "חודש לא תקין" },
    });
  });

  it("מספר כלים באותה תשובה — כולם רצים, וכל תוצאה מקבלת tool_use_id משלה", async () => {
    let round = 0;
    let capturedResults: { type: string; tool_use_id: string }[] = [];
    const client: ChatClient = {
      messages: {
        create: async (params) => {
          round++;
          if (round === 1) {
            return {
              content: [
                { type: "tool_use" as const, id: "a", name: "listAvailableMonths", input: {} },
                { type: "tool_use" as const, id: "b", name: "listAvailableMonths", input: {} },
              ],
              stop_reason: "tool_use",
            };
          }
          const last = params.messages[params.messages.length - 1] as { content: { type: string; tool_use_id: string }[] };
          capturedResults = last.content;
          return textResponse("סיימתי.");
        },
      },
    };
    const runTool = async () => ({ tool: "listAvailableMonths", months: ["2026-08"] });

    await runChat(DB, USER, [{ role: "user", content: "שאלה" }], { client, runTool: runTool as never });

    assert.equal(capturedResults.length, 2);
    assert.deepEqual(
      capturedResults.map((r) => r.tool_use_id).sort(),
      ["a", "b"]
    );
  });

  it("תקרת הסיבובים עוצרת בכוח ולא רצה לנצח", async () => {
    let calls = 0;
    const client: ChatClient = {
      messages: {
        create: async () => {
          calls++;
          return toolUseResponse(`t${calls}`, "listAvailableMonths", {});
        },
      },
    };
    const runTool = async () => ({ tool: "listAvailableMonths", months: [] });

    const result = await runChat(DB, USER, [{ role: "user", content: "שאלה" }], {
      client,
      runTool: runTool as never,
    });

    assert.equal(calls, 6); // MAX_TOOL_ROUNDS
    assert.ok(result.reply.includes("יותר מדי שלבים"));
    assert.deepEqual(result.turns[result.turns.length - 1], { type: "limit", rounds: 6 });
  });
});
