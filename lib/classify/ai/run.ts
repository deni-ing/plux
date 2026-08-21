import type { Db } from "../../db/client";
import { categoryIdBySlug } from "../../categories/ensure";
import { CATEGORY_TREE, kindOf } from "../../categories/tree";
import { normalizeForMatch } from "../engine";
import { getClassifier } from "./index";
import type { CategoryClassifier } from "./types";

/**
 * הרצת שכבת ה-AI על מה שהכללים לא תפסו.
 *
 * הסדר בצינור: כללים → סוג תנועה → קטגוריית ספק → **כאן** → המשתמש.
 * כלומר המודל רואה רק מקרים שבהם שם בית העסק הוא כל מה שקיים.
 */

/**
 * תיאורים שלא נשלחים למודל בכלל.
 *
 * << זו לא רשימת חסימה מטעמי בטיחות אלא חיסכון כן: אלה שורות שאין בהן
 *    זהות של בית עסק. "הוראת קבע" הוא מה שלאומי כותבת כשאין לה שם מוטב,
 *    ו"פיימנט פתרונ" היא חברת סליקה — הכסף הלך לחנות כלשהי דרכה, והשם
 *    שלה לא מופיע בשום מקום בשורה.
 *
 *    לשלוח אותן למודל זה לשלם כדי לקבל ניחוש. הן שייכות למסך ההכרעה של
 *    המשתמש, לא למודל.
 */
export const UNINFERABLE: string[] = ["הוראת קבע", "פיימנט פתרונ"];

function isUninferable(merchant: string): boolean {
  const m = normalizeForMatch(merchant);
  return UNINFERABLE.some((p) => m.includes(normalizeForMatch(p)));
}

/**
 * ה-slugs שמותר למודל לבחור מהם: תת-קטגוריות בלבד.
 *
 * << למה לא גם קטגוריות-על: כי "מזון" היא תשובה שתמיד נכונה ולכן חסרת
 *    ערך. כשהרשימה מכילה רק עלים, המודל חייב להתחייב ל"סופר" או
 *    ל"מסעדות" — ואם הוא לא יכול, נשאר לו null, וזה בדיוק מה שרצינו.
 */
export function allowedSlugsForAi(): string[] {
  const out: string[] = [];
  for (const group of CATEGORY_TREE) {
    for (const cat of group.categories) {
      for (const child of cat.children ?? []) out.push(child.slug);
    }
  }
  return out;
}

export type AiReport = {
  classifier: string;
  candidates: number;
  skippedUninferable: number;
  answered: number;
  accepted: number;
  rejectedLowConfidence: number;
  rowsUpdated: number;
  decisions: { merchant: string; slug: string | null; confidence: number; reason?: string }[];
};

export async function classifyWithAi(
  db: Db,
  userId: string,
  opts: {
    minConfidence?: number;
    dryRun?: boolean;
    /** להזרקת מסווג בבדיקות. בייצור נבחר לפי משתנה הסביבה. */
    classifier?: CategoryClassifier;
  } = {}
): Promise<AiReport> {
  const minConfidence = opts.minConfidence ?? 0.75;
  const classifier = opts.classifier ?? getClassifier();

  const rows = await db.transaction.findMany({
    where: { userId, categoryId: null, NOT: { categorySource: "USER" } },
    select: { id: true, merchant: true },
  });

  // מסווגים בתי עסק ייחודיים ולא תנועות. 392 תנועות הן 49 שמות.
  const idsByMerchant = new Map<string, string[]>();
  for (const r of rows) {
    const key = r.merchant || "";
    if (!key) continue;
    const list = idsByMerchant.get(key);
    if (list) list.push(r.id);
    else idsByMerchant.set(key, [r.id]);
  }

  const all = [...idsByMerchant.keys()];
  const skipped = all.filter(isUninferable);
  const candidates = all.filter((m) => !isUninferable(m));

  const report: AiReport = {
    classifier: classifier.name,
    candidates: candidates.length,
    skippedUninferable: skipped.length,
    answered: 0,
    accepted: 0,
    rejectedLowConfidence: 0,
    rowsUpdated: 0,
    decisions: [],
  };

  if (!candidates.length) return report;

  const allowed = allowedSlugsForAi();
  const verdicts = await classifier.classify(candidates, allowed);
  report.answered = verdicts.length;
  report.decisions = verdicts;

  const byId = await categoryIdBySlug(db, userId);
  const buckets = new Map<string, { categoryId: string; counts: boolean; ids: string[] }>();

  for (const v of verdicts) {
    if (!v.slug) continue;
    if (v.confidence < minConfidence) {
      report.rejectedLowConfidence++;
      continue;
    }
    const categoryId = byId.get(v.slug);
    if (!categoryId) continue;

    const ids = idsByMerchant.get(v.merchant);
    if (!ids?.length) continue;

    const counts = kindOf(v.slug) !== "TRANSFER";
    const key = `${categoryId}|${counts}`;
    const bucket = buckets.get(key) ?? { categoryId, counts, ids: [] };
    bucket.ids.push(...ids);
    buckets.set(key, bucket);

    report.accepted++;
    report.rowsUpdated += ids.length;
  }

  if (!opts.dryRun) {
    for (const b of buckets.values()) {
      await db.transaction.updateMany({
        where: { id: { in: b.ids } },
        // << categorySource = AI ולא RULE. ההבחנה הזו היא מה שיאפשר בהמשך
        //    לשאול "כמה מההוצאות שלי סווגו בניחוש" ולהציג את זה למשתמש.
        data: { categoryId: b.categoryId, categorySource: "AI", countsAsSpending: b.counts },
      });
    }
  }

  return report;
}
