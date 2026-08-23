/**
 * השגת עובדות לתקופה — למסך.
 *
 * ─── המטמון הוא אופטימיזציה, לא תלות ───
 *
 * `readSnapshot` מחזיר null כשאין סנפשוט, וגם כשיש אחד בגרסה ישנה.
 * הפיתוי הוא להציג אז "אין נתונים" ולבקש מהמשתמש להריץ סקריפט.
 *
 * זה הופך מטמון לתלות. **דף שמציג "אין נתונים" בזמן שהתנועות במסד
 * משקר על עצמו** — המידע קיים, רק לא בצורה ששמרנו. לכן כשאין סנפשוט
 * תקף, הדף מחשב בזיכרון מאותה פונקציה בדיוק שכותבת אותו.
 *
 * לא גרסה שנייה של האמת: `computeMonth` היא אותה שורת קוד שרצה
 * ב-`snapshot.mts`. **מה שמשותף הוא הפונקציה, לא הערך** — וזה ההבדל
 * בין מטמון לבין שכפול.
 *
 * הדף לא כותב את מה שחישב. רינדור אינו אמור להשאיר עקבות.
 */

import type { Db } from "../db/client";
import { loadRange } from "./load";
import { categoryNames } from "./load";
import { monthOf, monthPeriod, monthsBack, type Period } from "./period";
import { computeMonth, readSnapshot } from "./recompute";
import type { SnapshotFacts } from "./snapshot";

/** כמה חודשים אחורה נטענים כשמחשבים בזמן אמת. */
const LOOKBACK = 12;

export type FactsResult = {
  facts: SnapshotFacts;
  /** מאיפה הגיעו: מהמסד או מחישוב חי. משמש להצגה, לא להחלטה. */
  source: "snapshot" | "computed";
};

export async function factsFor(
  db: Db,
  userId: string,
  period: Period
): Promise<FactsResult | null> {
  const stored = await readSnapshot(db, userId, period);
  if (stored) return { facts: stored, source: "snapshot" };

  // << החלון רחב מהחודש בכוונה: חיובים חוזרים אינם נראים בחודש אחד,
  //    וההשוואה צריכה את החודש הקודם.
  const window = monthsBack(period.from, LOOKBACK);
  const [txns, names] = await Promise.all([
    loadRange(db, userId, window[0].from, period.to),
    categoryNames(db, userId),
  ]);

  if (txns.length === 0) return null;

  return { facts: computeMonth(txns, period, { names }), source: "computed" };
}

/** החודש האחרון שיש בו תנועה. לא "החודש הזה" — נתונים היסטוריים. */
export async function latestPeriod(db: Db, userId: string): Promise<Period | null> {
  const last = await db.transaction.findFirst({
    where: { userId },
    orderBy: { bookedAt: "desc" },
    select: { bookedAt: true },
  });
  return last ? monthOf(last.bookedAt) : null;
}

/** כל החודשים שיש בהם תנועות, מהחדש לישן. לניווט. */
export async function availableMonths(db: Db, userId: string): Promise<string[]> {
  const [first, last] = await Promise.all([
    db.transaction.findFirst({
      where: { userId },
      orderBy: { bookedAt: "asc" },
      select: { bookedAt: true },
    }),
    db.transaction.findFirst({
      where: { userId },
      orderBy: { bookedAt: "desc" },
      select: { bookedAt: true },
    }),
  ]);
  if (!first || !last) return [];

  const out: string[] = [];
  let y = first.bookedAt.getUTCFullYear();
  let m = first.bookedAt.getUTCMonth() + 1;
  const endKey = monthOf(last.bookedAt).key;
  for (let guard = 0; guard < 600; guard++) {
    const p = monthPeriod(y, m);
    out.push(p.key);
    if (p.key === endKey) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.reverse();
}

/** "2026-08" → Period. null כשהמחרוזת אינה תקינה. */
export function parseMonthKey(key: string | undefined): Period | null {
  if (!key) return null;
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return monthPeriod(Number(m[1]), month);
}
