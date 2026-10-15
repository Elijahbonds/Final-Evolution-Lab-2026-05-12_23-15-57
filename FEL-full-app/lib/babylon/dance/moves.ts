// moves — THE CYPHER'S MOVE VOCABULARY: DANCE_LIBRARY's eight, then the six CAPTURED moves (lane/dance-extras, 2026-10-14; from
// closed PR #46's MUSIC-SUITE P9, owner decision #17: "breaking + popping — breaking from captures on disk; popping / locking /
// moonwalk searched in CMU / UAL first; Mixamo files listed for the owner to download if missing").
//
// WHAT WAS THERE. DanceCore.DANCE_LIBRARY's eight moves, six of them procedural stand-ins by danceClips.ts's own header ("not what
// ships in a finished product"); only the windmill (CMU 90_34) and the six-step (CMU 85_04) were captured (RECOGNISABLE,
// 2026-09-15). No popping at all, and one freeze. #224 re-landed #46's authored charts and left these six out; chart.ts's
// CHART_MOVES answers each of their short names (kickstep, sidefreeze, helicopter, headstand, moonwalk, robot) with the library
// clip of the same family. Those six lines are UNCHANGED here: an existing chart plays exactly what it played.
//
// WHAT WAS SEARCHED (MUSIC-SUITE P9, on the owner's machine):
//   * CMU, the index on disk (~/Downloads/fel-mocap-sources/cmu-index.txt, 2,887 lines): breaking is subject 85 ("jumps; flips;
//     breakdance": 85_04 FancyFootWork, 85_08 Helicopter, 85_10 EndofBreakDance, 85_14 BreakSequencewithFlips) and 90_28
//     breakdance / 90_34 wide leg roll; popping-family is 90_32 moonwalk and 120_21 Robot (subject 120 "Various Style Walks").
//     There is NO locking take in CMU, and no popping take beyond the moonwalk and the robot walk.
//   * UAL2 [Standard] (the only UAL on disk): 43 animations, none a dance (sword, farm, zombie, ninja, idles).
//   So the captured additions below are what CMU actually has; locking, the popping arm hits and the named power moves / freezes
//   CMU lacks are the owner's Mixamo list (outbox musicsuite/p9/MOCAP-WANTED.md) — never a placeholder clip here.
//
// THE CAPTURED MOVES. Each is a real capture (scripts/mocap/dance-clips.json → anim/authored/mocapDance.ts, or the already-baked
// brk_helicopter in anim/authored/mocapStyles.ts), fitted to a beat-timed step by danceClips.ts MOVE_CAPTURES.
//
// HOW EACH ONE MEETS MATCH (lane/dance-extras; owner 2026-10-13: "redesigned for MATCH"). A move's FAMILY (`category`) is
// DANCE_LIBRARY's own seven, and the family is everything the rest of the room reads: chartPlay.FAMILY_BUTTON gives the MATCH
// button (kick step A, side freeze Y, helicopter and headstand B, moonwalk and robot X), StemBand.CATEGORY_STEM the instrument it
// earns (toprock → the toprock stem, a freeze → HORNS, power → the power stem, popping rides WAVE), danceTracks.FAMILY_COLOR the
// cue's colour, and the HOLD rule (chartPlay #13) holds a freeze-family move through its beats. So a captured move needs no case of
// its own anywhere in the judge: it is looked up here (danceMove) where the room used to look in DANCE_LIBRARY, and plays through
// the one clip pipeline (registerDanceClips → CharacterAnimator → MoveRootLayer's root track). moves.test.ts holds every reader.
//
// WHY A SEPARATE LIST, NOT MORE ROWS IN DANCE_LIBRARY. DanceCore.ts is movement play's (docs/LANES.md), and DANCE_LIBRARY is not
// press-path: generateRoutine draws from it, and DanceCore.equivalence.test.ts pins generateRoutine byte for byte — one more row
// changes every seeded routine (and DanceExport's pool, and the community card's known clips). So DANCE_LIBRARY is UNCHANGED and
// every reader that needs a move by id asks danceMove() here, which answers DANCE_LIBRARY first (the same object, so every old
// lookup is identical) and then the captured moves. Pure — no Babylon — because the chart loader and the server's rejudge import it.
//
// A CHART OPTS IN BY NAMING THE ID ("m": "dance_pop_moonwalk"); a chart that does not never plays one. Pay is untouched either
// way: a step's score is its judgement, not its clip, and every captured move is a 4-beat step (no tighter than DANCE_LIBRARY's
// shortest, 2 beats, which is what lib/arena-score-integrity.ts danceCeiling counts steps by).

import { DANCE_LIBRARY, type DanceClip } from '../core/DanceCore';

/** Where a move's motion comes from, and which street style it belongs to (for the pick screens and the report). */
export interface CapturedMove extends DanceClip {
  style: 'breaking' | 'popping';
  /** The capture it dances: a clip name in mocapDance.ts (MOCAP_DANCE_CLIPS) or mocapStyles.ts (MOCAP_STYLE_CLIPS). */
  capture: string;
  /** The capture's source window, for the credits and the report (CMU licence: free in commercial products). */
  source: string;
}

/**
 * The captured moves. Beats are the step's length at the clips' 120 BPM reference (danceClips.ts REF_BPM): every captured move is a
 * 4-beat step — the capture plays between a short drop from standing and a rise back to it, so a step that runs past its slot wraps
 * on the standing groove like every other step (danceClips.ts's contract).
 * NEW TUNED NUMBERS (#46's, carried over; the owner's eye is the judge): beats and difficulty.
 */
export const CAPTURED_MOVES: readonly CapturedMove[] = [
  { id: 'dance_toprock_kick', name: 'Kick Step', beats: 4, category: 'toprock', difficulty: 1, style: 'breaking', capture: 'dnc_toprock', source: 'CMU 85_14 1.10–2.20 s' },
  { id: 'dance_freeze_side', name: 'Side Freeze', beats: 4, category: 'freeze', difficulty: 3, style: 'breaking', capture: 'dnc_freeze_side', source: 'CMU 85_10 1.95–3.35 s' },
  { id: 'dance_power_helicopter', name: 'Helicopter', beats: 4, category: 'power', difficulty: 3, style: 'breaking', capture: 'brk_helicopter', source: 'CMU 85_08 5.35–7.30 s' },
  { id: 'dance_power_headstand', name: 'Headstand Spin', beats: 4, category: 'power', difficulty: 3, style: 'breaking', capture: 'dnc_headstand', source: 'CMU 85_10 0.35–1.50 s' },
  { id: 'dance_pop_moonwalk', name: 'Moonwalk', beats: 4, category: 'wave', difficulty: 2, style: 'popping', capture: 'dnc_moonwalk', source: 'CMU 90_32 4.90–6.00 s' },
  { id: 'dance_pop_robot', name: 'Robot', beats: 4, category: 'wave', difficulty: 2, style: 'popping', capture: 'dnc_robot', source: 'CMU 120_21 9.20–11.20 s' },
];

/** Every move the room can dance: DANCE_LIBRARY's eight (unchanged, first) then the captured ones. */
export const ALL_DANCE_MOVES: readonly DanceClip[] = [...DANCE_LIBRARY, ...CAPTURED_MOVES];

/** One id → move map over the whole vocabulary (chartPlay.CLIP_BY_ID and chart.ts read it; DANCE_LIBRARY's rows are the same objects). */
export const MOVE_BY_ID: ReadonlyMap<string, DanceClip> = new Map(ALL_DANCE_MOVES.map((m) => [m.id, m]));

/** A move by clip id — DANCE_LIBRARY's own object for its eight, else the captured move — or null. Pure. */
export function danceMove(id: string | null | undefined): DanceClip | null {
  return id ? MOVE_BY_ID.get(id) ?? null : null;
}

/** Is this one of the captured moves (not a DANCE_LIBRARY row)? */
export const isCapturedMove = (id: string): boolean => CAPTURED_MOVES.some((m) => m.id === id);
