/**
 * רכיבי מסך יעדי החיסכון. סעיף 8.
 *
 * << בדיקת הריאליות (8.2) כבר הוכרעה ב-lib/savings/engine.ts — הרכיב
 *    רק מציג את התוצאה. אותו כלל כמו parts.tsx של הדשבורד: "מה שהיה
 *    צהוב בטרמינל חייב לשרוד למסך", לא להיכתב כאן מחדש.
 *
 * הכול Server Components וטפסים. אין `use client` בקובץ הזה.
 */

import { formatILS } from "../../lib/analytics/money";
import type { GoalStatus, Realism, SavingsGoal } from "../../lib/savings/engine";
import { contributeAction, createGoalAction, deleteGoalAction } from "../../app/savings/actions";

const money = (a: number) => formatILS(a);

function ProgressBar({ pct }: { pct: number }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
      <div
        className="h-1.5 rounded-full bg-black/30 dark:bg-white/40"
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

const REALISM_LABEL: Record<Realism, string> = {
  comfortable: "בהישג יד לפי ההרגל הכספי הנוכחי",
  tight: "אפשרי, אבל דורש משמעת — קרוב לכל הנטו החודשי",
  unrealistic: "מעל הנטו החודשי הממוצע כרגע",
  unknown: "אין עדיין מספיק חודשים כדי להעריך",
};

const REALISM_CLASS: Record<Realism, string> = {
  comfortable: "opacity-60",
  tight: "text-amber-600 dark:text-amber-400",
  unrealistic: "text-red-600 dark:text-red-400",
  unknown: "opacity-60",
};

export function GoalCard({
  goal,
  status,
  realism,
}: {
  goal: SavingsGoal;
  status: GoalStatus;
  realism: Realism;
}) {
  const dateLabel = goal.targetAt.toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
  });

  return (
    <section className="mt-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-medium">{goal.name}</h2>
        <span className="text-xs opacity-60">יעד: {dateLabel}</span>
      </div>

      <p className="mt-2 tabular-nums text-sm">
        {money(goal.saved)} <span className="opacity-50">מתוך</span> {money(goal.target)}
      </p>
      <ProgressBar pct={status.pct} />

      {status.achieved ? (
        <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          היעד הושג
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm">
            נדרש כ-{money(status.requiredMonthly)} בחודש
            {status.overdue
              ? " · התאריך שנקבע כבר עבר"
              : ` · ${status.monthsLeft} חודשים נותרו`}
          </p>
          <p className={`mt-1 text-xs ${REALISM_CLASS[realism]}`}>{REALISM_LABEL[realism]}</p>
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <form action={contributeAction} className="flex items-center gap-2">
          <input type="hidden" name="goalId" value={goal.id} />
          <input
            type="number"
            name="amount"
            step="0.01"
            min="0.01"
            placeholder="סכום הפקדה"
            required
            className="w-32 rounded-lg border border-black/15 bg-transparent px-2 py-1 text-xs dark:border-white/20"
          />
          <button
            type="submit"
            className="rounded-lg border border-black/20 px-3 py-1 text-xs hover:bg-black/[0.04] dark:border-white/20 dark:hover:bg-white/[0.06]"
          >
            הפקד
          </button>
        </form>

        <form action={deleteGoalAction}>
          <input type="hidden" name="goalId" value={goal.id} />
          <button
            type="submit"
            className="rounded-lg px-2 py-1 text-xs opacity-50 hover:text-red-600 hover:opacity-100"
          >
            מחק יעד
          </button>
        </form>
      </div>
    </section>
  );
}

export function NewGoalForm() {
  return (
    <form action={createGoalAction} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs opacity-70">
        שם היעד
        <input
          type="text"
          name="name"
          required
          maxLength={80}
          placeholder="לדוגמה: קרן חירום"
          className="w-40 rounded-lg border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs opacity-70">
        סכום יעד
        <input
          type="number"
          name="target"
          step="0.01"
          min="0.01"
          required
          className="w-32 rounded-lg border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs opacity-70">
        עד תאריך
        <input
          type="date"
          name="targetAt"
          required
          className="rounded-lg border border-black/15 bg-transparent px-2 py-1.5 text-sm dark:border-white/20"
        />
      </label>
      <button
        type="submit"
        className="rounded-lg border border-black/20 px-3 py-1.5 text-sm hover:bg-black/[0.04] dark:border-white/20 dark:hover:bg-white/[0.06]"
      >
        הוסף יעד
      </button>
    </form>
  );
}
