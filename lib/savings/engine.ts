/**
 * מנוע יעדי החיסכון. פונקציות טהורות בלבד — כמו lib/analytics/spend.ts
 * ו-lib/classify/engine.ts. אין כאן Prisma, אין Next.js.
 *
 * ─── הבדל אחד מהמנוע ההיסטורי: יש כאן שעון ───
 *
 * lib/analytics לעולם לא קורא new Date(), כי הוא מנתח עבר: asOf שלו
 * נגזר מכיסוי הנתונים, לא מהרגע הנוכחי. כאן זה הפוך — targetAt הוא
 * תאריך עתידי אמיתי, ו"כמה זמן נשאר" הוא שאלה על *עכשיו*. אבל המנוע
 * עצמו עדיין לא קורא לשעון: asOf מגיע כפרמטר, בדיוק כמו ב-forecast.ts.
 * הקורא (הדף, הפעולה, הסקריפט) מעביר new Date() פעם אחת, והפונקציה
 * נשארת ניתנת לבדיקה בלי לדמות את הזמן.
 */

import type { Agorot } from "../analytics/money";

export type SavingsGoal = {
  id: string;
  name: string;
  /** באגורות. תמיד לא-שלילי. */
  target: Agorot;
  /** באגורות. תמיד לא-שלילי. */
  saved: Agorot;
  targetAt: Date;
};

export type GoalStatus = {
  /** אחוז התקדמות. יכול לעבור 100 אם נחסך יותר מהיעד. */
  pct: number;
  /** target - saved, לא שלילי (0 כשהיעד הושג או עבר). */
  remaining: Agorot;
  /** חודשים שנותרו עד targetAt, לפחות 1 גם כשהתאריך כבר עבר. */
  monthsLeft: number;
  /** remaining חלקי monthsLeft, מעוגל כלפי מעלה. 0 כשהיעד הושג. */
  requiredMonthly: Agorot;
  /** targetAt עבר והיעד עדיין לא הושג. */
  overdue: boolean;
  achieved: boolean;
};

/** יום קלנדרי ממוצע, לא 30 עגול — כדי ש-monthsLeft לא יקפוץ בין 29 ל-31 יום. */
const AVG_DAYS_PER_MONTH = 30.44;
const DAY_MS = 86_400_000;

export function goalStatus(goal: SavingsGoal, asOf: Date): GoalStatus {
  const achieved = goal.saved >= goal.target;
  const remaining = Math.max(0, goal.target - goal.saved);
  const pct = goal.target > 0 ? (goal.saved / goal.target) * 100 : 0;

  const msLeft = goal.targetAt.getTime() - asOf.getTime();
  const overdue = msLeft <= 0 && !achieved;

  // << גם יעד שעבר תאריכו מקבל לפחות חודש אחד: "צריך X בחודש" אמור
  //    להישאר מספר בר-פעולה, לא Infinity ולא שלילי.
  const monthsLeftRaw = msLeft / DAY_MS / AVG_DAYS_PER_MONTH;
  const monthsLeft = Math.max(1, Math.ceil(monthsLeftRaw));

  const requiredMonthly = achieved ? 0 : Math.ceil(remaining / monthsLeft);

  return { pct, remaining, monthsLeft, requiredMonthly, overdue, achieved };
}

export type Realism = "comfortable" | "tight" | "unrealistic" | "unknown";

/**
 * בדיקת ריאליות. סעיף 8.2.
 *
 * "ריאלי" כאן נשאר צנוע בכוונה: לא תחזית, רק שאלה אחת — האם ההרגל
 * הכספי הקיים (הכנסה פחות הוצאה, בממוצע על החודשים האחרונים שיש בהם
 * נתונים) כבר מכסה את הסכום החודשי הנדרש?
 *
 *   ≤ 50% מהנטו הממוצע   comfortable
 *   ≤ 100%                tight
 *   מעל הנטו הממוצע       unrealistic
 *
 * avgMonthlyNet === null (משתמש חדש, אין עדיין חודש מלא) מחזיר
 * "unknown" ולא "unrealistic" — העדר מידע אינו ראיה לחוסר ריאליות,
 * וזו בדיוק הטעות שהמנוע ההיסטורי כבר נכווה ממנה עם "0 תנועות".
 */
export function assessRealism(
  requiredMonthly: Agorot,
  avgMonthlyNet: Agorot | null
): Realism {
  // << היעד כבר הושג (0 נדרש) הוא comfortable בכל מצב — גם בלי נתוני
  //    הכנסה/הוצאה בכלל. אין כאן שאלה לשאול.
  if (requiredMonthly <= 0) return "comfortable";
  if (avgMonthlyNet === null) return "unknown";
  if (avgMonthlyNet <= 0) return "unrealistic";

  const ratio = requiredMonthly / avgMonthlyNet;
  if (ratio <= 0.5) return "comfortable";
  if (ratio <= 1) return "tight";
  return "unrealistic";
}
