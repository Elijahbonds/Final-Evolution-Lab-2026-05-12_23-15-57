'use client';

// ReachCheck — the one-time standing-reach check the touch height needs (JUMP-PRO 2, 2026-10-25). Adults only (mounted
// with the other jump tools on the adult jump result).
//
// Facing the phone, whole body in the shot: stand still, raise one arm straight up and hold it. The reach is kept as a
// share of the leg (lib/jump/reach.ts), so no tape measure and no height are asked: each approach jump measures the leg
// in metres through its own free fall. It is kept ON THIS PHONE only (lib/jump/reachStore.ts), and "Forget" removes it.
// The video is read here and never uploaded.
import { useEffect, useRef, useState } from 'react';
import { Hand } from 'lucide-react';
import { readReach } from '@/lib/jump/reach';
import { forgetReach, loadReach, saveReach, type ReachStorage } from '@/lib/jump/reachStore';
import { poseDecoder, type Decoder } from '@/lib/jump/slowmoDecode';
import type { StandingReach } from '@/lib/jump/reach';

export const REACH_STEPS = [
  'Prop the phone at hip height, facing you, about 3 m away. Whole body in the shot, feet too.',
  'Stand tall on flat feet (not on your toes). Stand still for a second.',
  'Raise one arm straight up as high as it goes and hold it still for two seconds.',
  'Pick the video here. It is read on this phone and never uploaded; the reach is kept on this phone only.',
];

type Phase = { kind: 'idle' } | { kind: 'reading' } | { kind: 'saved' } | { kind: 'error'; why: string };

export function ReachCheck({ decode, storage, now = () => new Date() }: { decode?: Decoder; storage?: ReachStorage | null; now?: () => Date }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [kept, setKept] = useState<StandingReach | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => { setKept(loadReach(storage)); }, [storage, phase.kind]);

  const read = async (file: File) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase({ kind: 'reading' });
    try {
      const clip = await (decode ?? poseDecoder())(file, () => {}, ac.signal);
      const r = readReach(clip.frames, clip.aspect);
      if (!r.ok) { setPhase({ kind: 'error', why: r.why }); return; }
      const ok = saveReach({ reachOverLeg: r.reachOverLeg, reachOverLegSd: r.reachOverLegSd, at: now().toISOString() }, storage);
      setPhase(ok ? { kind: 'saved' } : { kind: 'error', why: 'This phone would not keep it (private browsing or blocked site data). Try a normal browser tab.' });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') { setPhase({ kind: 'idle' }); return; }
      setPhase({ kind: 'error', why: (e as Error)?.message || 'The video could not be read.' });
    }
  };

  if (!open) {
    return (
      <button type="button" data-reach-open onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 text-[16px] font-bold text-white/90">
        <Hand aria-hidden className="h-5 w-5" /> {kept ? 'Standing reach: checked' : 'Standing reach: one-time check'}
      </button>
    );
  }
  return (
    <section data-reach className="space-y-3 rounded-3xl border border-white/15 bg-white/[0.04] p-5">
      <h2 className="text-[18px] font-black text-white">Standing reach</h2>
      {kept ? (
        <p data-reach-kept className="text-[16px] text-white/80">
          Checked on {new Date(kept.at).toLocaleDateString()}. Your approach jumps show your touch height.
        </p>
      ) : null}
      {phase.kind === 'saved' ? <p data-reach-saved className="text-[16px] font-bold text-[#00FF9D]">Saved on this phone. Read an approach jump to see your touch height.</p> : null}
      {phase.kind === 'reading' ? <p data-reach-reading className="text-[16px] text-white/80">Reading the video on this phone…</p> : null}
      {phase.kind !== 'reading' ? (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-[16px] leading-snug text-white/80">
            {REACH_STEPS.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <label className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-white px-4 text-[16px] font-black text-black">
            {kept ? 'Check it again' : 'Pick a video'}
            <input data-reach-file type="file" accept="video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
          </label>
        </>
      ) : null}
      {phase.kind === 'error' ? <p data-reach-error className="text-[16px] font-bold text-[#FFB020]">{phase.why}</p> : null}
      {kept ? (
        <button type="button" data-reach-forget onClick={() => { forgetReach(storage); setKept(null); setPhase({ kind: 'idle' }); }} className="min-h-12 w-full text-[16px] font-bold text-white/80 underline">
          Forget my reach on this phone
        </button>
      ) : null}
    </section>
  );
}
