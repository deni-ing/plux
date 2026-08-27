/**
 * יוצר משתמש Clerk אמיתי למשתמש הדגמה. משימה 9.2, שלב 1.
 *
 *   npx tsx scripts/create-demo-user.mts
 *
 * ─── למה משתמש Clerk אמיתי, ולא רק שורת User במסד ───
 *
 * scripts/seed-demo.mts (9.1) יוצר נתונים תחת userId שרירותי — זה
 * עובד כי withUser לא באמת בודק מול Clerk, רק מגדיר app.current_user_id
 * בטרנזקציה. אבל "היכנס כדמו" בממשק הוא כניסה אמיתית: אחרי הלחיצה
 * צריך session אמיתי של Clerk (auth().userId בכל route/page), אחרת כל
 * שאר האפליקציה — dashboard, chat, transactions — לא תדע שהמשתמש
 * "מחובר". לכן אין כאן שום עקיפה של Clerk: המשתמש הזה הוא משתמש Clerk
 * לכל דבר, רק שאף אחד לא יודע את הסיסמה שלו כי אין לו סיסמה בכלל —
 * הכניסה היחידה שתעבוד היא sign-in token חד-פעמי (ראו app/api/demo-login).
 *
 * ─── אידמפוטנטי ───
 *
 * מריצים את זה פעם אחת ולא זוכרים אם כבר רץ. בודק לפי אימייל לפני
 * שיוצר — הרצה חוזרת מדפיסה את אותו id ולא יוצרת כפילות.
 */

import "dotenv/config";
import { clerkClient } from "@clerk/nextjs/server";

const DEMO_EMAIL = "demo@plux.local";

async function main() {
  const client = await clerkClient();

  const existing = await client.users.getUserList({ emailAddress: [DEMO_EMAIL] });
  if (existing.data.length > 0) {
    const user = existing.data[0];
    console.log(`[create-demo-user] כבר קיים: ${user.id}`);
    printNextSteps(user.id);
    return;
  }

  const user = await client.users.createUser({
    emailAddress: [DEMO_EMAIL],
    firstName: "משתמש",
    lastName: "הדגמה",
    // << אין סיסמה בכלל — הכניסה היחידה היא sign-in token חד-פעמי
    //    שנוצר מהשרת (app/api/demo-login), לא התחברות רגילה.
    skipPasswordRequirement: true,
  });

  console.log(`[create-demo-user] נוצר: ${user.id}`);
  printNextSteps(user.id);
}

function printNextSteps(userId: string) {
  console.log("");
  console.log("שני צעדים נשארו:");
  console.log(`  1. הוסף ל-.env:  DEMO_USER_ID=${userId}`);
  console.log(
    `  2. הרץ:  $env:PLUX_DIRECT_DB=1; npx tsx scripts/seed-demo.mts --user ${userId} --reset`
  );
}

main()
  .catch((err) => {
    console.error("[create-demo-user] נכשל:", err);
    process.exitCode = 1;
  });
