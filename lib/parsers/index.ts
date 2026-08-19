/**
 * הממשק המשותף לפרסרים, וזיהוי הפורמט.
 *
 * הממשק הזה נדחה בכוונה עד עכשיו. ממשק שנגזר מדוגמה אחת הוא ניחוש —
 * הוא מקבע את המקרה הראשון ונשבר על השני. עכשיו יש שתי דוגמאות ששונות
 * זו מזו בכל מובן: XLSX מול PDF, אימות סכום כולל מול אימות שרשרת,
 * תנועות עם בית עסק מול תנועות עם תיאור בנקאי בלבד.
 *
 * מה שנשאר משותף אחרי שני המימושים הוא מה שבאמת שייך לממשק:
 *   • זיהוי — האם הפרסר הזה יודע לקרוא את הקובץ
 *   • פענוח — תנועות, מטא-דאטה של החשבון, ואימותים
 * שום דבר מעבר. במיוחד לא "איך לאמת" — כל ספק מצהיר אחרת.
 */

import { type Check, type ParsedTxn } from "./types";
import { parseMaxXlsx } from "./max";
import { parseLeumiLines } from "./leumi";

export type Provider = "MAX" | "LEUMI" | "OTHER";
export type AccountType = "BANK" | "CREDIT_CARD";
export type SourceFormat = "MAX_XLSX" | "LEUMI_PDF" | "LEUMI_XLSX" | "UNKNOWN";

export type StatementFile = { name: string; bytes: Uint8Array };

export type StatementResult = {
  format: SourceFormat;
  provider: Provider;
  accountType: AccountType;
  /** שם תצוגה לחשבון, למשל "max בהצדעה" או "עו״ש לאומי". */
  accountLabel: string;
  /** ארבע ספרות אחרונות בלבד. מספר מלא לא נשמר בשום מקום. */
  accountLast4: string | null;
  statementPeriod: string | null;
  transactions: ParsedTxn[];
  checks: Check[];
  warnings: string[];
};

export type StatementParser = {
  format: SourceFormat;
  canParse(file: StatementFile): boolean;
  parse(file: StatementFile): Promise<StatementResult>;
};

// ───────────────────────── זיהוי לפי תוכן ─────────────────────────

/**
 * חתימת הבתים הראשונה, ולא הסיומת.
 *
 * סיומת היא שם שהמשתמש שולט בו: אפשר לקרוא ל-PDF בשם ‎.xlsx ולהפך.
 * ‎"PK" הוא חתימת ZIP, ו-xlsx הוא ZIP. ‎"%PDF" מדבר בעד עצמו.
 */
const magic = (bytes: Uint8Array, sig: string) =>
  sig.split("").every((ch, i) => bytes[i] === ch.charCodeAt(0));

const isZip = (b: Uint8Array) => magic(b, "PK");
const isPdf = (b: Uint8Array) => magic(b, "%PDF");

// ───────────────────────── MAX ─────────────────────────

const maxParser: StatementParser = {
  format: "MAX_XLSX",

  canParse: (file) => isZip(file.bytes),

  async parse(file) {
    const r = parseMaxXlsx(Buffer.from(file.bytes));
    return {
      format: "MAX_XLSX",
      provider: "MAX",
      accountType: "CREDIT_CARD",
      accountLabel: r.accountLabel || "MAX",
      accountLast4: r.cardLast4,
      statementPeriod: r.statementPeriod,
      transactions: r.transactions,
      checks: r.checks,
      warnings: r.warnings,
    };
  },
};

// ───────────────────────── לאומי ─────────────────────────

const leumiParser: StatementParser = {
  format: "LEUMI_PDF",

  canParse: (file) => isPdf(file.bytes),

  async parse(file) {
    // ייבוא דינמי: זו הנקודה היחידה שמושכת את ספריית ה-PDF, והיא לא
    // צריכה להיטען כשמייבאים קובץ אקסל.
    const { extractPdfLines } = await import("./pdf-text");
    const lines = await extractPdfLines(file.bytes);
    const r = parseLeumiLines(lines);
    return {
      format: "LEUMI_PDF",
      provider: "LEUMI",
      accountType: "BANK",
      accountLabel: "עו״ש לאומי",
      accountLast4: r.accountLast4,
      statementPeriod: r.statementPeriod,
      transactions: r.transactions,
      checks: r.checks,
      warnings: r.warnings,
    };
  },
};

export const PARSERS: StatementParser[] = [maxParser, leumiParser];

// ───────────────────────── נקודת הכניסה ─────────────────────────

export class UnsupportedFileError extends Error {
  constructor(name: string) {
    super(`אין פרסר שיודע לקרוא את "${name}"`);
    this.name = "UnsupportedFileError";
  }
}

export async function parseStatement(file: StatementFile): Promise<StatementResult> {
  const parser = PARSERS.find((p) => p.canParse(file));
  if (!parser) throw new UnsupportedFileError(file.name);
  return parser.parse(file);
}

/** האם כל האימותים שהספק מאפשר עברו. נשמר ב-ImportJob.reconciled. */
export const isReconciled = (r: StatementResult) => r.checks.every((c) => c.ok);
