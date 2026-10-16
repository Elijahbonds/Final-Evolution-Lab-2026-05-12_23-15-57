// THE EXPORT → MODE-LOAD CONTRACT (docs/NEXUS-STUDIO.md §2, §5). A Studio venue becomes a StudioVenueExport: plain,
// versioned JSON that a mode loads with `mountStudioVenue` (runtime.ts) — a PlaceLook over the mode's venue spec, the
// CC0 kit placements, the Meshy props, the named fixtures, the crowd stands, the decals, the weather and the camera's
// broadcast choices. Pure: no Babylon here (runtime.ts turns it into a scene), so the contract is tested in node.
//
// The export is the ONLY thing a mode reads. It is validated again on the way in (`sanitizeVenueExport`): the mode's
// side never trusts that the editor wrote it.

import {
  BACKDROPS, BASE_DRESSING, DECAL_KINDS, FIXTURE_ROLES, GROUND_KINDS, INTROS, LIMITS, MESHY_KEYS, MOODS, POSTURES,
  REPLAY_ANGLES, SPEC_PROP_KINDS, WEATHER_PICKS, clampNum, wrapAngle,
  type StudioBackdrop, type StudioDecalKind, type StudioFixtureRole, type StudioGroundKind, type StudioIntro,
  type StudioMeshyKey, type StudioMood, type StudioPosture, type StudioReplayAngle, type StudioSky, type StudioSpecPropKind,
  type StudioScript, type StudioVenue, type StudioWeather, type V3,
} from './doc';
import { targetOf } from './targets';
import { sanitizeCast, type ExportCast } from './cast';
import { sanitizeGraph, type ScriptGraph } from './scripts';

/** A script the mode runs (track 4): its id and the graph. Disabled scripts are not exported. */
export interface ExportScript extends ScriptGraph { id: string }
export const EXPORT_SCRIPTS_MAX = 16;

export const EXPORT_KIND = 'nexus-studio-venue' as const;
export const EXPORT_VERSION = 1 as const;

export interface ExportSpecProp { kind: StudioSpecPropKind; position: V3; rotationY: number; scale: number; color?: string }
export interface ExportKitProp { kit: string; model: string; at: V3; yaw: number; scale: number; tint?: string }
export interface ExportMeshyProp { key: StudioMeshyKey; at: V3; yaw: number; scale: number }
export interface ExportFixture { id: string; role: StudioFixtureRole; at: V3; yaw: number; height: number; color: string; scale: number }
export interface ExportStand { id: string; front: V3; yaw: number; width: number; rows: number; step: [number, number]; posture: StudioPosture; benches: boolean; gaps: number }
export interface ExportCrowd { stands: ExportStand[]; focus: V3; eye: V3; camera: { at: V3; into: [number, number]; margin: number } }
export interface ExportDecal { kind: StudioDecalKind; at: V3; yaw: number; scale: number }

export interface StudioVenueExport {
  kind: typeof EXPORT_KIND;
  version: typeof EXPORT_VERSION;
  venueId: string;
  name: string;
  /** The venue spec the look lays over, and the mode it was made for (a mode refuses another mode's venue). */
  spec: string;
  target: string;
  mood: StudioMood;
  intro: StudioIntro;
  replayAngles: StudioReplayAngle[];
  /** nexus/placeLooks.ts PlaceLook's fields, minus the dressing set (`baseDressing` + `kit` decide it at load). */
  look: { sky?: StudioSky; backdrop?: StudioBackdrop; paintedSky?: boolean; ground?: { color?: string; line?: string; kind?: StudioGroundKind }; props: ExportSpecProp[] };
  baseDressing: 'keep' | 'none';
  kit: ExportKitProp[];
  meshy: ExportMeshyProp[];
  fixtures: ExportFixture[];
  crowd: ExportCrowd | null;
  decals: ExportDecal[];
  weather: StudioWeather;
  glossyFloor: boolean;
  /** Where the play happens (the previews' subject); null = the target's own. */
  subject: V3 | null;
  /** Track 3: the decoded looks the venue casts (cast.ts). Absent = the player's own look. */
  cast?: ExportCast;
  /** Track 4: the project's enabled scripts (scripts.ts), run by the mode's script host. Absent = none. */
  scripts?: ExportScript[];
}

const r3 = (n: number): number => Math.round(n * 1000) / 1000;
const v3 = (p: V3): V3 => [r3(p[0]), r3(p[1]), r3(p[2])];

/** A Studio venue → what a mode loads. Hidden objects are left out; locked ones are in (locked is an editor state). `cast` is
 *  the venue's cast already decoded (cast.ts resolveCast: share codes decode asynchronously). */
export function exportVenue(v: StudioVenue, cast?: ExportCast | null, scripts?: readonly StudioScript[]): StudioVenueExport {
  const runs: ExportScript[] = (scripts ?? []).filter((x) => x.enabled && x.nodes.length).slice(0, EXPORT_SCRIPTS_MAX)
    .map((x) => ({ id: x.id, enabled: true, nodes: x.nodes.map((n) => ({ ...n, params: { ...n.params } })), edges: x.edges.map((e) => ({ ...e })) }));
  const live = v.objects.filter((o) => !o.hidden);
  const props: ExportSpecProp[] = [], kit: ExportKitProp[] = [], meshy: ExportMeshyProp[] = [];
  const fixtures: ExportFixture[] = [], stands: ExportStand[] = [], decals: ExportDecal[] = [];
  let subject: V3 | null = null;
  for (const o of live) {
    const at = v3(o.t.p), yaw = r3(o.t.ry), scale = r3(o.t.s);
    switch (o.type) {
      case 'specProp': props.push({ kind: o.kind, position: at, rotationY: yaw, scale, ...(o.color ? { color: o.color } : {}) }); break;
      case 'kitProp': kit.push({ kit: o.kit, model: o.model, at, yaw, scale, ...(o.tint ? { tint: o.tint } : {}) }); break;
      case 'meshyProp': meshy.push({ key: o.key, at, yaw, scale }); break;
      case 'fixture': fixtures.push({ id: o.id, role: o.role, at, yaw, height: r3(o.height), color: o.color, scale }); break;
      // a stand's width and rows ARE its size; the transform's scale does not stretch people
      case 'crowdStand': stands.push({ id: o.id, front: at, yaw, width: r3(o.width), rows: o.rows, step: [r3(o.step[0]), r3(o.step[1])], posture: o.posture, benches: o.benches, gaps: r3(o.gaps) }); break;
      case 'decal': decals.push({ kind: o.kind, at, yaw, scale }); break;
      case 'cameraMark': subject = at; break;
    }
  }
  const target = targetOf(v.base.target);
  const crowd: ExportCrowd | null = stands.length
    ? { stands, ...(target ? target.crowdView : { focus: [0, 1, 0] as V3, eye: [0, 4, 15] as V3, camera: { at: [0, 4, 15] as V3, into: [0, -1] as [number, number], margin: 5 } }) }
    : null;
  return {
    kind: EXPORT_KIND, version: EXPORT_VERSION,
    venueId: v.id, name: v.name, spec: v.base.spec, target: v.base.target,
    mood: v.mood, intro: v.intro, replayAngles: [...v.replayAngles],
    look: {
      ...(v.sky ? { sky: { ...v.sky } } : {}),
      ...(v.backdrop ? { backdrop: v.backdrop } : {}),
      ...(v.paintedSky ? { paintedSky: true } : {}),
      ...(v.ground ? { ground: { ...v.ground } } : {}),
      props,
    },
    baseDressing: v.baseDressing, kit, meshy, fixtures, crowd, decals,
    // §11: where the mode's weather is gameplay (targets.ts modeWeather) the venue does not set it
    weather: target?.modeWeather ? 'natural' : v.weather, glossyFloor: v.glossyFloor, subject,
    ...(cast ? { cast } : {}),
    ...(runs.length ? { scripts: runs } : {}),
  };
}

// ── the mode's side: untrusted JSON → an export ─────────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const HEX = /^#[0-9a-fA-F]{6}$/;
const KEY = /^[A-Za-z0-9_:-]{1,64}$/;
const PART = /^[A-Za-z0-9_-]{1,64}$/;
const hex = (x: unknown): string | undefined => (typeof x === 'string' && HEX.test(x) ? x.toLowerCase() : undefined);
const oneOf = <T extends string>(x: unknown, list: readonly T[]): T | undefined => (typeof x === 'string' && (list as readonly string[]).includes(x) ? (x as T) : undefined);
const pos = (x: unknown): V3 => {
  const a = Array.isArray(x) ? x : [];
  return [clampNum(a[0], -LIMITS.reach, LIMITS.reach, 0), clampNum(a[1], LIMITS.heightMin, LIMITS.heightMax, 0), clampNum(a[2], -LIMITS.reach, LIMITS.reach, 0)];
};
const yawOf = (x: unknown): number => wrapAngle(clampNum(x, -1e6, 1e6, 0));
const scaleOf = (x: unknown): number => clampNum(x, LIMITS.scaleMin, LIMITS.scaleMax, 1);
function list<T>(x: unknown, max: number, f: (e: Json) => T | null): T[] {
  const out: T[] = [];
  for (const e of Array.isArray(x) ? x : []) { if (out.length >= max) break; if (!isObj(e)) continue; const v = f(e); if (v) out.push(v); }
  return out;
}

export function sanitizeVenueExport(raw: unknown): StudioVenueExport | null {
  if (!isObj(raw) || raw.kind !== EXPORT_KIND || raw.version !== EXPORT_VERSION) return null;
  if (typeof raw.venueId !== 'string' || !KEY.test(raw.venueId)) return null;
  if (typeof raw.spec !== 'string' || !KEY.test(raw.spec) || typeof raw.target !== 'string' || !KEY.test(raw.target)) return null;
  const lookIn = isObj(raw.look) ? raw.look : {};
  const skyIn = isObj(lookIn.sky) ? lookIn.sky : null;
  const sky = skyIn && hex(skyIn.top) && hex(skyIn.bottom) && hex(skyIn.fog) && hex(skyIn.sun)
    ? { top: hex(skyIn.top)!, bottom: hex(skyIn.bottom)!, fog: hex(skyIn.fog)!, sun: hex(skyIn.sun)!,
        ...(skyIn.ambient !== undefined ? { ambient: clampNum(skyIn.ambient, 0, 2, 0.7) } : {}),
        ...(skyIn.fogDensity !== undefined ? { fogDensity: clampNum(skyIn.fogDensity, 0, 0.08, 0.004) } : {}) }
    : undefined;
  const gIn = isObj(lookIn.ground) ? lookIn.ground : null;
  const ground = gIn ? { ...(hex(gIn.color) ? { color: hex(gIn.color) } : {}), ...(hex(gIn.line) ? { line: hex(gIn.line) } : {}), ...(oneOf(gIn.kind, GROUND_KINDS) ? { kind: oneOf(gIn.kind, GROUND_KINDS) } : {}) } : undefined;
  const backdrop = oneOf(lookIn.backdrop, BACKDROPS);
  const n = LIMITS.objects;
  const crowdIn = isObj(raw.crowd) ? raw.crowd : null;
  const cam = crowdIn && isObj(crowdIn.camera) ? crowdIn.camera : {};
  const into = Array.isArray(cam.into) ? cam.into : [];
  const stands = crowdIn ? list(crowdIn.stands, 64, (s) => {
    const step = Array.isArray(s.step) ? s.step : [];
    return {
      id: typeof s.id === 'string' && KEY.test(s.id) ? s.id : 'stand',
      front: pos(s.front), yaw: yawOf(s.yaw),
      width: clampNum(s.width, LIMITS.standWidth[0], LIMITS.standWidth[1], 16),
      rows: Math.round(clampNum(s.rows, LIMITS.standRows[0], LIMITS.standRows[1], 3)),
      step: [clampNum(step[0], 0.3, 3, 0.6), clampNum(step[1], 0, 2, 0.42)] as [number, number],
      posture: oneOf(s.posture, POSTURES) ?? 'seated', benches: s.benches !== false, gaps: clampNum(s.gaps, 0, 0.9, 0.12),
    };
  }) : [];
  const cast = sanitizeCast(raw.cast);
  const scripts: ExportScript[] = [];
  for (const sc of Array.isArray(raw.scripts) ? raw.scripts : []) {
    if (scripts.length >= EXPORT_SCRIPTS_MAX || !isObj(sc)) continue;
    const g = sanitizeGraph(sc);
    if (g.enabled && g.nodes.length) scripts.push({ id: typeof sc.id === 'string' && KEY.test(sc.id) ? sc.id : `script_${scripts.length}`, ...g });
  }
  const angles: StudioReplayAngle[] = [];
  for (const a of Array.isArray(raw.replayAngles) ? raw.replayAngles : []) { const v = oneOf(a, REPLAY_ANGLES); if (v && !angles.includes(v) && angles.length < LIMITS.replayAngles) angles.push(v); }
  return {
    kind: EXPORT_KIND, version: EXPORT_VERSION,
    venueId: raw.venueId, name: typeof raw.name === 'string' ? raw.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, LIMITS.name) : 'Studio venue',
    spec: raw.spec, target: raw.target,
    mood: oneOf(raw.mood, MOODS) ?? 'goldenHour',
    intro: oneOf(raw.intro, INTROS) ?? 'none',
    replayAngles: angles,
    look: {
      ...(sky ? { sky } : {}),
      ...(backdrop ? { backdrop } : {}),
      ...(lookIn.paintedSky === true ? { paintedSky: true } : {}),
      ...(ground && Object.keys(ground).length ? { ground: ground as StudioVenueExport['look']['ground'] } : {}),
      props: list(lookIn.props, n, (p) => {
        const kind = oneOf(p.kind, SPEC_PROP_KINDS); if (!kind) return null;
        const color = hex(p.color);
        return { kind, position: pos(p.position), rotationY: yawOf(p.rotationY), scale: scaleOf(p.scale), ...(color ? { color } : {}) };
      }),
    },
    baseDressing: oneOf(raw.baseDressing, BASE_DRESSING) ?? 'keep',
    kit: list(raw.kit, n, (k) => {
      if (typeof k.kit !== 'string' || !PART.test(k.kit) || typeof k.model !== 'string' || !PART.test(k.model)) return null;
      const tint = hex(k.tint);
      return { kit: k.kit, model: k.model, at: pos(k.at), yaw: yawOf(k.yaw), scale: scaleOf(k.scale), ...(tint ? { tint } : {}) };
    }),
    meshy: list(raw.meshy, n, (m) => { const key = oneOf(m.key, MESHY_KEYS); return key ? { key, at: pos(m.at), yaw: yawOf(m.yaw), scale: scaleOf(m.scale) } : null; }),
    fixtures: list(raw.fixtures, n, (f) => {
      const role = oneOf(f.role, FIXTURE_ROLES); if (!role) return null;
      return { id: typeof f.id === 'string' && KEY.test(f.id) ? f.id : 'fx', role, at: pos(f.at), yaw: yawOf(f.yaw), height: clampNum(f.height, LIMITS.fixtureHeight[0], LIMITS.fixtureHeight[1], 4.5), color: hex(f.color) ?? '#fff1d6', scale: scaleOf(f.scale) };
    }),
    crowd: crowdIn && stands.length ? {
      stands, focus: pos(crowdIn.focus), eye: pos(crowdIn.eye),
      camera: { at: pos(cam.at), into: [clampNum(into[0], -1, 1, 0), clampNum(into[1], -1, 1, -1)], margin: clampNum(cam.margin, 0, 60, 5) },
    } : null,
    decals: list(raw.decals, n, (d) => { const kind = oneOf(d.kind, DECAL_KINDS); return kind ? { kind, at: pos(d.at), yaw: yawOf(d.yaw), scale: scaleOf(d.scale) } : null; }),
    weather: oneOf(raw.weather, WEATHER_PICKS) ?? 'natural',
    glossyFloor: raw.glossyFloor === true,
    subject: Array.isArray(raw.subject) ? pos(raw.subject) : null,
    ...(cast ? { cast } : {}),
    ...(scripts.length ? { scripts } : {}),
  };
}

export function parseVenueExport(text: string): StudioVenueExport | null {
  try { return sanitizeVenueExport(JSON.parse(text)); } catch { return null; }
}

