/**
 * גוף הצ'אט. סעיף 7.3.
 *
 * ‏`"use client"` בכוונה — זה הרכיב היחיד בפרויקט שממתין לזרם שמגיע
 * תוך כדי ריצה ומעדכן מסך בלי רענון. כל שאר המסכים (דשבורד, תנועות,
 * בית) הם Server Components כי הנתונים שלהם שלמים ברגע הרינדור; כאן
 * זה בדיוק ההפך — התשובה לא קיימת עדיין כשה-fetch יוצא, וזו הסיבה
 * שהיא בכלל שווה סטרימינג.
 *
 * ההיסטוריה חיה ב-state של הדפדפן בלבד — לא נשמרת בשום מקום. שאלה
 * חדשה שולחת את כל השיחה עד כה ל-`/api/chat`, וה-route בונה מחדש כל
 * פעם. פשוט, ולא הצטבר לו עדיין סיבה טובה יותר מזה.
 */

"use client";

import { useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatScreen() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;

    const history: Msg[] = [...messages, { role: "user", content: text }];
    setError(null);
    setInput("");
    // << בועת תשובה ריקה נוספת מיד — ה-stream ימלא אותה בהדרגה. בלי זה
    //    המשתמש רואה מסך דומם עד שהמילה הראשונה מגיעה.
    setMessages([...history, { role: "assistant", content: "" }]);
    setBusy(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "השירות לא זמין כרגע.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const soFar = acc;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: soFar };
          return next;
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה.");
      // << מוריד את בועת ה"..." הריקה — עדיף שלא תישאר תלויה בלי תשובה.
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm opacity-60">
        שאל/י על ההוצאות שלך — הכול מבוסס על הנתונים שכבר יובאו, לא על ניחוש.
      </p>

      <div className="mt-4 space-y-3">
        {messages.length === 0 ? (
          <p className="rounded-xl border border-black/10 p-4 text-sm opacity-60 dark:border-white/10">
            למשל: &quot;כמה הוצאתי החודש על אוכל?&quot; או &quot;מה השתנה לעומת החודש שעבר?&quot;
          </p>
        ) : null}

        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "me-auto max-w-[85%] rounded-xl bg-black/[0.06] px-4 py-2 text-sm dark:bg-white/[0.10]"
                : "ms-auto max-w-[85%] rounded-xl border border-black/10 px-4 py-2 text-sm dark:border-white/10"
            }
          >
            {m.content || (busy && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="שאל/י משהו..."
          disabled={busy}
          className="flex-1 rounded-lg border border-black/15 bg-transparent px-3 py-2 text-sm dark:border-white/20"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg border border-black/20 px-4 py-2 text-sm hover:bg-black/[0.04] disabled:opacity-40 dark:border-white/20 dark:hover:bg-white/[0.06]"
        >
          שלח
        </button>
      </form>
    </div>
  );
}
