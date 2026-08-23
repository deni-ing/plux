/**
 * הדשבורד. סעיף 6.1.
 *
 * ─── שלוש החלטות ───
 *
 * **1. Server Component. אין `use client`, אין `useEffect`, אין fetch.**
 * הדף קורא את העובדות בצד השרת ומחזיר HTML. אין רגע שבו המשתמש רואה
 * שלד ריק, ואין מסלול שני שבו הנתונים מגיעים.
 *
 * **2. הדף לא מחשב.** כל מספר כאן מגיע מ-`SnapshotFacts`. אילו הדף היה
 * מסכם קטגוריות בעצמו, הייתה נוצרת גרסה שנייה של האמת — והיא הייתה
 * מתפצלת מהראשונה ברגע שאחת מהן משתנה. **מה שהוכח ב-140 טסטים לא
 * צריך להיכתב שוב ב-JSX.**
 *
 * **3. הגישה למסד עוברת ב-`withCurrentUser`.** אותה פונקציה שכבר קיימת,
 * שמוציאה את ה-userId מ-Clerk ופותחת טרנזקציה עם ה-RLS. הדף לא מכיר
 * את Prisma ולא את `set_config`.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import { currentUserId, withCurrentUser } from "../../lib/db/session";
import {
  availableMonths,
  factsFor,
  latestPeriod,
  parseMonthKey,
} from "../../lib/analytics/facts";
import {
  Categories,
  Fees,
  Forecast,
  Movers,
  Notice,
  PeriodHeader,
  Recurring,
  Totals,
} from "../../components/dashboard/parts";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/sign-in");

  const { month } = await searchParams;

  const data = await withCurrentUser(async (db) => {
    // << החודש הנבחר נגזר מהנתונים ולא מהשעון. `new Date()` על נתונים
    //    היסטוריים כמעט תמיד מצביע על חודש ריק.
    const period = parseMonthKey(month) ?? (await latestPeriod(db, userId));
    if (!period) return null;

    const [result, months] = await Promise.all([
      factsFor(db, userId, period),
      availableMonths(db, userId),
    ]);
    return { period, result, months };
  });

  if (!data || !data.result) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">אין עדיין נתונים</h1>
        <p className="mt-2 text-sm opacity-70">
          כדי לראות דוח צריך לייבא דף חשבון או דוח אשראי.
        </p>
        <Link
          href="/import"
          className="mt-6 inline-block rounded-xl border border-black/20 px-4 py-2 text-sm hover:bg-black/[0.03] dark:border-white/20 dark:hover:bg-white/[0.04]"
        >
          לייבוא קבצים
        </Link>
      </main>
    );
  }

  const { facts, source } = data.result;
  const { months, period } = data;

  const idx = months.indexOf(period.key);
  const newer = idx > 0 ? months[idx - 1] : null;
  const older = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      {/* << הניווט הוא קישורים, לא state. החודש חי ב-URL — כלומר הדף
          נשאר Server Component, והכתובת ניתנת לרענון ולשיתוף. */}
      <nav className="mb-4 flex items-center justify-between gap-3 text-sm">
        <MonthLink to={older} label="חודש קודם" />
        <details className="relative">
          <summary className="cursor-pointer list-none opacity-60 hover:opacity-100">
            כל החודשים
          </summary>
          <ul className="absolute z-10 mt-2 max-h-64 w-40 overflow-auto rounded-xl border border-black/10 bg-white p-1 shadow-lg dark:border-white/10 dark:bg-neutral-900">
            {months.map((k) => (
              <li key={k}>
                <Link
                  href={`/dashboard?month=${k}`}
                  className={`block rounded-lg px-2 py-1 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] ${k === period.key ? "font-medium" : "opacity-70"}`}
                >
                  {k}
                </Link>
              </li>
            ))}
          </ul>
        </details>
        <MonthLink to={newer} label="חודש הבא" />
      </nav>

      <PeriodHeader facts={facts} />

      {source === "computed" ? (
        <Notice tone="info">
          המספרים חושבו עכשיו ולא נקראו מסנפשוט שמור. התוצאה זהה — רק איטית יותר.
        </Notice>
      ) : null}

      <Totals facts={facts} />
      <Forecast facts={facts} />
      <Categories facts={facts} />
      <Movers facts={facts} />
      <Recurring facts={facts} />
      <Fees facts={facts} />

      <p className="mt-6 text-center text-xs opacity-50">
        <Link href="/import" className="underline">
          ייבוא קבצים
        </Link>
      </p>
    </main>
  );
}

function MonthLink({ to, label }: { to: string | null; label: string }) {
  if (!to) return <span className="opacity-30">{label}</span>;
  return (
    <Link href={`/dashboard?month=${to}`} className="underline underline-offset-4 opacity-80 hover:opacity-100">
      {label}
    </Link>
  );
}
