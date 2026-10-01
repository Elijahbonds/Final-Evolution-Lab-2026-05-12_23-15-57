// CorrectivesView — the Mirror's correctives page (MIRROR-COACH P9, 2026-09-30; PLAN item 9, rule (e)).
//
// The picker over the written correctives (lib/mirror/correctives.ts MIRROR_CORRECTIVE_SESSIONS) and each one in full:
//   · BAND DRILLS — one per drift the press/row camera reads, each saying what it answers ("the camera read …,
//     estimated"), the set-up, the band, the one thing to think about, the breath and the dose ladder.
//   · RELEASE — pin, then move: the three that remain (the abdominal and hip-front pins were removed), each with its
//     avoid line on the card, and the retest line.
//   · PROGRAM — built from the athlete's saved press/row sets (lib/mirror/program.ts programCycle): the program in force,
//     how many sets to the retest, and what the last retest said — or, plainly, why there is none yet.
// Under youth rules (under 18, or no birth year on file: owner decisions #6, #20) the page says why the correctives are
// off, and shows none of them.
//
// Stateless and hook-free: the page (app/play/mirror/correctives/page.tsx) reads, this renders, and a server render is
// its test (correctives-view.test.tsx).
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  CORRECTIVES_YOUTH_OFF, MIRROR_CORRECTIVE_SESSIONS, type ProgramView,
} from '@/lib/mirror/correctives';
import { BAND_DRILLS, CORRECTIVE_CAUTION, MIRROR_SIGNAL_READ, breathFor, dosageFor, type MirrorSignal } from '@/lib/babylon/nexus/neuro-mirror/rules/rnt-breath';
import { RELEASE_ZONES, releaseProtocol } from '@/lib/babylon/nexus/neuro-mirror/rules/smr-pin-stretch';
import { CAMERA_NOT_DIAGNOSIS, type YouthGate } from '@/lib/mirror/screenCorrectives';
import { sentence } from './session-correctives';

export interface CorrectivesViewProps {
  youth: YouthGate;
  program: ProgramView;
  /** An adult held back by the health intake (lib/mirror/correctives.ts intakeHold): the line, and nothing else. */
  hold?: string | null;
}

const SIGNALS: readonly MirrorSignal[] = ['trunkShift', 'elbowPath', 'shoulderRise'];
const KIND_WORD = { release: 'Release', activate: 'Hold', pattern: 'Load it' } as const;

/** The dose ladder in words, from the prescriber's own tiers (rnt-breath.ts dosageFor). */
export function doseLadderLine(): string {
  const lo = dosageFor(0);
  const hi = dosageFor(99);
  return `${lo.sets} x ${lo.reps} with a ${lo.holdSec}s hold; the more a set drifted, the more it earns, up to ${hi.sets} x ${hi.reps} with a ${hi.holdSec}s hold.`;
}

export function CorrectivesView({ youth, program, hold = null }: CorrectivesViewProps) {
  return (
    <div className="relative mx-auto max-w-[900px] px-4 pb-16 pt-4 text-white">
      <header className="mb-5 flex items-center gap-3">
        <Link
          href="/play/mirror"
          aria-label="Back to the Mirror"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.03]
                     text-white/55 transition-colors hover:border-white/25 hover:text-white"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
        </Link>
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-[#00E5FF]">The Mirror</p>
          <h1 className="fel-heading truncate text-[22px] font-black leading-none tracking-tight text-white md:text-[26px]">Correctives</h1>
        </div>
      </header>

      <p className="text-[13.5px] leading-relaxed text-white/60">
        Written work for what the Mirror reads: a band drill for each drift, a release to run first, and a program that
        builds across your sets. Every number behind them is estimated.
      </p>

      {youth !== null ? (
        <p data-correctives-off className="mt-5 rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-[13.5px] leading-relaxed text-white/65">
          {CORRECTIVES_YOUTH_OFF[youth]}
        </p>
      ) : hold ? (
        <p data-correctives-hold className="mt-5 rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-[13.5px] leading-relaxed text-white/65">
          {hold}{' '}
          <Link href="/play/mirror" className="font-semibold text-[#00E5FF] hover:underline">Open the Mirror</Link>
        </p>
      ) : (
        <>
          <nav aria-label="Correctives" className="mt-5 flex flex-wrap gap-2" data-corrective-picker>
            {MIRROR_CORRECTIVE_SESSIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[12.5px] font-bold text-white/75 hover:border-white/25 hover:text-white"
              >
                {s.label}
              </a>
            ))}
          </nav>

          <section id="band-drills" aria-labelledby="band-drills-h" className="mt-6 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <h2 id="band-drills-h" className="fel-heading text-[16px] font-bold text-white/85">{MIRROR_CORRECTIVE_SESSIONS[0].title}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">{MIRROR_CORRECTIVE_SESSIONS[0].what}</p>
            <p className="mt-1 text-[12px] text-white/45">Dose: {doseLadderLine()}</p>
            <ol className="mt-3 grid gap-3">
              {SIGNALS.map((sig) => {
                const d = BAND_DRILLS[sig];
                const b = breathFor(sig, 4);
                return (
                  <li key={sig} data-band={sig} className="rounded-xl border border-[#00E5FF]/20 bg-black/20 px-4 py-3 text-[12.5px] leading-relaxed">
                    <p className="text-[13.5px] font-semibold text-white/85">{d.title}</p>
                    <p className="mt-0.5 text-white/50">For a set where the camera read {MIRROR_SIGNAL_READ[sig]}.</p>
                    <p className="mt-1 text-white/65">{d.setup}</p>
                    <p className="mt-0.5 text-white/60">The band: {sentence(d.rnt.feed)} {sentence(d.rnt.direction)} {sentence(d.rnt.load)}</p>
                    <p className="mt-0.5 text-white/55">{d.rnt.why}</p>
                    <p className="mt-1 text-white/80"><span className="font-bold">Think: </span>{d.cue}</p>
                    <p className="mt-0.5 text-white/55">Breath: {sentence(b.pattern)} {sentence(b.timing)}</p>
                  </li>
                );
              })}
            </ol>
          </section>

          <section id="release" aria-labelledby="release-h" className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5">
            <h2 id="release-h" className="fel-heading text-[16px] font-bold text-white/85">{MIRROR_CORRECTIVE_SESSIONS[1].title}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">{MIRROR_CORRECTIVE_SESSIONS[1].what}</p>
            <ol className="mt-3 grid gap-3">
              {RELEASE_ZONES.map((z) => {
                const r = releaseProtocol(z)!;
                return (
                  <li key={z} data-release-zone={z} className="rounded-xl border border-white/8 bg-black/20 px-4 py-3 text-[12.5px] leading-relaxed">
                    <p className="text-[13.5px] font-semibold text-white/85">{r.tissue} · {r.holdSec}s per side, {r.reps} slow passes</p>
                    <p className="mt-0.5 text-white/60">{sentence(r.tool)} {sentence(r.pin)}</p>
                    <p className="mt-0.5 text-white/60">{sentence(r.stretch)}</p>
                    <p className="mt-0.5 text-white/55">Breath: {sentence(r.breath)}</p>
                    <p className="mt-0.5 text-white/45">{r.avoid}</p>
                  </li>
                );
              })}
            </ol>
            <p className="mt-3 text-[12.5px] leading-relaxed text-white/55">
              Then run the band drill and repeat the same set in the Mirror. If the flags do not drop, the release was not
              what the set needed — change one thing, not three.
            </p>
          </section>

          <section id="program" aria-labelledby="program-h" className="mt-4 rounded-2xl border border-white/8 bg-white/[0.02] p-5" data-program>
            <h2 id="program-h" className="fel-heading text-[16px] font-bold text-white/85">{MIRROR_CORRECTIVE_SESSIONS[2].title}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-white/55">{MIRROR_CORRECTIVE_SESSIONS[2].what}</p>
            {program.note ? (
              <p data-program-note className="mt-3 text-[13px] leading-relaxed text-white/65">{program.note}</p>
            ) : program.cycle ? (
              <>
                <p className="mt-3 text-[13.5px] font-semibold text-white/80">{program.cycle.program.headline}</p>
                {program.cycle.program.blocks.length > 0 && (
                  <ol className="mt-2 grid gap-2">
                    {program.cycle.program.blocks.map((b) => (
                      <li key={`${b.zone}|${b.kind}`} data-block={b.kind} className="rounded-xl border border-white/8 bg-black/20 px-4 py-3 text-[12.5px] leading-relaxed">
                        <p className="font-semibold text-white/85">
                          {KIND_WORD[b.kind]}: {b.title} · {b.frequency} days a week, about {b.minutes} min
                        </p>
                        <ul className="mt-0.5 list-disc pl-5 text-white/60">
                          {b.movements.map((m) => <li key={m}>{m}</li>)}
                        </ul>
                        <p className="mt-0.5 text-white/45">{b.because}</p>
                      </li>
                    ))}
                  </ol>
                )}
                {program.cycle.line && <p data-retest-schedule className="mt-3 text-[12.5px] leading-relaxed text-white/70">{program.cycle.line}</p>}
                {program.cycle.lastRetest && program.cycle.lastRetest.lines.length > 0 && (
                  <div data-last-retest className="mt-3">
                    <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em] text-white/40">Last retest</p>
                    <ul className="mt-1 grid gap-1 text-[12.5px] text-white/60">
                      {program.cycle.lastRetest.lines.map((l) => <li key={l.zone}>{l.title}: {l.line}</li>)}
                    </ul>
                  </div>
                )}
              </>
            ) : null}
            <p className="mt-3 text-[11.5px] leading-relaxed text-white/40">{program.disclaimer}</p>
          </section>

          <p className="mt-4 text-[11.5px] leading-relaxed text-white/40">{CORRECTIVE_CAUTION}</p>
        </>
      )}

      <p className="mt-3 text-[12px] font-semibold text-white/50">{CAMERA_NOT_DIAGNOSIS}</p>
    </div>
  );
}
