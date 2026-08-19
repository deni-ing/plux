import { SignIn } from "@clerk/nextjs";

// התיקייה נקראת [[...sign-in]] — catch-all אופציונלי. Clerk מנתב שלבים
// פנימיים (אימות דו-שלבי, איפוס סיסמה) לתת-נתיבים תחת אותו עמוד.
export default function Page() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <SignIn />
    </main>
  );
}
