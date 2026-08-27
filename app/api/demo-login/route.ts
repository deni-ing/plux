/**
 * POST /api/demo-login. משימה 9.2, שלב 2.
 *
 * לא GET בכוונה: route שיוצר משהו (כאן — sign-in token חד-פעמי אצל
 * Clerk) לא אמור להיות נגיש בניווט רגיל/prefetch/בוט. הכפתור בדף
 * הבית הוא <form method="post">, לא קישור.
 *
 * ‏DEMO_USER_ID מגיע מ-env ולא קבוע בקוד: זה ה-id שהוחזר מ-
 * scripts/create-demo-user.mts, שונה בין סביבות (dev/prod, שני
 * חשבונות Clerk נפרדים).
 */

import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";

export async function POST(req: Request) {
  const userId = process.env.DEMO_USER_ID;
  if (!userId) {
    console.error("POST /api/demo-login: DEMO_USER_ID לא מוגדר ב-env");
    return NextResponse.redirect(new URL("/", req.url), { status: 303 });
  }

  try {
    const client = await clerkClient();
    // 5 דקות ולא דקה: בביקור "קר" ראשון (cold start בפרודקשן, טעינת
    // clerk.js) השרשרת בקשה->redirect->טעינת עמוד->ticket יכולה לחרוג
    // מדקה אחת בפועל (נצפה בפועל ב-Vercel) - עדיין קצר מספיק שקישור
    // שדלף/נשמר בהיסטוריה כבר לא תקף אחרי כמה דקות.
    const { token } = await client.signInTokens.createSignInToken({
      userId,
      expiresInSeconds: 300,
    });

    const url = new URL("/accept-token", req.url);
    url.searchParams.set("token", token);
    return NextResponse.redirect(url, { status: 303 });
  } catch (err) {
    console.error("POST /api/demo-login failed", err);
    return NextResponse.redirect(new URL("/", req.url), { status: 303 });
  }
}
