"use client";

/**
 * משלים כניסה מ-sign-in token. משימה 9.2, שלב 3.
 *
 * הקישור היחיד שמוביל לכאן הוא app/api/demo-login/route.ts — אין דרך
 * להגיע לעמוד הזה בלי token תקף, וה-token עצמו חד-פעמי ותקף דקה אחת
 * (ראו ההערה שם). זה בדיוק הדפוס המתועד של Clerk ל"קישור התחברות
 * מוטמע" (embedded sign-in link) — לא משהו שהומצא כאן.
 *
 * << signIn.ticket ולא signIn.create({strategy:"ticket"}): הפרויקט על
 *    Clerk "Core 3" (ראו ההערה על <Show> ב-app/layout.tsx), וזו הצורה
 *    העדכנית של אותו ה-API.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSignIn, useUser } from "@clerk/nextjs";

export default function AcceptTokenPage() {
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useSignIn();
  const { isSignedIn } = useUser();
  const router = useRouter();
  const token = useSearchParams().get("token");

  useEffect(() => {
    if (!token || !signIn || isSignedIn) return;

    let cancelled = false;

    (async () => {
      try {
        const { error: ticketError } = await signIn.ticket({ ticket: token });
        if (cancelled) return;
        if (ticketError) {
          setError("קישור הכניסה פג תוקף. נסה שוב ממסך הבית.");
          return;
        }
        if (signIn.status === "complete") {
          await signIn.finalize({
            navigate: async ({ decorateUrl }) => {
              const url = decorateUrl("/");
              router.push(url.startsWith("http") ? url : url);
            },
          });
        } else {
          setError("לא הצלחנו להשלים את הכניסה. נסה שוב ממסך הבית.");
        }
      } catch {
        if (!cancelled) setError("לא הצלחנו להשלים את הכניסה. נסה שוב ממסך הבית.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, signIn, isSignedIn, router]);

  useEffect(() => {
    if (isSignedIn) router.push("/");
  }, [isSignedIn, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      {!token ? (
        <p className="text-sm text-muted">אין קישור כניסה. חזור למסך הבית.</p>
      ) : error ? (
        <p className="text-sm text-muted">{error}</p>
      ) : (
        <p className="text-sm text-ink-2">מתחבר כמשתמש הדגמה...</p>
      )}
    </main>
  );
}
