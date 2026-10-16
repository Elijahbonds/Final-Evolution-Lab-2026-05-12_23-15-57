// MULTI-SELECT AND GROUP EDITS (docs/NEXUS-STUDIO.md §11). Pure: the selection is UI state (an ordered list of object ids,
// the last one the "primary"), and every group edit is ONE command on the same stack a single edit uses — so a group move,
// a group hide or a group delete is one undo step, and undo is exact because each op records its own inverse.
//
// THE GROUP GIZMO. The viewport moves, turns and scales a pivot at the selection's centre; the members follow it rigidly:
//   p' = pivot + move + R(turn) · (scale · (p − pivot)),   ry' = ry + turn,   s' = s · scale
// A crowd stand keeps its own `s` (its width and rows ARE its size; the transform's scale does not stretch people), but its
// spot still moves with the group. Snapping applies to the GROUP's delta (a grid step of move, a turn step, a scale step),
// never to each member, so the members keep their spacing exactly. Locked members do not move.

import type { Command, ObjectPatch } from './commands';
import { LIMITS, wrapAngle, type StudioObject, type StudioTransform, type StudioVenue, type V3 } from './doc';
import { snapAngle, snapValue, type SnapSettings } from './snap';

// ── the selection ───────────────────────────────────────────────────────────────────────────────────────────────────

export type SelectMode = 'replace' | 'toggle' | 'add';

/** A click on `id` (null = empty space) with `mode`: replace the selection, toggle it in or out, or add it. */
export function clickSelect(sel: readonly string[], id: string | null, mode: SelectMode): string[] {
  if (id === null) return mode === 'replace' ? [] : [...sel];
  if (mode === 'replace') return [id];
  if (sel.includes(id)) return mode === 'toggle' ? sel.filter((x) => x !== id) : [...sel.filter((x) => x !== id), id];
  return [...sel, id];
}

/** Add (or, `replace`, take exactly) the ids a box drew round; the order the box found them in. */
export function boxSelect(sel: readonly string[], ids: readonly string[], mode: 'replace' | 'add'): string[] {
  if (mode === 'replace') return [...new Set(ids)];
  const out = [...sel];
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

/**
 * The scene tree's click: plain replaces; Ctrl/⌘ toggles; Shift takes the range from the anchor (the last plain or toggled
 * click) to `id` in the tree's own order, added to what Ctrl had already picked.
 */
export function treeSelect(order: readonly string[], sel: readonly string[], id: string, mods: { shift?: boolean; toggle?: boolean }, anchor: string | null): string[] {
  if (mods.shift && anchor && order.includes(anchor) && order.includes(id)) {
    const a = order.indexOf(anchor), b = order.indexOf(id);
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    return boxSelect(mods.toggle ? sel : [], range, 'add');
  }
  return clickSelect(sel, id, mods.toggle ? 'toggle' : 'replace');
}

/** The ids that still name an object in `v`, in the selection's order (an undo or a venue switch can take one away). */
export function liveSelection(v: StudioVenue | null, sel: readonly string[]): string[] {
  if (!v) return [];
  const ids = new Set(v.objects.map((o) => o.id));
  return sel.filter((id) => ids.has(id));
}

/** The selected objects in the venue's own order. */
export function selectedObjects(v: StudioVenue, sel: readonly string[]): StudioObject[] {
  const set = new Set(sel);
  return v.objects.filter((o) => set.has(o.id));
}

/** Screen rectangle (any two corners) → the points inside it. Pure: the viewport projects each object to the canvas. */
export function inRect(points: ReadonlyArray<{ id: string; x: number; y: number }>, a: { x: number; y: number }, b: { x: number; y: number }): string[] {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  return points.filter((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1).map((p) => p.id);
}

// ── the group's frame ───────────────────────────────────────────────────────────────────────────────────────────────

/** The centre of a group: the middle of its positions' bounding box (the box, not the mean, so one far object does not drag
 *  the pivot off the cluster). Empty → the origin. */
export function groupCentre(objects: ReadonlyArray<Pick<StudioObject, 't'>>): V3 {
  if (!objects.length) return [0, 0, 0];
  const lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity];
  for (const o of objects) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], o.t.p[i]); hi[i] = Math.max(hi[i], o.t.p[i]); }
  return [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
}

/** A rigid change of the group about its pivot: a move (metres), a turn about y (radians), a uniform scale. */
export interface GroupDelta { move: V3; turn: number; scale: number }
export const NO_DELTA: GroupDelta = { move: [0, 0, 0], turn: 0, scale: 1 };

const r6 = (n: number): number => { const r = Math.round(n * 1e6) / 1e6; return Object.is(r, -0) ? 0 : r; };
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Snap a group's delta: the move to the grid step (x, z; y is left free, as for one object), the turn, the scale step. */
export function snapDelta(d: GroupDelta, s: SnapSettings): GroupDelta {
  if (!s.on) return { move: [...d.move] as V3, turn: wrapAngle(d.turn), scale: d.scale };
  return {
    move: [snapValue(d.move[0], s.move), d.move[1], snapValue(d.move[2], s.move)],
    turn: snapAngle(d.turn, s.turn),
    scale: Math.max(s.scale, snapValue(d.scale, s.scale)),   // a snapped scale is a step, never 0
  };
}

/** One member's transform after the group's change about `pivot`, clamped to the document's limits. */
export function applyDelta(o: Pick<StudioObject, 't' | 'type'>, pivot: V3, d: GroupDelta): StudioTransform {
  const k = d.scale > 0 && Number.isFinite(d.scale) ? d.scale : 1;
  const dx = (o.t.p[0] - pivot[0]) * k, dy = (o.t.p[1] - pivot[1]) * k, dz = (o.t.p[2] - pivot[2]) * k;
  // Babylon's yaw: a turn θ about +y takes (x, z) to (x cos θ + z sin θ, −x sin θ + z cos θ)
  const c = Math.cos(d.turn), s = Math.sin(d.turn);
  const p: V3 = [
    clamp(r6(pivot[0] + d.move[0] + dx * c + dz * s), -LIMITS.reach, LIMITS.reach),
    clamp(r6(pivot[1] + d.move[1] + dy), LIMITS.heightMin, LIMITS.heightMax),
    clamp(r6(pivot[2] + d.move[2] - dx * s + dz * c), -LIMITS.reach, LIMITS.reach),
  ];
  return {
    p,
    ry: r6(wrapAngle(o.t.ry + d.turn)),
    s: o.type === 'crowdStand' ? o.t.s : clamp(r6(o.t.s * k), LIMITS.scaleMin, LIMITS.scaleMax),
  };
}

/** The members a group edit may move: the unlocked ones. */
export const movable = (objects: readonly StudioObject[]): StudioObject[] => objects.filter((o) => !o.locked);

/**
 * ONE command for a whole group's move / turn / scale (a gizmo drag on release, a nudge, a typed group offset). Locked members
 * stay where they are. Null when nothing would change. `group` coalesces a gesture (the nudge keys); a drag needs none.
 */
export function groupTransformCommand(v: StudioVenue, ids: readonly string[], d: GroupDelta, opts: { pivot?: V3; label?: string; group?: string } = {}): Command | null {
  const members = movable(selectedObjects(v, ids));
  if (!members.length) return null;
  const pivot = opts.pivot ?? groupCentre(members);
  const ops: Command['ops'] = [];
  for (const o of members) {
    const t = applyDelta(o, pivot, d);
    if (JSON.stringify(t) === JSON.stringify(o.t)) continue;
    ops.push({ op: 'patchObject', venueId: v.id, id: o.id, patch: { t } });
  }
  if (!ops.length) return null;
  const what = members.length === 1 ? members[0].name : `${members.length} objects`;
  const verb = d.turn !== 0 && d.scale === 1 && !d.move.some((x) => x !== 0) ? 'Turn' : d.scale !== 1 && d.turn === 0 && !d.move.some((x) => x !== 0) ? 'Scale' : 'Move';
  return { label: opts.label ?? `${verb} ${what}`, ...(opts.group ? { group: opts.group } : {}), ops };
}

/** Hide or lock (or show / unlock) a whole selection in one step: if any member is off, all go on; else all go off. */
export function groupFlagCommand(v: StudioVenue, ids: readonly string[], key: 'hidden' | 'locked'): Command | null {
  const members = selectedObjects(v, ids);
  if (!members.length) return null;
  const on = members.some((o) => !o[key]);
  const change = members.filter((o) => !!o[key] !== on);
  const verb = key === 'hidden' ? (on ? 'Hide' : 'Show') : (on ? 'Lock' : 'Unlock');
  return {
    label: `${verb} ${change.length === 1 ? change[0].name : `${change.length} objects`}`,
    ops: change.map((o) => ({ op: 'patchObject' as const, venueId: v.id, id: o.id, patch: { [key]: on ? true : undefined } as ObjectPatch })),
  };
}

/** Delete a selection in one step; locked members stay (they are locked against exactly this). */
export function groupDeleteCommand(v: StudioVenue, ids: readonly string[]): Command | null {
  const gone = selectedObjects(v, ids).filter((o) => !o.locked);
  if (!gone.length) return null;
  return { label: gone.length === 1 ? `Delete ${gone[0].name}` : `Delete ${gone.length} objects`, ops: gone.map((o) => ({ op: 'removeObject' as const, venueId: v.id, id: o.id })) };
}
