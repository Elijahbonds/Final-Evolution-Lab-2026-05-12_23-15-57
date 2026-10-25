'use client';

// SAFETY lane (SAF-04, 2026-10-25): "Report a problem". One tap sends what FEL can see about the problem — the page you
// came from (ids taken out), the kind of device, the last game diagnostic's kind and the time — and nothing about you:
// no account, no email, no name (lib/safety/problemContext.ts; components/report/report-problem.scan.test.ts holds it).
// A verified adult may add a short note (allowText, decided by the server page); nobody else is offered a box.
import { useState } from 'react';
import { Check, Loader2, LifeBuoy } from 'lucide-react';
import { lastDiagKind } from '@/lib/babylon/core/diag';
import { PROBLEM_TEXT_MAX, deviceClassOf, sanitizeRoute, type ProblemContext } from '@/lib/safety/problemContext';

/** The route the problem happened on: the page you came from on this site, else this one. */
function fromRoute(): string {
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.origin === window.location.origin) return sanitizeRoute(ref.pathname);
  } catch { /* fall through */ }
  return sanitizeRoute(window.location.pathname);
}

export function problemContext(): ProblemContext {
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return {
    route: fromRoute(),
    deviceClass: deviceClassOf({
      userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints ?? 0, coarse,
      shortSide: Math.min(window.screen?.width ?? 0, window.screen?.height ?? 0),
    }),
    diagKind: lastDiagKind(),
    at: new Date().toISOString(),
  };
}

export function ReportProblem({ allowText = false }: { allowText?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    setState('working');
    setError(null);
    try {
      const body = { ...problemContext(), ...(allowText && text.trim() ? { text: text.trim() } : {}) };
      const res = await fetch('/api/report/problem', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 429 ? 'That’s a lot of reports in a short time. Try again in a few minutes.' : typeof out?.message === 'string' ? out.message : 'That didn’t send. Try again in a moment.');
        setState('error');
        return;
      }
      setState('done');
    } catch {
      setError('No connection. Try again in a moment.');
      setState('error');
    }
  };

  if (state === 'done') {
    return (
      <p className="inline-flex items-center gap-2 rounded-xl border border-[#00FF9D]/40 bg-[#00FF9D]/10 px-4 py-2.5 text-sm font-bold text-[#00FF9D]" data-testid="problem-sent">
        <Check className="h-4 w-4" /> Sent. Thanks — it helps.
      </p>
    );
  }

  return (
    <div data-testid="report-problem">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 py-2.5 text-sm font-bold text-white hover:border-white/30">
          <LifeBuoy className="h-4 w-4 text-[#00E5FF]" /> Report a problem
        </button>
      ) : (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-bold text-white">Report a problem</p>
          <p className="mt-1 text-xs leading-relaxed text-white/55">
            We send the page you were on, the kind of device and the time — nothing about you.
          </p>
          {allowText && (
            <label className="mt-3 block">
              <span className="text-xs text-white/60">What happened? (optional — leave out names and contact details)</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, PROBLEM_TEXT_MAX))}
                rows={3}
                maxLength={PROBLEM_TEXT_MAX}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none"
              />
            </label>
          )}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={send} disabled={state === 'working'} className="inline-flex items-center gap-2 rounded-xl bg-[#00E5FF] px-4 py-2 text-sm font-bold text-black disabled:opacity-60">
              {state === 'working' ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Send
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/70">Cancel</button>
          </div>
          {error && <p className="mt-2 text-xs text-[#FF3366]">{error}</p>}
        </div>
      )}
    </div>
  );
}
