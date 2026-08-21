/**
 * כתיבת תוצאות פענוח למסד.
 *
 * זו הנקודה שבה כל מה שנבנה עד עכשיו נפגש: הפרסרים מייצרים תנועות,
 * `withUser` פותח טרנזקציה תחת זהות משתמש, ו-RLS אוכף שאף שורה לא
 * תיכתב בשם מישהו אחר — גם אם הקוד כאן יטעה.
 *
 * שלוש החלטות שקובעות את ההתנהגות:
 *
 *  1. **הכתיבה כולה בטרנזקציה אחת.** ייבוא שנכשל באמצע לא משאיר חצי דוח
 *     במסד. `withUser` כבר עוטף בטרנזקציה, וזו סיבה נוספת לכך שהיא שם.
 *     הסיווג, לעומת זאת, רץ אחריה ובנפרד — ראו את ההערה ב-`ingestStatement`.
 *
 *  2. **כפילויות מדולגות, לא נדרסות.** `skipDuplicates` נשען על המפתח
 *     הייחודי (userId, dedupHash, occurrence). ייבוא חוזר של אותו קובץ
 *     לא ייצור שורות חדשות ולא ידרוס תיקוני סיווג שהמשתמש עשה.
 *
 *  3. **החשבון מזוהה לפי (ספק, תווית) ולא נוצר מחדש בכל ייבוא.**
 *     אחרת כל דוח חודשי היה יוצר "כרטיס" נוסף, וההיסטוריה הייתה מתפצלת.
 */

import { withUser, type Db } from "../db/client";
import { isReconciled, type StatementResult } from "../parsers";
import { runClassification } from "../classify/run";

export type ImportSummary = {
  importJobId: string;
  accountId: string;
  rowsParsed: number;
  rowsInserted: number;
  rowsDuplicate: number;
  reconciled: boolean;
  warnings: string[];
  /** כמה תנועות קיבלו קטגוריה בעקבות הייבוא הזה. */
  classified?: number;
};

export type IngestOptions = {
  fileName: string;
  /** הנתיב ב-Supabase Storage. נשמר כדי לאפשר הרצה מחדש של הפענוח. */
  storagePath: string;
  /**
   * אימייל המשתמש, אם ידוע. משמש רק ליצירת שורת ה-User בפעם הראשונה.
   * בנתיב האפליקציה `syncCurrentUser()` כבר יצר אותה עם האימייל האמיתי,
   * וכאן לא נדרס דבר.
   */
  userEmail?: string;
  /**
   * מזהה שנקבע מראש ל-ImportJob.
   *
   * << מסלול ה-HTTP יוצר את המזהה *לפני* הייבוא, כי נתיב הקובץ ב-Storage
   *    בנוי ממנו: `<userId>/<jobId>/<name>`. בלי זה היו נדרשות שתי כתיבות —
   *    ליצור job, לשמור קובץ, לעדכן נתיב — ותקלה באמצע הייתה משאירה שורה
   *    שמצביעה לשומקום. בהרצה מסקריפט אין צורך, ואז המסד מייצר מזהה בעצמו.
   */
  jobId?: string;
};

export async function ingestStatement(
  userId: string,
  result: StatementResult,
  opts: IngestOptions
): Promise<ImportSummary> {
  const summary = await writeStatement(userId, result, opts);

  // הסיווג רץ **אחרי** שהכתיבה הסתיימה ובטרנזקציות נפרדות משלו.
  // אם הוא נופל, הייבוא עצמו כבר מוגן: השורות במסד, והסיווג יושלם
  // בהרצה הבאה. ההפך — לגרור את הסיווג לתוך אותה טרנזקציה — היה הופך
  // כשל סיווג לכשל ייבוא, וזה יחס לא נכון בין השניים.
  try {
    const report = await runClassification(userId);
    summary.classified = report.classified;
  } catch (err) {
    summary.warnings.push(
      `הייבוא הצליח אבל הסיווג נכשל: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return summary;
}

async function writeStatement(
  userId: string,
  result: StatementResult,
  opts: IngestOptions
): Promise<ImportSummary> {
  return withUser(userId, async (db) => {
    // << כל הטבלאות מצביעות על users.id במפתח זר, ולכן השורה חייבת להתקיים
    //    לפני הכתיבה הראשונה. בדפדפן syncCurrentUser() כבר דאג לזה; בהרצה
    //    מסקריפט או מ-cron אין מי שיעשה זאת, והמסד סירב — נכון שסירב.
    //    update ריק בכוונה: ייבוא לא אמור לגעת בפרטי המשתמש.
    await db.user.upsert({
      where: { id: userId },
      create: { id: userId, email: opts.userEmail ?? `${userId}@import.local` },
      update: {},
    });

    const account = await upsertAccount(db, userId, result);

    const job = await db.importJob.create({
      data: {
        // המזהה נקבע מראש רק כשהגיע מבחוץ. אחרת @default(uuid()) עושה את שלו.
        ...(opts.jobId ? { id: opts.jobId } : {}),
        userId,
        storagePath: opts.storagePath,
        fileName: opts.fileName,
        format: result.format === "UNKNOWN" ? "UNKNOWN" : result.format,
        statementPeriod: result.statementPeriod,
        status: "PROCESSING",
        rowsParsed: result.transactions.length,
      },
    });

    const created = await db.transaction.createMany({
      skipDuplicates: true,
      data: result.transactions.map((t) => ({
        userId,
        accountId: account.id,
        importJobId: job.id,
        bookedAt: new Date(t.bookedAt),
        chargedAt: t.chargedAt ? new Date(t.chargedAt) : null,
        amount: t.amount,
        currency: t.currency,
        originalAmount: t.originalAmount,
        originalCurrency: t.originalCurrency,
        fxRate: t.fxRate,
        merchantRaw: t.merchantRaw,
        merchant: t.merchant,
        descriptor: t.descriptor,
        providerCategory: t.providerCategory,
        kind: t.kind,
        direction: t.direction,
        status: t.status,
        cardLast4: t.cardLast4,
        txnType: t.txnType,
        channel: t.channel,
        note: t.note,
        balanceAfter: t.balanceAfter,
        countsAsSpending: t.countsAsSpending,
        dedupHash: t.dedupHash,
        occurrence: t.occurrence,
      })),
    });

    const rowsInserted = created.count;
    const rowsDuplicate = result.transactions.length - rowsInserted;
    const reconciled = isReconciled(result);

    await db.importJob.update({
      where: { id: job.id },
      data: {
        status: "COMPLETED",
        rowsInserted,
        rowsDuplicate,
        // << reconciled=false אינו כישלון ייבוא. הוא סימן שהנתונים נכנסו
        //    אבל לא הצליחו לאמת את עצמם, וזו אזהרה שראויה להיראות בממשק.
        reconciled,
        finishedAt: new Date(),
      },
    });

    // היתרה העדכנית ביותר בדף חשבון היא היתרה הנוכחית של החשבון.
    // בכרטיס אשראי אין יתרה, ולכן זה חל רק כשיש.
    const latest = latestBalance(result);
    if (latest) {
      await db.account.update({
        where: { id: account.id },
        data: { balance: latest.balance, balanceAt: new Date(latest.at) },
      });
    }

    return {
      importJobId: job.id,
      accountId: account.id,
      rowsParsed: result.transactions.length,
      rowsInserted,
      rowsDuplicate,
      reconciled,
      warnings: result.warnings,
    };
  });
}

async function upsertAccount(db: Db, userId: string, result: StatementResult) {
  const existing = await db.account.findFirst({
    where: { userId, provider: result.provider, label: result.accountLabel },
  });

  if (existing) {
    // ארבע הספרות עשויות להופיע רק בחלק מהדוחות, ולכן ממלאים ולא דורסים.
    if (!existing.last4 && result.accountLast4) {
      return db.account.update({
        where: { id: existing.id },
        data: result.accountType === "BANK"
          ? { accountLast4: result.accountLast4 }
          : { last4: result.accountLast4 },
      });
    }
    return existing;
  }

  return db.account.create({
    data: {
      userId,
      provider: result.provider,
      type: result.accountType,
      label: result.accountLabel,
      last4: result.accountType === "CREDIT_CARD" ? result.accountLast4 : null,
      accountLast4: result.accountType === "BANK" ? result.accountLast4 : null,
      // << מחזור החיוב של MAX: מה-9 בחודש הקודם עד ה-8, וחיוב ב-10.
      billingCycleDay: result.provider === "MAX" ? 10 : null,
    },
  });
}

function latestBalance(result: StatementResult): { balance: string; at: string } | null {
  let best: { balance: string; at: string } | null = null;
  for (const t of result.transactions) {
    if (!t.balanceAfter) continue;
    if (!best || t.bookedAt > best.at) best = { balance: t.balanceAfter, at: t.bookedAt };
  }
  return best;
}
