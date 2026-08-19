/**
 * פרסר לייצוא XLSX של MAX.
 *
 * מבנה הקובץ (נגזר מקבצים אמיתיים, לא מתיעוד):
 *   שורה 1  — שם ות.ז. של בעל הכרטיס    ← נקרא ונזרק. לא נשמר בשום מקום.
 *   שורה 2  — "7120-max בהצדעה"          ← 4 ספרות + שם הכרטיס
 *   שורה 3  — "08/2026"                  ← תקופת הדוח
 *   שורה 4  — כותרות העמודות
 *   שורה 5+ — תנועות
 *   בסוף    — "סך הכל" ואחריו שורת סכום  ← משמשת לאימות
 *
 * שתי לשוניות, והן מתנהגות אחרת לגמרי מול חשבון הבנק:
 *   • "עסקאות במועד החיוב" — נצברות לחיוב חודשי מרוכז אחד
 *   • "עסקאות חו״ל ומט״ח"  — כל אחת מחויבת בנפרד, תוך ימים
 * ההבחנה הזו קריטית: בלעדיה ההוצאות נספרות פעמיים מול דף הבנק.
 */

import { createHash } from "node:crypto";
import { readXlsx, type Cell } from "./xlsx";
import {
  type Check, type ParsedTxn, type TxnDirection, type TxnKind,
  fromMinor, toMinor,
} from "./types";

// ───────────────────────────── טיפוסים ─────────────────────────────

export type { TxnDirection, TxnStatus, TxnKind, ParsedTxn, Check } from "./types";

export type MaxParseResult = {
  format: "MAX_XLSX";
  accountLabel: string;
  cardLast4: string | null;
  statementPeriod: string | null;
  transactions: ParsedTxn[];
  checks: Check[];
  warnings: string[];
};

// ───────────────────────────── עזרי המרה ─────────────────────────────

const CURRENCY: Record<string, string> = {
  "₪": "ILS", "ש\"ח": "ILS", "$": "USD", "€": "EUR", "£": "GBP",
};

function currencyCode(raw: Cell): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  return CURRENCY[s] ?? s.toUpperCase();
}

/** "09-07-2026" → "2026-07-09". פורמט אחר נדחה במפורש ולא מנוחש. */
function toIsoDate(v: Cell): string | null {
  const s = String(v ?? "").trim();
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * שם בית העסק מגיע משורשר עם שדות נוספים, מופרדים ב-2+ רווחים:
 *   "APPLE.COM/BILL         ITUNES.COM    IE"
 * בלי הפיצול, כל וריאציה של אותו ספק נראית כבית עסק אחר, וזיהוי מנויים
 * נשבר. הבלוק הראשון הוא הספק; השאר תיאור.
 */
function splitMerchant(raw: string): { merchant: string; descriptor: string | null } {
  const parts = raw.trim().split(/\s{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { merchant: raw.trim().replace(/\s+/g, " "), descriptor: null };
  return { merchant: parts[0], descriptor: parts.slice(1).join(" ") };
}

function clean(v: Cell): string | null {
  const s = String(v ?? "").trim().replace(/\s+/g, " ");
  return s === "" ? null : s;
}

// ───────────────────────────── סיווג ─────────────────────────────

const TRANSFER_CATEGORY = "העברת כספים";
const STANDING_ORDER_NOTE = "הוראת קבע";

function classify(input: {
  minor: number;
  providerCategory: string | null;
  merchant: string;
  note: string | null;
}): { kind: TxnKind; countsAsSpending: boolean } {
  // כסף שנכנס חזרה: זיכוי או ביטול עסקה.
  if (input.minor > 0) return { kind: "REFUND", countsAsSpending: true };

  // << העברות P2P אינן צריכה. ספירה שלהן כהוצאה מנפחת כל דוח,
  //    ובמיוחד כשהצד השני הוא אותו אדם שמעביר לעצמו.
  if (input.providerCategory === TRANSFER_CATEGORY || input.merchant.toUpperCase() === "BIT") {
    return { kind: "TRANSFER_OUT", countsAsSpending: false };
  }

  // << "הוראת קבע" בעמודת ההערות היא הצהרה של הספק, לא ניחוש סטטיסטי.
  //    זו הוצאה לכל דבר, ולכן נספרת.
  if (input.note?.startsWith(STANDING_ORDER_NOTE)) {
    return { kind: "STANDING_ORDER", countsAsSpending: true };
  }

  return { kind: "PURCHASE", countsAsSpending: true };
}

// ───────────────────────────── הפרסר ─────────────────────────────

const HEADER_ANCHOR = "תאריך עסקה";
const TOTAL_LABEL = "סך הכל";
const FOREIGN_SHEET = /חו["״']?ל|מט["״']?ח/;
const PENDING_SECTION = /טרם\s*נקלט/;

const COL = {
  bookedAt: "תאריך עסקה",
  merchant: "שם בית העסק",
  category: "קטגוריה",
  last4: "4 ספרות אחרונות של כרטיס האשראי",
  txnType: "סוג עסקה",
  amount: "סכום חיוב",
  currency: "מטבע חיוב",
  originalAmount: "סכום עסקה מקורי",
  originalCurrency: "מטבע עסקה מקורי",
  chargedAt: "תאריך חיוב",
  note: "הערות",
  channel: "אופן ביצוע ההעסקה",
  fxRate: "שער המרה",
} as const;

function headerMap(row: Cell[]): Map<string, number> {
  const m = new Map<string, number>();
  row.forEach((cell, i) => {
    const text = String(cell ?? "").trim();
    if (text) m.set(text, i);
  });
  return m;
}

function pick(headers: Map<string, number>, label: string): number {
  const exact = headers.get(label);
  if (exact !== undefined) return exact;
  for (const [k, v] of headers) if (k.startsWith(label)) return v;
  return -1;
}

export function parseMaxXlsx(buf: Buffer): MaxParseResult {
  const sheets = readXlsx(buf);
  const warnings: string[] = [];
  const checks: Check[] = [];
  const transactions: ParsedTxn[] = [];

  let accountLabel = "";
  let cardLast4: string | null = null;
  let statementPeriod: string | null = null;

  for (const sheet of sheets) {
    const headerRow = sheet.rows.findIndex(
      (r) => r.some((c) => String(c ?? "").trim() === HEADER_ANCHOR)
    );
    if (headerRow === -1) {
      warnings.push(`הלשונית "${sheet.name}" דולגה — לא נמצאה שורת כותרות`);
      continue;
    }

    // ── מטא-דאטה מהשורות שמעל הכותרות ──
    // שורה 0 היא שם ות.ז. ואינה נקראת בכלל. מה שלא נקרא לא יכול לדלוף.
    if (!accountLabel && headerRow >= 2) {
      const raw = String(sheet.rows[headerRow - 2]?.[0] ?? "").trim();
      const m = /^(\d{4})-(.+)$/.exec(raw);
      if (m) { cardLast4 = m[1]; accountLabel = m[2].trim(); }
      else if (raw) { accountLabel = raw; }
    }
    if (!statementPeriod && headerRow >= 1) {
      const raw = String(sheet.rows[headerRow - 1]?.[0] ?? "").trim();
      if (/^\d{2}\/\d{4}$/.test(raw)) statementPeriod = raw;
    }

    const headers = headerMap(sheet.rows[headerRow]);
    const idx = Object.fromEntries(
      Object.entries(COL).map(([k, label]) => [k, pick(headers, label)])
    ) as Record<keyof typeof COL, number>;

    for (const [key, i] of Object.entries(idx)) {
      if (i === -1 && key !== "fxRate" && key !== "channel") {
        warnings.push(`הלשונית "${sheet.name}": עמודה חסרה — ${COL[key as keyof typeof COL]}`);
      }
    }

    const isForeign = FOREIGN_SHEET.test(sheet.name);
    // לשונית שלמה של ממתינות, למשל "עסקאות שאושרו וטרם נקלטו".
    let status: TxnStatus = PENDING_SECTION.test(sheet.name) ? "PENDING" : "SETTLED";
    // << שני סכומים, ובכוונה. chargeSum סופר רק את עמודת "סכום חיוב" —
    //    זה בדיוק מה ש-MAX מסכמת ב"סך הכל", ולכן רק הוא מושווה מולה.
    //    pendingSum הוא הסכום המקורי של מה שטרם חויב; הוא מוצג ולא מאומת,
    //    כי אין מולו הצהרה. ערבוב השניים הופך אימות אמיתי לרעש.
    let chargeSum = 0;
    let pendingSum = 0;
    let pendingCount = 0;
    let declaredTotal: number | null = null;
    let sawTotalLabel = false;
    const rowsInSheet: ParsedTxn[] = [];

    for (let r = headerRow + 1; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? [];
      const first = String(row[0] ?? "").trim();

      if (sawTotalLabel) {
        // השורה שאחרי "סך הכל" מכילה את הסכום, בצורה "6033.14₪".
        const t = toMinor(first.replace(/[^\d.,-]/g, ""));
        if (t !== null) declaredTotal = t;
        break;
      }
      if (first === TOTAL_LABEL) { sawTotalLabel = true; continue; }
      if (!first) continue;

      const bookedAt = toIsoDate(row[idx.bookedAt]);
      if (!bookedAt) {
        // שורה שאינה תנועה: כותרת מקטע, למשל "עסקאות שאושרו וטרם נקלטו".
        if (PENDING_SECTION.test(first)) status = "PENDING";
        else warnings.push(`הלשונית "${sheet.name}" שורה ${r + 1}: לא תנועה ולא מקטע מוכר — "${first}"`);
        continue;
      }

      // << בעסקאות ממתינות עמודת סכום החיוב ריקה. הסכום נלקח מהעסקה המקורית.
      const charged = toMinor(row[idx.amount]);
      let minor = charged;
      let currency = currencyCode(row[idx.currency]) ?? "ILS";
      let rowStatus = status;
      if (minor === null) {
        minor = toMinor(row[idx.originalAmount]);
        currency = currencyCode(row[idx.originalCurrency]) ?? currency;
        rowStatus = "PENDING";
      }
      if (minor === null) {
        warnings.push(`הלשונית "${sheet.name}" שורה ${r + 1}: אין סכום — דולגה`);
        continue;
      }

      if (charged === null) { pendingSum += minor; pendingCount++; }
      else chargeSum += charged;

      // MAX מחזירה חיובים כמספר חיובי. הסימן מאוחד כאן: שלילי = כסף יוצא.
      const signed = -minor;

      const merchantRaw = String(row[idx.merchant] ?? "").trim();
      const { merchant, descriptor } = splitMerchant(merchantRaw);
      const note = clean(row[idx.note]);
      const providerCategory = clean(row[idx.category]);
      const last4 = clean(row[idx.last4]);
      const originalMinor = toMinor(row[idx.originalAmount]);
      const originalCurrency = currencyCode(row[idx.originalCurrency]);

      const { kind, countsAsSpending } = classify({
        minor: signed, providerCategory, merchant, note,
      });

      // << ה-hash בנוי רק משדות שיציבים במעבר ממתין→נקלט. סכום החיוב,
      //    הסטטוס ותאריך החיוב משתנים בדיוק במעבר הזה, ולכן אינם נכללים —
      //    אחרת אותה עסקה הייתה נכנסת פעמיים.
      const dedupHash = createHash("sha256")
        .update([
          bookedAt,
          merchantRaw,
          originalMinor === null ? "" : String(originalMinor),
          originalCurrency ?? "",
          last4 ?? "",
        ].join("|"))
        .digest("hex");

      rowsInSheet.push({
        bookedAt,
        chargedAt: toIsoDate(row[idx.chargedAt]),
        amount: fromMinor(signed),
        currency,
        originalAmount: originalMinor === null ? null : fromMinor(originalMinor),
        originalCurrency,
        fxRate: idx.fxRate === -1 ? null : (clean(row[idx.fxRate]) ?? null),
        merchantRaw,
        merchant,
        descriptor,
        providerCategory,
        kind,
        direction: signed < 0 ? "DEBIT" : "CREDIT",
        status: rowStatus,
        cardLast4: last4,
        txnType: clean(row[idx.txnType]),
        channel: idx.channel === -1 ? null : clean(row[idx.channel]),
        note,
        // << עסקאות חו״ל מחויבות בבנק אחת-אחת, ולכן הן כבר מיוצגות שם.
        //    עסקאות מקומיות נצברות לחיוב מרוכז שיסומן CARD_SETTLEMENT ויוחרג.
        countsAsSpending,
        dedupHash,
        balanceAfter: null,
        occurrence: 0,
      });
    }

    // << אותו בית עסק, אותו סכום, אותו יום — קורה באמת (מכונת שתייה).
    //    כל אחת היא עסקה נפרדת, ולכן מקבלת מספר סידורי במקום להימחק.
    const seen = new Map<string, number>();
    for (const t of rowsInSheet) {
      const n = seen.get(t.dedupHash) ?? 0;
      t.occurrence = n;
      seen.set(t.dedupHash, n + 1);
    }
    transactions.push(...rowsInSheet);

    checks.push({
      label: `סכום החיוב בלשונית "${sheet.name}"`,
      expected: declaredTotal === null ? "—" : fromMinor(declaredTotal),
      actual: fromMinor(chargeSum),
      ok: declaredTotal !== null && declaredTotal === chargeSum,
    });
    if (pendingCount > 0) {
      // מוצג כדי שהמספר לא ייעלם, אך אינו אימות — ל-MAX אין מה להצהיר עליו.
      warnings.push(
        `הלשונית "${sheet.name}": ${pendingCount} עסקאות טרם נקלטו, בסך ${fromMinor(pendingSum)} — ` +
        `אינן נכללות ב"סך הכל" כי עוד לא חויבו`
      );
    }
    if (declaredTotal === null) {
      warnings.push(`הלשונית "${sheet.name}": לא נמצאה שורת "סך הכל" — אין מול מה לאמת`);
    }

    if (isForeign) {
      const noFx = rowsInSheet.filter((t) => t.originalCurrency && t.originalCurrency !== "ILS" && !t.fxRate);
      if (noFx.length) warnings.push(`הלשונית "${sheet.name}": ${noFx.length} עסקאות מט״ח בלי שער המרה`);
    }
  }

  return {
    format: "MAX_XLSX",
    accountLabel,
    cardLast4,
    statementPeriod,
    transactions,
    checks,
    warnings,
  };
}
