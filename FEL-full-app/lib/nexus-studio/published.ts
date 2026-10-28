// PUBLISHED VENUES (NEX-02, round 8; docs/NEXUS-ROADMAP.md §2.1; owner 2026-10-20: "committed JSON first; a published venue is the
// mode's default, with Restore").
//
// A venue the owner publishes is a REVIEWED JSON FILE in lib/nexus-studio/published/<mode>/<venueId>.venue.json, listed in
// published/index.ts (a bundler cannot glob a folder). The Studio's Publish button runs the publish gate (publishGate.ts) and
// downloads the file; the owner commits it in a PR like any content, and the merge ships it. Nothing else publishes: no route,
// no table, no URL. `?venue=` stays dev-only (runtime.ts studioLoadAllowed).
//
// THE FILE IS STILL UNTRUSTED. Every one is read through the export's own sanitiser (exportVenue.ts sanitizeVenueExport) and the
// publish gate AGAIN at load; a file that fails either is skipped with a console warning (and fails CI: published.test.ts).
//
// WHAT A PUBLICATION NEVER CARRIES: a look code. The cast (a character's decoded look: height, build, face numbers) is stripped
// at publish and again at load (docs/NEXUS-ROADMAP.md §3.3 "a look code never leaves the device in … a publication"); players
// play as themselves. The cast fans among the crowd go with it.
//
// TWO DEPTHS (the brief):
//   full  the 4 play-test targets (targets.ts): the look, and the extras through runtime.ts mountStudioFor (scans, fixtures,
//         crowd, decals, weather, intro, replay angles, scripts) — the look ONLY in a competitive run (NEX-03).
//   look  a mode that reads its place through placeLooks.readPlaceLook and plays on the same venue spec as a target (Tennis on
//         Tiebreak's court, Baseball on Derby's park): the PlaceLook only — sky, backdrop, floor colours, added props, dressing.
//
// THE DEFAULT, WITH RESTORE. placeLooks.looksFor lists a mode's published venues FIRST, so with no pick of the player's own the
// published venue is what plays; the shipped places (home first) stay in the list, and the splash's Restore picks `home` again in
// one tap. With nothing published, looksFor returns exactly the shipped list (the same array), so every mode is byte-identical.
//
// Pure: no Babylon, no DOM.

import type { PlaceLook } from '../babylon/nexus/placeLooks';
import { VENUE_PROP_SETS, type PropPlacement } from '../babylon/visual/venuePropSets';
import { sanitizeVenueExport, type StudioVenueExport } from './exportVenue';
import { publishGate, type GateProblem, type PhoneSample } from './publishGate';
import { PLAYTEST_TARGETS, targetOf } from './targets';
import { PUBLISHED_VENUE_FILES } from './published/index';

export const PUBLISHED_KIND = 'nexus-studio-published' as const;
export const PUBLISHED_VERSION = 1 as const;
/** A published venue's place id: `studio:<venueId>` (never `home`, so the shipped look is always one tap away). */
export const PUBLISHED_PLACE_PREFIX = 'studio:';

export type PublishDepth = 'full' | 'look';

export interface PublishedVenue {
  kind: typeof PUBLISHED_KIND;
  version: typeof PUBLISHED_VERSION;
  /** The place list it joins (placeLooks.ts key) — a play-test target (full depth) or a look-only mode below. */
  mode: string;
  /** ISO time the owner pressed Publish (information only). */
  publishedAt: string;
  /** The meter's phone column at Publish (the budget gate reads it again at load). */
  phone: PhoneSample;
  /** The export, without a cast. */
  venue: StudioVenueExport;
}

/**
 * The look-depth modes: a mode that picks its place through readPlaceLook (placeLooks.ts) and mounts the same venue spec as a
 * play-test target, so a target's venue lays over it unchanged. Keyed by the place key; `spec` is the spec the mode mounts and
 * `target` the target whose editor makes venues for it. published.test.ts holds each to the mode file's own mountVenue call.
 */
export const LOOK_ONLY_MODES: Readonly<Record<string, { spec: string; target: string; label: string }>> = {
  tennis: { spec: 'tennis', target: 'tiebreak', label: 'Tennis' },        // NetSportMode venueId 'tennis', readPlaceLook('tennis')
  baseball: { spec: 'derby', target: 'derby', label: 'Baseball' },        // BaseballInningsMode mounts venue 'derby', readPlaceLook('baseball')
};

/** How deep a published venue goes in `mode`, or null when `mode` takes none. */
export function publishDepth(mode: string): PublishDepth | null {
  if (Object.prototype.hasOwnProperty.call(PLAYTEST_TARGETS, mode)) return 'full';
  if (Object.prototype.hasOwnProperty.call(LOOK_ONLY_MODES, mode)) return 'look';
  return null;
}

/** Where a venue made for `target` may be published: its own mode (full), and every look-only mode on the same spec. */
export function publishModesFor(target: string): Array<{ mode: string; depth: PublishDepth; label: string }> {
  const t = targetOf(target);
  if (!t) return [];
  return [
    { mode: t.key, depth: 'full' as const, label: t.label },
    ...Object.entries(LOOK_ONLY_MODES).filter(([, m]) => m.target === t.key && m.spec === t.spec).map(([mode, m]) => ({ mode, depth: 'look' as const, label: m.label })),
  ];
}

/** The export a publication carries: the cast is dropped (a look code never leaves the device). */
export function publicView(exp: StudioVenueExport): StudioVenueExport {
  const { cast: _cast, ...rest } = exp;
  void _cast;
  return { ...rest };
}

/** What Publish downloads. The caller has run the gate (packPublished does not: it only builds the file). */
export function packPublished(exp: StudioVenueExport, mode: string, phone: PhoneSample, now: Date = new Date()): PublishedVenue {
  return {
    kind: PUBLISHED_KIND, version: PUBLISHED_VERSION, mode, publishedAt: now.toISOString(),
    phone: { drawCalls: Math.round(phone.drawCalls), activeMeshes: Math.round(phone.activeMeshes), textureMb: Math.round(phone.textureMb), skinnedBodies: Math.round(phone.skinnedBodies) },
    venue: publicView(exp),
  };
}

/** The file's name and folder in the repo: published/<mode>/<venueId>.venue.json. */
export function publishedPath(pub: Pick<PublishedVenue, 'mode' | 'venue'>): string {
  return `lib/nexus-studio/published/${pub.mode}/${pub.venue.venueId}.venue.json`;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : Number.NaN);

export type ReadResult = { ok: true; pub: PublishedVenue } | { ok: false; problems: string[] };

/** A committed file → a publication, through the sanitiser and the gate. Every reason it is refused is listed. */
export function readPublished(raw: unknown): ReadResult {
  const problems: string[] = [];
  if (!isObj(raw) || raw.kind !== PUBLISHED_KIND || raw.version !== PUBLISHED_VERSION) return { ok: false, problems: ['not a published Nexus Studio venue (kind / version)'] };
  const mode = typeof raw.mode === 'string' ? raw.mode : '';
  const depth = publishDepth(mode);
  if (!depth) problems.push(`"${mode}" takes no published venue`);
  const venue = sanitizeVenueExport(raw.venue);
  if (!venue) return { ok: false, problems: [...problems, 'the venue is not a valid export'] };
  if (venue.cast) problems.push('a publication may not carry a cast (look codes never leave the device)');
  if (depth === 'full' && venue.target !== mode) problems.push(`the venue was made for "${venue.target}", not "${mode}"`);
  if (depth === 'look') {
    const m = LOOK_ONLY_MODES[mode];
    if (venue.target !== m.target || venue.spec !== m.spec) problems.push(`${m.label} takes a ${m.target} venue on "${m.spec}"; this one is ${venue.target} on "${venue.spec}"`);
  }
  const p = isObj(raw.phone) ? raw.phone : {};
  const phone: PhoneSample = { drawCalls: num(p.drawCalls), activeMeshes: num(p.activeMeshes), textureMb: num(p.textureMb), skinnedBodies: num(p.skinnedBodies) };
  const gate = publishGate(venue, isObj(raw.phone) ? phone : null);
  for (const g of gate.problems) problems.push(gateLine(g));
  if (problems.length) return { ok: false, problems };
  return { ok: true, pub: { kind: PUBLISHED_KIND, version: PUBLISHED_VERSION, mode, publishedAt: typeof raw.publishedAt === 'string' ? raw.publishedAt.slice(0, 40) : '', phone, venue: publicView(venue) } };
}

const gateLine = (g: GateProblem): string => g.message;

let memo: { files: readonly unknown[]; all: PublishedVenue[] } | null = null;

/** Every valid publication (a bad file is skipped with a warning — CI refuses it first). Memoised on the file list. */
export function allPublished(files: readonly unknown[] = PUBLISHED_VENUE_FILES): PublishedVenue[] {
  if (memo && memo.files === files) return memo.all;
  const all: PublishedVenue[] = [];
  const ids = new Set<string>();
  for (const f of files) {
    const r = readPublished(f);
    if (!r.ok) { console.warn(`[NEXUS-STUDIO] a published venue was refused: ${r.problems.join('; ')}`); continue; }
    const key = `${r.pub.mode}|${r.pub.venue.venueId}`;
    if (ids.has(key)) { console.warn(`[NEXUS-STUDIO] published venue ${key} is listed twice — the second is ignored`); continue; }
    ids.add(key);
    all.push(r.pub);
  }
  memo = { files, all };
  return all;
}

/** The publications for one place list, in the index's order (the first is the mode's default). */
export function publishedFor(mode: string, files: readonly unknown[] = PUBLISHED_VENUE_FILES): PublishedVenue[] {
  if (!files.length) return [];
  return allPublished(files).filter((p) => p.mode === mode);
}

/** The publication a place id names in `mode`, or null. */
export function publishedByPlace(mode: string, placeId: string | null | undefined, files: readonly unknown[] = PUBLISHED_VENUE_FILES): PublishedVenue | null {
  if (!placeId || !placeId.startsWith(PUBLISHED_PLACE_PREFIX)) return null;
  const id = placeId.slice(PUBLISHED_PLACE_PREFIX.length);
  return publishedFor(mode, files).find((p) => p.venue.venueId === id) ?? null;
}

// ── the PlaceLook a venue lays over its spec (shared with runtime.ts studioLook) ────────────────────────────────────────────

/**
 * The CC0 set each target spec dresses with by default (visual/VenueProps.ts propSetFor, which is Babylon-side; published.test.ts
 * holds this table equal to it for every spec a venue can be made on).
 */
export const STUDIO_BASE_SETS: Readonly<Record<string, string>> = { tennis: 'venice-court', football_rush: 'gridiron', volleyball: 'beach-court', derby: 'ballpark' };

/**
 * The export's PlaceLook: its sky, backdrop, floor and added props, and — when it places kit props — a dressing set registered
 * under `setKey` (the spec's own set first when the venue keeps it, then the venue's kit). Registering is idempotent.
 */
export function exportPlaceLook(exp: StudioVenueExport, o: { id: string; sub: string; tint: string; setKey: string; baseSet: string | null }): PlaceLook {
  const L = exp.look;
  let propSet: string | null | undefined;
  if (!exp.kit.length) propSet = exp.baseDressing === 'keep' ? undefined : null;
  else {
    const base = exp.baseDressing === 'keep' ? o.baseSet : null;
    const placements: PropPlacement[] = [
      ...(base ? VENUE_PROP_SETS[base] ?? [] : []),
      ...exp.kit.map((k) => ({ kit: k.kit, model: k.model, at: k.at, yaw: k.yaw, scale: k.scale, ...(k.tint ? { tint: k.tint } : {}) })),
    ];
    VENUE_PROP_SETS[o.setKey] = placements;
    propSet = o.setKey;
  }
  return {
    id: o.id, name: exp.name, sub: o.sub, tint: o.tint,
    ...(L.sky ? { sky: { ...L.sky } } : {}),
    ...(L.backdrop ? { backdrop: L.backdrop } : {}),
    ...(L.paintedSky ? { paintedSky: true } : {}),
    ...(L.ground ? { ground: { ...L.ground } } : {}),
    ...(propSet !== undefined ? { propSet } : {}),
    props: L.props.map((p) => ({ kind: p.kind, position: [...p.position] as [number, number, number], rotationY: p.rotationY, scale: p.scale, ...(p.color ? { color: p.color } : {}) })),
  };
}

/** The splash line under a published venue's name. */
export const PUBLISHED_SUB = 'MADE IN NEXUS STUDIO';

/** A publication as a place on its mode's splash. */
export function publishedPlaceLook(pub: PublishedVenue): PlaceLook {
  return exportPlaceLook(pub.venue, {
    id: `${PUBLISHED_PLACE_PREFIX}${pub.venue.venueId}`, sub: PUBLISHED_SUB, tint: '#00e5ff',
    setKey: `studio_pub_${pub.venue.venueId}`, baseSet: STUDIO_BASE_SETS[pub.venue.spec] ?? null,
  });
}

let placeMemo: { files: readonly unknown[]; byMode: Map<string, PlaceLook[]> } | null = null;

/** The published places for a mode's splash list, first (the default). Empty when nothing is published. Memoised per mode. */
export function publishedPlaceLooks(mode: string, files: readonly unknown[] = PUBLISHED_VENUE_FILES): PlaceLook[] {
  if (!files.length) return [];
  if (!placeMemo || placeMemo.files !== files) placeMemo = { files, byMode: new Map() };
  let looks = placeMemo.byMode.get(mode);
  if (!looks) { looks = publishedFor(mode, files).map(publishedPlaceLook); placeMemo.byMode.set(mode, looks); }
  return looks;
}

/**
 * The splash's one-tap Restore (components/games/boot-splash.tsx): while a published venue is the pick, the shipped `home` place
 * of the same list; otherwise null (nothing to restore).
 */
export function restorePlace(list: readonly PlaceLook[], pickedId: string): PlaceLook | null {
  if (!pickedId.startsWith(PUBLISHED_PLACE_PREFIX)) return null;
  return list.find((l) => l.id === 'home') ?? null;
}

/** Tests: forget the memos. */
export function resetPublishedMemo(): void { memo = null; placeMemo = null; }
