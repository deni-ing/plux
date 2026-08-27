"use client";

/**
 * כרטיס "סיכום Pluxer" בראש הדוח החודשי. משימה 7.5.
 *
 * ‏Client Component יחיד באי של Server Components (ראה התיעוד בראש
 * app/dashboard/page.tsx): שאר הדף לא נוגע ב-fetch כי כל המספרים כבר
 * מגיעים דרך `SnapshotFacts` בצד השרת. הכרטיס הזה שונה במפורש — הטקסט
 * שלו לא קיים בזמן טעינת הדף (יכול לדרוש קריאה ל-Claude בפעם הראשונה
 * לחודש), ואם הדף כולו ימתין לזה הוא יאט את כל שאר הדוח בשביל שלושה
 * משפטים. לכן: שאר הדשבורד נטען מיידית כמו היום, והכרטיס הזה מציג
 * שלד טעינה עד שהתשובה מוכנה.
 *
 * << כישלון (רשת, אין נתונים) לא מציג שגיאה בולטת — פשוט לא מציג את
 *    הכרטיס. זו תוספת, לא חלק מהדוח שהמשתמש בא בשבילו; היעלמות שקטה
 *    עדיפה על הודעת שגיאה שמסיטה תשומת לב מהמספרים האמיתיים.
 */

import { useEffect, useState } from "react";
import { Card } from "./parts";

type State =
  | { status: "loading" }
  | { status: "ready"; text: string }
  | { status: "hidden" };

export function SummaryCard({ month }: { month: string }) {
  // << אין setState({status:"loading"}) בגוף ה-effect: קריאה סינכרונית
  //    לו שם עלולה לגרום ל-render מדורג (react-hooks/set-state-in-effect).
  //    "loading" הוא כבר ערך ההתחלה של useState — ואיפוס אמיתי בין חודש
  //    לחודש קורה כי ההורה מעביר `key={month}` (app/dashboard/page.tsx),
  //    כלומר React ממחזר את הרכיב במקום שהאפקט יצטרך לאפס state ידנית.
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/summary?month=${encodeURIComponent(month)}`)
      .then(async (res) => {
        if (cancelled) return;
        const data = (await res.json().catch(() => null)) as { summary?: string } | null;
        if (!res.ok || !data?.summary) {
          setState({ status: "hidden" });
          return;
        }
        setState({ status: "ready", text: data.summary });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "hidden" });
      });

    return () => {
      cancelled = true;
    };
  }, [month]);

  if (state.status === "hidden") return null;

  return (
    <Card title="סיכום Pluxer">
      {state.status === "loading" ? (
        <div className="animate-pulse space-y-2" aria-hidden="true">
          <div className="h-3 w-full rounded bg-wash" />
          <div className="h-3 w-5/6 rounded bg-wash" />
          <div className="h-3 w-2/3 rounded bg-wash" />
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-ink-2">{state.text}</p>
      )}
    </Card>
  );
}
