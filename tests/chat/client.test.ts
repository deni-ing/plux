import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  runChat,
  streamChat,
  type ChatClient,
  type StreamChatClient,
  type WithUser,
} from "../../lib/chat/client";

/**
 * ‏`Db` האמיתי לא נחוץ כאן בכלל: כל טסט מזריק גם client מזויף וגם
 * runTool מזויף, ולכן שום קוד לא נוגע במסד באמת. `WITH_USER` פשוט
 * מריץ את הפונקציה עם db מזויף — אין כאן שום טרנזקציה אמיתית להיפתח
 * או להיסגר, רק סיפוק החתימה שהלולאה מצפה לה.
 */
const WITH_USER: WithUser = (fn) => fn({} as never);
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

    const result = await runChat(WITH_USER, USER, [{ role: "user", content: "היי" }], { client, runTool });

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

    const result = await runChat(WITH_USER, USER, [{ role: "user", content: "כמה הוצאתי באוגוסט?" }], {
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

    const result = await runChat(WITH_USER, USER, [{ role: "user", content: "תראה לי תנועות" }], {
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

    await runChat(WITH_USER, USER, [{ role: "user", content: "שאלה" }], { client, runTool: runTool as never });

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

    const result = await runChat(WITH_USER, USER, [{ role: "user", content: "שאלה" }], {
      client,
      runTool: runTool as never,
    });

    assert.equal(calls, 6); // MAX_TOOL_ROUNDS
    assert.ok(result.reply.includes("יותר מדי שלבים"));
    assert.deepEqual(result.turns[result.turns.length - 1], { type: "limit", rounds: 6 });
  });

  it("stop_reason='max_tokens' לא מוצג כתשובה סופית שקטה — מסומן ומוערת בבירור", async () => {
    const client: ChatClient = {
      messages: {
        create: async () => ({
          content: [{ type: "text" as const, text: "הנה סיכום ל-13 החודשים: ינואר 1,200" }],
          stop_reason: "max_tokens",
        }),
      },
    };
    const runTool = async () => {
      throw new Error("לא אמור להיקרא");
    };

    const result = await runChat(WITH_USER, USER, [{ role: "user", content: "סכם לי את כל הזמן" }], {
      client,
      runTool: runTool as never,
    });

    // הטקסט החלקי עדיין שם — לא נזרק — אבל עם הערה מפורשת שהוא נקטע.
    assert.ok(result.reply.startsWith("הנה סיכום ל-13 החודשים: ינואר 1,200"));
    assert.ok(result.reply.includes("נקטעה"));
    assert.deepEqual(result.turns[result.turns.length - 1], { type: "truncated" });
  });
});

/** בונה סיבוב מזויף של stream(): מזרים deltas ואז פותר עם ההודעה הסופית. */
function fakeStreamRound(
  textDeltas: string[],
  finalMessage: { content: unknown[]; stop_reason: string | null }
) {
  return {
    on(_event: "text", cb: (delta: string) => void) {
      for (const d of textDeltas) cb(d);
    },
    finalMessage: async () => finalMessage as never,
  };
}

describe("streamChat — גרסת ההזרמה", () => {
  it("מזרימה כל delta ל-onText, ומחזירה את הטקסט המחובר כתשובה", async () => {
    const client: StreamChatClient = {
      messages: {
        stream: () =>
          fakeStreamRound(["שלום", ", ", "איך אפשר לעזור?"], {
            content: [{ type: "text", text: "שלום, איך אפשר לעזור?" }],
            stop_reason: "end_turn",
          }),
      },
    };

    const received: string[] = [];
    const runTool = async () => {
      throw new Error("לא אמור להיקרא");
    };

    const result = await streamChat(
      WITH_USER,
      USER,
      [{ role: "user", content: "היי" }],
      (delta) => received.push(delta),
      { client, runTool: runTool as never }
    );

    assert.deepEqual(received, ["שלום", ", ", "איך אפשר לעזור?"]);
    assert.equal(result.reply, "שלום, איך אפשר לעזור?");
  });

  it("טקסט לפני בקשת כלי מוזרם גם הוא, אבל רק טקסט הסיבוב האחרון הופך לתשובה", async () => {
    let round = 0;
    const client: StreamChatClient = {
      messages: {
        stream: () => {
          round++;
          if (round === 1) {
            return fakeStreamRound(["בודק את הנתונים..."], {
              content: [
                { type: "text", text: "בודק את הנתונים..." },
                { type: "tool_use", id: "t1", name: "getMonthlyReport", input: {} },
              ],
              stop_reason: "tool_use",
            });
          }
          return fakeStreamRound(["הוצאת 3,200 ₪."], {
            content: [{ type: "text", text: "הוצאת 3,200 ₪." }],
            stop_reason: "end_turn",
          });
        },
      },
    };

    const received: string[] = [];
    const runTool = async () => ({ tool: "getMonthlyReport", facts: {} });

    const result = await streamChat(
      WITH_USER,
      USER,
      [{ role: "user", content: "כמה הוצאתי?" }],
      (delta) => received.push(delta),
      { client, runTool: runTool as never }
    );

    // שני הטקסטים הגיעו למסך, בסדר שהם נוצרו בו.
    assert.deepEqual(received, ["בודק את הנתונים...", "הוצאת 3,200 ₪."]);
    // אבל התשובה הסופית (למשל, לשמירה) היא רק מה שנאמר אחרי שהכלי חזר.
    assert.equal(result.reply, "הוצאת 3,200 ₪.");
    assert.deepEqual(
      result.turns.map((t) => t.type),
      ["text", "tool_call", "tool_result", "text"]
    );
  });

  it("כלי שזורק לא מפיל את ההזרמה", async () => {
    let round = 0;
    const client: StreamChatClient = {
      messages: {
        stream: () => {
          round++;
          if (round === 1) {
            return fakeStreamRound([], {
              content: [{ type: "tool_use", id: "t1", name: "findTransactions", input: {} }],
              stop_reason: "tool_use",
            });
          }
          return fakeStreamRound(["לא מצאתי נתונים."], {
            content: [{ type: "text", text: "לא מצאתי נתונים." }],
            stop_reason: "end_turn",
          });
        },
      },
    };
    const runTool = async () => {
      throw new Error("תקלת מסד");
    };

    const result = await streamChat(WITH_USER, USER, [{ role: "user", content: "תראה תנועות" }], () => {}, {
      client,
      runTool: runTool as never,
    });

    assert.equal(result.reply, "לא מצאתי נתונים.");
    const toolResult = result.turns.find((t) => t.type === "tool_result");
    assert.deepEqual(toolResult, { type: "tool_result", name: "findTransactions", result: { error: "תקלת מסד" } });
  });

  it("תקרת הסיבובים מזרימה הודעת גבול במקום להיתקע", async () => {
    let calls = 0;
    const client: StreamChatClient = {
      messages: {
        stream: () => {
          calls++;
          return fakeStreamRound([], {
            content: [{ type: "tool_use", id: `t${calls}`, name: "listAvailableMonths", input: {} }],
            stop_reason: "tool_use",
          });
        },
      },
    };
    const runTool = async () => ({ tool: "listAvailableMonths", months: [] });

    const received: string[] = [];
    const result = await streamChat(WITH_USER, USER, [{ role: "user", content: "שאלה" }], (d) => received.push(d), {
      client,
      runTool: runTool as never,
    });

    assert.equal(calls, 6);
    assert.equal(received.length, 1);
    assert.ok(received[0].includes("יותר מדי שלבים"));
    assert.equal(result.reply, received[0]);
  });

  it("stop_reason='max_tokens' בהזרמה מוסיף הערת חיתוך כדלתא נוספת, לא מסתיים סתם", async () => {
    const client: StreamChatClient = {
      messages: {
        stream: () =>
          fakeStreamRound(["הנה סיכום ל-13 החודשים: ינואר 1,200"], {
            content: [{ type: "text", text: "הנה סיכום ל-13 החודשים: ינואר 1,200" }],
            stop_reason: "max_tokens",
          }),
      },
    };
    const runTool = async () => {
      throw new Error("לא אמור להיקרא");
    };

    const received: string[] = [];
    const result = await streamChat(
      WITH_USER,
      USER,
      [{ role: "user", content: "סכם לי את כל הזמן" }],
      (d) => received.push(d),
      { client, runTool: runTool as never }
    );

    // הדלתא האחרונה שהתקבלה היא הערת החיתוך, לא שקט סתם.
    assert.ok(received[received.length - 1].includes("נקטעה"));
    assert.ok(result.reply.includes("נקטעה"));
    assert.deepEqual(result.turns[result.turns.length - 1], { type: "truncated" });
  });
});
