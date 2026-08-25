/**
 * מנוע ההמלצות. פונקציות טהורות בלבד — כמו lib/budget/engine.ts
 * ו-lib/savings/engine.ts. אין כאן Prisma, אין Next.js, ואין שעון.
 *
 * ─── לא מקור מידע רביעי ───
 *
 * שלושת האותות כאן נגזרים משלושה מנועים שכבר קיימים ונבדקו: זיהוי
 * חוזרים (lib/analytics/recurring.ts — סטטיסטיקה בלבד, מיובאת ולא
 * משוכפלת), תקציב (lib/budget/engine.ts), ומאזן חודשי (avgMonthlyNet
 * הקיים ב-lib/savings/store.ts). זו לא שכבת חישוב נוספת אלא ניסוח.
 *
 * ─── למה אין כאן "בטל את המנוי הלא בשימוש" ───
 *
 * ראו lib/analytics/recurring.ts, worthReviewing(): אין מקור נתונים
 * לשימוש בפועל בדף חשבון, ולכן אי אפשר לדעת מה "לא בשימוש" — רק מה
 * חוזר וכמה זה עולה. סעיף 5.4 הישן. אותה החלטה חלה כאן: לא ממציאים
 * ודאות שאין לנו.
 */

import type { Agorot } from "../analytics/money";
import { formatILS } from "../analytics/money";
import { budgetStatus } from "../budget/engine";
import { cadenceOf, median, regularity, stability } from "../analytics/recurring";
import type { TxnKind } from "../classify/engine";

const DAY_MS = 86_400_000;
const MIN_OCCURRENCES = 3;
const MIN_CONFIDENCE = 0.9;

export type RecommendationTone = "confirmed" | "action" | "tip";

export type Recommendation = {
  id: string;
  title: string;
  subtitle: string;
  /** באגורות, חיובי. null = אין סכום מספרי — טיפ בלי חישוב. */
  amount: Agorot | null;
  tone: RecommendationTone;
};

/** מה שהמנוע צריך מכל תנועה. תת-קבוצה של AnalyticsTxn — לא מגדיר טיפוס משלו. */
export type RecommendationTxn = {
  bookedAt: Date;
  amount: Agorot;
  merchant: string;
  kind?: TxnKind | null;
};

export type SavingsTransferSignal = {
  merchant: string;
  amount: Agorot;
  dayOfMonth: number;
  occurrences: number;
};

/**
 * הוראת קבע חוזרת לחיסכון. מדיר בכוונה כל דבר שאינו TRANSFER_OUT
 * חודשי-קבוע-עם-ביטחון-גבוה — סף 90% ולא 50% כמו findRecurring,
 * כי כאן זו הצהרה חיובית ("זה קורה") ולא רשימת מועמדים לבדיקה.
 */
export function detectSavingsTransfer(
  txns: readonly RecommendationTxn[]
): SavingsTransferSignal | null {
  const groups = new Map<string, RecommendationTxn[]>();
  for (const t of txns) {
    if (t.kind !== "TRANSFER_OUT") continue;
    const list = groups.get(t.merchant);
    if (list) list.push(t);
    else groups.set(t.merchant, [t]);
  }

  let best: SavingsTransferSignal | null = null;
  let bestConfidence = 0;

  for (const [merchant, list] of groups) {
    if (list.length < MIN_OCCURRENCES) continue;

    const dated = [...list].sort((a, b) => a.bookedAt.getTime() - b.bookedAt.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < dated.length; i++) {
      gaps.push(Math.round((dated[i].bookedAt.getTime() - dated[i - 1].bookedAt.getTime()) / DAY_MS));
    }
    const realGaps = gaps.filter((g) => g > 0);
    if (realGaps.length === 0) continue;

    const intervalDays = median([...realGaps].sort((a, b) => a - b));
    if (cadenceOf(intervalDays) !== "monthly") continue;

    const amounts = dated.map((d) => Math.abs(d.amount)).sort((a, b) => a - b);
    const amount = median(amounts);

    const confidence =
      Math.round(
        Math.min(
          1,
          0.5 * regularity(realGaps) +
            0.3 * stability(amounts) +
            0.2 * Math.min(1, (dated.length - 2) / 3)
        ) * 100
      ) / 100;

    if (confidence < MIN_CONFIDENCE) continue;
    if (confidence < bestConfidence) continue;

    bestConfidence = confidence;
    best = {
      merchant,
      amount,
      dayOfMonth: dated[dated.length - 1].bookedAt.getDate(),
      occurrences: dated.length,
    };
  }

  return best;
}

export type BudgetStreak = {
  categorySlug: string;
  categoryName: string;
  monthsOver: number;
  latestSpent: Agorot;
  cap: Agorot;
};

/**
 * קטגוריות שחרגו מהתקציב בכל אחד מהחודשים שסופקו, ברצף (החודש
 * העדכני נכלל). `monthlySpend` מהישן לחדש; `caps` רק קטגוריות עם
 * תקציב מוגדר — קטגוריה בלי תקציב לא יכולה "לחרוג".
 */
export function budgetOverStreak(
  monthlySpend: readonly ReadonlyMap<string, Agorot>[],
  caps: ReadonlyMap<string, { cap: Agorot; name: string }>
): BudgetStreak[] {
  if (monthlySpend.length === 0) return [];
  const latest = monthlySpend[monthlySpend.length - 1];

  const out: BudgetStreak[] = [];
  for (const [slug, { cap, name }] of caps) {
    const allOver = monthlySpend.every((m) => budgetStatus(m.get(slug) ?? 0, cap) === "over");
    if (!allOver) continue;
    out.push({
      categorySlug: slug,
      categoryName: name,
      monthsOver: monthlySpend.length,
      latestSpent: latest.get(slug) ?? 0,
      cap,
    });
  }
  return out.sort((a, b) => b.latestSpent - a.latestSpent);
}

/**
 * "כסף עומד ללא ריבית" — לא תובנה מחושבת, טיפ חינוכי גנרי שמופעל
 * לפי סף גס: יתרה ששווה ליותר מכפול ההוצאה החודשית הממוצעת. בכוונה
 * לא ייעוץ ("שווה להשוות אפשרויות", לא "תעביר ל-X") — Plux אינו יועץ
 * השקעות, בדיוק כמו האזהרה הקבועה ב-/savings.
 */
const IDLE_CASH_MONTHS = 2;

export function idleCashWorthChecking(
  bankBalance: Agorot | null,
  avgMonthlyExpense: Agorot | null
): boolean {
  if (bankBalance === null || avgMonthlyExpense === null || avgMonthlyExpense <= 0) return false;
  return bankBalance > avgMonthlyExpense * IDLE_CASH_MONTHS;
}

/** מרכיב את שלושת האותות לרשימת המלצות מנוסחת, בדיוק בסדר הזה. */
export function buildRecommendations(input: {
  savingsTransfer: SavingsTransferSignal | null;
  budgetStreaks: readonly BudgetStreak[];
  idleCash: { balance: Agorot; avgMonthlyExpense: Agorot } | null;
}): Recommendation[] {
  const out: Recommendation[] = [];

  if (input.savingsTransfer) {
    const s = input.savingsTransfer;
    out.push({
      id: "savings-transfer",
      title: `הוראת קבע לחיסכון — ${formatILS(s.amount)} ב-${s.dayOfMonth} לחודש`,
      subtitle: `זוהתה כהעברה חוזרת וקבועה. פעילה ${s.occurrences} חודשים.`,
      amount: s.amount,
      tone: "confirmed",
    });
  }

  for (const b of input.budgetStreaks.slice(0, 2)) {
    out.push({
      id: `budget-${b.categorySlug}`,
      title: `לתקן את תקציב "${b.categoryName}" ל-${formatILS(b.cap)}`,
      subtitle: `חרגת ${b.monthsOver} חודשים ברצף. ${formatILS(b.latestSpent)} החודש מתוך התקרה שהוגדרה.`,
      amount: Math.max(0, b.latestSpent - b.cap),
      tone: "action",
    });
  }

  if (input.idleCash) {
    out.push({
      id: "idle-cash",
      title: "לבדוק העברת חיסכון למסלול נושא תשואה",
      subtitle: `${formatILS(input.idleCash.balance)} יושבים בחשבון עו״ש ללא ריבית. שווה להשוות אפשרויות.`,
      amount: null,
      tone: "tip",
    });
  }

  return out;
}
