'use client';

// CHALLENGES-2: challenge a friend on a measured Mirror number (a jump). The server reads the number from this
// account's own saved jumps (POST /api/challenge/mint, kind 'rep'); the page sends none. The link goes to the share sheet.

import { useState } from 'react';
import Link from 'next/link';
import { Ruler, Check } from 'lucide-react';
import type { RepMetric } from '@/lib/social/challenge-terms';

type State = { s: 'idle' | 'busy' } | { s: 'sent'; url: string } | { s: 'line'; line: string; href?: string };

export function RepChallengeButton({ metric, label, canShowName }: { metric: RepMetric; label: string; canShowName: boolean }) {
  const [state, setState] = useState<State>({ s: 'idle' });
  const [showName, setShowName] = useState(false);
  const tap = async () => {
    if (state.s === 'busy') return;
    setState({ s: 'busy' });
    try {
      const r = await fetch('/api/challenge/mint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'rep', metric, modeKey: `mirror:${metric}`, showName }),
      });
      const j = await r.json().catch(() => null);
      if (r.ok && typeof j?.path === 'string') {
        const url = `${window.location.origin}${j.path}`;
        try { if (navigator.share) await navigator.share({ title: 'Beat my jump on FEL', url }); else await navigator.clipboard.writeText(url); } catch { /* shown below */ }
        setState({ s: 'sent', url });
        return;
      }
      if (j?.error === 'measure_first') { setState({ s: 'line', line: 'No jump saved in the last 7 days. Measure one first.', href: j.href }); return; }
      if (j?.error === 'scan_save_adults_only') { setState({ s: 'line', line: 'Jump challenges use saved numbers: adults who turn saving on.', href: '/account' }); return; }
      setState({ s: 'line', line: 'Could not make the challenge. Try again.' });
    } catch {
      setState({ s: 'line', line: 'Could not make the challenge. Try again.' });
    }
  };
  return (
    <div>
      <button type="button" onClick={tap} disabled={state.s === 'busy'} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#00E5FF]/40 px-5 py-3 font-mono text-sm text-[#00E5FF] disabled:opacity-60" data-action={`rep-mint-${metric}`}>
        <Ruler className="h-4 w-4" aria-hidden /> {state.s === 'busy' ? 'MAKING…' : label}
      </button>
      {canShowName && state.s !== 'sent' && (
        <label className="mt-2 flex items-center justify-center gap-2 text-xs text-white/55">
          <input type="checkbox" checked={showName} onChange={(e) => setShowName(e.target.checked)} /> Put my first name on it
        </label>
      )}
      {state.s === 'sent' && (
        <p className="mt-2 flex items-start gap-2 break-all font-mono text-[11px] text-[#00FF9D]"><Check className="h-4 w-4 shrink-0" aria-hidden /> {state.url}</p>
      )}
      {state.s === 'line' && (
        <p className="mt-2 text-xs text-white/60" role="status">{state.line} {state.href && <Link href={state.href} className="text-[#00E5FF] underline">Go</Link>}</p>
      )}
    </div>
  );
}
