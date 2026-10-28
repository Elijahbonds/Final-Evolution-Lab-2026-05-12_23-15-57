// MAKE YOUR FIRST COURT (STUDIO-EASY, 2026-10-28; docs/STUDIO-EASY-AUDIT.md). The owner: "Gameplay needs to be really clean. All
// tools need to be accessible, easy to use." The audit measured a first visit opening on an empty venue with no first step said
// (Roblox Studio, Canva and Figma all open a first project on a guided template). This is the guide's pure half: three steps,
// each one tap, each one ordinary Studio command on the same undo stack a hand edit uses — so the guide teaches the real editor
// and Undo takes any step back.
//
//   1. Pick the light   — the venue's mood (Golden hour, Night game, Daylight)
//   2. Add lights and fans — the built-in Flood corner set, or the Bleacher pair turned to the sidelines
//   3. Watch it          — the broadcast walk-in intro, previewed in the viewport (reduced motion: framed, not flown)
//
// Nothing here changes the project format: the guide's own progress lives under its own device key (GUIDE_KEY), never in the
// project, so an old project opens exactly as before and an exported one carries nothing new.

import type { Command } from './commands';
import { LIMITS, type StudioMood, type StudioProject, type StudioVenue, type V3 } from './doc';
import { editVenue } from './edits';
import { builtInStamps, stampCopies } from './stamps';
import type { KV } from './storage';

/** The device key the guide keeps its state under: 'done' or 'skipped'. Absent = never finished. */
export const GUIDE_KEY = 'fel.nexusStudio.guide.v1';
export type GuideMark = 'done' | 'skipped';

export const FIRST_COURT_TITLE = 'Make your first court';

/** Step 1's three lights: the moods that read most different on the court. */
export const GUIDE_LIGHTS: ReadonlyArray<{ mood: StudioMood; label: string }> = [
  { mood: 'goldenHour', label: 'Golden hour' },
  { mood: 'nightGame', label: 'Night game' },
  { mood: 'daylight', label: 'Daylight' },
];

/** Step 2's two adds. */
export type GuideAdd = 'floods' | 'fans';
export const GUIDE_ADDS: ReadonlyArray<{ id: GuideAdd; label: string }> = [
  { id: 'floods', label: 'Floodlights' },
  { id: 'fans', label: 'A stand of fans' },
];

/** The words on each step: a title (≤ 5 words) and one hint (≤ 12 words). docs/CUE-STYLE.md §1 "Prompt". */
export const GUIDE_STEPS = [
  { title: 'Pick the light', hint: 'One tap builds it all, or pick the light yourself.' },
  { title: 'Add lights and fans', hint: 'Tap one or both. Drag them later to move them.' },
  { title: 'Watch your court', hint: 'See it the way the game opens.' },
] as const;
export const GUIDE_DONE = { title: 'Your court is ready', hint: 'Play it now. It saves on this device as you go.' } as const;

/** Pure: should a visit open on the guide? Only an untouched first project, and only until the guide was finished or skipped. */
export function offerGuide(p: Pick<StudioProject, 'venues' | 'characters' | 'scripts'>, mark: string | null): boolean {
  if (mark === 'done' || mark === 'skipped') return false;
  return p.venues.length === 1 && p.venues[0].objects.length === 0 && p.characters.length === 0 && p.scripts.length === 0;
}

export function readGuideMark(kv: KV | null): GuideMark | null {
  try { const v = kv?.getItem(GUIDE_KEY); return v === 'done' || v === 'skipped' ? v : null; } catch { return null; }
}
export function writeGuideMark(kv: KV | null, mark: GuideMark | null): void {
  try { if (!kv) return; if (mark) kv.setItem(GUIDE_KEY, mark); else kv.removeItem(GUIDE_KEY); } catch { /* storage can throw: the guide just shows again */ }
}

/** Pure: has step 2 happened (a light or a stand is in the venue, however it got there)? */
export function hasLightsOrFans(v: Pick<StudioVenue, 'objects'>): boolean {
  return v.objects.some((o) => o.type === 'fixture' || o.type === 'crowdStand');
}

/** Pure: the step a guide is on: 0, 1, 2, or 3 = done. `picked` and `watched` are the guide's own taps. */
export function guideStep(v: Pick<StudioVenue, 'objects'>, s: { picked: boolean; watched: boolean }): 0 | 1 | 2 | 3 {
  if (!s.picked) return 0;
  if (!hasLightsOrFans(v)) return 1;
  return s.watched ? 3 : 2;
}

/** Step 1: one undo step (the inspector's own mood edit). */
export function lightCommand(v: StudioVenue, mood: StudioMood): Command {
  return { ...editVenue(v, { mood }, 'mood'), label: `Light: ${GUIDE_LIGHTS.find((l) => l.mood === mood)?.label ?? mood}` };
}

const ORIGIN: V3 = [0, 0, 0];

/**
 * Step 2: a built-in stamp placed round the court, one undo step. Floods: the corner set as built (36 × 24 m round the middle).
 * Fans: the bleacher pair turned a quarter (stampCopies' yaw) so the two stands sit on the sidelines (x = ±12 m) facing the
 * court, clear of the play camera behind the near baseline. Null when the venue is full.
 */
export function addCommand(v: StudioVenue, what: GuideAdd): { cmd: Command; ids: string[] } | null {
  const stamp = builtInStamps().find((s) => s.id === (what === 'floods' ? 'stamp:floodCorners' : 'stamp:bleacherPair'));
  if (!stamp) return null;
  const objects = stampCopies(stamp, ORIGIN, what === 'fans' ? Math.PI / 2 : 0, new Set(v.objects.map((o) => o.id)));
  if (!objects.length || v.objects.length + objects.length > LIMITS.objects) return null;
  const label = GUIDE_ADDS.find((a) => a.id === what)?.label ?? stamp.name;
  return { cmd: { label: `Add ${label.toLowerCase()}`, ops: objects.map((object) => ({ op: 'addObject' as const, venueId: v.id, object })) }, ids: objects.map((o) => o.id) };
}

/** Step 3: the venue opens on the walk-in intro (so Play-test opens the same way), one undo step; null if it already does. */
export function introCommand(v: StudioVenue): Command | null {
  return v.intro === 'walkIn' ? null : editVenue(v, { intro: 'walkIn' }, 'intro');
}

/**
 * "Make it for me" (coordinator decision 2: one tap to a playable court): the three steps' night light, the floods, the fans on
 * the sidelines and the walk-in intro as ONE command — one Undo takes the whole court back. Null when the venue is too full.
 */
export function quickCourtCommand(v: StudioVenue): { cmd: Command; ids: string[] } | null {
  const floods = addCommand(v, 'floods');
  const fans = addCommand(v, 'fans');
  if (!floods || !fans || v.objects.length + floods.ids.length + fans.ids.length > LIMITS.objects) return null;
  const intro = introCommand(v);
  return {
    cmd: { label: 'Make a first court', ops: [...lightCommand(v, 'nightGame').ops, ...floods.cmd.ops, ...fans.cmd.ops, ...(intro?.ops ?? [])] },
    ids: [...floods.ids, ...fans.ids],
  };
}
