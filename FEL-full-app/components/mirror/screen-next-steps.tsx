'use client';

// ScreenNextSteps — after a Movement Screen, what the athlete works on, in plain words. MIRROR-COACH P3, 2026-09-26.
//
// WHAT WAS MISSING. The station cards (station-results.tsx) show each check's value and one FIX line under a flag, and
// the summary shows a score and a headline. Nothing turned that into work the athlete could do, and the Mirror's
// written corrective blocks (lib/mirror/program.ts) were shown nowhere. The coach's panel now drafts correctives from the
// same screen — this is the athlete's side of the SAME mapping (lib/mirror/screenCorrectives.ts): a flag → what the
// camera saw, its FIX line and its corrective block; a check the camera could not read → run it again (never "clear");
// a pass → nothing to do. And the line every surface of the mapping carries: this is what the camera saw, not a
// diagnosis.
//
// It reads the runner's final grades — the numbers the server re-decides with the same table (lib/mirror/screenClaims.ts),
// so the phone and the server cannot disagree about a status.
//
// YOUTH (MIRROR-COACH P3 review, 2026-09-26; PLAN item 9, owner decisions #6 and #20): the written blocks are off for an
// athlete under 18 or with no birth year on file, and the card says so (athletePlan's blocksNote). The FIX line stays.
import type { ScreenId } from '@/lib/mirror/screen';
import { athletePlan, outcomesFromGrades, type GradeLike, type YouthGate } from '@/lib/mirror/screenCorrectives';

export interface ScreenNextStepsProps {
  /** The variant that ran (the runner's). */
  screen: ScreenId;
  /** The runner's final grades, one per camera check (lib/mirror/screenRunner.ts RunnerState.grades). */
  grades: readonly GradeLike[];
  /** The athlete's youth gate (youthGateFor(User.dobYear), from the page). Absent → no birth year: youth rules. */
  youth?: YouthGate;
}

export function ScreenNextSteps({ screen, grades, youth = 'unknownAge' }: ScreenNextStepsProps) {
  const plan = athletePlan(outcomesFromGrades(screen, grades), { youth });
  return (
    <section aria-labelledby="screen-next-steps-heading" className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5" data-next-steps>
      <h2 id="screen-next-steps-heading" className="fel-heading text-[15px] font-bold text-white/80">What to work on · estimated</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-white/70">{plan.headline}</p>

      {plan.work.length > 0 && (
        <ol className="mt-4 grid gap-3">
          {plan.work.map((w, i) => (
            <li key={i} className="rounded-xl border border-[#FFC24B]/25 bg-black/20 px-4 py-3" data-work-item>
              <p className="text-[13.5px] font-semibold text-white/85">{w.title}</p>
              <p className="mt-1 break-words text-[12.5px] leading-relaxed text-white/55">{w.saw}</p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/75"><span className="font-bold text-white/85">What to do: </span>{w.todo}</p>
              {w.block && (
                w.blockShownAbove
                  ? <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/55">Same block as above: {w.block.title}.</p>
                  : (
                    <div className="mt-1.5 text-[12.5px] leading-relaxed text-white/65">
                      <p><span className="font-bold text-white/80">{w.block.title}</span> · about {w.block.minutes} min</p>
                      <ul className="mt-0.5 list-disc pl-5 text-white/55">
                        {w.block.movements.map((m) => <li key={m}>{m}</li>)}
                      </ul>
                    </div>
                  )
              )}
            </li>
          ))}
        </ol>
      )}

      {plan.blocksNote && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-white/55" data-blocks-off>{plan.blocksNote}</p>
      )}

      {plan.retest.length > 0 && (
        <div className="mt-4">
          <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/40">Run these again</p>
          <ul className="mt-2 grid gap-2">
            {plan.retest.map((r, i) => (
              <li key={i} className="rounded-xl border border-white/8 px-4 py-2.5" data-retest-item>
                <span className="block text-[13px] font-semibold text-white/80">{r.title}</span>
                <span className="mt-0.5 block text-[12px] leading-relaxed text-white/50">{r.why}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plan.nothing.length > 0 && (
        <p className="mt-4 text-[12.5px] leading-relaxed text-white/55">Nothing to work on from: {plan.nothing.join(', ')}.</p>
      )}

      <p className="mt-4 border-t border-white/8 pt-3 text-[12.5px] font-semibold text-white/60">{plan.note}</p>
    </section>
  );
}
