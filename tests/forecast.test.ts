import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toAgorot } from "../lib/analytics/money";
import { monthPeriod, utcDate } from "../lib/analytics/period";
import { breakdownByCategory, type AnalyticsTxn } from "../lib/analytics/spend";
import { findRecurring } from "../lib/analytics/recurring";
import { forecastMonth } from "../lib/analytics/forecast";

// << מ-26.08: התאריכים בקובץ הזה על יום >= 7 בחודש בכוונה (מלבד "חדר
//    כושר" ב-26, שכבר היה >= 7) — התקופה מתחילה עכשיו ב-7, לא ב-1.
//    ‏`daysInPeriod` נשאר 31 (מ-7.8 עד 7.9 זה עדיין 31 יום), אז כל
//    הקיזוזים כאן הם רק הזזת יום-בחודש, לא שינוי בהיגיון הטסט.

let seq = 0;
function t(
  merchant: string,
  booked: [number, number, number],
  amount: string,
  slug: string | null = "food.groceries",
  extra: Partial<AnalyticsTxn> = {}
): AnalyticsTxn {
  return {
    id: `t${seq++}`,
    bookedAt: utcDate(...booked),
    chargedAt: null,
    amount: toAgorot(amount),
    merchant,
    categorySlug: slug,
    countsAsSpending: true,
    ...extra,
  };
}

const AUG = monthPeriod(2026, 8); // [2026-08-07, 2026-09-07)

/** שכר דירה ב-7 בכל חודש (תחילת התקופה), ‎₪3,000, בהוראת קבע. */
const RENT = [5, 6, 7].map((m) =>
  t("שכר דירה", [2026, m, 7], "-3000.00", "housing.rent", { note: "הוראת קבע" })
);
/** חדר כושר ב-26 בכל חודש — כבר >= 7, לא הוזז. */
const GYM = [5, 6, 7].map((m) => t("חדר כושר", [2026, m, 26], "-199.00", "leisure.sports"));

function build(august: AnalyticsTxn[], history = [...RENT, ...GYM]) {
  const txns = [...history, ...august];
  const b = breakdownByCategory(txns, AUG);
  const r = findRecurring(txns, { asOf: b.coverage.lastDataAt ?? AUG.to });
  return { txns, forecast: forecastMonth(txns, b, r), breakdown: b };
}

describe("forecastMonth — הבסיס", () => {
  // אוגוסט עד היום ה-10 של התקופה (7 עד 16): שכר דירה ירד ב-7, ועוד ‎₪100 ליום בממוצע.
  const august = [
    t("שכר דירה", [2026, 8, 7], "-3000.00", "housing.rent", { note: "הוראת קבע" }),
    ...Array.from({ length: 10 }, (_, i) => t(`סופר ${i}`, [2026, 8, i + 7], "-100.00")),
  ];
  const { forecast: f } = build(august);

  it("יודע עד לאן הנתונים מגיעים", () => {
    assert.equal(f.daysCovered, 10);
    assert.equal(f.daysInPeriod, 31);
    assert.equal(f.daysRemaining, 21);
    assert.equal(f.confidence, "medium"); // 32%
  });

  it("מה שכבר יצא הוא עובדה", () => {
    assert.equal(f.spent, 400000); // 3000 + 10×100
  });

  /**
   * חדר הכושר ייגבה ב-26 באוגוסט. אנחנו יודעים את זה — ולכן הוא נספר
   * בשמו ובסכומו, ולא נבלע בממוצע יומי.
   */
  it("חיוב חוזר שטרם נגבה נספר בשמו", () => {
    assert.deepEqual(
      f.upcoming.map((c) => [c.merchant, c.amount, c.dueAt]),
      // המחזור החציוני הוא 31 יום (הפערים 31 ו-30), ולכן ה-26 ולא ה-25.
      [["חדר כושר", 19900, "2026-08-26"]]
    );
    assert.equal(f.upcomingTotal, 19900);
  });

  it("שכר הדירה כבר ירד ולכן אינו ברשימת הצפויים", () => {
    assert.ok(!f.upcoming.some((c) => c.merchant === "שכר דירה"));
  });

  /**
   * הלב של הסעיף. ‏₪3,000 של שכר דירה **אינם** נכנסים לקצב היומי:
   * אחרת הממוצע היה ‎₪400 ליום במקום ‎₪100, והתחזית הייתה מנפחת
   * ‎₪6,300 שלא יקרו.
   */
  it("החוזרים מנוכים מהקצב היומי", () => {
    assert.equal(f.variableSoFar, 100000); // 10 × 100, בלי שכר הדירה
    assert.equal(f.variablePerDay, 10000); // ₪100
  });

  it("רצפה = מה שיצא ‎+‎ מה שידוע שייצא", () => {
    assert.equal(f.floor, 400000 + 19900);
  });

  it("צפוי = רצפה ‎+‎ קצב × ימים שנותרו", () => {
    assert.equal(f.expected, 419900 + 10000 * 21);
  });

  it("תקרה גדולה מהצפוי, וצפוי גדול מהרצפה", () => {
    assert.ok(f.floor < f.expected);
    assert.ok(f.expected <= f.ceiling);
  });

  it("ההנחות נשמרות כטקסט ולא כהערה בקוד", () => {
    assert.ok(f.assumptions.length >= 3);
    assert.ok(f.assumptions.some((a) => a.includes("10 מתוך 31")));
    assert.ok(f.assumptions.some((a) => a.includes("חיובים חוזרים")));
  });
});

describe("הרעלת הקצב — הבאג שהסעיף נבנה נגדו", () => {
  /**
   * תשלום אחד גדול על ניתוח ביום ה-12, בחודש שבו כל השאר הוא ‎₪50 ליום
   * (17 הימים 7 עד 23 של התקופה). בשיטה הנאיבית הוא מוכפל בימים שנותרו.
   */
  const withSurgery = [
    ...Array.from({ length: 17 }, (_, i) => t(`יומיום ${i}`, [2026, 8, i + 7], "-50.00")),
    t("פיימנט פתרונ-י", [2026, 8, 12], "-1008.66", "health.private"),
  ];
  const history = [
    t("פיימנט פתרונ-י", [2026, 6, 12], "-1009.00", "health.private"),
    t("פיימנט פתרונ-י", [2026, 7, 12], "-1010.00", "health.private"),
  ];

  const { forecast: f } = build(withSurgery, history);

  it("התשלום זוהה כחוזר ולכן לא נכנס לקצב", () => {
    assert.equal(f.variableSoFar, 85000); // 17 × 50
    assert.equal(f.variablePerDay, 5000); // ₪50, לא ₪109
  });

  it("והוא לא נספר שוב כצפוי — הוא כבר נגבה החודש", () => {
    assert.ok(!f.upcoming.some((c) => c.merchant === "פיימנט פתרונ-י"));
  });

  /**
   * ההפרש כאן הוא ‎₪830 על חודש אחד. חישבתי אותו קודם כ"אלפי שקלים"
   * והטסט תיקן אותי. **הטענה המדויקת חזקה מהטענה הגדולה**, וההפרש
   * החד באמת הוא בקצב היומי: ‎₪109 נאיבי מול ‎₪50 אמיתי.
   */
  it("הקצב הנאיבי גדול מפי שניים מהאמיתי", () => {
    const naivePerDay = Math.round(f.spent / f.daysCovered);
    assert.ok(naivePerDay > f.variablePerDay * 2, `${naivePerDay} מול ${f.variablePerDay}`);

    const naiveTotal = Math.round((f.spent / f.daysCovered) * f.daysInPeriod);
    assert.ok(naiveTotal - f.expected > 50000, `נאיבי ${naiveTotal} מול צפוי ${f.expected}`);
  });
});

describe("מקרי קצה", () => {
  it("חודש שהסתיים אינו תחזית אלא עובדה", () => {
    // 31 ימים רצופים החל מ-7.8 (תחילת התקופה) — גולש אוטומטית ל-6.9
    // (היום האחרון בתקופה) דרך גלישת החודש הרגילה של Date.UTC.
    const full = Array.from({ length: 31 }, (_, i) =>
      t(`יום ${i}`, [2026, 8, i + 7], "-100.00")
    );
    const { forecast: f } = build(full, []);
    assert.equal(f.daysRemaining, 0);
    assert.equal(f.floor, f.expected);
    assert.equal(f.expected, f.ceiling);
    assert.equal(f.spent, 310000);
    assert.ok(f.assumptions.some((a) => a.includes("החודש הסתיים")));
  });

  it("חודש בלי נתונים מחזיר אפסים וביטחון נמוך", () => {
    const b = breakdownByCategory([], AUG);
    const f = forecastMonth([], b, []);
    assert.equal(f.daysCovered, 0);
    assert.equal(f.expected, 0);
    assert.equal(f.confidence, "low");
    assert.ok(f.assumptions.some((a) => a.includes("אין נתונים")));
  });

  it("יומיים בלבד — ביטחון נמוך והאזהרה מפורשת", () => {
    const { forecast: f } = build(
      [t("א", [2026, 8, 7], "-100.00"), t("ב", [2026, 8, 8], "-100.00")],
      []
    );
    assert.equal(f.confidence, "low");
    assert.ok(f.assumptions.some((a) => a.includes("הרצפה אמינה")));
  });

  it("הכנסה אינה נכנסת לקצב ההוצאה", () => {
    const { forecast: f } = build(
      [
        t("משכורת", [2026, 8, 7], "12000.00", "income.salary"),
        t("סופר", [2026, 8, 9], "-100.00"),
      ],
      []
    );
    assert.equal(f.variableSoFar, 10000);
  });

  it("העברות אינן נכנסות לקצב", () => {
    const { forecast: f } = build(
      [
        t("חיוב מקס", [2026, 8, 9], "-4000.00", "transfer.card_settlement", {
          countsAsSpending: false,
        }),
        t("סופר", [2026, 8, 11], "-100.00"),
      ],
      []
    );
    assert.equal(f.variableSoFar, 10000);
  });

  it("חיוב חוזר שהופסק אינו נספר כצפוי", () => {
    const stopped = [1, 2, 3].map((m) =>
      t("מנוי ישן", [2026, m, 10], "-99.00", "leisure.subscriptions")
    );
    const { forecast: f } = build([t("סופר", [2026, 8, 9], "-100.00")], stopped);
    assert.ok(!f.upcoming.some((c) => c.merchant === "מנוי ישן"));
  });

  it("אותו קלט נותן אותה תחזית", () => {
    const a = build([t("סופר", [2026, 8, 9], "-100.00")]);
    const b = build([t("סופר", [2026, 8, 9], "-100.00")]);
    assert.deepEqual(a.forecast, b.forecast);
  });
});
