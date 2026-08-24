/**
 * מה שהמודל רואה. חלק מסעיף 7.1.
 *
 * ─── למה יש כאן קובץ בכלל, ולא פשוט שולחים SnapshotFacts כמו שהוא ───
 *
 * ‏SnapshotFacts נבנה מלכתחילה בשביל זה — התיעוד ב-snapshot.ts אומר את
 * זה במפורש: "זה מה שנשלח ל-AI בשלב 7". אבל "נשלח כמו שהוא" זה בדיוק מה
 * שלא עושים, משתי סיבות:
 *
 * **1. אגורות הן טיפוס פנימי.** כל סכום ב-SnapshotFacts הוא מספר שלם
 * שצריך לחלק ב-100 כדי לקבל שקלים. זה תקין לקוד — זו בדיוק הסיבה
 * שהמנוע עובד באגורות — אבל זו דרישה שקטה מהמודל: "זכור לחלק כל מספר
 * שאתה רואה ב-100, בעקביות, על פני מבנה מקונן". מודל שמפספס את זה
 * פעם אחת מתוך עשרות שדות עדיין עונה בביטחון מלא. **גבול שדורש התנהגות
 * נכונה בלי לאכוף אותה יפול בסוף, לא בהתחלה.** ההמרה קורית כאן, פעם
 * אחת, בקוד שיש עליו טסט — כמו שכל המרה אחרת בפרויקט קורית בגבול אחד
 * ולא נשארת בגדר מוסכמה.
 *
 * **2. אזהרת ה-`annualized` חלה כאן במפורש.** ‏`recurring.ts` אומר:
 * שדה זה תקף רק כש-kind הוא "subscription", וכל צרכן עתידי — כולל בוט
 * ה-AI — חייב להתנות עליו. זו בדיוק התקלה שתוקנה ב-`spend.mts` ובדשבורד
 * הזה החודש: הצגת מספר שנתי בטוח לחיוב שלא הוצהר כמנוי. **גבול חדש
 * לאותם נתונים הוא הזדמנות חדשה לאותה טעות** אם לא מעתיקים את התנאי
 * מפורשות. אז הוא מועתק כאן, לא מונח כמובן מאליו.
 */

import { toShekels, type Agorot } from "../analytics/money";
import type { SnapshotFacts } from "../analytics/snapshot";
import type { Basis } from "../analytics/period";

type Shekels = number;

export type AiCategoryFact = {
  slug: string | null;
  name: string;
  total: Shekels;
  count: number;
  share: number;
  children: AiCategoryFact[];
};

export type AiFacts = {
  currency: "ILS";
  basis: Basis;

  period: SnapshotFacts["period"];

  totals: {
    expense: Shekels;
    income: Shekels;
    net: Shekels;
    txnCount: number;
    transfersExcluded: number;
    transfersTotal: Shekels;
  };

  classification: {
    countPct: number;
    amountPct: number;
    unclassifiedAmount: Shekels;
    unclassifiedCount: number;
  };

  categories: AiCategoryFact[];
  income_categories: AiCategoryFact[];

  comparison: {
    previousKey: string;
    previousLabel: string;
    aligned: boolean;
    currentDays: number;
    previousDays: number;
    expenseDelta: Shekels;
    incomeDelta: Shekels;
    movers: { slug: string | null; name: string; delta: Shekels; deltaPct: number | null }[];
  } | null;

  fees: {
    total: Shekels;
    count: number;
    shareOfExpense: number;
    byMerchant: { merchant: string; total: Shekels; count: number }[];
  };

  recurring: {
    merchant: string;
    categorySlug: string | null;
    amount: Shekels;
    cadence: string;
    kind: string;
    confidence: number;
    occurrences: number;
    /**
     * שקלים רק כש-kind הוא "subscription". אחרת null, לא ניחוש.
     * ראה האזהרה ב-recurring.ts וב-present.ts למעלה — זו לא בחירת
     * עיצוב מקומית אלא העתקה מכוונת של כלל שכבר עלה פעם אחת.
     */
    annualized: Shekels | null;
    nextDueAt: string;
    stopped: boolean | null;
  }[];

  forecast: {
    period: string;
    basis: Basis;
    daysCovered: number;
    daysInPeriod: number;
    daysRemaining: number;
    spent: Shekels;
    upcoming: {
      merchant: string;
      amount: Shekels;
      dueAt: string;
      declared: boolean;
      confidence: number;
    }[];
    upcomingTotal: Shekels;
    variableSoFar: Shekels;
    variablePerDay: Shekels;
    floor: Shekels;
    expected: Shekels;
    ceiling: Shekels;
    confidence: "low" | "medium" | "high";
    assumptions: string[];
  } | null;
};

function sh(a: Agorot): Shekels {
  return toShekels(a);
}

function toAiCategory(c: SnapshotFacts["categories"][number]): AiCategoryFact {
  return {
    slug: c.slug,
    name: c.name,
    total: sh(c.total),
    count: c.count,
    share: c.share,
    children: c.children.map(toAiCategory),
  };
}

/**
 * ‏SnapshotFacts → מה שעובר במודל בפועל. פונקציה טהורה.
 *
 * << לא משמיטה שום שדה במכוון: מודל שרואה פחות ממה שהמסך רואה עלול
 *    לענות תשובה שסותרת את מה שהמשתמש רואה מולו באותו רגע. השינוי
 *    היחיד הוא היחידה — אגורות בפנים, שקלים בגבול.
 */
export function factsForAi(f: SnapshotFacts): AiFacts {
  return {
    currency: f.currency,
    basis: f.basis,
    period: f.period,

    totals: {
      expense: sh(f.totals.expense),
      income: sh(f.totals.income),
      net: sh(f.totals.net),
      txnCount: f.totals.txnCount,
      transfersExcluded: f.totals.transfersExcluded,
      transfersTotal: sh(f.totals.transfersTotal),
    },

    classification: {
      countPct: f.classification.countPct,
      amountPct: f.classification.amountPct,
      unclassifiedAmount: sh(f.classification.unclassifiedAmount),
      unclassifiedCount: f.classification.unclassifiedCount,
    },

    categories: f.categories.map(toAiCategory),
    income_categories: f.income_categories.map(toAiCategory),

    comparison: f.comparison
      ? {
          previousKey: f.comparison.previousKey,
          previousLabel: f.comparison.previousLabel,
          aligned: f.comparison.aligned,
          currentDays: f.comparison.currentDays,
          previousDays: f.comparison.previousDays,
          expenseDelta: sh(f.comparison.expenseDelta),
          incomeDelta: sh(f.comparison.incomeDelta),
          movers: f.comparison.movers.map((m) => ({
            slug: m.slug,
            name: m.name,
            delta: sh(m.delta),
            deltaPct: m.deltaPct,
          })),
        }
      : null,

    fees: {
      total: sh(f.fees.total),
      count: f.fees.count,
      shareOfExpense: f.fees.shareOfExpense,
      byMerchant: f.fees.byMerchant.map((m) => ({
        merchant: m.merchant,
        total: sh(m.total),
        count: m.count,
      })),
    },

    recurring: f.recurring.map((r) => ({
      merchant: r.merchant,
      categorySlug: r.categorySlug,
      amount: sh(r.amount),
      cadence: r.cadence,
      kind: r.kind,
      confidence: r.confidence,
      occurrences: r.occurrences,
      // << התנאי הזה הוא כל הפואנטה של הקובץ. בלעדיו זה בדיוק הבאג
      //    שתוקן ב-spend.mts, רק בגבול חדש.
      annualized: r.kind === "subscription" ? sh(r.annualized) : null,
      nextDueAt: r.nextDueAt,
      stopped: r.stopped,
    })),

    forecast: f.forecast
      ? {
          period: f.forecast.period,
          basis: f.forecast.basis,
          daysCovered: f.forecast.daysCovered,
          daysInPeriod: f.forecast.daysInPeriod,
          daysRemaining: f.forecast.daysRemaining,
          spent: sh(f.forecast.spent),
          upcoming: f.forecast.upcoming.map((u) => ({
            merchant: u.merchant,
            amount: sh(u.amount),
            dueAt: u.dueAt,
            declared: u.declared,
            confidence: u.confidence,
          })),
          upcomingTotal: sh(f.forecast.upcomingTotal),
          variableSoFar: sh(f.forecast.variableSoFar),
          variablePerDay: sh(f.forecast.variablePerDay),
          floor: sh(f.forecast.floor),
          expected: sh(f.forecast.expected),
          ceiling: sh(f.forecast.ceiling),
          confidence: f.forecast.confidence,
          assumptions: f.forecast.assumptions,
        }
      : null,
  };
}
