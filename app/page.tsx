/**
 * דף הבית של Plux.
 *
 * מחליף את דף ברירת המחדל של `create-next-app`.
 *
 * ─── מה דף בית צריך לעשות ───
 *
 * לא תפריט. **דף בית שהוא רק ארבעה כפתורים מבקש מהמשתמש להחליט לאן
 * ללכת לפני שנתן לו סיבה** — והוא מחזיק את כל המידע הדרוש כדי לענות
 * על השאלה בעצמו.
 *
 * לכן הוא מציג שלושה דברים, ובסדר הזה:
 *
 *   1. כמה יצא בחודש האחרון — התשובה לשאלה שבגללה נכנסים.
 *   2. מה ממתין להכרעה — הפעולה היחידה שיש בה ערך מיידי.
 *   3. לאן להמשיך.
 *
 * ואם אין נתונים בכלל, הוא מציג דבר אחד: לאן להעלות קובץ.
 */

import Link from "next/link";

import { currentUserId, withCurrentUser } from "../lib/db/session";
import { factsFor, latestPeriod } from "../lib/analytics/facts";
import { pendingByMerchant } from "../lib/txns/browse";
import { formatILS } from "../lib/analytics/money";
import { Nav } from "../components/nav";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await currentUserId();

  // << לא redirect ל-sign-in: דף הבית הוא גם הדף שרואים לפני התחברות,
  //    וה-layout כבר מציג את כפתורי Clerk בכותרת.
  if (!userId) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <h1 className="text-3xl font-semibold">Plux</h1>
        <p className="mt-3 max-w-md text-lg opacity-70">
          דוחות הבנק והאשראי שלך, מפוענחים ומסווגים — בלי לחבר את החשבון לאף אחד.
        </p>
        <p className="mt-6 text-sm opacity-60">התחבר כדי להתחיל.</p>
      </main>
    );
  }

  const data = await withCurrentUser(async (db) => {
    const period = await latestPeriod(db, userId);
    if (!period) return null;
    const [result, pending] = await Promise.all([
      factsFor(db, userId, period),
      pendingByMerchant(db, userId, 100),
    ]);
    return { period, facts: result?.facts ?? null, pending };
  });

  if (!data || !data.facts) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <Nav current="/" />
        <h1 className="text-2xl font-semibold">אין עדיין נתונים</h1>
        <p className="mt-2 text-sm opacity-70">
          העלה דוח אשראי של MAX או דף חשבון של לאומי, והדוח ייבנה מעצמו.
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

  const { facts, pending } = data;
  const pendingTotal = pending.reduce((s, p) => s + p.total, 0);

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Nav current="/" />

      <h1 className="text-2xl font-semibold">{facts.period.label}</h1>
      {facts.period.partial ? (
        <p className="mt-1 text-sm text-amber-600">
          חודש חלקי — נתונים עד {facts.period.lastDataAt}
        </p>
      ) : null}

      <dl className="mt-6 grid grid-cols-3 gap-3 text-center">
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <dt className="text-xs opacity-60">הוצאות</dt>
          <dd className="mt-1 text-xl font-medium tabular-nums">
            {formatILS(facts.totals.expense)}
          </dd>
        </div>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <dt className="text-xs opacity-60">הכנסות</dt>
          <dd className="mt-1 text-xl font-medium tabular-nums">
            {formatILS(facts.totals.income)}
          </dd>
        </div>
        <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
          <dt className="text-xs opacity-60">נטו</dt>
          <dd
            className={`mt-1 text-xl font-medium tabular-nums ${facts.totals.net < 0 ? "text-red-600" : ""}`}
          >
            {formatILS(facts.totals.net)}
          </dd>
        </div>
      </dl>

      {/* << הפעולה לפני הקישורים. אם יש משהו להכריע, זה הדבר היחיד
          שהמסך הזה צריך לבקש. */}
      {pending.length > 0 ? (
        <Link
          href="/transactions"
          className="mt-4 block rounded-xl bg-amber-500/10 p-4 text-sm hover:bg-amber-500/[0.16]"
        >
          <b className="text-amber-700 dark:text-amber-400">
            {pending.length} בתי עסק ממתינים להכרעה
          </b>
          <span className="ms-2 opacity-70">{formatILS(pendingTotal)} לא מסווגים</span>
          <p className="mt-1 text-xs opacity-60">
            סיווג אחד מחיל את עצמו על כל ההיסטוריה ועל כל ייבוא עתידי.
          </p>
        </Link>
      ) : (
        <p className="mt-4 rounded-xl bg-emerald-500/[0.08] p-4 text-sm text-emerald-700 dark:text-emerald-400">
          כל התנועות מסווגות.
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link
          href="/dashboard"
          className="rounded-xl border border-black/20 px-4 py-2 hover:bg-black/[0.03] dark:border-white/20 dark:hover:bg-white/[0.04]"
        >
          לדוח המלא
        </Link>
        <Link
          href="/import"
          className="rounded-xl border border-black/20 px-4 py-2 hover:bg-black/[0.03] dark:border-white/20 dark:hover:bg-white/[0.04]"
        >
          ייבוא קובץ
        </Link>
      </div>
    </main>
  );
}
