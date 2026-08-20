/**
 * מחיקה תקופתית של דוחות גולמיים.
 *
 * הקובץ המקורי נשמר כדי לאפשר פענוח חוזר אחרי שיפור בפרסר — אבל הוא
 * מכיל את מה שבחרנו לא לקרוא: שם מלא ותעודת זהות בשורה 1 של MAX,
 * ומספר חשבון מלא בדף לאומי. שמירה לנצח הופכת את המערכת לארכיון
 * מסמכי זהות, וזה לא מה שהיא.
 *
 * 30 יום הוא איזון: מספיק כדי לתקן באג בפרסר ולהריץ מחדש, ולא מספיק
 * כדי להצטבר. התנועות המפוענחות נשארות — רק המקור נמחק.
 *
 * הרצה: Vercel Cron, יומי. ראה vercel.json.
 */

import { maintenanceDb } from "@/lib/db/maintenance";
import { removeStatement } from "@/lib/storage/statements";

export const runtime = "nodejs";
export const maxDuration = 60;

const RETENTION_DAYS = 30;

/** תווית שמחליפה את הנתיב אחרי מחיקה, כדי שהשורה תישאר מתועדת. */
const purgedMark = (fileName: string) => `purged:${fileName}`;

export async function GET(req: Request) {
  // Vercel Cron שולח Authorization: Bearer <CRON_SECRET>. בלי הסוד הזה
  // הנתיב היה פתוח לכל אחד — ומחיקה היא בדיוק מה שלא רוצים שיהיה פתוח.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const db = maintenanceDb();

  // רק שורות שיש להן קובץ אמיתי באחסון: לא `inline:` (שמירה שנכשלה
  // או קדמה לפיצ'ר) ולא `purged:` (כבר נמחק).
  const stale = await db.importJob.findMany({
    where: {
      startedAt: { lt: cutoff },
      NOT: [
        { storagePath: { startsWith: "inline:" } },
        { storagePath: { startsWith: "purged:" } },
      ],
    },
    select: { id: true, storagePath: true, fileName: true },
    take: 500,
  });

  let removed = 0;
  const failures: string[] = [];

  for (const job of stale) {
    try {
      await removeStatement(job.storagePath);
      // מסמנים רק אחרי מחיקה מוצלחת. אם המחיקה נכשלה, השורה תיבחר
      // שוב בהרצה הבאה במקום להיעלם מהרדאר.
      await db.importJob.update({
        where: { id: job.id },
        data: { storagePath: purgedMark(job.fileName) },
      });
      removed++;
    } catch (e) {
      console.error("purge failed", job.id, e);
      failures.push(job.id);
    }
  }

  return Response.json({
    cutoff: cutoff.toISOString(),
    candidates: stale.length,
    removed,
    failed: failures.length,
  });
}
