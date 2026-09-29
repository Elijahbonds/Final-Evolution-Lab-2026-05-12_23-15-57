'use client';

// What the athlete sees across the room while a test runs (spec §8): the big rep counter, the side, the countdown, one
// instruction, the prompts, and a stop button that is always there. Plain DOM over the canvas, so no text is mirrored.
//
// SCREEN-SHIP (Squad gate 2): a framing outline until framed, then a big 3-2-1, then the check with three rep dots that
// fill only on COUNTED reps (A2-2), then a clear "Done" beat; lost tracking shows "Step back into the light" and
// pauses. No score is shown mid-screen.
import { Check } from 'lucide-react';
import type { RunnerView } from '@/lib/assess/runner';
import { testDef, type Side } from '@/lib/assess/protocol';
import type { FramingIssue } from '@/lib/mirror/framing';
import { repDots } from '@/lib/screen/ui';
import { TRACKING_LOSS_PROMPT } from '@/lib/screen/copy';

const CHIP: Record<FramingIssue, string> = {
  noBody: 'Step into the shot', cutOffBottom: 'Feet in the shot', cutOffTop: 'Head in the shot', tooClose: 'Step back',
  tooFar: 'Come closer', offCentre: 'Move to the middle', turned: 'Turn the way asked', dim: 'More light',
};
const DOT = { clean: 'bg-[#00FF9D]', fault: 'bg-[#FFB020]', empty: 'border border-white/50 bg-transparent' } as const;

export function LiveHud({ view, onPain, onTakeoff, onStop }: {
  view: RunnerView; onPain: (pain: boolean) => void; onTakeoff: (s: Side) => void; onStop: () => void;
}) {
  const v = view;
  const inTest = v.step === 'position' || v.step === 'countdown' || v.step === 'active' || v.step === 'paused' || v.step === 'calibrateSide';
  const showGuide = v.step === 'framing' || v.step === 'position' || v.step === 'calibrate' || v.step === 'calibrateSide';
  const framingOk = !!v.framing?.ok;
  return (
    <div className="absolute inset-0">
      {/* top bar: the test and the side */}
      <div className="absolute left-3 top-3 flex flex-col gap-1.5">
        {v.test ? <span className="rounded-full bg-black/60 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.12em] text-white/85">{testDef(v.test).short}</span> : null}
        {v.label ? <span className="rounded-full bg-[#00E5FF] px-3 py-1 text-[14px] font-black tracking-wide text-black">{v.label}</span> : null}
      </div>

      {/* the big rep counter */}
      {inTest && v.reps.target ? (
        <div data-rep-dots className="absolute right-3 top-3 flex gap-2 rounded-2xl bg-black/60 px-3 py-2.5" aria-label={`${v.reps.count} counted`}>
          {repDots(v.reps.marks, v.reps.target).map((d, i) => <span key={i} data-dot={d} className={`h-4 w-4 rounded-full ${DOT[d]}`} />)}
        </div>
      ) : null}

      {/* the framing guide: a silhouette and a floor box, green once the shot holds */}
      {showGuide ? (
        <svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
          <g fill="none" stroke={framingOk ? '#00FF9D' : 'rgba(255,255,255,0.45)'} strokeWidth="0.6" strokeDasharray={framingOk ? '0' : '2 1.5'}>
            <circle cx="50" cy="16" r="5" />
            <path d="M42 24 L58 24 L61 50 L56 52 L55 86 L51 86 L50 56 L49 86 L45 86 L44 52 L39 50 Z" />
            <rect x="30" y="86" width="40" height="6" rx="1" />
          </g>
        </svg>
      ) : null}
      {showGuide && v.framing && !v.framing.ok ? (
        <div className="absolute inset-x-3 top-24 flex flex-wrap justify-center gap-1.5">
          {v.framing.issues.map((i) => <span key={i} className="rounded-full bg-black/70 px-3 py-1 text-[13px] font-bold text-[#FFB020]">{CHIP[i]}</span>)}
        </div>
      ) : null}
      {(v.step === 'calibrate' || v.step === 'calibrateSide') && v.hold > 0 ? (
        <div className="absolute inset-x-10 bottom-24 h-2 overflow-hidden rounded-full bg-white/15">
          <div className="h-full bg-[#00FF9D] transition-[width]" style={{ width: `${Math.round(v.hold * 100)}%` }} />
        </div>
      ) : null}

      {/* the countdown */}
      {v.step === 'countdown' && v.countdown ? (
        <div className="absolute inset-0 grid place-items-center">
          <span className="text-[140px] font-black leading-none text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">{v.countdown}</span>
        </div>
      ) : null}

      {/* tracking lost: paused */}
      {v.step === 'paused' ? (
        <div data-tracking-loss className="absolute inset-0 grid place-items-center bg-black/60 px-6 text-center">
          <div>
            <p className="text-[26px] font-black">{TRACKING_LOSS_PROMPT}</p>
            <p className="mt-1 text-[15px] text-white/80">Paused. {v.framing && !v.framing.ok ? v.framing.instruction : 'Step back into the shot to carry on.'}</p>
            {v.restartInMs !== null ? <p className="mt-2 text-[12px] text-white/55">This check starts again in {Math.ceil(v.restartInMs / 1000)} s</p> : null}
          </div>
        </div>
      ) : null}

      {/* the "Done" beat: after a part, and after a test */}
      {(v.step === 'partDone' && v.done) || (v.step === 'miniResult' && v.mini) ? (
        <div data-done-beat className="absolute inset-0 grid place-items-center bg-black/60 px-6 text-center">
          <div>
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#00FF9D] text-black"><Check aria-hidden className="h-9 w-9" /></span>
            <p className="mt-3 text-[28px] font-black leading-tight">{v.step === 'miniResult' && v.mini ? v.mini.text : 'Done'}</p>
          </div>
        </div>
      ) : null}

      {/* the prompts */}
      {v.step === 'pain' || v.step === 'painCheck' ? (
        <Prompt title={v.step === 'pain' ? 'Any pain right now?' : 'Any pain in that one?'}
          note="If something hurts, the screen stops here and nothing is saved.">
          <button type="button" onClick={() => onPain(false)} className="rounded-full bg-[#00FF9D] px-7 py-3 text-[18px] font-black text-black">No</button>
          <button type="button" onClick={() => onPain(true)} className="rounded-full bg-[#FFB020] px-7 py-3 text-[18px] font-black text-black">Yes</button>
        </Prompt>
      ) : null}
      {v.step === 'takeoff' ? (
        <Prompt title="Which foot do you take off from?" note="Asked once. Your sided results are labelled with your jumping leg.">
          <button type="button" onClick={() => onTakeoff('left')} className="rounded-full bg-white px-7 py-3 text-[18px] font-black text-black">Left</button>
          <button type="button" onClick={() => onTakeoff('right')} className="rounded-full bg-white px-7 py-3 text-[18px] font-black text-black">Right</button>
        </Prompt>
      ) : null}

      {/* stop, always there in a check. The one instruction sits UNDER the picture (the page's), not over it: on a
          portrait phone a 4:3 picture is short, and a setup line over it wrapped into the labels and the overlays. */}
      {inTest || v.step === 'calibrate' ? (
        <div className="absolute bottom-3 right-3">
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
    <div className="absolute inset-0 grid place-items-center bg-black/65 px-6 text-center">
      <div>
        <p className="text-[26px] font-black leading-tight">{title}</p>
        <p className="mx-auto mt-2 max-w-sm text-[13.5px] text-white/65">{note}</p>
        <div className="mt-5 flex justify-center gap-3">{children}</div>
      </div>
    </div>
  );
}
