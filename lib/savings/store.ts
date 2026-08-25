/**
 * שכבת המסד ליעדי חיסכון. הקובץ היחיד כאן שיודע על Prisma — בדיוק כמו
 * lib/classify/store.ts מול lib/classify/engine.ts.
 */

import type { Db } from "../db/client";
import { fromAgorot, toAgorot, type Agorot } from "../analytics/money";
import { availableMonths, factsFor, parseMonthKey } from "../analytics/facts";
import type { SavingsGoal } from "./engine";

export async function listGoals(db: Db, userId: string): Promise<SavingsGoal[]> {
  const rows = await db.savingsGoal.findMany({
    where: { userId },
    orderBy: { targetAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    target: toAgorot(r.target),
    saved: toAgorot(r.saved),
    targetAt: r.targetAt,
  }));
}

export async function createGoal(
  db: Db,
  userId: string,
  input: { name: string; target: Agorot; targetAt: Date }
): Promise<void> {
  await db.savingsGoal.create({
    data: {
      userId,
      name: input.name,
      target: fromAgorot(input.target),
      targetAt: input.targetAt,
    },
  });
}

/**
 * הפקדה ליעד. תמיד תוספת, לא דריסה — בדיוק כמו שתיקון סיווג לא כותב
 * "המצב החדש" אלא יוצר כלל. `saved` נקרא ונכתב מחדש בתוך אותה קריאה,
 * לא increment של Prisma על Decimal: כך ההמרה עוברת תמיד באגורות,
 * באותה נקודה אחת שגם קוראת וגם כותבת.
 */
export async function contribute(
  db: Db,
  userId: string,
  goalId: string,
  amount: Agorot
): Promise<void> {
  const row = await db.savingsGoal.findFirst({ where: { id: goalId, userId } });
  if (!row) return;

  const nextSaved = toAgorot(row.saved) + amount;
  await db.savingsGoal.update({
    where: { id: goalId },
    data: { saved: fromAgorot(nextSaved) },
  });
}

export async function deleteGoal(db: Db, userId: string, goalId: string): Promise<void> {
  await db.savingsGoal.deleteMany({ where: { id: goalId, userId } });
}

/**
 * ממוצע נטו חודשי (הכנסה פחות הוצאה) על עד שלושה מהחודשים המלאים
 * האחרונים שיש בהם נתונים. קלט לבדיקת הריאליות בסעיף 8.2 — משתמש בלוח
 * החודשים ובעובדות שכבר קיימים ל-Dashboard, לא מחשב סיכום מקביל משלו.
 *
 * << מדלג על חודש partial: קצב לא-שלם היה מטה את הממוצע כלפי מטה
 *    ומראה תמונה עגומה יותר משהיא, בדיוק מהסיבה ש-forecast.ts נזהר
 *    מקצב יומי על חודש חלקי.
 */
export async function avgMonthlyNet(db: Db, userId: string): Promise<Agorot | null> {
  const keys = await availableMonths(db, userId);
  if (keys.length === 0) return null;

  const nets: Agorot[] = [];
  for (const key of keys) {
    if (nets.length >= 3) break;
    const period = parseMonthKey(key);
    if (!period) continue;
    const result = await factsFor(db, userId, period);
    if (!result || result.facts.period.partial) continue;
    nets.push(result.facts.totals.net);
  }

  if (nets.length === 0) return null;
  const sum = nets.reduce((a, b) => a + b, 0);
  return Math.round(sum / nets.length);
}

/**
 * ממוצע הוצאה חודשית, באותה מדיניות בדיוק כמו avgMonthlyNet למעלה
 * (עד 3 חודשים מלאים, מדלג על partial). קלט לטיפ "כסף עומד ללא
 * ריבית" ב-lib/recommendations/engine.ts — יתרה נמדדת מול הוצאה
 * טיפוסית, לא מול נטו שיכול להיות מנופח מהכנסה.
 */
export async function avgMonthlyExpense(db: Db, userId: string): Promise<Agorot | null> {
  const keys = await availableMonths(db, userId);
  if (keys.length === 0) return null;

  const expenses: Agorot[] = [];
  for (const key of keys) {
    if (expenses.length >= 3) break;
    const period = parseMonthKey(key);
    if (!period) continue;
    const result = await factsFor(db, userId, period);
    if (!result || result.facts.period.partial) continue;
    expenses.push(result.facts.totals.expense);
  }

  if (expenses.length === 0) return null;
  const sum = expenses.reduce((a, b) => a + b, 0);
  return Math.round(sum / expenses.length);
}
