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
 *    הדפדפן יכול לשמר sessionStorage גם אחרי "סגירה". ניסיון ראשון:
 *    ניקוי מפורש ב-`pagehide` — נזרק בגלל שהוא לא מבחין בין "המשתמש
 *    באמת עוזב" ל"המשתמש מרענן (F5)", אז רענון היה גם מוחק, וזה לא
 *    מה שהמשתמש רצה.
 *
 * << מ-27.08, הפתרון הסופי: ההבחנה בין רענון לפתיחה טרייה נעשית
 *    ב-*טעינה*, לא ב-*עזיבה* — כי רק שם יש דרך אמינה לדעת מה קרה.
 *    ה-Navigation Timing API (`performance.getEntriesByType("navigation")`)
 *    אומר לכל טעינת מסמך איך היא קרתה: `"reload"` (F5/כפתור רענון),
 *    לעומת `"navigate"`/`"back_forward"` (הקלדת כתובת, סימניה, טאב
 *    ששוחזר, כניסה מבחוץ). ניווט צד-לקוח בתוך האתר לא יוצר טעינת
 *    מסמך חדשה בכלל — אז זה לא נוגע בו, וה-state שכבר בזיכרון פשוט
 *    ממשיך כרגיל. ראו hydrate() למטה: `"reload"` משחזר מ-sessionStorage
 *    כרגיל; כל דבר אחר מנקה — זו בדיוק "פתיחה מחדש של האפליקציה".
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

/**
 * האם טעינת המסמך הנוכחית היא רענון (F5/כפתור רענון).
 *
 * << ברירת המחדל היא true (="זה רענון, תשמר את השיחה") כשה-API לא
 *    זמין מסיבה כלשהי — עדיף לשמר שיחה במקרה גבולי מאשר למחוק בטעות
 *    נתונים של המשתמש בגלל דפדפן ישן או iframe חסום.
 */
function isReloadNavigation(): boolean {
  if (typeof performance === "undefined" || !performance.getEntriesByType) return true;
  const [nav] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  return nav ? nav.type === "reload" : true;
}

/** קריאה חד-פעמית, בקריאה הראשונה בלבד ל-getSnapshot אחרי טעינת המסמך. */
function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;

  if (!isReloadNavigation()) {
    // << לא רענון — פתיחה טרייה של האפליקציה (טאב חדש, כתובת שהוקלדה,
    //    טאב ששוחזר, כניסה מבחוץ). לפי בקשת המשתמש: זו "סגירה ופתיחה"
    //    ומתחילים שיחה נקייה. מוחקים גם את מה ששרד ב-sessionStorage,
    //    אחרת הוא "יתפוס" בפעם הבאה שכן תהיה רענון.
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // << sessionStorage חסום — לא קורס.
    }
    return;
  }

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
