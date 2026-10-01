// SessionCorrectives — what one press/row set earns, under its summary in the Mirror (MIRROR-COACH P9, 2026-09-30).
//
// The written correctives (lib/mirror/correctives.ts setCorrectives): the band drill for each drift the camera read,
// each with its breath and dose; for a known adult, the release to run first, ordered from the centre out; the retest
// line; and the caution, on the card rather than in a footer. Under youth rules (under 18, or no birth year on file —
// owner decisions #6 and #20) the card says why there is nothing, and nothing else.
//
// Stateless and hook-free, so a server render is its test (session-correctives.test.tsx). It reads the summary the
// harness already holds — nothing is fetched and nothing is saved.
import Link from 'next/link';
import { CORRECTIVES_PATH, MIRROR_CORRECTIVE_SESSIONS, setCorrectives, type SetSummaryLike } from '@/lib/mirror/correctives';
import type { YouthGate } from '@/lib/mirror/screenCorrectives';

/** A line as a sentence: its own full stop kept, one added when it has none. */
export const sentence = (s: string) => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

export interface SessionCorrectivesProps {
  summary: SetSummaryLike;
  /** youthGateFor(User.dobYear), from the page. Absent → no birth year on file: youth rules. */
  youth?: YouthGate;
}

export function SessionCorrectives({ summary, youth = 'unknownAge' }: SessionCorrectivesProps) {
  const c = setCorrectives(summary, youth);
  return (
    <div data-set-correctives className="mt-5 border-t border-white/[0.06] pt-4">
      <h3 className="fel-heading text-[14px] font-bold text-white/80">Correctives from this set · estimated</h3>

      {c.off ? (
        <p data-correctives-off className="mt-2 text-[12.5px] leading-relaxed text-white/55">{c.off}</p>
      ) : c.thin ? (
        <p data-correctives-thin className="mt-2 text-[12.5px] leading-relaxed text-white/55">{c.thin}</p>
      ) : c.clean ? (
        <p data-correctives-clean className="mt-2 text-[12.5px] leading-relaxed text-white/60">{c.clean}</p>
      ) : (
        <>
          {c.release.length > 0 && (
            <div data-release className="mt-3">
              <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/40">Release first · adults</p>
              <ol className="mt-1.5 grid gap-2">
                {c.release.map((r) => (
                  <li key={r.zone} data-release-zone={r.zone} className="rounded-xl border border-white/8 px-3.5 py-2.5 text-[12.5px] leading-relaxed">
                    <p className="font-semibold text-white/85">{r.tissue} · {r.holdSec}s per side, {r.reps} slow passes</p>
                    <p className="mt-0.5 text-white/60">{sentence(r.tool)} {sentence(r.pin)}</p>
                    <p className="mt-0.5 text-white/60">{sentence(r.stretch)}</p>
                    <p className="mt-0.5 text-white/55">Breath: {sentence(r.breath)}</p>
                    <p className="mt-0.5 text-white/45">{r.avoid}</p>
                    <p className="mt-0.5 text-white/45">{r.because}</p>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {c.band.length > 0 && (
            <div className="mt-3">
              <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/40">Band drills</p>
              <ol className="mt-1.5 grid gap-2">
                {c.band.map((d) => (
                  <li key={d.signal} data-band={d.signal} className="rounded-xl border border-[#00E5FF]/20 px-3.5 py-2.5 text-[12.5px] leading-relaxed">
                    <p className="font-semibold text-white/85">
                      {d.title} · {d.dosage.sets} x {d.dosage.reps}, {d.dosage.holdSec}s hold
                    </p>
                    <p className="mt-0.5 text-white/50">The camera read {d.read}.</p>
                    <p className="mt-0.5 text-white/60">{d.setup}</p>
                    <p className="mt-0.5 text-white/60">The band: {sentence(d.rnt.feed)} {sentence(d.rnt.direction)} {sentence(d.rnt.load)}</p>
                    <p className="mt-0.5 text-white/80"><span className="font-bold">Think: </span>{d.cue}</p>
                    <p className="mt-0.5 text-white/55">
                      Breath: {sentence(d.breath.pattern)} {d.breath.timing} (in {d.breath.inhaleSec.toFixed(1)}s, out {d.breath.exhaleSec.toFixed(1)}s).
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {c.retest && <p data-retest className="mt-3 text-[12.5px] leading-relaxed text-white/65">{c.retest}</p>}
        </>
      )}

      {!c.off && (
        <>
          <p className="mt-3 text-[11.5px] leading-relaxed text-white/40">{c.caution}</p>
          <Link href={CORRECTIVES_PATH} className="mt-2 inline-block text-[12.5px] font-semibold text-[#00E5FF] hover:underline">
            All correctives and your program →
          </Link>
        </>
      )}
    </div>
  );
}

/**
 * The correctives beside the Mirror's pattern picker (MIRROR-COACH P9): lib/mirror/correctives.ts
 * MIRROR_CORRECTIVE_SESSIONS, each a link into the correctives page. They read no camera, so they are not pattern tabs.
 * Shown to a known adult only — under youth rules they are off (the page itself says why to anyone who lands there).
 */
export function CorrectivesPicker({ youth = 'unknownAge' }: { youth?: YouthGate }) {
  if (youth !== null) return null;
  return (
    <nav aria-label="Correctives" data-corrective-picker className="-mt-2 mb-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-[12px]">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-white/35">Correctives</span>
      {MIRROR_CORRECTIVE_SESSIONS.map((c) => (
        <Link key={c.id} href={c.href} className="font-bold text-[#00E5FF]/80 hover:text-[#00E5FF]">{c.label}</Link>
      ))}
    </nav>
  );
}
