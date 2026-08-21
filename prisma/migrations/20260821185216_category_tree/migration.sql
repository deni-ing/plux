-- שלב 4.1 — עץ קטגוריות דו-שכבתי וכללי סיווג מדויקים יותר.
--
-- שתי הטבלאות כבר קיימות מהמיגרציה הראשונה. המיגרציה הזו לא יוצרת אותן
-- מחדש אלא מרחיבה אותן. שים לב שאין כאן CREATE TABLE — ולכן גם אין צורך
-- לגעת ב-RLS: המדיניות שהוגדרה על categories ועל category_rules ממשיכה
-- לחול בדיוק כפי שהיא, כי היא נשענת על העמודה userId שלא זזה.

-- ─────────────────── categories: שכבה שנייה ───────────────────

-- שלוש משפחות שלא מתערבבות. הפרדה כאן חוסכת בדיקות בכל שאילתה בהמשך:
-- "כמה הוצאתי" הוא סכום של EXPENSE בלבד, בלי לסנן ידנית משכורות והעברות.
CREATE TYPE "CategoryKind" AS ENUM ('EXPENSE', 'INCOME', 'TRANSFER');

-- slug הוא המזהה היציב של הקטגוריה. השם יכול להשתנות (המשתמש ישנה
-- "מזון וצריכה" ל"סופר"), ה-slug לא. כל המיפויים והכללים בקוד מצביעים
-- על ה-slug, אף פעם לא על השם.
ALTER TABLE "categories" ADD COLUMN "slug" TEXT;

-- מילוי לאחור. בפועל הטבלה ריקה — הסיווג עוד לא רץ מעולם — אבל מיגרציה
-- שמניחה הנחות על תוכן היא מיגרציה שתיפול על מישהו יום אחד.
UPDATE "categories" SET "slug" = 'legacy-' || "id" WHERE "slug" IS NULL;
ALTER TABLE "categories" ALTER COLUMN "slug" SET NOT NULL;

ALTER TABLE "categories" ADD COLUMN "kind" "CategoryKind" NOT NULL DEFAULT 'EXPENSE';
ALTER TABLE "categories" ADD COLUMN "parentId" TEXT;

-- CASCADE: מחיקת קטגוריית-על מוחקת את הבנות שלה. אין ילדים יתומים.
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "categories"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- השם כבר לא חייב להיות ייחודי: "אחר" צריך להתקיים גם תחת מזון וגם תחת
-- תחבורה. מה שכן ייחודי הוא ה-slug — food.other מול transport.other.
DROP INDEX IF EXISTS "categories_userId_name_key";
CREATE UNIQUE INDEX "categories_userId_slug_key" ON "categories"("userId", "slug");
CREATE INDEX "categories_userId_parentId_idx" ON "categories"("userId", "parentId");

-- ─────────────────── category_rules: סוגי התאמה ───────────────────

-- isRegex בוליאני היה מצומצם מדי. בפועל צריך ארבעה סוגים, והם מסודרים
-- כאן מהחזק לחלש: התאמה מדויקת גוברת על תחילית, שגוברת על הכלה.
-- regex אחרון בכוונה — הוא הכי חזק, ולכן הכי מסוכן.
CREATE TYPE "MatchType" AS ENUM ('EXACT', 'PREFIX', 'CONTAINS', 'REGEX');

ALTER TABLE "category_rules" ADD COLUMN "matchType" "MatchType" NOT NULL DEFAULT 'CONTAINS';
UPDATE "category_rules" SET "matchType" = 'REGEX' WHERE "isRegex" = TRUE;
ALTER TABLE "category_rules" DROP COLUMN "isRegex";

-- כלל מערכת מגיע מה-seed ומתעדכן בכל פריסה. כלל של המשתמש נוצר מתיקון
-- ידני ואסור לדרוס אותו. בלי הדגל הזה, seed אחד היה מוחק את כל הלמידה.
ALTER TABLE "category_rules" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT FALSE;

-- למה הכלל קיים. נשמע מיותר עד הפעם הראשונה שתסתכל על כלל בן חצי שנה
-- ותנסה לזכור למה בדיוק "סדש" הוא דלק ולא סופרמרקט.
ALTER TABLE "category_rules" ADD COLUMN "note" TEXT;

-- אותה תבנית יכולה להתקיים בשני סוגי התאמה שונים ולהיות שני כללים שונים.
DROP INDEX IF EXISTS "category_rules_userId_pattern_key";
CREATE UNIQUE INDEX "category_rules_userId_pattern_matchType_key"
  ON "category_rules"("userId", "pattern", "matchType");

CREATE INDEX "category_rules_userId_priority_idx" ON "category_rules"("userId", "priority");
