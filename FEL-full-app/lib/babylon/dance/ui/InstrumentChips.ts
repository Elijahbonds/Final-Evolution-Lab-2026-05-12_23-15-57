// lib/babylon/dance/ui/InstrumentChips.ts — MUSIC-SUITE P7 (2026-09-29), room-mix-ux, task 1 of 3.
//
// WHAT WAS THERE: one gauge, top-left, labelled MIX — DanceMode.ts published `energy: band.mixLevel()*100` and
// `energyLabel: 'MIX'`, the generic energy bar every timing-sport mode shares (tennis' RACKETS, derby's contact
// meter). A single percentage cannot say WHICH instrument a dancer is playing: on a run where the player only ever
// lands footwork and toprock, the bar read the same climbing number as a run that lit every category, and the join
// banner ("BASS JOINS THE MIX", DanceMode.ts onJudged) was the only place a category's NAME ever appeared on screen,
// for one second.
//
// WHAT THIS IS: one chip per instrument the CURRENT SONG actually calls for, replacing that one bar — lit once its
// stem is earned (StemBand.level(cat) > 0, the same threshold onJudged already uses for the join banner), dim while
// it is ducked (earned before, then missed back down, or never yet judged), and marked FEL when the song's chart has
// no move in that category at all this run — a category the player structurally cannot earn this song is not a
// failing chip, it is one FEL is standing in for (contract (a): "FEL's band filling missing parts"; the FILL itself
// is a bigger, separate P7 task — this module only has to be able to SHOW that state the day it lands, without a
// reshape). `songCategories` (below) is the pure read of "which instruments this song calls for" from the loaded
// routine, decided ONCE per track lock-in, before any note is judged.
//
// PURE, and STRING-ENCODED ON PURPOSE. HudValue (ModeHarness.ts, a held file) is a closed union — string | number |
// boolean | null | HudScoreCard[] | HudCue[] | HudPoster — with no "array of arbitrary objects" case, so a new chip
// shape cannot ride through it as one. The established way round that in this codebase is the one hud.kickZones and
// hud.rackets already use: a plain delimited string the host parses (components/games/timing-babylon.tsx). Chips
// follow it: encodeInstrumentChips produces that string, decodeInstrumentChips reads it back, and the pieces in
// between (buildInstrumentChips, songCategories) are ordinary pure functions a test can call directly.

import type { DanceStep } from '../../core/DanceCore';
import { danceMove } from '../moves';

export type InstrumentChipState = 'earned' | 'ducked' | 'fel';

export interface InstrumentChip {
  /** The stem category id (StemBand.ts's StemCategory, e.g. 'bounce') — stable across a song, used as the React key. */
  id: string;
  /** The instrument name shown on the chip (StemBand.CATEGORY_STEM, e.g. 'DRUMS'). */
  label: string;
  state: InstrumentChipState;
  /** The band's current level for this stem, 0..1 (StemBand.level) — drives how lit an 'earned' chip reads. */
  level: number;
}

/** The same "has it been earned at all" line DanceMode's onJudged already draws for the join banner
 *  (`before === 0 && band.level(cat) > 0`): anything above dead silent counts, because StemBand's own gain math
 *  (nextStemLevel, STEM_HIT_GAIN) never produces a value this small by accident. */
export const EARNED_LEVEL = 0;

/**
 * Which stem categories a routine actually calls for, read from the steps themselves (DANCE_LIBRARY resolves a
 * step's clipId to its category — the same lookup DanceMode's onJudged does per judged step, done once here for the
 * whole chart). Call this right after a track locks in (beginCountIn, before perf.setRoutine), on the exact array
 * handed to it — a shipped seed-generated routine and an exported "your song" routine (DanceExport.routineFromGroove)
 * both resolve through the same DANCE_LIBRARY, so this needs no special case for either source.
 */
export function songCategories(steps: readonly Pick<DanceStep, 'clipId'>[]): Set<string> {
  const cats = new Set<string>();
  for (const s of steps) {
    // MUSIC-SUITE P9 moves: the room's vocabulary (dance/moves.ts) — a charted captured move calls for its family's stem
    const cat = danceMove(s.clipId)?.category;
    if (cat) cats.add(cat);
  }
  return cats;
}

/**
 * The chip row for the current song: `order` is every stem id the band knows about (StemBand's Object.keys(
 * CATEGORY_STEM), so the row's order never reshuffles frame to frame), `labels` names each one, `inSong` is
 * songCategories()'s answer for the loaded chart, and `levels` is the band's live level per id (0 for one never
 * judged, or with no band at all — the pick screen, or an SSR pass with no AudioContext).
 *
 * A category outside `inSong` is always 'fel', whatever its level reads (a category the chart never calls for can
 * never be judged, so it can never earn a level above 0 through this run — 'fel' cannot be reached by dancing badly,
 * only by the song's own shape). Everything else is 'earned' once its level clears EARNED_LEVEL, else 'ducked'.
 */
export function buildInstrumentChips(
  order: readonly string[],
  labels: Readonly<Record<string, string>>,
  inSong: ReadonlySet<string>,
  levels: Readonly<Record<string, number>>,
): InstrumentChip[] {
  return order.map((id) => {
    const level = levels[id] ?? 0;
    const state: InstrumentChipState = !inSong.has(id) ? 'fel' : level > EARNED_LEVEL ? 'earned' : 'ducked';
    return { id, label: labels[id] ?? id.toUpperCase(), state, level };
  });
}

const FIELD_SEP = ':';
const CHIP_SEP = '|';

/** Chip ids and labels are single words (StemBand's CATEGORY_STEM values are all one word: DRUMS, BASS, …) — no
 *  separator ever needs escaping, but a defensive strip keeps a future label change from ever corrupting the string. */
const safe = (s: string): string => s.replace(/[:|]/g, '');

/** Encode for HudValue (a plain string field, `hud.instruments`) — the host (timing-babylon.tsx) decodes it back. */
export function encodeInstrumentChips(chips: readonly InstrumentChip[]): string {
  return chips.map((c) => [safe(c.id), safe(c.label), c.state, c.level.toFixed(3)].join(FIELD_SEP)).join(CHIP_SEP);
}

/** The inverse of encodeInstrumentChips. Tolerant by design: a HUD field can arrive empty (before the first chip
 *  row is published), undefined (a mode that never sets it — every non-dance timing sport), or, in principle,
 *  truncated mid-frame by a future caller; any row that does not parse to exactly 4 fields with a known state is
 *  dropped rather than thrown, so a render never crashes on a HUD string. */
export function decodeInstrumentChips(encoded: string | null | undefined): InstrumentChip[] {
  if (!encoded) return [];
  const out: InstrumentChip[] = [];
  for (const part of encoded.split(CHIP_SEP)) {
    if (!part) continue;
    const [id, label, state, levelStr] = part.split(FIELD_SEP);
    if (!id || !label || (state !== 'earned' && state !== 'ducked' && state !== 'fel')) continue;
    const level = Number(levelStr);
    out.push({ id, label, state, level: Number.isFinite(level) ? level : 0 });
  }
  return out;
}
