/**
 * חישוב ושמירה של סנפשוטים. השכבה שנוגעת במסד.
 *
 * ─── מתי זה רץ ───
 *
 * אחרי כל ייבוא, מחוץ לטרנזקציה של הייבוא. אותו יחס בדיוק שקבענו
 * לסיווג: **הסנפשוט הוא תוצר של הייבוא, לא תנאי להצלחתו.** ייבוא
 * שהצליח והסנפשוט נכשל הוא ייבוא מוצלח עם אזהרה, ולא ייבוא כושל —
 * הנתונים במסד, והחישוב תמיד ניתן להרצה מחדש.
 *
 * ─── כמה חודשים ───
 *
 * ייבוא של דף MAX אחד נוגע בכל החודשים שיש בו תנועות, ולא רק בחודש
 * שעל הכריכה: בדף של 08/2026 יש קניות מיולי. לכן החודשים לחישוב
 * **נגזרים מהנתונים** — הטווח שבין התנועה הראשונה לאחרונה — ולא מפרמטר
 * שמישהו צריך לזכור להעביר. פרמטר כזה יהיה נכון עד הפעם הראשונה שהוא
 * לא, ואז יישאר סנפשוט ישן בשקט.
 */

import type { Db } from "../db/client";
import { feeReport } from "./fees";
import { categoryNames, loadRange } from "./load";
import {
  firstDays,
  monthOf,
  monthPeriod,
  previousMonth,
  DEFAULT_BASIS,
  type Basis,
  type Period,
} from "./period";
import { findRecurring } from "./recurring";
import { forecastMonth } from "./forecast";
import { buildSnapshot, isCurrent, type SnapshotFacts } from "./snapshot";
import { breakdownByCategory, compareBreakdowns } from "./spend";

export type RecomputeOptions = {
  basis?: Basis;
  /** לחשב גם תקופות שיש להן כבר סנפשוט בגרסה הנוכחית. */
  force?: boolean;
  /** לחשב לכל היותר N חודשים אחרונים. */
  limit?: number;
};

export type RecomputeReport = {
  months: string[];
  written: string[];
  skipped: string[];
};

/** הטווח שבו יש למשתמש תנועות בפועל. */
async function dataRange(db: Db, userId: string): Promise<{ first: Date; last: Date } | null> {
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
  if (!first || !last) return null;
  return { first: first.bookedAt, last: last.bookedAt };
}

function monthsBetween(first: Date, last: Date): Period[] {
  const out: Period[] = [];
  const start = monthOf(first);
  const end = monthOf(last);
  let y = start.from.getUTCFullYear();
  let m = start.from.getUTCMonth() + 1;
  for (let guard = 0; guard < 600; guard++) {
    const p = monthPeriod(y, m);
    out.push(p);
    if (p.key === end.key) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * מחשב סנפשוט לחודש אחד.
 *
 * מקבל את התנועות מבחוץ — הקורא טוען פעם אחת את כל הטווח ומריץ את זה
 * לכל חודש. שאילתה לחודש היא 12 נסיעות לאירלנד במקום אחת, וזה בדיוק
 * הלקח מ-P2028.
 */
export function computeMonth(
  txns: Parameters<typeof breakdownByCategory>[0],
  period: Period,
  options: { basis?: Basis; names?: ReadonlyMap<string, string> } = {}
): SnapshotFacts {
  const basis = options.basis ?? DEFAULT_BASIS;
  const names = options.names;

  const current = breakdownByCategory(txns, period, { basis, names });

  const prevFull = previousMonth(period);
  const prev = current.coverage.partial
    ? firstDays(prevFull, current.coverage.daysCovered)
    : prevFull;
  const previous = breakdownByCategory(txns, prev, { basis, names });

  // << החיובים החוזרים מחושבים על כל הטווח שנטען, לא על החודש: דפוס
  //    חוזר אינו נראה בחודש אחד מעצם הגדרתו.
  const recurring = findRecurring(txns, {
    basis,
    asOf: current.coverage.lastDataAt ?? period.to,
  });

  return buildSnapshot({
    breakdown: current,
    comparison: compareBreakdowns(current, previous),
    fees: feeReport(txns, period, { basis, breakdown: current }),
    recurring,
    forecast: forecastMonth(txns, current, recurring, { basis }),
  });
}

/**
 * מחשב ושומר סנפשוטים לכל החודשים שיש בהם נתונים.
 *
 * `upsert` ולא `create` — הרצה חוזרת מעדכנת ולא מכפילה, והאילוץ
 * `@@unique([userId, periodStart, periodEnd])` מגבה את זה במסד.
 */
export async function recomputeSnapshots(
  db: Db,
  userId: string,
  options: RecomputeOptions = {}
): Promise<RecomputeReport> {
  const basis = options.basis ?? DEFAULT_BASIS;

  const range = await dataRange(db, userId);
  if (!range) return { months: [], written: [], skipped: [] };

  let months = monthsBetween(range.first, range.last);
  if (options.limit && months.length > options.limit) {
    months = months.slice(-options.limit);
  }

  // << טעינה אחת. החלון מתחיל חודש לפני הראשון כדי שההשוואה לחודש
  //    הקודם תהיה אמיתית ולא ריקה מלאכותית.
  const from = previousMonth(months[0]).from;
  const to = months[months.length - 1].to;
  const [txns, names] = await Promise.all([
    loadRange(db, userId, from, to),
    categoryNames(db, userId),
  ]);

  const existing = await db.analyticsSnapshot.findMany({
    where: { userId },
    select: { periodStart: true, facts: true },
  });
  const currentByStart = new Map(
    existing.map((s) => [s.periodStart.getTime(), isCurrent(s.facts)])
  );

  const written: string[] = [];
  const skipped: string[] = [];

  for (const period of months) {
    if (!options.force && currentByStart.get(period.from.getTime()) === true) {
      skipped.push(period.key);
      continue;
    }

    const facts = computeMonth(txns, period, { basis, names });

    await db.analyticsSnapshot.upsert({
      where: {
        userId_periodStart_periodEnd: {
          userId,
          periodStart: period.from,
          periodEnd: period.to,
        },
      },
      create: {
        userId,
        periodStart: period.from,
        periodEnd: period.to,
        facts,
      },
      update: { facts, computedAt: new Date() },
    });

    written.push(period.key);
  }

  return { months: months.map((m) => m.key), written, skipped };
}

/** קורא סנפשוט שמור. מחזיר null גם כשהוא בגרסה ישנה. */
export async function readSnapshot(
  db: Db,
  userId: string,
  period: Period
): Promise<SnapshotFacts | null> {
  const row = await db.analyticsSnapshot.findUnique({
    where: {
      userId_periodStart_periodEnd: {
        userId,
        periodStart: period.from,
        periodEnd: period.to,
      },
    },
    select: { facts: true },
  });
  if (!row || !isCurrent(row.facts)) return null;
  return row.facts as unknown as SnapshotFacts;
}
