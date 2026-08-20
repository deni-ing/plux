/**
 * שמירת הדוח הגולמי ב-Supabase Storage.
 *
 * ── למה בכלל ────────────────────────────────────────────────────────
 * כדי שאפשר יהיה להריץ פענוח מחדש אחרי שיפור בפרסר, בלי לבקש מהמשתמש
 * להעלות שוב. בפרויקט הזה כבר תוקנו שלושה באגי פרסר; בלי הקובץ המקורי,
 * כל תיקון כזה משאיר את הנתונים הישנים שגויים לנצח.
 *
 * ── ומה המחיר ───────────────────────────────────────────────────────
 * הקובץ המקורי מכיל את מה שבחרנו לא לקרוא: שם מלא ותעודת זהות בשורה 1
 * של MAX, ומספר חשבון מלא בדף לאומי. לכן שלוש הגבלות, וכולן מכוונות:
 *
 *   1. **דלי פרטי.** אין URL ציבורי. גישה רק דרך קישור חתום קצר-מועד.
 *   2. **נתיב לפי משתמש.** `<userId>/<jobId>/<שם>` — הפרדה מבנית.
 *   3. **מחיקה אוטומטית אחרי 30 יום.** מספיק כדי לתקן פרסר ולהריץ מחדש,
 *      ולא הופך את המערכת לארכיון מסמכי זהות.
 *
 * ── והערה על המפתח ──────────────────────────────────────────────────
 * Storage ב-Supabase נשען על RLS משלו שמצפה לזהות של Supabase Auth.
 * אנחנו משתמשים ב-Clerk, ולכן אין התאמה — והדרך הישרה היא שהשרת בלבד
 * ניגש לאחסון, עם מפתח service_role, ואוכף את הפרדת המשתמשים בעצמו
 * דרך הנתיב. **המפתח הזה לעולם לא מגיע לדפדפן.** שים לב שהוא נקרא
 * כאן בתוך פונקציה ולא ברמת המודול — כך ייבוא בטעות מקוד לקוח נכשל
 * בבנייה במקום להדליף.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const BUCKET = "statements";

let cached: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL או SUPABASE_SERVICE_ROLE_KEY חסרים");
  }

  // ייבוא דינמי: מונע מהחבילה להיכנס לבאנדל של הלקוח.
  const { createClient } = require("@supabase/supabase-js") as typeof import("@supabase/supabase-js");
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

/** שם קובץ בטוח לנתיב. שומר עברית, מסיר מפרידים וכל מה שיכול לברוח מהתיקייה. */
function safeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]+/g, "_").replace(/\.{2,}/g, ".").slice(-120) || "statement";
}

export type StoredFile = { path: string };

/**
 * מעלה את הקובץ ומחזיר את הנתיב שיישמר ב-ImportJob.
 *
 * `upsert: false` בכוונה — נתיב כולל jobId ולכן ייחודי, והתנגשות היא
 * סימן לבאג ולא משהו לדרוס בשקט.
 */
export async function storeStatement(
  userId: string,
  jobId: string,
  file: { name: string; bytes: Uint8Array; type?: string }
): Promise<StoredFile> {
  const path = `${userId}/${jobId}/${safeName(file.name)}`;

  const { error } = await client()
    .storage.from(BUCKET)
    .upload(path, file.bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) throw new Error(`שמירת הקובץ נכשלה: ${error.message}`);
  return { path };
}

/**
 * קישור זמני לקריאת הקובץ. הדלי פרטי, ולכן זו הדרך היחידה להגיע אליו.
 * חמש דקות מספיקות להורדה ולא מספיקות כדי שקישור שדלף יישאר שימושי.
 */
export async function signedUrl(path: string, seconds = 300): Promise<string> {
  const { data, error } = await client().storage.from(BUCKET).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(`יצירת קישור נכשלה: ${error?.message}`);
  return data.signedUrl;
}

export async function removeStatement(path: string): Promise<void> {
  const { error } = await client().storage.from(BUCKET).remove([path]);
  if (error) throw new Error(`מחיקה נכשלה: ${error.message}`);
}
