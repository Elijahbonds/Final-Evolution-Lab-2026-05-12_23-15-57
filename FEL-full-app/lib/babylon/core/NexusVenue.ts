// NexusVenue — the one call that puts an M73 venue into a live mode.
//
// M73 built and rendered 20 venues; they were not wired into anything. This
// is the wiring, and it exists as a helper rather than six copy-pasted blocks
// because every one of the integration details below is easy to omit and
// invisible when omitted:
//
//   1. The camera must know the venue's BOUNDS, or it walks out of the world.
//      M64 added CameraDirector.setBounds() precisely for this; a venue that
//      never calls it silently reverts to the pre-M64 behaviour.
//   2. The placeholder actors must go when real characters spawn, or you get
//      two bodies per player — one capsule, one avatar, in the same spot.
//   3. Disposal must be complete. A mode switch that leaves a sky dome behind
//      shows the previous venue's sky over the new one, and it looks like a
//      grading bug rather than a leak.
//
// Everything is under one root, so dispose() is total.

import type { Scene, TransformNode } from '@babylonjs/core';
import { buildNexusScene, type BuiltScene } from '../nexus/NexusWebScene';
import { mountVenueProps, propSetFor, type VenuePropsHandle } from '../visual/VenueProps';
import { dressHoop } from '../visual/meshyProps';
import { decorateVeniceBoardwalk } from '../nexus/veniceBoardwalk';
import { NavBounds } from './NavBounds';
import { MAPS } from '../../map-data';
import type { Vector3 } from '@babylonjs/core';
import { specFor } from '../nexus/venueSpecs';
import { applyFloorDetail } from '../visual/groundTextures';
import { flattenMapBoxes, type FlattenBox } from '../visual/mapSurgery';
import { applyLocation, COURT_LOCATIONS, isCourtLocationId } from '../nexus/courtLocations';

export interface VenueHandle {
  /** Ship pass 4, phase 3: the walkable-area navmesh baked from this venue's map (null until loaded, or when the venue has no map). */
  readonly nav: NavBounds | null;
  /** Keep `pos` on the walkable surface. Returns false when no navmesh is loaded yet — callers fall back to their box clamp. */
  constrain(pos: Vector3): boolean;
  built: BuiltScene;
  /** Placeholder bodies, kept so a mode can drop them the moment real
   *  characters are ready. */
  placeholders: TransformNode[];
  /** Hide the stand-ins. Call right after CharacterLibrary.spawn() resolves. */
  hidePlaceholders(): void;
  dispose(): void;
}

/** Minimal shape we need from the mode context — declared structurally so this
 *  file does not have to import ModeHarness and create a cycle. */
interface VenueCtx {
  scene: Scene;
  canvas?: HTMLCanvasElement;
  /** CameraDirector (or any object with setBounds/invalidateBounds). */
  camDirector?: {
    setBounds?(b: { minX: number; maxX: number; minZ: number; maxZ: number; minY: number }): void;
    invalidateBounds?(): void;
  };
}

export interface MountVenueOptions {
  /** Court location (docs/SPEC-COURT-LOCATIONS.md): swaps the environment half of a basketball spec; ignored elsewhere. */
  location?: string;
  /**
   * M104 (framing fix): keep the mode's own gameplay camera active instead of
   * letting the venue's static ArcRotateCamera take over `scene.activeCamera`.
   *
   * THE BUG THIS FIXES: buildNexusScene() creates `nexus_cam_<mode>` at the
   * venue's authored orbit radius (14 m for basketball) and assigns it to
   * `scene.activeCamera`. For a mode that drives a CameraDirector follow-cam
   * every frame (dunk, onevone, threevthree, karate-endless) this silently
   * DISABLES that follow-cam — every snapTo/update writes to a camera that is
   * no longer being rendered — and freezes the shot at the orbit radius, which
   * is what measured the player at 8% of frame height (see CameraFraming.ts).
   * Restoring the gameplay camera re-activates the already-tuned follow shot
   * (~22-24% of frame) AND the rim-cut / replay cinematics that go with it.
   *
   * Opt-in and default-off, so venue modes that INTENTIONALLY present the
   * static orbit camera (dance, net sports) are unchanged.
   */
  keepGameplayCamera?: boolean;
}

/**
 * Build the venue for `modeId` and wire it to the camera.
 *
 * Returns null when no spec exists — deliberately not a throw. A mode with no
 * venue should still be playable on whatever VenueKit already builds; losing
 * the scenery is a downgrade, losing the mode is an outage.
 */
/**
 * The venue footprint the camera is allowed to sit inside.
 *
 * Exported so it can be asserted against the ground it claims to describe —
 * these were two independent calculations of the same rectangle, and they
 * disagreed the moment a ground gained an offset.
 */
export function venueBounds(spec: { ground: { size: [number, number]; offset?: [number, number] } }): {
  minX: number; maxX: number; minZ: number; maxZ: number; minY: number;
} {
  const [w, d] = spec.ground.size;
  const [ox, oz] = spec.ground.offset ?? [0, 0];
  return { minX: ox - w / 2, maxX: ox + w / 2, minZ: oz - d / 2, maxZ: oz + d / 2, minY: 0 };
}

export function mountVenue(ctx: VenueCtx, modeId: string, options: MountVenueOptions = {}): VenueHandle | null {
  const authored = specFor(modeId);
  const spec = authored ? applyLocation(authored, options.location) : authored;
  const location = isCourtLocationId(options.location) && spec !== authored ? COURT_LOCATIONS[options.location] : null;
  if (!spec) {
    console.warn(`[NEXUS] no venue spec for "${modeId}" — falling back to VenueKit. `
      + 'Add one to venueSpecs.ts to give this mode its own venue.');
    return null;
  }

  // M104: capture the gameplay camera BEFORE buildNexusScene reassigns
  // scene.activeCamera to the venue's static orbit camera.
  const gameplayCam = ctx.scene.activeCamera;

  const built = buildNexusScene(ctx.scene, spec, ctx.canvas);
  // Ship Pass 6 phase 5: under a scanned map the procedural court plane must not render — it z-fought the scan and mirrored the
  // dusk dome as an orange slab (threes, three-point). It stays in the scene for bounds and camera logic.
  if (spec.mapKey) { for (const m of built.root.getChildMeshes()) if (m.name === 'venue_ground') m.isVisible = false; }
  // Pass 7 phase 2 spread: a tiled grain (detail map) over the procedural floor — grass on pitches, diamonds and greens,
  // sand on the beach court, asphalt on the street, a faint concrete grain on hardcourt. Markings are the albedo and stay.
  else applyFloorDetail(ctx.scene, built.root, spec.ground.kind, spec.ground.size);

  // Ship pass 4, phase 2: the CC0 prop dressing for this venue (visual/VenueProps.ts),
  // loaded async under the venue root and disposed with it. Placements live in
  // venuePropSets.ts and stay outside every play area.
  // Phase 3: the navmesh for this venue's map (scripts/venue/navmesh-gen.mts → public/models/navmesh).
  let nav: NavBounds | null = null;
  if (spec.mapKey) void NavBounds.load(spec.mapKey).then((n) => { nav = n; if (n) console.info(`[NEXUS] navmesh "${spec.mapKey}": ${n.data.polys.length} polys`); });
  const propSet = location && location.propSet !== undefined && location.propSet !== null ? (location.propSet || null) : propSetFor(modeId);
  if (location?.decorate) location.decorate(ctx.scene, built.root);   // blossom trees, starfields: meshes after the build, under the venue root
  // The scanned court is mounted for the half-court rim (z −1.32). Dunk's rim is at z −11, so under dunk the scan slides −9 so
  // its north baseline meets the rim (owner's Luma reference, 2026-09-06: the hoop stands on the apron right behind the paint).
  // Per-mode slide of the mounted map along z (metres), applied once the async mount lands:
  //  · dunk: −9 puts the scan's baseline rim where the spec's rim stands (owner's Luma reference)
  const MAP_SLIDE_Z: Record<string, number> = { basketball_dunk: -9 };
  // Per-mode flatten boxes (world metres, before the slide): baked junk pushed under the floor once the mount lands.
  //  · penalty: the stadium's two "goals" are SOLID low-poly blocks ~2 m deep on each goal line — the keeper stood inside one
  //    (feet showing) and sliding the map only moved the other under the camera (measured 2026-09-06). Both go; the spec's
  //    white goal frame stands alone.
  //  · the venice courts need no box: their scan carries no mesh at all now (map-data meshDisabled) — its two 5.7 m walls
  //    of sideline clutter were the black slab on the right of the court, and its floor is painted over.
  const MAP_FLATTEN: Record<string, FlattenBox[]> = {
    penalty: [{ x: [-4.6, 4.6], z: [6.8, 12.0] }, { x: [-4.6, 4.6], z: [-12.0, -6.8] }],
  };
  const scanShiftZ = !location && spec.mapKey ? (MAP_SLIDE_Z[modeId] ?? 0) : 0;
  const flatten = !location && spec.mapKey ? MAP_FLATTEN[modeId] : undefined;
  // A meshDisabled map never puts a node in the scene — polling 80 times for one is 20 s of nothing.
  if ((scanShiftZ || flatten) && spec.mapKey && !MAPS[spec.mapKey]?.meshDisabled) {
    const key = `nexus_venue_map_${spec.mapKey}`; let tries = 0;
    const settle = (): void => {
      const node = ctx.scene.getTransformNodeByName(key);
      if (node) {
        if (flatten) { const n = flattenMapBoxes(node, flatten); console.info(`[NEXUS] map "${spec.mapKey}": flattened ${n} vertices in ${flatten.length} boxes`); }
        if (scanShiftZ) node.position.z += scanShiftZ;
        return;
      }
      if (tries++ < 80) setTimeout(settle, 250);
    };
    settle();
  }
  if (!location && /^basketball_/.test(modeId)) decorateVeniceBoardwalk(ctx.scene, built.root, scanShiftZ);   // owner 2026-09-05: the concept photo rebuilt as scenery
  void dressHoop(ctx.scene, built.root);   // owner 2026-09-05: the scanned Venice hoop stands in for the procedural one, every court, every location
  let props: VenuePropsHandle | null = null; let propsGone = false;
  if (propSet) void mountVenueProps(ctx.scene, propSet, built.root).then((h) => { if (propsGone) h?.dispose(); else props = h; });

  // M104: hand the shot back to the mode's follow-cam. The venue's ArcRotate
  // camera stays in the scene (its scenery is unaffected by which camera
  // renders) but is detached from input and no longer active, so the
  // CameraDirector the mode drives every frame is what the player sees.
  if (options.keepGameplayCamera && gameplayCam && gameplayCam !== built.camera) {
    try { built.camera.detachControl(); } catch { /* no canvas attached */ }
    ctx.scene.activeCamera = gameplayCam;
    console.info(`[NEXUS] mountVenue("${modeId}"): kept gameplay camera "${gameplayCam.name}" `
      + `active; venue camera "${built.camera.name}" is scenery-only.`);
  }

  // Hand the camera the venue footprint. Without this the M64 bounds clamp has
  // nothing to clamp against and the camera can leave the venue entirely — the
  // full-court 3v3 case that produced E26.
  // The footprint must include the ground's OFFSET, not just its size. Grounds
  // are centred on the origin by default, so `size` alone was the whole story
  // until half-court venues started offsetting theirs to sit around the half
  // actually played (1v1 and 3v3, so the painted key lands under the basket).
  //
  // Without the offset the camera is clamped to a box the court no longer
  // occupies. 3v3's ground is 18x20 offset +7.8 — spanning z -2.2..17.8 — but
  // the bounds said z -10..10, so the camera was pinned at z 8.8 (10 minus the
  // 1.2 margin) while asking to sit at 17.8. Pinned 2.8m behind the hero while
  // still holding the preset's full height, that is a ~60 degree pitch against a
  // preset declaring 28, and the hero drops out of the bottom of frame: the
  // [FEL-FRAME] lines that survived the 3v3 pass.
  // Phase 6: the camera may use the whole map, not just the painted ground. Union the ground box
  // with the map's measured walkabout bounds (map-data boundsMin/Max, world frame after mapOffset):
  // three-point's corner racks wanted the camera at x ±11 on a 16 m half-court box and were pinned
  // 4.0 m from the shooter. Occlusion still handles the fence; the box only stops escapes.
  const camBox = venueBounds(spec);
  const mapCfg = spec.mapKey ? MAPS[spec.mapKey] : undefined;
  if (mapCfg?.boundsMin && mapCfg.boundsMax) {
    const ox = mapCfg.mapOffset?.[0] ?? 0, oz = mapCfg.mapOffset?.[2] ?? 0;
    camBox.minX = Math.min(camBox.minX, mapCfg.boundsMin[0] + ox); camBox.maxX = Math.max(camBox.maxX, mapCfg.boundsMax[0] + ox);
    camBox.minZ = Math.min(camBox.minZ, mapCfg.boundsMin[2] + oz); camBox.maxZ = Math.max(camBox.maxZ, mapCfg.boundsMax[2] + oz);
  }
  ctx.camDirector?.setBounds?.(camBox);

  const placeholders = built.actors;
  // Ship Pass 6 phase 3 (owner: "fix the arms of the NPCs"): the spec's placeholder actors are armless capsules. Modes that
  // spawn real bodies are meant to call hidePlaceholders() and several never did (karate rails, skate rail, three-point
  // lanes). They now go on their own two and a half seconds after the mount — long enough for every mode's spawns to land.
  let disposed = false;
  const autoHide = setTimeout(() => { if (!disposed) for (const a of placeholders) a.getChildMeshes().forEach((m) => { m.isVisible = false; }); }, 2500);

  return {
    built,
    placeholders,
    get nav() { return nav; },
    constrain(pos: Vector3) { if (!nav) return false; const [x, z] = nav.constrain(pos.x, pos.z); pos.x = x; pos.z = z; return true; },
    hidePlaceholders() {
      for (const a of placeholders) {
        a.getChildMeshes().forEach((m) => { m.isVisible = false; });
      }
    },
    dispose() {
      disposed = true; clearTimeout(autoHide);
      ctx.camDirector?.invalidateBounds?.();
      propsGone = true; props?.dispose(); props = null;
      built.dispose();
    },
  };
}

// ── WIRING, per mode ──────────────────────────────────────────────────────
//
// In a ModeDefinition.load(ctx), REPLACING the VenueKit.buildCourt(...) call:
//
//   import { mountVenue } from '../core/NexusVenue';
//   let venue: VenueHandle | null = null;
//   …
//   venue = mountVenue(ctx, 'basketball_h2h');
//   …spawn characters as usual…
//   venue?.hidePlaceholders();
//
// and in dispose():
//
//   venue?.dispose(); venue = null;
//
// MODE ID MAPPING — the web routes and the Nexus mode ids are not the same
// strings, and guessing wrong yields a silent VenueKit fallback:
//
//   route /play/dunk        → 'basketball_dunk'
//   route /play/onevone     → 'basketball_h2h'
//   route /play/threevthree → 'basketball_3v3'
//   route /play/karate      → 'karate_endless'
//   route /play/carnival    → 'court_carnival'
export const ROUTE_TO_VENUE: Record<string, string> = {
  dunk: 'basketball_dunk',
  onevone: 'basketball_h2h',
  threevthree: 'basketball_3v3',
  karate: 'karate_endless',
  carnival: 'court_carnival',
  tennis: 'tennis',
  volleyball: 'volleyball',
  dance: 'dance',
};
