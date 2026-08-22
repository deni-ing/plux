import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { toAgorot } from "../lib/analytics/money";
import { isoDay, utcDate } from "../lib/analytics/period";
import {
  cadenceOf,
  findRecurring,
  stoppedCharges,
  worthReviewing,
} from "../lib/analytics/recurring";
import type { AnalyticsTxn } from "../lib/analytics/spend";

let seq = 0;
function t(
  merchant: string,
  booked: [number, number, number],
  amount: string,
  opts: Partial<AnalyticsTxn> = {}
): AnalyticsTxn {
  return {
    id: `t${seq++}`,
    bookedAt: utcDate(...booked),
    chargedAt: null,
    amount: toAgorot(amount),
    merchant,
    categorySlug: "leisure.subscriptions",
    countsAsSpending: true,
    ...opts,
  };
}

/** חדר כושר — ₪199 קבוע, ארבעה חודשים. מהנתונים האמיתיים. */
const GYM = [
  t("דבליו גים בע\"מ הוק", [2026, 4, 26], "-199.00", { categorySlug: "leisure.sports" }),
  t("דבליו גים בע\"מ הוק", [2026, 5, 26], "-199.00", { categorySlug: "leisure.sports" }),
  t("דבליו גים בע\"מ הוק", [2026, 6, 26], "-199.00", { categorySlug: "leisure.sports" }),
  t("דבליו גים בע\"מ הוק", [2026, 7, 26], "-199.00", { categorySlug: "leisure.sports" }),
];

describe("cadenceOf", () => {
  it("סובל סטייה — חודש אינו 30 יום בדיוק", () => {
    assert.equal(cadenceOf(28), "monthly");
    assert.equal(cadenceOf(30), "monthly");
    assert.equal(cadenceOf(31), "monthly");
    assert.equal(cadenceOf(35), "monthly");
  });

  it("מזהה שאר קצבים", () => {
    assert.equal(cadenceOf(7), "weekly");
    assert.equal(cadenceOf(91), "quarterly");
    assert.equal(cadenceOf(365), "yearly");
  });

  it("מה שלא נופל בטווח הוא לא סדיר, ולא 'בערך חודשי'", () => {
    assert.equal(cadenceOf(15), "irregular");
    assert.equal(cadenceOf(50), "irregular");
    assert.equal(cadenceOf(200), "irregular");
  });
});

describe("findRecurring", () => {
  it("מזהה חיוב חודשי קבוע", () => {
    const [c] = findRecurring(GYM);
    assert.equal(c.merchant, 'דבליו גים בע"מ הוק');
    assert.equal(c.amount, 19900);
    assert.equal(c.occurrences, 4);
    assert.equal(c.cadence, "monthly");
    assert.equal(c.intervalDays, 30);
    assert.equal(c.annualized, 238800); // 199 × 12
    assert.equal(isoDay(c.nextDueAt), "2026-08-25");
  });

  it("סכום זהה וקצב אחיד נותנים ביטחון גבוה", () => {
    const [c] = findRecurring(GYM);
    assert.ok(c.confidence >= 0.9, `confidence ${c.confidence}`);
  });

  /**
   * שתי נקודות הן פער אחד, ומפער אחד אי אפשר לדעת אם הוא קצב.
   */
  it("שתי הופעות אינן מספיקות", () => {
    assert.deepEqual(findRecurring(GYM.slice(0, 2)), []);
  });

  it("אבל 'הוראת קבע' מספיקה גם בשתיים — כי הבנק הצהיר", () => {
    const declared = GYM.slice(0, 2).map((x) => ({ ...x, note: "הוראת קבע" }));
    const [c] = findRecurring(declared);
    assert.equal(c.declaredByProvider, true);
    assert.equal(c.kind, "subscription");
    assert.equal(c.confidence, 1);
  });

  it("בלי הצהרה הסוג נשאר unknown גם בדפוס מושלם", () => {
    const [c] = findRecurring(GYM);
    assert.equal(c.kind, "unknown");
    assert.equal(c.declaredByProvider, false);
  });

  /**
   * הלקח מה-₪1,008.66: ניתוח שפוצל לתשלומים נראה בדיוק כמו מנוי.
   * הכלי חייב להציג אותו כ"לא ידוע" ולא כ"מנוי פעיל שכדאי לבטל".
   */
  it("תשלומים על ניתוח אינם מסומנים כמנוי", () => {
    const surgery = [
      t("פיימנט פתרונ-י", [2026, 6, 12], "-1009.62", { categorySlug: "health.private" }),
      t("פיימנט פתרונ-י", [2026, 7, 12], "-1010.59", { categorySlug: "health.private" }),
      t("פיימנט פתרונ-י", [2026, 8, 12], "-1008.66", { categorySlug: "health.private" }),
    ];
    const [c] = findRecurring(surgery);
    assert.equal(c.cadence, "monthly");
    assert.equal(c.kind, "unknown");
    assert.equal(c.declaredByProvider, false);
    assert.ok(c.confidence < 1);
  });

  it("סכומים משתנים מורידים ביטחון", () => {
    const varied = [
      t("APPLE.COM/BILL", [2026, 5, 3], "-4.90"),
      t("APPLE.COM/BILL", [2026, 6, 3], "-31.90"),
      t("APPLE.COM/BILL", [2026, 7, 3], "-7.90"),
    ];
    const [c] = findRecurring(varied);
    assert.equal(c.amounts.length, 3);
    assert.ok(c.confidence < 0.75, `confidence ${c.confidence}`);
  });

  /**
   * שים לב לפערים: 19, 51, 15. החציון הוא 19 ולא הממוצע 28 — וזה
   * מכוון. **ממוצע של פערים לא סדירים ממציא קצב שלא היה**, וחיוב אחד
   * שאיחר בחודשיים היה הופך שלוש קניות אקראיות ל"מנוי חודשי".
   */
  it("קצב לא אחיד נשאר לא סדיר, והחציון לא ממציא לו מחזור", () => {
    const jittery = [
      t("משהו", [2026, 5, 1], "-100.00"),
      t("משהו", [2026, 5, 20], "-100.00"),
      t("משהו", [2026, 7, 10], "-100.00"),
      t("משהו", [2026, 7, 25], "-100.00"),
    ];
    const [c] = findRecurring(jittery);
    assert.equal(c.intervalDays, 19);
    assert.equal(c.cadence, "irregular");
    assert.equal(c.annualized, 0); // לא סדיר → אין השלכה שנתית
    assert.ok(c.confidence < 0.8, `confidence ${c.confidence}`);
  });

  it("מתעלם מהעברות גם כשהן חוזרות", () => {
    const transfers = [
      t("BIT", [2026, 5, 1], "-100.00", { countsAsSpending: false, categorySlug: "transfer.p2p" }),
      t("BIT", [2026, 6, 1], "-100.00", { countsAsSpending: false, categorySlug: "transfer.p2p" }),
      t("BIT", [2026, 7, 1], "-100.00", { countsAsSpending: false, categorySlug: "transfer.p2p" }),
    ];
    assert.deepEqual(findRecurring(transfers), []);
  });

  it("מתעלם מזיכויים חוזרים", () => {
    const credits = [
      t("החזר", [2026, 5, 1], "100.00"),
      t("החזר", [2026, 6, 1], "100.00"),
      t("החזר", [2026, 7, 1], "100.00"),
    ];
    assert.deepEqual(findRecurring(credits), []);
  });

  it("שני חיובים באותו יום לא הופכים את המחזור ל-0", () => {
    const sameDay = [
      t("קפה", [2026, 5, 1], "-10.00"),
      t("קפה", [2026, 5, 1], "-10.00"),
      t("קפה", [2026, 6, 1], "-10.00"),
      t("קפה", [2026, 7, 1], "-10.00"),
    ];
    const [c] = findRecurring(sameDay);
    assert.equal(c.occurrences, 4);
    assert.ok(c.intervalDays >= 25, `interval ${c.intervalDays}`);
  });

  it("ממוין לפי העלות השנתית", () => {
    const all = findRecurring([
      ...GYM,
      t("זול", [2026, 5, 1], "-10.00"),
      t("זול", [2026, 6, 1], "-10.00"),
      t("זול", [2026, 7, 1], "-10.00"),
    ]);
    assert.equal(all[0].merchant, 'דבליו גים בע"מ הוק');
  });
});

describe("חיוב שהופסק", () => {
  it("‏asOf קובע — לא השעון", () => {
    const c = findRecurring(GYM, { asOf: utcDate(2026, 8, 22) })[0];
    assert.equal(c.stopped, false); // 27 ימים מאז 26.7, מחזור 30

    const late = findRecurring(GYM, { asOf: utcDate(2026, 10, 1) })[0];
    assert.equal(late.stopped, true); // 67 ימים > 45

    const unknown = findRecurring(GYM)[0];
    assert.equal(unknown.stopped, null);
  });

  it("stoppedCharges מחזיר רק את מי שהפסיק", () => {
    const charges = findRecurring(GYM, { asOf: utcDate(2026, 10, 1) });
    assert.equal(stoppedCharges(charges).length, 1);
    assert.equal(stoppedCharges(findRecurring(GYM, { asOf: utcDate(2026, 8, 22) })).length, 0);
  });
});

describe("worthReviewing", () => {
  const charges = findRecurring(
    [
      ...GYM,
      t("זול", [2026, 5, 1], "-10.00"),
      t("זול", [2026, 6, 1], "-10.00"),
      t("זול", [2026, 7, 1], "-10.00"),
      t("זול", [2026, 8, 1], "-10.00"),
    ],
    { asOf: utcDate(2026, 8, 22) }
  );

  it("מסנן לפי עלות שנתית", () => {
    const list = worthReviewing(charges);
    assert.deepEqual(list.map((c) => c.merchant), ['דבליו גים בע"מ הוק']);
  });

  it("הסף ניתן להזזה", () => {
    assert.equal(worthReviewing(charges, { minAnnual: 10000 }).length, 2);
  });

  it("לא מציע לבדוק משהו שכבר הופסק", () => {
    const old = findRecurring(GYM, { asOf: utcDate(2026, 12, 1) });
    assert.deepEqual(worthReviewing(old), []);
  });
});
