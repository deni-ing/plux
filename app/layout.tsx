import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  ClerkProvider,
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
          לבדיקה מחדש. Tailwind גוזר מכאן את ms-* ו-me-*.
          הערה: Geist לא כולל עברית, ולכן טקסט עברי ייפול לפונט המערכת.
          בחירת פונט עברי היא משימה 6.5 ולא חוסמת כלום עכשיו. */}
      <html
        lang="he"
        dir="rtl"
        className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          {/* סרגל זמני. תפקידו היחיד כרגע הוא לתת סימן ויזואלי שההתחברות
              עובדת — במיוחד אחרי הדיפלוי, כשצריך לדעת אם הצינור שלם. */}
          <header className="flex items-center justify-between border-b border-black/10 px-6 py-3 dark:border-white/10">
            <span className="font-semibold">Plux</span>
            <div className="flex items-center gap-3">
              {/* Core 3 החליף את <SignedIn> ו-<SignedOut> ברכיב אחד:
                  <Show when="..."/>. אותה התנהגות, ממשק אחד במקום שניים —
                  ואותו רכיב מטפל גם בהרשאות, למשל when={{ role: "admin" }}. */}
              <Show when="signed-out">
                <SignInButton mode="modal">
                  <button className="rounded-md px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/10">
                    התחברות
                  </button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <button className="rounded-md bg-foreground px-3 py-1.5 text-sm text-background">
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
