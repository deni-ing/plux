/**
 * ווידג'ט השוק במסך הבית — S&P 500, נאסד"ק 100, Apple, Nvidia,
 * בהשראת אפליקציית ה-Stocks של iPhone. קונטקסט רקע, לא נתון על הכסף
 * של המשתמש (ראו lib/market). המחירים נקובים בדולר — Intl.NumberFormat
 * רגיל, לא formatILS.
 *
 * << עיצוב: כרטיס אחד מאוחד (לא ריבוי pills צפים) עם קו הפרדה דק בין
 *    התאים — אותה שפה בדיוק כמו TopCategoryTiles בדשבורד
 *    (components/dashboard/category-donut.tsx), כדי שזה ירגיש כמו
 *    חלק מהאפליקציה ולא ווידג'ט מודבק. נקודת "חי" פועמת (animate-ping)
 *    היא הפלרטוט החזותי היחיד כאן — משמעותית (מסמנת נתון בזמן אמת),
 *    לא קישוט גרידא, ובכוונה לא הוספתי שום דבר נוסף סביבה.
 */

import type { MarketQuote } from "../../lib/market";

const numberFormat = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function TrendArrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 12 12" width="8" height="8" aria-hidden className="shrink-0">
      {up ? <path d="M6 2l5 7H1z" fill="currentColor" /> : <path d="M6 10L1 3h10z" fill="currentColor" />}
    </svg>
  );
}

function TickerCell({ quote }: { quote: MarketQuote }) {
  const positive = quote.changePct >= 0;
  const tone = positive ? "bg-good/15 text-good" : "bg-critical/15 text-critical";

  return (
    <div className="bg-surface p-3">
      <p className="truncate text-[11px] font-medium text-muted">{quote.label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-ink">
        {numberFormat.format(quote.value)}
      </p>
      <span
        className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums ${tone}`}
      >
        <TrendArrow up={positive} />
        {Math.abs(quote.changePct).toFixed(2)}%
      </span>
    </div>
  );
}

export function MarketTickerRow({ quotes }: { quotes: MarketQuote[] }) {
  if (quotes.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 shadow-[0_1px_2px_rgba(18,24,26,0.04)]">
      <div className="flex items-center gap-1.5 text-[11px] text-muted">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-good" />
        </span>
        שוק
      </div>
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl bg-border sm:grid-cols-4">
        {quotes.map((q) => (
          <TickerCell key={q.symbol} quote={q} />
        ))}
      </div>
    </div>
  );
}
