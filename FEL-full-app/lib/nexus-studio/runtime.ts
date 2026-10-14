// THE STUDIO VENUE AT RUNTIME (docs/NEXUS-STUDIO.md §5). One path from a StudioVenueExport to a scene, used by BOTH the
// editor's viewport and a mode's load(): what the creator edits is what the mode draws.
//
//   look      → nexus/placeLooks PlaceLook over the mode's venue spec, mounted by NexusVenue.mountVenue (the mode's call)
//   kit       → a registered visual/venuePropSets set, mounted by mountVenue through VenueProps (thin instances)
//   meshy     → visual/meshyProps spawnMeshyProp
//   fixtures  → lit heads named for scene/FixtureLights' roles, found by the rig's captureVenue (desktop/high)
//   decals    → visual/GroundDecals' pool, refreshed before a placed mark would fade
//   crowd     → visual/crowd mountModeCrowd with the export's stands (it hears the mode's momentum when there is one)
//   weather   → premium/WeatherFx over core/WeatherKit.fromPick
//   intro     → the mode's `intro` getter + a director stepper (a mode with a fixed camera never steps the director)
//
// THE MODE'S LOAD PATH IS DEV-ONLY AND OPT-IN: `studioVenueFor` answers null in a production build and whenever the page
// has no `?venue=`, so a mode that reads it behaves exactly as it shipped.

import { Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import type { PlaceLook } from '../babylon/nexus/placeLooks';
import { VENUE_PROP_SETS, type PropPlacement } from '../babylon/visual/venuePropSets';
import { propSetFor } from '../babylon/visual/VenueProps';
import { spawnMeshyProp, type MeshyPropKey } from '../babylon/visual/meshyProps';
import { mountGroundDecals, decalCap, decalLife } from '../babylon/visual/GroundDecals';
import { mountModeCrowd } from '../babylon/visual/crowd/modeCrowd';
import type { CrowdVenue } from '../babylon/visual/crowd/crowdLayout';
import { WeatherKit } from '../babylon/core/WeatherKit';
import { mountWeatherFx } from '../babylon/premium/WeatherFx';
import type { LightRigHandle } from '../babylon/scene/LightRig';
import type { QualityTier } from '../babylon/scene/QualityTier';
import type { VenueMood } from '../babylon/scene/moods';
import type { IntroKind } from '../babylon/scene/broadcastShots';
import type { ExportCrowd, ExportDecal, ExportFixture, ExportMeshyProp, StudioVenueExport } from './exportVenue';
import { browserKV, decodeInline, readPlaytest, type KV } from './storage';
import { targetOf } from './targets';

// ── the mode's side: is there a Studio venue for this mode? ─────────────────────────────────────────────────────────

/** The `?venue=` load path exists only outside a production build. */
export function studioLoadAllowed(env: string | undefined = process.env.NODE_ENV): boolean { return env !== 'production'; }

let cache: { key: string; exp: StudioVenueExport | null } | null = null;

/**
 * The Studio venue this page asks `modeKey` to load, or null (no `?venue=`, a production build, a venue made for another
 * mode, nothing under that id). Read three times per mount (mood, intro, look) and cached on the page's query.
 */
export function studioVenueFor(modeKey: string, search?: string, kv?: KV | null, env?: string): StudioVenueExport | null {
  if (!studioLoadAllowed(env)) return null;
  let q = search;
  if (q === undefined) { try { q = typeof window !== 'undefined' ? window.location.search : ''; } catch { q = ''; } }
  const param = new URLSearchParams(q).get('venue');
  if (!param) return null;
  const memo = `${modeKey}|${param}`;
  if (kv === undefined && cache?.key === memo) return cache.exp;
  const exp = param.startsWith('b64:') ? decodeInline(param) : readPlaytest(kv === undefined ? browserKV() : kv, param);
  const ok = exp && exp.target === modeKey ? exp : null;
  if (exp && !ok) console.warn(`[NEXUS-STUDIO] ?venue= was made for "${exp.target}", not "${modeKey}" — ignored`);
  if (kv === undefined) cache = { key: memo, exp: ok };
  return ok;
}
/** Tests: forget the cached page answer. */
export function resetStudioVenueCache(): void { cache = null; }

/** The mood a mode lights with: the Studio venue's, else its own. */
export function studioMood(modeKey: string, fallback: VenueMood): VenueMood { return studioVenueFor(modeKey)?.mood ?? fallback; }
/** The broadcast intro a mode opens on: the Studio venue's, else none. */
export function studioIntro(modeKey: string): IntroKind | undefined {
  const i = studioVenueFor(modeKey)?.intro;
  return i && i !== 'none' ? i : undefined;
}

/** The dressing set's key for this export: registered on first use, so VenueProps and NexusVenue's surround see it. */
export function studioPropSetKey(exp: StudioVenueExport): string | null | undefined {
  const base = exp.baseDressing === 'keep' ? propSetFor(exp.spec) : null;
  if (!exp.kit.length) return exp.baseDressing === 'keep' ? undefined : null;
  const placements: PropPlacement[] = [
    ...(base ? VENUE_PROP_SETS[base] ?? [] : []),
    ...exp.kit.map((k) => ({ kit: k.kit, model: k.model, at: k.at, yaw: k.yaw, scale: k.scale, ...(k.tint ? { tint: k.tint } : {}) })),
  ];
  const key = `studio_${exp.venueId}`;
  VENUE_PROP_SETS[key] = placements;
  return key;
}

/** The export as the PlaceLook mountVenue lays over the spec. */
export function studioLook(exp: StudioVenueExport): PlaceLook {
  const L = exp.look;
  const propSet = studioPropSetKey(exp);
  return {
    id: 'studio', name: exp.name, sub: 'NEXUS STUDIO', tint: '#00e5ff',
    ...(L.sky ? { sky: { ...L.sky } } : {}),
    ...(L.backdrop ? { backdrop: L.backdrop } : {}),
    ...(L.paintedSky ? { paintedSky: true } : {}),
    ...(L.ground ? { ground: { ...L.ground } } : {}),
    ...(propSet !== undefined ? { propSet } : {}),
    props: L.props.map((p) => ({ kind: p.kind, position: [...p.position] as [number, number, number], rotationY: p.rotationY, scale: p.scale, ...(p.color ? { color: p.color } : {}) })),
  };
}

/** The PlaceLook for `modeKey` when the page carries a Studio venue for it (the mode's one-line `look:` hook). */
export function studioLookFor(modeKey: string): PlaceLook | undefined {
  const exp = studioVenueFor(modeKey);
  return exp ? studioLook(exp) : undefined;
}

// ── the layers ──────────────────────────────────────────────────────────────────────────────────────────────────────

export interface Layer { dispose(): void }

const place = (n: TransformNode, at: readonly number[], yaw: number, s: number): void => {
  n.position.set(at[0], at[1], at[2]); n.rotation.set(0, yaw, 0); n.rotationQuaternion = null; n.scaling.setAll(s);
};

/** The Meshy scans, each under its own node. Missing files are skipped (meshyProps warns once). */
export function mountMeshyLayer(scene: Scene, parent: TransformNode | null, items: readonly ExportMeshyProp[]): Layer & { ready: Promise<number> } {
  const root = new TransformNode('studio_meshy', scene); root.parent = parent;
  let gone = false;
  const ready = Promise.all(items.map(async (m, i) => {
    const node = await spawnMeshyProp(scene, m.key as MeshyPropKey, root, `studio_meshy_${i}_${m.key}`).catch(() => null);
    if (!node) return 0;
    if (gone) { node.dispose(); return 0; }
    place(node, m.at, m.yaw, m.scale);
    return 1;
  })).then((r) => r.reduce<number>((a, b) => a + b, 0));
  return { ready, dispose() { gone = true; root.dispose(); } };
}

/** The name a fixture's lit head takes so scene/FixtureLights.fixtureRole (and EmissiveGlow) know it. */
export function fixtureHeadName(role: ExportFixture['role'], id: string): string {
  return `${role === 'flood' ? 'flood_' : role === 'lamp' ? 'lhead_' : 'lantern_'}studio_${id}`;
}

/** Pole + lit head. The head emits its colour (≥ 0.2, FixtureLights' "a lamp that is off is not a light"). */
export function mountFixtureLayer(scene: Scene, parent: TransformNode | null, items: readonly ExportFixture[]): Layer & { heads: Mesh[] } {
  const root = new TransformNode('studio_fixtures', scene); root.parent = parent;
  // the pole stands right under its own light: lit, it blows out to white (a clustered light cannot exclude it), so it is a
  // flat dark metal that reads the same at noon and at night
  const poleMat = new StandardMaterial('studio_fixture_pole_m', scene);
  poleMat.disableLighting = true; poleMat.emissiveColor = new Color3(0.13, 0.14, 0.16); poleMat.diffuseColor = Color3.Black();
  const heads: Mesh[] = [];
  const mats: StandardMaterial[] = [poleMat];
  for (const f of items) {
    const holder = new TransformNode(`studio_fixture_${f.id}`, scene); holder.parent = root;
    place(holder, f.at, f.yaw, f.scale);
    const h = f.height;
    const pole = MeshBuilder.CreateCylinder(`studio_pole_${f.id}`, { height: h, diameter: f.role === 'flood' ? 0.28 : 0.12, tessellation: 10 }, scene);
    pole.position.y = h / 2; pole.parent = holder; pole.material = poleMat; pole.receiveShadows = true;
    const head = f.role === 'flood'
      ? MeshBuilder.CreateBox(fixtureHeadName(f.role, f.id), { width: 1.4, height: 0.7, depth: 0.25 }, scene)
      : MeshBuilder.CreateSphere(fixtureHeadName(f.role, f.id), { diameter: f.role === 'lamp' ? 0.45 : 0.22, segments: 10 }, scene);
    head.parent = holder;
    head.position.y = h + (f.role === 'flood' ? 0.2 : 0);
    head.position.z = f.role === 'lamp' ? 0.35 : 0;   // a lamp hangs off its arm, toward the play (+z of the fixture)
    if (f.role === 'flood') head.rotation.x = 0.5;   // tipped toward the play (+z of the fixture)
    const c = Color3.FromHexString(f.color);
    // a near-black pick still lights: FixtureLights skips a head whose brightest channel is under 0.2
    const peak = Math.max(c.r, c.g, c.b);
    const lit = peak < 0.01 ? new Color3(0.25, 0.25, 0.25) : peak < 0.25 ? c.scale(0.25 / peak) : c;
    const m = new StandardMaterial(`studio_fixture_head_m_${f.id}`, scene);
    m.emissiveColor = lit; m.diffuseColor = Color3.Black(); m.disableLighting = true;
    head.material = m; mats.push(m);
    heads.push(head);
  }
  return { heads, dispose() { root.dispose(false, true); for (const m of mats) m.dispose(); } };
}

/**
 * Placed marks. GroundDecals is a transient pool (a mark fades over decalLife); a placed mark must stay, so the layer keeps
 * its OWN pool and re-stamps every mark at half its life — exactly `cap` stamps per kind (unused slots get a zero-size
 * stamp), so each mark always lands in the same slot and is never drawn twice. (Routed: a `persist` stamp option on
 * GroundDecals would make the refresh unnecessary — docs/NEXUS-STUDIO.md §8.)
 */
export function mountDecalLayer(scene: Scene, tier: QualityTier, items: readonly ExportDecal[]): Layer & { stamped: number; live(): number } {
  if (!items.length) return { stamped: 0, live: () => 0, dispose() {} };
  const pool = mountGroundDecals(scene, tier);
  const cap = decalCap(tier), life = decalLife(tier);
  const byKind = new Map<ExportDecal['kind'], ExportDecal[]>();
  for (const d of items) { const l = byKind.get(d.kind) ?? []; if (l.length < cap) l.push(d); byKind.set(d.kind, l); }
  const stampAll = (): void => {
    for (const [kind, list] of byKind) {
      for (const d of list) pool.stamp(kind, d.at[0], d.at[2], d.yaw, { y: d.at[1], scale: d.scale });
      for (let i = list.length; i < cap; i++) pool.stamp(kind, 0, 0, 0, { scale: 0 });
    }
  };
  stampAll();
  let acc = 0;
  const obs = scene.onBeforeRenderObservable.add(() => {
    acc += Math.min(0.1, scene.getEngine().getDeltaTime() / 1000);   // the pool's own clock step
    if (acc >= life * 0.5) { acc = 0; stampAll(); }
  });
  let stamped = 0; for (const l of byKind.values()) stamped += l.length;
  /** Marks on the ground now (each kind's slots, the zero-size fillers included): `cap` per kind while the refresh runs. */
  const live = (): number => { let n = 0; for (const k of byKind.keys()) n += pool.live(k); return n; };
  return { stamped, live, dispose() { scene.onBeforeRenderObservable.remove(obs); pool.dispose(); } };
}

/** The export's stands as a crowd (visual/crowd). `ctx` may carry the mode's momentum and phase: the crowd then reacts. */
export function mountCrowdLayer(ctx: { scene: Scene; momentum?: unknown; phase?: () => string }, crowd: ExportCrowd | null): Layer & { seats: number } {
  if (!crowd?.stands.length) return { seats: 0, dispose() {} };
  const venue: CrowdVenue = {
    stands: crowd.stands.map((s) => ({ id: `studio_${s.id}`, front: [...s.front] as [number, number, number], yaw: s.yaw, width: s.width, rows: s.rows, step: [...s.step] as [number, number], posture: s.posture, benches: s.benches, gaps: s.gaps })),
    focus: [...crowd.focus] as [number, number, number], eye: [...crowd.eye] as [number, number, number],
    camera: { at: [...crowd.camera.at] as [number, number, number], into: [...crowd.camera.into] as [number, number], margin: crowd.camera.margin },
  };
  const h = mountModeCrowd(ctx as Parameters<typeof mountModeCrowd>[0], 'tennis', { venue });
  return { seats: h?.seats ?? 0, dispose() { h?.dispose(); } };
}

/** The weather's look (never its gameplay: nothing here reads the kit's modifiers). 'natural' mounts nothing. */
export function mountWeatherLayer(scene: Scene, lights: LightRigHandle | null, pick: string, family: 'court', opts: { tier: QualityTier; keepSky: boolean; seed?: number }): Layer {
  if (!lights || !pick || pick === 'natural') return { dispose() {} };
  const fx = mountWeatherFx(scene, lights, WeatherKit.fromPick(pick, family, opts.seed ?? 7), { tier: opts.tier, keepSky: opts.keepSky });
  const obs = scene.onBeforeRenderObservable.add(() => fx.update(Math.min(0.1, scene.getEngine().getDeltaTime() / 1000)));
  return { dispose() { scene.onBeforeRenderObservable.remove(obs); fx.dispose(); } };
}

// ── everything but the venue itself, for a mode ─────────────────────────────────────────────────────────────────────

export interface StudioModeCtx {
  scene: Scene;
  lights?: LightRigHandle | null;
  momentum?: unknown;
  phase?: () => string;
  camDirector?: { inIntro: boolean; update(subject: Vector3, velocity: Vector3, objective: Vector3 | null): void };
  heroRef?: { current: TransformNode | null };
  objectiveRef?: { current: Vector3 | null };
}

export interface StudioExtras extends Layer { readonly layers: Record<'meshy' | 'fixtures' | 'decals' | 'crowd' | 'weather', Layer> }

/** Mount everything the export adds over the venue (call right after mountVenue with `studioLook(exp)`). */
export function mountStudioExtras(ctx: StudioModeCtx, exp: StudioVenueExport, opts: { stepIntro?: boolean } = {}): StudioExtras {
  const { scene } = ctx;
  const tier = ((scene.metadata as { felTier?: QualityTier } | null)?.felTier ?? ctx.lights?.tier ?? 'desktop') as QualityTier;
  const family = targetOf(exp.target)?.weatherFamily ?? 'court';
  // the routed GlossyFloor line reads this (docs/NEXUS-STUDIO.md §8); the floor kind is the export's own
  const meta = (scene.metadata ??= {}) as Record<string, unknown>;
  if (exp.glossyFloor) meta.felStudioGround = 'court'; else delete meta.felStudioGround;
  const layers = {
    meshy: mountMeshyLayer(scene, null, exp.meshy),
    fixtures: mountFixtureLayer(scene, null, exp.fixtures),
    decals: mountDecalLayer(scene, tier, exp.decals),
    crowd: mountCrowdLayer({ scene, momentum: ctx.momentum, phase: ctx.phase }, exp.crowd),
    weather: mountWeatherLayer(scene, ctx.lights ?? null, exp.weather, family, { tier, keepSky: !!exp.look.sky }),
  };
  // a mode with a fixed camera (Tiebreak snaps once) never steps its director, so the intro it was given would never run
  const zero = Vector3.Zero();
  const stepper = opts.stepIntro && ctx.camDirector && exp.intro !== 'none'
    ? scene.onBeforeRenderObservable.add(() => {
      const d = ctx.camDirector!;
      if (!d.inIntro) return;
      const hero = ctx.heroRef?.current;
      if (hero) d.update(hero.getAbsolutePosition(), zero, ctx.objectiveRef?.current ?? null);
    })
    : null;
  return {
    layers,
    dispose() {
      if (stepper) scene.onBeforeRenderObservable.remove(stepper);
      for (const l of Object.values(layers)) l.dispose();
      delete meta.felStudioGround;
    },
  };
}

/** A mode's one-line hook: the extras for the Studio venue this page carries for `modeKey`, or null. */
export function mountStudioFor(modeKey: string, ctx: StudioModeCtx): StudioExtras | null {
  const exp = studioVenueFor(modeKey);
  if (!exp) return null;
  console.info(`[NEXUS-STUDIO] ${modeKey}: "${exp.name}" — ${exp.kit.length} kit props, ${exp.meshy.length} scans, ${exp.fixtures.length} fixtures, ${exp.crowd?.stands.length ?? 0} stands, ${exp.decals.length} decals`);
  return mountStudioExtras(ctx, exp, { stepIntro: true });
}
