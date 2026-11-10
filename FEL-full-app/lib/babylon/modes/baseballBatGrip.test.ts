// BAT-GRIP (owner, 2026-11-03): "The character holds the bat upside down in the baseball modes."
//
// Cause, measured: bat.glb's handle is its THIN end at file (−0.40, −0.17, 0). Babylon's glTF loader hangs the file under a
// __root__ node turned 180° about Y with Z scaled −1, so that point loads at (+0.40, −0.17, 0): the file's X is mirrored.
// batGlbFit turned the FILE's handle→barrel onto +Y, so the loaded bat came out turned 134° the wrong way, with the barrel
// down by the fists and the knob out past them. The old fit test passed because it did the fit's math on file coordinates
// and never loaded the file.
//
// These tests load the real bat.glb (headless, the loader's own __root__ included), dress it through the code the modes
// run (fitBatModel, batHandleEnd), place it through placeTwoHandBat on a stand-in body, and read where the GLB's own THIN
// and THICK ends land against the fists. Both sides of the latch, the stance and mid-swing.
import { readFileSync } from 'node:fs';
import { describe, expect, it, beforeAll } from 'vitest';
import { NullEngine, Scene, SceneLoader, TransformNode, Vector3, VertexBuffer, Quaternion, MeshBuilder, FreeCamera, type AbstractMesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF/index.js';
import { batGlbFit, batGlbInScene, batHandleEnd, batHeld, batGripHeld, dressBatGlb, fitBatModel, placeTwoHandBat, BAT_GLB_HANDLE, BAT_GLB_BARREL, BAT_GRIP_BACK_M, BAT_GRIP_LOST_M, BAT_LEN, BAT_KNOB_M, type BatBones } from './baseballBat';
import { batLineAt } from '../anim/authored/baseball';

type V3 = [number, number, number];

/** The GLB's thin and thick ends in world space, found from its own vertices (radius near each end of its long axis). */
function glbEnds(meshes: AbstractMesh[]): { thin: Vector3; thick: Vector3; rThin: number; rThick: number } {
  const vs: Vector3[] = [];
  for (const m of meshes) {
    const pos = m.getVerticesData(VertexBuffer.PositionKind); if (!pos) continue;
    m.computeWorldMatrix(true); const w = m.getWorldMatrix();
    for (let i = 0; i < pos.length; i += 3) vs.push(Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), w));
  }
  const c0 = vs.reduce((s, v) => s.addInPlace(v), new Vector3()).scaleInPlace(1 / vs.length);
  let p1 = vs[0]; for (const v of vs) if (v.subtract(c0).length() > p1.subtract(c0).length()) p1 = v;
  let p2 = vs[0]; for (const v of vs) if (v.subtract(p1).length() > p2.subtract(p1).length()) p2 = v;
  // the principal axis (power iteration on the covariance), oriented p1 → p2: the rim-to-rim diagonal is ~5° off it
  const cov = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const v of vs) { const d = [v.x - c0.x, v.y - c0.y, v.z - c0.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i * 3 + j] += d[i] * d[j]; }
  let e = [p2.x - p1.x, p2.y - p1.y, p2.z - p1.z];
  for (let it = 0; it < 50; it++) { const n = [0, 1, 2].map((i) => cov[i * 3] * e[0] + cov[i * 3 + 1] * e[1] + cov[i * 3 + 2] * e[2]); const l = Math.hypot(n[0], n[1], n[2]) || 1; e = n.map((x) => x / l); }
  const ax = new Vector3(e[0], e[1], e[2]); const L = p2.subtract(p1).length();

  const rad = (lo: number, hi: number) => {
    let s = 0, n = 0;
    for (const v of vs) { const t = Vector3.Dot(v.subtract(p1), ax) / L; if (t < lo || t > hi) continue; const d = v.subtract(p1); s += d.subtract(ax.scale(Vector3.Dot(d, ax))).length(); n++; }
    return n ? s / n : 0;
  };
  const r1 = rad(0.05, 0.3), r2 = rad(0.7, 0.95);
  // the ends ON the bat's axis (through the centroid), not the extreme surface vertices (a knob's rim sits ~3 cm off it)
  let tLo = Infinity, tHi = -Infinity;
  for (const v of vs) { const t = Vector3.Dot(v.subtract(c0), ax); if (t < tLo) tLo = t; if (t > tHi) tHi = t; }
  const a1 = c0.add(ax.scale(tLo)), a2 = c0.add(ax.scale(tHi));   // a1 is p1's end (ax runs p1 → p2)
  return r1 < r2 ? { thin: a1, thick: a2, rThin: r1, rThick: r2 } : { thin: a2, thick: a1, rThin: r2, rThick: r1 };
}

let scene: Scene;
let model: TransformNode;
beforeAll(async () => {
  scene = new Scene(new NullEngine());
  new FreeCamera('cam', new Vector3(0, 1, -5), scene);
  const data = readFileSync('public/models/meshy/bat.glb');
  const c = await SceneLoader.LoadAssetContainerAsync('data:;base64,', data.toString('base64'), scene, null, '.glb');
  c.addAllToScene();
  model = new TransformNode('bat_model', scene);
  for (const n of c.rootNodes) n.parent = model;   // as spawnMeshyProp does: the loader's __root__ stays under it
});

describe('bat.glb as the loader leaves it', () => {
  it("the file's handle (its thin end) loads at the mirrored X: batGlbInScene says where", () => {
    const e = glbEnds(model.getChildMeshes());
    expect(e.rThin).toBeLessThan(e.rThick * 0.7);   // the probe can tell a handle from a barrel (the control)
    const h = batGlbInScene(BAT_GLB_HANDLE), b = batGlbInScene(BAT_GLB_BARREL);
    expect(Vector3.Distance(e.thin, new Vector3(...h))).toBeLessThan(0.06);
    expect(Vector3.Distance(e.thick, new Vector3(...b))).toBeLessThan(0.06);
    expect(Math.sign(e.thin.x)).toBe(-Math.sign(BAT_GLB_HANDLE[0]));   // the file's X, mirrored
  });
});

describe('fitBatModel: the handle at the wrapper origin, the barrel up +Y', () => {
  it('the pure fit maps the loaded handle to the origin and the loaded barrel to (0, BAT_LEN)', () => {
    const f = batGlbFit();
    const tf = (v: readonly number[]) => {
      const x = v[0] * f.scale, y = v[1] * f.scale;
      return [x * Math.cos(f.rotZ) - y * Math.sin(f.rotZ), x * Math.sin(f.rotZ) + y * Math.cos(f.rotZ) + f.offsetY];
    };
    const h = tf(batGlbInScene(BAT_GLB_HANDLE)), b = tf(batGlbInScene(BAT_GLB_BARREL));
    expect(h[0]).toBeCloseTo(0, 6); expect(h[1]).toBeCloseTo(0, 6);
    expect(b[0]).toBeCloseTo(0, 6); expect(b[1]).toBeCloseTo(BAT_LEN, 6);
  });

  it('on the real file: the thin end within 3 cm of the origin, the thick end up +Y', () => {
    const wrap = new TransformNode('wrap0', scene);
    fitBatModel(model, BAT_LEN); model.parent = wrap;
    const e = glbEnds(model.getChildMeshes());
    expect(e.thin.length()).toBeLessThan(0.03);
    const dir = e.thick.subtract(e.thin).normalize();
    expect(dir.y).toBeGreaterThan(0.995);
    model.parent = null;
  });
});

/** A stand-in batter: shoulders across ±x (the side the latch reads), two fists together in front of the chest. */
function body(rightSign: 1 | -1): { root: TransformNode; bones: BatBones } {
  const root = new TransformNode(`root${rightSign}`, scene);
  const at = (n: string, p: V3) => { const t = new TransformNode(`${n}${rightSign}`, scene); t.position.set(...p); return t; };
  const bones = {
    lsh: at('lsh', [-0.2 * rightSign, 1.45, 0]), rsh: at('rsh', [0.2 * rightSign, 1.45, 0]),
    lf: at('lf', [-0.05, 1.05, 0.15]), rf: at('rf', [0.05, 1.05, 0.15]),
    lh: at('lh', [-0.01, 1.1, 0.35]), rh: at('rh', [0.01, 1.15, 0.36]),
  } as unknown as BatBones;
  return { root, bones };
}

describe('placed in the hands: the handle at the fists, the barrel out along the swing line', () => {
  for (const side of [1, -1] as const) {
    for (const [label, sec] of [['stance', null], ['mid-swing', 0.22]] as const) {
      it(`side ${side > 0 ? '+' : '−'}x, ${label}`, () => {
        const { root, bones } = body(side);
        const carrier = MeshBuilder.CreateCylinder(`carrier_${side}_${label}`, { height: BAT_LEN, diameter: 0.05 }, scene);
        carrier.rotationQuaternion = new Quaternion();
        let swing: number | null = null;
        let latched = 0;
        const obs = placeTwoHandBat(scene, root, bones, carrier, () => swing, (s) => { latched = s; });
        scene.render();                 // the stance frame latches the side
        expect(latched).toBe(side);
        swing = sec; scene.render();
        scene.onBeforeRenderObservable.remove(obs);

        // the wrapper, exactly as dressBatGlb places it, with the real file fitted under it
        const wrap = new TransformNode(`wrap_${side}_${label}`, scene);
        wrap.rotationQuaternion = new Quaternion();
        batHandleEnd(carrier, BAT_LEN, wrap.position);
        wrap.rotationQuaternion.copyFrom(carrier.rotationQuaternion!);
        fitBatModel(model, BAT_LEN); model.parent = wrap;
        const e = glbEnds(model.getChildMeshes());
        model.parent = null;

        const fist = (h: TransformNode, f: TransformNode) => h.position.add(h.position.subtract(f.position).normalize().scale(0.07));
        const grip = fist(bones.lh as unknown as TransformNode, bones.lf as unknown as TransformNode)
          .add(fist(bones.rh as unknown as TransformNode, bones.rf as unknown as TransformNode)).scale(0.5);
        // the handle (thin) end just past the fists: the knob overhang, give or take the GLB's own knob
        expect(Vector3.Distance(e.thin, grip)).toBeLessThan(BAT_KNOB_M + 0.05);
        // the barrel (thick) end a bat-length away, and the bat points along the line placeTwoHandBat computed
        expect(Vector3.Distance(e.thick, grip)).toBeGreaterThan(BAT_LEN - BAT_KNOB_M - 0.06);
        const along = carrier.getWorldMatrix().getRotationMatrix();
        const up = Vector3.TransformNormal(Vector3.Up(), along).normalize();
        expect(Vector3.Dot(e.thick.subtract(e.thin).normalize(), up)).toBeGreaterThan(0.99);
        // the swing line itself (batLineAt in the root frame, the side applied): the barrel is on its side of the fists
        const d = batLineAt(sec);
        const line = new Vector3(d[0] * side, d[1], d[2]).normalize();
        expect(Vector3.Dot(e.thick.subtract(grip).normalize(), line)).toBeGreaterThan(0.5);
        carrier.dispose(); wrap.dispose();
      });
    }
  }
});

// BAT-GRIP-2 (2026-11-10): the bat is drawn only while both fists can be on it. placeTwoHandBat strings the handle between
// the two fists whatever the arms are doing, so a batter whose arms were not in a batting clip had a bat hanging between
// two far-apart hands (the real clips, replayed: baseballBatHeld.test.ts).
describe('the bat hides while the fists are apart', () => {
  it('batGripHeld: lost past BAT_GRIP_LOST_M, back under BAT_GRIP_BACK_M, steady in the gap between', () => {
    expect(BAT_GRIP_BACK_M).toBeLessThan(BAT_GRIP_LOST_M);
    expect(batGripHeld(true, 0.07)).toBe(true);           // a held stance
    expect(batGripHeld(true, 0.30)).toBe(true);           // the widest two-handed swing rig-grip-tests allows
    expect(batGripHeld(true, 0.36)).toBe(true);           // the swing → stance blend at its widest (0.35 m): still drawn
    expect(batGripHeld(true, 0.51)).toBe(false);          // the innings' idle → stance blend
    expect(batGripHeld(true, 0.80)).toBe(false);          // the innings' run → stance blend
    expect(batGripHeld(false, 0.35)).toBe(false);         // no flicker in the gap
    expect(batGripHeld(false, 0.10)).toBe(true);          // the hands come together: the bat is back
  });
  it('the knobs: lost at its 2 m maximum never hides (the old behaviour), and back never sits above lost', () => {
    for (const sep of [0.07, 0.5, 0.8, 1.2]) expect(batGripHeld(true, sep, 2, BAT_GRIP_BACK_M)).toBe(true);
    expect(batGripHeld(false, 0.28, 0.25, 0.4)).toBe(false);   // back 0.4 over lost 0.25: back is held to lost
    expect(batGripHeld(false, 0.24, 0.25, 0.4)).toBe(true);
  });

  for (const look of ['cylinder', 'glb'] as const) {
    it(`placeTwoHandBat marks the grip, and the ${look} look follows it on the same frame`, () => {
      const { root, bones } = body(1);
      const carrier = MeshBuilder.CreateCylinder(`carrier_grip_${look}`, { height: BAT_LEN, diameter: 0.05 }, scene);
      carrier.rotationQuaternion = new Quaternion();
      // the modes' own order: the look first, then the placement
      const lookH = dressBatGlb(scene, carrier, BAT_LEN, look);
      const obs = placeTwoHandBat(scene, root, bones, carrier, () => null);
      const shown = () => look === 'cylinder' ? carrier.isVisible : (carrier.isVisible || !!scene.getTransformNodeByName(`${carrier.name}_glb`)?.isEnabled());
      scene.render();
      expect(batHeld(carrier)).toBe(true);
      expect(shown()).toBe(true);
      // the hands come apart (0.72 m: free arms): hidden on that very frame, not one late
      const lh = bones.lh as unknown as TransformNode, rh = bones.rh as unknown as TransformNode;
      lh.position.x -= 0.35; rh.position.x += 0.35;
      scene.render();
      expect(batHeld(carrier)).toBe(false);
      expect(shown()).toBe(false);
      // the mode switching the bat on (the innings, on the first stance frame) does not draw a bat nobody holds
      lookH.setVisible(false); lookH.setVisible(true);
      expect(shown()).toBe(false);
      // back together: drawn again, on that frame
      lh.position.x += 0.35; rh.position.x -= 0.35;
      scene.render();
      expect(batHeld(carrier)).toBe(true);
      expect(shown()).toBe(true);
      // and the mode's own hide still wins over a held grip
      lookH.setVisible(false); scene.render();
      expect(shown()).toBe(false);
      scene.onBeforeRenderObservable.remove(obs); lookH.dispose(); carrier.dispose();
    });
  }
});
