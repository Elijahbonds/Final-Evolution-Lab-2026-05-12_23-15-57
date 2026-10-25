'use client';

// ApproachVideo — the approach station for one athlete (COMBINE-DAY, 2026-10-25). JUMP-PRO 2's readers, unchanged: a
// side-on video the coach's phone took is decoded and read ON THE PHONE (lib/jump/slowmoDecode.ts poseDecoder,
// lib/jump/sideView.ts analyseSideClip) and never uploaded; each jump in it becomes an attempt (lib/combine/approach.ts).
// The touch height needs this athlete's standing reach, read once in this combine from a front-on video (lib/jump/reach.ts
// readReach): only its two shares are kept, in the combine (never in the jump tools' own reach store, which is the
// phone owner's). The steps are the jump tools' own approved words (SIDE_STEPS, REACH_STEPS).
import { useRef, useState } from 'react';
import { Film, Hand, Loader2 } from 'lucide-react';
import { analyseSideClip } from '@/lib/jump/sideView';
import { poseDecoder, type Decoder } from '@/lib/jump/slowmoDecode';
import { readReach } from '@/lib/jump/reach';
import { approachAttempts } from '@/lib/combine/approach';
import type { Reach } from '@/lib/combine/types';
import { SIDE_STEPS } from '@/components/jump/side-jump-upload';
import { REACH_STEPS } from '@/components/jump/reach-check';

type Phase = { kind: 'idle' } | { kind: 'reading'; what: 'jump' | 'reach'; done: number; total: number } | { kind: 'error'; why: string };

export function ApproachVideo({ left, reach, onAttempts, onReach, decode }: {
  /** Attempts still to take for this athlete. */
  left: number;
  reach: Reach | null;
  onAttempts: (a: { value: number | null; touchCm: number | null }[]) => void;
  onReach: (r: Reach) => void;
  decode?: Decoder;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [steps, setSteps] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const read = async (file: File, what: 'jump' | 'reach') => {
    abort.current?.abort();
    const ac = new AbortController();
    abort.current = ac;
    setPhase({ kind: 'reading', what, done: 0, total: 0 });
    try {
      const clip = await (decode ?? poseDecoder())(file, (done, total) => setPhase({ kind: 'reading', what, done, total }), ac.signal);
      if (what === 'reach') {
        const r = readReach(clip.frames, clip.aspect);
        if (!r.ok) { setPhase({ kind: 'error', why: r.why }); return; }
        onReach({ reachOverLeg: r.reachOverLeg, reachOverLegSd: r.reachOverLegSd });
        setPhase({ kind: 'idle' });
        return;
      }
      const r = analyseSideClip(clip.frames, clip.aspect, 'approach');
      if (!r.ok || r.kind !== 'approach') { setPhase({ kind: 'error', why: r.ok ? 'That video did not read as an approach jump.' : r.why }); return; }
      onAttempts(approachAttempts(r.read, reach, left));
      setPhase({ kind: 'idle' });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') { setPhase({ kind: 'idle' }); return; }
      setPhase({ kind: 'error', why: (e as Error)?.message || 'The video could not be read.' });
    }
  };

  const pick = (what: 'jump' | 'reach', label: string, primary: boolean) => (
    <label className={`flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-4 font-bold ${primary ? 'bg-[#00E5FF] text-black' : 'border border-white/20 text-white/85'}`}>
      {what === 'jump' ? <Film className="h-4 w-4" /> : <Hand className="h-4 w-4" />} {label}
      <input data-combine-file={what} type="file" accept="video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f, what); e.target.value = ''; }} />
    </label>
  );

  if (phase.kind === 'reading') {
    return (
      <div className="space-y-2" data-combine-reading={phase.what}>
        <p className="flex items-center gap-2 text-sm text-white/80"><Loader2 className="h-4 w-4 animate-spin" /> Reading the video on this phone{phase.total ? `: ${phase.done} of ${phase.total}` : '…'}</p>
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#00FF9D]" style={{ width: `${phase.total ? Math.round((phase.done / phase.total) * 100) : 3}%` }} /></div>
        <button type="button" onClick={() => abort.current?.abort()} className="min-h-11 text-sm font-bold text-white/70 underline">Stop</button>
      </div>
    );
  }
  return (
    <div className="space-y-2" data-combine-approach>
      {pick('jump', left > 1 ? `Pick the approach video (up to ${left} jumps)` : 'Pick the approach video', true)}
      {pick('reach', reach ? 'Standing reach read · read again' : 'Standing reach (for touch height)', false)}
      {!reach && <p className="text-xs text-white/50" data-combine-no-reach>No standing reach yet: the vertical is read, the touch height is not.</p>}
      {phase.kind === 'error' && <p role="alert" className="text-sm font-bold text-[#FFB020]">{phase.why}</p>}
      <button type="button" onClick={() => setSteps(!steps)} className="text-xs font-bold text-white/55 underline">{steps ? 'Hide how to film' : 'How to film'}</button>
      {steps && (
        <div className="space-y-2 text-sm text-white/70">
          <ol className="list-decimal space-y-1 pl-5">{SIDE_STEPS.approach.map((s) => <li key={s}>{s}</li>)}</ol>
          <p className="font-bold text-white/80">Standing reach</p>
          <ol className="list-decimal space-y-1 pl-5">{REACH_STEPS.map((s) => <li key={s}>{s}</li>)}</ol>
        </div>
      )}
    </div>
  );
}
