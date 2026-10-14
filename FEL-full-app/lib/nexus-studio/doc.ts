// THE NEXUS STUDIO DOCUMENT (docs/NEXUS-STUDIO.md §2). One typed, versioned, serialisable project: venues, the things
// placed in them, characters and scripts. JSON in, JSON out. Pure: no Babylon, no DOM, no storage — those live in
// storage.ts and the viewport — so every rule here is tested in node.
//
// Anything that arrives from outside (an imported file, a localStorage blob another build wrote, a play-test hand-off) is
// UNTRUSTED: `sanitizeProject` drops unknown kinds, clamps every number, caps every string and list, and re-mints a
// colliding id. `migrateProject` is the one place a later version reads this one.

export const STUDIO_DOC_KIND = 'nexus-studio-project' as const;
export const STUDIO_DOC_VERSION = 1 as const;

// ── vocabularies (the engine's own lists; doc.vocab.test.ts holds each to its source) ───────────────────────────────

/** scene/moods.ts VenueMood. */
export const MOODS = ['goldenHour', 'daylight', 'dojoWarm', 'nightGame', 'alpine', 'overcast', 'dusk', 'indoorArena'] as const;
export type StudioMood = (typeof MOODS)[number];
/** nexus/NexusWebScene.ts GroundKind. */
export const GROUND_KINDS = ['court', 'pitch', 'clay', 'hardcourt', 'sand', 'mat', 'water', 'snow', 'street', 'stage', 'diamond', 'green'] as const;
export type StudioGroundKind = (typeof GROUND_KINDS)[number];
/** nexus/NexusWebScene.ts BackdropKind. */
export const BACKDROPS = ['beach', 'ocean', 'city', 'stadium', 'mountains', 'dojo', 'neon', 'links'] as const;
export type StudioBackdrop = (typeof BACKDROPS)[number];
/**
 * The NexusWebScene prop kinds a creator may place. The gameplay kinds (hoop, backboardPole, goal, net, tee) are not here:
 * a mode's physics is built around ITS spec's nets and rims, and a second rim nobody can score on is a bug report.
 */
export const SPEC_PROP_KINDS = ['lamp', 'banner', 'podium', 'palm', 'crowdTier', 'flag', 'wall', 'ramp', 'beam'] as const;
export type StudioSpecPropKind = (typeof SPEC_PROP_KINDS)[number];
/** visual/meshyProps.ts MeshyPropKey, the scenery scans (balls and the hoop are a mode's, not a set dresser's). */
export const MESHY_KEYS = ['hoopbus', 'sedan', 'store', 'stadium', 'ballpark', 'dojo', 'shuttle', 'goal', 'helmet', 'helmet2', 'bat', 'glove', 'skateboard', 'snowboard', 'surfboard'] as const;
export type StudioMeshyKey = (typeof MESHY_KEYS)[number];
/** scene/FixtureLights.ts FixtureRole. */
export const FIXTURE_ROLES = ['flood', 'lamp', 'bulb'] as const;
export type StudioFixtureRole = (typeof FIXTURE_ROLES)[number];
/** visual/GroundDecals.ts DecalKind. */
export const DECAL_KINDS = ['scuff', 'foot', 'carve', 'tyre'] as const;
export type StudioDecalKind = (typeof DECAL_KINDS)[number];
/** visual/crowd/crowdLayout.ts Posture. */
export const POSTURES = ['seated', 'standing'] as const;
export type StudioPosture = (typeof POSTURES)[number];
/** scene/broadcastShots.ts IntroKind, plus none. */
export const INTROS = ['none', 'establish', 'walkIn'] as const;
export type StudioIntro = (typeof INTROS)[number];
/** scene/broadcastShots.ts ReplayAngle. */
export const REPLAY_ANGLES = ['low', 'side', 'tight', 'high', 'follow', 'filmer'] as const;
export type StudioReplayAngle = (typeof REPLAY_ANGLES)[number];
/** nexus/weather.ts WeatherPick (natural, random, the conditions, the times of day). */
export const WEATHER_PICKS = ['natural', 'random', 'clear', 'rain', 'storm', 'snow', 'blizzard', 'wind', 'fog', 'dawn', 'day', 'dusk', 'night'] as const;
export type StudioWeather = (typeof WEATHER_PICKS)[number];
export const BASE_DRESSING = ['keep', 'none'] as const;

// ── the document ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type V3 = [number, number, number];
/** Position (metres, venue frame), yaw (radians, 0 = +z), uniform scale. Props stand upright: only yaw turns. */
export interface StudioTransform { p: V3; ry: number; s: number }

interface ObjectBase {
  id: string;
  name: string;
  t: StudioTransform;
  /** Cannot be moved, changed or deleted in the editor (still exported). */
  locked?: boolean;
  /** Not drawn and not exported (a creator's "try it without"). */
  hidden?: boolean;
}
export interface SpecPropObject extends ObjectBase { type: 'specProp'; kind: StudioSpecPropKind; color?: string }
export interface KitPropObject extends ObjectBase { type: 'kitProp'; kit: string; model: string; tint?: string }
export interface MeshyPropObject extends ObjectBase { type: 'meshyProp'; key: StudioMeshyKey }
export interface FixtureObject extends ObjectBase { type: 'fixture'; role: StudioFixtureRole; color: string; /** metres to the lamp head */ height: number }
export interface CrowdStandObject extends ObjectBase {
  type: 'crowdStand';
  width: number; rows: number; /** [depth back, rise up] per row, metres */ step: [number, number];
  posture: StudioPosture; benches: boolean; /** share of empty seats */ gaps: number;
}
export interface DecalObject extends ObjectBase { type: 'decal'; kind: StudioDecalKind }
/** Where the intro and replay previews frame the play (the hero's spot in the target mode). */
export interface CameraMarkObject extends ObjectBase { type: 'cameraMark'; role: 'subject' }

export type StudioObject = SpecPropObject | KitPropObject | MeshyPropObject | FixtureObject | CrowdStandObject | DecalObject | CameraMarkObject;
export type StudioObjectType = StudioObject['type'];
export const OBJECT_TYPES: readonly StudioObjectType[] = ['specProp', 'kitProp', 'meshyProp', 'fixture', 'crowdStand', 'decal', 'cameraMark'];

export interface StudioSky { top: string; bottom: string; fog: string; sun: string; ambient?: number; fogDensity?: number }

/** Everything about a venue that is not a placed object — what the inspector shows with nothing selected. */
export interface VenueSettings {
  name: string;
  /** The venue spec it is laid over (nexus/venueSpecs.ts) and the mode that plays it (targets.ts). */
  base: { spec: string; target: string };
  mood: StudioMood;
  /** The sky, the light's colour and the haze. Omitted = the spec's own. */
  sky?: StudioSky;
  backdrop?: StudioBackdrop;
  /** The painted horizon is the sky (no baked photograph): a night place. */
  paintedSky?: boolean;
  /** Floor colours / kind. The surface's size and markings are the spec's: they are the game. */
  ground?: { color?: string; line?: string; kind?: StudioGroundKind };
  /** The spec's own CC0 dressing set: keep it, or stand the venue bare. */
  baseDressing: (typeof BASE_DRESSING)[number];
  weather: StudioWeather;
  intro: StudioIntro;
  replayAngles: StudioReplayAngle[];
  /** Ask for the planar-mirror floor (scene/GlossyFloor.ts) — desktop/high, a wooden court. */
  glossyFloor: boolean;
  /** Track 3: who the venue casts — a project character's id per slot (cast.ts). Absent = the player's own look. */
  cast?: { player?: string };
}

export interface StudioVenue extends VenueSettings { id: string; objects: StudioObject[] }

/** Track 3: a character is a Closet look (its share code, lib/creator/look/shareCode). A code that is not code-shaped, or
 *  longer than the Closet's own ceiling, is dropped whole (a truncated code is a corrupt one). */
export interface StudioCharacter { id: string; name: string; lookCode?: string }
/** Track 4: a script graph. Empty until phase 4. */
export interface StudioScript { id: string; name: string; nodes: unknown[]; edges: unknown[] }

export interface StudioProject {
  kind: typeof STUDIO_DOC_KIND;
  version: typeof STUDIO_DOC_VERSION;
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  venues: StudioVenue[];
  activeVenueId: string;
  characters: StudioCharacter[];
  scripts: StudioScript[];
}

// ── limits ───────────────────────────────────────────────────────────────────────────────────────────────────────────

export const LIMITS = {
  name: 60,
  venues: 24,
  objects: 600,
  characters: 64,
  scripts: 64,
  /** |x|, |z| of a placement (the biggest venue's surround is ~140 m across). */
  reach: 400,
  heightMin: -20,
  heightMax: 120,
  scaleMin: 0.05,
  scaleMax: 40,
  replayAngles: 6,
  /** a crowd stand */
  standWidth: [2, 80] as const,
  standRows: [1, 12] as const,
  fixtureHeight: [0.3, 40] as const,
  /** lib/creator/look/shareCode MAX_SHARE_CODE_CHARS: the longest code the Closet itself reads. */
  code: 50_000,
};
/** The share-code shape (cast.ts holds the decode): FEL<version>.<base64url>.<checksum>. */
const CODE = /^FEL\d{1,3}\.[A-Za-z0-9_-]+\.[0-9a-z]{7}$/;

// ── constructors ─────────────────────────────────────────────────────────────────────────────────────────────────────

let idCounter = 0;
/** A short id, unique within a session and very likely across them. */
export function newId(prefix: string): string {
  idCounter = (idCounter + 1) % 1_679_616;
  const rand = typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function'
    ? Array.from(crypto.getRandomValues(new Uint32Array(2)), (n) => n.toString(36)).join('')
    : Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  return `${prefix}_${rand.slice(0, 8)}${idCounter.toString(36)}`;
}

export const IDENTITY: StudioTransform = { p: [0, 0, 0], ry: 0, s: 1 };

/** A fresh venue over `spec`, played by `target`. */
export function newVenue(name: string, base: { spec: string; target: string }, mood: StudioMood = 'goldenHour'): StudioVenue {
  return {
    id: newId('venue'), name, base: { ...base }, mood,
    baseDressing: 'keep', weather: 'natural', intro: 'none', replayAngles: [], glossyFloor: false,
    objects: [],
  };
}

export function newProject(name: string, venue: StudioVenue, now = new Date()): StudioProject {
  const at = now.toISOString();
  return {
    kind: STUDIO_DOC_KIND, version: STUDIO_DOC_VERSION, id: newId('proj'), name,
    createdAt: at, updatedAt: at, venues: [venue], activeVenueId: venue.id, characters: [], scripts: [],
  };
}

export function activeVenue(p: StudioProject): StudioVenue | null {
  return p.venues.find((v) => v.id === p.activeVenueId) ?? p.venues[0] ?? null;
}

export function findObject(v: StudioVenue, id: string): StudioObject | null {
  return v.objects.find((o) => o.id === id) ?? null;
}

/** The venue's settings without its objects (what a `venue` patch edits). */
export function venueSettings(v: StudioVenue): VenueSettings {
  const { id: _id, objects: _objects, ...rest } = v;
  void _id; void _objects;
  return rest;
}

/** A copy of an object with a new id, nudged so it does not sit inside the original. */
export function duplicateObject(o: StudioObject, nudge: V3 = [1, 0, 1]): StudioObject {
  const copy = JSON.parse(JSON.stringify(o)) as StudioObject;
  copy.id = newId(o.type);
  copy.name = `${o.name} copy`.slice(0, LIMITS.name);
  copy.t = { ...copy.t, p: [o.t.p[0] + nudge[0], o.t.p[1] + nudge[1], o.t.p[2] + nudge[2]] };
  delete copy.locked;
  return copy;
}

// ── sanitize: untrusted JSON → a document ──────────────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const isObj = (x: unknown): x is Json => typeof x === 'object' && x !== null && !Array.isArray(x);
const HEX = /^#[0-9a-fA-F]{6}$/;
const ID = /^[A-Za-z0-9_:-]{1,64}$/;

export function clampNum(x: unknown, lo: number, hi: number, dflt: number): number {
  const n = typeof x === 'number' ? x : Number.NaN;
  if (!Number.isFinite(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
}
function str(x: unknown, max: number, dflt: string): string {
  if (typeof x !== 'string') return dflt;
  // control characters out; the rest is a label the UI escapes
  const s = x.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);
  return s || dflt;
}
function hex(x: unknown): string | undefined { return typeof x === 'string' && HEX.test(x) ? x.toLowerCase() : undefined; }
function oneOf<T extends string>(x: unknown, list: readonly T[]): T | undefined { return typeof x === 'string' && (list as readonly string[]).includes(x) ? (x as T) : undefined; }
function idOr(x: unknown, prefix: string, seen: Set<string>): string {
  let id = typeof x === 'string' && ID.test(x) ? x : newId(prefix);
  while (seen.has(id)) id = newId(prefix);
  seen.add(id);
  return id;
}

/** Wrap an angle into (−π, π]. */
export function wrapAngle(a: number): number {
  if (a > -Math.PI && a <= Math.PI) return a;   // already in range: untouched (the modulo below would cost a float ulp)
  const t = Math.PI * 2;
  let r = ((a % t) + t) % t;
  if (r > Math.PI) r -= t;
  return r;
}

function sanitizeTransform(x: unknown): StudioTransform {
  const t = isObj(x) ? x : {};
  const p = Array.isArray(t.p) ? t.p : [];
  return {
    p: [clampNum(p[0], -LIMITS.reach, LIMITS.reach, 0), clampNum(p[1], LIMITS.heightMin, LIMITS.heightMax, 0), clampNum(p[2], -LIMITS.reach, LIMITS.reach, 0)],
    ry: wrapAngle(clampNum(t.ry, -1e6, 1e6, 0)),
    s: clampNum(t.s, LIMITS.scaleMin, LIMITS.scaleMax, 1),
  };
}

const KIT_PART = /^[A-Za-z0-9_-]{1,64}$/;

export function sanitizeObject(x: unknown, seen: Set<string>): StudioObject | null {
  if (!isObj(x)) return null;
  const type = oneOf(x.type, OBJECT_TYPES);
  if (!type) return null;
  const base = {
    id: idOr(x.id, type, seen),
    name: str(x.name, LIMITS.name, type),
    t: sanitizeTransform(x.t),
    ...(x.locked === true ? { locked: true } : {}),
    ...(x.hidden === true ? { hidden: true } : {}),
  };
  switch (type) {
    case 'specProp': {
      const kind = oneOf(x.kind, SPEC_PROP_KINDS); if (!kind) return null;
      const color = hex(x.color);
      return { ...base, type, kind, ...(color ? { color } : {}) };
    }
    case 'kitProp': {
      if (typeof x.kit !== 'string' || !KIT_PART.test(x.kit) || typeof x.model !== 'string' || !KIT_PART.test(x.model)) return null;
      const tint = hex(x.tint);
      return { ...base, type, kit: x.kit, model: x.model, ...(tint ? { tint } : {}) };
    }
    case 'meshyProp': {
      const key = oneOf(x.key, MESHY_KEYS); if (!key) return null;
      return { ...base, type, key };
    }
    case 'fixture': {
      const role = oneOf(x.role, FIXTURE_ROLES); if (!role) return null;
      return { ...base, type, role, color: hex(x.color) ?? '#fff1d6', height: clampNum(x.height, LIMITS.fixtureHeight[0], LIMITS.fixtureHeight[1], role === 'flood' ? 12 : role === 'lamp' ? 4.5 : 2.6) };
    }
    case 'crowdStand': {
      const step = Array.isArray(x.step) ? x.step : [];
      return {
        ...base, type,
        width: clampNum(x.width, LIMITS.standWidth[0], LIMITS.standWidth[1], 16),
        rows: Math.round(clampNum(x.rows, LIMITS.standRows[0], LIMITS.standRows[1], 3)),
        step: [clampNum(step[0], 0.3, 3, 0.6), clampNum(step[1], 0, 2, 0.42)],
        posture: oneOf(x.posture, POSTURES) ?? 'seated',
        benches: x.benches !== false,
        gaps: clampNum(x.gaps, 0, 0.9, 0.12),
      };
    }
    case 'decal': {
      const kind = oneOf(x.kind, DECAL_KINDS); if (!kind) return null;
      return { ...base, type, kind };
    }
    case 'cameraMark':
      return { ...base, type, role: 'subject' };
  }
  return null;
}

function sanitizeSky(x: unknown): StudioSky | undefined {
  if (!isObj(x)) return undefined;
  const top = hex(x.top), bottom = hex(x.bottom), fog = hex(x.fog), sun = hex(x.sun);
  if (!top || !bottom || !fog || !sun) return undefined;
  return {
    top, bottom, fog, sun,
    ...(x.ambient !== undefined ? { ambient: clampNum(x.ambient, 0, 2, 0.7) } : {}),
    ...(x.fogDensity !== undefined ? { fogDensity: clampNum(x.fogDensity, 0, 0.08, 0.004) } : {}),
  };
}

export function sanitizeVenue(x: unknown, seen: Set<string>): StudioVenue | null {
  if (!isObj(x)) return null;
  const base = isObj(x.base) ? x.base : {};
  const spec = typeof base.spec === 'string' && ID.test(base.spec) ? base.spec : null;
  const target = typeof base.target === 'string' && ID.test(base.target) ? base.target : null;
  if (!spec || !target) return null;
  const groundIn = isObj(x.ground) ? x.ground : null;
  const ground = groundIn ? {
    ...(hex(groundIn.color) ? { color: hex(groundIn.color) } : {}),
    ...(hex(groundIn.line) ? { line: hex(groundIn.line) } : {}),
    ...(oneOf(groundIn.kind, GROUND_KINDS) ? { kind: oneOf(groundIn.kind, GROUND_KINDS) } : {}),
  } : undefined;
  const objectSeen = new Set<string>();
  const objects: StudioObject[] = [];
  for (const o of Array.isArray(x.objects) ? x.objects : []) {
    if (objects.length >= LIMITS.objects) break;
    const s = sanitizeObject(o, objectSeen);
    if (s) objects.push(s);
  }
  const angles: StudioReplayAngle[] = [];
  for (const a of Array.isArray(x.replayAngles) ? x.replayAngles : []) {
    const v = oneOf(a, REPLAY_ANGLES);
    if (v && !angles.includes(v) && angles.length < LIMITS.replayAngles) angles.push(v);
  }
  const sky = sanitizeSky(x.sky);
  const backdrop = oneOf(x.backdrop, BACKDROPS);
  return {
    id: idOr(x.id, 'venue', seen),
    name: str(x.name, LIMITS.name, 'Untitled venue'),
    base: { spec, target },
    mood: oneOf(x.mood, MOODS) ?? 'goldenHour',
    ...(sky ? { sky } : {}),
    ...(backdrop ? { backdrop } : {}),
    ...(x.paintedSky === true ? { paintedSky: true } : {}),
    ...(ground && Object.keys(ground).length ? { ground: ground as VenueSettings['ground'] } : {}),
    baseDressing: oneOf(x.baseDressing, BASE_DRESSING) ?? 'keep',
    weather: oneOf(x.weather, WEATHER_PICKS) ?? 'natural',
    intro: oneOf(x.intro, INTROS) ?? 'none',
    replayAngles: angles,
    glossyFloor: x.glossyFloor === true,
    ...(isObj(x.cast) && typeof x.cast.player === 'string' && ID.test(x.cast.player) ? { cast: { player: x.cast.player } } : {}),
    objects,
  };
}

export type ParseResult = { ok: true; project: StudioProject; dropped: number } | { ok: false; error: string };

/** Bring an older document up to this version. Version 1 is the first; anything newer is refused, not guessed at. */
export function migrateProject(x: unknown): { ok: true; doc: Json } | { ok: false; error: string } {
  if (!isObj(x)) return { ok: false, error: 'not a Nexus Studio project' };
  if (x.kind !== STUDIO_DOC_KIND) return { ok: false, error: 'not a Nexus Studio project' };
  const v = x.version;
  if (v === STUDIO_DOC_VERSION) return { ok: true, doc: x };
  if (typeof v === 'number' && v > STUDIO_DOC_VERSION) return { ok: false, error: `made by a newer Studio (version ${v}); this one reads version ${STUDIO_DOC_VERSION}` };
  return { ok: false, error: 'unknown project version' };
}

/** Untrusted JSON → a project, or why not. `dropped` counts what could not be kept (a bad object, a bad venue). */
export function sanitizeProject(raw: unknown, now = new Date()): ParseResult {
  const m = migrateProject(raw);
  if (!m.ok) return m;
  const x = m.doc;
  const seen = new Set<string>();
  const venues: StudioVenue[] = [];
  let dropped = 0;
  const rawVenues = Array.isArray(x.venues) ? x.venues : [];
  for (const rv of rawVenues) {
    if (venues.length >= LIMITS.venues) { dropped++; continue; }
    const v = sanitizeVenue(rv, seen);
    if (!v) { dropped++; continue; }
    dropped += Math.max(0, (isObj(rv) && Array.isArray(rv.objects) ? rv.objects.length : 0) - v.objects.length);
    venues.push(v);
  }
  if (!venues.length) return { ok: false, error: 'the project has no venue this Studio can open' };
  const characters: StudioCharacter[] = [];
  for (const c of Array.isArray(x.characters) ? x.characters : []) {
    if (!isObj(c) || characters.length >= LIMITS.characters) continue;
    const code = typeof c.lookCode === 'string' && c.lookCode.length <= LIMITS.code && CODE.test(c.lookCode) ? c.lookCode : undefined;
    characters.push({ id: idOr(c.id, 'char', seen), name: str(c.name, LIMITS.name, 'Character'), ...(code ? { lookCode: code } : {}) });
  }
  const scripts: StudioScript[] = [];
  for (const s of Array.isArray(x.scripts) ? x.scripts : []) {
    if (!isObj(s) || scripts.length >= LIMITS.scripts) continue;
    // phase 4 defines nodes and edges; until then a script is a name and an empty graph (nothing executable is imported)
    scripts.push({ id: idOr(s.id, 'script', seen), name: str(s.name, LIMITS.name, 'Script'), nodes: [], edges: [] });
  }
  // a cast that names a character the project does not have is dropped (the venue plays the player's own look)
  for (const v of venues) if (v.cast?.player && !characters.some((c) => c.id === v.cast!.player)) delete v.cast;
  const at = now.toISOString();
  const activeVenueId = typeof x.activeVenueId === 'string' && venues.some((v) => v.id === x.activeVenueId) ? x.activeVenueId : venues[0].id;
  const iso = (s: unknown) => (typeof s === 'string' && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : at);
  return {
    ok: true, dropped,
    project: {
      kind: STUDIO_DOC_KIND, version: STUDIO_DOC_VERSION,
      id: typeof x.id === 'string' && ID.test(x.id) ? x.id : newId('proj'),
      name: str(x.name, LIMITS.name, 'Untitled project'),
      createdAt: iso(x.createdAt), updatedAt: iso(x.updatedAt),
      venues, activeVenueId, characters, scripts,
    },
  };
}

/** Text (a file, a storage blob) → a project. */
export function parseProject(text: string): ParseResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'not JSON' }; }
  return sanitizeProject(raw);
}

export function serializeProject(p: StudioProject): string {
  return JSON.stringify(p, null, 2);
}
