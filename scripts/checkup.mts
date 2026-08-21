/**
 * בדיקת שפיות מקיפה — כל מה שנבנה עד סוף יום 4.
 *
 *   npx tsx scripts/checkup.mts --user <clerk-user-id>
 *
 * ─── במה זה שונה מ-doctor.mts ───
 *
 * `doctor` בודק **סביבה**: משתני סביבה, קבצים שקיימים, חיבור למסד, גיט.
 * הוא עונה על "האם הפרויקט מותקן נכון".
 *
 * הקובץ הזה בודק **חוקיוּת**: אינווריאנטות שחייבות להתקיים בנתונים עצמם.
 * הוא עונה על "האם מה שיושב במסד עקבי עם ההחלטות שקיבלנו".
 *
 * ההבדל מהותי. פרויקט יכול לעבור את doctor במאה אחוז ועדיין להחזיק תנועה
 * שמסומנת כהעברה אבל נספרת כהוצאה — וזה באג שלא ייראה בשום מסך עד שמישהו
 * ישאל למה הסכום החודשי מוזר.
 *
 * ─── עקרונות ───
 *
 *  1. בדיקה שנכשלת לא עוצרת את השאר. תמונה מלאה עדיפה על הכשל הראשון.
 *  2. ערכי סודות לעולם לא מודפסים — רק האם הם קיימים ובאיזו צורה.
 *  3. כל FAIL מלווה בהסבר *למה* זה חשוב, לא רק מה נכשל.
 */

import "dotenv/config";
import { existsSync } from "node:fs";
import { prisma, withUser } from "../lib/db/client";
import { allSlugs, kindOf, isKnownSlug, CATEGORY_TREE } from "../lib/categories/tree";
import { SYSTEM_RULES } from "../lib/classify/rules";
import { MAX_CATEGORY_MAP } from "../lib/classify/provider-max";
import { allowedSlugsForAi, UNINFERABLE } from "../lib/classify/ai/run";
import { getClassifier } from "../lib/classify/ai/index";
import { normalizeForMatch } from "../lib/classify/engine";
import { classifyPath } from "../lib/storage/paths";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", O = "\x1b[0m";

type State = "pass" | "fail" | "warn";
const results: { section: string; state: State; label: string }[] = [];

function say(section: string, state: State, label: string, detail = "") {
  results.push({ section, state, label });
  const mark = state === "pass" ? `${G}PASS${O}` : state === "fail" ? `${R}FAIL${O}` : `${Y}WARN${O}`;
  console.log(`  ${mark}  ${label}${detail ? `\n        ${D}${detail}${O}` : ""}`);
}

function section(name: string) {
  console.log(`\n${name}`);
}

const args = process.argv.slice(2);
const userId = args[args.indexOf("--user") + 1];
if (!userId || userId.startsWith("--")) {
  console.error("חסר --user <clerk-user-id>");
  process.exit(1);
}

// ═══════════════════ 1. הגדרות בקוד — בלי לגעת במסד ═══════════════════
// אלה בדיקות שרצות בשנייה ותופסות באגים שקטים: כלל שמצביע לקטגוריה שלא
// קיימת פשוט לא יסווג כלום, ואיש לא ישים לב.

section("1. הגדרות בקוד");

{
  const slugs = allSlugs();
  const dupes = slugs.filter((s, i) => slugs.indexOf(s) !== i);
  if (dupes.length) {
    say("code", "fail", `slug כפול בעץ: ${[...new Set(dupes)].join(", ")}`,
        "המפתח הייחודי במסד הוא (userId, slug). כפילות תפיל את ה-seed");
  } else {
    say("code", "pass", `עץ הקטגוריות: ${slugs.length} slugs ייחודיים`);
  }

  const noKind = slugs.filter((s) => !kindOf(s));
  if (noKind.length) {
    say("code", "fail", `slug בלי kind: ${noKind.join(", ")}`);
  } else {
    say("code", "pass", "לכל slug יש kind");
  }

  // תת-קטגוריה חייבת להתחיל ב-slug של האם. זו לא מוסכמה יפה אלא הבסיס
  // לגזירת האם מה-slug בלי לגעת במסד.
  const badPrefix: string[] = [];
  for (const g of CATEGORY_TREE) {
    for (const c of g.categories) {
      for (const child of c.children ?? []) {
        if (!child.slug.startsWith(c.slug + ".")) badPrefix.push(child.slug);
      }
    }
  }
  if (badPrefix.length) {
    say("code", "fail", `תת-קטגוריה שלא נגזרת מהאם: ${badPrefix.join(", ")}`);
  } else {
    say("code", "pass", "מבנה ה-slugs עקבי");
  }
}

{
  const broken = SYSTEM_RULES.filter((r) => !isKnownSlug(r.slug));
  if (broken.length) {
    say("code", "fail", `${broken.length} כללים מצביעים ל-slug לא קיים`,
        broken.map((b) => `${b.pattern} → ${b.slug}`).join(" · "));
  } else {
    say("code", "pass", `${SYSTEM_RULES.length} כללי מערכת, כולם מצביעים לקטגוריה קיימת`);
  }

  const badMap = Object.entries(MAX_CATEGORY_MAP).filter(([, s]) => s !== null && !isKnownSlug(s));
  if (badMap.length) {
    say("code", "fail", `מיפוי MAX שבור: ${badMap.map(([k]) => k).join(", ")}`);
  } else {
    say("code", "pass", `מיפוי MAX: ${Object.keys(MAX_CATEGORY_MAP).length} קטגוריות`);
  }

  // רגקס שבור לא מפיל את הייבוא — הוא פשוט לא קיים. שקט וגרוע.
  const badRegex = SYSTEM_RULES.filter((r) => {
    if (r.matchType !== "REGEX") return false;
    try { new RegExp(r.pattern, "iu"); return false; } catch { return true; }
  });
  if (badRegex.length) {
    say("code", "fail", `רגקס שבור: ${badRegex.map((b) => b.pattern).join(", ")}`);
  } else {
    say("code", "pass", "כל כללי הרגקס מתקמפלים");
  }

  // כלל רחב בעברית מסוכן: אין גבולות מילה. CONTAINS "גים" תפס "מעדני דגים".
  const short = SYSTEM_RULES.filter(
    (r) => r.matchType === "CONTAINS" && /[֐-׿]/.test(r.pattern) && r.pattern.trim().length <= 3
  );
  if (short.length) {
    say("code", "warn", `${short.length} כללי CONTAINS קצרים בעברית`,
        `${short.map((s) => `"${s.pattern}"`).join(", ")} — בעברית אין גבולות מילה, ותבנית קצרה תופסת יותר מדי`);
  } else {
    say("code", "pass", "אין כללי CONTAINS קצרים מדי בעברית");
  }
}

{
  const leaves = allowedSlugsForAi();
  const withKids = CATEGORY_TREE.flatMap((g) => g.categories).filter((c) => (c.children ?? []).length);
  if (leaves.length && !leaves.some((s) => !s.includes("."))) {
    say("code", "pass", `רשימת ה-AI: ${leaves.length} עלים בלבד`,
        "קטגוריית-על היא תשובה שתמיד נכונה ולכן חסרת ערך");
  } else {
    say("code", "fail", "רשימת ה-AI מכילה קטגוריות-על");
  }

  if (withKids.length === CATEGORY_TREE.flatMap((g) => g.categories).length) {
    say("code", "pass", "לכל קטגוריית-על יש תת-קטגוריות");
  } else {
    say("code", "warn", "יש קטגוריית-על בלי בנות — לא תופיע לבחירת ה-AI");
  }

  try {
    const c = getClassifier();
    say("code", "pass", `מסווג: ${c.name}`,
      c.name === "none" ? "אין ספק מוגדר. זה מצב תקין — הצינור ממשיך בלעדיו" : "");
  } catch (e) {
    say("code", "fail", "getClassifier נכשל", e instanceof Error ? e.message : String(e));
  }
}

// ═══════════════════ 2. קבצים ═══════════════════

section("2. קבצים");

for (const f of [
  "lib/db/client.ts", "lib/db/session.ts", "lib/db/maintenance.ts",
  "lib/parsers/index.ts", "lib/parsers/max.ts", "lib/parsers/leumi.ts",
  "lib/import/ingest.ts", "lib/storage/statements.ts",
  "lib/categories/tree.ts", "lib/categories/ensure.ts",
  "lib/classify/engine.ts", "lib/classify/rules.ts", "lib/classify/store.ts",
  "lib/classify/user.ts", "lib/classify/ai/index.ts",
  "app/api/imports/route.ts", "app/api/cron/purge-statements/route.ts",
  "proxy.ts", "vercel.json", ".github/workflows/ci.yml",
]) {
  if (existsSync(f)) say("files", "pass", f);
  else say("files", "fail", `חסר: ${f}`);
}

// ═══════════════════ 3. מסד: מבנה ו-RLS ═══════════════════

section("3. מסד — מבנה ובידוד");

const TABLES = [
  "users", "accounts", "transactions", "categories", "category_rules",
  "subscriptions", "budgets", "savings_goals", "import_jobs", "analytics_snapshots",
];

try {
  // הסינון לפי nspname='public' אינו קוסמטי.
  //
  // ב-Supabase קיימת טבלה בשם users גם בסכימת auth — של מערכת האימות
  // שלהם, שאיננו הבעלים שלה. שאילתה על pg_class לפי שם בלבד מוצאת את
  // שתיהן, ומדווחת על טבלה זרה כאילו היא שלנו.
  //
  // הגרסה הראשונה כאן אכן דיווחה "FORCE חסר על users" — על auth.users.
  // אזעקת שווא היא לא אי-נוחות קטנה: היא מה שגורם להתעלם מהתראה אמיתית.
  const rows = await prisma.$queryRaw<{ relname: string; rls: boolean; forced: boolean }[]>`
    SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = ANY(${TABLES}::text[])`;

  const missing = TABLES.filter((t) => !rows.some((r) => r.relname === t));
  if (missing.length) {
    say("db", "fail", `טבלאות חסרות: ${missing.join(", ")}`);
  } else {
    say("db", "pass", `${TABLES.length} טבלאות קיימות`);
  }

  const noRls = rows.filter((r) => !r.rls).map((r) => r.relname);
  const noForce = rows.filter((r) => r.rls && !r.forced).map((r) => r.relname);

  if (noRls.length) {
    say("db", "fail", `RLS כבוי: ${noRls.join(", ")}`);
  } else {
    say("db", "pass", "RLS מופעל על כל הטבלאות");
  }

  if (noForce.length) {
    say("db", "fail", `FORCE חסר: ${noForce.join(", ")}`,
        "בלי FORCE, בעל הטבלה עוקף את המדיניות");
  } else {
    say("db", "pass", "FORCE ROW LEVEL SECURITY על כל הטבלאות");
  }
} catch (e) {
  say("db", "fail", "שאילתת קטלוג נכשלה", e instanceof Error ? e.message : String(e));
}

try {
  const [role] = await prisma.$queryRaw<{ rolname: string; bypass: boolean; super: boolean }[]>`
    SELECT rolname, rolbypassrls AS bypass, rolsuper AS super
    FROM pg_roles WHERE rolname = current_user`;

  if (role?.bypass || role?.super) {
    say("db", "fail", `תפקיד האפליקציה (${role.rolname}) עוקף RLS`,
        "BYPASSRLS או SUPERUSER הופכים את כל המדיניות לחסרת משמעות. זה בדיוק מה שהתגלה ביום 2");
  } else {
    say("db", "pass", `תפקיד האפליקציה: ${role?.rolname} — בלי BYPASSRLS ובלי SUPERUSER`);
  }
} catch (e) {
  say("db", "fail", "בדיקת תפקיד נכשלה", e instanceof Error ? e.message : String(e));
}

// שתי בדיקות הבידוד האמיתיות: בלי זהות, ועם זהות אחרת.
try {
  const leak = await prisma.transaction.count();
  if (leak === 0) {
    say("db", "pass", "שאילתה בלי זהות מחזירה 0 תנועות");
  } else {
    say("db", "fail", `שאילתה בלי זהות החזירה ${leak} תנועות`,
        "המדיניות לא נאכפת. כל משתמש רואה את כולם");
  }
} catch {
  say("db", "pass", "שאילתה בלי זהות נדחתה");
}

try {
  const other = await withUser("user_checkup_probe_0000", (db) => db.transaction.count());
  if (other === 0) {
    say("db", "pass", "משתמש אחר מחזיר 0 תנועות");
  } else {
    say("db", "fail", `משתמש זר ראה ${other} תנועות`);
  }
} catch (e) {
  say("db", "fail", "בדיקת בידוד נכשלה", e instanceof Error ? e.message : String(e));
}

// ═══════════════════ 4. הנתונים של המשתמש ═══════════════════

section("4. נתוני המשתמש");

const data = await withUser(userId, async (db) => {
  const [accounts, txns, jobs, cats, rules] = await Promise.all([
    db.account.count({ where: { userId } }),
    db.transaction.count({ where: { userId } }),
    db.importJob.count({ where: { userId } }),
    db.category.count({ where: { userId } }),
    db.categoryRule.count({ where: { userId } }),
  ]);
  return { accounts, txns, jobs, cats, rules };
});

say("data", data.txns > 0 ? "pass" : "warn",
  `${data.txns} תנועות · ${data.accounts} חשבונות · ${data.jobs} ייבואים`,
  data.txns === 0 ? "אין נתונים. הרץ import-file.mts" : "");

say("data", data.cats === allSlugs().length ? "pass" : "warn",
  `${data.cats} קטגוריות (מצופה ${allSlugs().length})`,
  data.cats < allSlugs().length ? "הרץ classify-check.mts כדי להשלים" : "");

say("data", data.rules >= SYSTEM_RULES.length ? "pass" : "warn",
  `${data.rules} כללים במסד (${SYSTEM_RULES.length} בקוד)`);

// ═══════════════════ 5. אינווריאנטות — הלב של הבדיקה ═══════════════════
// אלה התנאים שאם הם נשברים, המספרים שהמשתמש רואה שגויים.

section("5. אינווריאנטות");

await withUser(userId, async (db) => {
  // ─── א. countsAsSpending חייב לנבוע מ-kind של הקטגוריה ───
  // זו נקודת האמת היחידה שהגדרנו. אם שורה סותרת אותה, אחד משני המקומות
  // שכתב אותה עשה זאת ישירות במקום דרך הסיווג.
  const classified = await db.transaction.findMany({
    where: { userId, categoryId: { not: null } },
    select: { id: true, countsAsSpending: true, category: { select: { slug: true } } },
  });

  const bad = classified.filter(
    (t) => t.category && t.countsAsSpending !== (kindOf(t.category.slug) !== "TRANSFER")
  );

  if (bad.length) {
    say("inv", "fail", `${bad.length} תנועות עם countsAsSpending לא עקבי`,
        "קטגוריה מסוג TRANSFER חייבת countsAsSpending=false. הפרה כאן מנפחת או מכווצת את ההוצאות");
  } else {
    say("inv", "pass", `countsAsSpending עקבי ב-${classified.length} תנועות מסווגות`);
  }

  // ─── ב. כל כלל מצביע לקטגוריה שקיימת ולאותו משתמש ───
  const ruleRows = await db.categoryRule.findMany({
    where: { userId },
    select: { pattern: true, category: { select: { slug: true, userId: true } } },
  });
  const orphan = ruleRows.filter((r) => !r.category || r.category.userId !== userId);
  if (orphan.length) {
    say("inv", "fail", `${orphan.length} כללים מצביעים לקטגוריה זרה או חסרה`);
  } else {
    say("inv", "pass", `${ruleRows.length} כללים מצביעים לקטגוריות תקינות`);
  }

  // ─── ג. עץ הקטגוריות במסד תקין ───
  const cats = await db.category.findMany({
    where: { userId },
    select: { slug: true, parentId: true, id: true, kind: true },
  });
  const ids = new Set(cats.map((c) => c.id));
  const brokenParent = cats.filter((c) => c.parentId && !ids.has(c.parentId));
  if (brokenParent.length) {
    say("inv", "fail", `${brokenParent.length} קטגוריות עם הורה שלא קיים`);
  } else {
    say("inv", "pass", "עץ הקטגוריות במסד שלם");
  }

  const kindMismatch = cats.filter((c) => {
    const expected = kindOf(c.slug);
    return expected && c.kind !== expected;
  });
  if (kindMismatch.length) {
    say("inv", "fail", `${kindMismatch.length} קטגוריות עם kind שגוי`,
        kindMismatch.slice(0, 5).map((c) => c.slug).join(", "));
  } else {
    say("inv", "pass", "ה-kind של כל קטגוריה תואם לעץ");
  }

  // ─── ד. תיקון ידני לא נדרס ───
  // ההבטחה שמאפשרת למשתמש להשקיע בתיקון. אם היא נשברת פעם אחת, אי אפשר
  // לתקן אותה למפרע — המידע אבד.
  const userFixed = await db.transaction.count({ where: { userId, categorySource: "USER" } });
  const userFixedNoCat = await db.transaction.count({
    where: { userId, categorySource: "USER", categoryId: null },
  });
  if (userFixedNoCat) {
    say("inv", "fail", `${userFixedNoCat} תנועות מסומנות USER אבל בלי קטגוריה`,
        "סימן שסיווג אוטומטי דרס תיקון ידני");
  } else {
    say("inv", "pass", `${userFixed} תיקונים ידניים, כולם שלמים`);
  }

  // ─── ה. אין תנועה של חשבון של משתמש אחר ───
  const accIds = (await db.account.findMany({ where: { userId }, select: { id: true } })).map((a) => a.id);
  if (!accIds.length) {
    // notIn עם מערך ריק אינו שאלה בעלת משמעות, ובחלק מהמנועים גם לא חוקי.
    say("inv", "warn", "אין חשבונות — בדיקת שיוך התנועות דולגה");
  } else {
    const foreign = await db.transaction.count({
      where: { userId, accountId: { notIn: accIds } },
    });
    if (foreign) {
      say("inv", "fail", `${foreign} תנועות משויכות לחשבון זר`);
    } else {
      say("inv", "pass", "כל תנועה שייכת לחשבון של המשתמש");
    }
  }
});

// ═══════════════════ 6. סיווג — כיסוי ואיכות ═══════════════════

section("6. סיווג");

await withUser(userId, async (db) => {
  const total = await db.transaction.count({ where: { userId } });
  if (!total) { say("cls", "warn", "אין תנועות לבדוק"); return; }

  const withCat = await db.transaction.count({ where: { userId, categoryId: { not: null } } });
  const pct = (withCat / total) * 100;

  say("cls", pct >= 90 ? "pass" : pct >= 70 ? "warn" : "fail",
    `כיסוי: ${withCat}/${total} (${pct.toFixed(1)}%)`);

  const bySource = await db.transaction.groupBy({
    by: ["categorySource"],
    where: { userId, categoryId: { not: null } },
    _count: true,
  });
  say("cls", "pass", "לפי מקור: " +
    bySource.map((s) => `${s.categorySource}=${s._count}`).join(" · "));

  const transfers = await db.transaction.count({ where: { userId, countsAsSpending: false } });
  say("cls", transfers > 0 ? "pass" : "warn",
    `${transfers} תנועות לא נספרות כהוצאה`,
    transfers === 0 ? "חשוד: חיובי כרטיס מרוכזים והעברות P2P אמורים להיות כאן" : "");

  // המקרה שגילינו ביום 3: חיוב הבנק אינו סכום התנועות.
  const settlements = await db.transaction.count({ where: { userId, kind: "CARD_SETTLEMENT" } });
  const settlementsMarked = await db.transaction.count({
    where: { userId, kind: "CARD_SETTLEMENT", countsAsSpending: true },
  });
  if (settlementsMarked) {
    say("cls", "fail", `${settlementsMarked} חיובי כרטיס נספרים כהוצאה`,
        "ספירה כפולה: השורה בבנק והתנועות ב-MAX. ההוצאות יוצגו מנופחות");
  } else {
    say("cls", "pass", `${settlements} חיובי כרטיס מרוכזים, כולם מנוטרלים`);
  }

  // מה שנשאר להכרעת המשתמש — ומה מתוכו לא ניתן לסיווג בכלל.
  const open = await db.transaction.findMany({
    where: { userId, categoryId: null },
    select: { merchant: true, amount: true },
  });
  const names = new Set(open.map((o) => o.merchant));
  const uninferable = [...names].filter((m) =>
    UNINFERABLE.some((p) => normalizeForMatch(m).includes(normalizeForMatch(p)))
  );
  say("cls", open.length === 0 ? "pass" : "warn",
    `${open.length} תנועות פתוחות · ${names.size} בתי עסק`,
    uninferable.length
      ? `${uninferable.length} מהם אינם ניתנים לסיווג מהנתון: ${uninferable.join(", ")}`
      : "");
});

// ═══════════════════ 7. אחסון ומחיקה ═══════════════════

section("7. אחסון");

await withUser(userId, async (db) => {
  const jobs = await db.importJob.findMany({
    where: { userId },
    select: { storagePath: true, fileName: true, startedAt: true },
  });
  if (!jobs.length) { say("st", "warn", "אין ייבואים"); return; }

  // הסיווג נעשה דרך lib/storage/paths.ts ולא בתנאי מקומי, כדי שהבדיקה
  // והקוד שכותב את הנתיב יסכימו על אותה מוסכמה. הגרסה הראשונה כאן שאלה
  // "לא inline ולא purged?" — ולכן סימנה שמונה סימונים ישנים (`local:`)
  // כנתיב אחסון שגוי.
  const byKind = new Map<string, number>();
  for (const j of jobs) {
    const k = classifyPath(j.storagePath, userId);
    byKind.set(k, (byKind.get(k) ?? 0) + 1);
  }
  say("st", "pass", "נתיבים: " +
    [...byKind.entries()].map(([k, n]) => `${k}=${n}`).join(" · "));

  const legacy = byKind.get("legacy") ?? 0;
  const unknown = byKind.get("unknown") ?? 0;

  if (legacy) {
    say("st", "warn", `${legacy} ייבואים בסימון ישן`,
        "הרץ scripts/fix-storage-paths.mts. שני סימונים לאותה משמעות יסתעפו");
  } else {
    say("st", "pass", "אין סימונים ישנים");
  }

  if (unknown) {
    say("st", "fail", `${unknown} נתיבים שאינם מוכרים`,
        "נתיב שאינו מתחיל ב-userId ואינו סימון ידוע — בדוק אותו ידנית");
  } else {
    say("st", "pass", "כל הנתיבים בצורה מוכרת");
  }

  const stored = jobs.filter((j) => classifyPath(j.storagePath, userId) === "stored");
  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const overdue = stored.filter((j) => j.startedAt.getTime() < cutoff);
  if (overdue.length) {
    say("st", "warn", `${overdue.length} קבצים מעל 30 יום שטרם נמחקו`,
        "ה-cron אמור למחוק אותם. ודא שהמשימה רשומה ב-Vercel ולא רק ב-vercel.json");
  } else {
    say("st", "pass", "אין קבצים שעברו את תקופת השמירה");
  }
});

// ═══════════════════ 8. סודות ═══════════════════

section("8. סודות");

for (const leaked of [
  "NEXT_PUBLIC_CLERK_SECRET_KEY", "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_CRON_SECRET", "NEXT_PUBLIC_DATABASE_URL", "NEXT_PUBLIC_DIRECT_URL",
]) {
  if (process.env[leaked]) {
    say("sec", "fail", `קיים ${leaked}`,
        "הקידומת NEXT_PUBLIC_ מטמיעה את הערך בקוד שנשלח לדפדפן. הסר מיד והנפק מחדש");
  } else {
    say("sec", "pass", `אין ${leaked}`);
  }
}

for (const req of ["DATABASE_URL", "DIRECT_URL", "CLERK_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]) {
  if (process.env[req]) say("sec", "pass", `${req} מוגדר`);
  else say("sec", "fail", `${req} חסר`);
}

// ═══════════════════ סיכום ═══════════════════

const pass = results.filter((r) => r.state === "pass").length;
const fail = results.filter((r) => r.state === "fail").length;
const warn = results.filter((r) => r.state === "warn").length;

console.log(`\n${"─".repeat(56)}`);
console.log(`${pass + fail + warn} בדיקות · ${G}${pass} עברו${O} · ${Y}${warn} אזהרות${O} · ${fail ? R : D}${fail} נכשלו${O}`);

if (fail) {
  console.log(`\n${R}נכשלו:${O}`);
  results.filter((r) => r.state === "fail").forEach((r) => console.log(`  · ${r.label}`));
}

await prisma.$disconnect();
process.exit(fail ? 1 : 0);
