import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // סעיף 2.8: lib/ הוא הליבה הטהורה של הפרויקט — פרסרים, מנועים,
    // שכבות מסד. אף קובץ שם לא אמור לדעת ש-Next.js קיים (ראו החלטה 8
    // ב-docs/PROJECT-STATE.md, שעד עכשיו נאכפה רק על lib/parsers/
    // באמנה, לא בכלי). כאן זה נאכף בפועל, על כל lib/, ע"י ESLint.
    files: ["lib/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*"],
              message: "lib/ הוא טהור — אסור לייבא מ-Next.js. ראו החלטה 8 ב-docs/PROJECT-STATE.md.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
