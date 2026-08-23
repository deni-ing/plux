/**
 * טעינת תנועות למסך העיון.
 *
 * << מקביל ל-`scripts/txns.mts`, ובכוונה אינו משתמש בו: הסקריפט מדפיס
 *    לטרמינל והמסך מרנדר. מה שמשותף הוא השאילתה, וכאן היא נכתבת פעם
 *    אחת ומוחזרת כנתון.
 *
 * הכול קריאה. השינוי עובר ב-`setUserCategory` ולא כאן.
 */

import type { Db } from "../db/client";
import { toAgorot, type Agorot } from "../analytics/money";
import { monthPeriod, type Period } from "../analytics/period";

export type BrowseRow = {
  id: string;
  bookedAt: string;
  amount: Agorot;
  merchant: string;
  categorySlug: string | null;
  categoryName: string | null;
  source: string;
  countsAsSpending: boolean;
  kind: string;
  account: string;
};

export type BrowseFilter = {
  month?: string;
  slug?: string;
  q?: string;
  /** רק תנועות בלי קטגוריה. */
  unclassified?: boolean;
  limit?: number;
};

/**
 * בתי עסק שאין להם קטגוריה, לפי סכום.
 *
 * << ממוין לפי סכום ולא לפי כמות — אותה החלטה כמו ב-`pendingDecisions`.
 *    תנועה אחת של ‎₪1,008 חשובה יותר מארבעים של ‎₪12, וזה בדיוק מה
 *    שקרה באוגוסט: 4% מהתנועות היו 31% מהכסף.
 */
export async function pendingByMerchant(
  db: Db,
  userId: string,
  limit = 20
): Promise<{ merchant: string; count: number; total: Agorot }[]> {
  const rows = await db.transaction.findMany({
    where: { userId, categoryId: null },
    select: { merchant: true, amount: true },
  });

  const agg = new Map<string, { count: number; total: Agorot }>();
  for (const r of rows) {
    const key = r.merchant || "(ללא שם)";
    const cur = agg.get(key) ?? { count: 0, total: 0 };
    cur.count += 1;
    cur.total += -toAgorot(r.amount);
    agg.set(key, cur);
  }

  return [...agg]
    .map(([merchant, s]) => ({ merchant, ...s }))
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);
}

export async function browse(
  db: Db,
  userId: string,
  filter: BrowseFilter = {}
): Promise<BrowseRow[]> {
  const where: Record<string, unknown> = { userId };

  if (filter.unclassified) where.categoryId = null;
  if (filter.slug) where.category = { slug: filter.slug };
  if (filter.q) where.merchant = { contains: filter.q };

  if (filter.month) {
    const m = /^(\d{4})-(\d{2})$/.exec(filter.month);
    if (m) {
      const p: Period = monthPeriod(Number(m[1]), Number(m[2]));
      where.bookedAt = { gte: p.from, lt: p.to };
    }
  }

  const rows = await db.transaction.findMany({
    where,
    orderBy: [{ bookedAt: "desc" }],
    take: filter.limit ?? 100,
    select: {
      id: true,
      bookedAt: true,
      amount: true,
      merchant: true,
      kind: true,
      categorySource: true,
      countsAsSpending: true,
      category: { select: { slug: true, name: true } },
      account: { select: { label: true } },
    },
  });

  return rows.map((r) => ({
    id: r.id,
    bookedAt: r.bookedAt.toISOString().slice(0, 10),
    amount: toAgorot(r.amount),
    merchant: r.merchant,
    categorySlug: r.category?.slug ?? null,
    categoryName: r.category?.name ?? null,
    source: r.categorySource,
    countsAsSpending: r.countsAsSpending,
    kind: r.kind,
    account: r.account.label,
  }));
}
