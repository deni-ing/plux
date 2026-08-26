/**
 * אייקוני קטגוריות. שמות המפתחות מגיעים מ-`icon` ב-CATEGORY_TREE
 * (lib/categories/tree.ts) — לא רשימה נפרדת שיכולה להתפצל ממנה.
 *
 * צורות גיאומטריות פשוטות בכוונה (rect/circle/line/polyline, בלי
 * עקומות מורכבות) — קריא ברור בגודל 16–20px, ולא תלוי בספריית
 * אייקונים חיצונית שדורשת רשת.
 *
 * `currentColor` בכל מקום: הצבע נקבע על ידי הקורא (style={{color}} —
 * ראו lib/categories/palette.ts), לא מקודד כאן.
 */

import type { ReactElement } from "react";

const ICONS: Record<string, ReactElement> = {
  "shopping-cart": (
    <>
      <path d="M2 3h2l2.4 10.4a1 1 0 0 0 1 .8h7.2a1 1 0 0 0 1-.8L18 7H5" />
      <circle cx="8" cy="17" r="1.4" />
      <circle cx="14" cy="17" r="1.4" />
    </>
  ),
  car: (
    <>
      <path d="M4 9l2-4h8l2 4" />
      <rect x="2" y="9" width="16" height="6" rx="2" />
      <circle cx="6" cy="16" r="1.5" />
      <circle cx="14" cy="16" r="1.5" />
    </>
  ),
  home: (
    <>
      <path d="M3 10l7-6 7 6" />
      <path d="M5 9v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9" />
    </>
  ),
  key: (
    <>
      <circle cx="6" cy="6" r="3" />
      <line x1="8.1" y1="8.1" x2="17" y2="17" />
      <line x1="13" y1="13" x2="13" y2="16" />
      <line x1="15.5" y1="15.5" x2="15.5" y2="18" />
    </>
  ),
  utensils: (
    <>
      <line x1="4" y1="2" x2="4" y2="7" />
      <line x1="6" y1="2" x2="6" y2="7" />
      <polyline points="4,7 5,9 6,7" />
      <line x1="5" y1="9" x2="5" y2="18" />
      <polyline points="14,2 16,2 15,9 14,9" />
      <line x1="15" y1="9" x2="15" y2="18" />
    </>
  ),
  phone: (
    <>
      <rect x="6" y="2" width="8" height="16" rx="2" />
      <line x1="9" y1="15" x2="11" y2="15" />
    </>
  ),
  heart: <path d="M10 17s-6-4-6-8.5A3.5 3.5 0 0 1 10 6a3.5 3.5 0 0 1 6 2.5C16 13 10 17 10 17z" />,
  bag: (
    <>
      <path d="M5 7h10l1 10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1L5 7z" />
      <path d="M7 7V5a3 3 0 0 1 6 0v2" />
    </>
  ),
  ticket: (
    <>
      <path d="M2 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1a1.5 1.5 0 0 0 0 3v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1a1.5 1.5 0 0 0 0-3V7z" />
      <line x1="10" y1="5" x2="10" y2="15" strokeDasharray="2 2" />
    </>
  ),
  book: (
    <>
      <path d="M3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 0-2-2H3V4z" />
      <path d="M17 4h-6a2 2 0 0 0-2 2v10a2 2 0 0 1 2-2h6V4z" />
    </>
  ),
  shield: <path d="M10 2l7 3v5c0 5-3.5 7.5-7 8-3.5-.5-7-3-7-8V5l7-3z" />,
  bank: (
    <>
      <path d="M3 8l7-5 7 5H3z" />
      <line x1="4" y1="8" x2="4" y2="15" />
      <line x1="8" y1="8" x2="8" y2="15" />
      <line x1="12" y1="8" x2="12" y2="15" />
      <line x1="16" y1="8" x2="16" y2="15" />
      <line x1="3" y1="17" x2="17" y2="17" />
    </>
  ),
  "hand-heart": (
    <>
      <path d="M10 12.5s-3.6-2.4-3.6-5.1A2.1 2.1 0 0 1 10 5.7a2.1 2.1 0 0 1 3.6 1.7C13.6 10.1 10 12.5 10 12.5z" />
      <path d="M4 15c1.4-1 2.8-1 4 0s2.6 1 4 0 2.6-1 4 0" />
    </>
  ),
  paw: (
    <>
      <circle cx="10" cy="14" r="3" />
      <circle cx="5" cy="8" r="1.4" />
      <circle cx="8.5" cy="5" r="1.4" />
      <circle cx="11.5" cy="5" r="1.4" />
      <circle cx="15" cy="8" r="1.4" />
    </>
  ),
  dots: (
    <>
      <circle cx="4" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="16" cy="10" r="1.4" />
    </>
  ),
  "trending-up": (
    <>
      <polyline points="3,14 8,9 11,12 17,5" />
      <polyline points="12,5 17,5 17,10" />
    </>
  ),
  arrows: (
    <>
      <polyline points="4,6 16,6" />
      <polyline points="13,3 16,6 13,9" />
      <polyline points="16,14 4,14" />
      <polyline points="7,11 4,14 7,17" />
    </>
  ),
  send: (
    <>
      <polyline points="2,10 17,3 10,18 8,11 2,10" />
      <line x1="8" y1="11" x2="17" y2="3" />
    </>
  ),
  receipt: (
    <>
      <path d="M5 2h10v15l-2-1.5L11 17l-2-1.5L7 17l-2-1.5V2z" />
      <line x1="7" y1="6" x2="13" y2="6" />
      <line x1="7" y1="9" x2="13" y2="9" />
      <line x1="7" y1="12" x2="11" y2="12" />
    </>
  ),
  suitcase: (
    <>
      <rect x="3" y="7" width="14" height="10" rx="1.5" />
      <path d="M7.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 12.5 5v2" />
      <line x1="10" y1="7" x2="10" y2="17" />
    </>
  ),
};

export function CategoryIcon({
  icon,
  className,
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  const shape = (icon && ICONS[icon]) || ICONS.dots;
  return (
    <svg
      viewBox="0 0 20 20"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {shape}
    </svg>
  );
}
