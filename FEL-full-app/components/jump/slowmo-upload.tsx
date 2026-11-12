'use client';

// SlowMoUpload — "Read a slow-motion video" (JUMP-PRO, 2026-10-24; owner: an OPTIONAL slow-mo upload, 240 fps). Adults
// only (the caller mounts it on the adult jump result).
// JUMP-TESTS (2026-10-25): the copy makes no accuracy claim (no "lab-grade" until the force-plate pilot); the review
// steps through the video frame by frame to set the take-off and landing by hand (frame-review.tsx: "manual frames",
// never verified); each jump's take-off speed (an estimate); "Keep" puts the result in the history on this phone; the
// pilot's build logs every trial (lib/jump/pilot.ts).
//
// The file never leaves this phone: it is decoded here (lib/jump/slowmoDecode.ts), read by the same pose model, timed
// at the file's real rate with gravity as the clock (lib/jump/slowmo.ts), and shown with every jump's ± and the
// verified mark (source 'slowmo'). Nothing is saved or sent; leaving the page forgets it.
import { useMemo, useRef, useState } from 'react';
import { Film } from 'lucide-react';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { analyseSlowMo, type SlowMoResult } from '@/lib/jump/slowmo';
import { poseDecoder, type Decoder } from '@/lib/jump/slowmoDecode';
import { verifyJump } from '@/lib/jump/session';
import { jumpKinematics } from '@/lib/jump/velocity';
import { historyId, keepJump } from '@/lib/jump/historyStore';
import { logCapture, pilotEnabled } from '@/lib/jump/pilot';
import { reachStorage, type ReachStorage } from '@/lib/jump/reachStore';
import type { ManualRead } from '@/lib/jump/manualFrames';
import { BLOCK_WORDS, JumpSessionCard } from './jump-session-card';
import { JumpVelocity } from './jump-velocity';
import { FrameReview } from './frame-review';

const IN = 2.54;

/** How to film it, in four lines. */
export const SLOWMO_STEPS = [
  'Use your camera\'s Slo-mo (120 or 240 fps). Prop the phone at hip height, facing you, about 3 m away.',
  'Whole body in the shot, feet too. Stand still for two seconds.',
  'Hands on hips, jump as high as you can, land tall on your toes. Up to three jumps.',
  'Pick the video here. It is read on this phone and never uploaded.',
];

type Phase = { kind: 'idle' } | { kind: 'reading'; done: number; total: number } | { kind: 'done'; r: SlowMoResult; clip: { file: File | null; frames: PoseFrame[]; fileFps: number; aspect: number } } | { kind: 'error'; why: string };

export function SlowMoUpload({ decode, storage, pilot = pilotEnabled() }: { decode?: Decoder; storage?: ReachStorage | null; pilot?: boolean }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [manual, setManual] = useState<ManualRead | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [keptId, setKeptId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // each counted jump's take-off speed, push-off and RSI-mod (estimates; lib/jump/velocity.ts)
  const kin = useMemo(() => {
    if (phase.kind !== 'done' || !phase.r.ok) return new Map();
    const { r, clip } = phase;
    const rebounded = new Set((r.t5.rebounds?.rebounds ?? []).map((x) => x.to));
    return new Map(r.t5.jumps.filter((j) => j.valid).map((j) => [j.index, jumpKinematics(j, { frames: clip.frames, front: r.calibration.front, countermovement: !rebounded.has(j.index) })]));
  }, [phase]);

  const read = async (file: File) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase({ kind: 'reading', done: 0, total: 0 });
    try {
      const clip = await (decode ?? poseDecoder())(file, (done, total) => setPhase({ kind: 'reading', done, total }), ac.signal);
      const r = analyseSlowMo(clip.frames, clip.aspect);
      // the frames on the real clock, for the frame-by-frame review and the push-off
      const frames = r.ok && r.stretch !== 1 ? clip.frames.map((f) => ({ ...f, t: f.t / r.stretch })) : clip.frames;
      if (r.ok && pilot) logCapture({ test: 'slowmo', source: 'video', t5: r.t5, fps: r.fps, stretch: r.stretch, frames, front: r.calibration.front });
      setManual(null); setReviewing(false); setKeptId(null);
      setPhase({ kind: 'done', r, clip: { file, frames, fileFps: clip.fileFps, aspect: clip.aspect } });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') { setPhase({ kind: 'idle' }); return; }
      setPhase({ kind: 'error', why: (e as Error)?.message || 'The video could not be read.' });
    }
  };

  if (!open) {
    return (
      <button type="button" data-slowmo-open onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 text-[16px] font-bold text-white/90">
        <Film aria-hidden className="h-5 w-5" /> Read a slow-motion video
      </button>
    );
  }
  const r = phase.kind === 'done' ? phase.r : null;
  const clip = phase.kind === 'done' ? phase.clip : null;
  const best = r?.ok ? r.t5.jumps.find((j) => j.index === r.t5.bestJump) ?? null : null;
  const v = r?.ok && best ? verifyJump(best, { poseHz: r.fps, source: 'slowmo', manual: !!manual }) : null;
  const shownCm = manual ? manual.heightCm : best?.heightCm ?? 0;
  const shownPm = manual ? manual.plusMinusCm : 1.96 * (best?.heightSdCm ?? 0);
  const store = storage === undefined ? reachStorage() : storage;
  const keep = () => {
    if (!r?.ok || !best) return;
    const id = historyId();
    const ok = keepJump(store, {
      id, at: new Date().toISOString(), test: 'slowmo', bestCm: shownCm, plusMinusCm: Math.round(shownPm * 10) / 10,
      jumps: r.t5.jumps.filter((j) => j.valid).length, verified: !!v?.verified, manualFrames: !!manual, source: 'video', fps: Math.round(r.fps),
      rsi: null, contactMs: null, v0Mps: (manual ? jumpKinematics({ takeoffT: manual.takeoffT, heightCm: manual.heightCm }, { countermovement: false }) : kin.get(best.index))?.v0Mps ?? null,
      rsiMod: manual ? null : kin.get(best.index)?.rsiMod ?? null,
    }, { adult: true });
    if (ok) setKeptId(id);
  };
  return (
    <section data-slowmo className="space-y-3 rounded-3xl border border-white/15 bg-white/[0.04] p-5">
      <h2 className="text-[18px] font-black text-white">Slow-motion jump</h2>
      {phase.kind === 'idle' || phase.kind === 'error' ? (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-[16px] leading-snug text-white/80">
            {SLOWMO_STEPS.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <label className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-2xl bg-white px-4 text-[16px] font-black text-black">
            Pick a video
            <input data-slowmo-file type="file" accept="video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
          </label>
          {phase.kind === 'error' ? <p data-slowmo-error className="text-[16px] font-bold text-[#FFB020]">{phase.why}</p> : null}
        </>
      ) : null}
      {phase.kind === 'reading' ? (
        <div data-slowmo-reading className="space-y-2">
          <p className="text-[16px] text-white/80">Reading every frame on this phone{phase.total ? `: ${phase.done} of ${phase.total}` : '…'}</p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full bg-[#00FF9D]" style={{ width: `${phase.total ? Math.round((phase.done / phase.total) * 100) : 3}%` }} /></div>
          <button type="button" onClick={() => abortRef.current?.abort()} className="min-h-12 text-[16px] font-bold text-white/80 underline">Stop</button>
        </div>
      ) : null}
      {r && !r.ok ? (
        <>
          <p data-slowmo-refused className="text-[16px] font-bold text-[#FFB020]">{r.why}</p>
          <button type="button" onClick={() => setPhase({ kind: 'idle' })} className="min-h-12 text-[16px] font-bold text-white/80 underline">Try another video</button>
        </>
      ) : null}
      {r?.ok && best ? (
        <>
          <p data-slowmo-best className="text-center text-[40px] font-black leading-none text-white">
            {(shownCm / IN).toFixed(1)} in
            <span className="ml-2 text-[18px] font-bold text-white/70">±{Math.max(0.1, shownPm / IN).toFixed(1)}</span>
          </p>
          <p className="text-center text-[16px] text-white/70">
            {shownCm.toFixed(1)} cm{manual ? ' · manual frames' : ''} · read at {Math.round(r.fps)} frames a second{r.stretch > 1 ? ` (the video played ${r.stretch}× slow)` : ''}
          </p>
          <p data-slowmo-verified={v?.verified} className="text-center text-[16px] font-bold" style={{ color: v?.verified ? '#00FF9D' : 'rgba(255,255,255,0.7)' }}>
            {v?.verified ? 'Verified jump' : `Not verified: ${BLOCK_WORDS[v?.blocks[0] ?? 'notValid']}`}
          </p>
          {manual ? <p data-app-read className="text-[16px] text-white/70">The app&apos;s own read, before you moved the frames:</p> : null}
          <JumpSessionCard t5={r.t5} source="slowmo" />
          <JumpVelocity t5={r.t5} kin={kin} />
          {clip && reviewing ? (
            <FrameReview frames={clip.frames} stretch={r.stretch} fileFps={clip.fileFps} file={clip.file} aspect={clip.aspect} jump={best}
              onApply={(m) => { setManual(m); setKeptId(null); if (m && pilot) logCapture({ test: 'slowmo', source: 'video', t5: r.t5, fps: r.fps, stretch: r.stretch, frames: clip.frames, front: r.calibration.front, manual: { index: best.index, read: m } }); }}
              onClose={() => setReviewing(false)} />
          ) : (
            <button type="button" data-review-open onClick={() => setReviewing(true)} className="min-h-12 w-full rounded-2xl border border-white/20 px-4 text-[16px] font-bold text-white/90">Check the frames</button>
          )}
          {keptId ? <p data-slowmo-kept className="text-center text-[16px] font-bold text-[#00FF9D]">Kept in your history on this phone.</p> : (
            <button type="button" data-slowmo-keep disabled={!store} onClick={keep} className="min-h-12 w-full rounded-2xl bg-white px-4 text-[16px] font-black text-black disabled:opacity-40">Keep in my history on this phone</button>
          )}
          <button type="button" onClick={() => setPhase({ kind: 'idle' })} className="min-h-12 w-full text-[16px] font-bold text-white/80 underline">Read another video</button>
        </>
      ) : null}
    </section>
  );
}
