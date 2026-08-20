/**
 * לקוח מסד לעבודות תחזוקה.
 *
 * **זה החריג היחיד בפרויקט ל-RLS, והוא מכוון ומתועד.**
 *
 * כל שאר הקוד ניגש למסד דרך `withUser`, כתפקיד `plux_app` שאין לו
 * `BYPASSRLS` — כלומר גם באג בקוד לא יכול לחשוף נתונים של משתמש אחר.
 * אבל עבודת מחיקה תקופתית רצה בלי משתמש מחובר וחייבת לראות את כל
 * המשתמשים, ולכן היא מתחברת ב-`DIRECT_URL` — תפקיד `postgres`.
 *
 * שלוש הגבלות שהופכות את זה למקובל:
 *   1. הקובץ הזה מיובא **רק** מנתיבי cron, שמוגנים בסוד משותף.
 *   2. השאילתות כאן קוראות ומעדכנות מטא-דאטה של קבצים בלבד —
 *      לא תנועות, לא סכומים, ולא שום דבר שקשור לתוכן פיננסי.
 *   3. אין כאן `findMany` על נתוני משתמש. אם מישהו יוסיף — זה הרגע
 *      לעצור ולשאול למה עבודת מערכת צריכה לקרוא תנועות.
 */

import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

let cached: PrismaClient | null = null;

export function maintenanceDb(): PrismaClient {
  if (cached) return cached;

  const connectionString = process.env.DIRECT_URL;
  if (!connectionString) throw new Error("DIRECT_URL is not set");

  cached = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: ["error"],
  });
  return cached;
}
