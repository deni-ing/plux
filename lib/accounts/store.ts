/**
 * שכבת המסד ליתרת חשבון. הקובץ היחיד כאן שיודע על Prisma — כמו
 * lib/budget/store.ts ו-lib/savings/store.ts.
 */

import type { Db } from "../db/client";
import { toAgorot } from "../analytics/money";
import { summarizeBalance, type BalanceSummary } from "./engine";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * יתרת חשבון הבנק העדכנית ביותר, עם דלתא מול לפני כ-30 יום וגרף קטן.
 *
 * `null` כשאין למשתמש חשבון בנק (רק MAX) — לא שגיאה, גבול אמיתי של
 * הנתון: כרטיס אשראי אינו מדווח יתרה, רק MAX/לאומי מספקים אחת, ורק
 * ל"לאומי" (BANK) יש בכלל מה להציג כאן. ראו Account.balance בסכימה.
 */
export async function bankBalance(db: Db, userId: string): Promise<BalanceSummary | null> {
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

  return summarizeBalance(toAgorot(account.balance), account.balanceAt, points, priorCutoff);
}
