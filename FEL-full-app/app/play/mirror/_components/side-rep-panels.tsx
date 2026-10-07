'use client';

// The hip hinge's and the push-up's panels (MIRROR-MOVES P2, 2026-10-07; plan Phase 2): the safety-first framing before
// Start, the stage caption, the checks as the last rep read them, and the review. The session is lib/mirror/sideRepStage.ts;
// the harness steps it and hands these the state. Same copy rules as every Mirror panel: what the camera read, estimated,
// never a diagnosis; a check the camera could not read says so, never "clean".
import type { CueEvent } from '@/lib/babylon/nexus/neuro-mirror/rules/cue-engine';
import { SIDE_TURNED } from '@/lib/mirror/framing';
import { sideRepReview, type SideRepSpec, type SideRepState } from '@/lib/mirror/sideRepStage';

/** Before Start: how to set the phone up for a side-on movement, and the safety line. */
export function SideRepFraming({ lines }: { lines: readonly string[] }) {
  return (
    <section data-side-framing className="mt-5 rounded-2xl border border-[#FFC24B]/25 bg-[#FFC24B]/[0.04] p-4">
      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#FFC24B]">Set up side-on</p>
      <ul className="mt-2 space-y-1.5 text-[13px] leading-relaxed text-white/70">
        {lines.map((l) => <li key={l}>{l}</li>)}
      </ul>
    </section>
  );
}

/** Under the stage, while live: what this stage is, and which rep. */
export function SideRepCaption<F extends string>({ spec, state, setupLine }: { spec: SideRepSpec<F>; state: SideRepState<F>; setupLine: string }) {
  return (
    <>
      <p className="mt-4 text-[13px] leading-relaxed text-white/55" data-side-caption>
        {state.stage === 'setup' && (<><span className="font-bold text-white">Get set.</span> {setupLine}</>)}
        {state.stage === 'check' && (
          <><span className="font-bold text-white">The movement check.</span> {spec.checkReps} slow reps — measured, not cued. Rep {Math.min(state.reps + 1, spec.checkReps)} of {spec.checkReps}.</>
        )}
        {state.stage === 'work' && (
          <><span className="font-bold text-white">The work set.</span> {spec.workReps} reps — cued between reps from what the camera reads. Rep {Math.min(state.reps + 1, spec.workReps)} of {spec.workReps}.</>
        )}
        {state.stage === 'review' && (<><span className="font-bold text-white">Review.</span> What each rep read, and whether it held.</>)}
      </p>
      {state.stage !== 'review' && state.turnPromptSaid && (
        <p className="mt-2 text-[13px] font-semibold leading-relaxed text-[#FFC24B]" data-side-turn>{SIDE_TURNED}</p>
      )}
    </>
  );
}

/** The pattern's checks, as the last read rep showed them. */
export function SideRepChecks<F extends string>({ spec, state, label, live }: { spec: SideRepSpec<F>; state: SideRepState<F>; label: (f: F) => string; live: boolean }) {
  const reps = [...state.checkReps, ...state.workReps];
  const last = [...reps].reverse().find((r) => r.read) ?? null;
  return (
    <>
      <h2 className="fel-heading mb-3 text-[15px] font-bold text-white/80">The checks · read side-on, rep by rep</h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {spec.faults.map((f) => {
          const faulting = !!last && last.faults.includes(f);
          return (
            <li
              key={f}
              className="flex items-center gap-3 rounded-2xl border px-4 py-3 transition-colors duration-300"
              style={{
                borderColor: faulting ? 'rgba(255,51,102,0.35)' : 'rgba(255,255,255,0.08)',
                background: faulting ? 'rgba(255,51,102,0.06)' : 'rgba(255,255,255,0.02)',
              }}
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: !last ? 'rgba(255,255,255,0.25)' : faulting ? '#FF3366' : '#00FF9D' }} />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-white/85">{label(f)}</span>
                <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
                  {!last ? (live ? 'No rep read yet' : 'Waiting for the camera') : faulting ? 'Last rep · estimated fault' : 'Last rep · estimated clean'}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

/** The review: each stage's reps, the faults by how many reps showed them, what was cued, what the fade did, the verdict. */
export function SideRepReviewCard<F extends string>({ spec, state, label, cueLog, fadeLines }: {
  spec: SideRepSpec<F>; state: SideRepState<F>; label: (f: F) => string; cueLog: readonly CueEvent<string>[]; fadeLines: readonly string[];
}) {
  const r = sideRepReview(spec, state, label);
  const stage = (name: string, s: typeof r.check) => (
    <div>
      <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">{name}</p>
      <p className="fel-heading mt-1 text-[24px] font-black leading-none text-white">
        {s.reps}<span className="ml-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-white/35">reps</span>
      </p>
      {s.faultReps.length === 0 ? (
        <p className="mt-2 text-[13px] text-white/60">{s.reps === 0 ? 'Not reached.' : s.unread === s.reps ? 'Not read — the camera did not have a side-on view.' : 'No faults measured.'}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {s.faultReps.map((x) => (
            <li key={x.fault} className="flex gap-2 text-[13px] text-white/70">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-[#FF3366]" />
              {label(x.fault)} — {x.reps} of {s.reps - s.unread} reps read
            </li>
          ))}
        </ul>
      )}
      {s.unread > 0 && s.unread < s.reps && (
        <p className="mt-2 text-[12px] text-[#FFC24B]">{s.unread} of {s.reps} reps not read (not side-on, or too little light).</p>
      )}
    </div>
  );
  return (
    <section data-side-review className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
      <h2 className="fel-heading text-[15px] font-bold text-white/80">What the camera measured · estimated</h2>
      <div className="mt-3 grid gap-5 sm:grid-cols-3">
        {stage('The check', r.check)}
        {stage('The work set', r.work)}
        <div>
          <p className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">What was cued</p>
          {cueLog.length === 0 ? (
            <p className="mt-2 text-[13px] text-white/60">No corrections were cued during the work set.</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {cueLog.map((c, i) => (
                <li key={i} className="text-[13px] text-white/70">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-white/30">{c.level}</span>{' '}{c.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <p className="mt-4 border-t border-white/[0.06] pt-4 text-[13px] leading-relaxed text-white/50" data-side-verdict>{r.verdict}</p>
      {fadeLines.length > 0 && (
        <ul data-fade-lines className="mt-3 space-y-1 text-[12.5px] leading-relaxed text-white/55">
          {fadeLines.map((l) => <li key={l}>{l}</li>)}
        </ul>
      )}
    </section>
  );
}
