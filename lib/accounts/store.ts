/**
 * שכבת המסד ליתרת חשבון. הקובץ היחיד כאן שיודע על Prisma — כמו
 * lib/budget/store.ts ו-lib/savings/store.ts.
 */

import type { Db } from "../db/client";
import { toAgorot } from "../analytics/money";
import {
  summarizeBalance,
  sortUpcomingCharges,
  type BalanceSummary,
  type UpcomingCharge,
} from "./engine";

export type { UpcomingCharge };

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * יתרת חשבון הבנק העדכנית ביותר, עם דלתא מול לפני כ-30 יום וגרף קטן.
 *
 * `null` כשאין למשתמש חשבון בנק (רק MAX) — לא שגיאה, גבול אמיתי של
 * הנתון: כרטיס אשראי אינו מדווח יתרה, רק MAX/לאומי מספקים אחת, ורק
 * ל"לאומי" (BANK) יש בכלל מה להציג כאן. ראו Account.balance בסכימה.
 *
 * `asOf` מגיע מבחוץ ולא מ-`new Date()` כאן — הקורא (app/page.tsx) כבר
 * קורא את השעון פעם אחת, ואותה נקודת זמן צריכה לשמש גם ל"האם תאריך
 * החיוב כבר עבר" למטה. שתי קריאות נפרדות לשעון יכולות להיפרד במילישניות
 * שחוצות חצות ולתת תשובות סותרות לאותו רינדור.
 */
export async function bankBalance(db: Db, userId: string, asOf: Date): Promise<BalanceSummary | null> {
  const account = await db.account.findFirst({
    where: { userId, type: "BANK", balance: { not: null } },
    orderBy: { balanceAt: "desc" },
  });
  if (!account || account.balance === null || !account.balanceAt) return null;

  const rows = await db.transaction.findMany({
    where: { userId, accountId: account.id, balanceAfter: { not: null } },
    select: { bookedAt: true, balanceAfter: true },
    orderBy: { bookedAt: "asc" },
  });

  const points = rows.map((r) => ({
    at: r.bookedAt,
    balance: toAgorot(r.balanceAfter!),
  }));

  const priorCutoff = new Date(account.balanceAt.getTime() - THIRTY_DAYS_MS);

  // << מ-26.08: חיובים פרטניים (individualChargeDate, היום: MAX חו״ל/
  //    מט״ח) שתאריך החיוב שלהם בין נקודת היתרה האחרונה שיובאה לבין
  //    עכשיו — כלומר "כבר קרו" אבל אף דף חשבון מיובא עדיין לא מעיד
  //    עליהם. `gt: account.balanceAt` ולא `gte`: חיוב בדיוק על נקודת
  //    היתרה כבר כלול בה, ספירה שלו שוב הייתה מכפילה אותו.
  const matured = await db.transaction.findMany({
    where: {
      userId,
      individualChargeDate: true,
      chargedAt: { not: null, gt: account.balanceAt, lte: asOf },
    },
    select: { amount: true },
  });

  return summarizeBalance(
    toAgorot(account.balance),
    account.balanceAt,
    points,
    priorCutoff,
    matured.map((m) => ({ amount: toAgorot(m.amount) }))
  );
}

/**
 * תנועות עם תאריך חיוב פרטני (individualChargeDate) שעדיין לא נספרו
 * כהוצאה בשום חודש — לתצוגה בדף הבית, כדי שהן לא ייעלמו בשקט. ראו
 * ההערה על השדה בסכימה ועל windowWhere ב-lib/analytics/load.ts.
 *
 * << מ-26.08, בקשת משתמש מפורשת: "לפי תאריך מה יורד קודם ומה אחרי".
 *    השאילתה מביאה מאגר (60, ממוין ב-DB לפי bookedAt כדי לתפוס את
 *    הפעילות העדכנית) והמיון בפועל — לפי chargedAt, לא bookedAt —
 *    קורה ב-sortUpcomingCharges (lib/accounts/engine.ts): פונקציה
 *    טהורה ונפרדת מהשאילתה, כדי שאפשר יהיה לבדוק אותה בלי מסד.
 */
export async function upcomingCharges(db: Db, userId: string, asOf: Date): Promise<UpcomingCharge[]> {
  const rows = await db.transaction.findMany({
    where: { userId, individualChargeDate: true },
    select: { id: true, merchant: true, amount: true, bookedAt: true, chargedAt: true },
    orderBy: { bookedAt: "desc" },
    take: 60,
  });

  const charges: UpcomingCharge[] = rows.map((r) => ({
    id: r.id,
    merchant: r.merchant,
    amount: toAgorot(r.amount),
    bookedAt: r.bookedAt,
    chargedAt: r.chargedAt,
    paid: r.chargedAt !== null && r.chargedAt.getTime() <= asOf.getTime(),
  }));

  return sortUpcomingCharges(charges).slice(0, 20);
}
