/**
 * רכיבי הדשבורד.
 *
 * ─── הכלל היחיד שקובע כאן ───
 *
 * **כל מה שהיה צהוב בטרמינל חייב לשרוד למסך.**
 *
 * "חודש חלקי", "סווגו 68% מהשקלים", "אם יימשך", "על מה זה נשען" — כל
 * אחד מהם נולד היום מתוך מספר שהיה נכון אריתמטית ומטעה לגמרי. הפיתוי
 * למחוק אותם בעיצוב עצום: הם מכערים את הכרטיס, הם ארוכים, והמספר
 * לבדו נראה הרבה יותר טוב.
 *
 * **מסך שמציג ₪5,228 בלי ההנחות שמאחוריו הוא בדיוק הכלי שניסינו לא
 * לבנות.** לכן האזהרות כאן אינן הערות שוליים אלא רכיבים ראשונים
 * במדרג — הן מופיעות מעל המספר, לא מתחתיו.
 *
 * הכול Server Components. אין `use client`, אין state, אין חישוב.
 */

import type { ReactNode } from "react";

import { formatILS } from "../../lib/analytics/money";
import type { SnapshotFacts } from "../../lib/analytics/snapshot";

// ─────────────────────────── בסיס ───────────────────────────

export function Card({
  title,
  hint,
  children,
}: {
  title?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-4 rounded-xl border border-black/10 p-4 dark:border-white/10">
      {title ? (
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-medium">{title}</h2>
          {hint ? <span className="text-xs opacity-60">{hint}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * אזהרה. `amber` ולא `red`: זו אינה תקלה אלא הקשר שחסר בלעדיו.
 * אדום היה גורם לה להיראות כמו משהו לתקן, והיא לא.
 */
export function Notice({
  children,
  tone = "warn",
}: {
  children: ReactNode;
  tone?: "warn" | "info" | "bad";
}) {
  const cls =
    tone === "bad"
      ? "bg-red-500/10 text-red-700 dark:text-red-400"
      : tone === "info"
        ? "bg-black/[0.04] opacity-80 dark:bg-white/[0.06]"
        : "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${cls}`}>{children}</p>;
}

function Bar({ pct, muted = false }: { pct: number; muted?: boolean }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-1 h-1 w-full rounded-full bg-black/[0.06] dark:bg-white/[0.08]">
      <div
        className={`h-1 rounded-full ${muted ? "bg-amber-500/60" : "bg-black/30 dark:bg-white/40"}`}
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

const money = (a: number) => formatILS(a);

// ─────────────────────── כותרת ואזהרות ───────────────────────

export function PeriodHeader({ facts }: { facts: SnapshotFacts }) {
  const p = facts.period;
  const c = facts.comparison;

  return (
    <header>
      <h1 className="text-2xl font-semibold">{p.label}</h1>
      <p className="mt-2 text-sm opacity-70">
        {facts.basis === "booked" ? "לפי תאריך עסקה" : "לפי תאריך חיוב"}
        {" · "}
        {facts.totals.txnCount} תנועות
      </p>

      {/* << הבאנר הזה קודם למספרים בכוונה. מי שקורא את הסכום קודם ואת
          ההקשר אחר כך כבר קיבל את הרושם. */}
      {p.partial ? (
        <Notice>
          <b>חודש חלקי.</b> הנתונים מגיעים עד {p.lastDataAt} — {p.daysCovered} מתוך{" "}
          {p.daysInPeriod} ימים.
          {c
            ? c.aligned
              ? ` ההשוואה היא מול ${c.currentDays} הימים הראשונים של ${c.previousLabel}.`
              : ` ההשוואה אינה מיושרת: ${c.currentDays} ימים מול ${c.previousDays}.`
            : null}
        </Notice>
      ) : null}

      {c && !c.aligned && !p.partial ? (
        <Notice tone="bad">
          ההשוואה אינה ברת־תוקף: {c.currentDays} ימים מול {c.previousDays}.
        </Notice>
      ) : null}
    </header>
  );
}

// ─────────────────────────── סכומים ───────────────────────────

export function Totals({ facts }: { facts: SnapshotFacts }) {
  const t = facts.totals;
  const cls = facts.classification;
  const c = facts.comparison;
  const gap = cls.countPct - cls.amountPct;

  return (
    <Card>
      <dl className="grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs opacity-60">הכנסות</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums">{money(t.income)}</dd>
        </div>
        <div>
          <dt className="text-xs opacity-60">הוצאות</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums">{money(t.expense)}</dd>
          {c ? (
            <span
              className={`text-xs tabular-nums ${c.expenseDelta > 0 ? "text-red-600" : "text-emerald-600"}`}
            >
              {c.expenseDelta > 0 ? "▲" : "▼"} {money(Math.abs(c.expenseDelta))}
            </span>
          ) : null}
        </div>
        <div>
          <dt className="text-xs opacity-60">נטו</dt>
          <dd
            className={`mt-1 text-lg font-medium tabular-nums ${t.net < 0 ? "text-red-600" : ""}`}
          >
            {money(t.net)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-xs opacity-60">
        {t.transfersExcluded} העברות הוחרגו ({money(t.transfersTotal)}) — הן אינן הוצאה
        ואינן הכנסה.
      </p>

      {/* << שני מדדי כיסוי ולא אחד. הפער ביניהם הוא המידע: הוא אומר
          שתנועה גדולה אחת לא סווגה. */}
      <p className={`mt-1 text-xs ${cls.amountPct < 90 ? "text-amber-600" : "opacity-60"}`}>
        סווגו {cls.countPct}% מהתנועות · {cls.amountPct}% מהשקלים
        {gap > 10 ? " — הפער אומר שתנועה גדולה לא סווגה" : ""}
      </p>
    </Card>
  );
}

// ─────────────────────────── קטגוריות ───────────────────────────

export function Categories({ facts }: { facts: SnapshotFacts }) {
  const total = facts.totals.expense;
  if (facts.categories.length === 0) {
    return (
      <Card title="לפי קטגוריה">
        <p className="mt-3 text-sm opacity-70">אין הוצאות בחודש הזה.</p>
      </Card>
    );
  }

  const moverBySlug = new Map(facts.comparison?.movers.map((m) => [m.slug, m]) ?? []);

  return (
    <Card title="לפי קטגוריה">
      <ul className="mt-3 space-y-3">
        {facts.categories.map((c) => {
          const mover = moverBySlug.get(c.slug);
          const unclassified = c.slug === null;
          return (
            <li key={c.slug ?? "__none__"}>
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-sm ${unclassified ? "text-amber-600" : ""}`}>
                  {c.name}
                  <span className="ms-2 text-xs opacity-50">{c.count}</span>
                </span>
                <span className="tabular-nums text-sm">
                  {money(c.total)}
                  <span className="ms-2 text-xs opacity-50">{c.share}%</span>
                  {mover && mover.deltaPct !== null ? (
                    <span
                      className={`ms-2 text-xs ${mover.delta > 0 ? "text-red-600" : "text-emerald-600"}`}
                    >
                      {mover.delta > 0 ? "▲" : "▼"} {Math.abs(mover.deltaPct)}%
                    </span>
                  ) : null}
                </span>
              </div>

              <Bar pct={total === 0 ? 0 : (c.total / total) * 100} muted={unclassified} />

              {c.children.length > 0 ? (
                <ul className="mt-2 space-y-1 ps-3">
                  {c.children.map((k) => (
                    <li
                      key={k.slug}
                      className="flex items-baseline justify-between gap-3 text-xs opacity-70"
                    >
                      <span>
                        {k.name}
                        <span className="ms-2 opacity-60">{k.count}</span>
                      </span>
                      <span className="tabular-nums">{money(k.total)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ─────────────────────────── מה השתנה ───────────────────────────

export function Movers({ facts }: { facts: SnapshotFacts }) {
  const c = facts.comparison;
  if (!c || c.movers.length === 0) return null;

  return (
    <Card title="מה השתנה הכי הרבה" hint={`מול ${c.previousLabel}`}>
      {!c.aligned ? (
        <Notice tone="bad">
          {c.currentDays} ימים מול {c.previousDays} — המספרים כאן אינם ברי־השוואה.
        </Notice>
      ) : null}
      <ul className="mt-3 space-y-2">
        {c.movers.slice(0, 6).map((m) => (
          <li key={m.slug ?? "__none__"} className="flex items-baseline justify-between gap-3 text-sm">
            <span>{m.name}</span>
            <span className="tabular-nums">
              <span className={m.delta > 0 ? "text-red-600" : "text-emerald-600"}>
                {m.delta > 0 ? "▲" : "▼"} {money(Math.abs(m.delta))}
              </span>
              <span className="ms-2 text-xs opacity-50">
                {m.deltaPct === null ? "חדש" : `${m.deltaPct}%`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─────────────────────────── עמלות ───────────────────────────

export function Fees({ facts }: { facts: SnapshotFacts }) {
  const f = facts.fees;
  if (f.count === 0) return null;

  return (
    <Card title="עמלות" hint={`${f.shareOfExpense}% מההוצאה`}>
      <p className="mt-2 text-lg font-medium tabular-nums">{money(f.total)}</p>
      <ul className="mt-3 space-y-1">
        {f.byMerchant.map((m) => (
          <li key={m.merchant} className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{m.merchant}</span>
            <span className="tabular-nums opacity-70">
              {money(m.total)}
              <span className="ms-2 text-xs opacity-60">×{m.count}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ─────────────────────── חיובים חוזרים ───────────────────────

export function Recurring({ facts }: { facts: SnapshotFacts }) {
  const list = facts.recurring
    .filter((r) => r.cadence !== "irregular" && r.stopped !== true)
    .slice(0, 8);
  if (list.length === 0) return null;

  const guessed = list.filter((r) => r.kind !== "subscription").length;

  return (
    <Card title="חיובים חוזרים">
      <ul className="mt-3 space-y-3">
        {list.map((r) => (
          <li key={r.merchant}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">{r.merchant}</span>
              <span className="tabular-nums">{money(r.amount)}</span>
            </div>
            <p className="text-xs opacity-60">
              {r.kind === "subscription" ? (
                <span className="text-emerald-600">הוראת קבע</span>
              ) : (
                <span>זוהה לפי דפוס · {Math.round(r.confidence * 100)}% ביטחון</span>
              )}
              {" · "}
              {r.occurrences} חיובים · הבא {r.nextDueAt}
            </p>
            {/* << סכום שנתי על חיוב שלא הוצהר הוא השלכה מותנית. התנאי
                נכתב לצד המספר, לא בהערה מתחת — הערה שמופיעה אחרי מספר
                בולט אינה מבטלת אותו. */}
            <p className="text-xs">
              {r.kind === "subscription" ? (
                <span className="text-amber-600">{money(r.annualized)} בשנה</span>
              ) : (
                <span className="opacity-60">אם יימשך: {money(r.annualized)} בשנה</span>
              )}
            </p>
          </li>
        ))}
      </ul>

      {guessed > 0 ? (
        <Notice tone="info">
          {guessed} מהם זוהו לפי דפוס בלבד. חיוב חודשי קבוע יכול להיות מנוי וגם עסקה
          שפוצלה לתשלומים — ההבדל אינו בנתון.
        </Notice>
      ) : null}
    </Card>
  );
}

// ─────────────────────────── תחזית ───────────────────────────

export function Forecast({ facts }: { facts: SnapshotFacts }) {
  const f = facts.forecast;
  if (!f || f.daysRemaining === 0) return null;

  const tone =
    f.confidence === "low"
      ? "text-red-600"
      : f.confidence === "medium"
        ? "text-amber-600"
        : "text-emerald-600";

  return (
    <Card title="תחזית לסוף החודש" hint={`${f.daysRemaining} ימים נותרו`}>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs opacity-60">רצפה</dt>
          <dd className="mt-1 font-medium tabular-nums">{money(f.floor)}</dd>
          <span className="text-[10px] opacity-50">לא ייתכן פחות</span>
        </div>
        <div>
          <dt className="text-xs opacity-60">צפוי</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums">{money(f.expected)}</dd>
        </div>
        <div>
          <dt className="text-xs opacity-60">תקרה</dt>
          <dd className="mt-1 font-medium tabular-nums opacity-70">{money(f.ceiling)}</dd>
        </div>
      </dl>

      {f.upcoming.length > 0 ? (
        <ul className="mt-4 space-y-1">
          {f.upcoming.map((c) => (
            <li key={c.merchant} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate">
                {c.merchant}
                <span className="ms-2 text-xs opacity-50">{c.dueAt}</span>
              </span>
              <span className="tabular-nums opacity-70">{money(c.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* << ההנחות. הן שדה במבנה ולא הערה בקוד בדיוק כדי שיגיעו לכאן. */}
      <div className="mt-4 border-t border-black/10 pt-3 dark:border-white/10">
        <p className={`text-xs ${tone}`}>ביטחון: {f.confidence}</p>
        <ul className="mt-2 space-y-1 text-xs opacity-60">
          {f.assumptions.map((a, i) => (
            <li key={i}>· {a}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
