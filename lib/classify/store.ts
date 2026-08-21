import type { Db } from "../db/client";
import { categoryIdBySlug } from "../categories/ensure";
import { isKnownSlug, kindOf } from "../categories/tree";
import { SYSTEM_RULES } from "./rules";
import { classify, compileRules, type CompiledRule, type Decision } from "./engine";

/**
 * השכבה שנוגעת במסד. כל מה שמעליה — ההחלטה עצמה — יושב ב-engine.ts והוא טהור.
 * ההפרדה הזו היא אותה הפרדה שעשינו בפרסרים: `parseLeumiLines` לא יודע מה זה PDF.
 */

/**
 * מסנכרן את כללי המערכת לתוך המסד.
 *
 * למה בכלל לשמור כללים במסד אם הם כתובים בקוד: כי המשתמש יראה אותם, יערוך
 * אותם, ויוסיף משלו. אם חלק מהכללים בקוד וחלק במסד, המנוע צריך למזג שני
 * מקורות ולהכריע ביניהם — ואת זה בדיוק אנחנו מנסים להימנע ממנו.
 *
 * שתי הגנות:
 *   • כלל שהמשתמש יצר (isSystem = false) לא נדרס גם אם התבנית זהה.
 *   • slug שלא קיים בעץ נדחה בקול. כלל שמצביע לשומקום הוא באג שקט.
 */
export async function ensureRules(
  db: Db,
  userId: string
): Promise<{ created: number; skipped: string[] }> {
  // שלוש שאילתות בסך הכל. הגרסה הראשונה הריצה findUnique ואז create לכל
  // כלל בנפרד — כמעט 180 סיבובים למסד, ופסק זמן של טרנזקציה (P2028).
  const byId = await categoryIdBySlug(db, userId);

  const existing = await db.categoryRule.findMany({
    where: { userId },
    select: { pattern: true, matchType: true },
  });
  const have = new Set(existing.map((r) => `${r.pattern}|${r.matchType}`));

  const skipped: string[] = [];
  const toCreate: {
    userId: string;
    categoryId: string;
    pattern: string;
    matchType: (typeof SYSTEM_RULES)[number]["matchType"];
    priority: number;
    isSystem: boolean;
    note: string | null;
  }[] = [];

  for (const rule of SYSTEM_RULES) {
    if (!isKnownSlug(rule.slug)) {
      skipped.push(`${rule.pattern} → slug לא קיים: ${rule.slug}`);
      continue;
    }
    const categoryId = byId.get(rule.slug);
    if (!categoryId) {
      skipped.push(`${rule.pattern} → הקטגוריה ${rule.slug} לא נוצרה אצל המשתמש`);
      continue;
    }
    // כלל קיים — של המערכת או של המשתמש — לא נוגעים בו. הכלל של המשתמש
    // גובר, וכלל מערכת שהשתנה בקוד דורש resync מפורש.
    if (have.has(`${rule.pattern}|${rule.matchType}`)) continue;

    toCreate.push({
      userId,
      categoryId,
      pattern: rule.pattern,
      matchType: rule.matchType,
      priority: rule.priority,
      isSystem: true,
      note: rule.note || null,
    });
  }

  if (toCreate.length) {
    await db.categoryRule.createMany({ data: toCreate, skipDuplicates: true });
  }

  return { created: toCreate.length, skipped };
}

/** מוחק את כללי המערכת בלבד, כדי שייבנו מחדש מהקוד. */
export async function resetSystemRules(db: Db, userId: string): Promise<number> {
  const res = await db.categoryRule.deleteMany({ where: { userId, isSystem: true } });
  return res.count;
}

/** טוען את כל הכללים של המשתמש ומהדר אותם פעם אחת. */
export async function loadRules(db: Db, userId: string): Promise<CompiledRule[]> {
  const rows = await db.categoryRule.findMany({
    where: { userId },
    select: {
      id: true,
      pattern: true,
      matchType: true,
      priority: true,
      isSystem: true,
      category: { select: { slug: true } },
    },
  });

  return compileRules(
    rows.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      matchType: r.matchType as CompiledRule["matchType"],
      slug: r.category.slug,
      // כלל של המשתמש חזק מכלל מערכת גם אם מישהו שכח לשנות עדיפות.
      priority: r.isSystem ? r.priority : Math.min(r.priority, 10),
      isSystem: r.isSystem,
    }))
  );
}

export type ClassifyReport = {
  scanned: number;
  classified: number;
  bySource: Record<string, number>;
  bySlug: Record<string, number>;
  /** בתי עסק שאיש לא ידע לסווג, ממוינים לפי סכום. הקלט של שלב 4.4. */
  unresolved: { merchant: string; count: number; total: number }[];
  markedAsTransfer: number;
};

/**
 * מסווג את התנועות של המשתמש.
 *
 * `force = false` (ברירת המחדל) נוגע רק בתנועות בלי קטגוריה. זה מה שרץ
 * אחרי ייבוא. `force = true` מסווג הכל מחדש — למשל אחרי שהוספנו כללים —
 * אבל **אף פעם** לא נוגע בתנועה שסומנה USER.
 */
export async function classifyTransactions(
  db: Db,
  userId: string,
  opts: { force?: boolean; dryRun?: boolean } = {}
): Promise<ClassifyReport> {
  const rules = await loadRules(db, userId);
  const byId = await categoryIdBySlug(db, userId);

  const txns = await db.transaction.findMany({
    where: {
      userId,
      // תיקון ידני הוא סוף פסוק. גם ב-force.
      NOT: { categorySource: "USER" },
      ...(opts.force ? {} : { categoryId: null }),
    },
    select: {
      id: true,
      merchant: true,
      providerCategory: true,
      kind: true,
      amount: true,
    },
  });

  const report: ClassifyReport = {
    scanned: txns.length,
    classified: 0,
    bySource: {},
    bySlug: {},
    unresolved: [],
    markedAsTransfer: 0,
  };

  // מקבצים לפי היעד: עדכון אחד לכל צירוף של קטגוריה ומקור, במקום
  // 169 עדכונים נפרדים.
  const buckets = new Map<string, { categoryId: string; source: string; counts: boolean; ids: string[] }>();
  const unknown = new Map<string, { count: number; total: number }>();

  for (const txn of txns) {
    const decision: Decision | null = classify(
      { merchant: txn.merchant, providerCategory: txn.providerCategory, kind: txn.kind as never },
      rules
    );

    if (!decision) {
      const key = txn.merchant || "(ללא שם)";
      const prev = unknown.get(key) ?? { count: 0, total: 0 };
      unknown.set(key, {
        count: prev.count + 1,
        total: prev.total + Math.abs(Number(txn.amount)),
      });
      continue;
    }

    const categoryId = byId.get(decision.slug);
    if (!categoryId) continue; // הקטגוריה לא קיימת אצל המשתמש — לא ממציאים

    // קטגוריה מסוג TRANSFER לא נספרת כהוצאה. זו נקודת האמת היחידה לכך:
    // במקום שכל דוח יזכור לסנן, הדגל נקבע פעם אחת כאן.
    const counts = kindOf(decision.slug) !== "TRANSFER";

    const key = `${categoryId}|${decision.source}|${counts}`;
    const bucket = buckets.get(key) ?? { categoryId, source: decision.source, counts, ids: [] };
    bucket.ids.push(txn.id);
    buckets.set(key, bucket);

    report.classified++;
    report.bySource[decision.source] = (report.bySource[decision.source] ?? 0) + 1;
    report.bySlug[decision.slug] = (report.bySlug[decision.slug] ?? 0) + 1;
    if (!counts) report.markedAsTransfer++;
  }

  report.unresolved = [...unknown.entries()]
    .map(([merchant, v]) => ({ merchant, ...v }))
    .sort((a, b) => b.total - a.total);

  if (!opts.dryRun) {
    for (const bucket of buckets.values()) {
      await db.transaction.updateMany({
        where: { id: { in: bucket.ids } },
        data: {
          categoryId: bucket.categoryId,
          categorySource: bucket.source as never,
          countsAsSpending: bucket.counts,
        },
      });
    }
  }

  return report;
}
