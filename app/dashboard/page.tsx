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
 *
 * << מסך העיצוב המחודש (טוקנים כחולים, StatTiles, BudgetAlert,
 *    CategoryDonut): חריגות תקציב נטענות כאן ולא רק ב-/budget — אותה
 *    listBudgets בדיוק, לא שאילתה מקבילה. facts נטען פעם אחת ומועבר
 *    לכל הרכיבים; budgetStatus (lib/budget/engine) הוא אותה פונקציה
 *    טהורה שכבר בודקת חריגה בדף התקציב עצמו.
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
import { listBudgets } from "../../lib/budget/store";
import { budgetStatus } from "../../lib/budget/engine";
import {
  BudgetAlert,
  Card,
  Categories,
  Fees,
  Forecast,
  Movers,
  Notice,
  PeriodHeader,
  Recurring,
  StatTiles,
  type BudgetOverage,
} from "../../components/dashboard/parts";
import { CategoryDonut, TopCategoryTiles } from "../../components/dashboard/category-donut";
import { SummaryCard } from "../../components/dashboard/summary-card";
import { Nav } from "../../components/nav";

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

    // << לא Promise.all — אותה סיבה כמו ב-app/page.tsx: שתי הקריאות חולקות
    //    את חיבור הטרנזקציה היחיד של withUser, אז "מקביליות" הייתה אשליה
    //    ו-pg מזהיר על התבנית הזו (client.query() לפני שהקודם הסתיים).
    const result = await factsFor(db, userId, period);
    const months = await availableMonths(db, userId);
    const budgets = result?.facts ? await listBudgets(db, userId, result.facts) : [];
    return { period, result, months, budgets };
  });

  if (!data || !data.result) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <Nav current="/dashboard" />
        <h1 className="text-2xl font-semibold text-ink">אין עדיין נתונים</h1>
        <p className="mt-2 text-sm text-ink-2">
          כדי לראות דוח צריך לייבא דף חשבון או דוח אשראי.
        </p>
        <Link
          href="/import"
          className="mt-6 inline-block rounded-xl border border-border px-4 py-2 text-sm text-ink hover:bg-wash"
        >
          לייבוא קבצים
        </Link>
      </main>
    );
  }

  const { facts, source } = data.result;
  const { months, period, budgets } = data;

  const idx = months.indexOf(period.key);
  const newer = idx > 0 ? months[idx - 1] : null;
  const older = idx >= 0 && idx < months.length - 1 ? months[idx + 1] : null;

  const overages: BudgetOverage[] = budgets
    .filter((b) => budgetStatus(b.spent, b.monthlyCap) === "over")
    .map((b) => ({ categoryName: b.categoryName, spent: b.spent, cap: b.monthlyCap }));

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Nav current="/dashboard" />

      {/* << הניווט הוא קישורים, לא state. החודש חי ב-URL — כלומר הדף
          נשאר Server Component, והכתובת ניתנת לרענון ולשיתוף. */}
      <nav className="mb-4 flex items-center justify-between gap-3 text-sm">
        <MonthLink to={older} label="חודש קודם" />
        <details className="relative">
          <summary className="cursor-pointer list-none text-muted hover:text-ink">
            כל החודשים
          </summary>
          <ul className="absolute z-10 mt-2 max-h-64 w-40 overflow-auto rounded-xl border border-border bg-surface p-1 shadow-lg">
            {months.map((k) => (
              <li key={k}>
                <Link
                  href={`/dashboard?month=${k}`}
                  className={`block rounded-lg px-2 py-1 hover:bg-wash ${k === period.key ? "font-medium text-ink" : "text-ink-2"}`}
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

      <SummaryCard month={period.key} />

      {source === "computed" ? (
        <Notice tone="info">
          המספרים חושבו עכשיו ולא נקראו מסנפשוט שמור. התוצאה זהה — רק איטית יותר.
        </Notice>
      ) : null}

      <StatTiles facts={facts} />
      <BudgetAlert overages={overages} />

      <Card title="התפלגות ההוצאות לפי קטגוריה">
        <div className="mt-3">
          <TopCategoryTiles categories={facts.categories} movers={facts.comparison?.movers ?? []} />
        </div>
        <div className="mt-4 border-t border-border pt-4">
          <CategoryDonut categories={facts.categories} totalExpense={facts.totals.expense} />
        </div>
      </Card>

      <Forecast facts={facts} />
      <Categories facts={facts} />
      <Movers facts={facts} />
      <Recurring facts={facts} />
      <Fees facts={facts} />
    </main>
  );
}

function MonthLink({ to, label }: { to: string | null; label: string }) {
  if (!to) return <span className="text-muted/50">{label}</span>;
  return (
    <Link href={`/dashboard?month=${to}`} className="text-ink-2 underline underline-offset-4 hover:text-ink">
      {label}
    </Link>
  );
}
