/**
 * קורא XLSX מינימלי, בלי שום תלות חיצונית.
 *
 * קובץ xlsx הוא ארכיון ZIP שבתוכו XML. הקורא הזה עושה בדיוק שני דברים:
 * פורק את ה-ZIP (zlib של Node), וסורק את ה-XML של הגיליונות.
 *
 * למה לא ספרייה: הקלט כאן הוא קובץ שהמשתמש מעלה — כלומר קלט לא מהימן
 * שנכנס ישירות לשרת. ספריות xlsx מלאות תומכות בנוסחאות, מאקרו וקישורים
 * חיצוניים, וכל אלה שטח תקיפה שאנחנו לא צריכים. כאן נקראים תאים בלבד.
 *
 * מה לא נתמך, במכוון: נוסחאות (נקרא הערך המחושב), עיצוב, ותאריכי סריאל
 * של אקסל. MAX מייצאת תאריכים כטקסט, ולכן אין צורך — אם פורמט אחר יגיע
 * עם סריאל, זה ייפול על ההמרה ולא יעבור בשקט.
 */

import { inflateRawSync } from "node:zlib";

export type Cell = string | number | null;
export type Sheet = { name: string; rows: Cell[][] };

// ───────────────────────────── ZIP ─────────────────────────────

function findEocd(buf: Buffer): number {
  // ה-EOCD יושב בסוף הקובץ, אבל עשוי להיות אחריו comment באורך משתנה,
  // ולכן מחפשים אחורה מהסוף. 22 = גודל EOCD מינימלי, 0xFFFF = comment מקסימלי.
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  throw new Error("not a zip file (no end-of-central-directory record)");
}

function unzip(buf: Buffer): Map<string, Buffer> {
  const eocd = findEocd(buf);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("corrupt central directory");

    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);

    // הכותרת המקומית מכילה שוב את אורכי השם וה-extra, והם עשויים להיות
    // שונים מאלה שבספרייה המרכזית. חובה לקרוא אותם משם.
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compressedSize);

    out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// ───────────────────────────── XML ─────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'",
};

function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[code] ?? m;
  });
}

/** כל הטקסט שבתוך תגי <t> של המקטע — כולל פיצול לריצות עיצוב (<r>). */
function textOf(fragment: string): string {
  let out = "";
  const re = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) out += decodeXml(m[1] ?? "");
  return out;
}

function sharedStrings(files: Map<string, Buffer>): string[] {
  const xml = files.get("xl/sharedStrings.xml")?.toString("utf8");
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si>([\s\S]*?)<\/si>|<si\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(textOf(m[1] ?? ""));
  return out;
}

/** "BC" → 54. אינדקס מבוסס 0. */
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function parseSheet(xml: string, strings: string[]): Cell[][] {
  const rows: Cell[][] = [];
  const rowRe = /<row[^>]*\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;

  while ((rm = rowRe.exec(xml)) !== null) {
    const rowIdx = parseInt(rm[1], 10) - 1;
    const cells: Cell[] = [];

    // תא ריק נכתב כתג סוגר-עצמי (<c r="P7"/>). ביטוי רגולרי אחד שמנסה
    // לכסות את שתי הצורות בולע בשקט את התא הבא, ולכן הפתיחה והסגירה
    // נקראות בנפרד.
    const rowXml = rm[2];
    const cellRe = /<c\b([^>]*)>/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowXml)) !== null) {
      let attrs = cm[1] ?? "";
      let body = "";
      if (attrs.endsWith("/")) {
        attrs = attrs.slice(0, -1);
      } else {
        const end = rowXml.indexOf("</c>", cellRe.lastIndex);
        body = end === -1 ? "" : rowXml.slice(cellRe.lastIndex, end);
        cellRe.lastIndex = end === -1 ? rowXml.length : end + 4;
      }
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "n";
      const ci = ref ? colIndex(ref) : cells.length;

      let value: Cell = null;
      if (type === "s") {
        const i = parseInt(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "", 10);
        value = Number.isFinite(i) ? (strings[i] ?? null) : null;
      } else if (type === "inlineStr") {
        value = textOf(body);
      } else if (type === "str" || type === "e") {
        value = decodeXml(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "");
      } else if (type === "b") {
        value = /<v>1<\/v>/.test(body) ? "TRUE" : "FALSE";
      } else {
        const raw = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(body)?.[1];
        value = raw === undefined || raw === "" ? null : Number(raw);
      }

      while (cells.length < ci) cells.push(null);
      cells[ci] = value;
    }

    while (rows.length < rowIdx) rows.push([]);
    rows[rowIdx] = cells;
  }
  return rows;
}

// ───────────────────────────── API ─────────────────────────────

export function readXlsx(buf: Buffer): Sheet[] {
  const files = unzip(buf);
  const strings = sharedStrings(files);

  const wb = files.get("xl/workbook.xml")?.toString("utf8");
  if (!wb) throw new Error("not an xlsx file (xl/workbook.xml missing)");

  // rId → נתיב הגיליון בפועל. הסדר ב-workbook.xml הוא סדר הלשוניות,
  // אבל שמות הקבצים לא בהכרח sheet1, sheet2 — ולכן עוברים דרך ה-rels.
  const relsXml = files.get("xl/_rels/workbook.xml.rels")?.toString("utf8") ?? "";
  const rels = new Map<string, string>();
  for (const m of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
    const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }

  const sheets: Sheet[] = [];
  for (const m of wb.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const attrs = m[1];
    const name = decodeXml(/\bname="([^"]*)"/.exec(attrs)?.[1] ?? "");
    const rid = /\br:id="([^"]+)"/.exec(attrs)?.[1] ?? "";
    const path = "xl/" + (rels.get(rid) ?? "");
    const xml = files.get(path)?.toString("utf8");
    if (!xml) continue;
    sheets.push({ name, rows: parseSheet(xml, strings) });
  }

  if (sheets.length === 0) throw new Error("xlsx contains no readable sheets");
  return sheets;
}
