/**
 * Clerk middleware.
 *
 * שים לב לשם הקובץ: ב-Next.js 16 הקובץ הזה נקרא `proxy.ts` ולא `middleware.ts`.
 * אם תקרא לו בשם הישן — הוא פשוט לא ירוץ. בלי שגיאה, בלי אזהרה: כל בקשה
 * תיראה כאילו אף אחד לא מחובר, ו-auth() יחזיר userId ריק.
 *
 * clerkMiddleware() לבדו אינו מגן על שום נתיב — הוא רק מאפשר ל-auth() לעבוד.
 * ההגנה עצמה נעשית בכל route בנפרד, וזו הסיבה שהמסד לא סומך על השכבה הזו:
 * RLS ממשיך לאכוף גם אם ה-middleware יידרס בטעות.
 */

import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
