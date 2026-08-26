/**
 * POST /api/imports — קליטת דוח והכנסתו למסד.
 *
 * עטיפה דקה בכוונה: `parseStatement` מזהה ומפענח, `storeStatement`
 * שומר את הקובץ הגולמי, ו-`ingestStatement` כותב תחת RLS. כל השלושה
 * נבדקו בנפרד לפני שהיה כאן HTTP.
 */

import { auth } from "@clerk/nextjs/server";
import { parseStatement, UnsupportedFileError } from "@/lib/parsers";
import { ingestStatement } from "@/lib/import/ingest";
import { syncCurrentUser, withCurrentUser } from "@/lib/db/session";
import { storeStatement } from "@/lib/storage/statements";
import { recomputeSnapshots } from "@/lib/analytics/recompute";
import { randomUUID } from "node:crypto";

// unpdf, zlib ו-crypto דורשים Node. ב-edge runtime זה ייפול.
export const runtime = "nodejs";
export const maxDuration = 60;

/** 10MB. דוח בנקאי טיפוסי הוא פחות מ-500KB; זה גבול שפוי מול העלאה זדונית. */
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "expected multipart/form-data" }, { status: 400 });
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return Response.json({ error: "no files" }, { status: 400 });
  }

  // מוודא ששורת ה-User קיימת עם האימייל האמיתי מ-Clerk, ולא עם
  // ה-placeholder ש-ingest ייצור. חייב לקרות לפני הכתיבה הראשונה.
  //
  // << עטוף בכוונה: כשל כאן הוא כשל תשתית — מסד שעוד לא ער, או קריאה
  //    ל-Clerk שנפלה. בלי העטיפה כל הבקשה נופלת ב-500 סתמי, והמשתמש
  //    לא יודע אם הקובץ נקלט. 503 אומר "נסה שוב", וזו התשובה הנכונה.
  try {
    await syncCurrentUser();
  } catch (e) {
    console.error("syncCurrentUser failed", e);
    return Response.json(
      { error: "השירות לא זמין כרגע. נסה שוב בעוד רגע — שום קובץ לא נקלט." },
      { status: 503 }
    );
  }

  const results = [];

  for (const file of files) {
    if (file.size > MAX_BYTES) {
      results.push({ file: file.name, ok: false, error: "הקובץ גדול מדי" });
      continue;
    }

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = await parseStatement({ name: file.name, bytes });

      // מזהה נוצר כאן ולא במסד, כי הנתיב באחסון צריך להיות ידוע
      // לפני שנכתבת שורת ה-ImportJob שמצביעה עליו.
      const jobId = randomUUID();

      // << שמירת הקובץ אינה חוסמת את הייבוא. אם האחסון לא זמין, עדיף
      //    שהתנועות ייכנסו ושנאבד את היכולת לפענח מחדש, מאשר שהמשתמש
      //    יקבל כישלון על נתונים שנקראו בהצלחה.
      let storagePath = `inline:${file.name}`;
      let storageWarning: string | null = null;
      try {
        const stored = await storeStatement(userId, jobId, { name: file.name, bytes, type: file.type });
        storagePath = stored.path;
      } catch (e) {
        console.error("storage failed", file.name, e);
        storageWarning = "הקובץ המקורי לא נשמר — פענוח חוזר לא יתאפשר עבורו";
      }

      const summary = await ingestStatement(userId, parsed, {
        fileName: file.name,
        storagePath,
        jobId,
      });

      results.push({
        file: file.name,
        ok: true,
        provider: parsed.provider,
        account: parsed.accountLabel,
        period: parsed.statementPeriod,
        ...summary,
        checks: parsed.checks,
        warnings: storageWarning ? [...summary.warnings, storageWarning] : summary.warnings,
      });
    } catch (e) {
      const message =
        e instanceof UnsupportedFileError
          ? e.message
          : "הפענוח נכשל. ודא שזה קובץ דוח מקורי שלא נערך.";
      console.error("import failed", file.name, e);
      results.push({ file: file.name, ok: false, error: message });
    }
  }

  // << אותה החלטה כמו ב-app/transactions/actions.ts: הסנפשוט הוא תוצר
  //    של הייבוא ולא תנאי להצלחתו. בלי זה, ייבוא לתוך חודש שכבר יש לו
  //    סנפשוט (למשל דף MAX מעודכן על אותו חודש) משאיר את הדשבורד מציג
  //    סנפשוט תקף-אך-ישן — readSnapshot לא בודק אם נוספו תנועות, רק אם
  //    הגרסה עדכנית. ראו lib/analytics/recompute.ts.
  if (results.some((r) => r.ok)) {
    try {
      await withCurrentUser((db) => recomputeSnapshots(db, userId, { force: true }));
    } catch (e) {
      console.error("recomputeSnapshots after import failed", e);
      // הדשבורד ייפול חזרה לחישוב חי. ראה lib/analytics/facts.ts
    }
  }

  return Response.json({ results });
}
