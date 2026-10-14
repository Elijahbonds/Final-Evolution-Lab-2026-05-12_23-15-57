// LIGHT FALLS FROM THE FIXTURES (vis-foundation-2, A9.5 second half, 2026-10-13) — desktop and high only.
//
// A9.5's first half made the fixtures GLOW (EmissiveGlow: lamp heads, floods, lanterns and bulbs draw a halo). They still
// lit nothing: a night stadium's floodlights glowed over a field lit only by the mood's one directional "moon", a lamp
// post glowed over a pavement it left dark, and a player walking under one got no light on them. The audit's answer:
// clustered point and spot lights for the named fixtures, so the light falls on the floor and on the players.
//
// Babylon's ClusteredLightContainer renders any number of point/spot lights as ONE light in each material (a tiled light
// list built per frame by a single instanced draw), so twenty lamps cost about what one extra light costs, not twenty.
// Which fixtures: the role list below, read off the same names the glow include list matches (a lamp head, a flood, a
// lantern, a bulb) — never a hoop's make-flash, a neon strip or an LED wall (those are signs, not light sources, and the
// flash is a moving effect). Mounted once after load() (the harness's captureVenue), never toggled; shadowless (clustered
// lights cannot cast, and a fixture shadow per light is exactly the cost this avoids). WebGL1 or no float blending: the
// container reports unsupported and nothing is mounted — the glow alone stays.
//
// INTENSITY BY ILLUMINANCE. Each light is sized by what it should put on the ground where it points, not by a raw number:
// intensity = E × d² (PBR's physical inverse-square falloff), with E per role and per mood (strongest at night). So a
// flood 60 m up a stadium and a lamp 4 m over a path both land the light they are meant to, whatever the venue's scale.

import { ClusteredLightContainer, Color3, PointLight, ShaderStore, SpotLight, Vector3 } from '@babylonjs/core';
import type { AbstractMesh, Light, Scene } from '@babylonjs/core';
import type { VenueMood } from './moods';
import type { QualityTier } from './QualityTier';
import { sceneModeId, wave2Look } from './lookPolicy';

export type FixtureRole = 'flood' | 'lamp' | 'bulb';

/** Pure: the role a fixture's light plays, by its mesh name (then its material's). Null = not a light source. */
export function fixtureRole(meshName: string, materialName?: string | null): FixtureRole | null {
  if (/^flood_/i.test(meshName) || /^flood/i.test(materialName ?? '')) return 'flood';
  if (/^(lhead|harbor_lighthouse_lamp)/i.test(meshName) || /^lampHead/i.test(materialName ?? '')) return 'lamp';
  if (/^(lantern_|bb_bulb_|loc_rooftop_bulb_)/i.test(meshName) || /^lantern/i.test(materialName ?? '')) return 'bulb';
  return null;
}

/** What each role puts on the ground it points at (Babylon PBR illuminance units, the scale the moods' sun intensities
 *  are written in: a nightGame "moon" is 2.2), at full mood strength. */
export const ROLE_E: Record<FixtureRole, number> = { flood: 0.8, lamp: 0.7, bulb: 0.3 };
/** How far each role's light reaches, × its throw (the distance to where it points). Clustering bounds every light. */
export const ROLE_REACH: Record<FixtureRole, { min: number; mul: number }> = { flood: { min: 25, mul: 2.2 }, lamp: { min: 10, mul: 3.2 }, bulb: { min: 4, mul: 3 } };
/** Fixture lights by mood: the night is what they are for; a sunny day barely shows them. */
export const FIXTURE_MOOD_GAIN: Record<VenueMood, number> = {
  nightGame: 1, dusk: 0.8, dojoWarm: 0.7, indoorArena: 0.55, goldenHour: 0.35, overcast: 0.3, daylight: 0.15, alpine: 0.15,
};
/** At most this many lights per tier (the container's tile pass and the per-pixel loop scale with it). */
export const FIXTURE_CAP: Record<Exclude<QualityTier, 'mobile'>, number> = { desktop: 32, high: 64 };
/** Bulbs nearer than this to each other are one light (a string of party bulbs is one source at play distance). */
export const BULB_MERGE_M = 2.5;

export interface FixtureIn { role: FixtureRole; pos: { x: number; y: number; z: number }; color: { r: number; g: number; b: number } }
export interface PlannedLight {
  kind: 'point' | 'spot';
  role: FixtureRole;
  pos: { x: number; y: number; z: number };
  /** spot only: unit direction */
  dir?: { x: number; y: number; z: number };
  /** spot only: full cone angle, radians */
  angle?: number;
  range: number;
  intensity: number;
  color: { r: number; g: number; b: number };
}

const PRIORITY: Record<FixtureRole, number> = { flood: 0, lamp: 1, bulb: 2 };

/** Pure: a fixture's emitted colour as a light colour — hue kept, brightest channel 1 (the emissive's own gain is not light). */
export function lightColor(c: { r: number; g: number; b: number }): { r: number; g: number; b: number } {
  const m = Math.max(c.r, c.g, c.b);
  return m > 1e-4 ? { r: c.r / m, g: c.g / m, b: c.b / m } : { r: 1, g: 1, b: 1 };
}

/**
 * Pure: the lights for a set of fixtures. Bulbs close together merge into one; the list is ordered floods, lamps, bulbs and,
 * within a role, nearest the play area first, then capped. `groundY` is the floor the light lands on, `at` the play area.
 *   flood — a spot aimed down onto the field: toward the play area, landing 70 % of the way there (a stadium's floods
 *           light across the pitch from the side they stand on)
 *   lamp  — a point just under the head, landing on the ground under it
 *   bulb  — a small point at the bulb (or a merged string's middle)
 */
export function planFixtureLights(fixtures: readonly FixtureIn[], at: { x: number; y: number; z: number } | null, opts: { cap: number; mood: VenueMood; groundY?: number }): PlannedLight[] {
  const gy = opts.groundY ?? at?.y ?? 0;
  const gain = FIXTURE_MOOD_GAIN[opts.mood] ?? 0.5;
  // merge the bulbs
  const merged: FixtureIn[] = [];
  const bulbs: { n: number; pos: { x: number; y: number; z: number }; color: { r: number; g: number; b: number } }[] = [];
  for (const f of fixtures) {
    if (f.role !== 'bulb') { merged.push(f); continue; }
    const near = bulbs.find((b) => Math.hypot(b.pos.x / b.n - f.pos.x, b.pos.y / b.n - f.pos.y, b.pos.z / b.n - f.pos.z) < BULB_MERGE_M);
    if (near) { near.n++; near.pos.x += f.pos.x; near.pos.y += f.pos.y; near.pos.z += f.pos.z; near.color.r += f.color.r; near.color.g += f.color.g; near.color.b += f.color.b; }
    else bulbs.push({ n: 1, pos: { ...f.pos }, color: { ...f.color } });
  }
  for (const b of bulbs) merged.push({ role: 'bulb', pos: { x: b.pos.x / b.n, y: b.pos.y / b.n, z: b.pos.z / b.n }, color: { r: b.color.r / b.n, g: b.color.g / b.n, b: b.color.b / b.n } });
  const dAt = (p: { x: number; z: number }) => (at ? Math.hypot(p.x - at.x, p.z - at.z) : 0);
  merged.sort((a, b) => PRIORITY[a.role] - PRIORITY[b.role] || dAt(a.pos) - dAt(b.pos));
  const out: PlannedLight[] = [];
  for (const f of merged) {
    if (out.length >= opts.cap) break;
    const color = lightColor(f.color);
    if (f.role === 'flood') {
      const cx = at ? f.pos.x + (at.x - f.pos.x) * 0.7 : f.pos.x, cz = at ? f.pos.z + (at.z - f.pos.z) * 0.7 : f.pos.z;
      const dx = cx - f.pos.x, dy = gy - f.pos.y, dz = cz - f.pos.z;
      const throwM = Math.max(1, Math.hypot(dx, dy, dz));
      const range = Math.max(ROLE_REACH.flood.min, throwM * ROLE_REACH.flood.mul);
      out.push({ kind: 'spot', role: 'flood', pos: { ...f.pos }, dir: { x: dx / throwM, y: dy / throwM, z: dz / throwM }, angle: 1.45, range, intensity: ROLE_E.flood * gain * throwM * throwM, color });
    } else if (f.role === 'lamp') {
      const pos = { x: f.pos.x, y: f.pos.y - 0.35, z: f.pos.z };
      const throwM = Math.max(1, pos.y - gy);
      out.push({ kind: 'point', role: 'lamp', pos, range: Math.max(ROLE_REACH.lamp.min, throwM * ROLE_REACH.lamp.mul), intensity: ROLE_E.lamp * gain * throwM * throwM, color });
    } else {
      const throwM = Math.max(1, Math.min(4, f.pos.y - gy));
      out.push({ kind: 'point', role: 'bulb', pos: { ...f.pos }, range: Math.max(ROLE_REACH.bulb.min, throwM * ROLE_REACH.bulb.mul), intensity: ROLE_E.bulb * gain * throwM * throwM, color });
    }
  }
  return out;
}

/**
 * BABYLON 9.23 BUG, PATCHED HERE: the clustered PBR light loop (ShadersInclude/pbrClusteredLightingFunctions) computes the
 * sheen term with `normalW` — the CALLER's variable, not in scope inside `computeClusteredLighting`, whose normal is `N`.
 * Every material with sheen on (all the cloth: fabric.ts puts sheen on every jersey, short and sock) then fails to compile
 * the moment a clustered light reaches it, and a failed material is not drawn: measured on Football Rush, every player's
 * kit vanished and left the ink hull standing ("FRAGMENT SHADER ERROR: 'normalW' : undeclared identifier"). The fix is the
 * one-token rename upstream needs; applied to the GLSL include in the shader store before any light is clustered, only if
 * the faulty text is still there (a fixed Babylon is left alone). Returns whether it patched.
 */
export function patchClusteredSheen(store: Record<string, string> = ShaderStore.IncludesShadersStore): boolean {
  const key = 'pbrClusteredLightingFunctions';
  const src = store[key];
  if (!src || !src.includes('computeSheenLighting(preInfo,normalW,')) return false;
  store[key] = src.split('computeSheenLighting(preInfo,normalW,').join('computeSheenLighting(preInfo,N,');
  return true;
}

// STRIPS (w3-atmos): a lit STRIP is a fixture too - a kart course's edge lights, hundreds of thin instances of one mesh - but it is
// far too long for the cap, and a kart passes the whole lap by. So a strip does not get a light each: it gets a small POOL of
// lights that follow whoever is passing (a mode registers it with the points along the strip and a `follow`), each pinned to
// one of the nearest points and moved to the next as it falls behind; a light's range ends where the next one begins, so a
// light that changes points does it at zero intensity. They sit in the same clustered container as the rest.
export interface StripSource {
  /** world points along the strip (a lamp every few metres) */
  points: ReadonlyArray<readonly [number, number, number]>;
  color: { r: number; g: number; b: number };
  /** where the light is wanted (the kart); null = nobody, the pool rests */
  follow: () => { x: number; y: number; z: number } | null;
  /** how many lights in the pool (default STRIP_POOL) */
  pool?: number;
}
export const STRIP_POOL = 8;
/** A strip light hangs this high over its point, and reaches this far (its pool covers the nearest ~STRIP_POOL points). */
export const STRIP_HEIGHT = 1.5, STRIP_RANGE = 17;
/** Candela-ish: what one strip light puts on the road under it at full mood gain (a street lamp is a few). */
export const STRIP_INTENSITY = 4.2;

export function stripRegistry(scene: Scene): StripSource[] {
  const md = (scene.metadata ??= {}) as { felFixtureStrips?: StripSource[] };
  return (md.felFixtureStrips ??= []);
}
/** Register a strip; returns its remover. Must happen before the rig's captureVenue (i.e. in load()). */
export function addStripSource(scene: Scene, src: StripSource): () => void {
  const reg = stripRegistry(scene);
  reg.push(src);
  return () => { const i = reg.indexOf(src); if (i >= 0) reg.splice(i, 1); };
}

/**
 * Pure: which points the pool's lights sit on. The `k` points nearest `at` (on the ground plane) get a light; a light whose point
 * is still among them STAYS on it (so nothing flickers as the follower moves), the free lights take the newly near points,
 * nearest first. `prev` is the last assignment (point index per light, -1 = none).
 */
export function stripSlots(points: ReadonlyArray<readonly [number, number, number]>, at: { x: number; z: number }, k: number, prev: readonly number[]): number[] {
  const n = Math.min(k, points.length);
  const order = points.map((p, i) => ({ i, d: (p[0] - at.x) ** 2 + (p[2] - at.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, n).map((o) => o.i);
  const want = new Set(order);
  const out: number[] = new Array(k).fill(-1);
  const taken = new Set<number>();
  for (let s = 0; s < k; s++) { const p = prev[s]; if (p !== undefined && p >= 0 && want.has(p) && !taken.has(p)) { out[s] = p; taken.add(p); } }
  const fresh = order.filter((i) => !taken.has(i));
  for (let s = 0; s < k && fresh.length; s++) if (out[s] < 0) out[s] = fresh.shift()!;
  return out;
}

export interface FixtureLightsHandle {
  container: ClusteredLightContainer;
  readonly lights: readonly Light[];
  dispose(): void;
}

/** The fixtures in the scene now: enabled meshes with a role whose material actually emits. */
export function findFixtures(scene: Scene): FixtureIn[] {
  const out: FixtureIn[] = [];
  for (const m of scene.meshes as AbstractMesh[]) {
    if (!m.isEnabled() || !m.isVisible) continue;
    const mat = m.material as unknown as { name?: string; emissiveColor?: Color3; emissiveTexture?: unknown } | null;
    const role = fixtureRole(m.name, mat?.name);
    if (!role) continue;
    const e = mat?.emissiveColor;
    if (!e || Math.max(e.r, e.g, e.b) < 0.2) continue;   // a lamp that is off is not a light
    const p = m.computeWorldMatrix(true).getTranslation();   // a builder's mesh has no cached world matrix until it is drawn
    out.push({ role, pos: { x: p.x, y: p.y, z: p.z }, color: { r: e.r, g: e.g, b: e.b } });
  }
  return out;
}

/** Pure: does this mount get fixture lights? Desktop/high, a mode the wave-2 look reaches (lookPolicy), not switched off. */
export function fixtureLightsWanted(tier: QualityTier, modeId: string | null, off = false): boolean {
  return tier !== 'mobile' && wave2Look(modeId) && !off;
}

/**
 * Light the scene's fixtures (call after load(); the rig's captureVenue does, desktop/high only). Null when there are no
 * fixtures (nor strips) or the engine cannot cluster. `at` = the play area.
 */
export function mountFixtureLights(scene: Scene, tier: QualityTier, mood: VenueMood, at: Vector3 | null): FixtureLightsHandle | null {
  if (!fixtureLightsWanted(tier, sceneModeId(scene))) return null;
  const fixtures = findFixtures(scene);
  const strips = stripRegistry(scene).filter((s) => s.points.length > 0);
  if (!fixtures.length && !strips.length) return null;
  const plan = planFixtureLights(fixtures, at ? { x: at.x, y: at.y, z: at.z } : null, { cap: FIXTURE_CAP[tier === 'high' ? 'high' : 'desktop'], mood });
  if (!plan.length && !strips.length) return null;
  const lights: Light[] = [];
  for (const [i, p] of plan.entries()) {
    const pos = new Vector3(p.pos.x, p.pos.y, p.pos.z);
    const l = p.kind === 'spot'
      ? new SpotLight(`fel_fixture_${p.role}_${i}`, pos, new Vector3(p.dir!.x, p.dir!.y, p.dir!.z), p.angle!, 2, scene)
      : new PointLight(`fel_fixture_${p.role}_${i}`, pos, scene);
    l.intensity = p.intensity;
    l.range = p.range;
    l.diffuse = new Color3(p.color.r, p.color.g, p.color.b);
    l.specular = l.diffuse.scale(0.6);
    l.shadowEnabled = false;
    lights.push(l);
  }
  if (patchClusteredSheen()) console.info('[FEL-FIXTURE] patched Babylon\'s clustered sheen term (normalW → N)');
  let container: ClusteredLightContainer;
  try {
    container = new ClusteredLightContainer('fel_fixture_lights', [], scene);
  } catch (e) {
    console.warn('[FEL-FIXTURE] clustered lights unavailable:', e);
    for (const l of lights) l.dispose();
    return null;
  }
  if (!container.isSupported) {
    console.info('[FEL-FIXTURE] this GPU cannot cluster lights — the fixtures glow, they do not light');
    container.dispose(); for (const l of lights) l.dispose();
    return null;
  }
  // w3-atmos: the strips' pools (they join the container once it exists; the cap does not count them: a pool is a few lights by design)
  const gain = FIXTURE_MOOD_GAIN[mood] ?? 0.5;
  const pools = strips.map((src, si) => {
    const k = src.pool ?? STRIP_POOL;
    const ls: PointLight[] = [];
    for (let i = 0; i < k; i++) {
      const l = new PointLight(`fel_fixture_strip_${si}_${i}`, new Vector3(0, -100, 0), scene);
      l.intensity = 0; l.range = STRIP_RANGE; l.diffuse = new Color3(src.color.r, src.color.g, src.color.b); l.specular = l.diffuse.scale(0.5); l.shadowEnabled = false;
      ls.push(l);
    }
    return { src, ls, slots: new Array<number>(k).fill(-1) };
  });
  container.maxRange = Math.max(STRIP_RANGE, ...plan.map((p) => p.range));
  for (const l of lights) container.addLight(l);
  for (const p of pools) for (const l of p.ls) container.addLight(l);
  const stripObs = pools.length ? scene.onBeforeRenderObservable.add(() => {
    for (const p of pools) {
      const at = p.src.follow();
      if (!at) { for (const l of p.ls) l.intensity = 0; continue; }
      p.slots = stripSlots(p.src.points, at, p.ls.length, p.slots);
      p.ls.forEach((l, s) => {
        const i = p.slots[s];
        if (i < 0) { l.intensity = 0; return; }
        const pt = p.src.points[i];
        l.position.set(pt[0], pt[1] + STRIP_HEIGHT, pt[2]);
        // fade each light with its distance from the follower, so a light that is handed the next point does it at nothing
        const d = Math.hypot(pt[0] - at.x, pt[2] - at.z);
        l.intensity = STRIP_INTENSITY * gain * Math.max(0, 1 - (d / STRIP_RANGE) ** 2);
      });
    }
  }) : null;
  const roles = plan.reduce<Record<string, number>>((a, p) => { a[p.role] = (a[p.role] ?? 0) + 1; return a; }, {});
  console.info(`[FEL-FIXTURE] ${lights.length} fixture lights (${Object.entries(roles).map(([k, n]) => `${n} ${k}`).join(', ')}) from ${fixtures.length} fixtures, clustered${pools.length ? `, + ${pools.reduce((n, p) => n + p.ls.length, 0)} strip lights following ${pools.length} strip${pools.length === 1 ? '' : 's'}` : ''}`);
  return {
    container,
    get lights() { return [...lights, ...pools.flatMap((p) => p.ls)]; },
    dispose() {
      if (stripObs) scene.onBeforeRenderObservable.remove(stripObs);
      for (const p of pools) for (const l of p.ls) { try { container.removeLight(l); } catch { /* gone */ } l.dispose(); }
      for (const l of lights) { try { container.removeLight(l); } catch { /* gone */ } l.dispose(); }
      container.dispose();
    },
  };
}
