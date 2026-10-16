// PREFAB STAMPS (docs/NEXUS-STUDIO.md §11). Pure. A stamp is a small group of objects laid out about its own origin; placing
// one drops fresh copies (new ids, through the import sanitiser) centred on the view's centre, as ONE command.
//
// Two shelves: the BUILT-IN library below (built from the catalog, so every piece is a thing the asset browser can place and
// the export already knows), and the project's own (`StudioProject.stamps`, made by "Save selection as stamp", saved with the
// project and exported with its JSON).

import type { Command } from './commands';
import { LIMITS, newId, sanitizeObject, type StudioObject, type StudioProject, type StudioStamp, type StudioVenue, type V3 } from './doc';
import { catalogItem, instantiate } from './catalog';
import { groupCentre, selectedObjects } from './group';
import { snapTransform, type SnapSettings } from './snap';

/** One piece of a built-in stamp: a catalog item at a spot, turned. */
type Piece = [catalogId: string, p: V3, ry?: number];

/** The yaw that points a fixture at (x, z) back toward the stamp's origin (a flood tips toward its own +z). */
const facing = (x: number, z: number): number => Math.atan2(-x, -z);

function built(id: string, name: string, pieces: readonly Piece[]): StudioStamp {
  const objects: StudioObject[] = pieces.map(([cid, p, ry], i) => {
    const item = catalogItem(cid);
    if (!item) throw new Error(`stamp ${id}: no catalog item ${cid}`);
    const o = instantiate(item, p, ry ?? 0);
    o.id = `${id}_${i}`;
    return o;
  });
  return { id, name, objects };
}

const PALM = 'kit:nature/tree_palmDetailedTall';

/** The built-in shelf. Ids are stable (`stamp:*`) — they are never placed as-is (a placement re-mints every id). */
export function builtInStamps(): StudioStamp[] {
  return [
    built('stamp:lampRow', 'Lamp row', [-8, -4, 0, 4, 8].map((x): Piece => ['fixture:lamp', [x, 0, 0]])),
    // two seated bleachers across a 24 m gap, each facing the middle (a stand's fans face its front, local +z)
    built('stamp:bleacherPair', 'Bleacher pair', [['crowd:bleacher', [0, 0, -12], 0], ['crowd:bleacher', [0, 0, 12], Math.PI]]),
    // four floods on the corners of a 36 × 24 m box, each tipped at the middle
    built('stamp:floodCorners', 'Flood corner set', ([[-18, -12], [18, -12], [-18, 12], [18, 12]] as const).map(([x, z]): Piece => ['fixture:flood', [x, 0, z], facing(x, z)])),
    // two rows of palms 10 m apart, 6 m down the avenue
    built('stamp:palmAvenue', 'Palm avenue', [-5, 5].flatMap((x) => [-12, -6, 0, 6, 12].map((z): Piece => [PALM, [x, 0, z]]))),
    built('stamp:lanternString', 'Lantern string', [-5, -3, -1, 1, 3, 5].map((x): Piece => ['fixture:bulb', [x, 0, 0]])),
  ];
}

/** Every stamp a creator can place: the built-ins, then the project's own. */
export function allStamps(p: StudioProject): StudioStamp[] { return [...builtInStamps(), ...(p.stamps ?? [])]; }

/** "Save selection as stamp": the selection, re-centred on its own middle (x, z; heights as placed). Null for none. */
export function stampFromSelection(v: StudioVenue, ids: readonly string[], name: string, p: StudioProject): { cmd: Command; id: string } | null {
  const objects = selectedObjects(v, ids).slice(0, LIMITS.stampObjects);
  if (!objects.length) return null;
  if ((p.stamps?.length ?? 0) >= LIMITS.stamps) return null;
  const c = groupCentre(objects);
  const clean = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIMITS.name) || `Stamp ${(p.stamps?.length ?? 0) + 1}`;
  const stamp: StudioStamp = {
    id: newId('stamp'), name: clean,
    objects: objects.map((o) => {
      const copy = structuredClone(o);
      delete copy.locked; delete copy.hidden;
      copy.t = { ...copy.t, p: [o.t.p[0] - c[0], o.t.p[1], o.t.p[2] - c[2]] };
      return copy;
    }),
  };
  return { id: stamp.id, cmd: { label: `Save stamp “${clean}”`, ops: [{ op: 'addStamp', stamp }] } };
}

export function removeStampCommand(p: StudioProject, id: string): Command | null {
  const s = p.stamps?.find((x) => x.id === id);
  return s ? { label: `Delete stamp “${s.name}”`, ops: [{ op: 'removeStamp', id }] } : null;
}

export function renameStampCommand(id: string, name: string): Command {
  return { label: 'Rename stamp', group: `stamp:${id}:name`, ops: [{ op: 'patchStamp', id, patch: { name: name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, LIMITS.name) || 'Stamp' } }] };
}

/**
 * Place a stamp centred on `at` (snapped as a placement is), as ONE command: fresh ids, each piece through the import
 * sanitiser. Null when the venue has no room for all of it (LIMITS.objects) — a half-placed stamp is a broken one.
 */
export function placeStamp(v: StudioVenue, stamp: StudioStamp, at: V3, snap?: SnapSettings): { cmd: Command; ids: string[] } | null {
  if (!stamp.objects.length || v.objects.length + stamp.objects.length > LIMITS.objects) return null;
  const base = snap ? snapTransform({ p: at, ry: 0, s: 1 }, snap).p : at;
  const seen = new Set(v.objects.map((o) => o.id));
  const objects: StudioObject[] = [];
  for (const src of stamp.objects) {
    const o = sanitizeObject({ ...structuredClone(src), id: newId(src.type), t: { ...src.t, p: [base[0] + src.t.p[0], base[1] + src.t.p[1], base[2] + src.t.p[2]] } }, seen);
    if (o) objects.push(o);
  }
  if (!objects.length) return null;
  return { cmd: { label: `Place ${stamp.name}`, ops: objects.map((object) => ({ op: 'addObject' as const, venueId: v.id, object })) }, ids: objects.map((o) => o.id) };
}
