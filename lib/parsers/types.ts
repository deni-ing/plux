/**
 * הטיפוסים המשותפים לכל הפרסרים.
 *
 * הם מוגדרים כאיחוד מחרוזות ולא מיובאים מהלקוח של Prisma, בכוונה: הפרסרים
 * לא נוגעים במסד ולא צריכים לדעת שהוא קיים. השכבה שכותבת למסד היא זו
 * שממפה את הערכים. כך אפשר להריץ פרסר מטסט, מסקריפט או מדפדפן.
 */

export type TxnDirection = "DEBIT" | "CREDIT";
export type TxnStatus = "SETTLED" | "PENDING";

export type TxnKind =
  | "PURCHASE" | "INCOME" | "FEE" | "REFUND"
  | "TRANSFER_IN" | "TRANSFER_OUT" | "STANDING_ORDER"
  | "CARD_SETTLEMENT" | "OTHER";

export type ParsedTxn = {
  bookedAt: string;              // YYYY-MM-DD
  chargedAt: string | null;
  amount: string;                // חתום: שלילי = כסף יוצא
  currency: string;
  originalAmount: string | null;
  originalCurrency: string | null;
  fxRate: string | null;
  merchantRaw: string;
  merchant: string;
  descriptor: string | null;
  providerCategory: string | null;
  kind: TxnKind;
  direction: TxnDirection;
  status: TxnStatus;
  cardLast4: string | null;
  txnType: string | null;
  channel: string | null;
  note: string | null;
  /** << היתרה המצטברת אחרי התנועה. קיימת רק בדף בנק, ומשמשת לאימות. */
  balanceAfter: string | null;
  countsAsSpending: boolean;
  dedupHash: string;
  occurrence: number;
};

/** אימות בודד: מה הקובץ הצהיר מול מה שחישבנו. */
export type Check = { label: string; expected: string; actual: string; ok: boolean };

// ───────────────────────── כסף ─────────────────────────

/**
 * כסף מיוצג כמספר שלם של אגורות לאורך כל החישוב.
 * 0.1 + 0.2 בנקודה צפה אינו 0.3, ובאימות מול סכום מוצהר ההפרש הזה
 * הופך לכישלון. שלמים לא סובלים מזה, וגם השוואת שוויון עליהם מדויקת.
 */
export function toMinor(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function fromMinor(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  return `${sign}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}
