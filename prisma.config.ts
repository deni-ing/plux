import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * הגדרות ה-CLI של Prisma.
 *
 * החל מ-Prisma 7 כתובות החיבור לא יושבות ב-schema.prisma, ו-`directUrl` הוסר.
 * במקומו: הקובץ הזה מגדיר את החיבור שמשמש את ה-CLI — כלומר מיגרציות —
 * וזה חייב להיות החיבור ה*ישיר* (פורט 5432), כי מיגרציות לא יכולות לרוץ
 * דרך pooler ב-transaction mode.
 *
 * החיבור של האפליקציה עצמה (ה-pooler, פורט 6543) מוגדר בנפרד ב-lib/db/client.ts.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DIRECT_URL"),
  },
});
