// correctives — the Mirror's written correctives, MOUNTED (MIRROR-COACH P9, 2026-09-30).
//
// WHAT WAS WRONG. Three pieces of written corrective work had been built and never reached anyone (the crossref's
// coverage matrix, rows 13/16/39, and its [4].features[7]: "None of these functions has a runtime importer"):
//   · the band drills with a breath pairing (lib/babylon/nexus/neuro-mirror/rules/rnt-breath.ts prescribeCorrectives),
//   · the release — pin, then move — ordered from the centre out (rules/smr-pin-stretch.ts prescribePinAndStretch),
//   · the cross-session program with its 4-session retest (lib/mirror/program.ts buildProgram — only its disclaimer
//     had an importer, lib/creator/cardProgression.ts:48).
// P3 mounted program.ts's BLOCKS on the Movement Screen (screenCorrectives.ts); the drills, the release and the program
// itself stayed dark. This module is the one place the Mirror, its correctives page and the coach's draft read them
// from, so the three say the same thing (the same rule P3 set for the screen's blocks).
//
// WHERE THEY ARE REACHED:
//   · After a press/row set in the Mirror (components/mirror/session-correctives.tsx, from the set's own summary —
//     setCorrectives): that set's band drills and, for a known adult, its release, then the retest line.
//   · The Mirror's correctives page (app/play/mirror/correctives, components/mirror/correctives-view.tsx): the picker
//     over MIRROR_CORRECTIVE_SESSIONS — every band drill by what the camera reads, every release, and the program built
//     from the athlete's saved press/row sets with its retest schedule (programView). Linked from the Mirror's pattern
//     picker, the press/row summary and the screen's "what to work on" card.
//   · The coach's draft (lib/coach/mirrorToProgram.ts): a flagged screen check carries its matching corrective
//     (screenCorrectiveFor — SCREEN_CORRECTIVE below).
//
// YOUTH (owner decisions #6 and #20; PLAN item 9 "off for minors"): ALL THREE ARE OFF for an athlete under 18 or with
// no birth year on file, the same reading P3 gave the screen's blocks (screenCorrectives.ts YOUTH_BLOCKS_OFF). The age
// is ONE truth: youthGateFor(User.dobYear) — isMinorForMirror (lib/mirror/youth.ts) is exactly `youthGateFor(...) !==
// null`. Never a guardian's consent: the guardian allowance is gone (TEEN-WRITE-BLOCK), so a 17-year-old whose guardian
// said yes is still under youth rules here, and nothing in this module reads GuardianConsent (the test holds the import
// graph to that).
//
// HONESTY (lib/share/screen.ts rules; rnt-breath.ts's P9 header): every drill says what the camera READ, labelled
// estimated; nothing names a condition, a cause or a risk; "builds capacity" is the most any line claims.
//
// NO WRITES. Everything here is a read: the set's summary is already in the page, and the program reads the athlete's
// saved press/row sets (MirrorSession — saved only for a verified adult who opted in, lib/privacy/scanSaveGate.ts
// canSaveScanNumbers, which is nobody today; programView says so rather than promising a program that cannot build).
//
// Pure: no DOM, no Prisma client value, no fetch.
import type { ZoneId } from '../babylon/nexus/neuro-mirror/patterns/split-stance-press-row';
import {
  BAND_DRILLS, CORRECTIVE_CAUTION, MIRROR_SIGNAL_READ, breathFor, cleanSessionNote, dosageFor, prescribeCorrectives,
  type BandDrill, type BreathCue, type Corrective, type MirrorSessionLike, type MirrorSignal,
} from '../babylon/nexus/neuro-mirror/rules/rnt-breath';
import {
  AVOID_DEFAULT, RELEASE_ZONES, prescribePinAndStretch, releaseProtocol, retestPrompt,
  type PinAndStretch, type ReleaseZone,
} from '../babylon/nexus/neuro-mirror/rules/smr-pin-stretch';
import { MIN_REPS_FOR_SIGNAL, PROGRAM_DISCLAIMER, programCycle, playbookBlock, type BlockKind, type ProgramCycle, type SessionFinding } from './program';
import { youthGateFor, type YouthGate } from './screenCorrectives';
import { sideWords } from './screen';
import type { GraderId } from './stationGraders';
import { RED_FLAG_COPY, isHardStopped, needsIntake } from '../health/intake';

/** The press/row pattern's id — the only Mirror session whose zones feed these (overlay-compositor.ts summary). */
export const PRESS_ROW_PATTERN_ID = 'split-stance-press-row';
/** Where the correctives page lives. */
export const CORRECTIVES_PATH = '/play/mirror/correctives';

// ── the picker ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type CorrectiveSessionId = 'band-drills' | 'release' | 'program';

/**
 * One kind of written corrective, as the Mirror's picker lists it. Registered beside MIRROR_PATTERNS (lib/mirror/
 * patterns.ts re-exports this list) rather than inside it: a MirrorPattern is an AUDIT — frames in, a reading out — and
 * a corrective reads no frames. Every entry is adults-only (youthSafe: false; owner decision #6, PLAN item 9).
 */
export interface MirrorCorrectiveSession {
  id: CorrectiveSessionId;
  /** Short, for the picker. */
  label: string;
  title: string;
  /** What it is, and what it is built from — one line. */
  what: string;
  /** Built from the last press/row set, or across the athlete's saved sets. */
  from: 'set' | 'history';
  youthSafe: false;
  href: string;
}

export const MIRROR_CORRECTIVE_SESSIONS: readonly MirrorCorrectiveSession[] = [
  {
    id: 'band-drills', label: 'Band drills', title: 'Band drills with a breath',
    what: 'One drill for each drift the camera reads in a press/row set: a light band pulls you into the drift and you hold your line, breathing out long.',
    from: 'set', youthSafe: false, href: `${CORRECTIVES_PATH}#band-drills`,
  },
  {
    id: 'release', label: 'Release', title: 'Release: pin, then move',
    what: 'A ball or a roller on one spot, then slow movement under it, done before the band drill. For adults only.',
    from: 'set', youthSafe: false, href: `${CORRECTIVES_PATH}#release`,
  },
  {
    id: 'program', label: 'Program', title: 'Your program',
    what: 'Built from what keeps showing up across your press/row sets: release, then hold, then load it, with a retest every 4 sets.',
    from: 'history', youthSafe: false, href: `${CORRECTIVES_PATH}#program`,
  },
];

// ── youth ───────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Said wherever the correctives would be, for an athlete under youth rules. */
export const CORRECTIVES_YOUTH_OFF: Record<Exclude<YouthGate, null>, string> = {
  minor: 'Correctives are off under 18 for now: no band drills, no release, no program. The coach cues and the screen\'s fix lines are the work — do them with your coach or a parent.',
  unknownAge: 'Correctives are off until your birth year is on your account (they are for adults for now). The coach cues and the screen\'s fix lines are the work.',
};

// ── the health intake (owner decision #5; P5's lib/health/intake.ts) ───────────────────────────────────────────────────
//
// The Mirror itself sits behind the intake (app/play/mirror/_components/health-intake-gate.tsx), so the correctives shown
// after a set already are. The correctives PAGE is its own route: it holds the same line server-side — no correctives
// (a release is hands-on bodywork) for an adult whose intake is due or who is stopped on a red flag until they tick
// cleared. P5's own helpers decide both; this only picks the line.

/** Said on the correctives page when the intake is due. */
export const CORRECTIVES_INTAKE_FIRST =
  'The correctives open after the Mirror\'s short health check. Open the Mirror and it asks first.';

/** The line that holds the correctives page back, or null to show it: the intake due, or a red-flag stop. */
export function intakeHold(
  latest: { version: string; createdAt: Date; redFlags: readonly string[]; clearedAt?: Date | null } | null | undefined,
  now: Date = new Date(),
): string | null {
  if (needsIntake(latest ?? null, now)) return CORRECTIVES_INTAKE_FIRST;
  if (isHardStopped(latest)) return RED_FLAG_COPY;
  return null;
}

/** The one age truth for these, from the birth year on file (lib/mirror/youth.ts isMinorForMirror ⇔ a non-null gate). */
export function correctivesGate(dobYear: number | null | undefined, now: Date = new Date()): YouthGate {
  return youthGateFor(dobYear, now);
}

// ── after one set ───────────────────────────────────────────────────────────────────────────────────────────────────

/** The live SessionSummary's shape, as much of it as the correctives read (overlay-compositor.ts). */
export interface SetSummaryLike {
  durationMs: number;
  reps: number;
  timeInStableMs: Partial<Record<ZoneId, number>>;
  faultCounts: Partial<Record<ZoneId, number>>;
  avgTempo: { pullSec: number; pressSec: number } | null;
}

/**
 * The one adapter from the live summary to what the prescribers read. The summary's tempo is { pullSec, pressSec } per
 * rep; the prescribers want ms per rep (rnt-breath.ts:26, crossref [1].features[9]: the two had never met).
 */
export function sessionLikeFromSummary(s: SetSummaryLike): MirrorSessionLike {
  const t = s.avgTempo;
  const perRep = t && Number.isFinite(t.pullSec) && Number.isFinite(t.pressSec) ? (t.pullSec + t.pressSec) * 1000 : null;
  return {
    durationMs: s.durationMs, reps: s.reps, timeInStableMs: s.timeInStableMs, faultCounts: s.faultCounts,
    avgTempo: perRep && perRep > 0 ? perRep : null,
  };
}

export interface SetCorrectives {
  /** Youth rules: why nothing is shown (CORRECTIVES_YOUTH_OFF), else null. */
  off: string | null;
  /** MIRROR-COACH P9 fix: the set was too short to read (under MIN_REPS_FOR_SIGNAL counted reps) — why nothing is shown. */
  thin: string | null;
  band: Corrective[];
  /** Adults only; ordered centre-out. */
  release: PinAndStretch[];
  /** The closing line: the retest. */
  retest: string;
  /** Said when the set earned nothing. */
  clean: string | null;
  caution: string;
}

/**
 * MIRROR-COACH P9 fix (2026-09-30, code review): said after a set with fewer than MIN_REPS_FOR_SIGNAL counted reps. The
 * set's fault counts run from the session's start — walking into frame, picking up the handle, setting the stance — and
 * neither prescriber has a floor, so an 8-second, 0-rep set (one fault transition per drift zone) earned two band drills
 * at the TOP dose ("flagged 7.5×/min") and a hands-on release. The program already ignores a set that thin
 * (lib/mirror/program.ts MIN_REPS_FOR_SIGNAL); the per-set card now holds the same bar.
 */
export function thinSetNote(reps: number): string {
  const n = Number.isFinite(reps) && reps > 0 ? Math.floor(reps) : 0;
  return `Not enough of that set to read: correctives come after ${MIN_REPS_FOR_SIGNAL} or more counted reps (that set counted ${n}). Run a full set and they will be here.`;
}

/**
 * MIRROR-COACH P9 fix (2026-09-30, code review): the closing line when there are band drills and NO release. It was
 * retestPrompt([]) — "Nothing to release from that set — go straight back in." — printed right under the drill it had
 * just prescribed (every set whose only drift is sideways: P9 removed both sideways-drift pins, so that set always has
 * a band drill and never a release).
 */
export function bandOnlyRetest(drills: number): string {
  return `Run the band ${drills === 1 ? 'drill' : 'drills'}, then repeat the same set in the Mirror. If the flags do not drop, change one thing, not three.`;
}

/** What one press/row set earns. Nothing at all under youth rules, and nothing from a set too short to read. */
export function setCorrectives(summary: SetSummaryLike, youth: YouthGate): SetCorrectives {
  if (youth !== null) {
    return { off: CORRECTIVES_YOUTH_OFF[youth], thin: null, band: [], release: [], retest: '', clean: null, caution: CORRECTIVE_CAUTION };
  }
  if (!(summary.reps >= MIN_REPS_FOR_SIGNAL)) {
    return { off: null, thin: thinSetNote(summary.reps), band: [], release: [], retest: '', clean: null, caution: CORRECTIVE_CAUTION };
  }
  const like = sessionLikeFromSummary(summary);
  const band = prescribeCorrectives(like);
  // youth is null here: a birth year on file that reads as an adult — the only explicit `false` the release accepts
  const release = prescribePinAndStretch(like, false);
  return {
    off: null, thin: null, band, release,
    retest: release.length ? retestPrompt(release) : band.length ? bandOnlyRetest(band.length) : '',
    clean: band.length || release.length ? null : cleanSessionNote(like),
    caution: CORRECTIVE_CAUTION,
  };
}

// ── across sets: the program ────────────────────────────────────────────────────────────────────────────────────────

/** A saved press/row set (MirrorSession), as much as the program reads. */
export interface SavedSetRow {
  patternId: string;
  startedAt: Date | string | number;
  reps: number;
  faultCounts: unknown;
}

const ZONES: readonly ZoneId[] = ['posterior_chain', 'lat_rhomboid', 'upper_traps', 'rib_thoracic', 'lumbo_pelvic'];

/**
 * A saved set as the program reads it: the zone counts only. faultCounts also carries the personal-baseline values under
 * its own key (lib/mirror/baselines.ts recordCheckValues), which is not a zone and never a fault.
 */
export function findingFromRow(row: SavedSetRow): SessionFinding | null {
  if (row.patternId !== PRESS_ROW_PATTERN_ID) return null;
  const at = new Date(row.startedAt).getTime();
  if (!Number.isFinite(at)) return null;
  const counts = row.faultCounts && typeof row.faultCounts === 'object' ? (row.faultCounts as Record<string, unknown>) : {};
  const faults: Partial<Record<ZoneId, number>> = {};
  for (const z of ZONES) {
    const n = counts[z];
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) faults[z] = n;
  }
  return { at, faults, reps: typeof row.reps === 'number' && Number.isFinite(row.reps) ? row.reps : 0 };
}

export interface ProgramView {
  off: string | null;
  /** Null under youth rules. */
  cycle: ProgramCycle | null;
  /** When there is nothing to build from, and why (sets not kept on this account, or none saved yet). */
  note: string | null;
  disclaimer: string;
}

/** Said when the account's sets are not kept, so no history can exist to build from. */
export const PROGRAM_NOT_KEPT =
  'Your sets are not kept on this account, so there is no history for a program to build from. After each press/row set, the Mirror shows that set\'s band drills and release.';

/**
 * The program page's program. `keeping`: this account's sets are saved (lib/privacy/scanSaveGate.ts canSaveScanNumbers,
 * read — never written — by the page). A read that failed is passed as no rows.
 */
export function programView(rows: readonly SavedSetRow[], youth: YouthGate, opts: { keeping: boolean }): ProgramView {
  if (youth !== null) return { off: CORRECTIVES_YOUTH_OFF[youth], cycle: null, note: null, disclaimer: PROGRAM_DISCLAIMER };
  const findings = rows.map(findingFromRow).filter((f): f is SessionFinding => f !== null);
  const note = findings.length === 0 && !opts.keeping ? PROGRAM_NOT_KEPT : null;
  return { off: null, cycle: programCycle(findings), note, disclaimer: PROGRAM_DISCLAIMER };
}

// ── from a Movement Screen flag (the coach's draft) ─────────────────────────────────────────────────────────────────

/**
 * The written corrective each camera check of the Movement Screen prescribes when it flags — FEL's judgement, read off
 * the check's own FIX line (screen.ts) against what each corrective works, and only where one truly fits:
 *   hipLevel, singleLeg → the side-pull split stance: both flag the trunk and hips shifting sideways over the stance,
 *                         the drift that drill feeds.
 *   shoulderLevel       → the band-up shoulder hold (one shoulder riding high), and for an adult the release where the
 *                         neck meets the shoulder.
 *   kneeWindow          → no band drill (none is written for the knee), and for an adult the back-of-the-hip release:
 *                         the check's FIX is hip work ("hip external-rotation work and banded side steps").
 *   headFloat, heelLine → none: no written corrective works the head's float or the foot; the FIX line and (for the
 *                         head) P3's block are the work.
 */
export const SCREEN_CORRECTIVE: Record<GraderId, { drill: MirrorSignal | null; release: ReleaseZone | null }> = {
  hipLevel: { drill: 'trunkShift', release: null },
  singleLeg: { drill: 'trunkShift', release: null },
  shoulderLevel: { drill: 'shoulderRise', release: 'upper_traps' },
  kneeWindow: { drill: null, release: 'posterior_chain' },
  headFloat: { drill: null, release: null },
  heelLine: { drill: null, release: null },
};

/** A screen flag's written corrective: the drill with its breath and a dose, and an adult's release. */
export interface ScreenCorrective {
  drill: (BandDrill & { signal: MirrorSignal; breath: BreathCue; dosage: { sets: number; reps: number; holdSec: number } }) | null;
  release: Omit<PinAndStretch, 'because'> | null;
  caution: string;
  /** Where the athlete reads it in full. */
  href: string;
}

/** The dose a screen flag's drill gets: the lightest tier (a screen reads a position, not a rate of drift). */
const SCREEN_DRILL_DOSE = dosageFor(0);

/**
 * MIRROR-COACH P9 fix (2026-09-30, code review): THE SCREEN'S OWN SET-UP FOR ITS DRILL. The band drills were written for
 * the press/row ("the rowing handle in the working hand", "the pull"), and a screen flag reused them word for word — a
 * standing shoulder-height difference was told to hold a rowing handle, and the side the screen measured was dropped, so
 * the athlete could not tell which shoulder to band. The screen's set-up names the side the way the screen card does
 * (lib/mirror/screen.ts sideWords: a level check flags the side that reads HIGHER; the single-leg stance, the leg stood
 * on) and holds no handle. What it does not know, it does not say: the side-pull drill still finds its side by feel,
 * because the camera read a height or a wobble, not a direction of drift.
 */
export function screenDrillWords(checkId: string, side?: 'left' | 'right' | null): { setup: string; cue: string } | null {
  const read = side ? `The screen read your ${sideWords(checkId, side)}` : 'The screen read a difference between your two sides';
  switch (checkId) {
    case 'shoulderLevel':
      return {
        setup: side
          ? `Stand tall facing the camera, a light band tied high and held in your ${side} hand — the side the screen read higher.`
          : 'Stand tall facing the camera, a light band tied high and held in the hand on the side the screen read higher.',
        cue: 'Let the band pull toward the ceiling while you reach that hand toward the floor.',
      };
    case 'hipLevel':
    case 'singleLeg':
      return {
        setup: `Split stance facing the camera, a light band looped around your hips and tied off to one side. ${read}; try the pull from each side and keep the side where staying square takes more work.`,
        cue: BAND_DRILLS.trunkShift.cue,
      };
    default:
      return null;
  }
}

/**
 * The written corrective for a flagged screen check, or null: under youth rules (always null — decision #6), for a check
 * with none (SCREEN_CORRECTIVE), or for an id that is not a camera check. `side` is the flag's (CheckOutcome.side).
 */
export function screenCorrectiveFor(checkId: string, youth: YouthGate, side?: 'left' | 'right' | null): ScreenCorrective | null {
  if (youth !== null) return null;
  const spec = (SCREEN_CORRECTIVE as Record<string, { drill: MirrorSignal | null; release: ReleaseZone | null } | undefined>)[checkId];
  if (!spec || (!spec.drill && !spec.release)) return null;
  const words = screenDrillWords(checkId, side);
  const drill = spec.drill
    ? { ...BAND_DRILLS[spec.drill], ...(words ?? {}), signal: spec.drill, breath: breathFor(spec.drill, 4), dosage: SCREEN_DRILL_DOSE }
    : null;
  const release = spec.release ? releaseProtocol(spec.release) : null;
  const href = drill ? `${CORRECTIVES_PATH}#band-drills` : `${CORRECTIVES_PATH}#release`;
  return { drill, release, caution: CORRECTIVE_CAUTION, href };
}

/**
 * The line the coach's panel says for a screen corrective, compact: "Release first: … · Band drill: …". "Release:" alone
 * when there is no drill after it (MIRROR-COACH P9 fix: "release first" with nothing second read as a line cut off).
 */
export function screenCorrectiveLine(c: ScreenCorrective): string {
  const parts: string[] = [];
  if (c.release) parts.push(`${c.drill ? 'Release first' : 'Release'}: ${c.release.tissue.toLowerCase()} (${c.release.holdSec}s per side, ${c.release.reps} slow passes)`);
  if (c.drill) parts.push(`Band drill: ${c.drill.title}, ${c.drill.dosage.sets} x ${c.drill.dosage.reps} — "${c.drill.cue}"`);
  return parts.join(' · ');
}

// ── the copy, for the external-focus lint ───────────────────────────────────────────────────────────────────────────

export interface CorrectiveCue { id: string; text: string; tier: 'attention' | 'instruction'; file: string }

/**
 * Every line the mounted correctives can say, tiered the way lib/coach/cueLint.ts reads cues: the drill's `cue` and
 * the breath lines are what the athlete thinks about during the drill (attention); set-ups, band descriptions, release
 * places and program movements are instructions (no muscle named, no body part to squeeze). The test lints them.
 */
export function correctiveCueCorpus(): CorrectiveCue[] {
  const out: CorrectiveCue[] = [];
  const rnt = 'lib/babylon/nexus/neuro-mirror/rules/rnt-breath.ts';
  const smr = 'lib/babylon/nexus/neuro-mirror/rules/smr-pin-stretch.ts';
  for (const [signal, d] of Object.entries(BAND_DRILLS) as [MirrorSignal, BandDrill][]) {
    out.push({ id: `band:${signal}:title`, text: d.title, tier: 'instruction', file: rnt });
    out.push({ id: `band:${signal}:setup`, text: d.setup, tier: 'instruction', file: rnt });
    out.push({ id: `band:${signal}:cue`, text: d.cue, tier: 'attention', file: rnt });
    for (const k of ['feed', 'direction', 'load', 'why'] as const) out.push({ id: `band:${signal}:${k}`, text: d.rnt[k], tier: 'instruction', file: rnt });
    const b = breathFor(signal, 4);
    out.push({ id: `band:${signal}:breath`, text: b.pattern, tier: 'attention', file: rnt });
    out.push({ id: `band:${signal}:breathTiming`, text: b.timing, tier: 'attention', file: rnt });
    out.push({ id: `band:${signal}:read`, text: MIRROR_SIGNAL_READ[signal], tier: 'instruction', file: rnt });
  }
  for (const z of RELEASE_ZONES) {
    const p = releaseProtocol(z)!;
    for (const k of ['tissue', 'tool', 'pin', 'stretch', 'avoid'] as const) out.push({ id: `release:${z}:${k}`, text: p[k], tier: 'instruction', file: smr });
    out.push({ id: `release:${z}:breath`, text: p.breath, tier: 'attention', file: smr });
  }
  out.push({ id: 'release:avoid-default', text: AVOID_DEFAULT, tier: 'instruction', file: smr });
  const kinds: BlockKind[] = ['release', 'activate', 'pattern'];
  for (const z of ZONES) {
    for (const k of kinds) {
      const b = playbookBlock(z, k);
      out.push({ id: `program:${z}:${k}:title`, text: b.title, tier: 'instruction', file: 'lib/mirror/program.ts' });
      b.movements.forEach((m, i) => out.push({ id: `program:${z}:${k}:move${i}`, text: m, tier: 'instruction', file: 'lib/mirror/program.ts' }));
    }
  }
  for (const s of MIRROR_CORRECTIVE_SESSIONS) out.push({ id: `picker:${s.id}`, text: s.what, tier: 'instruction', file: 'lib/mirror/correctives.ts' });
  // MIRROR-COACH P9 fix: the screen flags' own drill words, both sides and unsided
  for (const id of ['shoulderLevel', 'hipLevel', 'singleLeg']) {
    for (const side of ['left', 'right', null] as const) {
      const w = screenDrillWords(id, side)!;
      out.push({ id: `screen:${id}:${side ?? 'none'}:setup`, text: w.setup, tier: 'instruction', file: 'lib/mirror/correctives.ts' });
      out.push({ id: `screen:${id}:${side ?? 'none'}:cue`, text: w.cue, tier: 'attention', file: 'lib/mirror/correctives.ts' });
    }
  }
  return out;
}
