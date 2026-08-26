/**
 * מנוע הסיווג. פונקציות טהורות בלבד — אין כאן מסד נתונים, אין Next.js,
 * ואין קריאת רשת. אותה החלטה שנעשית באתחל הייבוא ניתנת להרצה מטסט,
 * מסקריפט, או על מערך בזיכרון.
 *
 * סדר ההכרעה, מהחזק לחלש:
 *
 *   1. תיקון ידני של המשתמש  — מוחלט. לא נוגעים בו לעולם.
 *   2. כלל של המשתמש          — נוצר מתיקון קודם. הוא כבר אמר לנו מה נכון.
 *   3. כלל מערכת              — שם בית העסק.
 *   4. סוג התנועה             — עובדה מבנית מהדוח: עמלה היא עמלה.
 *   5. קטגוריית הספק          — ניחוש מושכל של MAX.
 *   6. כלום                   — נשאר לא מסווג, וממתין לשלב 4.4.
 *
 * למה 4 אחרי 3 ולא לפניו: `TRANSFER_IN` אומר "כסף נכנס בהעברה", אבל
 * הכלל על "אל שרד" יודע שזו משכורת. הכלל ספציפי יותר, ולכן קודם.
 * ולמה 4 לפני 5: הבנק ראה את התנועה, MAX ניחשה לפי שם.
 */

import { mapMaxCategory } from "./provider-max";

export type TxnKind =
  | "PURCHASE"
  | "INCOME"
  | "FEE"
  | "REFUND"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "STANDING_ORDER"
  | "CARD_SETTLEMENT"
  | "OTHER";

// << סעיף 4.10: TXN_KIND נוסף כאן, נפרד מ-RULE. עד עכשיו שני שלבים
//    שונים בסדר ההכרעה (3: כלל-על-שם-בית-עסק, 4: מיפוי-לפי-סוג-תנועה)
//    נכתבו שניהם כ-"RULE", ולא הייתה דרך לענות "כמה סווג לפי שם לעומת
//    לפי סוג" בלי להריץ מחדש. ראו החלטה תואמת ב-docs/PROJECT-STATE.md.
export type CategorySource = "PROVIDER" | "RULE" | "TXN_KIND" | "AI" | "USER";
export type MatchType = "EXACT" | "PREFIX" | "CONTAINS" | "REGEX";

export type CompiledRule = {
  id: string;
  pattern: string;
  matchType: MatchType;
  slug: string;
  priority: number;
  isSystem: boolean;
  /** נבנה פעם אחת בטעינה, לא בכל תנועה. */
  needle: string;
  regex?: RegExp;
};

export type Classifiable = {
  merchant: string;
  providerCategory?: string | null;
  kind?: TxnKind;
};

export type Decision = {
  slug: string;
  source: CategorySource;
  /** מה הכריע. נשמר בדוחות ובלוג, לא במסד. */
  reason: string;
  ruleId?: string;
};

/**
 * נרמול לצורך התאמה בלבד. לא נשמר — השדה `merchant` במסד נשאר כפי שהוא.
 *
 * שני דברים קורים כאן:
 *   • אותיות לטיניות לאותיות גדולות, כדי ש-Steam ו-STEAM יתאימו לאותו כלל.
 *     בעברית אין רישיות אז זה לא משנה דבר בצד העברי.
 *   • איחוד גרשיים. בקבצים אמיתיים מופיעים גם " וגם ״ וגם ׳ באותו תפקיד,
 *     ובלי האיחוד `בע"מ` ו-`בע״מ` הם שתי מחרוזות שונות.
 */
export function normalizeForMatch(s: string): string {
  return s
    .replace(/[״“”]/g, '"')
    .replace(/[׳‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** בונה כללים פעם אחת. regex שנבנה מחדש בכל תנועה הוא בזבוז אמיתי. */
export function compileRules(
  raw: {
    id: string;
    pattern: string;
    matchType: MatchType;
    slug: string;
    priority: number;
    isSystem: boolean;
  }[]
): CompiledRule[] {
  const compiled: CompiledRule[] = [];

  for (const r of raw) {
    let regex: RegExp | undefined;
    if (r.matchType === "REGEX") {
      try {
        regex = new RegExp(r.pattern, "iu");
      } catch {
        // כלל רגקס שבור לא מפיל את הייבוא. הוא פשוט לא קיים.
        continue;
      }
    }
    compiled.push({ ...r, needle: normalizeForMatch(r.pattern), regex });
  }

  // מיון פעם אחת: עדיפות, ואז סוג התאמה מהחזק לחלש, ואז התבנית הארוכה
  // יותר — "סופר פארם" צריך לנצח את "סופר" גם אם שניהם CONTAINS.
  const strength: Record<MatchType, number> = { EXACT: 0, PREFIX: 1, CONTAINS: 2, REGEX: 3 };
  compiled.sort(
    (a, b) =>
      a.priority - b.priority ||
      strength[a.matchType] - strength[b.matchType] ||
      b.needle.length - a.needle.length
  );

  return compiled;
}

function matches(rule: CompiledRule, merchant: string): boolean {
  switch (rule.matchType) {
    case "EXACT":
      return merchant === rule.needle;
    case "PREFIX":
      return merchant.startsWith(rule.needle);
    case "CONTAINS":
      return merchant.includes(rule.needle);
    case "REGEX":
      return rule.regex ? rule.regex.test(merchant) : false;
  }
}

/**
 * סיווג לפי סוג התנועה. אלה עובדות שהפרסר גזר מהדוח עצמו ולא ניחושים:
 * הבנק אמר שזו עמלה, או שזה חיוב הכרטיס המרוכז.
 */
const KIND_SLUG: Partial<Record<TxnKind, string>> = {
  CARD_SETTLEMENT: "transfer.card_settlement",
  // << מ-26.08: עבר מ-financial.bank_fees ל-fees, יחד עם כלל ה-"עמל"
  //    ב-rules.ts — ראו ההערה שם.
  FEE: "fees",
  REFUND: "income.refunds",
  TRANSFER_IN: "transfer.p2p",
  TRANSFER_OUT: "transfer.p2p",
  INCOME: "income.other",
  // << מ-26.08: הוראת קבע בלי כלל בית-עסק ספציפי יותר (כמו שכר דירה
  //    עם שם המשכיר) נופלת ל"עמלות" — אין לה מקבילה ב-11 הקטגוריות
  //    של MAX, וזה בדיוק הרעיון של הקטגוריה הזו. כלל ספציפי יותר
  //    ב-rules.ts תמיד גובר, כי RULES (2-3) נבדק לפני TXN_KIND (4).
  STANDING_ORDER: "fees",
};

export function classify(input: Classifiable, rules: CompiledRule[]): Decision | null {
  const merchant = normalizeForMatch(input.merchant ?? "");

  // 2 + 3 — כללים. הרשימה כבר ממוינת, כך שההתאמה הראשונה היא החזקה ביותר.
  if (merchant) {
    for (const rule of rules) {
      if (matches(rule, merchant)) {
        return {
          slug: rule.slug,
          source: "RULE",
          reason: `${rule.isSystem ? "כלל מערכת" : "כלל משתמש"}: ${rule.matchType} "${rule.pattern}"`,
          ruleId: rule.id,
        };
      }
    }
  }

  // 4 — סוג התנועה. מקור נפרד מ-RULE (סעיף 4.10): זו עובדה מבנית
  // שהפרסר קבע, לא התאמה על המחרוזת.
  const byKind = input.kind ? KIND_SLUG[input.kind] : undefined;
  if (byKind) {
    return { slug: byKind, source: "TXN_KIND", reason: `סוג תנועה: ${input.kind}` };
  }

  // 5 — הקטגוריה של הספק.
  const provider = mapMaxCategory(input.providerCategory);
  if (provider.slug) {
    return {
      slug: provider.slug,
      source: "PROVIDER",
      reason: `קטגוריית MAX: "${input.providerCategory}"${provider.coarse ? " (גסה)" : ""}`,
    };
  }

  // 6 — לא הצלחנו. null ולא קטגוריית "לא מסווג": ההבדל בין "החלטנו" ל"לא
  //     החלטנו" חייב להישאר גלוי במסד.
  return null;
}
