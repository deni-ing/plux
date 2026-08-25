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
 * << מסד העיצוב: כל הצבעים הגולמיים (black/white/red/emerald/amber עם
 *    dark: נפרד) הוחלפו בטוקנים הסמנטיים מ-globals.css. `Totals` הוסר
 *    ולא רק נצבע מחדש — `StatTiles` למטה מחליפה אותו, ולא היה טעם
 *    להשאיר שני רכיבים שמציגים בדיוק את אותם שלושה מספרים.
 *
 * הכול Server Components. אין `use client`, אין state, אין חישוב.
 */

import type { ReactNode } from "react";

import { formatILS } from "../../lib/analytics/money";
import type { SnapshotFacts } from "../../lib/analytics/snapshot";
import { categoryIcon, categorySlot, topLevelSlug } from "../../lib/categories/palette";
import { CategoryIcon } from "../categories/icon";

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
    <section className="mt-4 rounded-xl border border-border p-4">
      {title ? (
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-medium text-ink">{title}</h2>
          {hint ? <span className="text-xs text-muted">{hint}</span> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * אזהרה. `warn` ולא `critical`: זו אינה תקלה אלא הקשר שחסר בלעדיו.
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
      ? "bg-critical/10 text-critical"
      : tone === "info"
        ? "bg-wash text-ink-2"
        : "bg-warn/10 text-warn";
  return <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${cls}`}>{children}</p>;
}

function Bar({ pct, color, muted = false }: { pct: number; color?: string; muted?: boolean }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className="mt-1 h-1 w-full rounded-full bg-track">
      <div
        className={`h-1 rounded-full ${color ? "" : muted ? "bg-warn/70" : "bg-ink-2/50"}`}
        style={{ width: `${w}%`, backgroundColor: color }}
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
      <h1 className="text-2xl font-semibold text-ink">{p.label}</h1>
      <p className="mt-2 text-sm text-ink-2">
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

/**
 * שורת שלושת מדדי-העל, כשלוש אריחי-KPI נפרדים — לא dl אחד עם שלוש
 * עמודות כמו הגרסה הישנה (`Totals`, שהוסרה). כל אריח נושא את הדלתא
 * מול החודש הקודם משלו; "נטו" נגזר מ-incomeDelta - expenseDelta במקום
 * להיות שדה שלישי — אין לו כזה במבנה ההשוואה, ואין טעם להוסיף אחד רק
 * כדי לא לחסר שתי חיסורים כאן.
 */
export function StatTiles({ facts }: { facts: SnapshotFacts }) {
  const t = facts.totals;
  const c = facts.comparison;
  const netDelta = c ? c.incomeDelta - c.expenseDelta : null;

  return (
    <div className="mt-4 grid grid-cols-3 gap-3">
      <StatTile label="הכנסות" value={t.income} delta={c?.incomeDelta ?? null} goodWhenUp />
      <StatTile label="הוצאות" value={t.expense} delta={c?.expenseDelta ?? null} goodWhenUp={false} />
      <StatTile
        label="נטו"
        value={t.net}
        delta={netDelta}
        goodWhenUp
        negative={t.net < 0}
        featured
      />
    </div>
  );
}

/**
 * << רק "נטו" מודגש (זוהר + מסגרת צבעונית, כמו האריח הבודד שזוהר
 *    במוקאפ שהמשתמש שלח) — לא כל השלושה. זה בדיוק דפוס ה-"emphasis"
 *    מסקילת ה-dataviz: "one series is the point, rest are context" —
 *    מדגישים את המספר שבאמת חשוב (נטו) ומשאירים את השאר שקטים, במקום
 *    לצבוע את כל השורה ולאבד את ההיררכיה. הצבע נגזר מהערך עצמו
 *    (חיובי/שלילי), לא מהדלתא — נטו שלילי הוא מצב, גם בלי שינוי החודש.
 */
function StatTile({
  label,
  value,
  delta,
  goodWhenUp,
  negative = false,
  featured = false,
}: {
  label: string;
  value: number;
  delta: number | null;
  goodWhenUp: boolean;
  negative?: boolean;
  featured?: boolean;
}) {
  const up = delta !== null && delta > 0;
  const isGood = delta !== null && delta !== 0 && (goodWhenUp ? up : !up);
  const deltaCls = delta === null || delta === 0 ? "text-muted" : isGood ? "text-good" : "text-critical";
  const glow = featured ? (negative ? "var(--critical)" : "var(--good)") : null;

  return (
    <div
      className={`overflow-hidden rounded-2xl bg-surface ${featured ? "border-2" : "border border-border"}`}
      style={
        glow
          ? {
              borderColor: glow,
              backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${glow} 12%, transparent), transparent 70%)`,
              boxShadow: `0 0 0 1px color-mix(in srgb, ${glow} 35%, transparent), 0 12px 28px -10px color-mix(in srgb, ${glow} 60%, transparent)`,
            }
          : undefined
      }
    >
      {glow ? <div className="h-1" style={{ backgroundColor: glow }} /> : null}
      <div className="p-4 text-center">
        <p className="text-xs text-muted">{label}</p>
        <p
          className={`mt-1 font-semibold tabular-nums ${featured ? "text-2xl" : "text-lg"} ${
            negative ? "text-critical" : "text-ink"
          }`}
        >
          {money(value)}
        </p>
        {delta !== null && delta !== 0 ? (
          <p className={`text-xs tabular-nums ${deltaCls}`}>
            {up ? "▲" : "▼"} {money(Math.abs(delta))}
          </p>
        ) : (
          <p className="text-xs text-muted">ללא שינוי</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── תקציב ───────────────────────────

export type BudgetOverage = {
  categoryName: string;
  spent: number;
  cap: number;
};

/** באנר חריגות תקציב. סעיף 6-החדש: מה שכבר גלוי ב-/budget עולה גם לכאן. */
export function BudgetAlert({ overages }: { overages: BudgetOverage[] }) {
  if (overages.length === 0) return null;
  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl border border-warn/30 bg-warn/10"
      style={{ boxShadow: "0 10px 24px -14px color-mix(in srgb, var(--warn) 65%, transparent)" }}
    >
      <div className="flex items-center gap-3 p-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold"
          style={{ backgroundColor: "color-mix(in srgb, var(--warn) 22%, transparent)", color: "var(--warn)" }}
        >
          !
        </span>
        <p className="text-sm font-medium text-warn">
          חריגת תקציב ב{overages.length === 1 ? "קטגוריה אחת" : `${overages.length} קטגוריות`}
        </p>
      </div>
      <ul className="space-y-1 px-4 pb-4">
        {overages.map((o) => (
          <li key={o.categoryName} className="flex items-baseline justify-between gap-3 text-sm text-ink-2">
            <span>{o.categoryName}</span>
            <span className="tabular-nums">
              {money(o.spent)} <span className="text-muted">/ {money(o.cap)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────── קטגוריות ───────────────────────────

export function Categories({ facts }: { facts: SnapshotFacts }) {
  const total = facts.totals.expense;
  if (facts.categories.length === 0) {
    return (
      <Card title="לפי קטגוריה">
        <p className="mt-3 text-sm text-ink-2">אין הוצאות בחודש הזה.</p>
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
          const color = unclassified ? "var(--warn)" : `var(--cat-${categorySlot(topLevelSlug(c.slug!))})`;
          return (
            <li key={c.slug ?? "__none__"}>
              <div className="flex items-baseline justify-between gap-3">
                <span className={`flex items-center gap-2 text-sm ${unclassified ? "text-warn" : "text-ink"}`}>
                  <CategoryIcon
                    icon={unclassified ? null : categoryIcon(topLevelSlug(c.slug!))}
                    className="shrink-0"
                  />
                  {c.name}
                  <span className="text-xs text-muted">{c.count}</span>
                </span>
                <span className="tabular-nums text-sm text-ink">
                  {money(c.total)}
                  <span className="ms-2 text-xs text-muted">{c.share}%</span>
                  {mover && mover.deltaPct !== null ? (
                    <span
                      className={`ms-2 text-xs ${mover.delta > 0 ? "text-critical" : "text-good"}`}
                    >
                      {mover.delta > 0 ? "▲" : "▼"} {Math.abs(mover.deltaPct)}%
                    </span>
                  ) : null}
                </span>
              </div>

              <Bar pct={total === 0 ? 0 : (c.total / total) * 100} color={color} />

              {c.children.length > 0 ? (
                <ul className="mt-2 space-y-1 ps-3">
                  {c.children.map((k) => (
                    <li
                      key={k.slug}
                      className="flex items-baseline justify-between gap-3 text-xs text-ink-2"
                    >
                      <span>
                        {k.name}
                        <span className="ms-2 text-muted">{k.count}</span>
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
          <li key={m.slug ?? "__none__"} className="flex items-baseline justify-between gap-3 text-sm text-ink">
            <span>{m.name}</span>
            <span className="tabular-nums">
              <span className={m.delta > 0 ? "text-critical" : "text-good"}>
                {m.delta > 0 ? "▲" : "▼"} {money(Math.abs(m.delta))}
              </span>
              <span className="ms-2 text-xs text-muted">
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
      <p className="mt-2 text-lg font-medium tabular-nums text-ink">{money(f.total)}</p>
      <ul className="mt-3 space-y-1">
        {f.byMerchant.map((m) => (
          <li key={m.merchant} className="flex items-baseline justify-between gap-3 text-sm text-ink">
            <span className="truncate">{m.merchant}</span>
            <span className="tabular-nums text-ink-2">
              {money(m.total)}
              <span className="ms-2 text-xs text-muted">×{m.count}</span>
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
            <div className="flex items-baseline justify-between gap-3 text-sm text-ink">
              <span className="truncate">{r.merchant}</span>
              <span className="tabular-nums">{money(r.amount)}</span>
            </div>
            <p className="text-xs text-muted">
              {r.kind === "subscription" ? (
                <span className="text-good">הוראת קבע</span>
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
                <span className="text-warn">{money(r.annualized)} בשנה</span>
              ) : (
                <span className="text-muted">אם יימשך: {money(r.annualized)} בשנה</span>
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
      ? "text-critical"
      : f.confidence === "medium"
        ? "text-warn"
        : "text-good";
  const label = f.confidence === "low" ? "נמוך" : f.confidence === "medium" ? "בינוני" : "גבוה";

  return (
    <Card title="תחזית לסוף החודש" hint={`${f.daysRemaining} ימים נותרו`}>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-center">
        <div>
          <dt className="text-xs text-muted">רצפה</dt>
          <dd className="mt-1 font-medium tabular-nums text-ink">{money(f.floor)}</dd>
          <span className="text-[10px] text-muted">לא ייתכן פחות</span>
        </div>
        <div>
          <dt className="text-xs text-muted">צפוי</dt>
          <dd className="mt-1 text-lg font-medium tabular-nums text-ink">{money(f.expected)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">תקרה</dt>
          <dd className="mt-1 font-medium tabular-nums text-muted">{money(f.ceiling)}</dd>
        </div>
      </dl>

      {f.upcoming.length > 0 ? (
        <ul className="mt-4 space-y-1">
          {f.upcoming.map((c) => (
            <li key={c.merchant} className="flex items-baseline justify-between gap-3 text-sm text-ink">
              <span className="truncate">
                {c.merchant}
                <span className="ms-2 text-xs text-muted">{c.dueAt}</span>
              </span>
              <span className="tabular-nums text-ink-2">{money(c.amount)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* << ההנחות. הן שדה במבנה ולא הערה בקוד בדיוק כדי שיגיעו לכאן. */}
      <div className="mt-4 border-t border-border pt-3">
        <p className={`text-xs ${tone}`}>ביטחון: {label}</p>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          {f.assumptions.map((a, i) => (
            <li key={i}>· {a}</li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
