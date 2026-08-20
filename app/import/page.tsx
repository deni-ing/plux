"use client";

/**
 * מסך העלאת דוחות.
 *
 * מכוון להיות דק: הוא שולח קבצים ומציג את מה שחזר. כל ההחלטות —
 * זיהוי הפורמט, האימות, הדילוג על כפילויות — נעשות בשרת, וכבר נבדקו.
 */

import { useState } from "react";

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
      <h1 className="text-2xl font-semibold">ייבוא דוחות</h1>
      <p className="mt-2 text-sm opacity-70">
        קובץ אקסל של MAX או דף חשבון PDF של לאומי. אפשר כמה בבת אחת.
      </p>

      <label
        className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-2
                   rounded-xl border border-dashed border-black/20 p-10 text-center
                   hover:bg-black/[0.03] dark:border-white/20 dark:hover:bg-white/[0.04]"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          upload(e.dataTransfer.files);
        }}
      >
        <span className="font-medium">{busy ? "מעבד…" : "גרור לכאן, או בחר קובץ"}</span>
        <span className="text-xs opacity-60">xlsx · pdf</span>
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
        <p className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      {results?.map((r) => (
        <section
          key={r.file}
          className="mt-4 rounded-xl border border-black/10 p-4 dark:border-white/10"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="truncate font-medium">{r.file}</h2>
            <span className={`text-xs ${r.ok ? "text-emerald-600" : "text-red-600"}`}>
              {r.ok ? "נקלט" : "נכשל"}
            </span>
          </div>

          {!r.ok && <p className="mt-2 text-sm opacity-80">{r.error}</p>}

          {r.ok && (
            <>
              <p className="mt-1 text-sm opacity-70">
                {r.provider} · {r.account}
                {r.period ? ` · ${r.period}` : ""}
              </p>

              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <span>
                  <b>{r.rowsInserted}</b> חדשות
                </span>
                <span className="opacity-70">
                  {r.rowsDuplicate} כפילויות שדולגו
                </span>
                {/* אימות שנכשל אינו חוסם את הייבוא — אבל הוא חייב להיראות. */}
                <span className={r.reconciled ? "text-emerald-600" : "text-amber-600"}>
                  {r.reconciled ? "אומת מול הצהרת הספק" : "לא אומת"}
                </span>
              </div>

              {r.checks?.some((c) => !c.ok) && (
                <ul className="mt-3 space-y-1 text-xs text-amber-600">
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
                <ul className="mt-3 space-y-1 text-xs opacity-60">
                  {r.warnings.map((w, i) => (
                    <li key={i}>• {w}</li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </section>
      ))}
    </main>
  );
}
