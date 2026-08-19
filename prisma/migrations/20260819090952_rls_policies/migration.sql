-- Plux — Row Level Security
-- רץ מיד אחרי המיגרציה שיוצרת את הטבלאות, ולא מאוחר יותר.
-- הסיבה: להוסיף RLS על מסד קיים מחייב לעבור על כל שאילתה שכבר נכתבה ולוודא
-- שהיא לא נשענת על גישה חופשית. כאן זה נסגר לפני שנכתבה שורת קוד אחת.

-- ───────────────────────── פונקציית עזר ─────────────────────────
-- קוראת את זהות המשתמש שנקבעה לטרנזקציה הנוכחית ב-SET LOCAL.
-- ה-true השני ב-current_setting אומר "אל תזרוק שגיאה אם לא הוגדר" — במקרה כזה
-- מוחזר NULL, וכל מדיניות תיכשל. כלומר ברירת המחדל היא לא לראות כלום.
CREATE OR REPLACE FUNCTION plux_current_user_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')
$$;

-- ───────────────────────── הפעלה ומדיניות ─────────────────────────
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'accounts',
    'transactions',
    'categories',
    'category_rules',
    'subscriptions',
    'budgets',
    'savings_goals',
    'import_jobs',
    'analytics_snapshots'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);

    -- FORCE חשוב: בלעדיו הבעלים של הטבלה עוקף את המדיניות בשקט,
    -- וזה בדיוק המשתמש שהאפליקציה מתחברת איתו בסביבות מסוימות.
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_isolation', t);
    EXECUTE format($f$
      CREATE POLICY %I ON %I
      FOR ALL
      USING ("userId" = plux_current_user_id())
      WITH CHECK ("userId" = plux_current_user_id())
    $f$, t || '_isolation', t);
  END LOOP;
END $$;

-- טבלת users: משתמש רואה רק את השורה של עצמו.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_isolation ON users;
CREATE POLICY users_isolation ON users
  FOR ALL
  USING (id = plux_current_user_id())
  WITH CHECK (id = plux_current_user_id());

-- ───────────────────────── הערה תפעולית ─────────────────────────
-- ה-service role של Supabase עוקף RLS לחלוטין (BYPASSRLS).
-- הוא אינו בשימוש בשום נתיב שנוגע בנתוני משתמש — לא ב-API ולא בעיבוד הרקע.
-- כל גישה עוברת דרך התפקיד הרגיל, בטרנזקציה שבה נקבע app.current_user_id.
