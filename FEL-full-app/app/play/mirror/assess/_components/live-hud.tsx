'use client';

// What the athlete sees across the room while a test runs (spec §8): the big rep counter, the side, the countdown, one
// instruction, the prompts, and a stop button that is always there. Plain DOM over the canvas, so no text is mirrored.
import type { RunnerView } from '@/lib/assess/runner';
import { testDef, type Side } from '@/lib/assess/protocol';
import type { FramingIssue } from '@/lib/mirror/framing';

const CHIP: Record<FramingIssue, string> = {
  noBody: 'Step into the shot', cutOffBottom: 'Feet in the shot', cutOffTop: 'Head in the shot', tooClose: 'Step back',
  tooFar: 'Come closer', offCentre: 'Move to the middle', turned: 'Turn the way asked', dim: 'More light',
};
const MARK = { clean: 'bg-[#00FF9D]', fault: 'bg-[#FFB020]', notRead: 'bg-white/30' } as const;

export function LiveHud({ view, caption, onPain, onTakeoff, onStop }: {
  view: RunnerView; caption: string; onPain: (pain: boolean) => void; onTakeoff: (s: Side) => void; onStop: () => void;
}) {
  const v = view;
  const inTest = v.step === 'position' || v.step === 'countdown' || v.step === 'active' || v.step === 'paused' || v.step === 'calibrateSide';
  const showGuide = v.step === 'framing' || v.step === 'position' || v.step === 'calibrate' || v.step === 'calibrateSide';
  const framingOk = !!v.framing?.ok;
  return (
    <div className="absolute inset-0">
      {/* top bar: the test and the side */}
      <div className="absolute left-3 top-3 flex flex-col gap-1.5">
        {v.test ? <span className="rounded-full bg-black/60 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-white/85">{testDef(v.test).short}</span> : null}
        {v.label ? <span className="rounded-full bg-[#00E5FF] px-3 py-1 text-[14px] font-black tracking-wide text-black">{v.label}</span> : null}
        <span className="font-mono text-[10px] text-white/50">part {Math.min(v.progress.done + 1, v.progress.total)} of {v.progress.total}</span>
      </div>

      {/* the big rep counter */}
      {inTest && v.reps.target ? (
        <div className="absolute right-3 top-3 rounded-2xl bg-black/60 px-4 py-2 text-right">
          <div className="text-[44px] font-black leading-none tabular-nums text-white">{v.reps.count}<span className="text-[22px] text-white/45">/{v.reps.target}</span></div>
          <div className="mt-1.5 flex justify-end gap-1">
            {v.reps.marks.map((m, i) => <span key={i} className={`h-2.5 w-2.5 rounded-full ${MARK[m]}`} title={m} />)}
          </div>
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

      {/* paused */}
      {v.step === 'paused' ? (
        <div className="absolute inset-0 grid place-items-center bg-black/55 px-6 text-center">
          <div>
            <p className="text-[26px] font-black">Paused</p>
            <p className="mt-1 text-[15px] text-white/80">Step back into the shot to carry on.</p>
            {v.restartInMs !== null ? <p className="mt-2 font-mono text-[12px] text-white/55">This test starts again in {Math.ceil(v.restartInMs / 1000)} s</p> : null}
          </div>
        </div>
      ) : null}

      {/* the mini-result */}
      {v.step === 'miniResult' && v.mini ? (
        <div className="absolute inset-0 grid place-items-center bg-black/60 px-6 text-center">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#00E5FF]">Provisional</p>
            <p className="mt-2 text-[28px] font-black leading-tight">{v.mini.text}</p>
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

      {/* the one instruction, and stop */}
      <div className="absolute inset-x-3 bottom-3 flex items-end gap-2">
        <p className="min-h-[2.6em] flex-1 rounded-2xl bg-black/65 px-4 py-2 text-[15px] font-semibold leading-snug text-white">{v.instruction || caption}</p>
        {inTest || v.step === 'calibrate' ? (
          <button type="button" onClick={onStop} className="shrink-0 rounded-2xl border border-[#FFB020]/60 bg-black/70 px-3 py-2 text-[12.5px] font-bold text-[#FFB020]">
            Something hurts: stop
          </button>
        ) : null}
      </div>
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
