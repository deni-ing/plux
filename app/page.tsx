/**
 * דף הבית של Plux — מרכז השליטה המאוחד.
 *
 * ─── למה זה כבר לא "שלושה דברים בעמודה" ───
 *
 * הגרסה הקודמת של הדף הזה (עדיין באותה רוח: "לא תפריט, לא ארבעה
 * כפתורים") הציגה שלושה דברים ברצף אנכי — הוצאות, ממתין להכרעה,
 * ניווט. זה עדיין נכון, אבל התברר שזה לא מספיק: המשתמש מגיע לכאן כדי
 * לדעת "איפה אני עומד", וזה יותר משאלה אחת. יתרת בנק, תחזית סוף חודש,
 * והתקדמות ליעד חיסכון הן שלוש תשובות לאותה שאלה שהיו קבורות בעמודים
 * נפרדים — ומרכז שליטה הוא בדיוק המקום שמאחד אותן בלי שהמשתמש יצטרך
 * ללחוץ בין ארבעה מסכים כדי לקבל תמונה אחת.
 *
 * ‏**מה לא נבנה, ולמה** (שתי החלטות היקף מכוונות, לא שכחה):
 *
 *   1. אין כאן טאבים של שבוע/3 חודשים/שנה. האנליטיקה כרגע חודשית
 *      בלבד — טאב מושבת עם עיגול-פס-אמצע נראה כמו תקלה, לא כמו
 *      "עוד לא". כשהאנליטיקה תתמוך בטווחים אחרים, זה ייפתח כאן.
 *
 *   2. כרטיס היתרה נעלם לגמרי (לא "ריק", נעלם) כשאין חשבון בנק —
 *      ראו lib/accounts/store.ts: רק לאומי (BANK) מדווח יתרה, ו-MAX
 *      אף פעם לא. משתמש עם MAX בלבד לא אמור לראות כרטיס שמסביר
 *      לעצמו למה הוא ריק.
 *
 * ‏**המלצות (lib/recommendations) הן ניסוח, לא מקור מידע רביעי** — ראו
 * ההערה הארוכה ב-lib/recommendations/engine.ts. "בטל את המנוי לחדר
 * הכושר" לא כלול בכוונה: אין נתון לשימוש בפועל, ראו סעיף 5.4 הישן.
 *
 * Server Component בלבד, כמו כל שאר המסך. `AskBox` הוא רכיב הלקוח
 * היחיד בדף הזה — ורק כי יש לו ניווט תלוי-קלט.
 */

import Link from "next/link";

import { currentUserId, withCurrentUser } from "../lib/db/session";
import { factsFor, latestPeriod } from "../lib/analytics/facts";
import { pendingByMerchant } from "../lib/txns/browse";
import { bankBalance, upcomingCharges } from "../lib/accounts/store";
import { avgMonthlyNet, listGoals } from "../lib/savings/store";
import { assessRealism, goalStatus } from "../lib/savings/engine";
import { loadRecommendations } from "../lib/recommendations/store";
import { fetchMarketQuotes } from "../lib/market";
import { Nav } from "../components/nav";
import { AskBox } from "../components/home/ask-box";
import { MarketTickerRow } from "../components/home/market-ticker";
import {
  BalanceCard,
  ForecastCard,
  PendingBanner,
  PlanCard,
  SpendSnapshotCard,
  UpcomingChargesCard,
} from "../components/home/parts";

export const dynamic = "force-dynamic";

export default async function Home() {
  const userId = await currentUserId();
  // << בלי userId, בלי RLS, בלי withCurrentUser — טיקרי השוק לא נתון
  //    של אף משתמש, אז הם נשלפים פעם אחת כאן ומופיעים בכל שלושת מצבי
  //    הדף (לא מחובר / אין נתונים / דשבורד מלא) באותה צורה בדיוק.
  const quotes = await fetchMarketQuotes();

  // << לא redirect ל-sign-in: דף הבית הוא גם הדף שרואים לפני התחברות,
  //    וה-layout כבר מציג את כפתורי Clerk בכותרת.
  if (!userId) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <MarketTickerRow quotes={quotes} />
        <h1 className="mt-4 text-3xl font-semibold text-ink">Plux</h1>
        <p className="mt-3 max-w-md text-lg text-ink-2">
          דוחות הבנק והאשראי שלך, מפוענחים ומסווגים — בלי לחבר את החשבון לאף אחד.
        </p>
        <p className="mt-6 text-sm text-muted">התחבר כדי להתחיל.</p>
      </main>
    );
  }

  // << מ-26.08: נקרא כאן, פעם אחת, ולא בכל מקום שצריך "עכשיו" בנפרד —
  //    ראו ההערה המלאה ב-lib/accounts/store.ts:bankBalance.
  const asOf = new Date();

  const data = await withCurrentUser(async (db) => {
    const period = await latestPeriod(db, userId);
    if (!period) return null;
    // << לא Promise.all: כל הקריאות כאן חולקות אותו חיבור יחיד (הטרנזקציה
    //    של withUser, ראו lib/db/client.ts) — "מקביליות" כאן הייתה אשליה
    //    בלבד, pg ריצף אותן בכל מקרה על אותו client, וזו בדיוק התבנית
    //    שמסומנת כ-deprecated ב-pg (client.query() נוסף לפני שהקודם הסתיים,
    //    ראו אזהרת הקונסולה). await ברצף לא מאבד ביצועים בפועל.
    const result = await factsFor(db, userId, period);
    const pending = await pendingByMerchant(db, userId, 100);
    const balance = await bankBalance(db, userId, asOf);
    const upcoming = await upcomingCharges(db, userId, asOf);
    const goals = await listGoals(db, userId);
    const net = await avgMonthlyNet(db, userId);
    const recommendations = await loadRecommendations(db, userId);
    return { period, facts: result?.facts ?? null, pending, balance, upcoming, goals, net, recommendations };
  });

  if (!data || !data.facts) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <Nav current="/" />
        <MarketTickerRow quotes={quotes} />
        <h1 className="mt-4 text-2xl font-semibold text-ink">אין עדיין נתונים</h1>
        <p className="mt-2 text-sm text-ink-2">
          העלה דוח אשראי של MAX או דף חשבון של לאומי, והדוח ייבנה מעצמו.
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

  const { facts, pending, balance, upcoming, goals, net, recommendations } = data;
  const pendingTotal = pending.reduce((s, p) => s + p.total, 0);

  // << היעד המוצג הוא הראשון לפי targetAt (listGoals כבר ממיין כך):
  //    התוכנית הבודדת שהכי קרובה בזמן. `asOf` עצמו נקרא למעלה, לפני
  //    withCurrentUser — ראו ההערה שם.
  const primaryGoal = goals[0] ?? null;
  const primaryStatus = primaryGoal ? goalStatus(primaryGoal, asOf) : null;
  const primaryRealism = primaryStatus ? assessRealism(primaryStatus.requiredMonthly, net) : null;

  const showForecast = facts.forecast !== null && facts.forecast.daysRemaining > 0;

  // << ניסיון ראשון היה 3 עמודות כש-3 כרטיסים מוצגים — נכשל בפועל:
  //    כל כרטיס מכיל בעצמו תת-גריד של 3 מספרים (הכנסות/הוצאות/נטו,
  //    רצפה/צפוי/תקרה), וברוחב מסך אמיתי (לא ה-1040px של קנבס העיצוב)
  //    זה לא השאיר מקום למספרים – הם התחילו לחפוף. התיקון הנכון:
  //    נשארים על 2 עמודות קבועות (הרוחב שכל כרטיס תוכנן אליו), וכרטיס
  //    "יחיד" בשורה האחרונה (כשיש 1 או 3 כרטיסים, לא 2) מקבל
  //    col-span-2 כדי למלא את השורה במקום להשאיר חצי ריק.
  const summaryCards = [
    balance ? <BalanceCard key="balance" summary={balance} /> : null,
    <SpendSnapshotCard
      key="spend"
      income={facts.totals.income}
      expense={facts.totals.expense}
      net={facts.totals.net}
      periodLabel={facts.period.label}
      partial={facts.period.partial}
      lastDataAt={facts.period.lastDataAt}
    />,
    showForecast && facts.forecast ? <ForecastCard key="forecast" forecast={facts.forecast} /> : null,
  ].filter(Boolean);

  const lastIsAlone = summaryCards.length % 2 === 1;

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Nav current="/" />
      <div className="mt-4">
        <AskBox />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {summaryCards.map((card, i) =>
          lastIsAlone && i === summaryCards.length - 1 ? (
            <div key={`span-${i}`} className="sm:col-span-2">
              {card}
            </div>
          ) : (
            card
          )
        )}
      </div>

      {/* << מתחת לתחזית, מעל התוכנית — בין "איפה אני עומד" (הכרטיסים
          למעלה) ל"מה עושים עם זה" (התוכנית למטה), לא לפני שום דבר. */}
      <div className="mt-4">
        <MarketTickerRow quotes={quotes} />
      </div>

      <div className="mt-4">
        <PlanCard
          goal={primaryGoal}
          status={primaryStatus}
          realism={primaryRealism}
          recommendations={recommendations}
        />
      </div>

      {/* << מ-26.08: תנועות עם תאריך חיוב פרטני (חו״ל/מט״ח) לא נכנסות
          לשום דוח הוצאות יותר — ראו lib/analytics/load.ts. בלי הכרטיס
          הזה הן פשוט ייעלמו מהתצוגה עד שיחויבו, וזה בדיוק מה שהמשתמש
          ביקש שלא יקרה: "אני רוצה שהאפליקציה גם תראה את זה". */}
      {upcoming.length > 0 ? (
        <div className="mt-4">
          <UpcomingChargesCard charges={upcoming} />
        </div>
      ) : null}

      {/* << הפעולה לפני הקישורים. אם יש משהו להכריע, זה הדבר היחיד
          שהמסך הזה צריך לבקש. */}
      <div className="mt-4">
        <PendingBanner count={pending.length} total={pendingTotal} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link
          href="/dashboard"
          className="rounded-xl border border-border px-4 py-2 text-ink hover:bg-wash"
        >
          לדוח המלא
        </Link>
        <Link
          href="/import"
          className="rounded-xl border border-border px-4 py-2 text-ink hover:bg-wash"
        >
          ייבוא קובץ
        </Link>
      </div>
    </main>
  );
}
