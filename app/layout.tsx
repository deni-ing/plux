import type { Metadata } from "next";
import { Heebo } from "next/font/google";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";

/**
 * << Heebo במקום Geist: Geist לא כולל עברית ונפל לפונט מערכת (משימה
 *    6.5 המקורית). Heebo נבנה במיוחד לצמד עברית/לטינית, ומזוהה כפונט
 *    "רציני" בממשקים פיננסיים/ממשלתיים ישראליים — מתאים לטון שנבחר
 *    לפרויקט הזה. subsets כולל hebrew במפורש; בלי זה next/font טוען
 *    רק latin וטקסט עברי נופל חזרה לפונט מערכת בדיוק כמו קודם.
 */
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Plux",
  description: "ניהול הוצאות מדפי חשבון וכרטיסי אשראי",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // <ClerkProvider> חייב לעטוף את כל העץ, כי רכיבי הלקוח של Clerk
    // (UserButton, SignInButton) קוראים ממנו את מצב ההתחברות.
    <ClerkProvider>
      {/* dir="rtl" ו-lang="he": האפליקציה עברית מקצה לקצה, ועדיף לקבוע
          את זה עכשיו. שינוי כיוון אחרי שנבנו מסכים הופך כל margin ו-padding
          לבדיקה מחדש. Tailwind גוזר מכאן את ms-* ו-me-*. */}
      <html
        lang="he"
        dir="rtl"
        className={`${heebo.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col font-sans">
          {/* << header קבוע: לא רק "סימן שההתחברות עובדת" כמו קודם —
              עכשיו נושא את זהות המותג (סימן צבע המותג + wordmark) שחוזרת
              בכל מסך. bg-surface נבדל במכוון מ-bg-page של הגוף, כדי
              שהאפליקציה תרגיש כמו משטח מעל רקע ולא רצף שטוח אחד. */}
          <header className="flex items-center justify-between border-b border-border bg-surface px-6 py-3">
            <span className="flex items-center gap-2 text-[15px] font-extrabold tracking-tight text-ink">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-full bg-accent"
              />
              Plux
            </span>
            <div className="flex items-center gap-3">
              {/* Core 3 החליף את <SignedIn> ו-<SignedOut> ברכיב אחד:
                  <Show when="..."/>. אותה התנהגות, ממשק אחד במקום שניים —
                  ואותו רכיב מטפל גם בהרשאות, למשל when={{ role: "admin" }}. */}
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="rounded-md px-3 py-1.5 text-sm text-ink-2 hover:bg-wash hover:text-ink">
                    התחברות
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-strong">
                    הרשמה
                  </button>
                </SignUpButton>
              </Show>
              <Show when="signed-in">
                <UserButton />
              </Show>
            </div>
          </header>
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
}
