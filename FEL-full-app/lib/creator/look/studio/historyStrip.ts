// FEARLESS (CREATOR-PLAN phase 4d, 2026-10-06): the visible history strip, the before/after toggle and the "keep a copy"
// offer before a big change. Pure, over the Closet's per-slot History<CreatorSlotV2> (history.ts).
//
// THE STRIP. Every step the history holds (the past, the present, the future), each labelled with what changed going
// into it ("Added a horn", "Paint: new stamp", "Skin colour"), so a player can see what undo will take back and jump
// straight to any step. A jump is a run of undos or redos, so the future is kept until the next edit, as everywhere.
//
// A BIG CHANGE. Randomising, a pasted look, suit mode, a new body or several parts and layers at once. When one lands,
// the Studio offers to keep the look from before it as a new slot (5 slots max: when they are full it says undo still
// has it) — a non-blocking offer, never a confirm in front of the change.

import { redo, undo, type History } from '../history';
import type { CreatorDoc, CreatorPart, CreatorSlotV2, PaintLayer } from '../doc';
import { SHAPE_LABELS } from '../parts';
import { layerName } from '../paint';
import { CLOTH_STYLE_LABELS } from '../clothes';
import { addSlot, canAddSlot, newSlotId, newSlotLabel } from '../slots';

export interface StripEntry {
  /** steps from the present: −2 is two undos back, 1 is one redo forward */
  offset: number;
  label: string;
  current: boolean;
}

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const byId = <T extends { id: string }>(list: readonly T[]) => new Map(list.map((x) => [x.id, x]));

function partsChange(a: readonly CreatorPart[], b: readonly CreatorPart[]): string | null {
  if (sameJson(a, b)) return null;
  const A = byId(a), B = byId(b);
  const added = b.filter((p) => !A.has(p.id)), removed = a.filter((p) => !B.has(p.id));
  if (added.length === 1 && !removed.length) return `Added a ${SHAPE_LABELS[added[0].shape].toLowerCase()}`;
  if (added.length > 1 && !removed.length) return `Added ${added.length} parts`;
  if (removed.length === 1 && !added.length) return `Removed a ${SHAPE_LABELS[removed[0].shape].toLowerCase()}`;
  if (removed.length > 1 && !added.length) return `Removed ${removed.length} parts`;
  const changed = b.filter((p) => A.has(p.id) && !sameJson(A.get(p.id), p));
  if (changed.length === 1) {
    const o = A.get(changed[0].id)!, n = changed[0];
    const what = o.bone !== n.bone ? 'Moved' : !sameJson(o.pos, n.pos) ? 'Moved' : !sameJson(o.rot, n.rot) ? 'Turned' : !sameJson(o.scale, n.scale) ? 'Resized'
      : o.colour !== n.colour || o.colour2 !== n.colour2 ? 'Recoloured' : o.mirror !== n.mirror ? 'Mirrored' : 'Edited';
    return `${what} ${SHAPE_LABELS[n.shape].toLowerCase()}`;
  }
  return 'Parts';
}

function paintChange(a: readonly PaintLayer[], b: readonly PaintLayer[]): string | null {
  if (sameJson(a, b)) return null;
  const A = byId(a), B = byId(b);
  const added = b.filter((l) => !A.has(l.id)), removed = a.filter((l) => !B.has(l.id));
  if (added.length === 1 && !removed.length) return `Paint: new ${layerName(added[0]).toLowerCase()}`;
  if (removed.length === 1 && !added.length) return `Paint: removed ${layerName(removed[0]).toLowerCase()}`;
  const changed = b.filter((l) => A.has(l.id) && !sameJson(A.get(l.id), l));
  if (changed.length === 1) {
    const o = A.get(changed[0].id)!, n = changed[0];
    if (!sameJson(o.at, n.at) || o.region !== n.region) return `Paint: placed ${layerName(n).toLowerCase()}`;
    return `Paint: ${layerName(n).toLowerCase()}`;
  }
  if (!added.length && !removed.length && a.length === b.length && a.some((l, i) => l.id !== b[i].id)) return 'Paint: reordered';
  return 'Paint';
}

/** Phase 4e: what changed in the code-built clothes. */
function clothesChange(a: CreatorDoc['clothes'], b: CreatorDoc['clothes']): string | null {
  const x = a ?? [], y = b ?? [];
  if (sameJson(x, y)) return null;
  const A = byId(x), B = byId(y);
  const added = y.filter((c) => !A.has(c.id)), removed = x.filter((c) => !B.has(c.id));
  if (added.length === 1 && !removed.length) return `Put on ${CLOTH_STYLE_LABELS[added[0].style].toLowerCase()}`;
  if (removed.length === 1 && !added.length) return `Took off ${CLOTH_STYLE_LABELS[removed[0].style].toLowerCase()}`;
  const changed = y.filter((c) => A.has(c.id) && !sameJson(A.get(c.id), c));
  if (changed.length === 1) {
    const o = A.get(changed[0].id)!, n = changed[0];
    return `${o.colour !== n.colour || o.colour2 !== n.colour2 ? 'Recoloured' : 'Changed'} ${CLOTH_STYLE_LABELS[n.style].toLowerCase()}`;
  }
  if (!added.length && !removed.length && x.length === y.length && x.some((c, i) => c.id !== y[i].id)) return 'Clothing: layers';
  return 'Clothing';
}

function docChange(a: CreatorDoc, b: CreatorDoc): string | null {
  return partsChange(a.parts, b.parts)
    ?? clothesChange(a.clothes, b.clothes)
    ?? (a.flags.suit !== b.flags.suit ? (b.flags.suit ? 'Suit on' : 'Suit off') : null)
    ?? paintChange(a.paint, b.paint)
    ?? (!sameJson(a.marks, b.marks) ? 'Drawing' : null)
    ?? (!sameJson(a.colours, b.colours) ? 'Kit colours' : null)
    ?? (!sameJson(a.shape.face, b.shape.face) ? 'Face sculpt' : null)
    ?? (!sameJson(a.shape.body, b.shape.body) || !sameJson(a.shape.girth, b.shape.girth) ? 'Shape' : null)
    ?? (!sameJson(a.eyes, b.eyes) ? 'Eyes' : null)
    ?? (!sameJson(a.flags.hide, b.flags.hide) ? 'Hide' : null);
}

const BASE_LABELS: Record<string, string> = {
  skinTone: 'Skin colour', hairColor: 'Hair colour', eyeColor: 'Eye colour', hairStyle: 'Hair style', faceShape: 'Face shape',
  eyeShape: 'Eye shape', brows: 'Brows', mouth: 'Mouth', nose: 'Nose',
};

/** What changed from one step to the next, as a player reads it. */
export function describeStep(a: CreatorSlotV2, b: CreatorSlotV2): string {
  if (a.body !== b.body) return 'Body';
  const base = Object.keys({ ...a.base, ...b.base }).filter((k) => (a.base as Record<string, unknown>)[k] !== (b.base as Record<string, unknown>)[k]);
  if (base.length === 1) return BASE_LABELS[base[0]] ?? 'Face';
  if (base.length > 1) return 'Look';
  return docChange(a.doc, b.doc)
    ?? (!sameJson(a.sliders, b.sliders) ? 'Face sculpt' : null)
    ?? (!sameJson(a.frame, b.frame) ? 'Height & build' : null)
    ?? (!sameJson(a.presentation, b.presentation) ? 'Studio size' : null)
    ?? (!sameJson(a.equipped, b.equipped) ? 'Worn items' : null)
    ?? (a.label !== b.label ? 'Name' : null)
    ?? 'Edit';
}

/** The strip's entries, oldest first: the start, every past step, the present, every redo step. */
export function stripEntries(h: History<CreatorSlotV2>): StripEntry[] {
  const all = [...h.past, h.present, ...h.future];
  const here = h.past.length;
  return all.map((s, i) => ({ offset: i - here, current: i === here, label: i === 0 ? 'Start' : describeStep(all[i - 1], s) }));
}

/** Jump `offset` steps (negative: back) — a run of undos or redos; past either end it stops there. */
export function jumpHistory<T>(h: History<T>, offset: number): History<T> {
  let out = h;
  for (let i = 0; i < Math.abs(Math.trunc(offset)); i++) {
    const next = offset < 0 ? undo(out) : redo(out);
    if (next === out) break;
    out = next;
  }
  return out;
}

/** The strip shows at most this many entries (the newest; it scrolls). */
export const STRIP_MAX = 40;
export function visibleEntries(entries: readonly StripEntry[], max = STRIP_MAX): StripEntry[] {
  if (entries.length <= max) return [...entries];
  const cur = entries.findIndex((e) => e.current);
  const start = Math.min(Math.max(0, cur - Math.floor(max / 2)), entries.length - max);
  return entries.slice(start, start + max);
}

// ── a big change ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** How many things a change touches. Each part or layer added, removed or changed counts one; a body, a suit flip, the
 *  base look's fields, the shape and the sliders count one each. */
export function changeSize(a: CreatorSlotV2, b: CreatorSlotV2): number {
  let n = 0;
  if (a.body !== b.body) n += 3;
  for (const k of Object.keys({ ...a.base, ...b.base })) if ((a.base as Record<string, unknown>)[k] !== (b.base as Record<string, unknown>)[k]) n++;
  const diff = <T extends { id: string }>(x: readonly T[], y: readonly T[]) => {
    const X = byId(x), Y = byId(y);
    let d = 0;
    for (const v of y) if (!X.has(v.id) || !sameJson(X.get(v.id), v)) d++;
    for (const v of x) if (!Y.has(v.id)) d++;
    return d;
  };
  n += diff(a.doc.parts, b.doc.parts) + diff(a.doc.paint, b.doc.paint) + diff(a.doc.clothes ?? [], b.doc.clothes ?? []);
  if (a.doc.flags.suit !== b.doc.flags.suit) n += 3;
  if (!sameJson(a.doc.shape, b.doc.shape)) n++;
  if (!sameJson(a.doc.colours, b.doc.colours)) n++;
  if (!sameJson(a.doc.eyes, b.doc.eyes)) n++;
  if (!sameJson(a.sliders, b.sliders)) n++;
  return n;
}

/** A change this size or bigger is a big change. TUNED (phase 4d): 4 — a randomise (base, shape, colours, eyes) or a
 *  cluster of spikes is big, one slider or one stamp is not. */
export const BIG_CHANGE = 4;
export const isBigChange = (a: CreatorSlotV2, b: CreatorSlotV2): boolean => changeSize(a, b) >= BIG_CHANGE;

/** Keep `before` (the look from before a big change) as a NEW slot after the others, labelled COPY n. Refused when the
 *  five slots are full (`full: true`; the change is still one undo away). The copy gets a fresh id, so it never collides
 *  with the slot it came from. */
export function keepCopy(slots: readonly CreatorSlotV2[], before: CreatorSlotV2): { slots: CreatorSlotV2[]; id: string } | { full: true } {
  if (!canAddSlot(slots)) return { full: true };
  const id = newSlotId(slots);
  const copy: CreatorSlotV2 = { ...JSON.parse(JSON.stringify(before)) as CreatorSlotV2, id, label: newSlotLabel(slots, 'COPY') };
  return { slots: addSlot(slots, copy), id };
}
