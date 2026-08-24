/**
 * מסך התנועות. סעיף 6.2.
 *
 * הוא מחליף שני סקריפטים שהשתמשנו בהם כל היום החמישי — `txns.mts`
 * לצפייה ו-`decide.mts` לתיקון — ומחבר אותם למקום אחד.
 *
 * << הסדר על המסך אינו כרונולוגי אלא לפי ערך: הלא־מסווגים בראש,
 *    ממוינים לפי סכום. **מסך שמסדר לפי תאריך מבקש מהמשתמש להשקיע את
 *    תשומת הלב שלו במקום שבו אין החלטה לקבל.**
 */

import { redirect } from "next/navigation";

import { currentUserId, withCurrentUser } from "../../lib/db/session";
import { browse, pendingByMerchant } from "../../lib/txns/browse";
import { PendingList, TxnRow } from "../../components/transactions/parts";
import { Nav } from "../../components/nav";

export const dynamic = "force-dynamic";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; q?: string; slug?: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/sign-in");

  const { month, q, slug } = await searchParams;

  const { pending, rows } = await withCurrentUser(async (db) => ({
    pending: await pendingByMerchant(db, userId),
    rows: await browse(db, userId, { month, q, slug, limit: 120 }),
  }));

  // כמה תנועות יושפעו מסיווג של אותו בית עסק. נספר מתוך מה שנטען,
  // ולכן זו הערכת מינימום — מסומן ככזה בכפתור רק כשהמספר גדול מאחד.
  const perMerchant = new Map<string, number>();
  for (const r of rows) perMerchant.set(r.merchant, (perMerchant.get(r.merchant) ?? 0) + 1);

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Nav current="/transactions" />
      <h1 className="text-2xl font-semibold">תנועות</h1>

      {/* << חיפוש כטופס GET: המסנן חי בכתובת. אפשר לרענן, לשתף, ולחזור
          אחורה — וזה נשאר Server Component. */}
      <form className="mt-4 flex flex-wrap gap-2" action="/transactions">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="שם בית עסק"
          className="min-w-40 flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20"
        />
        <input
          type="text"
          name="month"
          defaultValue={month ?? ""}
          placeholder="2026-08"
          inputMode="numeric"
          className="w-28 rounded-lg border border-black/15 bg-transparent px-3 py-1.5 text-sm dark:border-white/20"
        />
        <button
          type="submit"
          className="rounded-lg border border-black/20 px-3 py-1.5 text-sm hover:bg-black/[0.04] dark:border-white/20 dark:hover:bg-white/[0.06]"
        >
          סינון
        </button>
      </form>

      {/* << זה החלק שבשבילו המסך קיים. הוא ראשון, והוא צהוב. */}
      <section className="mt-6 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-medium">ממתין להכרעה</h2>
          <span className="text-xs opacity-60">לפי סכום, לא לפי כמות</span>
        </div>
        <PendingList items={pending} />
      </section>

      <section className="mt-6 rounded-xl border border-black/10 p-4 dark:border-white/10">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="font-medium">כל התנועות</h2>
          <span className="text-xs opacity-60">{rows.length} שורות</span>
        </div>

        {rows.length === 0 ? (
          <p className="mt-3 text-sm opacity-70">אין תנועות שמתאימות לסינון.</p>
        ) : (
          <ul className="mt-2">
            {rows.map((r) => (
              <TxnRow key={r.id} row={r} affects={perMerchant.get(r.merchant) ?? 1} />
            ))}
          </ul>
        )}

        {rows.length >= 120 ? (
          <p className="mt-3 text-xs opacity-50">
            מוצגות 120 השורות האחרונות. צמצם עם סינון כדי לראות אחרות.
          </p>
        ) : null}
      </section>
    </main>
  );
}
