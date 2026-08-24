/**
 * ניווט בין המסכים.
 *
 * << רכיב ולא חלק מה-layout: ה-layout שלך מחזיק את Clerk ואת הכותרת,
 *    ואני לא רוצה לגעת בו. הניווט מוזרק לכל דף בשורה אחת, ואם תרצה
 *    להעביר אותו ל-header אחר כך זו העברה של שורה.
 *
 *    << נוסף "שיחה" בסעיף 7.3 — קישור חמישי, לא שינוי מבנה.
 *    << נוסף "יעדי חיסכון" בשלב 8 — קישור שישי, אותו עיקרון.
 */

import Link from "next/link";

const LINKS = [
  { href: "/", label: "בית" },
  { href: "/dashboard", label: "דוח חודשי" },
  { href: "/transactions", label: "תנועות" },
  { href: "/chat", label: "שיחה" },
  { href: "/savings", label: "יעדי חיסכון" },
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
              ? "rounded-lg bg-black/[0.06] px-3 py-1.5 font-medium dark:bg-white/[0.10]"
              : "rounded-lg px-3 py-1.5 opacity-60 hover:bg-black/[0.04] hover:opacity-100 dark:hover:bg-white/[0.06]"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
