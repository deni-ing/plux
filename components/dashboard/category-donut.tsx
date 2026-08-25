/**
 * דונאט התפלגות ההוצאות לפי קטגוריה.
 *
 * ─── בכוונה לצד רשימת הקטגוריות המפורטת, לא במקומה ───
 *
 * ‏`Categories` (parts.tsx) היא הכלי לניתוח: פירוט לתת-קטגוריות, דלתא
 * מול החודש הקודם, אחוז מדויק לכל שורה. דונאט לא יכול להחליף את זה —
 * הוא טוב בדיוק לדבר אחר: "איפה הולך רוב הכסף שלי, במבט אחד". שני
 * תפקידים שונים, לא כפילות.
 *
 * ‏**למה בכל זאת דונאט ולא bar**: סקילת ה-dataviz של הסשן ממליצה נגד
 * דונאט/עוגה להשוואת חלקים ("מקשה השוואת גדלים, נשאר מדורג") ובעד
 * bar אופקי — בדיוק מה ש-`Categories` כבר מציגה. זו בחירה מודעת של
 * המשתמש לטובת המראה, לא פספוס של ההמלצה. ה"תרופה" של הסקילה למגבלת
 * הקריאות של דונאט מיושמת כאן במלואה: legend קבוע עם תוויות ישירות
 * (שם + אחוז + סכום לכל פלח, לא צבע לבד), מקסימום כמה פלחים גלויים
 * (יתר מתקפל ל"אחר"), ומספר-על מרכזי שהוא בעצמו התשובה המהירה ביותר.
 *
 * ‏**צבע הזהות, לא צבע ה-seed**: `Category.color` (מ-lib/categories/tree.ts)
 * נבחר לתחושה בלי ולידציה — "מזון" ו"הכנסה" חולקים בטעות אותו ירוק.
 * הצבעים כאן (`--cat-1..8`) עברו את שש הבדיקות של הסקילה (עוגן גוון
 * קבוע, ניגודיות CVD, ניגודיות מול המשטח) וממופים ליציבות-זהות דרך
 * `categorySlot` ולא לפי הדירוג החודשי — אותה קטגוריה תמיד באותו צבע.
 *
 * ‏"לא מסווג" מקבל את טוקן ה-warn (מצב, לא זהות) ולא סלוט קטגוריאלי —
 * זו לא קטגוריה יציבה אלא דגל "עוד לא הוכרע", בדיוק כמו בכל מסך אחר.
 *
 * << הצבעים מגיעים כ-inline style (`var(--cat-N)`) ולא כמחלקת Tailwind
 *    דינמית (`text-cat-${slot}`): Tailwind סורק טקסט מילולי בקוד כדי
 *    לייצר CSS, ומחרוזת שמורכבת ב-runtime משרשור לא נראית לו בכלל —
 *    התוצאה הייתה עיגול בלי צבע. `SLOT_VAR` למטה היא הטבלה הסטטית
 *    שממפה סלוט למשתנה ה-CSS שלו.
 */

import { formatILS } from "../../lib/analytics/money";
import { categoryIcon, categorySlot, topLevelSlug } from "../../lib/categories/palette";
import { CategoryIcon } from "../categories/icon";

const MAX_SLICES = 5;
const SIZE = 200;
const STROKE = 28;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;
const GAP = 3;

const SLOT_VAR: Record<number, string> = {
  1: "var(--cat-1)",
  2: "var(--cat-2)",
  3: "var(--cat-3)",
  4: "var(--cat-4)",
  5: "var(--cat-5)",
  6: "var(--cat-6)",
  7: "var(--cat-7)",
  8: "var(--cat-8)",
};

/**
 * מה שהדונאט צריך מכל שורת קטגוריה — לא `CategoryLine` (lib/analytics/spend.ts):
 * `facts.categories` בפועל הוא `CategoryFact` (snapshot.ts, לא מיוצא) —
 * גרסה מצומצמת בלי `kind`/`children` מוקלדים, כי היא עברה JSON. טיפוס
 * מבני מקומי במקום לייצא טיפוס פנימי רק בשביל הרכיב הזה.
 */
type CategoryShare = {
  slug: string | null;
  name: string;
  total: number;
  share: number;
};

type Segment = {
  key: string;
  label: string;
  amount: number;
  share: number;
  color: string;
  icon: string | null;
};

export function CategoryDonut({
  categories,
  totalExpense,
}: {
  categories: CategoryShare[];
  totalExpense: number;
}) {
  if (totalExpense <= 0 || categories.length === 0) {
    return <p className="text-sm text-muted">אין הוצאות בחודש הזה.</p>;
  }

  const unclassified = categories.find((c) => c.slug === null) ?? null;
  const regular = categories.filter((c) => c.slug !== null);
  const shown = regular.slice(0, MAX_SLICES);
  const rest = regular.slice(MAX_SLICES);
  const restShare = rest.reduce((s, c) => s + c.share, 0);
  const restAmount = rest.reduce((s, c) => s + c.total, 0);

  const segments: Segment[] = shown.map((c) => {
    const slot = categorySlot(topLevelSlug(c.slug as string));
    return {
      key: c.slug as string,
      label: c.name,
      amount: c.total,
      share: c.share,
      color: SLOT_VAR[slot],
      icon: categoryIcon(topLevelSlug(c.slug as string)),
    };
  });

  if (restAmount > 0) {
    segments.push({
      key: "__other__",
      label: "אחר",
      amount: restAmount,
      share: restShare,
      color: "var(--muted)",
      icon: "dots",
    });
  }

  if (unclassified) {
    segments.push({
      key: "__unclassified__",
      label: "לא מסווג",
      amount: unclassified.total,
      share: unclassified.share,
      color: "var(--warn)",
      icon: null,
    });
  }

  let offset = 0;
  const arcs = segments.map((seg) => {
    const raw = (seg.share / 100) * CIRC;
    const visible = Math.max(0, raw - GAP);
    const dashoffset = -offset;
    offset += raw;
    return { ...seg, dasharray: `${visible} ${CIRC - visible}`, dashoffset };
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--grid)" strokeWidth={STROKE} />
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            {arcs.map((a) => (
              <circle
                key={a.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth={STROKE}
                strokeDasharray={a.dasharray}
                strokeDashoffset={a.dashoffset}
                strokeLinecap="butt"
              />
            ))}
          </g>
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] text-muted">סה״כ הוצאות</span>
          <span className="text-lg font-semibold tabular-nums text-ink">{formatILS(totalExpense)}</span>
        </div>
      </div>

      <ul className="w-full min-w-0 space-y-2">
        {arcs.map((a) => (
          <li key={a.key} className="flex items-center gap-2 text-sm">
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: `color-mix(in srgb, ${a.color} 16%, transparent)`, color: a.color }}
            >
              <CategoryIcon icon={a.icon} />
            </span>
            <span className="min-w-0 flex-1 truncate text-ink">{a.label}</span>
            <span className="shrink-0 tabular-nums text-ink-2">{formatILS(a.amount)}</span>
            <span className="w-10 shrink-0 text-end text-xs tabular-nums text-muted">{a.share}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────── שלוש הקטגוריות היקרות ───────────────────

export type CategoryMover = { slug: string | null; delta: number; deltaPct: number | null };

/**
 * שלושת הקטגוריות היקרות ביותר, כעמודות בתוך פס אחד רציף — לצד הדונאט,
 * לא במקומו.
 *
 * ‏`facts.categories` כבר ממוינת מהיקרה לזולה (spend.ts, byTotal), אז
 * "שלוש היקרות" הוא slice(0,3) על מה שאינו "לא מסווג" — לא דירוג חדש.
 * אותו `categorySlot`/`categoryIcon` כמו בדונאט ובלג'נד, כדי שאותה
 * קטגוריה תמיד תיראה אותו דבר בכל מקום במסך הזה.
 *
 * << סבב שלישי: המשתמש שלח קטע חתוך מהמוקאפ המקורי בדיוק על האזור
 *    הזה וביקש התאמה מדויקת, כולל אותם אייקונים. שם זה לא שלושה
 *    כרטיסים נפרדים עם רווח ביניהם — זה פס כהה רציף אחד עם קווי-הפרדה
 *    דקים, ובכל עמודה: תג עיגול מלא בצבע הקטגוריה (לא מסגרת/רקע שקוף
 *    כמו בסבב הקודם), שם ממורכז, סכום גדול, ושורת פרטים קטנה מתחתיו.
 *    אין שם אריח "בולט" יותר מהשאר — ה"emphasis" היחיד במוקאפ שמור
 *    לאריח ה-KPI העליון (`StatTiles`/"נטו"), לא לשלוש הקטגוריות; לכן
 *    תג "הכי גדולה" והזוהר מהסבב הקודם ירדו — שלושתן שוות במשקל כאן,
 *    בדיוק כמו במוקאפ. האייקונים עצמם עודכנו במקור (`tree.ts`) כדי
 *    לתאום את המוקאפ: מפתח לדיור, סכו״ם למזון — לא רק כאן.
 */
export function TopCategoryTiles({
  categories,
  movers = [],
}: {
  categories: CategoryShare[];
  movers?: readonly CategoryMover[];
}) {
  const top = categories.filter((c) => c.slug !== null).slice(0, 3);
  if (top.length === 0) return null;

  const moverBySlug = new Map(movers.map((m) => [m.slug, m]));

  return (
    <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-2xl border border-border bg-surface">
      {top.map((c) => {
        const slot = categorySlot(topLevelSlug(c.slug as string));
        const color = SLOT_VAR[slot];
        const mover = moverBySlug.get(c.slug);

        return (
          <div key={c.slug} className="flex flex-col items-center gap-1 p-4 text-center">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg text-white"
              style={{ backgroundColor: color }}
            >
              <CategoryIcon icon={categoryIcon(topLevelSlug(c.slug as string))} />
            </span>

            <p className="mt-1 max-w-full truncate text-xs text-muted">{c.name}</p>

            <p className="text-xl font-semibold tabular-nums text-ink">{formatILS(c.total)}</p>

            <p className="text-[11px] tabular-nums text-muted">
              {c.share}% מההוצאה
              {mover && mover.deltaPct !== null ? (
                <span className={mover.delta > 0 ? "text-critical" : "text-good"}>
                  {" · "}
                  {mover.delta > 0 ? "▲" : "▼"} {Math.abs(mover.deltaPct)}%
                </span>
              ) : null}
            </p>
          </div>
        );
      })}
    </div>
  );
}
