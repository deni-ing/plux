/**
 * בדיקת אבחון גולמית לשכבת ה-AI, בלי Prisma ובלי עיבוד — כדי לבודד
 * בעיה בין הרשת/המודל לבין הפענוח (parseVerdicts) כשמשהו משתבש
 * בסיווג בפועל (4.8). לא נוגע במסד בכלל.
 *
 *   npx tsx scripts/ai-debug.mts
 *
 * מדפיס את התשובה הגולמית, כולל stop_reason — כדי לזהות תשובה נקטעת
 * (stop_reason=max_tokens) באותה בדיקה בדיוק שכבר קיימת ב-
 * lib/chat/client.ts. שני בתי עסק בלבד, בכוונה: אצווה קטנה שמבודדת
 * תקלת פרומפט/רשת מתקלת גודל-אצווה (ראו ההערה על MAX_TOKENS ב-
 * lib/classify/ai/claude.ts).
 */

import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, buildUserPrompt, parseVerdicts } from "../lib/classify/ai/prompt";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", O = "\x1b[0m";

const merchants = ["סופר יוסי", "פז דלק"];
const allowed = ["food.groceries", "transport.fuel"];
const model = process.env.PLUX_CLASSIFY_MODEL ?? "claude-sonnet-5";

console.log(`${D}מודל: ${model}${O}`);
console.log(`${D}שולח בקשה ל-Claude...${O}\n`);

const client = new Anthropic();

try {
  const response = await client.messages.create({
    model,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(merchants, allowed) }],
  });

  const stopReason = (response as { stop_reason?: string | null }).stop_reason ?? "(חסר)";
  console.log(`${G}תשובה התקבלה.${O}  stop_reason: ${stopReason}`);

  console.log(`\n${D}--- content גולמי ---${O}`);
  console.log(JSON.stringify(response.content, null, 2));

  const text = (response.content as { type: string; text?: string }[])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");

  console.log(`\n${D}--- טקסט מחולץ ---${O}`);
  console.log(text || "(ריק)");

  const parsed = parseVerdicts(text, new Set(allowed));
  console.log(`\n${D}--- נפרס ---${O}`);
  console.log(parsed);

  if (parsed.length === 0) {
    console.log(`\n${Y}parseVerdicts לא הצליח לחלץ שום דבר מהטקסט למעלה.${O}`);
    console.log(`${Y}בדוק אם הטקסט הוא JSON תקין בתוך [ ] — לא רק "נשמע נכון".${O}`);
  } else {
    console.log(`\n${G}הצליח — ${parsed.length}/${merchants.length} נפרסו.${O}`);
  }
} catch (err) {
  console.log(`${R}הבקשה נכשלה:${O}`);
  console.error(err);
}

// << לא process.exit(0) בכוונה: זו בדיוק הקריסה שנצפתה — process.exit()
// הורג את התהליך באמצע, ואם ל-Anthropic SDK יש עדיין socket keep-alive
// פתוח (undici), Windows תופס את זה כתקלת handle ברמת libuv. exitCode
// נותן ל-Node לסיים בעצמו ברגע שה-event loop מתרוקן — התהליך עדיין
// יוצא, רק בלי להרוג handle באמצע ניקוי.
process.exitCode = 0;
