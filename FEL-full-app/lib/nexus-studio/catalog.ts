// THE ASSET BROWSER'S CATALOG: everything a creator can place, read off FEL's own data — the Kenney kits from their
// manifest (public/models/props/manifest.json) and every model a venue set already places (visual/venuePropSets.ts),
// the Meshy scans, the NexusWebScene dressing props, and the shared systems as placeable components (fixtures, crowd
// stands, decals, the camera's subject mark). catalog.test.ts holds every kit entry to a .glb on disk.
//
// `size` is the pick proxy's box (metres, before the object's scale): what the viewport hit-tests and the gizmo grabs.
// It is a reach, not a measurement — the model draws through the real VenueProps / meshyProps path.
//
// §11 KIT SCALE. A Kenney model is a toy-sized unit (the nature kit's palm is 1.36 m tall at scale 1; measured from the GLBs'
// POSITION bounds 2026-10-16), so every venue set places it scaled up — the nature kit at a median 4.6×. A kit item is placed
// at its kit's own median scale from VENUE_PROP_SETS (`kitScale`), and its proxy is the life-size reach divided by that scale,
// so a placed palm stands ~6 m tall inside a box its own size. (Before, items landed at 1× — a 1.4 m palm in a 7 m box.)

import manifest from '../../public/models/props/manifest.json';
import { VENUE_PROP_SETS } from '../babylon/visual/venuePropSets';
import {
  IDENTITY, MESHY_KEYS, SPEC_PROP_KINDS, newId,
  type StudioObject, type StudioTransform, type V3,
} from './doc';

export type CatalogGroup = 'Dressing' | 'Nature' | 'City' | 'Racing' | 'Arena' | 'Skate' | 'Venice' | 'Mini golf' | 'Scans' | 'Lights' | 'Crowd' | 'Ground marks' | 'Camera';

/** An object minus its id and transform, member by member (a plain Omit over the union would keep only the shared keys). */
export type ObjectProto = StudioObject extends infer O ? (O extends StudioObject ? Omit<O, 'id' | 't'> : never) : never;

export interface CatalogItem {
  id: string;
  label: string;
  group: CatalogGroup;
  /** One line under the label: where it comes from in FEL. */
  source: string;
  /** The object, minus its id and transform. */
  proto: ObjectProto;
  size: V3;
  /** §11: the scale it is placed at (a kit's venue-set median; 1 for everything else). */
  scale?: number;
}

const KIT_GROUP: Record<string, CatalogGroup> = {
  nature: 'Nature', 'city-suburban': 'City', racing: 'Racing', 'mini-arena': 'Arena', 'mini-skate': 'Skate', minigolf: 'Mini golf', venice: 'Venice',
};

/** "tree_palmDetailedTall" → "Palm detailed tall". */
export function prettyModel(model: string): string {
  const words = model.replace(/^(tree|plant|rock)_/, (m) => (m === 'tree_' ? '' : `${m.slice(0, -1)} `))
    .replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A pick proxy's reach for a kit model, by what its name says it is. */
export function kitSize(model: string): V3 {
  const m = model.toLowerCase();
  if (/grandstand/.test(m)) return [12, 6, 6];
  if (/palm/.test(m)) return [2.5, 7, 2.5];
  if (/pine|tree|oak/.test(m)) return [3, 6, 3];
  if (/lightpost|overheadlights|tower/.test(m)) return [1, 7, 1];
  if (/rock_large|rock_tall/.test(m)) return [2.5, 2.5, 2.5];
  if (/rock|bush|grass|plant/.test(m)) return [1.2, 1, 1.2];
  if (/fence|barrier|wall/.test(m)) return [4, 1.4, 0.5];
  if (/tent/.test(m)) return [4, 3, 4];
  if (/pier|billboard|sail/.test(m)) return [10, 6, 2];
  if (/flag|banner/.test(m)) return [0.8, 3.5, 0.8];
  if (/statue|column/.test(m)) return [1.5, 4, 1.5];
  return [1.6, 1.6, 1.6];
}

const SPEC_SIZE: Record<(typeof SPEC_PROP_KINDS)[number], V3> = {
  lamp: [0.6, 5, 0.6], banner: [4, 2.2, 0.3], podium: [3, 1, 3], palm: [1.6, 7, 1.6], crowdTier: [22, 4.5, 6],
  flag: [0.6, 3, 0.6], wall: [6, 3, 0.5], ramp: [3, 1.5, 4], beam: [0.5, 0.5, 6],
};
const SPEC_LABEL: Record<(typeof SPEC_PROP_KINDS)[number], string> = {
  lamp: 'Stage lamp', banner: 'Banner', podium: 'Podium', palm: 'Palm (stub)', crowdTier: 'Painted grandstand',
  flag: 'Flag', wall: 'Wall', ramp: 'Ramp', beam: 'Beam',
};
const MESHY_SIZE: Partial<Record<(typeof MESHY_KEYS)[number], V3>> = {
  hoopbus: [3, 3.5, 9], sedan: [2, 1.6, 4.6], store: [8, 6, 6], stadium: [60, 20, 60], ballpark: [60, 15, 60], dojo: [14, 7, 14],
  shuttle: [3, 2.5, 6], goal: [7.5, 2.5, 2.5],
};

function kitModels(): Array<{ kit: string; model: string }> {
  const seen = new Set<string>();
  const out: Array<{ kit: string; model: string }> = [];
  const add = (kit: string, model: string) => { const k = `${kit}/${model}`; if (!seen.has(k) && KIT_GROUP[kit]) { seen.add(k); out.push({ kit, model }); } };
  for (const [kit, models] of Object.entries((manifest as { kits: Record<string, string[]> }).kits)) for (const m of models) add(kit, m);
  for (const set of Object.values(VENUE_PROP_SETS)) for (const p of set) add(p.kit, p.model);   // the venue sets' own extras (venice)
  return out;
}

let kitScales: Map<string, number> | null = null;
/** §11: the scale the venue sets place `kit`'s models at (their median, VENUE_PROP_SETS); 1 for a kit no set places. */
export function kitScale(kit: string): number {
  if (!kitScales) {
    const by = new Map<string, number[]>();
    for (const set of Object.values(VENUE_PROP_SETS)) for (const p of set) { const a = by.get(p.kit) ?? []; a.push(p.scale ?? 1); by.set(p.kit, a); }
    kitScales = new Map([...by].map(([k, v]) => { v.sort((a, b) => a - b); return [k, v[Math.floor(v.length / 2)]] as [string, number]; }));
  }
  return kitScales.get(kit) ?? 1;
}

let built: CatalogItem[] | null = null;

export function catalog(): CatalogItem[] {
  if (built) return built;
  const items: CatalogItem[] = [];
  for (const kind of SPEC_PROP_KINDS) {
    items.push({ id: `spec:${kind}`, label: SPEC_LABEL[kind], group: 'Dressing', source: 'NexusWebScene prop', proto: { type: 'specProp', kind, name: SPEC_LABEL[kind], ...(kind === 'lamp' ? { color: '#ffd9a0' } : {}) }, size: SPEC_SIZE[kind] });
  }
  for (const { kit, model } of kitModels()) {
    const label = prettyModel(model);
    const k = kitScale(kit), reach = kitSize(model);
    items.push({ id: `kit:${kit}/${model}`, label, group: KIT_GROUP[kit], source: `Kenney ${kit} kit (CC0)`, proto: { type: 'kitProp', kit, model, name: label }, size: [reach[0] / k, reach[1] / k, reach[2] / k], ...(k !== 1 ? { scale: k } : {}) });
  }
  for (const key of MESHY_KEYS) {
    const label = prettyModel(key);
    items.push({ id: `meshy:${key}`, label, group: 'Scans', source: 'Meshy scan', proto: { type: 'meshyProp', key, name: label }, size: MESHY_SIZE[key] ?? [1.2, 1.2, 1.2] });
  }
  items.push(
    { id: 'fixture:flood', label: 'Floodlight', group: 'Lights', source: 'FixtureLights · flood', proto: { type: 'fixture', role: 'flood', color: '#f4f7ff', height: 12, name: 'Floodlight' }, size: [1.6, 12.5, 1] },
    { id: 'fixture:lamp', label: 'Lamp post', group: 'Lights', source: 'FixtureLights · lamp', proto: { type: 'fixture', role: 'lamp', color: '#ffd9a0', height: 4.5, name: 'Lamp post' }, size: [0.6, 5, 0.6] },
    { id: 'fixture:bulb', label: 'Lantern', group: 'Lights', source: 'FixtureLights · bulb', proto: { type: 'fixture', role: 'bulb', color: '#ffb36b', height: 2.6, name: 'Lantern' }, size: [0.4, 2.8, 0.4] },
    { id: 'crowd:bleacher', label: 'Bleacher (seated)', group: 'Crowd', source: 'visual/crowd · StandSpec', proto: { type: 'crowdStand', width: 16, rows: 4, step: [0.72, 0.42], posture: 'seated', benches: true, gaps: 0.12, name: 'Bleacher' }, size: [16, 2.2, 3] },
    { id: 'crowd:standing', label: 'Standing crowd', group: 'Crowd', source: 'visual/crowd · StandSpec', proto: { type: 'crowdStand', width: 10, rows: 3, step: [0.6, 0], posture: 'standing', benches: false, gaps: 0.2, name: 'Standing crowd' }, size: [10, 2, 1.8] },
    { id: 'decal:scuff', label: 'Scuff', group: 'Ground marks', source: 'GroundDecals · scuff', proto: { type: 'decal', kind: 'scuff', name: 'Scuff' }, size: [0.5, 0.05, 1.1] },
    { id: 'decal:foot', label: 'Footprint', group: 'Ground marks', source: 'GroundDecals · foot', proto: { type: 'decal', kind: 'foot', name: 'Footprint' }, size: [0.2, 0.05, 0.35] },
    { id: 'decal:carve', label: 'Carve line', group: 'Ground marks', source: 'GroundDecals · carve', proto: { type: 'decal', kind: 'carve', name: 'Carve line' }, size: [0.5, 0.05, 1.6] },
    { id: 'decal:tyre', label: 'Tyre marks', group: 'Ground marks', source: 'GroundDecals · tyre', proto: { type: 'decal', kind: 'tyre', name: 'Tyre marks' }, size: [1.62, 0.05, 2.2] },
    { id: 'camera:subject', label: 'Play subject', group: 'Camera', source: 'CameraDirector · intro / replay subject', proto: { type: 'cameraMark', role: 'subject', name: 'Play subject' }, size: [0.7, 1.8, 0.7] },
  );
  built = items;
  return items;
}

export function catalogItem(id: string): CatalogItem | null { return catalog().find((c) => c.id === id) ?? null; }

/** The catalog id an object would have come from (for its proxy size and the inspector's "source" line). */
export function catalogIdOf(o: StudioObject): string {
  switch (o.type) {
    case 'specProp': return `spec:${o.kind}`;
    case 'kitProp': return `kit:${o.kit}/${o.model}`;
    case 'meshyProp': return `meshy:${o.key}`;
    case 'fixture': return `fixture:${o.role}`;
    case 'crowdStand': return o.posture === 'standing' ? 'crowd:standing' : 'crowd:bleacher';
    case 'decal': return `decal:${o.kind}`;
    case 'cameraMark': return 'camera:subject';
  }
}

/**
 * The proxy box for an object: its size and where the box's centre sits in the object's own frame. A crowd stand's box
 * follows its rows (its origin is the front row's edge, the rows climb back from it); a fixture's, its height.
 */
export function proxyBox(o: StudioObject): { size: V3; centre: V3 } {
  if (o.type === 'crowdStand') {
    const depth = Math.max(0.6, o.rows * o.step[0]), h = Math.max(1.8, o.rows * o.step[1] + 1.6);
    return { size: [o.width, h, depth], centre: [0, h / 2, -depth / 2] };
  }
  if (o.type === 'fixture') return { size: [o.role === 'flood' ? 1.6 : 0.6, o.height + 0.5, o.role === 'flood' ? 1 : 0.6], centre: [0, (o.height + 0.5) / 2, 0] };
  const size = catalogItem(catalogIdOf(o))?.size ?? [1, 1, 1];
  return { size, centre: [0, size[1] / 2, 0] };
}

/** A new object from a catalog item, standing at `p`. */
export function instantiate(item: CatalogItem, p: V3 = [0, 0, 0], ry = 0): StudioObject {
  const t: StudioTransform = { ...IDENTITY, p: [...p] as V3, ry, s: item.scale ?? 1 };
  return { ...JSON.parse(JSON.stringify(item.proto)), id: newId(item.proto.type), t } as StudioObject;
}
