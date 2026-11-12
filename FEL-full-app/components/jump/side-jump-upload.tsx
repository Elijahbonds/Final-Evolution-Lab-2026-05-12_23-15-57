'use client';

// SideJumpUpload — the approach jump (vertical + touch height) and the drop jump (RSI) from a side-on video (JUMP-PRO 2,
// 2026-10-25; owner: "an approach jump shows BOTH the vertical in inches and the touch height"). Adults only (the caller
// mounts it on the adult jump result, beside the slow-mo reader).
//
// A run-up or a box needs the phone propped side-on, so these are read from a video the phone's own camera took (any
// rate; Slo-mo is best): decoded here (lib/jump/slowmoDecode.ts), read by the same pose model, timed at the file's real
// rate with gravity as the clock (lib/jump/sideView.ts), shown with the session card. The video never leaves the phone;
// nothing is saved or sent, except the standing reach this page keeps on the phone (lib/jump/reachStore.ts).
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Box } from 'lucide-react';
import { analyseSideClip, type SideKind, type SideResult } from '@/lib/jump/sideView';
import { poseDecoder, type Decoder } from '@/lib/jump/slowmoDecode';
import { feetInches, touchHeight, type StandingReach } from '@/lib/jump/reach';
import { loadReach, type ReachStorage } from '@/lib/jump/reachStore';
import { verifyJump } from '@/lib/jump/session';
import { BLOCK_WORDS, JumpSessionCard } from './jump-session-card';

const IN = 2.54;
const inch = (cm: number) => (cm / IN).toFixed(1);

/** How to film each, in four lines. */
export const SIDE_STEPS: Record<SideKind, string[]> = {
  approach: [
    'Prop the phone side-on at hip height, about 4 to 5 m from where you take off, so the last steps and the jump are in the shot.',
    'Run across the picture, not toward or away from the phone. Whole body in the shot, feet too.',
    'Take off, reach as high as you can, land. One to three jumps in one video.',
    'Pick the video here. It is read on this phone and never uploaded.',
  ],
  drop: [
    'A sturdy box or step 30 to 45 cm high. Prop the phone side-on at hip height, about 3 m away.',
    'Stand still on the box, hands on your hips, whole body and the box in the shot.',
    'Step off (do not jump off), land on both feet, and jump up the moment you land, as high and as fast as you can.',
    'Pick the video here. It is read on this phone and never uploaded.',
  ],
};
const TITLE: Record<SideKind, string> = { approach: 'Approach jump and touch height', drop: 'Drop jump (RSI)' };
const OPEN: Record<SideKind, string> = { approach: 'Approach jump: read a run-up video', drop: 'Drop jump: read a box video' };

type Phase = { kind: 'idle' } | { kind: 'reading'; done: number; total: number } | { kind: 'done'; r: SideResult } | { kind: 'error'; why: string };

export function SideJumpUpload({ kind, decode, storage }: { kind: SideKind; decode?: Decoder; storage?: ReachStorage | null }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [reach, setReach] = useState<StandingReach | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // the standing reach kept on this phone, read when the panel opens (a check done meanwhile is picked up)
  useEffect(() => { if (open && kind === 'approach') setReach(loadReach(storage)); }, [open, kind, storage, phase.kind]);

  const read = async (file: File) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase({ kind: 'reading', done: 0, total: 0 });
    try {
      const clip = await (decode ?? poseDecoder())(file, (done, total) => setPhase({ kind: 'reading', done, total }), ac.signal);
      setPhase({ kind: 'done', r: analyseSideClip(clip.frames, clip.aspect, kind) });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') { setPhase({ kind: 'idle' }); return; }
      setPhase({ kind: 'error', why: (e as Error)?.message || 'The video could not be read.' });
    }
  };

  const Icon = kind === 'approach' ? ArrowUpRight : Box;
  if (!open) {
    return (
      <button type="button" data-side-open={kind} onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 text-[16px] font-bold text-white/90">
        <Icon aria-hidden className="h-5 w-5" /> {OPEN[kind]}
      </button>
    );
  }
  const r = phase.kind === 'done' ? phase.r : null;
  const source = r?.ok && r.fps >= 120 ? 'slowmo' as const : 'live' as const;
  return (
    <section data-side={kind} className="space-y-3 rounded-3xl border border-white/15 bg-white/[0.04] p-5">
      <h2 className="text-[18px] font-black text-white">{TITLE[kind]}</h2>
      {phase.kind === 'idle' || phase.kind === 'error' ? (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-[16px] leading-snug text-white/80">
            {SIDE_STEPS[kind].map((s) => <li key={s}>{s}</li>)}
          </ol>
          {kind === 'approach' && !reach ? (
            <p data-side-no-reach className="text-[16px] text-white/70">For your touch height, do the standing-reach check once (below).</p>
          ) : null}
          <label className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-white px-4 text-[16px] font-black text-black">
            Pick a video
            <input data-side-file={kind} type="file" accept="video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
          </label>
          {phase.kind === 'error' ? <p data-side-error className="text-[16px] font-bold text-[#FFB020]">{phase.why}</p> : null}
        </>
      ) : null}
      {phase.kind === 'reading' ? (
        <div data-side-reading className="space-y-2">
          <p className="text-[16px] text-white/80">Reading every frame on this phone{phase.total ? `: ${phase.done} of ${phase.total}` : '…'}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#00FF9D]" style={{ width: `${phase.total ? Math.round((phase.done / phase.total) * 100) : 3}%` }} /></div>
          <button type="button" onClick={() => abortRef.current?.abort()} className="min-h-12 text-[16px] font-bold text-white/80 underline">Stop</button>
        </div>
      ) : null}
      {r && !r.ok ? (
        <>
          <p data-side-refused className="text-[16px] font-bold text-[#FFB020]">{r.why}</p>
          <button type="button" onClick={() => setPhase({ kind: 'idle' })} className="min-h-12 text-[16px] font-bold text-white/80 underline">Try another video</button>
        </>
      ) : null}
      {r?.ok && r.kind === 'approach' ? <ApproachHeadline r={r} reach={reach} source={source} /> : null}
      {r?.ok && r.kind === 'drop' ? <DropHeadline r={r} source={source} /> : null}
      {r?.ok ? (
        <>
          <p className="text-center text-[16px] text-white/70">Read at {Math.round(r.fps)} frames a second{r.stretch > 1 ? ` (the video played ${r.stretch}× slow)` : ''}</p>
          <JumpSessionCard t5={r.t5} source={source} />
          <button type="button" onClick={() => setPhase({ kind: 'idle' })} className="min-h-12 w-full text-[16px] font-bold text-white/80 underline">Read another video</button>
        </>
      ) : null}
    </section>
  );
}

function ApproachHeadline({ r, reach, source }: { r: Extract<SideResult, { ok: true; kind: 'approach' }>; reach: StandingReach | null; source: 'live' | 'slowmo' }) {
  const best = r.read.jumps.find((j) => j.index === r.read.bestIndex);
  if (!best) return null;
  const v = verifyJump(best, { poseHz: r.fps, source });
  const t = reach ? touchHeight(best, reach) : null;
  return (
    <div data-approach-best className="space-y-1 text-center">
      <p className="text-[40px] font-black leading-none text-white">
        {inch(best.heightCm)} in<span className="ml-2 text-[18px] font-bold text-white/70">±{Math.max(0.1, best.plusMinusCm / IN).toFixed(1)}</span>
      </p>
      <p className="text-[16px] text-white/70">max vertical, {best.heightCm.toFixed(1)} cm{best.takeoffFoot ? ` · off ${best.takeoffFoot === 'both' ? 'both feet' : `the ${best.takeoffFoot} foot`}` : ''}{best.speedMps !== null ? ` · ${best.speedMps.toFixed(1)} m/s across` : ''}</p>
      {t ? (
        <p data-touch className="pt-1 text-[22px] font-black text-white">
          Touch {feetInches(t.touchCm)}<span className="ml-2 text-[16px] font-bold text-white/70">±{Math.max(0.5, Math.round((t.plusMinusCm / IN) * 2) / 2)} in</span>
          <span className="block text-[16px] font-normal text-white/70">standing reach {feetInches(t.reachCm)} + {inch(t.verticalCm)} in</span>
        </p>
      ) : (
        <p data-touch-missing className="pt-1 text-[16px] text-white/70">Touch height needs your standing reach: do the check once, below.</p>
      )}
      <p data-approach-verified={v.verified} className="text-[16px] font-bold" style={{ color: v.verified ? '#00FF9D' : 'rgba(255,255,255,0.7)' }}>
        {v.verified ? 'Verified jump' : `Not verified: ${BLOCK_WORDS[v.blocks[0] ?? 'notValid']}`}
      </p>
    </div>
  );
}

function DropHeadline({ r, source }: { r: Extract<SideResult, { ok: true; kind: 'drop' }>; source: 'live' | 'slowmo' }) {
  const d = r.read.drops.filter((x) => x.valid).reduce<(typeof r.read.drops)[number] | null>((a, x) => (!a || (x.rsi ?? 0) > (a.rsi ?? 0) ? x : a), null);
  if (!d) return null;
  return (
    <div data-drop-best className="space-y-1 text-center">
      {d.rsi !== null ? (
        <p className="text-[40px] font-black leading-none text-white">
          RSI {d.rsi.toFixed(2)}<span className="ml-2 text-[18px] font-bold text-white/70">±{(d.rsiPlusMinus ?? 0).toFixed(2)}</span>
        </p>
      ) : <p className="text-[18px] font-bold text-[#FFB020]">{d.invalidWhy}</p>}
      <p className="text-[16px] text-white/70">
        {d.contactMs} ms on the ground ±{Math.round(1.96 * d.contactSdMs)} · rebound {inch(d.heightCm)} in ±{Math.max(0.1, d.plusMinusCm / IN).toFixed(1)}
        {d.boxCm !== null ? ` · box about ${Math.round(d.boxCm)} cm` : ''}{source === 'live' && r.fps < 120 ? ' (estimate)' : ''}
      </p>
    </div>
  );
}
