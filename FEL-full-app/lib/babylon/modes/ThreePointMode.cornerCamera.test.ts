// 3PT corner camera — the rim stays in frame, and unobstructed, at EVERY rack, on every screen, in every court location.
//
// HISTORY. HOOPS-10PHASE-2 (Oct 3 2026) found that the 'hoops' preset wants its camera ~13 m out past the sideline for a corner shooter and
// that CameraDirector.clampToBounds crushes it back onto basketball_h2h's 16x19 venue_ground; it mounted an invisible 34x30 box mesh
// (venue_box_3pt_cam_bounds) to give the camera room, and this test proved it on a CameraDirector with NO explicit bounds.
//
// CAM-FIXES (Oct 13 2026, owner playtest "you can't see the hoop when shooting from the corners") MEASURED the running rig (Playwright, all five
// court locations, desktop + phone portrait + phone landscape) and found that proof did not describe the game:
//   1. mountVenue hands the director an EXPLICIT box (CameraDirector.setBounds), and an explicit box ignores invalidateBounds(), so the mesh
//      never counted in the real mount. Venice only worked because its baked map's box is wide; in Blossom Park / Canopy Court / Night
//      Rooftop / Orbit the camera was pinned at x 6.8 and the rim sat 0.44 of a screen OFF the edge of a portrait phone, at both corner
//      racks, for 100 % of the frames. This test now builds the camera the way the mount does (setBounds first) and calls the mode's own
//      widenCamBounds(), so the control below fails if that call is removed.
//   2. With the camera finally where the preset wants it (x +-11.8), it stands in the trees Blossom Park and Canopy Court plant at x +-11, and a
//      canopy covered the hoop. The director cannot see decor, so ThreePointMode fades the leaf in the way (threePointOcclusion.ts).
// The playthrough below is the real thing: the real director, the real racks, the jog between them, a frame at a time at 60 Hz.
import { afterEach, describe, expect, it } from 'vitest';
import { Matrix, MeshBuilder, NullEngine, Ray, Scene, TargetCamera, TransformNode, Vector3 } from '@babylonjs/core';
import { CameraDirector } from '../core/CameraDirector';
import { venueBounds } from '../core/NexusVenue';
import { COURT_TREE_SPOTS, plantTrees } from '../nexus/courtLocations';
import { RACK_POS, RIM, CAM_BOUNDS_SIZE, CAM_BOUNDS_CENTER, widenCamBounds } from './ThreePointMode';
import { FADEABLE_DECOR, collectFadeLeaves, updateFade, type FadeLeaf, type Pt } from './threePointOcclusion';

/** basketball_h2h's NexusWebScene ground spec (venueSpecs.ts): size [16, 19], offset [0, 7.6]. */
const H2H = { ground: { size: [16, 19] as [number, number], offset: [0, 7.6] as [number, number] } };

/** Every screen the game is played on. The portrait phones are the narrow lenses (TargetCamera's FOV is vertical-fixed). */
const VIEWS = [
  { name: 'desktop 16:9', w: 1280, h: 720 },
  { name: 'laptop 16:10', w: 1440, h: 900 },
  { name: 'tablet portrait', w: 820, h: 1180 },
  { name: 'phone portrait 390x844', w: 390, h: 844 },
  { name: 'phone portrait 360x800', w: 360, h: 800 },
  { name: 'phone landscape 844x390', w: 844, h: 390 },
] as const;

type Decor = 'none' | 'blossom' | 'canopy';
const engines: NullEngine[] = [];
afterEach(() => { while (engines.length) engines.pop()!.dispose(); });

interface Rig { scene: Scene; camera: TargetCamera; dir: CameraDirector; leaves: FadeLeaf[]; w: number; h: number }

/** The mode's load() in the order it does it: the venue's ground and explicit box (mountVenue), the decor, then the camera box and snap. */
function buildRig(w: number, h: number, opts: { decor: Decor; widen: boolean; fade?: boolean }): Rig {
  const engine = new NullEngine({ renderWidth: w, renderHeight: h });
  engine.getDeltaTime = () => 1000 / 60;
  engines.push(engine);
  const scene = new Scene(engine);
  const ground = MeshBuilder.CreateGround('venue_ground', { width: 16, height: 19 }, scene);
  ground.position.set(0, 0, 7.6);
  if (opts.decor !== 'none') {
    const holder = new TransformNode('loc_holder', scene);
    const spots = opts.decor === 'canopy' ? COURT_TREE_SPOTS.map(([x, z, s]) => [x, z, s * 1.25] as [number, number, number]) : COURT_TREE_SPOTS;
    plantTrees(scene, holder, opts.decor, spots, ['#e8577f', '#f06292'], '#5a3d2e', 7);
  }
  const camera = new TargetCamera('cam', new Vector3(0, 3, -8), scene);
  camera.fov = 0.8;   // the harness does not override Babylon's default
  scene.activeCamera = camera;
  const dir = new CameraDirector(scene, camera, 'hoops');
  dir.setBounds(venueBounds(H2H));   // mountVenue: an EXPLICIT box, the ground alone (a court location has no baked map to widen it)
  if (opts.widen) {
    const box = MeshBuilder.CreateBox('venue_box_3pt_cam_bounds', CAM_BOUNDS_SIZE, scene);
    box.position.copyFrom(CAM_BOUNDS_CENTER); box.isVisible = false; box.isPickable = false;
    widenCamBounds(dir);
  }
  dir.snapTo(RACK_POS[0], RIM);
  scene.render();
  return { scene, camera, dir, leaves: opts.fade === false ? [] : collectFadeLeaves(scene.meshes), w, h };
}

const RIM_RING = new Vector3(RIM.x, RIM.y + 0.1, RIM.z);

interface P { x: number; y: number; ok: boolean }
interface Sample { rack: number; phase: 'hold' | 'jog'; frame: number; rim: P; shooter: P; blocked: number }

/** The real playthrough: hold at a rack (the meter, the release, the ball in the air), then the 0.85 s smoothstep jog to the next. */
function playThrough(rig: Rig, holdFrames = 80): Sample[] {
  const { scene, camera, dir, leaves, w, h } = rig;
  const dt = 1 / 60, MOVE_FRAMES = Math.round(0.85 / dt);
  const pos = RACK_POS[0].clone(), prev = pos.clone(), vel = Vector3.Zero();
  const out: Sample[] = [];
  const focus: Pt[] = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }];
  const project = (p: Vector3): P => {
    const s = Vector3.Project(p, Matrix.Identity(), scene.getTransformMatrix(), camera.viewport.toGlobal(w, h));
    return { x: s.x / w, y: s.y / h, ok: s.z > 0 && s.z < 1 };
  };
  const tick = (rack: number, phase: Sample['phase'], frame: number) => {
    vel.copyFrom(pos).subtractInPlace(prev).scaleInPlace(1 / dt); prev.copyFrom(pos);
    dir.update(pos, vel, RIM);
    focus[0].x = RIM_RING.x; focus[0].y = RIM_RING.y; focus[0].z = RIM_RING.z;
    focus[1].x = pos.x; focus[1].y = pos.y + 1.3; focus[1].z = pos.z;
    updateFade(leaves, camera.position, focus, dt);
    scene.render();
    // what actually stands in the way, asked of Babylon's own picker (not of the geometry the fade used)
    let blocked = 0;
    for (const f of focus) {
      const d = new Vector3(f.x, f.y, f.z).subtract(camera.position); const len = d.length();
      const ray = new Ray(camera.position.clone(), d.scale(1 / len), Math.max(0, len - 0.3));
      const hits = scene.multiPickWithRay(ray, (m) => FADEABLE_DECOR.test(m.name) && m.visibility > 0.5);
      if (hits && hits.some((x) => x.hit)) blocked++;
    }
    out.push({ rack, phase, frame, rim: project(RIM_RING), shooter: project(pos.add(new Vector3(0, 1.3, 0))), blocked });
  };
  for (let r = 0; r < RACK_POS.length; r++) {
    for (let f = 0; f < holdFrames; f++) tick(r, 'hold', f);
    if (r === RACK_POS.length - 1) break;
    const from = RACK_POS[r], to = RACK_POS[r + 1];
    for (let f = 1; f <= MOVE_FRAMES; f++) {
      const t = f / MOVE_FRAMES, k = t * t * (3 - 2 * t);
      Vector3.LerpToRef(from, to, k, pos);
      tick(r + 1, 'jog', f);
    }
  }
  return out;
}

const inFrame = (p: P, m: number) => p.ok && p.x > m && p.x < 1 - m && p.y > m && p.y < 1 - m;
/** The margin the rim must clear: 5 % of the viewport on every side. (Measured on the running rig after the fix: the worst frame is ~19 % in, on a phone.) */
const MARGIN = 0.05;
/** A leaf that has only just come between the lens and the rim has a moment to fade; no more than this many frames in a row (0.13 s). */
const MAX_BLOCKED_RUN = 8;

function longestRun(samples: Sample[]): number {
  let best = 0, run = 0;
  for (const s of samples) { run = s.blocked > 0 ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}

describe('3PT camera — the rim is in frame at every rack', () => {
  for (const decor of ['none', 'blossom', 'canopy'] as const) {
    for (const view of VIEWS) {
      it(`rim + shooter inside the viewport (margin ${MARGIN * 100}%) through hold and jog at all 5 racks — ${decor} court, ${view.name}`, () => {
        const samples = playThrough(buildRig(view.w, view.h, { decor, widen: true }));
        const bad = samples.filter((s) => !inFrame(s.rim, MARGIN) || !inFrame(s.shooter, MARGIN));
        expect(bad.map((s) => `rack ${s.rack + 1} ${s.phase}#${s.frame} rim ${s.rim.x.toFixed(2)},${s.rim.y.toFixed(2)} shooter ${s.shooter.x.toFixed(2)},${s.shooter.y.toFixed(2)}`).slice(0, 4)).toEqual([]);
        // every rack, both corners included, is actually in the run
        expect(new Set(samples.map((s) => s.rack)).size).toBe(5);
      });
    }
  }
});

describe('3PT camera — nothing stands between the lens and the rim', () => {
  for (const decor of ['blossom', 'canopy'] as const) {
    for (const view of [VIEWS[0], VIEWS[3], VIEWS[5]]) {
      it(`${decor} trees never hide the rim or the shooter for more than ${MAX_BLOCKED_RUN} frames, and are clear on every settled hold — ${view.name}`, () => {
        const samples = playThrough(buildRig(view.w, view.h, { decor, widen: true }));
        expect(longestRun(samples), 'longest run of blocked frames').toBeLessThanOrEqual(MAX_BLOCKED_RUN);
        const settled = samples.filter((s) => s.phase === 'hold' && s.frame >= 30);
        expect(settled.filter((s) => s.blocked > 0).length, 'blocked frames after the fade has had half a second').toBe(0);
      });
    }
  }
});

describe('3PT camera — controls: the regression can fail', () => {
  // These two ARE the mutation checks, kept alive: each undoes one half of the fix and the playthrough has to catch it.
  it('without widenCamBounds (the explicit mount box alone) the corner racks lose the rim on a portrait phone', () => {
    const samples = playThrough(buildRig(390, 844, { decor: 'none', widen: false }));
    const bad = samples.filter((s) => (s.rack === 0 || s.rack === 4) && !inFrame(s.rim, MARGIN));
    expect(bad.length).toBeGreaterThan(40);
  });
  it('without the fade the Blossom Park trees hide the rim at the corner rack for far longer than a fade takes', () => {
    const samples = playThrough(buildRig(390, 844, { decor: 'blossom', widen: true, fade: false }));
    expect(longestRun(samples)).toBeGreaterThan(MAX_BLOCKED_RUN * 4);
  });
});

describe('CameraDirector.extendBounds', () => {
  it('unions into an explicit box and keeps it explicit, so a later invalidateBounds() cannot throw the room away', () => {
    const { dir, camera } = buildRig(1280, 720, { decor: 'none', widen: false });
    dir.extendBounds({ minX: -17, maxX: 17, minZ: -8, maxZ: 22 });
    dir.invalidateBounds();   // what a preset change does: a no-op under an explicit box
    dir.snapTo(RACK_POS[0], RIM);
    expect(camera.position.x).toBeGreaterThan(8);   // the 16 m ground alone would have clamped it to 6.8
  });
});
