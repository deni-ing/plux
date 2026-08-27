/**
 * שומר את מסד הנתונים (Supabase) "ער". משימה 9.5.
 *
 * בתוכנית החינמית, Supabase משהה (pauses) פרויקט אחרי כשבוע בלי שום
 * שאילתה — וההפעלה מחדש היא ידנית מה-dashboard, לא אוטומטית. בין
 * ביקורים בפורטפוליו (שיכולים בקלות להיות רחוקים משבוע) זה אומר
 * שהדמו עלול פשוט לא לעבוד. cron יומי כאן מונע מזה לקרות.
 *
 * שאילתה מינימלית בכוונה: `SELECT 1` לא נוגע בשום טבלה, כל שכן נתון
 * פיננסי — כל מה שנדרש הוא שהמסד יראה שאילתה כלשהי, לא תוצאה
 * שימושית ממנה. `maintenanceDb()` (DIRECT_URL, בלי RLS) מאותה סיבה
 * שהוא קיים כבר ב-purge-statements: זו עבודת מערכת בלי משתמש מחובר —
 * ראו lib/db/maintenance.ts להסבר המלא על ההיתר הזה.
 *
 * הרצה: Vercel Cron, יומי. ראה vercel.json.
 */

import { maintenanceDb } from "@/lib/db/maintenance";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function GET(req: Request) {
  // אותה מדיניות כמו purge-statements: בלי CRON_SECRET הנתיב היה פתוח
  // לכל אחד. כאן זה פחות קריטי (אין מחיקה), אבל אין סיבה לחשוף
  // endpoint שמפעיל שאילתת מסד לכל אחד באינטרנט.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = maintenanceDb();
  const startedAt = Date.now();

  try {
    await db.$queryRaw`SELECT 1`;
  } catch (e) {
    console.error("keepalive query failed", e);
    return Response.json({ error: "query failed" }, { status: 502 });
  }

  return Response.json({
    ok: true,
    tookMs: Date.now() - startedAt,
    at: new Date().toISOString(),
  });
}
