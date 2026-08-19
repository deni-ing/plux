/**
 * בדיקת בריאות לפרויקט.
 *
 *   npx tsx scripts/doctor.mts
 *
 * עוברת על חמש שכבות — סביבה, קבצים, מסד, פרסר וגיט — ומדווחת על כל אחת
 * בנפרד. הכוונה היא שתריץ אותה לפני כל דיפלוי ואחרי כל שינוי מבני, ותדע
 * תוך שניות אם משהו נשמט.
 *
 * שני עקרונות:
 *   • בדיקה שנכשלת לא עוצרת את השאר. תמונה מלאה עדיפה על הכשל הראשון.
 *   • ערכי סודות לעולם לא מודפסים — רק האם הם קיימים ובאיזו צורה.
 */

import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseMaxXlsx } from "../lib/parsers/max";
import { parseLeumiLines } from "../lib/parsers/leumi";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", D = "\x1b[2m", O = "\x1b[0m";

type State = "pass" | "fail" | "warn";
const results: { section: string; state: State }[] = [];

function say(section: string, state: State, label: string, detail = "") {
  results.push({ section, state });
  const mark = state === "pass" ? `${G}PASS${O}` : state === "fail" ? `${R}FAIL${O}` : `${Y}WARN${O}`;
  console.log(`  ${mark}  ${label}${detail ? `\n        ${D}${detail}${O}` : ""}`);
}

function section(name: string) {
  console.log(`\n${name}`);
}

// ═══════════════════════════ 1. סביבה ═══════════════════════════

section("סביבה");

const env = process.env;

function envCheck(name: string, test: (v: string) => boolean, hint: string) {
  const v = env[name];
  if (!v) return say("env", "fail", `${name} חסר`, hint);
  if (!test(v)) return say("env", "fail", `${name} בפורמט לא צפוי`, hint);
  say("env", "pass", name);
}

envCheck("DATABASE_URL", (v) => v.includes("plux_app."), "האפליקציה צריכה להתחבר כ-plux_app ולא כ-postgres");
envCheck("DIRECT_URL", (v) => v.includes("postgres."), "מיגרציות רצות כ-postgres, בחיבור ישיר");
envCheck("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", (v) => v.startsWith("pk_"), "המפתח הפומבי מתחיל ב-pk_");
envCheck("CLERK_SECRET_KEY", (v) => v.startsWith("sk_"), "מפתח השרת מתחיל ב-sk_");

if (env.NEXT_PUBLIC_CLERK_SECRET_KEY) {
  say("env", "fail", "קיים NEXT_PUBLIC_CLERK_SECRET_KEY", "הקידומת NEXT_PUBLIC_ מפרסמת את מפתח השרת לדפדפן. הסר אותה מיד.");
}

// ═══════════════════════════ 2. קבצים ═══════════════════════════

section("קבצים");

const FILES: [string, string][] = [
  ["proxy.ts", "ב-Next 16 השם הוא proxy.ts. middleware.ts לא ייטען, בשקט"],
  ["prisma.config.ts", ""],
  ["prisma/schema.prisma", ""],
  ["lib/db/client.ts", ""],
  ["lib/db/session.ts", "הגשר בין Clerk למסד"],
  ["lib/parsers/types.ts", ""],
  ["lib/parsers/xlsx.ts", ""],
  ["lib/parsers/max.ts", ""],
  ["lib/parsers/leumi.ts", ""],
  ["lib/parsers/pdf-text.ts", "הקובץ היחיד שתלוי בספריית PDF"],
  ["lib/parsers/index.ts", "הממשק המשותף וזיהוי הפורמט"],
  ["lib/import/ingest.ts", "כתיבת תוצאות הפענוח למסד"],
  ["app/layout.tsx", ""],
  ["app/sign-in/[[...sign-in]]/page.tsx", ""],
  ["app/sign-up/[[...sign-up]]/page.tsx", ""],
  ["scripts/rls-check.mts", ""],
  ["scripts/parse-check.mts", ""],
  ["scripts/leumi-check.mts", ""],
  ["scripts/import-file.mts", ""],
];

for (const [path, hint] of FILES) {
  existsSync(path) ? say("files", "pass", path) : say("files", "fail", `${path} חסר`, hint);
}

function contains(path: string, needle: string, label: string, hint = "") {
  if (!existsSync(path)) return say("files", "fail", `${label} — הקובץ חסר`, hint);
  const ok = readFileSync(path, "utf8").includes(needle);
  ok ? say("files", "pass", label) : say("files", "fail", label, hint);
}

contains("package.json", '"postinstall"', "package.json מריץ prisma generate", "בלעדיו הבנייה ב-Vercel תיפול: lib/generated לא בגיט");

// תלויות. חסרה אחת — הקוד מתקמפל ונופל רק בזמן ריצה, על נתיב מסוים.
for (const dep of ["@clerk/nextjs", "@prisma/adapter-pg", "prisma", "unpdf"]) {
  contains("package.json", `"${dep}"`, `החבילה ${dep} מותקנת`, "npm install " + dep);
}

existsSync("docs/PROJECT-STATE.md")
  ? say("files", "pass", "docs/PROJECT-STATE.md")
  : say("files", "warn", "docs/PROJECT-STATE.md חסר", "מסמך המסירה — בלעדיו שיחה חדשה מתחילה מאפס");
contains("proxy.ts", "clerkMiddleware", "proxy.ts מפעיל את clerkMiddleware");
contains("app/layout.tsx", "ClerkProvider", "layout עטוף ב-ClerkProvider");
contains("app/layout.tsx", 'dir="rtl"', "layout מוגדר RTL");
contains("lib/db/client.ts", "set_config", "הגישה למסד עוברת ב-SET LOCAL");

if (existsSync("middleware.ts")) {
  say("files", "warn", "קיים גם middleware.ts", "ב-Next 16 הקובץ הפעיל הוא proxy.ts. שניהם יחד מבלבלים.");
}

// ═══════════════════════════ 3. מסד ═══════════════════════════

section("מסד");

const RLS_TABLES = [
  "users", "accounts", "transactions", "categories", "category_rules",
  "subscriptions", "budgets", "savings_goals", "import_jobs", "analytics_snapshots",
];

try {
  const { prisma } = await import("../lib/db/client");

  const who = (await prisma.$queryRaw<{ current_user: string; bypassrls: boolean | null }[]>`
    SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls
  `)[0];

  who.current_user === "plux_app"
    ? say("db", "pass", `מחובר כ-${who.current_user}`)
    : say("db", "fail", `מחובר כ-${who.current_user}`, "האפליקציה אמורה להתחבר כ-plux_app");

  who.bypassrls === false
    ? say("db", "pass", "התפקיד אינו עוקף RLS")
    : say("db", "fail", "התפקיד נושא BYPASSRLS", "כל מדיניות ה-RLS חסרת השפעה במצב הזה");

  const migrations = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null }[]>`
    SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY started_at
  `;
  const unfinished = migrations.filter((m) => !m.finished_at);
  unfinished.length === 0
    ? say("db", "pass", `${migrations.length} מיגרציות הוחלו`, migrations.map((m) => m.migration_name).join(", "))
    : say("db", "fail", `${unfinished.length} מיגרציות לא הושלמו`, unfinished.map((m) => m.migration_name).join(", "));

  // relrowsecurity = RLS דלוק. relforcerowsecurity = חל גם על בעל הטבלה.
  // בלי השני, בעל הטבלה עוקף את המדיניות בשקט.
  const rls = await prisma.$queryRaw<
    { table: string; enabled: boolean; forced: boolean; policies: bigint }[]
  >`
    SELECT c.relname AS table,
           c.relrowsecurity AS enabled,
           c.relforcerowsecurity AS forced,
           (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  `;

  const byName = new Map(rls.map((r) => [r.table, r]));
  const broken = RLS_TABLES.filter((t) => {
    const r = byName.get(t);
    return !r || !r.enabled || !r.forced || Number(r.policies) === 0;
  });

  broken.length === 0
    ? say("db", "pass", `RLS דלוק, כפוי ועם מדיניות על ${RLS_TABLES.length} טבלאות`)
    : say("db", "fail", `RLS חסר או חלקי ב-${broken.length} טבלאות`, broken.join(", "));

  // טבלה חדשה שנוספה לסכימה ונשכחה ב-RLS היא הדליפה הבאה.
  const extra = rls
    .map((r) => r.table)
    .filter((t) => !RLS_TABLES.includes(t) && !t.startsWith("_prisma"));
  if (extra.length) {
    say("db", "warn", `${extra.length} טבלאות שאינן ברשימת ה-RLS`, `${extra.join(", ")} — אם יש בהן נתוני משתמש, הן חשופות`);
  }

  await prisma.$disconnect();
} catch (e) {
  say("db", "fail", "לא ניתן לבדוק את המסד", e instanceof Error ? e.message.split("\n")[0] : String(e));
}

// ═══════════════════════════ 4. פרסר ═══════════════════════════

section("פרסר");

const FIXTURE = "tests/fixtures/max-pending.xlsx";
try {
  if (!existsSync(FIXTURE)) {
    say("parser", "fail", "קובץ הבדיקה חסר", FIXTURE);
  } else {
    const r = parseMaxXlsx(readFileSync(FIXTURE));
    const bad = r.checks.filter((c) => !c.ok);
    bad.length === 0
      ? say("parser", "pass", `${r.checks.length} אימותים על ${FIXTURE}`, `${r.transactions.length} תנועות`)
      : say("parser", "fail", `${bad.length} אימותים נכשלו`, bad.map((c) => `${c.label}: ${c.expected} מול ${c.actual}`).join("; "));

    const pending = r.transactions.filter((t) => t.status === "PENDING").length;
    pending === 2
      ? say("parser", "pass", "עסקאות ממתינות מזוהות כ-PENDING")
      : say("parser", "fail", `זוהו ${pending} ממתינות במקום 2`);
  }
} catch (e) {
  say("parser", "fail", "פרסר MAX נפל", e instanceof Error ? e.message : String(e));
}

/**
 * דף חשבון סינתטי, בקוד ולא בקובץ. ארבע שורות שמספיקות כדי לאמת את
 * הלוגיקה המרכזית: הסימן נגזר מהפרש היתרות, ולא ממיקום העמודה.
 * 1000 → 1300 (זכות 300) → 1250 (חובה 50) → 1250.
 */
try {
  const fixture = [
    "     מספר חשבון: 662-03660656",
    "     לתקופה: 01.01.2026 - 31.01.2026",
    "     יתרה מצטברת    חובה      זכות      סוג תנועה    תאריך",
    "     ₪ 1,250.00     ₪ 50.00                עמל.ערוץ יש 11    31.01.2026",
    "     ₪ 1,300.00                ₪ 300.00   הפועלים-ביט       30.01.2026",
    "     ₪ 1,000.00     ₪ 120.00               מקס איט פיננ-י    29.01.2026",
  ];
  const r = parseLeumiLines(fixture);
  const chain = r.checks.find((c) => c.label.includes("שרשרת"));
  chain?.ok
    ? say("parser", "pass", "שרשרת היתרות בלאומי", `${r.transactions.length} תנועות, ${chain.actual}`)
    : say("parser", "fail", "שרשרת היתרות בלאומי", chain ? `${chain.actual} מתוך ${chain.expected}` : "לא בוצעה");

  const fee = r.transactions.find((t) => t.kind === "FEE");
  const inbound = r.transactions.find((t) => t.kind === "TRANSFER_IN");
  const card = r.transactions.find((t) => t.kind === "CARD_SETTLEMENT");

  fee?.amount === "-50.00" && inbound?.amount === "300.00"
    ? say("parser", "pass", "הסימן נגזר מהיתרות ולא ממיקום עמודה")
    : say("parser", "fail", "הסימן שגוי", `עמלה=${fee?.amount} זכות=${inbound?.amount}`);

  card && card.countsAsSpending === false
    ? say("parser", "pass", "חיוב אשראי מוחרג מהוצאות", "מונע ספירה כפולה מול קובץ MAX")
    : say("parser", "fail", "חיוב אשראי לא הוחרג", "יגרום לספירה כפולה של ההוצאות");
} catch (e) {
  say("parser", "fail", "פרסר לאומי נפל", e instanceof Error ? e.message : String(e));
}

// ═══════════════════════════ 5. גיט ═══════════════════════════

section("גיט");

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

for (const secret of [".env", ".env.local"]) {
  try {
    const rule = git("check-ignore", "-v", secret);
    say("git", "pass", `${secret} חסום`, rule);
  } catch {
    existsSync(secret)
      ? say("git", "fail", `${secret} אינו חסום`, "הקובץ קיים ועלול להיכנס ל-commit הבא")
      : say("git", "pass", `${secret} לא קיים`);
  }
}

try {
  const dirty = git("status", "--porcelain").split("\n").filter(Boolean);
  dirty.length === 0
    ? say("git", "pass", "עץ העבודה נקי")
    : say("git", "warn", `${dirty.length} קבצים לא שמורים`, dirty.slice(0, 5).join(", "));
} catch { say("git", "warn", "לא ניתן לקרוא את מצב עץ העבודה"); }

try {
  const ahead = git("rev-list", "--count", "@{u}..HEAD");
  ahead === "0"
    ? say("git", "pass", "הכל נדחף ל-origin")
    : say("git", "warn", `${ahead} commits לא נדחפו`, "git push");
} catch { say("git", "warn", "אין remote מוגדר או שאין upstream לענף"); }

try {
  const tracked = git("ls-files").split("\n");
  const leaked = tracked.filter((f) => /\.(xlsx|pdf)$/i.test(f) && !f.startsWith("tests/fixtures/"));
  leaked.length === 0
    ? say("git", "pass", "אין דפי חשבון או קובצי אקסל מנוהלים בגיט")
    : say("git", "fail", `${leaked.length} קבצים חשודים בגיט`, leaked.join(", "));
} catch (e) {
  say("git", "warn", "לא ניתן לקרוא את רשימת הקבצים בגיט");
}

// ═══════════════════════════ סיכום ═══════════════════════════

const fail = results.filter((r) => r.state === "fail").length;
const warn = results.filter((r) => r.state === "warn").length;

console.log(
  "\n" +
    (fail === 0
      ? `${G}${results.length - warn}/${results.length} עברו${O}${warn ? `  ${Y}(${warn} אזהרות)${O}` : ""}`
      : `${R}${fail} כשלים${O}${warn ? `, ${Y}${warn} אזהרות${O}` : ""}`) +
    "\n"
);
process.exitCode = fail === 0 ? 0 : 1;
