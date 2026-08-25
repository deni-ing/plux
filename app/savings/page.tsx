/**
 * מסך יעדי החיסכון. שלב 8.
 *
 * << 8.5, כלול כאן ולא כהערת שוליים: זו הכוונה כללית שנגזרת מהנתונים
 *    שלך, לא ייעוץ פיננסי. אותו כלל עיצוב כמו הדשבורד — "מה שחשוב
 *    לא נכתב למטה בגודל קטן" — חל גם על אזהרה משפטית, לא רק חשבונאית.
 *
 * Server Component בלבד. הריאליות (8.2) והצעדים המומלצים (8.4)
 * מחושבים פעם אחת ב-engine.ts ולא נחזרים כאן.
 */

import { redirect } from "next/navigation";

import { currentUserId, withCurrentUser } from "../../lib/db/session";
import { avgMonthlyNet, listGoals } from "../../lib/savings/store";
import { assessRealism, goalStatus, recommendSteps } from "../../lib/savings/engine";
import { GoalCard, NewGoalForm } from "../../components/savings/parts";
import { Notice } from "../../components/dashboard/parts";
import { Nav } from "../../components/nav";

export const dynamic = "force-dynamic";

export default async function SavingsPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/sign-in");

  const { goals, net } = await withCurrentUser(async (db) => ({
    goals: await listGoals(db, userId),
    net: await avgMonthlyNet(db, userId),
  }));

  // << "עכשיו" נקרא פעם אחת כאן — בגבול שבין הדף למנוע — ולא בתוך
  //    goalStatus עצמה. ראה ההערה ב-lib/savings/engine.ts.
  const asOf = new Date();

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Nav current="/savings" />
      <h1 className="text-2xl font-semibold">יעדי חיסכון</h1>

      <Notice tone="info">
        זו הכוונה כללית שנגזרת מהנתונים שלך בלבד — לא ייעוץ פיננסי. לפני
        החלטה משמעותית כדאי להיוועץ בגורם מוסמך.
      </Notice>

      {goals.length === 0 ? (
        <p className="mt-4 text-sm opacity-70">אין עדיין יעדי חיסכון.</p>
      ) : (
        goals.map((g) => {
          const status = goalStatus(g, asOf);
          const realism = assessRealism(status.requiredMonthly, net);
          const steps = recommendSteps(status, realism, net);
          return (
            <GoalCard key={g.id} goal={g} status={status} realism={realism} steps={steps} />
          );
        })
      )}

      <section className="mt-6 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <h2 className="font-medium">יעד חדש</h2>
        <NewGoalForm />
      </section>
    </main>
  );
}
