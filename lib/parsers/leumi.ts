/**
 * פרסר לדף חשבון של בנק לאומי.
 *
 * הקובץ מגיע כ-PDF, אבל הפונקציה כאן מקבלת **שורות טקסט** ולא PDF.
 * ההפרדה מכוונת: חילוץ הטקסט דורש ספרייה חיצונית ותלוי בסביבת הריצה,
 * ואילו הלוגיקה שמפרשת אותו היא קוד טהור שאפשר לבדוק על מחרוזות.
 * החלק שקשה לבדוק מצומצם לקובץ אחד קטן — pdf-text.ts.
 *
 * ── מה שמייחד את דף החשבון ─────────────────────────────────────────
 *
 * לכל שורה יש **יתרה מצטברת**. השורות מסודרות מהחדש לישן, ולכן:
 *
 *     יתרה[i] − יתרה[i+1] = הסכום החתום של שורה i
 *
 * מכאן שני דברים שאין להם מקבילה בקובץ MAX:
 *
 *   1. הסימן (חובה או זכות) **נגזר מהמספרים**, לא ממיקום העמודה בעמוד.
 *      זה קריטי, כי מיקומי העמודות בפלט הטקסט אינם עקביים — נמצאו שישה
 *      היסטים שונים באותו מסמך. לוגיקה שנשענת עליהם שבירה מטבעה.
 *
 *   2. כל שורה מאמתת את עצמה מול שכנתה. במקום סכום כולל אחד לבדוק מולו,
 *      יש כאן N−1 אימותים בלתי תלויים. שורה שנקראה שגוי שוברת את השרשרת
 *      בדיוק במקום שבו היא נמצאת.
 */

import { createHash } from "node:crypto";
import {
  type Check, type ParsedTxn, type TxnDirection, type TxnKind,
  fromMinor, toMinor,
} from "./types";

export type LeumiParseResult = {
  format: "LEUMI_PDF";
  accountLast4: string | null;
  statementPeriod: string | null;
  transactions: ParsedTxn[];
  checks: Check[];
  warnings: string[];
};

// ───────────────────────── ניקוי טקסט ─────────────────────────

/**
 * תווי בקרה דו-כיווניים. הם בלתי נראים, אך נספרים כתווים ושוברים כל
 * ביטוי רגולרי שמניח שהמחרוזת מכילה רק מה שרואים.
 */
const BIDI = /[‎‏‪-‮⁦-⁩]/g;

const stripBidi = (s: string) => s.replace(BIDI, "");

const DATE = /(\d{2})\.(\d{2})\.(\d{4})/;
const AMOUNT = /₪\s*([\d,]+\.\d{2})/g;

type RawRow = {
  line: number;
  bookedAt: string;
  description: string;
  /** הסכומים לפי סדר הופעתם, כולל היתרה. תמיד שניים בשורת תנועה. */
  amounts: { minor: number; at: number }[];
};

function readRows(lines: string[]): { rows: RawRow[]; skipped: number } {
  const rows: RawRow[] = [];
  let skipped = 0;

  lines.forEach((raw, i) => {
    const line = stripBidi(raw).trim();
    if (!line) return;

    const d = DATE.exec(line);
    if (!d) return;

    const amounts: { minor: number; at: number }[] = [];
    for (const m of line.matchAll(AMOUNT)) {
      const minor = toMinor(m[1].replace(/,/g, ""));
      if (minor !== null) amounts.push({ minor, at: m.index ?? 0 });
    }

    // שורת תנועה מכילה בדיוק שניים: היתרה והסכום. כותרות עמודות,
    // כותרות עמוד ושורות סיכום ייפלו כאן ולא ייספרו כתנועה.
    if (amounts.length !== 2) { skipped++; return; }

    const description = line
      .replace(AMOUNT, " ")
      .replace(DATE, " ")
      .replace(/\s+/g, " ")
      .trim();

    rows.push({
      line: i + 1,
      bookedAt: `${d[3]}-${d[2]}-${d[1]}`,
      description,
      amounts,
    });
  });

  return { rows, skipped };
}

// ───────────────────────── זיהוי עמודת היתרה ─────────────────────────

/**
 * איזה משני הסכומים הוא היתרה?
 *
 * לא מניחים סדר. מנסים את שתי האפשרויות וסופרים בכמה שורות השרשרת
 * מסתדרת; המנצח הוא זה שמסביר את הנתונים. כך הפרסר עמיד גם אם ספריית
 * חילוץ הטקסט תחזיר את השדות בסדר הפוך — מה שקורה בקלות בטקסט דו-כיווני.
 */
function pickBalanceIndex(rows: RawRow[]): { index: 0 | 1; matches: number } {
  let best: { index: 0 | 1; matches: number } = { index: 0, matches: -1 };

  for (const index of [0, 1] as const) {
    const other = index === 0 ? 1 : 0;
    let matches = 0;
    for (let i = 0; i < rows.length - 1; i++) {
      const delta = rows[i].amounts[index].minor - rows[i + 1].amounts[index].minor;
      if (Math.abs(delta) === rows[i].amounts[other].minor) matches++;
    }
    if (matches > best.matches) best = { index, matches };
  }
  return best;
}

/**
 * השורה הישנה ביותר היא היחידה שאין אחריה יתרה להשוות מולה, ולכן הסימן
 * שלה אינו נגזר. במקום לנחש, לומדים מהמסמך עצמו: מהשורות שכן אומתו,
 * מחשבים את המיקום האופקי האופייני של סכום חובה מול סכום זכות, ומסווגים
 * לפי הקרוב. אין כאן מספר קסם — הסף נגזר מהקובץ הנוכחי.
 */
function calibrateColumn(
  rows: RawRow[], balanceIdx: 0 | 1, signs: (1 | -1 | null)[]
): ((row: RawRow) => TxnDirection) | null {
  const amountIdx = balanceIdx === 0 ? 1 : 0;
  const debit: number[] = [], credit: number[] = [];

  rows.forEach((r, i) => {
    const s = signs[i];
    if (s === null) return;
    (s < 0 ? debit : credit).push(r.amounts[amountIdx].at);
  });

  if (debit.length < 3 || credit.length < 3) return null;

  const mid = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const dm = mid(debit), cm = mid(credit);
  if (dm === cm) return null;

  return (row) => {
    const at = row.amounts[amountIdx].at;
    return Math.abs(at - dm) <= Math.abs(at - cm) ? "DEBIT" : "CREDIT";
  };
}

// ───────────────────────── סיווג ─────────────────────────

/**
 * << `מקס איט פיננ` הוא החיוב המרוכז של כרטיס האשראי. הוא מופיע כאן
 *    כשורה אחת, ובקובץ MAX כעשרות שורות — אותו כסף. ספירה של שניהם
 *    מכפילה את ההוצאות. בדף הזה 86 מתוך 169 השורות הן כאלה, כלומר
 *    יותר ממחצית הקובץ. לכן countsAsSpending=false דווקא כאן, ולא ב-MAX:
 *    שם יש בית עסק וקטגוריה, וכאן רק סכום.
 */
const RULES: { test: RegExp; kind: TxnKind; spending: boolean; onlyOn?: TxnDirection }[] = [
  { test: /מקס\s*איט|כרטיסי\s*אשראי|ישראכרט|כאל|לאומי\s*קארד/, kind: "CARD_SETTLEMENT", spending: false },
  { test: /^עמל\.|עמלה/, kind: "FEE", spending: true },
  { test: /^החזר/, kind: "REFUND", spending: false },
  { test: /הוראת\s*קבע/, kind: "STANDING_ORDER", spending: true },
  { test: /ביט|העברה\s*דיגיטל|תשלום\s*מיידי|הע\s*\.?\s*אינטרנט|העברה/, kind: "TRANSFER_IN", spending: false, onlyOn: "CREDIT" },
  // << מ-26.08, החלטת משתמש: תשלום שיצא דרך ביט הוא כסף שיצא בפועל ולא
  //    חוזר — לא כמו העברה כללית (בין חשבונות של אותו אדם, או תשלום
  //    מיידי אחר) שנשארת מוחרגת. חייב לבוא *לפני* הכלל הכללי למטה, כי
  //    שניהם היו תואמים לאותה שורה ורק הראשון שמתאים מכריע. הכלל
  //    המקביל לקטגוריה עצמה (transfers_out.bit) ב-lib/classify/rules.ts.
  { test: /העברה\s*ב\s*BIT/i, kind: "TRANSFER_OUT", spending: true, onlyOn: "DEBIT" },
  { test: /ביט|העברה\s*דיגיטל|תשלום\s*מיידי|הע\s*\.?\s*אינטרנט|העברה/, kind: "TRANSFER_OUT", spending: false, onlyOn: "DEBIT" },
  { test: /מילואי|מענק/, kind: "INCOME", spending: false },
];

function classify(description: string, direction: TxnDirection): { kind: TxnKind; countsAsSpending: boolean } {
  for (const r of RULES) {
    if (r.onlyOn && r.onlyOn !== direction) continue;
    if (r.test.test(description)) return { kind: r.kind, countsAsSpending: r.spending };
  }
  // << ברירת מחדל לפי כיוון בלבד. סיווג מדויק יותר הוא תפקידו של מנוע
  //    הכללים בהמשך, ולא של הפרסר — הפרסר לא אמור לנחש.
  return direction === "CREDIT"
    ? { kind: "INCOME", countsAsSpending: false }
    : { kind: "PURCHASE", countsAsSpending: true };
}

// ───────────────────────── מטא-דאטה ─────────────────────────

function readMeta(lines: string[]): { accountLast4: string | null; statementPeriod: string | null } {
  let accountLast4: string | null = null;
  let statementPeriod: string | null = null;

  for (const raw of lines.slice(0, 40)) {
    const line = stripBidi(raw);

    // << מספר החשבון נקרא, ומיד נזרקות ממנו כל הספרות פרט לארבע האחרונות.
    //    שם בעל החשבון, שמופיע באותו אזור, אינו נקרא כלל.
    if (!accountLast4 && /מספר\s*חשבון/.test(line)) {
      const digits = (line.match(/[\d-]{6,}/)?.[0] ?? "").replace(/\D/g, "");
      if (digits.length >= 4) accountLast4 = digits.slice(-4);
    }

    if (!statementPeriod && /לתקופה/.test(line)) {
      const dates = line.match(/\d{2}\.\d{2}\.\d{4}/g);
      if (dates?.length === 2) statementPeriod = `${dates[1]} - ${dates[0]}`;
    }
  }
  return { accountLast4, statementPeriod };
}

// ───────────────────────── הפרסר ─────────────────────────

export function parseLeumiLines(lines: string[]): LeumiParseResult {
  const warnings: string[] = [];
  const checks: Check[] = [];
  const { accountLast4, statementPeriod } = readMeta(lines);

  const { rows } = readRows(lines);
  if (rows.length === 0) {
    return {
      format: "LEUMI_PDF", accountLast4, statementPeriod,
      transactions: [], checks: [{ label: "שורות תנועה", expected: "≥1", actual: "0", ok: false }],
      warnings: ["לא נמצאה אף שורת תנועה — ייתכן שחילוץ הטקסט נכשל"],
    };
  }

  const { index: balanceIdx, matches } = pickBalanceIndex(rows);
  const amountIdx = balanceIdx === 0 ? 1 : 0;
  const links = rows.length - 1;

  checks.push({
    label: "שרשרת היתרות",
    expected: `${links}/${links}`,
    actual: `${matches}/${links}`,
    ok: matches === links,
  });

  // הסימן של כל שורה, מההפרש מול השורה שאחריה (הישנה יותר).
  const signs: (1 | -1 | null)[] = rows.map((_, i) => {
    if (i === rows.length - 1) return null;
    const delta = rows[i].amounts[balanceIdx].minor - rows[i + 1].amounts[balanceIdx].minor;
    if (Math.abs(delta) !== rows[i].amounts[amountIdx].minor) {
      warnings.push(
        `שורה ${rows[i].line} (${rows[i].bookedAt}, ${rows[i].description}): ` +
        `הפרש היתרות ${fromMinor(delta)} אינו תואם לסכום ${fromMinor(rows[i].amounts[amountIdx].minor)}`
      );
      return null;
    }
    return delta < 0 ? -1 : 1;
  });

  const fallback = calibrateColumn(rows, balanceIdx, signs);
  const transactions: ParsedTxn[] = [];
  let unverified = 0;

  rows.forEach((row, i) => {
    const magnitude = row.amounts[amountIdx].minor;
    const sign = signs[i];

    let direction: TxnDirection;
    if (sign !== null) {
      direction = sign < 0 ? "DEBIT" : "CREDIT";
    } else if (fallback) {
      direction = fallback(row);
      unverified++;
      warnings.push(
        `שורה ${row.line} (${row.bookedAt}, ${row.description}): הכיוון לא נגזר מהיתרות ` +
        `ונקבע לפי מיקום העמודה — ${direction}. זו השורה הישנה ביותר, שאין אחריה יתרה להשוות מולה.`
      );
    } else {
      direction = "DEBIT";
      unverified++;
      warnings.push(`שורה ${row.line}: לא ניתן לקבוע כיוון. סומן DEBIT כברירת מחדל.`);
    }

    const signed = direction === "DEBIT" ? -magnitude : magnitude;
    const { kind, countsAsSpending } = classify(row.description, direction);

    // << ה-hash כולל את היתרה. בדף בנק אין מזהה תנועה, ושתי תנועות זהות
    //    באותו יום נבדלות זו מזו רק ביתרה שאחריהן — שהיא ייחודית מעצם הגדרתה.
    const dedupHash = createHash("sha256")
      .update([
        row.bookedAt,
        row.description,
        String(signed),
        String(row.amounts[balanceIdx].minor),
      ].join("|"))
      .digest("hex");

    transactions.push({
      bookedAt: row.bookedAt,
      chargedAt: null,
      amount: fromMinor(signed),
      currency: "ILS",
      originalAmount: null,
      originalCurrency: null,
      fxRate: null,
      merchantRaw: row.description,
      merchant: row.description,
      descriptor: null,
      providerCategory: null,
      kind,
      direction,
      status: "SETTLED",
      cardLast4: null,
      txnType: null,
      channel: null,
      note: null,
      balanceAfter: fromMinor(row.amounts[balanceIdx].minor),
      countsAsSpending,
      // << דף חשבון בנק: החיוב *הוא* התנועה, אין תאריך חיוב עתידי נפרד.
      individualChargeDate: false,
      dedupHash,
      occurrence: 0,
    });
  });

  const seen = new Map<string, number>();
  for (const t of transactions) {
    const n = seen.get(t.dedupHash) ?? 0;
    t.occurrence = n;
    seen.set(t.dedupHash, n + 1);
  }

  checks.push({
    label: "שורות עם כיוון מאומת",
    expected: String(rows.length),
    actual: String(rows.length - unverified),
    ok: unverified <= 1, // השורה הישנה ביותר לעולם אינה ניתנת לאימות
  });

  return { format: "LEUMI_PDF", accountLast4, statementPeriod, transactions, checks, warnings };
}
