'use client';

// SlowMoUpload — "Read a slow-motion video": the lab-grade jump (JUMP-PRO, 2026-10-24; owner: an OPTIONAL slow-mo
// upload, 240 fps). Adults only (the caller mounts it on the adult jump result).
//
// The file never leaves this phone: it is decoded here (lib/jump/slowmoDecode.ts), read by the same pose model, timed
// at the file's real rate with gravity as the clock (lib/jump/slowmo.ts), and shown with every jump's ± and the
// verified mark (source 'slowmo'). Nothing is saved or sent; leaving the page forgets it.
import { useRef, useState } from 'react';
import { Film } from 'lucide-react';
import { analyseSlowMo, type SlowMoResult } from '@/lib/jump/slowmo';
import { poseDecoder, type Decoder } from '@/lib/jump/slowmoDecode';
import { verifyJump } from '@/lib/jump/session';
import { BLOCK_WORDS, JumpSessionCard } from './jump-session-card';

const IN = 2.54;

/** How to film it, in four lines. */
export const SLOWMO_STEPS = [
  'Use your camera\'s Slo-mo (120 or 240 fps). Prop the phone at hip height, facing you, about 3 m away.',
  'Whole body in the shot, feet too. Stand still for two seconds.',
  'Hands on hips, jump as high as you can, land tall on your toes. Up to three jumps.',
  'Pick the video here. It is read on this phone and never uploaded.',
];

type Phase = { kind: 'idle' } | { kind: 'reading'; done: number; total: number } | { kind: 'done'; r: SlowMoResult } | { kind: 'error'; why: string };

export function SlowMoUpload({ decode }: { decode?: Decoder }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  const read = async (file: File) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase({ kind: 'reading', done: 0, total: 0 });
    try {
      const clip = await (decode ?? poseDecoder())(file, (done, total) => setPhase({ kind: 'reading', done, total }), ac.signal);
      setPhase({ kind: 'done', r: analyseSlowMo(clip.frames, clip.aspect) });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') { setPhase({ kind: 'idle' }); return; }
      setPhase({ kind: 'error', why: (e as Error)?.message || 'The video could not be read.' });
    }
  };

  if (!open) {
    return (
      <button type="button" data-slowmo-open onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/20 px-4 text-[16px] font-bold text-white/90">
        <Film aria-hidden className="h-5 w-5" /> Lab-grade: read a slow-motion video
      </button>
    );
  }
  const r = phase.kind === 'done' ? phase.r : null;
  const best = r?.ok ? r.t5.jumps.find((j) => j.index === r.t5.bestJump) ?? null : null;
  const v = r?.ok && best ? verifyJump(best, { poseHz: r.fps, source: 'slowmo' }) : null;
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
            {(best.heightCm / IN).toFixed(1)} in
            <span className="ml-2 text-[18px] font-bold text-white/70">±{Math.max(0.1, (1.96 * (best.heightSdCm ?? 0)) / IN).toFixed(1)}</span>
          </p>
          <p className="text-center text-[16px] text-white/70">
            {best.heightCm.toFixed(1)} cm · read at {Math.round(r.fps)} frames a second{r.stretch > 1 ? ` (the video played ${r.stretch}× slow)` : ''}
          </p>
          <p data-slowmo-verified={v?.verified} className="text-center text-[16px] font-bold" style={{ color: v?.verified ? '#00FF9D' : 'rgba(255,255,255,0.7)' }}>
            {v?.verified ? 'Verified, lab-grade' : `Not verified: ${BLOCK_WORDS[v?.blocks[0] ?? 'notValid']}`}
          </p>
          <JumpSessionCard t5={r.t5} source="slowmo" />
          <button type="button" onClick={() => setPhase({ kind: 'idle' })} className="min-h-12 w-full text-[16px] font-bold text-white/80 underline">Read another video</button>
        </>
      ) : null}
    </section>
  );
}
