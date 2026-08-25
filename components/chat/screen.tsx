/**
 * גוף הצ'אט. סעיף 7.3.
 *
 * ‏"use client" בכוונה — זה הרכיב היחיד בפרויקט שממתין לזרם שמגיע
 * תוך כדי ריצה ומעדכן מסך בלי רענון. כל שאר המסכים (דשבורד, תנועות,
 * בית) הם Server Components כי הנתונים שלהם שלמים ברגע הרינדור; כאן
 * זה בדיוק ההפך — התשובה לא קיימת עדיין כשה-fetch יוצא, וזו הסיבה
 * שהיא בכלל שווה סטרימינג.
 *
 * ההיסטוריה חיה ב-state של הדפדפן בלבד — לא נשמרת בשום מקום. שאלה
 * חדשה שולחת את כל השיחה עד כה ל-`/api/chat`, וה-route בונה מחדש כל
 * פעם. פשוט, ולא הצטבר לו עדיין סיבה טובה יותר מזה.
 *
 * << `initialQuery`: נוסף עבור תיבת השאלה במסך הבית המאוחד. `/chat?q=`
 *    מעביר טקסט חופשי, וכאן הוא נשלח פעם אחת אוטומטית בעליית הרכיב —
 *    לא state נוסף, רק הפעלה יחידה של אותו send() שכבר קיים. sentRef
 *    (ולא busy) מונע כפילות ב-Strict Mode של React, שמריץ effects
 *    פעמיים ב-dev: בדיקת busy הייתה נכשלת כי הריצה השנייה קורית לפני
 *    שהראשונה הספיקה לעדכן state.
 *
 * << עדכון עיצובי: black/[0.06] ודומיו הוחלפו בטוקנים (bg-wash,
 *    border-border, text-critical) — אותו מסד עיצוב שכבר חל על
 *    Nav/BudgetAlert/TopCategoryTiles. כפתור השליחה עבר ל-accent מלא
 *    (היה מתאר בלבד), כמו הכפתורים הראשיים בטפסים שעודכנו איתו.
 */

"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

export function ChatScreen({ initialQuery }: { initialQuery?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // << `busy` (state) לא מספיק כדי לחסום שליחה כפולה: עדכון state לא
  //    מיושם על ה-DOM/הסגירה הבאה באופן סינכרוני, אז יש חלון קצר שבו
  //    Enter+Enter (או קליק+קליק) מהיר קורא ל-send() פעמיים לפני
  //    שהכפתור/השדה בכלל הופכים ל-disabled. שני send() חופפים דורכים
  //    אחד על ה-state של השני (וגם היו שולחים לשרת שתי בקשות עם אותה
  //    היסטוריה). ref מתעדכן מיידית וסינכרונית — לא ממתין לרינדור —
  //    אז הבדיקה השנייה תמיד רואה את השינוי מהראשונה.
  const busyRef = useRef(false);
  const sentInitialRef = useRef(false);

  async function send(overrideText?: string) {
    const text = (overrideText ?? input).trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;

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
      busyRef.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initialQuery && initialQuery.trim() && !sentInitialRef.current) {
      sentInitialRef.current = true;
      void send(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <p className="text-sm text-muted">
        שאל/י על ההוצאות שלך — הכול מבוסס על הנתונים שכבר יובאו, לא על ניחוש.
      </p>

      <div className="mt-4 space-y-3">
        {messages.length === 0 ? (
          <p className="rounded-xl border border-border p-4 text-sm text-muted">
            למשל: &quot;כמה הוצאתי החודש על אוכל?&quot; או &quot;מה השתנה לעומת החודש שעבר?&quot;
          </p>
        ) : null}

        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "me-auto max-w-[85%] rounded-xl bg-wash px-4 py-2.5 text-sm text-ink"
                : "ms-auto max-w-[85%] rounded-xl border border-border px-4 py-2.5 text-sm text-ink leading-relaxed"
            }
          >
            {m.content || (busy && i === messages.length - 1 ? "…" : "")}
          </div>
        ))}
      </div>

      {error ? <p className="mt-3 text-sm text-critical">{error}</p> : null}

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
          className="flex-1 rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-ink"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-strong disabled:opacity-40"
        >
          שלח
        </button>
      </form>
    </div>
  );
}
