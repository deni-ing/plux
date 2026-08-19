/**
 * הגשר בין Clerk למסד.
 *
 * זה הקובץ היחיד שיודע גם על Next.js וגם על שכבת הנתונים. `lib/db/client.ts`
 * נשאר נקי מ-Next לגמרי — הוא מקבל userId כפרמטר ותו לא — ולכן אפשר להריץ
 * אותו מטסט, מסקריפט או מ-cron בלי לדמות בקשת HTTP. בדיוק כך הרצנו את
 * rls-check.mts.
 */

import { auth, currentUser } from "@clerk/nextjs/server";
import { withUser, type Db } from "./client";

/**
 * מריץ עבודה תחת המשתמש המחובר.
 *
 * זריקה כשאין משתמש היא התנהגות מכוונת: עדיף שנתיב לא מוגן ייפול ברעש
 * מאשר יחזיר תשובה ריקה שנראית תקינה.
 */
export async function withCurrentUser<T>(work: (db: Db) => Promise<T>): Promise<T> {
  const { userId } = await auth();
  if (!userId) throw new Error("unauthenticated");
  return withUser(userId, work);
}

/** מזהה המשתמש המחובר, או null. לשימוש בבדיקות תנאי בלבד. */
export async function currentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId ?? null;
}

/**
 * מוודא ששורת ה-User קיימת במסד.
 *
 * Clerk מחזיק את הזהות, אבל הטבלאות שלנו מצביעות על `users.id` במפתח זר,
 * ולכן צריכה להיות שם שורה לפני שנכתבת תנועה ראשונה. upsert ולא create,
 * כי הפונקציה נקראת בכל התחברות ולא רק בהרשמה.
 *
 * ה-upsert רץ בתוך withUser, כלומר תחת RLS — המדיניות על טבלת users
 * מתירה לכתוב רק שורה שה-id שלה שווה למשתמש הנוכחי.
 */
export async function syncCurrentUser(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;

  const email = user.primaryEmailAddress?.emailAddress;
  if (!email) throw new Error("clerk user has no primary email");

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || null;

  await withUser(user.id, (db) =>
    db.user.upsert({
      where: { id: user.id },
      create: { id: user.id, email, displayName },
      update: { email, displayName },
    })
  );

  return user.id;
}
