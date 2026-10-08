"use client";

import Link from "next/link";
import { useState } from "react";

import { MAX_INPUT_CHARS } from "@/lib/constants";

interface Props { slug: string; name: string; heading: string; helperText: string }

export function EmbeddedIdeaTranslator({ slug, name, heading, helperText }: Props) {
  const [text, setText] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!text.trim()) { setError("Enter some text to twist."); return; }
    setLoading(true); setError(""); setResult("");
    try {
      const response = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.trim(), translatorSlug: slug }) });
      const payload = await response.json() as { ok: boolean; result?: string; error?: { message?: string } };
      if (!response.ok || !payload.ok || !payload.result) setError(payload.error?.message || "We couldn't twist that text just now.");
      else setResult(payload.result);
    } catch { setError("We couldn't twist that text just now."); }
    finally { setLoading(false); }
  }

  return (
    <section className="my-8 rounded-[1.5rem] border border-brand-200 bg-brand-50 p-5 sm:p-7" aria-labelledby={`embed-${slug}`}>
      <p className="section-kicker">Try it here</p>
      <h2 id={`embed-${slug}`} className="font-display mt-1 text-2xl font-bold text-ink">{heading}</h2>
      <p className="mt-2 text-sm leading-6 text-muted-ink">{helperText}</p>
      <label className="mt-5 block text-sm font-bold text-ink" htmlFor={`idea-input-${slug}`}>Your text</label>
      <textarea id={`idea-input-${slug}`} value={text} maxLength={MAX_INPUT_CHARS} onChange={(event) => setText(event.target.value)} className="mt-2 min-h-28 w-full rounded-2xl border border-border bg-white p-4 text-sm text-ink outline-none focus:border-brand-500" />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={loading} onClick={submit} className="rounded-full bg-ink px-5 py-3 text-sm font-bold text-white disabled:opacity-60">{loading ? "Twisting..." : "Twist"}</button>
        <Link href={`/translators/${slug}`} className="text-sm font-bold text-brand-700">Open the full {name}</Link>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm text-red-700">{error}</p> : null}
      {result ? <div className="mt-5 rounded-2xl bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-ink">Result</p><p className="mt-2 whitespace-pre-wrap text-base leading-7 text-ink">{result}</p></div> : null}
    </section>
  );
}

