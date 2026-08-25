/**
 * רכיבי מסך הבית המאוחד.
 *
 * ─── למה מסך הבית מקבל ערכת רכיבים משלו, ולא משתמש ב-Card של הדשבורד ───
 *
 * הדשבורד הוא דוח: שורות מידע צפופות, כותרת קטנה, מספר, סוף. מסך הבית
 * הוא "מרכז שליטה" — הדבר הראשון שרואים, ולכן הוא צריך יותר נשימה בין
 * הכרטיסים, מספרים גדולים יותר במקומות שבאמת חשובים (יתרה, תחזית), ו
 * מדרג ברור יותר. זה עדיין לא כרטיס חדש בכל מסך — הדשבורד, החיסכון
 * והתקציב ממשיכים להשתמש ב-Card הקיים; רק הבית עצמו מקבל ערכת עיצוב
 * ייעודית כי הוא היחיד שצריך להרגיש כמו יעד ולא כמו טבלה.
 *
 * הכול Server Components. אין state, אין חישוב — כל מספר כאן מגיע
 * ממנוע טהור שכבר נבדק (accounts/engine, forecast, savings/engine,
 * recommendations/engine).
 */

import type { ReactNode } from "react";
import Link from "next/link";

import { formatILS } from "../../lib/analytics/money";
import type { BalanceSummary } from "../../lib/accounts/engine";
import type { Forecast } from "../../lib/analytics/forecast";
import type { GoalStatus, Realism, SavingsGoal } from "../../lib/savings/engine";
import type { Recommendation } from "../../lib/recommendations/engine";

const money = (a: number) => formatILS(a);

// ─────────────────────────── בסיס ───────────────────────────

export function Surface({
  title,
  hint,
  action,
  children,
}: {
  title?: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(18,24,26,0.04)]">
      {title ? (
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-medium text-ink">{title}</h2>
          {action ?? (hint ? <span className="text-xs text-muted">{hint}</span> : null)}
        </div>
      ) : null}
      {children}
    </section>
  );
}

const REALISM_STYLE: Record<Realism, { label: string; cls: string }> = {
  comfortable: { label: "ריאלי", cls: "text-good" },
  tight: { label: "צמוד", cls: "text-warn" },
  unrealistic: { label: "לא ריאלי בקצב הנוכחי", cls: "text-critical" },
  unknown: { label: "עדיין אין מספיק נתונים", cls: "text-muted" },
};

const TONE_STYLE: Record<Recommendation["tone"], { dot: string; badge: string; label: string }> = {
  confirmed: { dot: "bg-good", badge: "bg-good/10 text-good", label: "מזוהה" },
  action: { dot: "bg-warn", badge: "bg-warn/10 text-warn", label: "כדאי לפעול" },
  tip: { dot: "bg-accent", badge: "bg-accent/10 text-accent", label: "טיפ" },
};

// ─────────────────────────── יתרה ───────────────────────────

function Sparkline({ points, positive }: { points: BalanceSummary["sparkline"]; positive: boolean }) {
  if (points.length < 2) return null;

  const w = 240;
  const h = 48;
  const pad = 3;
  const values = points.map((p) => p.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (p.balance - min) / span) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const last = coords[coords.length - 1].split(",");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-12 w-full" preserveAspectRatio="none">
      <polyline
        points={coords.join(" ")}
        fill="none"
        stroke={positive ? "var(--good)" : "var(--accent)"}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill={positive ? "var(--good)" : "var(--accent)"} />
    </svg>
  );
}

export function BalanceCard({ summary }: { summary: BalanceSummary }) {
  const delta = summary.deltaVsPrior;
  const positive = delta !== null && delta >= 0;

  return (
    <Surface>
      <p className="text-xs text-muted">יתרה בחשבון</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">{money(summary.current)}</p>

      {delta !== null ? (
        <p className={`mt-1 text-sm tabular-nums ${positive ? "text-good" : "text-critical"}`}>
          {positive ? "▲" : "▼"} {money(Math.abs(delta))}
          <span className="ms-1 text-xs text-muted">מול לפני כחודש</span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted">אין עדיין נקודת השוואה</p>
      )}

      <Sparkline points={summary.sparkline} positive={positive} />
    </Surface>
  );
}

// ─────────────────────── הוצאה החודש ───────────────────────

export function SpendSnapshotCard({
  income,
  expense,
  net,
  periodLabel,
  partial,
  lastDataAt,
}: {
  income: number;
  expense: number;
  net: number;
  periodLabel: string;
  partial: boolean;
  lastDataAt: string | null;
}) {
  return (
    <Surface title={periodLabel}>
      {partial ? (
        <p className="mt-1 text-xs text-warn">
          חודש חלקי{lastDataAt ? ` — נתונים עד ${lastDataAt}` : ""}
        </p>
      ) : null}
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs text-muted">הכנסות</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums text-ink">{money(income)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">הוצאות</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums text-ink">{money(expense)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">נטו</dt>
          <dd className={`mt-1 text-lg font-medium tabular-nums ${net < 0 ? "text-critical" : "text-ink"}`}>
            {money(net)}
          </dd>
        </div>
      </dl>
    </Surface>
  );
}

// ─────────────────────────── תחזית ───────────────────────────

const CONFIDENCE_LABEL: Record<Forecast["confidence"], string> = {
  low: "נמוך",
  medium: "בינוני",
  high: "גבוה",
};

export function ForecastCard({ forecast }: { forecast: Forecast }) {
  const tone =
    forecast.confidence === "low"
      ? "text-critical"
      : forecast.confidence === "medium"
        ? "text-warn"
        : "text-good";

  return (
    <Surface title="תחזית לסוף החודש" hint={`${forecast.daysRemaining} ימים נותרו`}>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs text-muted">רצפה</dt>
          <dd className="mt-1 font-medium tabular-nums text-ink">{money(forecast.floor)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">צפוי</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums text-ink">{money(forecast.expected)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">תקרה</dt>
          <dd className="mt-1 font-medium tabular-nums text-muted">{money(forecast.ceiling)}</dd>
        </div>
      </dl>
      <p className={`mt-3 text-xs ${tone}`}>ביטחון: {CONFIDENCE_LABEL[forecast.confidence]}</p>
      <Link href="/dashboard" className="mt-2 inline-block text-xs text-accent hover:underline">
        לפירוט המלא ←
      </Link>
    </Surface>
  );
}

// ─────────────────── התוכנית הכלכלית שלי ───────────────────

function GoalProgress({ goal, status, realism }: { goal: SavingsGoal; status: GoalStatus; realism: Realism }) {
  const pct = Math.max(0, Math.min(100, Math.round(status.pct)));
  const r = REALISM_STYLE[realism];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-ink">{goal.name}</span>
        <span className="text-xs tabular-nums text-muted">
          {money(goal.saved)} / {money(goal.target)}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-track">
        <div className="h-1.5 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {status.achieved ? (
          <span className="text-good">היעד הושג</span>
        ) : (
          <>
            {money(status.requiredMonthly)} בחודש כדי להגיע ליעד בעוד {status.monthsLeft} חודשים ·{" "}
            <span className={r.cls}>{r.label}</span>
          </>
        )}
      </p>
    </div>
  );
}

function RecommendationRow({ rec }: { rec: Recommendation }) {
  const t = TONE_STYLE[rec.tone];
  return (
    <li className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 gap-3">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm text-ink">{rec.title}</p>
          <p className="mt-0.5 text-xs text-muted">{rec.subtitle}</p>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${t.badge}`}>
          {t.label}
        </span>
        {rec.amount !== null ? (
          <span className="text-xs tabular-nums text-ink-2">{money(rec.amount)}</span>
        ) : null}
      </div>
    </li>
  );
}

export function PlanCard({
  goal,
  status,
  realism,
  recommendations,
}: {
  goal: SavingsGoal | null;
  status: GoalStatus | null;
  realism: Realism | null;
  recommendations: Recommendation[];
}) {
  return (
    <Surface
      title="התוכנית הכלכלית שלי"
      action={
        <Link href="/savings" className="text-xs text-accent hover:underline">
          כל היעדים ←
        </Link>
      }
    >
      <div className="mt-3">
        {goal && status && realism ? (
          <GoalProgress goal={goal} status={status} realism={realism} />
        ) : (
          <p className="text-sm text-muted">
            אין עדיין יעד חיסכון.{" "}
            <Link href="/savings" className="text-accent hover:underline">
              להגדיר יעד ראשון
            </Link>
          </p>
        )}
      </div>

      {recommendations.length > 0 ? (
        <ul className="mt-4 space-y-3 border-t border-border pt-4">
          {recommendations.map((r) => (
            <RecommendationRow key={r.id} rec={r} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-border pt-4 text-xs text-muted">
          אין כרגע המלצות — נצטרך עוד כמה חודשי נתונים כדי לזהות דפוסים.
        </p>
      )}
    </Surface>
  );
}

// ─────────────────────── ממתין להכרעה ───────────────────────

export function PendingBanner({ count, total }: { count: number; total: number }) {
  if (count === 0) {
    return (
      <p className="rounded-2xl bg-good/10 px-4 py-3 text-sm text-good">כל התנועות מסווגות.</p>
    );
  }
  return (
    <Link
      href="/transactions"
      className="block rounded-2xl bg-warn/10 px-4 py-3 text-sm transition hover:bg-warn/[0.16]"
    >
      <b className="text-warn">{count} בתי עסק ממתינים להכרעה</b>
      <span className="ms-2 text-ink-2">{money(total)} לא מסווגים</span>
    </Link>
  );
}
