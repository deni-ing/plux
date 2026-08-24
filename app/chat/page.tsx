/**
 * מסך הצ'אט. סעיף 7.3.
 *
 * דף עטיפה בלבד: בודק התחברות בצד השרת (כמו כל מסך אחר), ומוסר את
 * הבקרה לרכיב הלקוח היחיד שבאמת צריך state — `ChatScreen`. ה-route
 * עצמו (`/api/chat`) עושה את בדיקת ההתחברות שוב, כי בקשת fetch יכולה
 * להגיע גם בלי לעבור דרך הדף הזה.
 */

import { redirect } from "next/navigation";

import { currentUserId } from "../../lib/db/session";
import { Nav } from "../../components/nav";
import { ChatScreen } from "../../components/chat/screen";

export const dynamic = "force-dynamic";

export default async function ChatPage() {
  const userId = await currentUserId();
  if (!userId) redirect("/sign-in");

  return (
    <main className="mx-auto w-full max-w-2xl p-6">
      <Nav current="/chat" />
      <h1 className="text-2xl font-semibold">שיחה</h1>
      <div className="mt-4">
        <ChatScreen />
      </div>
    </main>
  );
}
