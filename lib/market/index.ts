/**
 * טיקרי שוק כלליים — S&P 500, נאסד"ק 100, Apple, Nvidia. בהשראת
 * ווידג'ט ה-Stocks של iPhone: מספר + שינוי יומי לכל אחד, שום דבר
 * מעבר לזה. לא קשור לכסף של המשתמש בשום צורה — קונטקסט, לא נתון
 * פיננסי שלו, ולכן חי מחוץ ל-withCurrentUser/RLS ולא דורש userId.
 *
 * ─── שני ניסיונות קודמים על S&P 500, ולמה שניהם נזנחו ───
 *
 * ‏1. Stooq (בלי מפתח בכלל) — נחסם בפועל מאחורי אתגר JS אנטי-בוט
 *    ששרת לא יכול לפתור. אומת עם לוג אבחון אמיתי: הגוף שחזר מה-fetch
 *    היה עמוד אתגר (JS שמחשב SHA-256 ופונה ל-/__verify), לא CSV.
 * ‏2. סימול מדד ישיר מול Twelve Data (למשל SPX/IXIC) — דף ה-Indices
 *    הרשמי שלהם אמר "coming soon" נכון לרגע הכתיבה, כלומר לא בטוח
 *    שסימולי מדד נתמכים בתוכנית החינמית.
 *
 * ‏במקום שני המדדים (S&P 500, נאסד"ק 100) יש כאן ETF שעוקב אחריהם
 * כמעט 1:1 באחוזי שינוי יומי (לא במחיר המוחלט): SPY ל-S&P 500,
 * QQQ לנאסד"ק 100. אלה מניות/ETF רגילים לכל דבר — נתמכים בוודאות
 * בתוכנית החינמית של Twelve Data. בגלל זה התוויות אומרות "S&P 500
 * (SPY)" ו-'נאסד"ק 100 (QQQ)' ולא שם המדד הגולמי — שקיפות על המקור.
 * ‏Apple ו-Nvidia הן מניות רגילות, בלי הצורך בקיצור דומה.
 *
 * ‏מפתח: `TWELVE_DATA_API_KEY` בסביבה (חינמי, twelvedata.com). בלי
 * מפתח מוגדר — כל הטיקרים מוחזרים כרשימה ריקה, לא זריקת שגיאה.
 * כל טיקר נשלף בנפרד ונכשל בנפרד: אם אחד מהם נופל (סימול לא נתמך,
 * שגיאת רשת), שאר הטיקרים עדיין מוצגים — בדיוק כמו שכרטיס יתרה
 * שנעלם לא מפיל את שאר דף הבית.
 */

export type MarketQuote = {
  symbol: string;
  label: string;
  value: number;
  change: number;
  changePct: number;
  asOf: string;
};

const TICKERS: { symbol: string; label: string }[] = [
  { symbol: "SPY", label: "S&P 500 (SPY)" },
  { symbol: "QQQ", label: 'נאסד"ק 100 (QQQ)' },
  { symbol: "AAPL", label: "Apple" },
  { symbol: "NVDA", label: "Nvidia" },
];

type TwelveDataQuote = {
  close?: string;
  change?: string;
  percent_change?: string;
  datetime?: string;
  status?: string;
  message?: string;
  code?: number;
};

async function fetchQuote(symbol: string, label: string, apiKey: string): Promise<MarketQuote | null> {
  try {
    const url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${apiKey}`;
    const res = await fetch(url, { next: { revalidate: 300 } });
    if (!res.ok) {
      console.error(`[market] twelvedata response not ok for ${symbol}:`, res.status, res.statusText);
      return null;
    }

    const data = (await res.json()) as TwelveDataQuote;
    if (data.status === "error") {
      console.error(`[market] twelvedata error for ${symbol}:`, data.code, data.message);
      return null;
    }

    const value = Number(data.close);
    const change = Number(data.change);
    const changePct = Number(data.percent_change);
    if (!Number.isFinite(value) || !Number.isFinite(change) || !Number.isFinite(changePct)) {
      console.error(`[market] unexpected twelvedata payload for ${symbol}:`, JSON.stringify(data).slice(0, 500));
      return null;
    }

    return { symbol, label, value, change, changePct, asOf: data.datetime ?? "" };
  } catch (err) {
    console.error(`[market] fetchQuote(${symbol}) threw:`, err);
    return null;
  }
}

export async function fetchMarketQuotes(): Promise<MarketQuote[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) {
    console.error(
      "[market] TWELVE_DATA_API_KEY לא מוגדר — הירשם בחינם ב-twelvedata.com והוסף אותו ל-.env"
    );
    return [];
  }

  const results = await Promise.all(TICKERS.map((t) => fetchQuote(t.symbol, t.label, apiKey)));
  return results.filter((q): q is MarketQuote => q !== null);
}
