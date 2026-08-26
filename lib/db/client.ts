import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * גישה למסד תחת RLS.
 *
 * שני חיבורים נפרדים בכוונה:
 *   • כאן, בזמן ריצה — ה-pooler (פורט 6543), כי סרברלס פותח המון חיבורים קצרים.
 *   • ב-prisma.config.ts, למיגרציות — חיבור ישיר (פורט 5432).
 *
 * הנקודה הקריטית היא SET LOCAL ולא SET.
 *
 * SET רגיל נשאר על *החיבור*. מכיוון שאנחנו מאחורי pooler ב-transaction mode,
 * החיבור חוזר לבריכה בסוף הבקשה ומוגש לבקשה הבאה — שתירש את זהות המשתמש
 * הקודם ותראה את הנתונים שלו. זה באג שלא מתגלה בפיתוח, כי בפיתוח יש משתמש אחד.
 *
 * SET LOCAL תקף בתוך הטרנזקציה בלבד ומתאפס ב-COMMIT, ולכן החיבור חוזר נקי.
 * לכן כל גישה חייבת לעבור בטרנזקציה — אין נתיב עוקף.
 *
 * << PLUX_DIRECT_DB=1: מעקף את ה-pooler ומתחבר ישירות (DIRECT_URL, פורט 5432).
 *    מיועד לסקריפטים חד-פעמיים בלבד (classify-check --resync, snapshot --force
 *    וכו') — לא ל-`npm run dev` ולא לפריסה, כי לחיבור הישיר יש הרבה פחות
 *    חיבורים זמינים ומיועד למספר קטן של תהליכים. נוסף אחרי שנצפתה שגיאת
 *    FK-violation תמוהה (23503, categories_userId_fkey) בזמן `createMany`
 *    דרך ה-pooler בסביבת RLS — לא אושר סופית שזה שורש הבעיה, אבל מעקף
 *    את כל שכבת ה-pooler/prepared-statements בבת אחת, וזה בדיוק סוג הסקריפטים
 *    שסובלים ממנה הכי הרבה (הרבה כתיבות ברצף בטרנזקציה אחת ארוכה).
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const useDirect = process.env.PLUX_DIRECT_DB === "1";
  const connectionString = useDirect ? process.env.DIRECT_URL : process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(useDirect ? "DIRECT_URL is not set" : "DATABASE_URL is not set");
  }
  if (useDirect) {
    console.error("\x1b[33m[db] מחובר ישירות דרך DIRECT_URL (PLUX_DIRECT_DB=1), לא דרך ה-pooler\x1b[0m");
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** מזהה משתמש חוקי בלבד — הערך נכנס ל-SQL, אז הוא נבדק ולא רק מסונן. */
function assertSafeUserId(userId: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) {
    throw new Error("invalid user id");
  }
}

export type Db = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

/**
 * מריץ עבודה תחת זהות משתמש. זו נקודת הכניסה היחידה לנתוני משתמש.
 *
 * שים לב: `userId` מגיע כפרמטר ולא נשלף כאן מ-Clerk או מ-headers.
 * זה מה ששומר על השכבה הזו נקייה מ-Next.js וניתנת להרצה מטסט או מסקריפט.
 */
export async function withUser<T>(
  userId: string,
  work: (db: Db) => Promise<T>
): Promise<T> {
  assertSafeUserId(userId);

  return prisma.$transaction(async (tx) => {
    // set_config(..., true) הוא המקבילה של SET LOCAL, ובניגוד ל-SET LOCAL הוא
    // מקבל פרמטר — כך שהערך עובר כפרמטר ולא מוזרק למחרוזת SQL.
    await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
    return work(tx as unknown as Db);
  });
}
