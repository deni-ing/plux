"use server";

/**
 * הפעולות של מסך התקציב. אותה מוסכמה כמו app/savings/actions.ts.
 */

import { revalidatePath } from "next/cache";

import { currentUserId, withCurrentUser } from "../../lib/db/session";
import { toAgorot, type Agorot } from "../../lib/analytics/money";
import { deleteBudget, setBudget } from "../../lib/budget/store";
import { isKnownSlug } from "../../lib/categories/tree";

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

export async function setBudgetAction(formData: FormData): Promise<void> {
  const slug = String(formData.get("slug") ?? "").trim();
  const monthlyCap = parseAmount(formData.get("monthlyCap"));
  if (!slug || !isKnownSlug(slug) || !monthlyCap) return;

  const userId = await currentUserId();
  if (!userId) return;

  await withCurrentUser((db) => setBudget(db, userId, { categorySlug: slug, monthlyCap }));
  revalidatePath("/budget");
}

export async function deleteBudgetAction(formData: FormData): Promise<void> {
  const budgetId = String(formData.get("budgetId") ?? "");
  if (!budgetId) return;

  const userId = await currentUserId();
  if (!userId) return;

  await withCurrentUser((db) => deleteBudget(db, userId, budgetId));
  revalidatePath("/budget");
}
