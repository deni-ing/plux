/**
 * חילוץ טקסט מ-PDF, כשורות.
 *
 * זה הקובץ היחיד בפרויקט שתלוי בספריית PDF, ובכוונה הוא קטן ככל האפשר.
 * כל הלוגיקה שמפרשת דף חשבון יושבת ב-leumi.ts ומקבלת מחרוזות — כלומר
 * אפשר לבדוק אותה בלי PDF בכלל. מה שקשה לבדוק מרוכז כאן ולא מתפשט.
 *
 * למה unpdf ולא pdf-parse: הוא נבנה לסביבות סרברלס, וזה בדיוק מה
 * ש-Vercel מריץ. pdf-parse נשען על התנהגות של Node מלא ונשבר שם.
 *
 * הערה על שחזור הפריסה: ספריית PDF מחזירה פריטי טקסט עם קואורדינטות,
 * לא שורות. אנחנו מקבצים לפי Y ומפזרים לפי X — כלומר בונים מחדש את
 * הרווחים. זה חשוב, כי ה-fallback בזיהוי הכיוון של השורה האחרונה
 * נשען על מיקום אופקי יחסי.
 */

export async function extractPdfLines(data: Uint8Array): Promise<string[]> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);

  const lines: string[] = [];
  const COLUMNS = 130; // רוחב וירטואלי בתווים. מספיק כדי לשמר סדר עמודות.

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const [, , width] = page.view as number[]; // [x0, y0, x1, y1]
    const content = await page.getTextContent();

    // קיבוץ לשורות לפי Y. עיגול לחצי נקודה סופג הפרשים זעירים בין
    // פריטים באותה שורה, שנובעים מגדלי גופן שונים.
    const byRow = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items as { str: string; transform: number[] }[]) {
      if (!item.str || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = Math.round(item.transform[5] * 2) / 2;
      const row = byRow.get(y) ?? [];
      row.push({ x, str: item.str });
      byRow.set(y, row);
    }

    // Y גדל כלפי מעלה בקואורדינטות PDF, ולכן סדר יורד = מלמעלה למטה.
    for (const y of [...byRow.keys()].sort((a, b) => b - a)) {
      const items = byRow.get(y)!.sort((a, b) => a.x - b.x);
      let line = "";
      for (const it of items) {
        const col = Math.max(0, Math.round((it.x / (width || 600)) * COLUMNS));
        if (col > line.length) line += " ".repeat(col - line.length);
        else if (line.length) line += " ";
        line += it.str;
      }
      lines.push(line);
    }
  }

  return lines;
}
