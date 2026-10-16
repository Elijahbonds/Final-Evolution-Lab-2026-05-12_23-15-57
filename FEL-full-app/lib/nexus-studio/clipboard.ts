// COPY / PASTE / DUPLICATE (docs/NEXUS-STUDIO.md §11). Pure. A clip is a deep copy of the selected objects and the centre
// they were copied about; it lives in the editor's state (not the document), so it outlives a venue switch and pastes into
// any venue of the project.
//
// A paste is ONE command. Every pasted object gets a fresh id (`newId`, never the source's: a paste into the same venue would
// otherwise collide, and a paste into another venue would alias a fixture's light name), goes through the import path's own
// sanitiser (a clip is still data the editor did not just make), and arrives unlocked. It lands centred on the view's centre;
// when that would stack it exactly on the source (the same venue, the camera not moved) it is offset one grid step per paste.

import type { Command } from './commands';
import { LIMITS, newId, sanitizeObject, type StudioObject, type StudioVenue, type V3 } from './doc';
import { applyDelta, groupCentre, selectedObjects } from './group';

export const CLIP_KIND = 'nexus-studio-clip' as const;
/** How far each repeated paste over its source steps (metres, x and z). */
export const PASTE_OFFSET = 1;

export interface StudioClip {
  kind: typeof CLIP_KIND;
  /** The venue it was copied from (a paste back into it, unmoved, is offset). */
  fromVenue: string;
  /** Where it was copied about (the group's centre). */
  centre: V3;
  objects: StudioObject[];
  /** Pastes made from this clip so far (each repeat over the source steps one offset further). */
  pastes: number;
}

/** Copy the selection (in the venue's order). Null when nothing is selected. Hidden and locked objects are copied too. */
export function copySelection(v: StudioVenue, ids: readonly string[]): StudioClip | null {
  const objects = selectedObjects(v, ids);
  if (!objects.length) return null;
  return { kind: CLIP_KIND, fromVenue: v.id, centre: groupCentre(objects), objects: structuredClone(objects), pastes: 0 };
}

/**
 * Paste `clip` into `v`, centred on `at` (the view's centre). Returns the command, the new ids (the new selection) and the clip
 * with its paste count moved on. Null when the venue is full (LIMITS.objects) or the clip holds nothing readable.
 */
export function pasteClip(v: StudioVenue, clip: StudioClip, at: V3, opts: { label?: string } = {}): { cmd: Command; ids: string[]; clip: StudioClip } | null {
  if (!clip.objects.length) return null;
  const room = LIMITS.objects - v.objects.length;
  if (room < clip.objects.length) return null;
  const over = clip.fromVenue === v.id && Math.hypot(at[0] - clip.centre[0], at[2] - clip.centre[2]) < 0.5;
  const step = over ? (clip.pastes + 1) * PASTE_OFFSET : 0;
  const target: V3 = over ? [clip.centre[0] + step, clip.centre[1], clip.centre[2] + step] : [at[0], clip.centre[1], at[2]];
  const move: V3 = [target[0] - clip.centre[0], 0, target[2] - clip.centre[2]];
  const seen = new Set(v.objects.map((o) => o.id));
  const objects: StudioObject[] = [];
  for (const src of clip.objects) {
    const copy = sanitizeObject({ ...structuredClone(src), id: newId(src.type), t: applyDelta(src, clip.centre, { move, turn: 0, scale: 1 }) }, seen);
    if (!copy) continue;
    delete copy.locked;
    objects.push(copy);
  }
  if (!objects.length) return null;
  const what = objects.length === 1 ? objects[0].name : `${objects.length} objects`;
  return {
    cmd: { label: opts.label ?? `Paste ${what}`, ops: objects.map((object) => ({ op: 'addObject' as const, venueId: v.id, object })) },
    ids: objects.map((o) => o.id),
    clip: { ...clip, pastes: over ? clip.pastes + 1 : clip.pastes },
  };
}

/** Ctrl+D: copy the selection and paste it one offset over itself, in one step. */
export function duplicateSelection(v: StudioVenue, ids: readonly string[]): { cmd: Command; ids: string[] } | null {
  const clip = copySelection(v, ids);
  if (!clip) return null;
  const r = pasteClip(v, clip, clip.centre, { label: clip.objects.length === 1 ? `Duplicate ${clip.objects[0].name}` : `Duplicate ${clip.objects.length} objects` });
  return r ? { cmd: r.cmd, ids: r.ids } : null;
}
