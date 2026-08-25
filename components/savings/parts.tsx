/**
 * רכיבי מסך יעדי החיסכון. סעיף 8.
 *
 * << בדיקת הריאליות (8.2) והצעדים המומלצים (8.4) כבר הוכרעו ב-
 *    lib/savings/engine.ts — הרכיב רק מציג את התוצאה. אותו כלל כמו
 *    parts.tsx של הדשבורד: "מה שהיה צהוב בטרמינל חייב לשרוד למסך",
 *    לא להיכתב כאן מחדש.
 *
 * << עדכון עיצובי: תג אייקון עגול לכל יעד (מטרה — לא קטגוריה, אז לא
 *    CategoryIcon) בטון שנגזר מהריאליות/מהשגת היעד, כדי שאפשר יהיה
 *    לסרוק את הרשימה במבט אחד בלי לקרוא כל שורה. פס ההתקדמות והטקסט
 *    המילולי ("אפשרי אך דורש משמעת" וכו') צובעים באותו טון.
 *
 * הכול Server Components וטפסים. אין `use client` בקובץ הזה.
 */

import { formatILS } from "../../lib/analytics/money";
import type { GoalStatus, Realism, Recommendation, SavingsGoal } from "../../lib/savings/engine";
import { contributeAction, createGoalAction, deleteGoalAction } from "../../app/savings/actions";

const money = (a: number) => formatILS(a);

/** אייקון "מטרה" — עיגולים קונצנטריים, לא אחד מאייקוני הקטגוריות. */
function GoalIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="10" cy="10" r="6.5" />
      <circle cx="10" cy="10" r="3.5" />
      <circle cx="10" cy="10" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function ProgressBar({ pct, barClass }: { pct: number; barClass: string }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-2 h-1.5 w-full rounded-full bg-wash">
      <div className={`h-1.5 rounded-full ${barClass}`} style={{ width: `${w}%` }} />
    </div>
  );
}

const REALISM_LABEL: Record<Realism, string> = {
  comfortable: "בהישג יד לפי ההרגל הכספי הנוכחי",
  tight: "אפשרי, אבל דורש משמעת — קרוב לכל הנטו החודשי",
  unrealistic: "מעל הנטו החודשי הממוצע כרגע",
  unknown: "אין עדיין מספיק חודשים כדי להעריך",
};

/** טון אחיד (תג אייקון + פס + טקסט) לכל רמת ריאליות. */
const REALISM_TONE: Record<Realism, { badge: string; bar: string; text: string }> = {
  comfortable: { badge: "bg-good/15 text-good", bar: "bg-good", text: "text-muted" },
  tight: { badge: "bg-warn/15 text-warn", bar: "bg-warn", text: "text-warn" },
  unrealistic: { badge: "bg-critical/15 text-critical", bar: "bg-critical", text: "text-critical" },
  unknown: { badge: "bg-wash text-muted", bar: "bg-ink-2/50", text: "text-muted" },
};

const ACHIEVED_TONE = { badge: "bg-good/15 text-good", bar: "bg-good" };

export function GoalCard({
  goal,
  status,
  realism,
  steps,
}: {
  goal: SavingsGoal;
  status: GoalStatus;
  realism: Realism;
  steps: Recommendation[];
}) {
  const dateLabel = goal.targetAt.toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
  });

  const tone = status.achieved ? ACHIEVED_TONE : REALISM_TONE[realism];

  return (
    <section className="mt-4 rounded-xl border border-border bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${tone.badge}`}
        >
          <GoalIcon />
        </span>
        <div className="flex flex-1 items-baseline justify-between gap-3">
          <h2 className="font-medium">{goal.name}</h2>
          <span className="text-xs text-muted">יעד: {dateLabel}</span>
        </div>
      </div>

      <div className="ms-[42px]">
        <p className="mt-2 tabular-nums text-sm text-ink">
          {money(goal.saved)} <span className="text-muted">מתוך</span> {money(goal.target)}
        </p>
        <ProgressBar pct={status.pct} barClass={tone.bar} />

        {status.achieved ? (
          <p className="mt-3 inline-block rounded-lg bg-good/15 px-3 py-2 text-sm text-good">
            היעד הושג
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm text-ink">
              נדרש כ-{money(status.requiredMonthly)} בחודש
              {status.overdue
                ? " · התאריך שנקבע כבר עבר"
                : ` · ${status.monthsLeft} חודשים נותרו`}
            </p>
            <p className={`mt-1 text-xs ${REALISM_TONE[realism].text}`}>{REALISM_LABEL[realism]}</p>

            {steps.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-ink-2">
                {steps.map((s) => (
                  <li key={s.id} className="flex gap-1.5">
                    <span aria-hidden="true">·</span>
                    <span>{s.text}</span>
                  </li>
                ))}
              </ul>
            )}
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
              className="w-32 rounded-lg border border-border bg-transparent px-2 py-1 text-xs text-ink"
            />
            <button
              type="submit"
              className="rounded-lg border border-border px-3 py-1 text-xs text-ink-2 hover:bg-wash"
            >
              הפקד
            </button>
          </form>

          <form action={deleteGoalAction}>
            <input type="hidden" name="goalId" value={goal.id} />
            <button
              type="submit"
              className="rounded-lg px-2 py-1 text-xs text-muted hover:text-critical"
            >
              מחק יעד
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

export function NewGoalForm() {
  return (
    <form action={createGoalAction} className="mt-3 flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted">
        שם היעד
        <input
          type="text"
          name="name"
          required
          maxLength={80}
          placeholder="לדוגמה: קרן חירום"
          className="w-40 rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        סכום יעד
        <input
          type="number"
          name="target"
          step="0.01"
          min="0.01"
          required
          className="w-32 rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-ink"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-muted">
        עד תאריך
        <input
          type="date"
          name="targetAt"
          required
          className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-sm text-ink"
        />
      </label>
      <button
        type="submit"
        className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-strong"
      >
        הוסף יעד
      </button>
    </form>
  );
}
