/**
 * מסך הצ'אט. סעיף 7.3.
 *
 * דף עטיפה בלבד: בודק התחברות בצד השרת (כמו כל מסך אחר), ומוסר את
 * הבקרה לרכיב הלקוח היחיד שבאמת צריך state — `ChatScreen`. ה-route
 * עצמו (`/api/chat`) עושה את בדיקת ההתחברות שוב, כי בקשת fetch יכולה
 * להגיע גם בלי לעבור דרך הדף הזה.
 *
 * << `?q=`: תיבת השאלה במסך הבית המאוחד מפנה לכאן עם שאלה מוכנה
 *    ב-query string. searchParams הוא הדרך התקנית ב-Server Component
 *    לקרוא query — לא state, לא context.
 *
 * << הכותרת בעמוד עצמו היא "Pluxer", שם הבוט — לא "שיחה" הכללי
 *    (שנשאר רק בתווית הניווט של component/nav.tsx, גם היא עודכנה).
 */

import { redirect } from "next/navigation";

import { currentUserId } from "../../lib/db/session";
import { Nav } from "../../components/nav";
import { ChatScreen } from "../../components/chat/screen";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const userId = await currentUserId();
  if (!userId) redirect("/sign-in");

  const { q } = await searchParams;

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <Nav current="/chat" />
      <h1 className="text-2xl font-semibold">Pluxer</h1>
      <div className="mt-4">
        <ChatScreen initialQuery={q} />
      </div>
    </main>
  );
}
