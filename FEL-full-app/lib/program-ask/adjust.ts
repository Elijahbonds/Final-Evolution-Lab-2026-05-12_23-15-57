// lib/program-ask/adjust.ts — PROGRAM-ASK (2026-11-02, coordinator review of the sample): progress INSIDE a block, and
// the band as the main lever.
//
// The checkpoint (./checkpoint.ts) decides the block. Between checkpoints, every exercise carries two plain lines the
// person acts on next session:
//   · "Too easy?" — a set ended with MORE reps left than its effort word: band tension first (step further from the
//     anchor, hold the band shorter, double it over), then a slower lowering or a pause, then the next library rung by
//     name (its progression link or harder variant);
//   · "Too hard?" — the reps fell short: the easier library entry by name (its regression link, or the incline / wall /
//     supported version of the same job), or a closer stance on the band.
// And every band exercise says where the band goes and where to stand (BAND SETUP), read from the movement.
//
// Pure. Client-safe.
import type { BandTension, SlotId } from './types';

/** Where the band goes, by movement. The words are FEL's; the movement is the library entry's tags and name. */
export function bandSetupFor(name: string, slot: SlotId, tension: BandTension | null, use: BandTension | null = null): string {
  const n = name.toLowerCase();
  let where: string;
  if (/pallof|anti-rotation/.test(n)) where = 'Anchor at chest height. Stand side-on and step out until the band pulls you toward the anchor.';
  else if (/pulldown|pull-down|straight-arm|pushdown|triceps pushdown/.test(n)) where = 'Anchor high: the top of a door or a high post. Kneel or stand back until the band is tight at the start.';
  else if (/face pull|pull[- ]apart|back fly|reverse fly/.test(n)) where = /face pull/.test(n) ? 'Anchor at face height. Step back until the band is tight with your arms straight.' : 'Hold the band in front at shoulder height, hands about shoulder-width apart.';
  else if (/\brow\b/.test(n) || slot === 'hpull') where = 'Anchor at chest height. Step back until the band is tight with your arms straight in front.';
  else if (/pull-through/.test(n)) where = 'Anchor low behind you, at ankle height. Face away and walk out until the band pulls your hands back between your legs.';
  else if (/good morning|romanian|\brdl\b|deadlift/.test(n)) where = 'Stand on the middle of the band, feet hip-width. Loop it behind your neck (good morning) or hold the ends (deadlift).';
  else if (/shoulder press|overhead|lateral raise|upright row|curl/.test(n)) where = 'Stand on the middle of the band, feet hip-width, ends in your hands.';
  else if (/push-?up|press/.test(n) && /resisted/.test(n)) where = 'Band across your upper back, an end under each hand.';
  else if (/squat|lunge|split/.test(n)) where = 'Stand on the band, ends looped over your shoulders or held at your shoulders: it pulls you down as you stand up.';
  else if (/hip lift|bridge|glute/.test(n)) where = 'Band across your hips, ends pinned under your hands on the floor.';
  else if (/calf/.test(n)) where = 'Stand on the band under the balls of your feet, ends held at your shoulders.';
  else if (/skull|triceps|overhead triceps/.test(n)) where = 'Anchor low behind you, or stand on one end and hold the other.';
  else where = 'Set it so the last 2 reps of each set are hard.';
  const t = tension === 'light' ? ' A light band: double it over or hold it shorter.' : tension === 'heavy' ? ' A heavy band: start closer to the anchor or hold it longer.' : '';
  return `Band setup: ${use ? `Use the ${use} band. ` : ''}${where}${use ? '' : t}`;
}

/**
 * PROGRAM-ASK-2: with a band SET, which band each job starts on — the heaviest for the legs and hips (the strongest
 * muscles), the middle one for the big upper-body pulls and presses, the lightest for small muscles and the trunk. FEL's
 * rule of thumb; the "Too easy? / Too hard?" lines move it from there.
 */
export function bandForJob(slot: SlotId, bands: readonly BandTension[]): BandTension | null {
  if (bands.length < 2) return null;
  const order = (['light', 'medium', 'heavy'] as const).filter((b) => bands.includes(b));
  const heavy = order[order.length - 1], light = order[0];
  const mid = order.length === 3 ? order[1] : heavy;
  if (['knee', 'single', 'hinge', 'calf'].includes(slot)) return heavy;
  if (['hpull', 'vpull', 'hpush', 'vpush'].includes(slot)) return mid;
  return light;
}

/** "Too easy?" — band tension first, then tempo, then the named next rung. */
export function harderLine(o: { band: boolean; anchored: boolean; timed: boolean; next: string | null }): string {
  const tension = o.anchored ? 'step further from the anchor' : 'hold the band shorter or double it over';
  const lever = o.timed
    ? (o.band ? `add tension (${tension}), then hold 10 s longer` : 'hold 10 s longer, then make the position longer or wider')
    : (o.band ? `${tension}; then lower for 3 s` : 'lower for 3 s and pause at the bottom');
  return `Too easy? Next session ${lever}${o.next ? `; then move to ${o.next}` : ''}.`;
}

/** "Too hard?" — the easier library entry by name, or a closer stance. */
export function easierLine(o: { band: boolean; anchored: boolean; timed: boolean; easier: string | null }): string {
  const tension = o.anchored ? 'stand closer to the anchor' : 'hold the band longer';
  if (o.easier) return `Reps falling short? Switch to ${o.easier}${o.band ? `, or ${tension}` : ''}.`;
  if (o.band) return `Reps falling short? ${tension.charAt(0).toUpperCase()}${tension.slice(1)}.`;
  return o.timed ? 'Too long to hold? Hold 10 s less and build back up.' : 'Reps falling short? Shorten the range a little and build back up.';
}

/** Names that say "an easier version of the same job". */
export const EASIER_NAME = /\b(incline|wall|supported|assisted|knee|kneeling|short|box|elevated hands|half)\b/i;
