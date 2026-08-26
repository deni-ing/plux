/**
 * מנוע היתרה. פונקציות טהורות בלבד — כמו lib/budget/engine.ts.
 *
 * לא כל דבר כאן חדש: `Account.balance`/`balanceAt` כבר נשמרים בכל
 * ייבוא לאומי (lib/import/ingest.ts, latestBalance) — פשוט אף מסך לא
 * הציג אותם עד עכשיו. השכבה הזו לא ממציאה נתון, היא מנסחת נקודות
 * גולמיות (balanceAfter לאורך זמן) לצורה שמסך צריך: יתרה נוכחית, דלתא
 * מול נקודה קודמת, ורצף לגרף קטן.
 */

import type { Agorot } from "../analytics/money";

export type BalancePoint = { at: Date; balance: Agorot };

/** << תנועה שכבר הגיע תאריך החיוב הפרטני שלה — ראו summarizeBalance. */
export type MaturedCharge = { amount: Agorot };

export type BalanceSummary = {
  current: Agorot;
  asOf: Date;
  /** null כשאין נקודת השוואה ישנה מספיק. */
  deltaVsPrior: Agorot | null;
  /** עד 20 נקודות, ממוינות מהישן לחדש, לגרף קטן. */
  sparkline: BalancePoint[];
  /**
   * << מ-26.08. `current` הוא עובדה — היתרה שדף החשבון האחרון הצהיר
   *    עליה, ולא נוגעים בה. `projected` היא תחזית: `current` בתוספת
   *    חיובים פרטניים (individualChargeDate) שתאריך החיוב שלהם כבר
   *    עבר אבל טרם הגיע דף חשבון חדש שמשקף אותם. כשאין כאלה, השניים
   *    זהים.
   */
  projected: Agorot;
  maturedCharges: { count: number; total: Agorot };
};

/**
 * בונה את התקציר מנקודות גולמיות.
 *
 * `points` הוא כל היסטוריית ה-balanceAfter הידועה לחשבון, ממוינת
 * מהישן לחדש — כולל הנקודה העדכנית ביותר. `priorCutoff` הוא הגבול
 * ל"מול החודש שעבר": הנקודה האחרונה *לפני* הגבול הזה היא נקודת
 * ההשוואה. אם אין כזו — אין דלתא, לא מומצא אפס.
 */
export function summarizeBalance(
  current: Agorot,
  asOf: Date,
  points: readonly BalancePoint[],
  priorCutoff: Date,
  /** << ברירת מחדל ריקה: קוד קיים (וטסטים קיימים) שלא מעביר את
   *    הארגומנט הזה ממשיך לעבוד בדיוק כמו לפני 26.08 — projected=current. */
  maturedCharges: readonly MaturedCharge[] = []
): BalanceSummary {
  let prior: BalancePoint | null = null;
  for (const p of points) {
    if (p.at.getTime() >= priorCutoff.getTime()) break;
    prior = p;
  }

  const spark = points.slice(-20);

  // << amount חתום כמו בכל מקום אחר במערכת: שלילי = כסף יוצא. סכימה
  //    ישירה ל-current מקטינה אותו נכון, בלי היפוך סימן ידני.
  const maturedTotal = maturedCharges.reduce((s, mc) => s + mc.amount, 0);

  return {
    current,
    asOf,
    deltaVsPrior: prior ? current - prior.balance : null,
    sparkline: spark,
    projected: current + maturedTotal,
    maturedCharges: { count: maturedCharges.length, total: maturedTotal },
  };
}

/** << ראו upcomingCharges ב-lib/accounts/store.ts — זה הסוג שהיא מחזירה. */
export type UpcomingCharge = {
  id: string;
  merchant: string;
  /** באגורות, חתום — שלילי = כסף יוצא, כמו בכל מקום אחר. */
  amount: Agorot;
  bookedAt: Date;
  /** null = MAX עדיין לא פרסמה תאריך חיוב לעסקה הזו. */
  chargedAt: Date | null;
  /** true = תאריך החיוב כבר עבר (ונכלל ב-bankBalance כ-matured). */
  paid: boolean;
};

/**
 * מיון "מה יורד קודם, מה אחרי" — בקשה מפורשת של המשתמש (26.08). לא לפי
 * bookedAt (מתי נרשמה העסקה) אלא לפי chargedAt (מתי בפועל יורד/ירד
 * הכסף), כי זו השאלה שהכרטיס הזה בא לענות עליה.
 *
 * שלוש קבוצות, בסדר הזה:
 *   1. לא שולם, עם chargedAt ידוע — מהקרוב לרחוק. זו ה"פעולה" של הכרטיס.
 *   2. לא שולם, בלי chargedAt (MAX עוד לא פרסמה) — אי אפשר למקם על ציר
 *      זמן, אז בסוף קבוצת הלא-שולם, ממוין לפי bookedAt (החדש קודם).
 *   3. שולם — היסטוריה לצפייה ולא פעולה שמחכה למשתמש, מהאחרון לראשון.
 *
 * פונקציה טהורה בכוונה, נפרדת מ-upcomingCharges (שמביאה מהמסד): כך
 * אפשר לבדוק את המיון בלי מסד, בדיוק כמו summarizeBalance למעלה.
 */
export function sortUpcomingCharges(charges: readonly UpcomingCharge[]): UpcomingCharge[] {
  const unpaid = charges
    .filter((c) => !c.paid)
    .slice()
    .sort((a, b) => {
      if (a.chargedAt && b.chargedAt) return a.chargedAt.getTime() - b.chargedAt.getTime();
      if (a.chargedAt) return -1;
      if (b.chargedAt) return 1;
      return b.bookedAt.getTime() - a.bookedAt.getTime();
    });

  const paid = charges
    .filter((c) => c.paid)
    .slice()
    .sort((a, b) => b.chargedAt!.getTime() - a.chargedAt!.getTime());

  return [...unpaid, ...paid];
}
