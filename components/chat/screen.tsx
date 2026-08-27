/**
 * גוף הצ'אט. סעיף 7.3.
 *
 * ‏"use client" בכוונה — זה הרכיב היחיד בפרויקט שממתין לזרם שמגיע
 * תוך כדי ריצה ומעדכן מסך בלי רענון. כל שאר המסכים (דשבורד, תנועות,
 * בית) הם Server Components כי הנתונים שלהם שלמים ברגע הרינדור; כאן
 * זה בדיוק ההפך — התשובה לא קיימת עדיין כשה-fetch יוצא, וזו הסיבה
 * שהיא בכלל שווה סטרימינג.
 *
 * ‏<< מ-27.08, החלטת משתמש: ההיסטוריה נשמרת ב-sessionStorage, לא רק
 *    ב-state. קודם ניווט (בית → צ'אט → בית → צ'אט) מחק את השיחה כי
 *    הרכיב מתפרק ב-unmount ו-state נעלם איתו. sessionStorage נבחר
 *    ולא localStorage בכוונה: הוא שורד ניווט בתוך האתר (לא סוגרים
 *    טאב), אבל מתנקה לבד כשבאמת סוגרים את הטאב/הדפדפן — בלי צורך
 *    בכפתור "נקה" בשביל המקרה הרגיל. כפתור "נקה שיחה" עדיין קיים,
 *    למי שרוצה להתחיל מחדש בלי לסגור טאב.
 *
 * שאלה חדשה עדיין שולחת את כל השיחה עד כה ל-`/api/chat`, וה-route
 * בונה מחדש כל פעם — sessionStorage לא משנה את זה, הוא רק שומר את
 * מה שכבר היה ב-state, לא מוזיל את עלות הבקשה עצמה (זה 7.4 - prompt
 * caching, נושא נפרד).
 *
 * << `initialQuery`: נוסף עבור תיבת השאלה במסך הבית המאוחד. `/chat?q=`
 *    מעביר טקסט חופשי, וכאן הוא נשלח פעם אחת אוטומטית בעליית הרכיב —
 *    לא state נוסף, רק הפעלה יחידה של אותו send() שכבר קיים. sentRef
 *    (ולא busy) מונע כפילות ב-Strict Mode של React, שמריץ effects
 *    פעמיים ב-dev: בדיקת busy הייתה נכשלת כי הריצה השנייה קורית לפני
 *    שהראשונה הספיקה לעדכן state. מ-27.08: השחזור מ-sessionStorage
 *    וה-send של initialQuery רצים באותו useEffect ולא בשניים נפרדים
 *    — שני effects עם תלות ריקה נפתחים באותו commit עם אותו closure
 *    של messages (עדיין []), אז effect שני שקורא ל-send() לא היה
 *    רואה את מה ש-effect ראשון שחזר. send() מקבל baseHistory מפורש
 *    כדי לא להסתמך על state שעוד לא התעדכן.
 *
 * << עדכון עיצובי: black/[0.06] ודומיו הוחלפו בטוקנים (bg-wash,
 *    border-border, text-critical) — אותו מסד עיצוב שכבר חל על
 *    Nav/BudgetAlert/TopCategoryTiles. כפתור השליחה עבר ל-accent מלא
 *    (היה מתאר בלבד), כמו הכפתורים הראשיים בטפסים שעודכנו איתו.
 */

"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

/** מפתח קבוע אחד ל-sessionStorage — שיחה אחת פעילה, לא רשימת שיחות. */
const STORAGE_KEY = "plux-chat-history";

function loadStoredMessages(): Msg[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Msg[]) : [];
  } catch {
    // << JSON פגום או sessionStorage חסום (מצב פרטי בחלק מהדפדפנים) —
    //    לא קורס, פשוט מתחיל משיחה ריקה כמו שהיה קודם.
    return [];
  }
}

export function ChatScreen({ initialQuery }: { initialQuery?: string }) {
  // << מתחיל תמיד מ-[]: קריאה מ-sessionStorage כבר כאן הייתה גורמת
  //    ל-hydration mismatch (השרת תמיד מרנדר [], כי sessionStorage לא
  //    קיים שם). השחזור בפועל קורה ב-useEffect למטה, אחרי ה-mount.
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

  async function send(overrideText?: string, baseHistory?: Msg[]) {
    const text = (overrideText ?? input).trim();
    if (!text || busyRef.current) return;
    busyRef.current = true;

    // << baseHistory קיים כדי שקריאת ה-send הראשונה (שחזור +
    //    initialQuery, ראו ה-useEffect למטה) תוכל להשתמש בהיסטוריה
    //    שזה עתה שוחזרה מ-sessionStorage בלי להמתין שהיא תתעדכן
    //    ב-state קודם — messages בסגירה הזו עדיין [] באותו רגע.
    const history: Msg[] = [...(baseHistory ?? messages), { role: "user", content: text }];
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

  // << effect אחד, לא שניים: שחזור מ-sessionStorage ושליחת
  //    initialQuery (אם יש) חייבים לקרות באותה ריצה כדי ש-send()
  //    יקבל את ההיסטוריה המשוחזרת כ-baseHistory — ראו ההערה למעלה
  //    על התיעוד של 27.08.
  useEffect(() => {
    const restored = loadStoredMessages();
    if (restored.length > 0) setMessages(restored);

    if (initialQuery && initialQuery.trim() && !sentInitialRef.current) {
      sentInitialRef.current = true;
      void send(initialQuery, restored);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // << כותב את ה-state ל-sessionStorage בכל שינוי, כולל כל טוקן
  //    שמגיע תוך כדי סטרימינג — לא throttled בכוונה: שיחה בודדת של
  //    משתמש יחיד, הכתיבה זולה, ולא שווה את המורכבות של debounce.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // << sessionStorage חסום (מצב פרטי) — לא קורס, פשוט לא נשמר.
    }
  }, [messages]);

  function clearChat() {
    setMessages([]);
    setError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // כנ"ל.
    }
  }

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

      {/* << מ-27.08: קטן ולא בולט בכוונה — למי שממש רוצה להתחיל שיחה
          חדשה בלי לסגור טאב. במקרה הרגיל sessionStorage מתנקה לבד. */}
      {messages.length > 0 ? (
        <button
          type="button"
          onClick={clearChat}
          disabled={busy}
          className="mt-2 text-xs text-muted underline underline-offset-2 hover:text-ink disabled:opacity-40"
        >
          נקה שיחה
        </button>
      ) : null}
    </div>
  );
}
