/**
 * הכלים שהצ'אט יכול לבקש להריץ. סעיף 7.1.
 *
 * ─── שלושה כלים, לא יותר ───
 *
 * הפיתוי הטבעי הוא כלי לכל שאלה אפשרית — sumByCategory, topMerchants,
 * compareMonths וכן הלאה. לא הולכים בכיוון הזה, כי `SnapshotFacts` כבר
 * מכיל את כל זה מחושב: קטגוריות, השוואה לחודש קודם, "מה השתנה הכי
 * הרבה", חיובים חוזרים, עמלות ותחזית. כלי נוסף לכל שדה קיים הוא כפילות
 * שצריך לתחזק, לא יכולת חדשה.
 *
 * מה שבאמת חסר הם שני דברים שה-snapshot לא נותן: תנועות גולמיות
 * (`findTransactions`, כשהמשתמש שואל "אילו תנועות" ולא "כמה"), ורשימת
 * החודשים שיש עליהם נתונים (`listAvailableMonths`, כדי שהמודל לא ינחש
 * חודש שאין בו כלום ויקבל null בלי הקשר).
 *
 * ‏getMonthlyReport הוא הכלי המרכזי, ומחזיר את אותו מבנה בדיוק שהדשבורד
 * מציג — עבר דרך `factsForAi` רק כדי להמיר אגורות לשקלים ולהחיל את
 * אזהרת ה-annualized. שום חישוב לא קורה כאן; זו קריאה למה שכבר קיים
 * ונבדק.
 */

import type { Db } from "../db/client";
import { availableMonths, factsFor, latestPeriod, parseMonthKey } from "../analytics/facts";
import { browse } from "../txns/browse";
import { factsForAi, type AiFacts } from "./present";

export type ToolDef = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export const TOOLS: ToolDef[] = [
  {
    name: "getMonthlyReport",
    description:
      "מחזיר דוח מלא לחודש נתון: הוצאות והכנסות לפי קטגוריה, השוואה לחודש הקודם, " +
      "חיובים חוזרים, עמלות, ותחזית לסוף החודש. זה מקור המידע הראשי — רוב השאלות " +
      "על 'כמה הוצאתי' או 'מה השתנה' נענות מכאן, לא מ-findTransactions. " +
      "כל הסכומים בשקלים. אם אין month, מוחזר החודש האחרון שיש בו נתונים " +
      "(לא בהכרח החודש הקלנדרי הנוכחי — יש כאן נתונים היסטוריים בלבד).",
    input_schema: {
      type: "object",
      properties: {
        month: {
          type: "string",
          description: "פורמט YYYY-MM, למשל 2026-08. לא חובה.",
        },
      },
    },
  },
  {
    name: "findTransactions",
    description:
      "מחזיר רשימת תנועות בודדות לפי סינון. להשתמש כשהשאלה היא על תנועות ספציפיות " +
      "('אילו חיובים היו למסעדות', 'מתי שילמתי ל...') ולא על סכום כולל — לסכומים " +
      "וסיכומים יש את getMonthlyReport, והוא מדויק יותר כי הוא כבר מחושב.",
    input_schema: {
      type: "object",
      properties: {
        month: { type: "string", description: "פורמט YYYY-MM. לא חובה — בלי זה, כל הטווח." },
        category: { type: "string", description: "slug של קטגוריה, למשל food.groceries." },
        merchant: { type: "string", description: "חיפוש חופשי (contains) בשם בית העסק." },
        unclassifiedOnly: { type: "boolean", description: "רק תנועות בלי קטגוריה." },
        limit: { type: "number", description: "מספר תנועות מקסימלי. ברירת מחדל 30, תקרה 100." },
      },
    },
  },
  {
    name: "listAvailableMonths",
    description:
      "מחזיר את כל החודשים שיש בהם נתונים, מהחדש לישן. להשתמש לפני getMonthlyReport " +
      "כשלא ברור אילו חודשים קיימים בכלל — עדיף מלנחש ולקבל תשובה ריקה.",
    input_schema: { type: "object", properties: {} },
  },
];

export type ToolResult =
  | { tool: "getMonthlyReport"; facts: AiFacts }
  | { tool: "getMonthlyReport"; error: string }
  | { tool: "findTransactions"; count: number; transactions: unknown[] }
  | { tool: "listAvailableMonths"; months: string[] };

/**
 * מריץ כלי לפי שם. הגבול היחיד שנוגע ב-DB בקובץ הזה.
 *
 * << `db` מגיע כבר בתוך `withCurrentUser` מהקורא (route ה-chat) —
 *    בדיוק כמו בכל מסך אחר. הכלים לא פותחים חיבור משלהם ולא מכירים
 *    את Clerk; ה-RLS כבר אכף את גבול המשתמש לפני שהגענו לכאן.
 */
export async function runTool(
  db: Db,
  userId: string,
  name: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  switch (name) {
    case "getMonthlyReport": {
      const period = parseMonthKey(input.month as string | undefined) ?? (await latestPeriod(db, userId));
      if (!period) return { tool: "getMonthlyReport", error: "אין עדיין נתונים למשתמש הזה." };

      const result = await factsFor(db, userId, period);
      if (!result) return { tool: "getMonthlyReport", error: `אין נתונים לחודש ${period.key}.` };

      return { tool: "getMonthlyReport", facts: factsForAi(result.facts) };
    }

    case "findTransactions": {
      const limit = Math.min(Math.max(Number(input.limit) || 30, 1), 100);
      const rows = await browse(db, userId, {
        month: input.month as string | undefined,
        slug: input.category as string | undefined,
        q: input.merchant as string | undefined,
        unclassified: input.unclassifiedOnly === true,
        limit,
      });
      return { tool: "findTransactions", count: rows.length, transactions: rows };
    }

    case "listAvailableMonths": {
      const months = await availableMonths(db, userId);
      return { tool: "listAvailableMonths", months };
    }

    default:
      // << כלי לא מוכר הוא באג בקוד שקורא, לא קלט משתמש — לכן זריקה
      //    ולא תשובת שגיאה שקטה. אותה מדיניות כמו ב-getClassifier.
      throw new Error(`כלי לא מוכר: ${name}`);
  }
}
