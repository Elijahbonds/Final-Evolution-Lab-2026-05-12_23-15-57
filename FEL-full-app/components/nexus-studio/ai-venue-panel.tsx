'use client';

// TRACK 2, the AI builder's venue half (docs/NEXUS-STUDIO.md §3): the creator says what they want, CELL answers with Studio
// edits (POST /api/cell/venue), the panel shows them as a reviewed list, and Apply runs them as ONE command on the Studio's
// undo stack — the same stack a hand edit uses, so Undo takes an AI build back whole. Behind the ABACUS kill switch
// (useAiStatus('studio')): nothing is sent unless the server says the AI is available.
//
// The answer is sanitised on the server and AGAIN here (lib/nexus-studio/aiEdits.ts): the browser never trusts the wire.

import { useState } from 'react';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';
import { useAiStatus } from '@/lib/abacus/useAiStatus';
import { AI_COMING_SOON_MESSAGE, isComingSoonResponse } from '@/lib/abacus/aiStatus';
import { AI_LIMITS, compileAiEdits, describeEdit, sanitizeAiEdits, type AiEdit } from '@/lib/nexus-studio/aiEdits';
import type { StudioApi } from './use-studio';
import { C, PanelTitle } from './ui';

export const AI_VENUE_PATH = '/api/cell/venue';
export const AI_VENUE_EXAMPLES = [
  'a night beach court with floodlights and a packed far stand',
  'a sunny clay court with palms on the left and a half-empty bleacher',
  'an indoor arena, glossy floor, two standing crowds behind the far baseline',
] as const;

const ERRORS: Record<string, string> = {
  adults_only: 'The AI builder is for verified adults.',
  rate_limited: 'That is a lot of builds in a row — try again in a minute.',
  prompt_too_long: `Keep it under ${AI_LIMITS.prompt} characters.`,
};

/** Pure: what the review list says about an answer. */
export function reviewOf(edits: readonly AiEdit[], dropped: number): { lines: string[]; note: string | null } {
  const lines = edits.map(describeEdit);
  const note = !edits.length ? 'CELL’s answer had nothing the Studio can apply.' : dropped ? `${dropped} part(s) of the answer were not Studio edits and were left out.` : null;
  return { lines, note };
}

export function AiVenuePanel({ studio, onApplied }: { studio: StudioApi; onApplied?(): void }) {
  const [ai, markComingSoon] = useAiStatus('studio');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ edits: AiEdit[]; dropped: number; prompt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const venue = studio.venue;
  const available = ai === 'available';

  const ask = async () => {
    if (!venue || !available || busy) return;
    const p = prompt.trim();
    if (!p) return;
    setBusy(true); setError(null); setPending(null);
    try {
      const res = await fetch(AI_VENUE_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: p, venue }) });
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
    const c = compileAiEdits(venue, pending.edits, pending.prompt);
    if (!c) { setError('Nothing to apply.'); return; }
    studio.run(c.cmd);   // ONE undo step
    setPending(null);
    onApplied?.();
  };

  const review = pending ? reviewOf(pending.edits, pending.dropped) : null;

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
        {error && <p className="mt-2 text-[12px]" style={{ color: C.ember }} role="alert">{error}</p>}
      </div>
      {review && (
        <div className="mx-3 mb-3 rounded-lg border p-2" style={{ borderColor: C.line, background: C.surface2 }} data-testid="ai-venue-review">
          <p className="text-[11px] uppercase tracking-[0.14em]" style={{ color: C.dim }}>CELL proposes {pending!.edits.length} edit(s) — review, then apply</p>
          <ol className="mt-1 max-h-56 list-decimal space-y-0.5 overflow-y-auto pl-5 text-[12px]" style={{ color: C.text }}>
            {review.lines.map((l, i) => <li key={i}>{l}</li>)}
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
