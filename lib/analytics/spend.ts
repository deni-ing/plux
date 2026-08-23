/**
 * מנוע האנליטיקה. פונקציות טהורות בלבד — כמו `lib/classify/engine.ts`.
 *
 * אין כאן Prisma, אין Next.js, אין `new Date()` ואין קריאת סביבה. כל מה
 * שנכנס מגיע כארגומנט, וכל מה שיוצא נגזר ממנו בלבד. **פונקציה שקוראת
 * את השעון אינה ניתנת לבדיקה** — הטסט שלה מצליח היום ונכשל ב-1 בחודש.
 *
 * ─── ההחלטה המרכזית: מה נספר כהוצאה ───
 *
 * שלושה סוגי תנועות, ושלוש התנהגויות שונות:
 *
 *   EXPENSE   נספר כהוצאה. סכום שלילי → תורם חיובית לסך ההוצאה.
 *   INCOME    נספר כהכנסה. לא מקזז הוצאה בשום קטגוריה.
 *   TRANSFER  לא נספר בכלל. יוצא מהחישוב לפני שהוא מתחיל.
 *
 * ההחרגה של TRANSFER היא כל העניין. בלעדיה חיוב MAX המרוכז בבנק
 * (‎"מקס איט פיננ", 86 שורות אצלו) נספר פעם אחת כשורה בבנק, ופעם
 * שנייה כאוסף השורות המקוריות ב-MAX. סך ההוצאות יוצא כפול, והמספר
 * נראה סביר מספיק כדי שאף אחד לא ישים לב.
 *
 * ─── זיכויים ───
 *
 * החזר על קנייה מגיע כסכום חיובי עם קטגוריה מסוג EXPENSE. הוא **מקזז
 * את הקטגוריה שלו** ולא נספר כהכנסה: החזר של ‎₪200 על נעליים אינו
 * הכנסה של ‎₪200, הוא קנייה שלא קרתה. לכן הסכימה בכל קטגוריית EXPENSE
 * היא `סכום(-amount)`, וקטגוריה שקיבלה יותר החזרים מהוצאות תופיע
 * במינוס. זה נכון וזה מכוון.
 *
 * ─── לא מסווג ───
 *
 * תנועה בלי קטגוריה אינה נזרקת ואינה נדחפת ל"שונות". היא מקבלת שורה
 * משלה בדוח. **קו שמראה כמה לא ידענו הוא הקו החשוב בדוח הראשון**, וברגע
 * שהוא מתמזג עם "שונות" הוא נעלם ולא יחזור.
 */

import { kindOf, nameOf, parentSlug, type CategoryKind } from "../categories/tree";
import type { TxnKind } from "../classify/engine";
import { type Agorot, share } from "./money";
import {
  DEFAULT_BASIS,
  dayOfPeriod,
  daysIn,
  effectiveDate,
  inPeriod,
  usedFallback,
  type Basis,
  type Period,
} from "./period";

/**
 * הצורה שהמנוע מצפה לה. שים לב למה *אין* כאן: אין `id` של קטגוריה, אין
 * `userId`, ואין שדות של Prisma. השכבה שמעל ממירה, והמנוע לא יודע
 * מאיפה הנתונים הגיעו.
 */
export type AnalyticsTxn = {
  id: string;
  bookedAt: Date;
  chargedAt: Date | null;
  /** באגורות, חתום. שלילי = כסף יוצא. */
  amount: Agorot;
  merchant: string;
  /** null = לא סווג */
  categorySlug: string | null;
  /** השם כפי שהוא במסד — המשתמש יכול היה לשנות אותו. */
  categoryName?: string | null;
  countsAsSpending: boolean;
  /**
   * סוג התנועה מהדוח. `TxnKind` מיובא מ-`lib/classify/engine` ולא מוגדר
   * כאן מחדש — איחוד טיפוסים שנכתב פעמיים מתפצל בפעם הראשונה שמישהו
   * מוסיף ערך לאחד מהם.
   */
  kind?: TxnKind | null;
  /**
   * עמודת ההערות מדף החשבון. מכילה "הוראת קבע" ו-"למי: <שם>".
   * << "הוראת קבע" היא הצהרה של הבנק ולא ניחוש שלנו — ראה recurring.ts.
   */
  note?: string | null;
};

export type CategoryLine = {
  /** null = השורה של הלא-מסווגים */
  slug: string | null;
  name: string;
  kind: CategoryKind;
  total: Agorot;
  count: number;
  /** אחוז מסך ההוצאה (או מסך ההכנסה, בשורת הכנסה) */
  share: number;
  children: CategoryLine[];
};

export type Breakdown = {
  period: Period;
  basis: Basis;

  /** סך ההוצאה, חיובי. */
  expense: Agorot;
  /** סך ההכנסה, חיובי. */
  income: Agorot;
  /** income − expense. שלילי = הוצאנו יותר ממה שנכנס. */
  net: Agorot;

  /** קטגוריות-על מסוג EXPENSE, מהגדולה לקטנה. */
  categories: CategoryLine[];
  /** קטגוריות-על מסוג INCOME. */
  incomeCategories: CategoryLine[];
  /** השורה של הלא-מסווגים, או null אם אין. */
  unclassified: CategoryLine | null;

  /** כמה תנועות נכללו בחישוב. */
  txnCount: number;

  /** מה יצא, וכמה. לא סתם דיווח: זה מה שמסביר פער מול דף החשבון. */
  excluded: {
    /** תנועות מסוג TRANSFER (`countsAsSpending = false`) */
    transfers: number;
    transfersTotal: Agorot;
    /** תנועות מחוץ לתקופה */
    outOfPeriod: number;
  };

  /** תנועות שנפלו חזרה ל-bookedAt כי אין להן chargedAt. */
  fallbackDates: number;

  /**
   * עד לאן הנתונים מגיעים בתוך התקופה.
   *
   * << נולד מבדיקה מול חמשת דפי MAX: התנועה האחרונה בכולם היא ה-17
   *    באוגוסט, והדוח השווה 17 ימי נתונים מול יולי המלא וקרא לזה
   *    "ירידה של 31.6%". המספר היה נכון אריתמטית ומטעה לחלוטין.
   *
   * `lastDataAt` נגזר מהתנועות ולא מהשעון. פונקציה שקוראת את השעון
   * אינה טהורה, אבל חשוב מזה: **"עד מתי יש נתונים" הוא נתון ולא זמן.**
   * חודש שהסתיים לפני שבוע והנתונים בו נגמרים באמצע הוא עדיין חלקי.
   */
  coverage: {
    lastDataAt: Date | null;
    daysCovered: number;
    daysInPeriod: number;
    partial: boolean;
  };

  /**
   * כמה מההוצאה סווגה — בשתי יחידות.
   *
   * << הסיבה ששתיהן כאן: באוגוסט 96% מהתנועות סווגו, אבל רק 69%
   *    מהשקלים. תנועה אחת מתוך 24 החזיקה 31% מהחודש. **מדד כיסוי
   *    שסופר תנועות מסתיר בדיוק את התנועות שחשובות — הגדולות.**
   */
  classification: {
    count: { classified: number; total: number; pct: number };
    amount: { classified: Agorot; total: Agorot; pct: number };
  };
};

export type BreakdownOptions = {
  basis?: Basis;
  /** שמות קטגוריות מהמסד, לפי slug. גובר על השם שבעץ. */
  names?: ReadonlyMap<string, string>;
  /**
   * התאריך שבו נגמרים הנתונים **בכלל**, לא רק בתקופה הזו.
   *
   * << אם לא סופק, הוא נגזר מהתנועות שהועברו — ולכן חשוב להעביר טווח
   *    רחב מהתקופה. קורא שטוען חודש אחד בלבד לא יכול לדעת אם הנתונים
   *    נגמרו בו או ממשיכים אחריו, ויסמן כל חודש כחלקי.
   */
  dataEndsAt?: Date | null;
};

function displayName(
  slug: string,
  names: ReadonlyMap<string, string> | undefined,
  fromTxn?: string | null
): string {
  return names?.get(slug) ?? fromTxn ?? nameOf(slug) ?? slug;
}

/**
 * ה-kind של תנועה.
 *
 * מקור אחד: ה-slug. **לא** `countsAsSpending` — הוא נגזרת שנשמרת במסד,
 * וכל בדיקה שמסתמכת עליו במקום על ה-slug שואלת שאלה אחרת מזו שהיא
 * חושבת שהיא שואלת. `countsAsSpending` משמש כאן רק כדי לספור מה הוחרג,
 * ו-`scripts/checkup.mts` מוודא שהשניים לא נפרדו.
 */
function kindOfTxn(t: AnalyticsTxn): CategoryKind {
  if (!t.countsAsSpending) return "TRANSFER";
  if (t.categorySlug === null) return "EXPENSE";
  return kindOf(t.categorySlug) ?? "EXPENSE";
}

type Bucket = { total: Agorot; count: number };

function bump(map: Map<string, Bucket>, key: string, amount: Agorot): void {
  const b = map.get(key);
  if (b) {
    b.total += amount;
    b.count += 1;
  } else {
    map.set(key, { total: amount, count: 1 });
  }
}

/**
 * הפילוח. סעיף 5.1.
 *
 * מעבר יחיד על התנועות, ואחריו בנייה של העץ מהדליים. סיבוכיות O(n),
 * ובלי מיון של התנועות עצמן — רק של הקטגוריות, שיש מהן עשרות.
 */
export function breakdownByCategory(
  txns: readonly AnalyticsTxn[],
  period: Period,
  options: BreakdownOptions = {}
): Breakdown {
  const basis = options.basis ?? DEFAULT_BASIS;
  const names = options.names;

  const leaves = new Map<string, Bucket>();
  const leafNames = new Map<string, string>();
  const unclassified: Bucket = { total: 0, count: 0 };

  let expense = 0;
  let income = 0;
  let txnCount = 0;
  let outOfPeriod = 0;
  let transfers = 0;
  let transfersTotal = 0;
  let fallbackDates = 0;
  let lastDay = 0;
  let lastDataAt: Date | null = null;

  // << נסרק על **כל** התנועות, גם מחוץ לתקופה. זו כל הנקודה: רק מי
  //    שרואה מעבר לחודש יכול לדעת אם הנתונים נגמרו בתוכו.
  let globalLast: Date | null = options.dataEndsAt ?? null;
  if (options.dataEndsAt === undefined) {
    for (const t of txns) {
      const when = effectiveDate(t, basis);
      if (globalLast === null || when.getTime() > globalLast.getTime()) globalLast = when;
    }
  }

  for (const t of txns) {
    const when = effectiveDate(t, basis);
    if (!inPeriod(when, period)) {
      outOfPeriod += 1;
      continue;
    }
    if (usedFallback(t, basis)) fallbackDates += 1;

    // << גם העברות נחשבות "נתונים קיימים". חיוב האשראי המרוכז מגיע
    //    ב-10 בחודש והוא עדות טובה לכך שהחודש נקלט עד שם.
    const day = dayOfPeriod(when, period);
    if (day > lastDay) {
      lastDay = day;
      lastDataAt = when;
    }

    const kind = kindOfTxn(t);

    if (kind === "TRANSFER") {
      transfers += 1;
      transfersTotal += t.amount;
      continue;
    }

    txnCount += 1;

    if (kind === "INCOME") {
      income += t.amount;
    } else {
      // הוצאה נשמרת כמספר חיובי. זיכוי (amount חיובי) יוצא שלילי ומקזז.
      expense += -t.amount;
    }

    if (t.categorySlug === null) {
      unclassified.total += -t.amount;
      unclassified.count += 1;
      continue;
    }

    const signed = kind === "INCOME" ? t.amount : -t.amount;
    bump(leaves, t.categorySlug, signed);
    if (t.categoryName && !leafNames.has(t.categorySlug)) {
      leafNames.set(t.categorySlug, t.categoryName);
    }
  }

  // ── מהדליים לעץ ──
  const parents = new Map<string, { bucket: Bucket; children: CategoryLine[]; kind: CategoryKind }>();

  for (const [slug, bucket] of leaves) {
    const root = parentSlug(slug) ?? slug;
    const kind = kindOf(root) ?? "EXPENSE";
    let p = parents.get(root);
    if (!p) {
      p = { bucket: { total: 0, count: 0 }, children: [], kind };
      parents.set(root, p);
    }
    p.bucket.total += bucket.total;
    p.bucket.count += bucket.count;

    // ה-slug של קטגוריית-על עצמה יכול לשאת תנועות (תנועה שסווגה
    // ל-"food" ולא ל-"food.groceries"). היא נספרת בסך האם ואינה
    // מקבלת שורת בן — אחרת היא תופיע פעמיים.
    if (slug !== root) {
      p.children.push({
        slug,
        name: displayName(slug, names, leafNames.get(slug)),
        kind,
        total: bucket.total,
        count: bucket.count,
        share: 0,
        children: [],
      });
    }
  }

  const denom = (kind: CategoryKind) => (kind === "INCOME" ? income : expense);

  const lines: CategoryLine[] = [];
  for (const [root, p] of parents) {
    const children = p.children.sort((a, b) => b.total - a.total);
    for (const c of children) c.share = share(c.total, denom(p.kind));
    lines.push({
      slug: root,
      name: displayName(root, names, undefined),
      kind: p.kind,
      total: p.bucket.total,
      count: p.bucket.count,
      share: share(p.bucket.total, denom(p.kind)),
      children,
    });
  }

  const byTotal = (a: CategoryLine, b: CategoryLine) => b.total - a.total;

  const totalDays = daysIn(period);
  const classifiedAmount = expense - unclassified.total;
  const classifiedCount = txnCount - unclassified.count;

  /**
   * חודש חלקי הוא חודש **שהנתונים נגמרים בתוכו**.
   *
   * << ההגדרה הראשונה שלי הייתה "התנועה האחרונה בחודש אינה ביום
   *    האחרון", והיא הייתה שגויה: היא סימנה את אוקטובר 2025 כחלקי רק
   *    כי ב-31 בו לא הייתה קנייה. הבדיקה תפסה שבעה חודשים כאלה.
   *
   *    **"אין תנועה ביום האחרון" ו-"אין נתונים על היום האחרון" הם שני
   *    דברים שונים, והראשון הוא מידע לגיטימי.** ההבחנה ביניהם דורשת
   *    להסתכל אל מחוץ לחודש — ולכן globalLast.
   */
  const endsInside =
    globalLast !== null &&
    globalLast.getTime() >= period.from.getTime() &&
    globalLast.getTime() < period.to.getTime();

  const daysCovered =
    globalLast === null
      ? 0
      : endsInside
        ? dayOfPeriod(globalLast, period)
        : globalLast.getTime() >= period.to.getTime()
          ? totalDays
          : 0;

  const partial = daysCovered > 0 && daysCovered < totalDays;

  return {
    period,
    basis,
    expense,
    income,
    net: income - expense,
    categories: lines.filter((l) => l.kind === "EXPENSE").sort(byTotal),
    incomeCategories: lines.filter((l) => l.kind === "INCOME").sort(byTotal),
    unclassified:
      unclassified.count === 0
        ? null
        : {
            slug: null,
            name: "לא מסווג",
            kind: "EXPENSE",
            total: unclassified.total,
            count: unclassified.count,
            share: share(unclassified.total, expense),
            children: [],
          },
    txnCount,
    excluded: { transfers, transfersTotal, outOfPeriod },
    fallbackDates,
    coverage: {
      /** התנועה האחרונה **בתקופה הזו**. מידע, לא בסיס לחלקיות. */
      lastDataAt,
      daysCovered,
      daysInPeriod: totalDays,
      partial,
    },
    classification: {
      count: {
        classified: classifiedCount,
        total: txnCount,
        pct: txnCount === 0 ? 0 : Math.round((classifiedCount / txnCount) * 1000) / 10,
      },
      amount: {
        classified: classifiedAmount,
        total: expense,
        pct: share(classifiedAmount, expense),
      },
    },
  };
}

// ─────────────────────────── השוואה בין חודשים ───────────────────────────

export type CategoryDelta = {
  slug: string | null;
  name: string;
  current: Agorot;
  previous: Agorot;
  delta: Agorot;
  /** אחוז שינוי. null כשבחודש הקודם היה 0 — אין אחוז משינוי מאפס. */
  deltaPct: number | null;
};

export type Comparison = {
  current: Breakdown;
  previous: Breakdown;
  expenseDelta: Agorot;
  incomeDelta: Agorot;
  /** לפי גודל השינוי המוחלט — מה שקפץ ומה שצנח, בראש. */
  categories: CategoryDelta[];

  /**
   * האם שני החלונות באותו אורך.
   *
   * `aligned = false` פירושו שההשוואה אינה תקפה, ולא שהיא פחות מדויקת.
   * 17 ימים מול 31 יום יראו ירידה בכל קטגוריה גם אם ההרגלים לא זזו
   * במילימטר. הדגל הזה קיים כדי שהמציג לא יוכל להתעלם ממנו בשקט —
   * וההשוואה עצמה מחושבת בכל מקרה, כי הנתון עצמו נכון.
   *
   * הדרך ליישר: `firstDays(previousMonth(p), current.coverage.daysCovered)`.
   */
  window: {
    currentDays: number;
    previousDays: number;
    aligned: boolean;
  };
};

/**
 * השוואה לחודש הקודם. סעיף 5.2.
 *
 * ‏`deltaPct` הוא null ולא Infinity ולא 100 כשהחודש הקודם היה אפס.
 * "עלייה של אינסוף אחוז" אינה מידע, ו-"עלייה של 100%" היא פשוט שקר.
 * קטגוריה חדשה היא קטגוריה חדשה, וזו עובדה שראוי להציג כמו שהיא.
 */
export function compareBreakdowns(current: Breakdown, previous: Breakdown): Comparison {
  const prevByslug = new Map<string | null, CategoryLine>();
  const collect = (b: Breakdown) => {
    const out: CategoryLine[] = [...b.categories, ...b.incomeCategories];
    if (b.unclassified) out.push(b.unclassified);
    return out;
  };
  for (const l of collect(previous)) prevByslug.set(l.slug, l);

  const seen = new Set<string | null>();
  const deltas: CategoryDelta[] = [];

  for (const l of collect(current)) {
    seen.add(l.slug);
    const prev = prevByslug.get(l.slug)?.total ?? 0;
    deltas.push({
      slug: l.slug,
      name: l.name,
      current: l.total,
      previous: prev,
      delta: l.total - prev,
      deltaPct: prev === 0 ? null : Math.round(((l.total - prev) / Math.abs(prev)) * 1000) / 10,
    });
  }

  // קטגוריה שהייתה בחודש שעבר ונעלמה החודש. בלי הלולאה הזו "הפסקתי
  // לשלם על X" פשוט לא מופיע בשום מקום.
  for (const l of collect(previous)) {
    if (seen.has(l.slug)) continue;
    deltas.push({
      slug: l.slug,
      name: l.name,
      current: 0,
      previous: l.total,
      delta: -l.total,
      deltaPct: l.total === 0 ? null : -100,
    });
  }

  const currentDays = current.coverage.daysCovered;
  const previousDays = daysIn(previous.period);

  return {
    current,
    previous,
    expenseDelta: current.expense - previous.expense,
    incomeDelta: current.income - previous.income,
    categories: deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    window: {
      currentDays,
      previousDays,
      aligned: currentDays === previousDays,
    },
  };
}
