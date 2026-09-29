// lib/babylon/music/performSet.ts — the Groove Academy's PERFORM set: its notes, its judge and its length. PURE (no
// audio, no React), so the Arena's score check on the server reads the same rules the room plays by.
//
// HOTFIX (2026-09-24): a PERFORM set had no end — it ran until the player pressed END SET — and each hit pays
// 100 × (1 + floor(combo / 5)), which grows with the square of an unbroken run. No score was too big to be honest, so the
// Arena could not bound a staked set (its old limit, 500,000, fell to about 72 s of perfect play). A set is now
// PERFORM_SET_BARS bars of the sequencer: every step of those bars is one note, and after the last note's window closes
// the set ends on its own. The judge is the one StudioMode used, moved here unchanged.
//
// ARENA SETS ONLY (owner, 2026-09-24: "Cap only Arena sets — staked Arena sets end after 32 bars; free play stays
// endless"). The cap is there so a staked score can be checked; free play stakes nothing, so it has no cap. A set is
// built as one or the other: `new PerformSet({ arena: true })` is the staked set the Arena's ceiling describes, and
// `{ arena: false }` offers a note on every step until END SET.
//
// MUSIC-SUITE P2 (2026-09-25), "On the beat, and honest". Measured in P1 (outbox musicsuite/BASELINE.md 2d) on the real
// engine: a note entered the judge only after it had SOUNDED (AudioEngine drainPlayhead releases a step once its time
// has passed, on a 25 ms timer: 0.4–24.3 ms late), so a tap dead on a lone note found nothing open and scored EARLY in
// 25 of 25 timer phases, and with music running an on-time tap took the PREVIOUS note as a late GOOD. A steady on-time
// player scored 24,850 of 68,000; a button masher beat him. One tap won a set (`won: score > 0`), and the card's "best
// combo" was the combo the set ended on. What changed:
//   * a note is offered when it is SCHEDULED (AudioEngine.onStepScheduled, up to 100 ms before it sounds), so a tap is
//     matched to the NEAREST open note by signed error: before it = EARLY, after it = LATE. A tap on the beat is PERFECT;
//   * the judge runs on the HEARD clock: `latencySec` (performLatencySec — the player's saved calibration, which already
//     holds the device's output delay, else the context's outputLatency/baseLatency) is taken off every tap and window;
//   * a tap that a note not yet scheduled could still be nearer to WAITS for the schedule (a note is scheduled only
//     100 ms ahead, the window reaches 250 ms early), then takes the nearest; with none in reach it is an EXTRA tap (it
//     used to be called EARLY whatever its timing): no points, and the combo breaks, as before;
//   * the set keeps real tallies — PERFECT / GOOD / MISS, EXTRA taps, the best combo — and result() hands the room the
//     shared session contract { bars, notes, hits, perfects, goods, misses, accuracy, grade, maxCombo, arena }. A set is
//     WON only at accuracy ≥ 0.5 over ≥ 8 bars (owner decision #13; performSetWon, which the server mirrors);
//   * every scheduled step still counts toward the set's length, but a step is a note only while the grid has an
//     audible hit (performNoteAt): an empty grid offers zero notes. Notes only where the beat hits is phase 6.
// The points per hit, the windows and the Arena ceiling are unchanged (lib/arena-score-integrity.ts still reads
// performSetMax: an Arena set is still 32 bars of 16 steps, and a perfect one scores exactly the same).
//
// MUSIC-SUITE P2 FIX PASS (2026-09-25): THE WIN WAS MEASURING HOW OFTEN YOU TAP, NOT WHEN. The phase review drove this
// class through performSet.test.ts's drive() (8 bars, notes offered 100 ms ahead) and found decision #13 letting the
// wrong players win:
//   * with a note on EVERY scheduled 16th (performNoteAt was `gridLive`), a player tapping every beat dead on scored
//     25 % (grade D) at 60, 92, 120 and 160 BPM and could never win, while a masher at 4 taps/s scored 65.6 % (C, won),
//     at 6/s 96.5 % (S), at 20–30/s 50.4 % (C) — a held Enter on the focused TAP button was enough (see
//     isRepeatedActivation below);
//   * EXTRA taps cost nothing in the accuracy, so with sparser notes the earliest tap of a mash inside a note's 250 ms
//     early reach took it as a GOOD (half credit) and every other tap was free: an all-GOOD set is exactly C;
//   * every scheduled step counted toward the 8 bars, rests included, so PLAY on the empty grid, 8 silent bars, one
//     cell on and one on-time tap was {bars 8, notes 1, accuracy 1, grade S, won} — P1's "one tap wins" again — and the
//     server's readMusicSet agreed.
// Now: a step is a note only where the beat HITS (performNoteAt: `hits > 0`, decision #11's "notes only where your beat
// hits", one lane until phase 6 splits it into kick/snare/hats/Flip); an EXTRA tap is a MISS in the accuracy, exactly as
// a wild tap is in the Cypher (DanceCore registerMiss counts it in MISS and accuracyOf divides by it), so the shared
// contract's `accuracy = (perfects + 0.5 × goods) / notes` holds with `notes` = every judged event; and `bars` (the
// win's 8) counts only whole bars heard that offered at least one note — a rest bar is music, not a bar played.
//
// MUSIC-SUITE P6 (2026-09-25), "PERFORM plays your song" (owner decision #11: "notes only where your beat hits, in lanes,
// on keyboard/pad/phone; the band builds"). What was wrong, measured with this file's drive() in performSet.test.ts:
//   * ONE LANE. Every scheduled step where ANY row hit was one note, and any tap could take any note. On a dense grid every
//     tap lands within half a 16th of some note, so a steady tapper who never listened read as a sloppy player: 92 BPM
//     16ths at 6 taps/s scored 98 % (S), a Cell foundation at 4/s 74 % (B) — the P2 fix pass pinned it (it.fails, ~:616).
//   * NOTHING SAID WHICH PART A NOTE WAS, so the room could not show the song, and the band could not answer the player.
// Now:
//   * FOUR LANES — kick / snare / hats / Flip (performLaneOf): kick → KICK; snare and clap → SNARE; hat and open → HATS;
//     everything else → FLIP — the Flip rows, and the melody rows too: a song with bass or lead FOLDS them into the Flip
//     lane (the fourth lane is "the tune": what is not a drum). A step offers one note per lane that hits on it (a chord
//     across lanes is several notes), and a lane shows a note ONLY where its part hits.
//   * A TAP BELONGS TO ITS LANE: it takes only a note of its own lane. A tap in the wrong lane is never a hit — it is an
//     EXTRA (a miss, the P2 rule), labelled WRONG LANE when another lane's note was in reach, and that note stays open for
//     its own lane until its window closes (assumption: "a miss for that note" read as "a miss, never a hit"; the note is
//     not closed by the wrong tap, so a player who corrects in time still gets it — capped at GOOD by the spam lock).
//   * ONE NOTE PER LANE PER 8TH (performCapLanes, PERFORM_LANE_PAIR_STEPS): where a part hits both 16ths of an 8th, the
//     second is not a note (it still SOUNDS — it is the song, not the chart). Measured before it: a hats part on every 16th
//     is 55–73 % of a busy groove's notes, and its notes sit 163 ms apart at 92 BPM — closer than two PERFECT windows
//     (±80 ms) — so a tap at a steady 6/s on that one lane, never listening, was PERFECT 98 % of the time and won the set.
//     With the cap the lane's notes are an 8th apart, a steady tapper's random phase lands PERFECT about half the time, and
//     no lane carries a busy song alone (the flipped pin). At 160 BPM a 16th lane is 10.7 notes a second on one finger —
//     the cap is also what makes a fast lane playable. TUNE(elijah): 1 = every 16th a note.
//   * THE BAND BUILDS (PerformBand): the kick always plays; the first lane you hit joins at once (the part you are on);
//     every other part joins after PERFORM_BAND_JOIN hits in a row in its lane, and PERFORM_BAND_DROP misses in a row drop
//     the NEWEST part back out (a dropped part rejoins the same way). Pure state here; StudioMode plays it through the P4
//     desk's per-row band gains (mixGraph setBand — a short ramp, no click).
//   * A REAL RECAP: per-lane accuracy, the signed early/late histogram in ms (performHistogram), the mean offset, WRONG
//     LANE taps, best streak, bars — the P2 contract { bars, notes, hits, perfects, goods, misses, accuracy, grade,
//     maxCombo, arena } is unchanged and gains `lanes` (and per-lane accuracies in the stats).
//   * THE ARENA (PHASE-6 ARENA CONTRACT): the house beat's chart is curated (houseBeat.ts: one lane per step, the same
//     note count on every beat), so it is offered AS CHARTED (chartStep: no 8th cap — a snare fill's 16ths are meant),
//     and its rejudge is lane 2's houseBeat.judgeHouseSet driving this same class — the one judge, never a second one.
// The P2 one-lane API (note / rest / tap with no lane) is kept as it was: a note with no lane is any lane's, and a tap with
// no lane takes any note — the P2 tests, the baseline sim and the server's replays use it unchanged.

/** Sequencer steps in a bar (StudioMode's STEPS: 16ths). */
export const PERFORM_STEPS_PER_BAR = 16;
/** How long an Arena set lasts, in bars. TUNE(elijah): 32 bars is 83 s at the default 92 BPM, 48 s at 160, 128 s at 60. */
export const PERFORM_SET_BARS = 32;
/** An Arena set's length in steps — and so the most notes it can offer (MUSIC-SUITE P2 FIX PASS: a step is a note only where the beat hits). */
export const PERFORM_SET_NOTES = PERFORM_SET_BARS * PERFORM_STEPS_PER_BAR;
/** A note not hit this long after it sounds is a miss (and breaks the combo). MUSIC-SUITE P2: the window is two-sided —
 *  a tap up to this long BEFORE a known note takes it too (a note is known from the moment it is scheduled). */
export const PERFORM_EXPIRE_S = 0.25;
/** A hit closer than this to its note, either side, is PERFECT; anything else inside the window is GOOD. */
export const PERFORM_PERFECT_S = 0.08;
export const PERFORM_PERFECT_PTS = 100;
export const PERFORM_GOOD_PTS = 50;
/** The multiplier steps up by one every this many hits in a row. */
export const PERFORM_COMBO_STEP = 5;
/**
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): a hit this soon after an EXTRA tap is capped at GOOD — the Cypher's spam lock
 * (DanceCore SPAM_LOCK_SEC, "the grade is for timing, and spam has no timing"), the same 0.25 s. Measured on the real
 * class (drive(), 8 bars, the best of six phases): with the EXTRA taps already counted as misses, a 4 taps/s masher on
 * a kick-and-snare quarter grid at 160 BPM still scored 51 % (C, won) because the first tap of each burst took its note
 * as a PERFECT often enough; with the lock it scores under 50 %.
 *
 * MUSIC-SUITE P6 (2026-09-25): THE LOCK WORKS BOTH WAYS — a PERFECT within this long of an EXTRA tap on EITHER side is a
 * GOOD (a PERFECT already scored is taken back to GOOD when the EXTRA lands after it: PerformSet.extra). With four lanes the
 * tap that follows a hit is often another key of the same mash. Measured with the lane judge (drive(), 8 bars, 60–160 BPM,
 * six Cell foundations and a 16th-hat groove): a tapper cycling the four lanes at the song's own 16ths scored 52–54 % (C),
 * and four keys pressed together on every beat 59–67 % (C); with the lock both ways the cycler tops out at 47 % and the
 * four-key beat masher at 43–52 % (see performSet.test.ts, "P6: the steady tapper"). A player with no stray taps is untouched.
 */
export const PERFORM_SPAM_LOCK_S = 0.25;

/**
 * MUSIC-SUITE P6 FIX PASS (2026-09-26): taps in different lanes closer together than this are ONE CHORD, and a chord is
 * one moment of the song — every hit in it must be on the SAME note time (the first of its taps decided sets it); a key of
 * the chord whose own lane has no note at that moment is an EXTRA, not a hit on some other note nearby.
 * What was wrong (the phase review, re-measured here with performSet.test.ts's driveLanes on its seven songs): a lane tap
 * takes its lane's nearest note anywhere within ±PERFORM_EXPIRE_S, and at 120 BPM that is ±2 sixteenths — so four keys
 * pressed together on every beat found an off-beat neighbour in almost every lane, few taps were WRONG LANE extras, and the
 * chord WON: 59 of 336 (song × tempo × offset) cases at −90…+50 ms, 6 of 7 songs at 120 BPM and at 160 BPM (up to 55 %).
 * An honest chord (kick + hat on one step) is on one note time whatever its timing, so it is untouched; 30 ms is a flam
 * (two fingers "together"), well under a 16th at any tempo PERFORM plays (94 ms at 160 BPM). TUNE(elijah).
 */
export const PERFORM_CHORD_S = 0.03;

/** What one hit pays, given the combo it was hit on (the hits in a row before it). */
export function performHitPoints(perfect: boolean, comboBefore: number): number {
  return (perfect ? PERFORM_PERFECT_PTS : PERFORM_GOOD_PTS) * (1 + Math.floor(comboBefore / PERFORM_COMBO_STEP));
}

/**
 * The most an Arena set can score: every note of it hit PERFECT in one unbroken combo — Σ performHitPoints(true, i) over
 * i < notes. MUSIC-SUITE P2 FIX PASS (2026-09-25): in closed form (it was that loop), because the server now bounds any
 * music set's score by the hits it claims (lib/session-payout.ts), and a forged `hits` of 10^12 must not spin a loop.
 * With q = ⌊n / COMBO_STEP⌋ and r = n mod COMBO_STEP, Σ ⌊i / step⌋ = step · q(q − 1)/2 + r · q. The test holds it to
 * the loop.
 */
export function performSetMax(notes: number = PERFORM_SET_NOTES): number {
  const n = Math.max(0, Math.floor(Number.isFinite(notes) ? notes : 0));
  const q = Math.floor(n / PERFORM_COMBO_STEP), r = n % PERFORM_COMBO_STEP;
  return PERFORM_PERFECT_PTS * (n + PERFORM_COMBO_STEP * (q * (q - 1)) / 2 + r * q);
}

/** What an Arena set tells the player before and while it plays. Free play shows nothing of the kind. */
export const ARENA_SET_NOTE = `Arena set: it ends on its own after ${PERFORM_SET_BARS} bars.`;

/** The line beside TAP. An Arena set counts its bars against its length; free play has no length, so no bar count. */
export function performStatusLine(s: { bars: number | null; bar: number; score: number; combo: number; judgement: string }): string {
  const tally = `score ${s.score} · combo x${s.combo} · ${s.judgement}`;
  return s.bars === null ? tally : `bar ${s.bar}/${s.bars} · ${tally}`;
}

/** Two times closer than this are the same time (float rounding between the grid and a tap's arithmetic). */
const TIE_S = 1e-9;

// ── MUSIC-SUITE P6: the lanes ────────────────────────────────────────────────────────────────────────────────────────
/** The four lanes, left to right on screen (and ← ↓ ↑ → on every input: performInput.ts). */
export const PERFORM_LANES = ['kick', 'snare', 'hats', 'flip'] as const;
export type PerformLaneId = (typeof PERFORM_LANES)[number];
/** A lane by its place: 0 kick, 1 snare, 2 hats, 3 Flip (the tune). */
export type PerformLane = 0 | 1 | 2 | 3;
export const PERFORM_LANE_COUNT = PERFORM_LANES.length;
/** What a lane is called on screen (free play; an Arena set names its own — the house beat's). */
export const PERFORM_LANE_LABELS: readonly string[] = ['KICK', 'SNARE', 'HATS', 'FLIP'];
/**
 * A lane's colour — the phone pad's row colours (registry.ts music_flip: row 1 cyan … row 4 gold), so a phone paired as the
 * MPC plays lane N on its row N (performInput.performPhoneCommand) in the colour the screen draws that lane.
 */
export const PERFORM_LANE_COLORS: readonly string[] = ['#22d3ee', '#ff6b3d', '#a78bfa', '#ffd75e'];

/** Is this a lane (an integer 0..3)? Anything a phone or a posted tap list sends is checked with this. */
export function isPerformLane(x: unknown): x is PerformLane {
  return typeof x === 'number' && Number.isInteger(x) && x >= 0 && x < PERFORM_LANE_COUNT;
}

/**
 * The lane a grid row plays in. The kit's drums have their own (SynthKit KIT_SLOTS: kick; snare + clap; hat + open);
 * EVERY other row — the Flip rows (flip_*), the bass, the lead, the FX — is the fourth lane, "the tune". A song with a
 * melody row therefore folds its bass / lead into the Flip lane (documented in the header; there are four lanes, and a
 * phone, a pad and a hand each have four fingers for them).
 */
export function performLaneOf(rowId: string): PerformLane {
  switch (rowId) {
    case 'kick': return 0;
    case 'snare': case 'clap': return 1;
    case 'hat': case 'open': return 2;
    default: return 3;
  }
}

/** The lanes the rows starting a sound on one step play in: each once, in lane order. */
export function performLanesOf(rowIds: readonly string[]): PerformLane[] {
  const on = new Set<PerformLane>(rowIds.map(performLaneOf));
  return ([0, 1, 2, 3] as const).filter((l) => on.has(l));
}

/**
 * One note per lane per 8th: where a lane had a note on the first 16th of an 8th (an even step), the second 16th (the
 * odd step right after it, same bar) offers none in that lane. TUNE(elijah): 1 would chart every 16th (see the header).
 */
export const PERFORM_LANE_PAIR_STEPS = 2;

/**
 * The lanes one step offers: `lanes` (deduplicated, in lane order), less every lane that had a note on the step just
 * before when both are one 8th (`prev` = the step offered just before this one, with the lanes it offered). Pure: the live
 * set and the chart (performChartSteps, the Arena's rejudge) both run exactly this, step by step.
 */
export function performCapLanes(stepInBar: number, lanes: readonly PerformLane[], prev: { stepInBar: number; lanes: readonly PerformLane[] } | null): PerformLane[] {
  const want = ([0, 1, 2, 3] as const).filter((l) => lanes.includes(l));
  if (PERFORM_LANE_PAIR_STEPS < 2 || !prev) return want;
  const pairStart = stepInBar % PERFORM_LANE_PAIR_STEPS !== 0 && prev.stepInBar === stepInBar - 1;
  return pairStart ? want.filter((l) => !prev.lanes.includes(l)) : want;
}

/**
 * MUSIC-SUITE P6: what each lane shows for one bar — `rowsAt(step)` = the rows that hit on that step (the ones that will
 * sound: drawn, not muted), through the lanes and the 8th cap exactly as the live set offers them. [lane][step] = a note.
 */
export function performBarCells(rowsAt: (step: number) => readonly string[], steps: number = PERFORM_STEPS_PER_BAR): boolean[][] {
  const cells = [0, 1, 2, 3].map(() => new Array<boolean>(steps).fill(false));
  let prev: { stepInBar: number; lanes: readonly PerformLane[] } | null = null;
  for (let s = 0; s < steps; s++) {
    const lanes = performCapLanes(s, performLanesOf(rowsAt(s)), prev);
    for (const l of lanes) cells[l][s] = true;
    prev = { stepInBar: s, lanes };
  }
  return cells;
}

/** What one tap was: a hit on a note (PERFECT / GOOD), or an EXTRA tap with no note in reach. */
export type PerformJudgement = 'PERFECT' | 'GOOD' | 'EXTRA';
/** tap()'s answer: its judgement, or WAIT — no note in reach YET, so it waits for the next note to be scheduled. */
export type PerformTapOutcome = PerformJudgement | 'WAIT';
/** Which side of its note a hit landed: before it (EARLY), after it (LATE), or dead on (null). */
export type PerformSide = 'EARLY' | 'LATE' | null;
/**
 * One tap's verdict: the judgement, the signed error against the note's heard time (null for an EXTRA tap) and its side.
 * MUSIC-SUITE P6: a LANE tap also says its lane, and an EXTRA says whether another lane's note was in reach (WRONG LANE).
 * (Both absent on a P2 one-lane tap, so its verdict reads exactly as it did.)
 */
export interface PerformTap { judgement: PerformJudgement; errorSec: number | null; side: PerformSide; lane?: PerformLane; wrongLane?: boolean }

/** The word(s) beside TAP for a tap: PERFECT, GOOD · EARLY 112ms / GOOD · LATE 96ms, EXTRA TAP, or WRONG LANE (P6). */
export function performTapLabel(tap: PerformTap | null): string {
  if (!tap) return '';
  if (tap.judgement === 'EXTRA') return tap.wrongLane ? 'WRONG LANE' : 'EXTRA TAP';
  if (tap.judgement === 'PERFECT' || tap.side === null || tap.errorSec === null) return tap.judgement;
  return `GOOD · ${tap.side} ${Math.round(Math.abs(tap.errorSec) * 1000)}ms`;
}

// ── the win, shared with the server (MUSIC-SUITE P2; owner decision #13: "grade C or better (≥ 50 % accuracy) over at
// least 8 bars") ──────────────────────────────────────────────────────────────────────────────────────────────────
/** A set is won at this accuracy or better (grade C)… */
export const PERFORM_WIN_MIN_ACCURACY = 0.5;
/** …over at least this many bars. */
export const PERFORM_WIN_MIN_BARS = 8;

export type PerformGrade = 'S' | 'A' | 'B' | 'C' | 'D';

/** Accuracy over the judged notes: a PERFECT is worth 1, a GOOD 0.5, a MISS 0. No notes = 0. */
export function performAccuracy(perfects: number, goods: number, notes: number): number {
  const p = Math.max(0, perfects || 0), g = Math.max(0, goods || 0), n = Math.max(0, notes || 0);
  return n > 0 ? Math.min(1, (p + 0.5 * g) / n) : 0;
}

/** The letter for an accuracy — the dance room's scale (danceTracks.gradeFor), so C means the same 50 % in both rooms. */
export function performGrade(accuracy: number): PerformGrade {
  if (!(accuracy >= 0.5)) return 'D';
  if (accuracy >= 0.95) return 'S';
  if (accuracy >= 0.85) return 'A';
  if (accuracy >= 0.7) return 'B';
  return 'C';
}

/** THE rule for a music set's W: accuracy ≥ 0.5 AND bars ≥ 8. The server mirrors this; anything not a number loses. */
export function performSetWon(r: { accuracy: number; bars: number }): boolean {
  return Number.isFinite(r.accuracy) && Number.isFinite(r.bars)
    && r.accuracy >= PERFORM_WIN_MIN_ACCURACY && r.bars >= PERFORM_WIN_MIN_BARS;
}

/** The music room's session result (the shared contract), plus the EXTRA taps. */
export interface PerformResult {
  score: number;
  won: boolean;
  /**
   * Whole bars the player heard that offered at least one note (at most PERFORM_SET_BARS in an Arena set). MUSIC-SUITE
   * P2 FIX PASS: a rest bar (an empty or muted grid) is not counted — it was, and 7.9 silent bars plus one tapped note
   * won an S. The Arena set's own LENGTH is still counted in steps, rests included (over(), `bar`).
   */
  bars: number;
  /**
   * Judged events: perfects + goods + misses (= hits + misses). A note scheduled but not yet heard when the set ended is
   * not one. MUSIC-SUITE P2 FIX PASS: an EXTRA tap is one (a miss), as a wild tap is in the Cypher.
   */
  notes: number;
  hits: number;
  perfects: number;
  goods: number;
  /**
   * Notes heard and never hit (every expired one, plus any still open when the set ended) PLUS the EXTRA taps — each is
   * a judged error, and the accuracy divides by it (MUSIC-SUITE P2 FIX PASS: extras used to be free, so a mash's spare
   * taps never cost anything).
   */
  misses: number;
  /** 0..1 = (perfects + 0.5 × goods) / notes. */
  accuracy: number;
  grade: PerformGrade;
  maxCombo: number;
  arena: boolean;
  /** Taps with no note in reach — a part of `misses` (so of `notes` too), kept apart for the card. They break the combo. */
  extras: number;
  /**
   * MUSIC-SUITE P6: each lane that had a judged event, in lane order (empty for a P2 one-lane set). Its counts add up to
   * the set's: Σ notes = notes, Σ perfects = perfects, Σ goods = goods, Σ misses = misses (every note and every tap has a
   * lane in a lane set).
   */
  lanes: PerformLaneResult[];
  /** MUSIC-SUITE P6: EXTRA taps that had another lane's note in reach (a part of `extras`). */
  wrongLanes: number;
  /** MUSIC-SUITE P6: the signed early / late histogram of every hit, ms (performHistogram): the recap's timing picture. */
  hist: PerformHistBin[];
  /** MUSIC-SUITE P6: the mean signed error of the hits, ms (− = rushing, + = dragging); null with no hit. */
  meanErrorMs: number | null;
}

/** MUSIC-SUITE P6: one lane's share of a set. `misses` holds its unhit notes AND the EXTRA taps played in it. */
export interface PerformLaneResult {
  lane: PerformLane;
  notes: number; hits: number; perfects: number; goods: number; misses: number; extras: number;
  /** (perfects + 0.5 × goods) / notes, 0..1 — the set's rule, on this lane alone. */
  accuracy: number;
}

// ── MUSIC-SUITE P6: the recap's timing picture ───────────────────────────────────────────────────────────────────────
/** The histogram's bin width, ms. 25 ms bins over the whole two-sided window (±250 ms) = 20 bins; PERFECT is ±80. */
export const PERFORM_HIST_BIN_MS = 25;
export interface PerformHistBin { fromMs: number; toMs: number; count: number }
/**
 * Signed hit errors (ms; − early, + late) in PERFORM_HIST_BIN_MS bins from −window to +window. A bin is [from, to); the
 * last one holds +window too. Anything outside the window (none can be, a hit is inside it) is clamped to the edge bin.
 */
export function performHistogram(errorsMs: readonly number[], binMs: number = PERFORM_HIST_BIN_MS, spanMs: number = PERFORM_EXPIRE_S * 1000): PerformHistBin[] {
  const n = Math.max(1, Math.round((2 * spanMs) / binMs));
  const bins: PerformHistBin[] = Array.from({ length: n }, (_, i) => ({ fromMs: -spanMs + i * binMs, toMs: -spanMs + (i + 1) * binMs, count: 0 }));
  for (const e of errorsMs) {
    if (!Number.isFinite(e)) continue;
    const i = Math.min(n - 1, Math.max(0, Math.floor((e + spanMs) / binMs)));
    bins[i].count++;
  }
  return bins;
}
/** The recap's one line on timing: "you rush 18 ms" / "you drag 22 ms" / "dead centre" (within ±PERFORM_CENTRE_MS). */
export const PERFORM_CENTRE_MS = 10;
export function performTimingLine(meanErrorMs: number | null): string {
  if (meanErrorMs === null || !Number.isFinite(meanErrorMs)) return 'no hits to read your timing from';
  const m = Math.round(meanErrorMs);
  if (Math.abs(m) <= PERFORM_CENTRE_MS) return `dead centre (${m >= 0 ? '+' : ''}${m} ms)`;
  return m < 0 ? `you rush — ${-m} ms early on average` : `you drag — ${m} ms late on average`;
}

/** MUSIC-SUITE P6: the stats key of a lane's accuracy (kickAcc, snareAcc, hatsAcc, flipAcc). */
export function laneStatKey(lane: PerformLane): string { return `${PERFORM_LANES[lane]}Acc`; }

/**
 * The result as GameResult.stats — the contract's keys (and the EXTRA taps), for the card and the session post.
 * MUSIC-SUITE P6: + each lane's accuracy (`kickAcc` … `flipAcc`, only lanes that had a judged event), the WRONG LANE taps
 * and the mean signed error (ms, rounded; absent with no hit). The server reads the P2 keys only (lib/session-payout.ts
 * readMusicSet recomputes the accuracy from the counts); the new keys ride along for the card.
 */
export function performResultStats(r: PerformResult): Record<string, number | string | boolean> {
  const out: Record<string, number | string | boolean> = {
    bars: r.bars, notes: r.notes, hits: r.hits, perfects: r.perfects, goods: r.goods, misses: r.misses,
    accuracy: r.accuracy, grade: r.grade, maxCombo: r.maxCombo, arena: r.arena, extras: r.extras,
  };
  if (!r.lanes || r.lanes.length === 0) return out;   // a P2 one-lane set: the contract, exactly as it was
  for (const l of r.lanes) out[laneStatKey(l.lane)] = l.accuracy;
  out.wrongLanes = r.wrongLanes;
  if (r.meanErrorMs !== null) out.meanErrorMs = Math.round(r.meanErrorMs);
  return out;
}

// ── latency: the judge listens where the player listens ──────────────────────────────────────────────────────────
/** The longest device output delay the fallback will believe (a Bluetooth headset runs ~0.2–0.3 s). Assumption. */
export const PERFORM_MAX_OUTPUT_LATENCY_S = 0.5;

/**
 * How long after its audio-clock time the player HEARS (and so taps) a note. The saved calibration
 * (lib/feel/rhythm-calibrate.ts loadAudioOffsetMs, `savedOffsetMs`, null when never saved) wins: it was measured as tap
 * minus the click's audio-clock time on this device, so it already holds the output delay — outputLatency is NOT added
 * on top. With no calibration, the context's outputLatency, else its baseLatency, else 0.
 *
 * MUSIC-SUITE P4 FIX PASS (2026-09-25): + `graphLatencySec`, the Academy desk's own delay (AudioEngine.graphLatencySec: the
 * P4 limiter's 6 ms look-ahead, 12 ms with MASTER). P2 had no compressor in the default path; P4's limiter is always in it,
 * so every note reaches the speakers 6–12 ms after its audio-clock time — on BOTH paths: the device's figures don't know
 * the desk, and a saved calibration was measured on /play/calibrate's clicks (osc → destination, no compressor) — and
 * CHECK MY TIMING now saves its reading without the desk's delay too (StudioMode), so a calibration means one thing
 * everywhere. Without this every player was judged 6–12 ms late. Absent = 0 (the P2 rule, for a room with no desk).
 */
export function performLatencySec(src: { savedOffsetMs: number | null; outputLatency?: number | null; baseLatency?: number | null; graphLatencySec?: number | null }): number {
  const graph = typeof src.graphLatencySec === 'number' && Number.isFinite(src.graphLatencySec) && src.graphLatencySec > 0 ? src.graphLatencySec : 0;
  if (src.savedOffsetMs !== null && Number.isFinite(src.savedOffsetMs)) return src.savedOffsetMs / 1000 + graph;
  for (const v of [src.outputLatency, src.baseLatency]) {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.min(v, PERFORM_MAX_OUTPUT_LATENCY_S) + graph;
  }
  return graph;
}

// ── input ────────────────────────────────────────────────────────────────────────────────────────────────────────
/** The keyboard's TAP in PERFORM: Space and J (not one of the Flip's pad keys, Flip.ts PAD_KEYS). */
export const PERFORM_TAP_KEYS = [' ', 'j'] as const;

/** Is this key press a PERFORM tap? Space or J with no modifier (Cmd+J and friends belong to the browser). */
export function isPerformTapKey(e: { key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return e.key === ' ' || e.code === 'Space' || e.key.toLowerCase() === 'j';
}

/**
 * MUSIC-SUITE P2 FIX PASS (2026-09-25): is this keydown an OS key REPEAT of a key that activates a focused button (Enter,
 * Space)? The TAP button taps on a detail-0 click (Enter on the focused button, or a script's element.click()), and a
 * mouse click on TAP focuses it — so a held Enter fired a click, and so a tap, on every key repeat. Checked in the
 * probes' headless Chromium with StudioMode's two handlers: one mouse click = 1 tap, then Enter down + 20 repeats + up =
 * 21 more; at 20–30 repeats a second that alone scored 50.4 %, grade C, won. The TAP button's onKeyDown cancels these
 * (preventDefault stops the synthetic click); the first press of a key is never a repeat, so Enter still taps once.
 */
export function isRepeatedActivation(e: { key: string; code?: string; repeat?: boolean }): boolean {
  return !!e.repeat && (e.key === 'Enter' || e.key === ' ' || e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter');
}

/**
 * Is this scheduled step a note? MUSIC-SUITE P2 FIX PASS (2026-09-25): only where the beat HITS — a step on which at
 * least one audible track starts a sound (owner decision #11, "notes only where your beat hits"). It was every step
 * while the grid had any hit (`gridLive`), so accuracy measured tap RATE: an on-beat quarter-note player scored 25 %
 * and a masher won (the header). One TAP lane: a step where any track hits is a note. MUSIC-SUITE P6: the room now puts
 * each note in its part's LANE (StepSound.rows → performLanesOf → PerformSet.step); this one-lane rule is kept for an
 * engine that names no rows (a stand-in) and for the P2 tests. `gridLive` is kept on the engine's StepSound for the probes.
 */
export function performNoteAt(sound: { hits: number; gridLive: boolean }): boolean {
  return sound.hits > 0;
}

// ── MUSIC-SUITE P6: THE BAND BUILDS ──────────────────────────────────────────────────────────────────────────────────
/**
 * MUSIC-SUITE P6 FIX PASS (2026-09-26): THE FOUNDATION IS THE SONG'S. It was always lane 0 (the kick), so a song with no
 * kick — hats / snare / bass, or a chop-only Flip beat whose "kick" is a flip_ row in the FLIP lane — started in complete
 * silence at PLAY (every other lane's rows gated to 0, the metronome off in PERFORM), and the player had to hit a note
 * blind before anything sounded. The foundation is now the kick lane when the song's kick has notes, else the lowest lane
 * that has notes, else none — and with none, every part plays from the start (null). PerformBand takes it.
 */
export function performFoundationFor(lanesWithNotes: readonly PerformLane[]): PerformLane | null {
  const on = ([0, 1, 2, 3] as const).filter((l) => lanesWithNotes.includes(l));
  if (on.includes(PERFORM_BAND_FOUNDATION)) return PERFORM_BAND_FOUNDATION;
  return on.length ? on[0] : null;
}
/**
 * What PERFORM says before PLAY, by the song's own foundation: it said "the kick alone" for every song, and a song with no
 * kick started in silence (MUSIC-SUITE P6 FIX PASS).
 */
export function performFoundationHint(foundation: PerformLane | null): string {
  if (foundation === null) return 'Press PLAY — your whole song plays (it has no part to build from); hit the lanes\' notes';
  return `Press PLAY — your song starts thin (the ${PERFORM_LANE_LABELS[foundation].toLowerCase()} alone); hit a lane's notes and its part joins the band`;
}
/** The lanes a song's rows have notes in (any hit in its pattern), in lane order — performFoundationFor's input. */
export function performLanesWithNotes(rows: readonly { sampleId: string; pattern: readonly boolean[] }[]): PerformLane[] {
  return performLanesOf(rows.filter((r) => r.pattern.some(Boolean)).map((r) => r.sampleId));
}

/**
 * MUSIC-SUITE P6 FIX PASS: the band's per-row gains for the desk (mixGraph setBand): each row at its lane's level. The
 * TAKES strip (a booth take is not a lane) follows the FLIP lane — "the tune" — when the song has Flip notes to bring it
 * in, and is in from the start when it has none (it would otherwise never be heard). It fell through to mixGraph's default
 * of 1 before, so a song with takes did not "start thin" as the hint says. Was inline in StudioMode (bandToDesk).
 */
export function performBandMap(
  rowIds: readonly string[], levels: readonly number[], opts: { takesId?: string; flipHasNotes?: boolean } = {},
): Record<string, number> {
  const band: Record<string, number> = {};
  for (const id of rowIds) band[id] = levels[performLaneOf(id)] ?? 1;
  if (opts.takesId) band[opts.takesId] = opts.flipHasNotes ? (levels[3] ?? 1) : 1;
  return band;
}

/**
 * MUSIC-SUITE P6 FIX PASS: is the band on the desk now? Only while a FREE-PLAY PERFORM set is RUNNING on the STUDIO view.
 * It was applied at enterPerform (before PLAY) and cleared only when the mode changed — so on the FLIP tab, or with the
 * transport stopped, every non-foundation row's strip was gated to 0: a Flip pad sent to the grid (FlipPad plays through
 * its row's strip) and a paired phone's MPC pad were silent until that lane joined during a played set.
 */
export function performBandLive(s: { mode: string; running: boolean; view: string; arena: boolean }): boolean {
  return !s.arena && s.mode === 'perform' && s.running && s.view === 'studio';
}

/** A part joins after this many hits in a row in its lane. TUNE(elijah): 4 = one bar of quarter notes. */
export const PERFORM_BAND_JOIN = 4;
/** This many misses in a row (unhit notes and EXTRA taps, any lane) drop the newest part back out. TUNE(elijah). */
export const PERFORM_BAND_DROP = 3;
/** The lane that always plays: the kick is the pulse every other part is played against. */
export const PERFORM_BAND_FOUNDATION: PerformLane = 0;

/**
 * Which parts of the song play while you perform it (owner decision #11: "the band builds"). The kick is always in. The
 * FIRST lane you hit joins at once — "the part whose lane you're on" (assumption: read as the lane you start on; a part
 * that flickered in and out with each note of an interleaved groove would be noise). Every other part joins after
 * PERFORM_BAND_JOIN hits in a row in ITS lane (a miss in that lane, or an EXTRA tapped in it, starts its count again), and
 * PERFORM_BAND_DROP misses in a row, anywhere, drop the NEWEST part back out (last in, first out; then the count starts
 * again, so three more drop the next). A dropped part rejoins the same way. Pure: StudioMode reads `levels()` into the
 * desk's band gains (mixGraph setBand).
 */
export class PerformBand {
  /** The parts in beside the foundation, in the order they joined (the newest last). */
  private joined: PerformLane[] = [];
  private streak: number[] = [0, 0, 0, 0];
  private missRun = 0;
  private started = false;
  /** Every join / drop so far, for the recap and the probes. */
  readonly log: { kind: 'join' | 'drop'; lane: PerformLane }[] = [];
  /**
   * MUSIC-SUITE P6 FIX PASS: the part that always plays — the song's (performFoundationFor), the kick by default; null =
   * a song with no notes to build from: every part plays and nothing joins or drops.
   */
  readonly foundation: PerformLane | null;
  constructor(foundation: PerformLane | null = PERFORM_BAND_FOUNDATION) { this.foundation = foundation; }

  /** Is this lane's part playing? */
  has(lane: PerformLane): boolean { return this.foundation === null || lane === this.foundation || this.joined.includes(lane); }
  /** The parts in, foundation first then in joining order (every lane when there is no foundation). */
  get parts(): PerformLane[] { return this.foundation === null ? [0, 1, 2, 3] : [this.foundation, ...this.joined]; }
  /** Each lane's level for the desk: 1 in, 0 out. */
  levels(): [number, number, number, number] { return [0, 1, 2, 3].map((l) => (this.has(l as PerformLane) ? 1 : 0)) as [number, number, number, number]; }

  /** A hit in `lane`. Returns the lane that joined because of it, if one did. */
  hit(lane: PerformLane): PerformLane | null {
    this.missRun = 0;
    this.streak[lane]++;
    const first = !this.started;
    this.started = true;
    if (this.has(lane)) return null;   // (with no foundation every part is in: nothing joins)
    if (first || this.streak[lane] >= PERFORM_BAND_JOIN) {
      this.joined.push(lane);
      this.log.push({ kind: 'join', lane });
      return lane;
    }
    return null;
  }

  /** A miss — a note of `lane` whose window closed unhit, or an EXTRA tapped in `lane` (null: no lane). Returns the lane dropped, if one was. */
  miss(lane: PerformLane | null): PerformLane | null {
    return this.missChord([lane]);
  }

  /**
   * MUSIC-SUITE P6 FIX PASS (2026-09-26): ONE missed moment, however many lanes it had — each lane's streak starts again,
   * and the run of misses grows by ONE. expire() called miss() once per expired NOTE, so a single unhit three-lane chord
   * (kick + hats + Flip on a downbeat) was three misses "in a row" and dropped a part at once — the header promises
   * PERFORM_BAND_DROP misses in a row (measured in a scratch sim: band [0,2,1], one missed three-lane chord → [0,2]).
   */
  missChord(lanes: readonly (PerformLane | null)[]): PerformLane | null {
    for (const lane of lanes) if (lane !== null) this.streak[lane] = 0;
    if (this.foundation === null) return null;
    this.missRun++;
    if (this.missRun < PERFORM_BAND_DROP) return null;
    this.missRun = 0;
    const dropped = this.joined.pop();
    if (dropped === undefined) return null;
    this.streak[dropped] = 0;
    this.log.push({ kind: 'drop', lane: dropped });
    return dropped;
  }
}

/** A note the set has offered and nobody has hit yet. `lane` null = a P2 one-lane note (any tap's). */
interface OpenNote { step: number; time: number; lane: PerformLane | null }
/** Does a tap in `tapLane` reach a note in `noteLane`? (null on either side = the P2 one-lane rule: any.) */
function laneMatch(tapLane: PerformLane | null, noteLane: PerformLane | null): boolean {
  return tapLane === null || noteLane === null || tapLane === noteLane;
}
/** One lane's running tallies (misses = notes whose window closed unhit; extras = EXTRA taps played in it). */
interface LaneTally { perfects: number; goods: number; misses: number; extras: number }

/** One PERFORM set on the audio clock (seconds). StudioMode owns the engine and the screen; this owns the score. */
export class PerformSet {
  score = 0;
  combo = 0;
  /** The longest run of hits in the set. (The card used to call the combo the set ENDED on "best".) */
  maxCombo = 0;
  /** Notes offered so far (at most PERFORM_SET_NOTES in an Arena set). */
  notes = 0;
  perfects = 0;
  goods = 0;
  /** Notes whose window closed unhit so far. */
  misses = 0;
  /** Taps with no note in reach (MUSIC-SUITE P2 FIX PASS: each is a miss in result(), as a wild tap is in the Cypher). */
  extras = 0;
  /** MUSIC-SUITE P6: EXTRA taps that had another lane's note in reach (a part of `extras`). */
  wrongLanes = 0;
  /**
   * Seconds from a note's audio-clock time to when the player hears it (performLatencySec). Every tap and window is
   * judged on the heard clock, `now - latencySec`. 0 = the audio clock itself (the tests and the server's sims).
   */
  latencySec = 0;
  /** The last tap's verdict, for the line beside TAP. */
  lastTap: PerformTap | null = null;
  /** MUSIC-SUITE P6: which parts of the song play (the foundation, then what the player's streaks let in). */
  readonly band: PerformBand;
  /** MUSIC-SUITE P2 FIX PASS: the heard time of the latest EXTRA tap (a hit inside PERFORM_SPAM_LOCK_S after it is a GOOD). */
  private lastExtraAt = -Infinity;
  /** The set's length in bars: PERFORM_SET_BARS for an Arena set, null in free play (it runs until END SET). */
  readonly bars: number | null;
  readonly arena: boolean;
  private readonly maxSteps: number;
  /** Scheduled steps inside the set, notes and rests alike: the set's length is counted in steps, not notes. */
  private steps = 0;
  /**
   * MUSIC-SUITE P2 FIX PASS: notes offered in each bar of the set (index = the set's own bar, 16 of its steps from its
   * first). result() counts a whole bar toward the win's 8 only when it offered a note: rests fill a length, not a set.
   */
  private barNotes: number[] = [];
  /** Open notes: offered, not yet hit, window not yet closed. (Name kept: scripts/music/baseline-sim.ts reads it.) */
  private expected: OpenNote[] = [];
  private lastStepAt = -Infinity;
  /** Times of in-set steps the player has not heard yet (scheduled ahead) — they are not bars played. */
  private unheard: number[] = [];
  /**
   * Taps waiting for the schedule to catch up (see tap()): `at` on the heard clock, the nearest note of its lane that was
   * known when it landed (`cand`, null when none was in reach) and its lane (MUSIC-SUITE P6; null = a P2 one-lane tap).
   */
  private waiting: { at: number; cand: OpenNote | null; lane: PerformLane | null }[] = [];
  /** The last two gaps between scheduled steps (positive only): the next step sounds at least the smaller one later. */
  private gaps: number[] = [];
  /** MUSIC-SUITE P6: the step offered just before (its place in the bar and the lanes it offered) — for the 8th cap. */
  private prevStep: { stepInBar: number; lanes: PerformLane[] } | null = null;
  /** MUSIC-SUITE P6: each lane's tallies. */
  private laneTally: LaneTally[] = [0, 1, 2, 3].map(() => ({ perfects: 0, goods: 0, misses: 0, extras: 0 }));
  /** MUSIC-SUITE P6: did any note or tap carry a lane (a lane set reports `lanes`; a P2 one-lane set does not)? */
  private laned = false;
  /** MUSIC-SUITE P6: every hit's signed error, ms (− early, + late) — the recap's histogram. */
  private errorsMs: number[] = [];
  /** MUSIC-SUITE P6: the heard times of the recent EXTRA taps (the lock both ways: a PERFECT near one is a GOOD). */
  private extraAts: number[] = [];
  /** MUSIC-SUITE P6: recent PERFECT hits — when, what taking it back to GOOD costs, and its lane — for an EXTRA landing after them. */
  private recentPerfects: { at: number; lost: number; lane: PerformLane | null }[] = [];
  /** MUSIC-SUITE P6 FIX PASS: recent lane hits (tap time, lane, the note time it took) — a chord's partners (PERFORM_CHORD_S). */
  private recentHits: { at: number; lane: PerformLane; noteTime: number }[] = [];

  /**
   * `arena`: the run was launched from an Arena duel, so this is the staked set with an end. `foundation` (MUSIC-SUITE P6
   * FIX PASS): the band's always-on part — performFoundationFor(the song's lanes); absent = the kick, as before.
   */
  constructor(opts: { arena: boolean; foundation?: PerformLane | null }) {
    this.arena = opts.arena;
    this.bars = opts.arena ? PERFORM_SET_BARS : null;
    this.maxSteps = opts.arena ? PERFORM_SET_NOTES : Infinity;
    this.band = new PerformBand(opts.foundation === undefined ? PERFORM_BAND_FOUNDATION : opts.foundation);
  }

  private heard(now: number): number { return now - this.latencySec; }

  /** Steps offered so far — in an Arena set, the index of the next step on its chart. */
  get stepCount(): number { return this.steps; }

  /**
   * A sequencer step that is a note was SCHEDULED to sound at `time`, seen at `now` (both on the audio clock). It is a
   * note while the set has steps left; past an Arena set's length the music plays on and scores nothing. Returns
   * whether it was offered and how many notes expired unhit (each is a MISS: the combo breaks). (The P2 one-lane note:
   * any tap takes it. MUSIC-SUITE P6's lane notes come through step().)
   */
  note(step: number, time: number, now: number): { offered: boolean; missed: number } {
    return this.offer(step, time, now, [null]);
  }

  /** A scheduled step that is not a note (performNoteAt said no): it counts toward the set's length, and scores nothing. */
  rest(step: number, time: number, now: number): { offered: boolean; missed: number } {
    this.prevStep = { stepInBar: step, lanes: [] };
    return this.offer(step, time, now, []);
  }

  /**
   * MUSIC-SUITE P6: a scheduled step with the LANES whose parts hit on it (performLanesOf the rows that start a sound). One
   * note per lane, less the 8th cap (performCapLanes); no lane left = a rest. Returns what was offered.
   */
  step(step: number, time: number, now: number, lanes: readonly PerformLane[]): { offered: boolean; missed: number; lanes: PerformLane[] } {
    return this.laneStep(step, time, now, performCapLanes(step, lanes, this.prevStep));
  }

  /**
   * MUSIC-SUITE P6: a step of a CURATED chart (the Arena's house beat — houseBeat.ts charts one lane per step and the same
   * note count on every beat, so its notes are offered as charted: no 8th cap). `lanes` are the step's notes.
   */
  chartStep(step: number, time: number, now: number, lanes: readonly PerformLane[]): { offered: boolean; missed: number; lanes: PerformLane[] } {
    return this.laneStep(step, time, now, ([0, 1, 2, 3] as const).filter((l) => lanes.includes(l)));
  }

  private laneStep(step: number, time: number, now: number, lanes: PerformLane[]): { offered: boolean; missed: number; lanes: PerformLane[] } {
    this.prevStep = { stepInBar: step, lanes };
    const r = this.offer(step, time, now, lanes);
    return { ...r, lanes: r.offered ? lanes : [] };
  }

  private offer(step: number, time: number, now: number, lanes: readonly (PerformLane | null)[]): { offered: boolean; missed: number } {
    let offered = false;
    if (this.steps < this.maxSteps) {
      this.steps++;
      const gap = time - this.lastStepAt;
      this.gaps = Number.isFinite(gap) && gap > 0 ? [...this.gaps, gap].slice(-2) : [];   // a restart resets it
      this.lastStepAt = time;
      this.unheard.push(time);
      const pushed: OpenNote[] = [];
      for (const lane of lanes) {
        const n: OpenNote = { step, time, lane };
        this.expected.push(n);
        pushed.push(n);
        this.notes++;
        if (lane !== null) this.laned = true;
      }
      if (pushed.length) {
        const bar = Math.floor((this.steps - 1) / PERFORM_STEPS_PER_BAR);
        this.barNotes[bar] = (this.barNotes[bar] ?? 0) + pushed.length;
        offered = true;
      }
      this.settleWaiting(time, pushed);
    }
    return { offered, missed: this.expire(now) };
  }

  /**
   * The earliest a step not yet scheduled can sound: the last step scheduled plus the smaller of the last two gaps
   * (swing alternates long and short gaps; a tempo change is assumed not to halve a 16th between two steps). With no
   * gap seen yet, the last step itself — the cautious answer.
   */
  private nextStepNoEarlier(): number {
    return this.lastStepAt + (this.gaps.length === 2 ? Math.min(this.gaps[0], this.gaps[1]) : 0);
  }

  /**
   * A step was just scheduled at `time`. A waiting tap adopts one of its notes if it is in the tap's lane and NEARER than
   * the tap's known candidate (inside the window; a tie keeps the older note, as a tap decided at once does — TIE_S absorbs
   * float rounding). Once no step still to come can be nearer (nextStepNoEarlier), the tap takes its candidate, or is EXTRA.
   */
  private settleWaiting(time: number, pushed: readonly OpenNote[]): void {
    if (!this.waiting.length) return;
    const keep: typeof this.waiting = [];
    for (const w of this.waiting) {
      let cand = w.cand && this.expected.includes(w.cand) ? w.cand : null;   // another tap may have taken it
      for (const p of pushed) {
        if (!laneMatch(w.lane, p.lane) || !this.expected.includes(p)) continue;
        const dn = Math.abs(time - w.at);
        if (dn < PERFORM_EXPIRE_S && (!cand || dn < Math.abs(w.at - cand.time) - TIE_S)) cand = p;
      }
      const reach = cand ? Math.abs(w.at - cand.time) : PERFORM_EXPIRE_S;
      if (this.nextStepNoEarlier() - w.at >= reach - TIE_S) {
        if (cand) this.hit(this.expected.indexOf(cand), w.at, w.lane); else this.extra(w.at, w.lane);
      } else {
        keep.push({ at: w.at, cand, lane: w.lane });
      }
    }
    this.waiting = keep;
  }

  /** Decide every waiting tap now, on what is known: its candidate, or EXTRA. */
  private settleAll(): void {
    for (const w of this.waiting) {
      const i = w.cand ? this.expected.indexOf(w.cand) : -1;
      if (i >= 0) this.hit(i, w.at, w.lane); else this.extra(w.at, w.lane);
    }
    this.waiting = [];
  }

  /** Close every note whose window has passed on the heard clock. Returns how many (each a MISS; the combo breaks). */
  expire(now: number): number {
    const heard = this.heard(now);
    const cutoff = heard - PERFORM_EXPIRE_S;
    // a waiting tap is decided before its candidate's window closes under it, or once its own window has passed
    if (this.waiting.some((w) => w.at < cutoff || (w.cand !== null && w.cand.time < cutoff))) {
      const keep: typeof this.waiting = [];
      for (const w of this.waiting) {
        const i = w.cand ? this.expected.indexOf(w.cand) : -1;
        if (i >= 0 && this.expected[i].time < cutoff) this.hit(i, w.at, w.lane);
        else if (w.at < cutoff) { if (i >= 0) this.hit(i, w.at, w.lane); else this.extra(w.at, w.lane); }
        else keep.push(w);
      }
      this.waiting = keep;
    }
    let missed = 0;
    if (this.expected.some((n) => n.time < cutoff)) {
      const gone: OpenNote[] = [];
      this.expected = this.expected.filter((n) => (n.time < cutoff ? (gone.push(n), false) : true));
      missed = gone.length;
      for (const n of gone) if (n.lane !== null) this.laneTally[n.lane].misses++;
      // MUSIC-SUITE P6 FIX PASS: the band hears one miss per missed MOMENT (a chord is one), not one per note
      const moments = new Map<number, (PerformLane | null)[]>();
      for (const n of gone) moments.set(n.time, [...(moments.get(n.time) ?? []), n.lane]);
      for (const lanes of moments.values()) this.band.missChord(lanes);
    }
    if (missed) { this.combo = 0; this.misses += missed; }
    if (this.unheard.some((t) => t <= heard)) this.unheard = this.unheard.filter((t) => t > heard);
    return missed;
  }

  /**
   * A tap at `now` (audio clock). The NEAREST open note inside the window, early or late, is hit — so a tap just before
   * a note takes that note, never the one before it. MUSIC-SUITE P6: a tap in a LANE takes only a note of that lane (a
   * tap in the wrong lane is never a hit: with none of its own in reach it is an EXTRA — WRONG LANE when another lane's
   * note was); `lane` absent = the P2 one-lane tap, which takes any note.
   *
   * A note is known only once it is scheduled, up to 100 ms before it sounds, but the window reaches 250 ms early. So a
   * tap is decided at once only when no note still to be scheduled could be nearer than the best known one — every
   * such note sounds at nextStepNoEarlier() or later, so that is `tap + distance <= nextStepNoEarlier()`. Otherwise it WAITS
   * (returns 'WAIT'; its verdict lands in `lastTap` when it settles): a note scheduled nearer takes it (EARLY), and once
   * the schedule is past its reach it takes its known note, or is an EXTRA tap (the combo breaks). Measured in the P2
   * browser run at 60 BPM (16ths 250 ms apart) before this: a tap 107 ms before a note that was not scheduled yet took
   * the note 143 ms BEHIND it ("GOOD · LATE 143ms"), or, when that one was already hit, read EXTRA. Past an Arena set's
   * last step no note can come, so nothing waits.
   */
  tap(now: number, lane: PerformLane | null = null): PerformTapOutcome {
    this.expire(now);
    const heard = this.heard(now);
    let best = -1, bestAbs = PERFORM_EXPIRE_S;
    for (let i = 0; i < this.expected.length; i++) {
      if (!laneMatch(lane, this.expected[i].lane)) continue;
      const a = Math.abs(heard - this.expected[i].time);
      if (a < bestAbs) { bestAbs = a; best = i; }
    }
    const scheduleDone = this.steps >= this.maxSteps;             // an Arena set past its last step: nothing more comes
    if (scheduleDone || heard + bestAbs <= this.nextStepNoEarlier() + TIE_S) return best >= 0 ? this.hit(best, heard, lane) : this.extra(heard, lane);
    this.waiting.push({ at: heard, cand: best >= 0 ? this.expected[best] : null, lane });
    return 'WAIT';
  }

  /** Tap `heard` (heard clock, in `tapLane`) takes open note `i`. */
  private hit(i: number, heard: number, tapLane: PerformLane | null): PerformJudgement {
    const note = this.expected[i];
    // MUSIC-SUITE P6 FIX PASS: a chord is one moment — a key of it on another note time than its partners' is an EXTRA
    if (tapLane !== null) {
      this.recentHits = this.recentHits.filter((h) => Math.abs(heard - h.at) <= 4 * PERFORM_CHORD_S);
      if (this.recentHits.some((h) => h.lane !== tapLane && Math.abs(heard - h.at) <= PERFORM_CHORD_S && Math.abs(h.noteTime - note.time) > TIE_S)) {
        return this.extra(heard, tapLane);
      }
      this.recentHits.push({ at: heard, lane: tapLane, noteTime: note.time });
    }
    const err = heard - note.time;      // < 0: before the note (EARLY); > 0: after it (LATE)
    this.expected.splice(i, 1);
    const sinceExtra = heard - this.lastExtraAt;
    // MUSIC-SUITE P6: the lock both ways — an EXTRA already decided a moment AFTER this tap (it waited less) counts too
    const nearExtra = (sinceExtra >= 0 && sinceExtra <= PERFORM_SPAM_LOCK_S) || this.extraAts.some((e) => Math.abs(heard - e) <= PERFORM_SPAM_LOCK_S);
    const perfect = Math.abs(err) < PERFORM_PERFECT_S && !nearExtra;
    const lane = note.lane ?? tapLane;
    if (perfect) {
      this.recentPerfects = this.recentPerfects.filter((h) => heard - h.at <= 2 * PERFORM_SPAM_LOCK_S);
      this.recentPerfects.push({ at: heard, lost: performHitPoints(true, this.combo) - performHitPoints(false, this.combo), lane });
    }
    this.score += performHitPoints(perfect, this.combo);
    this.combo++;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    if (perfect) this.perfects++; else this.goods++;
    this.errorsMs.push(err * 1000);
    if (lane !== null) {
      if (perfect) this.laneTally[lane].perfects++; else this.laneTally[lane].goods++;
      this.band.hit(lane);
    }
    const judgement: PerformJudgement = perfect ? 'PERFECT' : 'GOOD';
    this.lastTap = { judgement, errorSec: err, side: err < 0 ? 'EARLY' : err > 0 ? 'LATE' : null, ...(tapLane !== null ? { lane: tapLane, wrongLane: false } : {}) };
    return judgement;
  }

  /** A tap (heard at `at`, in `tapLane`) that met no note: no points, the combo breaks, and it is a miss in result(). */
  private extra(at: number, tapLane: PerformLane | null): 'EXTRA' {
    this.combo = 0;
    this.extras++;
    if (at > this.lastExtraAt) this.lastExtraAt = at;
    // MUSIC-SUITE P6: the lock both ways — every PERFECT within PERFORM_SPAM_LOCK_S of this tap, either side, is a GOOD
    this.extraAts = this.extraAts.filter((e) => at - e <= 2 * PERFORM_SPAM_LOCK_S);
    this.extraAts.push(at);
    if (this.recentPerfects.length) {
      this.recentPerfects = this.recentPerfects.filter((h) => {
        if (Math.abs(at - h.at) > PERFORM_SPAM_LOCK_S) return true;
        this.score -= h.lost;
        this.perfects--; this.goods++;
        if (h.lane !== null) { this.laneTally[h.lane].perfects--; this.laneTally[h.lane].goods++; }
        return false;
      });
    }
    let wrongLane = false;
    if (tapLane !== null) {
      this.laned = true;
      this.laneTally[tapLane].extras++;
      wrongLane = this.expected.some((n) => n.lane !== null && n.lane !== tapLane && Math.abs(at - n.time) < PERFORM_EXPIRE_S);
      if (wrongLane) this.wrongLanes++;
    }
    this.band.miss(tapLane);
    this.lastTap = { judgement: 'EXTRA', errorSec: null, side: null, ...(tapLane !== null ? { lane: tapLane, wrongLane } : {}) };
    return 'EXTRA';
  }

  /**
   * MUSIC-SUITE P6 FIX PASS (2026-09-26): PAUSE, as the set sees it. Free play's PAUSE is the transport's STOP, which takes
   * back every hit not yet begun (AudioEngine.stop) — but the set kept the notes it had been OFFERED (scheduled up to
   * 100 ms ahead) and their steps in `unheard`, so on resume expire() closed them as MISSes: measured on this class, kick
   * hit twice (combo 2), step 8 scheduled, pause, resume 5 s later → the first step "missed 1", combo 0 — and each such
   * miss counted toward the band's drop. Now: the waiting taps are decided on what is known, every note still open is
   * taken off the chart UNCOUNTED (the pause interrupted it — no miss, no band miss, the combo kept), the steps not yet
   * heard are forgotten, and `rewindSteps` (the steps the engine had scheduled into the bar it will resume at the start of
   * — AudioEngine.startAt) are taken off the set's length, so the bar that plays again is counted once. Returns how many
   * open notes the pause took off.
   */
  pause(now: number, rewindSteps = 0): number {
    this.settleAll();
    const heard = this.heard(now);
    const open = this.expected.length;
    this.expected = [];
    this.unheard = this.unheard.filter((t) => t <= heard);
    const back = Math.max(0, Math.min(this.steps, Math.floor(rewindSteps)));
    this.steps -= back;
    const bar = Math.floor(this.steps / PERFORM_STEPS_PER_BAR);
    this.barNotes = this.barNotes.slice(0, bar);
    this.unheard = [];
    this.lastStepAt = -Infinity;
    this.gaps = [];
    this.prevStep = null;
    return open;
  }

  /**
   * The bar of the latest step scheduled (1-based; bar 1 before the first). It counts steps, so the last step of a bar
   * reads as that bar and an empty grid's bars still count. An Arena set holds at its last bar.
   */
  get bar(): number { return Math.floor(Math.max(0, this.steps - 1) / PERFORM_STEPS_PER_BAR) + 1; }

  /** An Arena set whose every step has been scheduled and whose last window has closed is over. Free play never is. */
  over(now: number): boolean {
    return this.steps >= this.maxSteps && this.heard(now) - this.lastStepAt > PERFORM_EXPIRE_S;
  }

  /**
   * The set as it stands at `now` — what END SET (or the set's own end) reports. Notes heard but never hit count as
   * misses; notes scheduled but not yet heard are not counted at all. MUSIC-SUITE P2 FIX PASS: bars are whole bars heard
   * that offered a note (a rest bar is not a bar played), and every EXTRA tap is a miss too. MUSIC-SUITE P6: + each lane's
   * share, the WRONG LANE taps and the timing picture.
   */
  result(now: number): PerformResult {
    this.settleAll();                                   // the set is over: a waiting tap is decided on what is known
    const heard = this.heard(now);
    const heardSteps = this.steps - this.unheard.filter((t) => t > heard).length;
    const wholeBars = Math.floor(Math.max(0, heardSteps) / PERFORM_STEPS_PER_BAR);
    let bars = 0;
    for (let b = 0; b < wholeBars; b++) if ((this.barNotes[b] ?? 0) > 0) bars++;
    const openHeard = this.expected.filter((n) => n.time <= heard);
    const misses = this.misses + openHeard.length + this.extras;
    const notes = this.perfects + this.goods + misses;
    const accuracy = performAccuracy(this.perfects, this.goods, notes);
    const lanes: PerformLaneResult[] = [];
    if (this.laned) {
      for (const lane of [0, 1, 2, 3] as const) {
        const t = this.laneTally[lane];
        const lm = t.misses + openHeard.filter((n) => n.lane === lane).length + t.extras;
        const ln = t.perfects + t.goods + lm;
        if (ln === 0) continue;
        lanes.push({ lane, notes: ln, hits: t.perfects + t.goods, perfects: t.perfects, goods: t.goods, misses: lm, extras: t.extras, accuracy: performAccuracy(t.perfects, t.goods, ln) });
      }
    }
    const meanErrorMs = this.errorsMs.length ? this.errorsMs.reduce((a, b) => a + b, 0) / this.errorsMs.length : null;
    return {
      score: this.score,
      won: performSetWon({ accuracy, bars }),
      bars, notes, hits: this.perfects + this.goods, perfects: this.perfects, goods: this.goods, misses,
      accuracy, grade: performGrade(accuracy), maxCombo: this.maxCombo, arena: this.arena, extras: this.extras,
      lanes, wrongLanes: this.wrongLanes, hist: performHistogram(this.errorsMs), meanErrorMs,
    };
  }
}
