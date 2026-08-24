"use server";

/**
 * הפעולות של מסך יעדי החיסכון. סעיף 8.1.
 *
 * אותה מוסכמה כמו app/transactions/actions.ts: Server Action ולא נתיב
 * API — הטופס קורא לפונקציה, והטיפוסים נבדקים בקומפילציה.
 */

import { revalidatePath } from "next/cache";

import { currentUserId, withCurrentUser } from "../../lib/db/session";
import { toAgorot, type Agorot } from "../../lib/analytics/money";
import { contribute, createGoal, deleteGoal } from "../../lib/savings/store";

const MAX_NAME_LEN = 80;

/**
 * קלט טופס → אגורות, או null אם לא חוקי. לא זורק: טופס עם קלט שגוי
 * פשוט לא כותב כלום, בדיוק כמו setCategoryAction על slug לא מוכר.
 */
function parseAmount(raw: FormDataEntryValue | null): Agorot | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  try {
    const a = toAgorot(s);
    return a > 0 ? a : null;
  } catch {
    return null;
  }
}

export async function createGoalAction(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim().slice(0, MAX_NAME_LEN);
  const target = parseAmount(formData.get("target"));
  const targetAtRaw = String(formData.get("targetAt") ?? "");
  const targetAt = targetAtRaw ? new Date(`${targetAtRaw}T00:00:00Z`) : null;

  if (!name || !target || !targetAt || Number.isNaN(targetAt.getTime())) return;

  const userId = await currentUserId();
  if (!userId) return;

  await withCurrentUser((db) => createGoal(db, userId, { name, target, targetAt }));
  revalidatePath("/savings");
}

export async function contributeAction(formData: FormData): Promise<void> {
  const goalId = String(formData.get("goalId") ?? "");
  const amount = parseAmount(formData.get("amount"));
  if (!goalId || !amount) return;

  const userId = await currentUserId();
  if (!userId) return;

  await withCurrentUser((db) => contribute(db, userId, goalId, amount));
  revalidatePath("/savings");
}

export async function deleteGoalAction(formData: FormData): Promise<void> {
  const goalId = String(formData.get("goalId") ?? "");
  if (!goalId) return;

  const userId = await currentUserId();
  if (!userId) return;

  await withCurrentUser((db) => deleteGoal(db, userId, goalId));
  revalidatePath("/savings");
}
