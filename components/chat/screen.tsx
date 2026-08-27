/**
 * גוף הצ'אט. סעיף 7.3.
 *
 * ‏"use client" בכוונה — זה הרכיב היחיד בפרויקט שממתין לזרם שמגיע
 * תוך כדי ריצה ומעדכן מסך בלי רענון. כל שאר המסכים (דשבורד, תנועות,
 * בית) הם Server Components כי הנתונים שלהם שלמים ברגע הרינדור; כאן
 * זה בדיוק ההפך — התשובה לא קיימת עדיין כשה-fetch יוצא, וזו הסיבה
 * שהיא בכלל שווה סטרימינג.
 *
 * << מ-27.08, החלטת משתמש: state השיחה (הודעות, busy, שגיאה) כבר לא
 *    חי כאן — הוא סינגלטון ברמת המודול ב-store.ts, כדי ששאלה שנשלחת
 *    תמשיך לרוץ ברקע גם אם יוצאים מהמסך (ניווט צד-לקוח, בלי רענון
 *    מלא) ותהיה מוכנה כשחוזרים, בלי לשאול שוב. הרכיב הזה רק *מציג*
 *    את ה-state הזה (useSyncExternalStore) ומחזיק state מקומי אחד
 *    ויחיד שבאמת שייך לו: `input`, טיוטת הטקסט שעוד לא נשלחה. ראו
 *    ההערה המלאה ב-store.ts על הבעיה שזה פותר.
 *
 * << `initialQuery`: נוסף עבור תיבת השאלה במסך הבית המאוחד. `/chat?q=`
 *    מעביר טקסט חופשי, וכאן הוא נשלח פעם אחת אוטומטית בעליית הרכיב.
 *    sentInitialRef מונע כפילות ב-Strict Mode (effects רצים פעמיים
 *    ב-dev). wasLastAsked (מ-store.ts) מונע כפילות אחרת: חזרה עם
 *    כפתור "אחורה" של הדפדפן ל-`/chat?q=` עם אותה שאלה שכבר נשלחה —
 *    מרכיב שעולה מחדש בלי לדעת שהשאלה הזו כבר בהיסטוריה.
 *
 * << עדכון עיצובי: black/[0.06] ודומיו הוחלפו בטוקנים (bg-wash,
 *    border-border, text-critical) — אותו מסד עיצוב שכבר חל על
 *    Nav/BudgetAlert/TopCategoryTiles. כפתור השליחה עבר ל-accent מלא
 *    (היה מתאר בלבד), כמו הכפתורים הראשיים בטפסים שעודכנו איתו.
 */

"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { clearChat, getServerSnapshot, getSnapshot, send, subscribe, wasLastAsked } from "./store";

export function ChatScreen({ initialQuery }: { initialQuery?: string }) {
  const { messages, busy, error } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [input, setInput] = useState("");
  const sentInitialRef = useRef(false);

  useEffect(() => {
    if (
      initialQuery &&
      initialQuery.trim() &&
      !sentInitialRef.current &&
      !wasLastAsked(initialQuery)
    ) {
      sentInitialRef.current = true;
      void send(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit() {
    const text = input;
    setInput("");
    void send(text);
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
          submit();
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
