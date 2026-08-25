/**
 * תיבת השאלה במסך הבית המאוחד.
 *
 * ‏"use client" רק כי יש כאן ניווט תלוי-קלט (router.push עם הטקסט
 * שהוקלד) — אין כאן state שצריך לשרוד, ואין fetch. השליחה בפועל
 * (הבקשה ל-/api/chat, הסטרימינג) קורית ב-ChatScreen אחרי הניווט,
 * לא כאן: זו תיבה שמפנה, לא תיבה ששולחת.
 */

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AskBox() {
  const [value, setValue] = useState("");
  const router = useRouter();

  function go() {
    const text = value.trim();
    if (!text) {
      router.push("/chat");
      return;
    }
    router.push(`/chat?q=${encodeURIComponent(text)}`);
  }

  return (
    <form
      className="flex items-center gap-2 rounded-2xl border border-border bg-surface p-2 pe-2 ps-4 shadow-[0_1px_2px_rgba(18,24,26,0.04)]"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <span className="text-accent" aria-hidden>
        ✦
      </span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="שאל/י את Pluxer — למשל: כמה נשאר לי החודש?"
        className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted focus:outline-none"
      />
      <button
        type="submit"
        className="rounded-xl bg-accent px-4 py-2 text-sm font-medium text-on-accent transition hover:bg-accent-strong"
      >
        שאל/י
      </button>
    </form>
  );
}
