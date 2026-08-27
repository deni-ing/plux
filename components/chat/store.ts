"use client";

/**
 * מצב הצ'אט — סינגלטון ברמת המודול, לא state של רכיב. סעיף 7.3 (המשך).
 *
 * << מ-27.08, החלטת משתמש: שאלה שנשלחת ואז יוצאים מהמסך (ניווט צד-לקוח
 *    של Next.js, בלי רענון מלא) לא אמורה להיעצר. הבעיה בגרסה הקודמת
 *    של ChatScreen: ה-fetch וקריאת ה-stream רצו בתוך useState של
 *    הרכיב עצמו — קיים רק כל עוד הרכיב מחובר. ב-unmount, setState הפכה
 *    ל-no-op (React 18 לא זורק, פשוט מתעלמת), ואיתה גם ה-useEffect
 *    ששמר ל-sessionStorage הפסיק לרוץ. ה-fetch עצמו המשיך לרוץ ברקע —
 *    זה JS רגיל, לא קשור ל-React — אבל אף אחד לא הקשיב לתוצאה ואף אחד
 *    לא שמר אותה. כשהמשתמש חוזר ל-/chat, הרכיב עולה מחדש עם state ריק,
 *    והתשובה שהתקבלה בינתיים אבודה.
 *
 * הפתרון: send()/state/persist עברו לכאן, לרמת המודול — לא ל-hook
 * שתלוי במחזור החיים של רכיב. ChatScreen נרשם אליהם עם
 * useSyncExternalStore (React). ניווט צד-לקוח לא מאפס מודולים, אז
 * ה-state (וה-fetch שרץ בתוכו) שורדים יציאה וחזרה. sessionStorage
 * עדיין קיים בנוסף, לרענון מלא (F5) שכן מאפס state של מודול.
 *
 * << מ-27.08, המשך: "מתנקה לבד כשסוגרים טאב" (ההנחה המקורית על
 *    sessionStorage) התבררה כלא אמינה מספיק — שחזור טאבים/session של
 *    הדפדפן יכול לשמר sessionStorage גם אחרי "סגירה". לכן בסוף הקובץ
 *    יש גם ניקוי מפורש ב-`pagehide`, לא רק הסתמכות על מתי הדפדפן מוחק
 *    את האחסון מעצמו. ראו ההערה שם.
 */

export type Msg = { role: "user" | "assistant"; content: string };

type State = {
  messages: Msg[];
  busy: boolean;
  error: string | null;
};

const STORAGE_KEY = "plux-chat-history";

/** << reference קבוע אחד — גם לברירת המחדל וגם ל-getServerSnapshot,
 *     כדי ש-useSyncExternalStore לא יראה "שינוי" בלי שינוי אמיתי. */
const EMPTY_STATE: State = { messages: [], busy: false, error: null };

let state: State = EMPTY_STATE;
let hydrated = false;
let inFlight = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state.messages));
  } catch {
    // << sessionStorage חסום (מצב פרטי בחלק מהדפדפנים) — לא קורס, פשוט לא נשמר.
  }
}

/** קריאה חד-פעמית מ-sessionStorage, בקריאה הראשונה בלבד ל-getSnapshot. */
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      state = { ...state, messages: parsed as Msg[] };
    }
  } catch {
    // << JSON פגום — נשאר עם ברירת המחדל, לא קורס.
  }
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getSnapshot(): State {
  hydrate();
  return state;
}

/** לשרת (SSR) ולרינדור הראשון בזמן hydration — בלי sessionStorage. */
export function getServerSnapshot(): State {
  return EMPTY_STATE;
}

/**
 * האם text היא כבר השאלה האחרונה שנשאלה בפועל.
 *
 * << מונע כפילות ב-initialQuery: אם המשתמש חוזר עם כפתור "אחורה" של
 *    הדפדפן ל-`/chat?q=...` עם אותה שאלה שכבר נשלחה (ולא רק ניווט רגיל
 *    דרך התפריט, שחוזר ל-`/chat` בלי query), ה-effect במסך לא ישלח
 *    אותה שוב.
 */
export function wasLastAsked(text: string): boolean {
  const trimmed = text.trim();
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i];
    if (m.role === "user") return m.content === trimmed;
  }
  return false;
}

export async function send(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || inFlight) return;
  inFlight = true;

  const history: Msg[] = [...state.messages, { role: "user", content: trimmed }];
  // << בועת תשובה ריקה נוספת מיד — ה-stream ימלא אותה בהדרגה. בלי זה
  //    המשתמש רואה מסך דומם עד שהמילה הראשונה מגיעה.
  state = { messages: [...history, { role: "assistant", content: "" }], busy: true, error: null };
  persist();
  notify();

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
      const next = [...state.messages];
      next[next.length - 1] = { role: "assistant", content: acc };
      state = { ...state, messages: next };
      persist();
      notify();
    }
  } catch (err) {
    // << מוריד את בועת ה"..." הריקה — עדיף שלא תישאר תלויה בלי תשובה.
    state = {
      ...state,
      messages: state.messages.slice(0, -1),
      error: err instanceof Error ? err.message : "שגיאה לא צפויה.",
    };
    persist();
  } finally {
    inFlight = false;
    state = { ...state, busy: false };
    notify();
  }
}

export function clearChat(): void {
  state = EMPTY_STATE;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // << כנ"ל.
  }
  notify();
}

/**
 * << מ-27.08, החלטת משתמש: "בכל פעם שסוגרים את האפליקציה, שזה ילחץ על
 *    נקה שיחה". המשתמש בדק וגילה ש-sessionStorage לבדו לא הספיק —
 *    ב"יציאה וכניסה" מסוימת השיחה נשארה, כנראה שחזור טאבים של הדפדפן
 *    (Chrome/Firefox משחזרים sessionStorage כשפותחים מחדש טאב שנסגר,
 *    או בשחזור session אחרי קריסה/סגירה — לא רק "מתנקה כשסוגרים").
 *    אז במקום לסמוך על מתי sessionStorage *נמחק* מעצמו, מנקים באופן
 *    מפורש ברגע שהדף עוזב.
 *
 *    `pagehide` ולא `beforeunload`: לא חוסם bfcache, ואמין יותר
 *    במובייל (iOS Safari לא תמיד יורה beforeunload). לא יורה בניווט
 *    צד-לקוח בתוך האתר (/ → /chat) — שם המסמך לא נעזב באמת, רק
 *    ב-navigate אמיתי: סגירת טאב/דפדפן, מעבר לכתובת אחרת, או F5.
 *    כן, גם F5 עכשיו מנקה — זו הרחבה מכוונת של "סוגרים", לא רק
 *    "סוגרים טאב ספציפית".
 *
 *    רשום פעם אחת בטעינת המודול (לא ב-effect של ChatScreen): המודול
 *    הזה כבר סינגלטון ברמת דף שלם, לא רכיב, אז זה נטען פעם אחת לכל
 *    חיי הטאב ונשאר רשום גם אם המשתמש עבר למסך אחר לגמרי (בית,
 *    דשבורד) לפני שסגר בפועל.
 */
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    clearChat();
  });
}
