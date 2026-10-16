'use client';

// TRACK 2, the AI builder's venue half (docs/NEXUS-STUDIO.md §3): the creator says what they want, CELL answers with Studio
// edits (POST /api/cell/venue), the panel shows them as a reviewed list, and Apply runs them as ONE command on the Studio's
// undo stack — the same stack a hand edit uses, so Undo takes an AI build back whole. Behind the ABACUS kill switch
// (useAiStatus('studio')): nothing is sent unless the server says the AI is available.
//
// The answer is sanitised on the server and AGAIN here (lib/nexus-studio/aiEdits.ts): the browser never trusts the wire.
//
// studio-4b: CELL's answer may also add SCRIPTS (scoped to this venue) and CASTS (a character the creator named, matched here
// against the project's own characters — the request never carries one), reviewed and applied in the same one step; and
// "Explain this venue" asks CELL for a read-only, plain-language summary (no edits). What leaves the browser is the typed request
// and the venue without its cast (venueForAi) — Privacy Policy §1.

import { useState } from 'react';
import { Sparkles, Check, X, Loader2, BookOpen } from 'lucide-react';
import { useAiStatus } from '@/lib/abacus/useAiStatus';
import { AI_COMING_SOON_MESSAGE, isComingSoonResponse } from '@/lib/abacus/aiStatus';
import { AI_LIMITS, compileAiEdits, reviewAiEdits, sanitizeAiEdits, sanitizeSummary, venueForAi, type AiEdit, type AiProjectCtx } from '@/lib/nexus-studio/aiEdits';
import type { StudioApi } from './use-studio';
import { C, PanelTitle } from './ui';

export const AI_VENUE_PATH = '/api/cell/venue';
export const AI_VENUE_EXAMPLES = [
  'a night beach court with floodlights and a packed far stand',
  'a sunny clay court with palms on the left and a half-empty bleacher',
  'an indoor arena, glossy floor, two standing crowds behind the far baseline',
  'when a rally reaches 5, the crowd cheers and a banner says WHAT A RALLY',
] as const;

const ERRORS: Record<string, string> = {
  ai_builder_unavailable: 'The AI builder isn’t available on this account.',
  rate_limited: 'That is a lot of builds in a row — try again in a minute.',
  prompt_too_long: `Keep it under ${AI_LIMITS.prompt} characters.`,
};

/** Pure: what the review list says about an answer (a cast that names no character of this project is marked as left out). */
export function reviewOf(edits: readonly AiEdit[], dropped: number, ctx: AiProjectCtx = { characters: [], scripts: [] }): { lines: string[]; skipped: Array<string | undefined>; note: string | null } {
  const r = reviewAiEdits(edits, ctx);
  const note = !edits.length ? 'CELL’s answer had nothing the Studio can apply.' : dropped ? `${dropped} part(s) of the answer were not Studio edits and were left out.` : null;
  return { lines: r.map((x) => x.line), skipped: r.map((x) => x.skipped), note };
}

/** The body the panel sends: the typed request (or the explain pass) and the venue without its cast. Pure. */
export function aiRequestBody(venue: Parameters<typeof venueForAi>[0], ask: { prompt: string } | { explain: true }): string {
  return JSON.stringify('explain' in ask ? { mode: 'explain', venue: venueForAi(venue) } : { prompt: ask.prompt, venue: venueForAi(venue) });
}

export function AiVenuePanel({ studio, onApplied }: { studio: StudioApi; onApplied?(): void }) {
  const [ai, markComingSoon] = useAiStatus('studio');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ edits: AiEdit[]; dropped: number; prompt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const venue = studio.venue;
  const available = ai === 'available';
  const ctx: AiProjectCtx = { characters: studio.doc.characters, scripts: studio.doc.scripts };

  const explain = async () => {
    if (!venue || !available || explaining) return;
    setExplaining(true); setError(null); setSummary(null);
    try {
      const res = await fetch(AI_VENUE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: aiRequestBody(venue, { explain: true }) });
      if (await isComingSoonResponse(res)) { markComingSoon(); return; }
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(ERRORS[body?.error] ?? 'CELL could not explain this venue — try again.'); return; }
      const text = sanitizeSummary(body?.summary);   // again, here: shown as text, never markup
      if (!text) { setError('CELL’s answer had no summary.'); return; }
      setSummary(text);
    } catch {
      setError('CELL could not be reached.');
    } finally { setExplaining(false); }
  };

  const ask = async () => {
    if (!venue || !available || busy) return;
    const p = prompt.trim();
    if (!p) return;
    setBusy(true); setError(null); setPending(null);
    try {
      const res = await fetch(AI_VENUE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: aiRequestBody(venue, { prompt: p }) });
      if (await isComingSoonResponse(res)) { markComingSoon(); return; }
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(ERRORS[body?.error] ?? 'CELL could not build that — try again.'); return; }
      const clean = sanitizeAiEdits(body);   // again, here: the wire is not trusted
      setPending({ edits: clean.edits, dropped: clean.dropped + (typeof body?.dropped === 'number' ? body.dropped : 0), prompt: p });
    } catch {
      setError('CELL could not be reached.');
    } finally { setBusy(false); }
  };

  const apply = () => {
    if (!venue || !pending) return;
    const c = compileAiEdits(venue, pending.edits, pending.prompt, ctx);
    if (!c) { setError('Nothing to apply.'); return; }
    studio.run(c.cmd);   // ONE undo step
    setPending(null);
    onApplied?.();
  };

  const review = pending ? reviewOf(pending.edits, pending.dropped, ctx) : null;

  return (
    <section className="flex min-h-0 flex-col" aria-label="Build a venue with CELL" data-testid="ai-venue-panel">
      <PanelTitle right={<span className="text-[11px]" style={{ color: C.dim }}>Studio commands · one undo step</span>}>Build the venue with CELL</PanelTitle>
      {!available ? (
        <p className="px-3 text-[12px]" style={{ color: ai === 'loading' ? C.dim : C.gold }} data-testid="ai-venue-status">
          {ai === 'loading' ? 'Checking the AI builder…' : AI_COMING_SOON_MESSAGE.studio}
        </p>
      ) : null}
      <div className="px-3 py-2">
        <textarea
          aria-label="Describe the venue" value={prompt} maxLength={AI_LIMITS.prompt} rows={3} disabled={!available || busy}
          onChange={(e) => setPrompt(e.target.value)} placeholder={AI_VENUE_EXAMPLES[0]}
          className="w-full resize-none rounded-md border bg-transparent px-2 py-1.5 text-[13px] outline-none focus:border-[color:var(--fel-cyan)]"
          style={{ borderColor: C.line, color: C.text }}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => void ask()} disabled={!available || busy || !prompt.trim()}
            className="flex items-center gap-1.5 rounded-md px-3 py-1 text-[12px] font-semibold disabled:opacity-40" style={{ background: C.cyan, color: '#050505' }}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />} Build into “{venue?.name ?? 'venue'}”
          </button>
          {AI_VENUE_EXAMPLES.map((x) => (
            <button key={x} type="button" disabled={!available || busy} onClick={() => setPrompt(x)} className="rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-40" style={{ borderColor: C.line, color: C.dim }}>{x}</button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <button type="button" onClick={() => void explain()} disabled={!available || explaining || !venue}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1 text-[12px] disabled:opacity-40" style={{ borderColor: C.line, color: C.text }}>
            {explaining ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <BookOpen className="h-3.5 w-3.5" aria-hidden />} Explain this venue
          </button>
          <span className="text-[11px]" style={{ color: C.dim }}>Read only: CELL describes it, nothing changes.</span>
        </div>
        {error && <p className="mt-2 text-[12px]" style={{ color: C.ember }} role="alert">{error}</p>}
      </div>
      {summary && (
        <div className="mx-3 mb-3 rounded-lg border p-2" style={{ borderColor: C.line, background: C.surface2 }} data-testid="ai-venue-summary">
          <p className="flex items-center justify-between text-[11px] uppercase tracking-[0.14em]" style={{ color: C.dim }}>
            <span>CELL explains “{venue?.name ?? 'the venue'}” · no edits</span>
            <button type="button" onClick={() => setSummary(null)} aria-label="Close the summary" className="rounded p-0.5 hover:bg-white/5"><X className="h-3.5 w-3.5" /></button>
          </p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.text }}>{summary}</p>
        </div>
      )}
      {review && (
        <div className="mx-3 mb-3 rounded-lg border p-2" style={{ borderColor: C.line, background: C.surface2 }} data-testid="ai-venue-review">
          <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.dim }}>CELL proposes {pending!.edits.length} edit(s) — review, then apply</p>
          <ol className="mt-1 max-h-56 list-decimal space-y-0.5 overflow-y-auto pl-5 text-[12px]" style={{ color: C.text }}>
            {review.lines.map((l, i) => <li key={i} style={review.skipped[i] ? { color: C.dim, textDecoration: 'line-through' } : undefined}>{l}{review.skipped[i] && <span className="ml-1 text-[11px]" style={{ color: C.gold, textDecoration: 'none', display: 'inline-block' }}>({review.skipped[i]})</span>}</li>)}
          </ol>
          {review.note && <p className="mt-1 text-[11px]" style={{ color: C.gold }}>{review.note}</p>}
          <div className="mt-2 flex gap-1.5">
            <button type="button" onClick={apply} disabled={!pending!.edits.length} className="flex items-center gap-1 rounded-md px-3 py-1 text-[12px] font-semibold disabled:opacity-40" style={{ background: C.emerald, color: '#050505' }}>
              <Check className="h-3.5 w-3.5" aria-hidden /> Apply as one step
            </button>
            <button type="button" onClick={() => setPending(null)} className="flex items-center gap-1 rounded-md border px-3 py-1 text-[12px]" style={{ borderColor: C.line, color: C.dim }}>
              <X className="h-3.5 w-3.5" aria-hidden /> Discard
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
