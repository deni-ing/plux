-- Plux — תפקיד ייעודי לאפליקציה
--
-- הבעיה שזה פותר: התפקיד `postgres` של Supabase נושא את התכונה BYPASSRLS,
-- כלומר הוא מתעלם מכל מדיניות RLS. לא בשגיאה — בשקט. כל עוד האפליקציה
-- מתחברת בו, המדיניות שכתבנו היא קישוט.
--
-- הפתרון: תפקיד נפרד, בלי BYPASSRLS, עם הרשאות נתונים בלבד ובלי הרשאות
-- מבנה. הוא יכול לקרוא ולכתוב שורות — הוא לא יכול ליצור או למחוק טבלאות.
--
-- חלוקת התפקידים אחרי השינוי:
--   • מיגרציות  → postgres (DIRECT_URL)   — משנה מבנה, עוקף RLS, לא נוגע בזמן ריצה
--   • אפליקציה  → plux_app (DATABASE_URL) — נוגע בנתונים, כפוף ל-RLS תמיד

-- ───────────────────────── יצירת התפקיד ─────────────────────────
-- NOLOGIN בכוונה: הסיסמה נקבעת ידנית מחוץ ל-repo, ורק אז מופעלת הכניסה.
-- סוד לא נכנס לקובץ מיגרציה שנשמר בגיט.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'plux_app') THEN
    CREATE ROLE plux_app NOLOGIN NOBYPASSRLS NOCREATEDB NOCREATEROLE NOSUPERUSER;
  END IF;
END $$;

-- ───────────────────────── הרשאות ─────────────────────────
GRANT USAGE ON SCHEMA public TO plux_app;

-- נתונים בלבד. אין CREATE, אין ALTER, אין DROP.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO plux_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO plux_app;

-- טבלאות שייווצרו במיגרציות עתידיות. בלי זה, כל מודל חדש שתוסיף
-- ייראה לאפליקציה כאילו אינו קיים — permission denied, לא "טבלה חסרה".
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO plux_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO plux_app;

-- ───────────────────────── אימות ─────────────────────────
-- אם מישהו יעניק בטעות BYPASSRLS לתפקיד הזה, המיגרציה תיכשל בפעם הבאה
-- שתרוץ מאפס. זו נורית אזהרה, לא רק תיעוד.
DO $$
BEGIN
  IF (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'plux_app') THEN
    RAISE EXCEPTION 'plux_app has BYPASSRLS — RLS would be inert';
  END IF;
END $$;
