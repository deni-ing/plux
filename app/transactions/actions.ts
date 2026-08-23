"use server";

/**
 * הפעולות של מסך התנועות.
 *
 * ─── שלוש החלטות ───
 *
 * **1. Server Action ולא נתיב API.** אין `fetch`, אין `JSON.stringify`,
 * ואין טיפוס שצריך להתאים בשני צדדים. הטופס קורא לפונקציה, והטיפוסים
 * נבדקים בקומפילציה. **גבול שאין בו סריאליזציה ידנית הוא גבול שלא
 * מתפצל.**
 *
 * **2. אותה `setUserCategory` שמריץ הסקריפט.** לא כתיבה מקבילה למסד
 * מתוך הדף. אילו המסך היה כותב בעצמו, היינו מקבלים שתי דרכים לסווג —
 * אחת שיוצרת כלל ואחת שלא — והן היו נפרדות בשבוע הראשון.
 *
 * **3. סנפשוט מחושב מחדש מיד.** תיקון סיווג משנה את סך ההוצאות של כל
 * חודש שבו התנועה מופיעה. בלי חישוב מחדש הדשבורד היה מציג סנפשוט
 * **תקף אך ישן** — הצורה היחידה שבה מטמון יכול לשקר, והשקטה מכולן.
 */

import { revalidatePath } from "next/cache";

import { withCurrentUser, currentUserId } from "../../lib/db/session";
import { setUserCategory } from "../../lib/classify/user";
import { recomputeSnapshots } from "../../lib/analytics/recompute";
import { isKnownSlug } from "../../lib/categories/tree";

export type ActionResult = {
  ok: boolean;
  message: string;
};

export async function setCategoryAction(formData: FormData): Promise<void> {
  const merchant = String(formData.get("merchant") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();

  if (!merchant || !slug) return;
  // << אימות ה-slug כאן ולא רק ב-`setUserCategory`: ערך שמגיע מטופס
  //    הוא קלט מבחוץ, גם כשהטופס שלנו. הבדיקה בפנים היא הגנה שנייה,
  //    לא היחידה.
  if (!isKnownSlug(slug)) return;

  const userId = await currentUserId();
  if (!userId) return;

  await withCurrentUser((db) => setUserCategory(db, userId, { merchant, slug }));

  // << מחוץ לאותה טרנזקציה, כמו בייבוא: החישוב הוא תוצר של השינוי
  //    ולא תנאי להצלחתו. אם הוא נכשל, הסיווג עדיין נשמר.
  try {
    await withCurrentUser((db) => recomputeSnapshots(db, userId, { force: true }));
  } catch {
    // הדשבורד ייפול חזרה לחישוב חי. ראה lib/analytics/facts.ts
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}
