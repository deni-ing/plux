/**
 * מסך ההכרעה של המשתמש — בגרסת שורת פקודה.
 *
 *   npx tsx scripts/decide.mts --user <id>                                  # מה ממתין
 *   npx tsx scripts/decide.mts --user <id> --slugs                          # רשימת הקטגוריות
 *   npx tsx scripts/decide.mts --user <id> --merchant "הוראת קבע" --slug housing.rent
 *
 * זה החלק של שלב 4 שעובד בלי שום מודל, והוא גם זה שיישאר נכון גם כשיהיה
 * מודל: יש תנועות שהתשובה עליהן לא נמצאת בנתון, ורק בעל החשבון יודע אותה.
 *
 * כל הכרעה כזו נשמרת ככלל EXACT בעדיפות 10 — חזק מכל כלל מערכת — ולכן
 * היא נשאלת פעם אחת ומוחלת על כל ההיסטוריה וגם על כל ייבוא עתידי.
 *
 * << הסיבה שזה סקריפט ולא מסך: המסך יגיע. הסקריפט מאפשר לבדוק שהלוגיקה
 *    נכונה לפני שמשקיעים בממשק, ונשאר שימושי אחר כך לתיקונים בכמות.
 */

import "dotenv/config";
import { withUser } from "../lib/db/client";
import { setUserCategory, pendingDecisions } from "../lib/classify/user";
import { CATEGORY_TREE } from "../lib/categories/tree";

const G = "\x1b[32m", Y = "\x1b[33m", D = "\x1b[2m", O = "\x1b[0m";

const args = process.argv.slice(2);
const val = (flag: string) => {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1] ?? null;
};

const userId = val("--user");
const merchant = val("--merchant");
const slug = val("--slug");

if (!userId || userId.startsWith("--")) {
  console.error("חסר --user <clerk-user-id>");
  process.exit(1);
}

// ─────────── רשימת הקטגוריות ───────────

if (args.includes("--slugs")) {
  for (const group of CATEGORY_TREE) {
    console.log(`\n${D}── ${group.kind} ──${O}`);
    for (const cat of group.categories) {
      console.log(`${cat.slug.padEnd(12)} ${cat.name}`);
      for (const child of cat.children ?? []) {
        console.log(`  ${D}${child.slug.padEnd(26)}${O} ${child.name}`);
      }
    }
  }
  process.exit(0);
}

// ─────────── הכרעה ───────────

if (merchant && slug) {
  const res = await withUser(userId, (db) =>
    setUserCategory(db, userId, { merchant, slug })
  );
  console.log(`${G}נקבע${O}  ${res.merchant} → ${res.slug}`);
  console.log(`  ${res.rowsUpdated} תנועות עודכנו`);
  console.log(`  ${res.ruleCreated ? "נוצר כלל חדש" : "הכלל הקיים עודכן"} — השאלה לא תחזור`);
  process.exit(0);
}

if (merchant || slug) {
  console.error("צריך גם --merchant וגם --slug. הרץ --slugs לרשימת הקטגוריות.");
  process.exit(1);
}

// ─────────── מה ממתין ───────────

const pending = await withUser(userId, (db) => pendingDecisions(db, userId));

if (!pending.length) {
  console.log(`${G}אין מה להכריע. הכל מסווג.${O}`);
  process.exit(0);
}

console.log(`${Y}ממתין להכרעה${O} — ${pending.length} בתי עסק, לפי סכום:\n`);
for (const p of pending) {
  console.log(`  ${p.total.toFixed(2).padStart(11)} ₪  x${String(p.count).padEnd(3)} ${p.merchant}`);
}

console.log(`\n${D}להכרעה:${O}`);
console.log(`  npx tsx scripts/decide.mts --user ${userId} --merchant "${pending[0].merchant}" --slug <slug>`);
console.log(`${D}לרשימת הקטגוריות: הוסף --slugs${O}`);

process.exit(0);
