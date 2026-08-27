<div dir="rtl">

# Plux — תיעוד API

עדכון אחרון: 27.08.2026 (משימה 9.4)

חמישה HTTP endpoints בכל הפרויקט (`app/api/*/route.ts`) — לא הוגדל
מלאכותית כדי שיהיה "מה לתעד". כל טיפוס כאן הוא **טיפוס TypeScript
אמיתי מהקוד עצמו**, לא סכמת Zod נפרדת: בפרויקט הזה אין שכבת סכמה
נפרדת שיכולה להתפצל מהמימוש בפועל — הבדיקות (`isValidHistory` וכו')
כתובות ידנית ב-route, וה-request/response types מיוצאים מה-lib
הרלוונטי. המסמך הזה נכתב על ידי קריאת ה-route-ים עצמם, לא מתוך תיעוד
ישן שיכול לסטות מהמימוש.

אין `middleware.ts` בפרויקט — כל route בודק הרשאה בעצמו (החלטה מתועדת
ב-`docs/plux-explain.md`). "מחייב session" למטה פירושו: הקריאה עוברת
דרך Clerk (`auth()`/`currentUserId()`), ומחזירה `401` בלי session תקף.

---

## `POST /api/chat`

צ'אט עם Pluxer. **מזרים טקסט** (`Content-Type: text/plain`) — לא JSON
אחד בסוף. שגיאות שידועות מראש (לא מחובר, גוף בקשה לא תקין) חוזרות
כ-JSON עם קוד סטטוס רגיל *לפני* שהזרם נפתח; שגיאה שקורית תוך כדי
הזרימה נכתבת כטקסט חופשי *לתוך* הזרם עצמו, כי אי אפשר יותר לשנות קוד
סטטוס אחרי שהוא נפתח.

מחייב session.

```ts
// בקשה
type ChatRequest = {
  messages: ChatMessage[]; // 1–40 הודעות
};
type ChatMessage = {
  role: "user" | "assistant";
  content: string; // 1–4000 תווים
};

// תשובה מוצלחת: 200, גוף מוזרם כטקסט חופשי (לא JSON)
// Content-Type: text/plain; charset=utf-8

// שגיאה שנתפסה לפני פתיחת הזרם: JSON רגיל
type ChatError = { error: string };
// 401 — לא מחובר
// 400 — גוף לא JSON תקין / messages לא תקין / יותר מ-40 הודעות

// שגיאה תוך כדי הזרם: לא קוד סטטוס — הזרם ממשיך עם 200,
// והטקסט "\n\n[השירות לא זמין כרגע. נסה שוב בעוד רגע.]" מצורף לתוכו.
```

## `POST /api/imports`

קליטת דוח בנק/אשראי (`multipart/form-data`) — פענוח, שמירת הקובץ
הגולמי, וכתיבת התנועות תחת בידוד משתמש. תומך בכמה קבצים בבקשה אחת;
כל קובץ מטופל בנפרד ומדווח בנפרד (קובץ אחד יכול להיכשל בלי שהאחרים
ייכשלו).

מחייב session. גודל קובץ מקסימלי: 10MB.

```ts
// בקשה: multipart/form-data, שדה "files" — קובץ אחד או יותר

// תשובה: 200 תמיד (הצלחה/כישלון מדווחים per-file בתוך results)
type ImportsResponse = { results: ImportResult[] };

type ImportResult =
  | {
      file: string;
      ok: true;
      provider: string; // "max" | "leumi" | ... — ראו lib/parsers
      account: string; // תווית תצוגה, למשל "max בהצדעה"
      period: string | null; // תקופת הדוח כפי שזוהתה מהקובץ
      importJobId: string;
      accountId: string;
      rowsParsed: number;
      rowsInserted: number;
      rowsDuplicate: number;
      reconciled: boolean;
      classified?: number; // כמה תנועות סווגו אוטומטית בעקבות הייבוא
      warnings: string[];
      checks: Check[]; // בדיקות עקביות (למשל סכום דוח מול סכום תנועות)
    }
  | { file: string; ok: false; error: string };

type Check = { label: string; expected: string; actual: string; ok: boolean };

// שגיאות ברמת כל הבקשה (לא per-file):
// 401 — לא מחובר
// 400 — לא multipart/form-data, או "files" ריק
// 503 — סנכרון המשתמש מול Clerk נכשל (תשתית) — שום קובץ לא נקלט
```

## `GET /api/summary`

הסיכום החודשי שכותב Pluxer (טקסט חופשי, לא נתונים מובנים) — עם קאש:
נכתב פעם אחת לכל תקופה ב-`MonthlySummary`, לא מחדש בכל בקשה.

מחייב session.

```
GET /api/summary?month=YYYY-MM   // month אופציונלי — בלי זה, התקופה האחרונה עם נתונים
```

```ts
// תשובה מוצלחת: 200
type SummaryResponse = { summary: string; month: string }; // month בפורמט YYYY-MM

// שגיאה: 401 / 404 / 502
type SummaryError = { error: string };
// 401 — לא מחובר
// 404 — אין עדיין נתונים בכלל, או אין נתונים לחודש המבוקש
// 502 — קריאה ל-Claude נכשלה (השירות לא זמין)
```

## `POST /api/demo-login`

מייצר sign-in token חד-פעמי אצל Clerk למשתמש הדמו ומפנה להשלמת
הכניסה. **לא endpoint לשימוש כללי** — קיים אך ורק בשביל כפתור "היכנס
כדמו" בדף הבית, ותלוי במשתנה הסביבה `DEMO_USER_ID`. תמיד `POST` (לא
`GET`) בכוונה: לא רוצים שניווט/prefetch/בוט יפעילו יצירת token בטעות.

לא מחייב session (זו נקודת הכניסה עצמה).

```ts
// אין גוף בקשה נדרש.

// תשובה: תמיד 303 redirect, אף פעם לא JSON.
// הצלחה  → Location: /accept-token?token=<חד-פעמי, בתוקף 5 דקות>
// כישלון → Location: /  (DEMO_USER_ID לא מוגדר, או שגיאת Clerk — נרשם ל-console בצד השרת)
```

## `GET /api/cron/purge-statements`

משימה מתוזמנת (Vercel Cron, יומי — ראו `vercel.json`) שמוחקת קבצי דוח
גולמיים בני יותר מ-30 יום מהאחסון. **התנועות המפוענחות לא נמחקות** —
רק הקובץ המקורי (שיכול להכיל מספר תעודת זהות/חשבון מלא).

לא מחייב session — מחייב header ייעודי במקום:

```ts
// Header נדרש: Authorization: Bearer <CRON_SECRET>

// תשובה מוצלחת: 200
type PurgeResponse = {
  cutoff: string; // ISO date — כל job שהתחיל לפני זה הוא מועמד
  candidates: number; // כמה נמצאו
  removed: number; // כמה נמחקו בהצלחה
  failed: number; // כמה נכשלו (יתפסו שוב בהרצה הבאה)
};

// שגיאה:
// 500 — CRON_SECRET לא מוגדר בסביבה (תקלת קונפיגורציה, לא קלט)
// 401 — ה-header לא תואם
```

## `GET /api/cron/keepalive`

משימה מתוזמנת (Vercel Cron, יומי — ראו `vercel.json`) ששולחת שאילתת
`SELECT 1` מינימלית למסד. Supabase בתוכנית החינמית משהה (pauses)
פרויקט אחרי כשבוע בלי שאילתות — cron יומי מונע מזה לקרות בין ביקורים
בפורטפוליו.

לא מחייב session — מחייב header ייעודי, אותו `CRON_SECRET` כמו
`purge-statements`:

```ts
// Header נדרש: Authorization: Bearer <CRON_SECRET>

// תשובה מוצלחת: 200
type KeepaliveResponse = {
  ok: true;
  tookMs: number;
  at: string; // ISO datetime
};

// שגיאה:
// 500 — CRON_SECRET לא מוגדר בסביבה
// 401 — ה-header לא תואם
// 502 — השאילתה עצמה נכשלה (המסד לא זמין)
```

</div>
