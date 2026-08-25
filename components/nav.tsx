/**
 * ניווט בין המסכים.
 *
 * << רכיב ולא חלק מה-layout: ה-layout שלך מחזיק את Clerk ואת הכותרת,
 *    ואני לא רוצה לגעת בו. הניווט מוזרק לכל דף בשורה אחת, ואם תרצה
 *    להעביר אותו ל-header אחר כך זו העברה של שורה.
 *
 *    << נוסף "שיחה" בסעיף 7.3 — קישור חמישי, לא שינוי מבנה.
 *    << נוסף "יעדי חיסכון" בשלב 8 — קישור שישי, אותו עיקרון.
 *    << נוסף "תקציב" (Budget) — קישור שביעי.
 *    << מסד העיצוב: black/[0.06] הגולמי הוחלף בטוקנים (bg-accent/10,
 *       text-accent, bg-wash) מ-globals.css. הפעיל עכשיו נבדל בצבע
 *       המותג, לא רק באטימות — קל יותר לזהות "איפה אני" במבט חטוף.
 *    << קישור /chat שונה מ"שיחה" ל-"Pluxer" — זה שם הבוט, לא רק תיאור
 *       כללי של המסך. ה-route עצמו (/chat) לא השתנה, רק התווית.
 */

import Link from "next/link";

const LINKS = [
  { href: "/", label: "בית" },
  { href: "/dashboard", label: "דוח חודשי" },
  { href: "/transactions", label: "תנועות" },
  { href: "/chat", label: "Pluxer" },
  { href: "/savings", label: "יעדי חיסכון" },
  { href: "/budget", label: "תקציב" },
  { href: "/import", label: "ייבוא" },
];

export function Nav({ current }: { current: string }) {
  return (
    <nav className="mb-6 flex flex-wrap gap-1 text-sm">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            l.href === current
              ? "rounded-lg bg-accent/10 px-3 py-1.5 font-medium text-accent"
              : "rounded-lg px-3 py-1.5 text-ink-2/80 hover:bg-wash hover:text-ink"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
