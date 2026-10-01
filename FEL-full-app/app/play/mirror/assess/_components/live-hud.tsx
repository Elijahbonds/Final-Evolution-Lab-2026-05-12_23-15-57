'use client';

// What the athlete sees across the room while a test runs (SCREEN-REALTIME): huge move name, one-line cue, full-screen
// colour flashes, setup helper, and rejection reasons — readable from ~3 m without walking over.
import { Check } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { RunnerView } from '@/lib/assess/runner';
import { testDef, type Side } from '@/lib/assess/protocol';
import type { FramingIssue } from '@/lib/mirror/framing';
import { repDots } from '@/lib/screen/ui';
import { TRACKING_LOSS_PROMPT } from '@/lib/screen/copy';
import { cueFlash, cueRep, FLASH_COLOUR, FLASH_MS } from '@/lib/screen/realtime-cues';

const CHIP: Record<FramingIssue, string> = {
  noBody: 'Step into the shot', cutOffBottom: 'Feet in the shot', cutOffTop: 'Head in the shot', tooClose: 'Step back',
  tooFar: 'Come closer', offCentre: 'Move to the middle', turned: 'Turn the way asked', dim: 'More light helps',
};
const DOT = { clean: 'bg-[#00FF9D]', fault: 'bg-[#FFB020]', empty: 'border border-white/50 bg-transparent' } as const;

export function LiveHud({ view, onPain, onTakeoff, onStop }: {
  view: RunnerView; onPain: (pain: boolean) => void; onTakeoff: (s: Side) => void; onStop: () => void;
}) {
  const v = view;
  const lastFlash = useRef<RunnerView['flash']>(null);
  const lastMark = useRef<string>('');

  useEffect(() => {
    if (v.flash && v.flash !== lastFlash.current) {
      lastFlash.current = v.flash;
      cueFlash(v.flash);
    }
  }, [v.flash]);

  useEffect(() => {
    const key = v.reps.marks.join(',');
    if (key !== lastMark.current && v.reps.marks.length) {
      const m = v.reps.marks[v.reps.marks.length - 1];
      if (m) cueRep(m);
      lastMark.current = key;
    }
  }, [v.reps.marks]);

  const inTest = v.step === 'position' || v.step === 'countdown' || v.step === 'active' || v.step === 'paused' || v.step === 'calibrateSide';
  const showGuide = v.step === 'framing' || v.step === 'position' || v.step === 'calibrate' || v.step === 'calibrateSide';
  const framingOk = !!v.framing?.ok || v.setupReady;
  const flashColour = v.flash ? FLASH_COLOUR[v.flash] : null;

  return (
    <div className="absolute inset-0">
      {/* full-screen colour flash */}
      {flashColour ? (
        <div key={v.flash} className="pointer-events-none absolute inset-0 z-[5] animate-pulse" style={{ backgroundColor: flashColour, opacity: 0.55, animationDuration: `${FLASH_MS}ms` }} aria-hidden />
      ) : null}

      {/* move header: readable from ~3 m */}
      {v.move ? (
        <div className="absolute inset-x-2 top-2 z-[6] text-center">
          <p className="text-[13px] font-bold uppercase tracking-[0.2em] text-white/70">Move {v.move.index} of {v.move.total}</p>
          <p className="mt-0.5 text-[clamp(28px,8vw,44px)] font-black leading-none text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">{v.move.name}</p>
          <p className="mt-1 text-[clamp(16px,4.5vw,22px)] font-bold leading-snug text-[#00E5FF]">{v.move.cue}</p>
        </div>
      ) : (
        <div className="absolute left-3 top-3 flex flex-col gap-1.5 z-[6]">
          {v.test ? <span className="rounded-full bg-black/60 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] text-white/85">{testDef(v.test).short}</span> : null}
          {v.label ? <span className="rounded-full bg-[#00E5FF] px-3 py-1 text-[14px] font-black tracking-wide text-black">{v.label}</span> : null}
        </div>
      )}

      {/* rep dots */}
      {inTest && v.reps.target ? (
        <div data-rep-dots className="absolute right-3 top-3 z-[6] flex gap-2.5 rounded-2xl bg-black/60 px-3 py-2.5" aria-label={`${v.reps.count} counted`}>
          {repDots(v.reps.marks, v.reps.target).map((d, i) => <span key={i} data-dot={d} className={`h-5 w-5 rounded-full ${DOT[d]}`} />)}
        </div>
      ) : null}

      {/* setup helper */}
      {showGuide ? (
        <>
          <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 z-[2] h-full w-full" aria-hidden>
            <g fill="none" stroke={framingOk ? '#00FF9D' : 'rgba(255,255,255,0.45)'} strokeWidth="0.6" strokeDasharray={framingOk ? '0' : '2 1.5'}>
              <circle cx="50" cy="16" r="5" />
              <path d="M42 24 L58 24 L61 50 L56 52 L55 86 L51 86 L50 56 L49 86 L45 86 L44 52 L39 50 Z" />
              <rect x="30" y="86" width="40" height="6" rx="1" />
            </g>
          </svg>
          <div className="absolute inset-x-3 bottom-20 z-[6] rounded-2xl border border-white/15 bg-black/75 p-3 text-center backdrop-blur">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">Camera setup</p>
            <p className="mt-1 text-[14px] leading-snug text-white/85">Prop your device at hip height, 2–3 m away, portrait or landscape.</p>
            <p className={`mt-2 text-[clamp(18px,5vw,26px)] font-black leading-tight ${v.setupReady ? 'text-[#00FF9D]' : 'text-[#FFB020]'}`}>
              {v.setupReady ? 'Whole body in view — ready' : (v.framing?.instruction ?? 'Step into the shot')}
            </p>
          </div>
        </>
      ) : null}
      {showGuide && v.framing && !v.framing.ok && !v.setupReady ? (
        <div className="absolute inset-x-3 top-28 z-[6] flex flex-wrap justify-center gap-1.5">
          {v.framing.issues.filter((i) => i !== 'dim').map((i) => <span key={i} className="rounded-full bg-black/70 px-3 py-1 text-[13px] font-bold text-[#FFB020]">{CHIP[i]}</span>)}
        </div>
      ) : null}
      {v.dimWarning ? (
        <p className="absolute inset-x-3 top-[7.5rem] z-[6] text-center text-[14px] font-bold text-[#FFB020]">Low light — move closer to a window if you can</p>
      ) : null}
      {(v.step === 'calibrate' || v.step === 'calibrateSide') && v.hold > 0 ? (
        <div className="absolute inset-x-10 bottom-24 z-[6] h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-[#00FF9D] transition-[width]" style={{ width: `${Math.round(v.hold * 100)}%` }} />
        </div>
      ) : null}

      {/* countdown */}
      {v.step === 'countdown' && v.countdown ? (
        <div className="absolute inset-0 z-[7] grid place-items-center">
          <span className="text-[clamp(120px,32vw,180px)] font-black leading-none text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">{v.countdown}</span>
        </div>
      ) : null}
      {v.step === 'countdown' && !v.countdown ? (
        <div className="absolute inset-0 z-[7] grid place-items-center px-6 text-center">
          <p className="text-[clamp(22px,6vw,34px)] font-black text-white">Hold still…</p>
        </div>
      ) : null}

      {/* rejection reason */}
      {v.rejection ? (
        <div data-rejection className="absolute inset-x-4 bottom-28 z-[6] rounded-2xl border border-[#FFB020]/50 bg-black/80 px-4 py-3 text-center">
          <p className="text-[clamp(16px,4.5vw,22px)] font-bold text-[#FFB020]">{v.rejection.text}</p>
        </div>
      ) : null}
      {v.retryMessage ? (
        <div data-retry className="absolute inset-x-4 bottom-28 z-[6] rounded-2xl border border-[#FFB020]/50 bg-black/80 px-4 py-3 text-center">
          <p className="text-[clamp(16px,4.5vw,22px)] font-bold text-[#FFB020]">{v.retryMessage}</p>
        </div>
      ) : null}

      {/* tracking lost */}
      {v.step === 'paused' ? (
        <div data-tracking-loss className="absolute inset-0 z-[8] grid place-items-center bg-black/60 px-6 text-center">
          <div>
            <p className="text-[clamp(24px,7vw,34px)] font-black">{TRACKING_LOSS_PROMPT}</p>
            <p className="mt-1 text-[16px] text-white/80">Paused. {v.framing && !v.framing.ok ? v.framing.instruction : 'Step back into the shot to carry on.'}</p>
            {v.restartInMs !== null ? <p className="mt-2 text-[12px] text-white/55">This check starts again in {Math.ceil(v.restartInMs / 1000)} s</p> : null}
          </div>
        </div>
      ) : null}

      {/* done beat */}
      {(v.step === 'partDone' && v.done) || (v.step === 'miniResult' && v.mini) ? (
        <div data-done-beat className="absolute inset-0 z-[8] grid place-items-center bg-black/60 px-6 text-center">
          <div>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#00FF9D] text-black"><Check aria-hidden className="h-9 w-9" /></span>
            <p className="mt-3 text-[clamp(24px,7vw,32px)] font-black leading-tight">{v.step === 'miniResult' && v.mini ? v.mini.text : 'Done'}</p>
          </div>
        </div>
      ) : null}

      {/* tap prompts only when not hands-free */}
      {!v.handsFree && (v.step === 'pain' || v.step === 'painCheck') ? (
        <Prompt title={v.step === 'pain' ? 'Any pain right now?' : 'Any pain in that one?'}
          note="If something hurts, the screen stops here and nothing is saved.">
          <button type="button" onClick={() => onPain(false)} className="rounded-full bg-[#00FF9D] px-7 py-3 text-[18px] font-black text-black">No</button>
          <button type="button" onClick={() => onPain(true)} className="rounded-full bg-[#FFB020] px-7 py-3 text-[18px] font-black text-black">Yes</button>
        </Prompt>
      ) : null}
      {!v.handsFree && v.step === 'takeoff' ? (
        <Prompt title="Which foot do you take off from?" note="Asked once. Your sided results are labelled with your jumping leg.">
          <button type="button" onClick={() => onTakeoff('left')} className="rounded-full bg-white px-7 py-3 text-[18px] font-black text-black">Left</button>
          <button type="button" onClick={() => onTakeoff('right')} className="rounded-full bg-white px-7 py-3 text-[18px] font-black text-black">Right</button>
        </Prompt>
      ) : null}

      {inTest || v.step === 'calibrate' ? (
        <div className="absolute bottom-3 right-3 z-[6]">
          <button type="button" onClick={onStop} data-stop className="rounded-2xl border border-[#FFB020]/60 bg-black/70 px-3 py-2 text-[12.5px] font-bold text-[#FFB020]">
            Something hurts: stop
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Prompt({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 z-[9] grid place-items-center bg-black/65 px-6 text-center">
      <div>
        <p className="text-[26px] font-black leading-tight">{title}</p>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] text-white/65">{note}</p>
        <div className="mt-5 flex justify-center gap-3">{children}</div>
      </div>
    </div>
  );
}
