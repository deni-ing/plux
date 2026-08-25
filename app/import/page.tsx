"use client";

/**
 * מסך העלאת דוחות.
 *
 * מכוון להיות דק: הוא שולח קבצים ומציג את מה שחזר. כל ההחלטות —
 * זיהוי הפורמט, האימות, הדילוג על כפילויות — נעשות בשרת, וכבר נבדקו.
 *
 * << הניווט (Nav) היה חסר במסך הזה בלבד — כל שאר המסכים כוללים אותו.
 *    Nav היא קומפוננטה רגילה בלי fetch/state שרת, אז אין בעיה
 *    להשתמש בה מתוך קובץ "use client".
 *
 * << נוסף מדריך "איך מורידים את הקובץ מכל מקור" — שני הספקים היחידים
 *    שהמערכת יודעת לקרוא כרגע (lib/parsers/max.ts, lib/parsers/leumi.ts).
 *    השלבים כלליים ולא מאומתים מול האתר/האפליקציה בפועל של כל גורם —
 *    לכן ההערה המפורשת בתחתית הקטע, ולא ניסוח שנשמע כמו הוראות מדויקות.
 */

import { useState } from "react";

import { Nav } from "../../components/nav";
import { CategoryIcon } from "../../components/categories/icon";

type Check = { label: string; expected: string; actual: string; ok: boolean };

type Result = {
  file: string;
  ok: boolean;
  error?: string;
  provider?: string;
  account?: string;
  period?: string;
  rowsParsed?: number;
  rowsInserted?: number;
  rowsDuplicate?: number;
  reconciled?: boolean;
  warnings?: string[];
  checks?: Check[];
};

/** אייקון חץ-העלאה — מקומי לדף הזה, לא אחד מאייקוני הקטגוריות. */
function UploadIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <line x1="10" y1="3" x2="10" y2="12" />
      <polyline points="6,7 10,3 14,7" />
      <path d="M4 13v2a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-2" />
    </svg>
  );
}

/** אייקון כרטיס אשראי — ל-MAX בלבד, מקומי לדף הזה. */
function CardIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="5" width="16" height="11" rx="2" />
      <line x1="2" y1="9" x2="18" y2="9" />
    </svg>
  );
}

const SOURCES = [
  {
    name: "MAX",
    format: "קובץ Excel (xlsx)",
    icon: <CardIcon />,
    steps: [
      "התחברות לאתר או לאפליקציית MAX",
      "כניסה לאזור התנועות / דוח הפעילות",
      "בחירת מחזור החיוב או טווח התאריכים",
      "ייצוא הדוח כקובץ Excel",
    ],
  },
  {
    name: "בנק לאומי",
    format: "דף חשבון (PDF)",
    icon: <CategoryIcon icon="bank" />,
    steps: [
      "התחברות לאתר או לאפליקציית בנק לאומי",
      "כניסה לאזור דפי החשבון / תנועות עו״ש",
      "בחירת התקופה הרצויה",
      "הורדת דף החשבון כקובץ PDF",
    ],
  },
] as const;

export default function ImportPage() {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    setResults(null);

    const body = new FormData();
    for (const f of Array.from(files)) body.append("files", f);

    try {
      const res = await fetch("/api/imports", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `שגיאה ${res.status}`);
      setResults(data.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "העלאה נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <Nav current="/import" />
      <h1 className="text-2xl font-semibold">ייבוא דוחות</h1>
      <p className="mt-2 text-sm text-muted">
        קובץ אקסל של MAX או דף חשבון PDF של לאומי. אפשר כמה בבת אחת.
      </p>

      <label
        className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-2
                   rounded-xl border border-dashed border-border p-10 text-center
                   hover:bg-wash"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
      >
        <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-wash text-ink-2">
          <UploadIcon />
        </span>
        <span className="font-medium text-ink">{busy ? "מעבד…" : "גרור לכאן, או בחר קובץ"}</span>
        <span className="text-xs text-muted">xlsx · pdf</span>
        <input
          type="file"
          multiple
          accept=".xlsx,.pdf"
          disabled={busy}
          className="hidden"
          onChange={(e) => upload(e.target.files)}
        />
      </label>

      {error && (
        <p className="mt-4 rounded-lg bg-critical/10 p-3 text-sm text-critical">{error}</p>
      )}

      {results?.map((r) => (
        <section key={r.file} className="mt-4 rounded-xl border border-border bg-surface p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="truncate font-medium">{r.file}</h2>
            <span className={`text-xs ${r.ok ? "text-good" : "text-critical"}`}>
              {r.ok ? "נקלט" : "נכשל"}
            </span>
          </div>

          {!r.ok && <p className="mt-2 text-sm text-ink-2">{r.error}</p>}

          {r.ok && (
            <>
              <p className="mt-1 text-sm text-muted">
                {r.provider} · {r.account}
                {r.period ? ` · ${r.period}` : ""}
              </p>

              <div className="mt-3 flex flex-wrap gap-4 text-sm text-ink">
                <span>
                  <b>{r.rowsInserted}</b> חדשות
                </span>
                <span className="text-muted">{r.rowsDuplicate} כפילויות שדולגו</span>
                {/* אימות שנכשל אינו חוסם את הייבוא — אבל הוא חייב להיראות. */}
                <span className={r.reconciled ? "text-good" : "text-warn"}>
                  {r.reconciled ? "אומת מול הצהרת הספק" : "לא אומת"}
                </span>
              </div>

              {r.checks?.some((c) => !c.ok) && (
                <ul className="mt-3 space-y-1 text-xs text-warn">
                  {r.checks
                    .filter((c) => !c.ok)
                    .map((c) => (
                      <li key={c.label}>
                        {c.label}: מוצהר {c.expected}, חושב {c.actual}
                      </li>
                    ))}
                </ul>
              )}

              {r.warnings?.length ? (
                <ul className="mt-3 space-y-1 text-xs text-muted">
                  {r.warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </section>
      ))}

      <section className="mt-8">
        <h2 className="text-[15px] font-medium text-ink">איך מורידים את הקובץ מכל מקור</h2>
        <p className="mt-1 text-xs text-muted">שני המקורות שהמערכת יודעת לקרוא כרגע.</p>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SOURCES.map((s) => (
            <div key={s.name} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/15 text-base text-accent">
                  {s.icon}
                </span>
                <div>
                  <p className="text-sm font-medium text-ink">{s.name}</p>
                  <p className="text-[11px] text-muted">{s.format}</p>
                </div>
              </div>
              <ol className="ms-[18px] mt-3 flex list-decimal flex-col gap-1 text-xs leading-relaxed text-ink-2">
                {s.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>

        <p className="mt-2 text-[11px] text-muted">
          השלבים המדויקים עשויים להשתנות בעדכוני האתר/האפליקציה של כל גורם.
        </p>
      </section>
    </main>
  );
}
