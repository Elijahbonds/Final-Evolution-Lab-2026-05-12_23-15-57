// ShotMeter3D — THE SHOT METER, in the world (owner, 2026-09-18: "put a shot meter"). The 2K read: a bar beside the
// shooter's head that fills as the shot rises, with the GREEN release window drawn on it (and the perfect band inside
// that), a marker riding the fill, and the verdict flashed on the release — green for a perfect / good release, amber
// early or late, red for a brick — then a fade. The HUD's own bar at the bottom of the screen stays; this one is where
// the player is looking. Pure numbers come from the mode's ShotMeter (greenCenter01 / greenHalfWidth01): this only draws.
import { Color3, Mesh, MeshBuilder, StandardMaterial, TransformNode, Vector3, type Camera, type Scene } from '@babylonjs/core';

export type MeterVerdict = 'perfect' | 'good' | 'early' | 'late' | 'brick' | 'held' | null;

export interface ShotMeter3DHandle {
  /** Show the bar with the green window at `center ± half` (0..1 of the bar), and the perfect band inside it at `± perfectHalf`
   *  (default 0.35 of the half — the ShotMeter's own grade; a mode with its own bands passes the one it grades by). */
  begin(green: { center: number; half: number; perfectHalf?: number }): void;
  /** Move the green while the bar runs (the dunk contest's window narrows with every style tap). */
  green(green: { center: number; half: number; perfectHalf?: number }): void;
  /** Each frame while the meter runs: the fill (0..1) and the point the bar hangs beside (the shooter's head). */
  set(t: number, head: Vector3): void;
  /** The release: flash the verdict on the bar where the marker stopped, then fade out. */
  end(verdict: MeterVerdict): void;
  /** Time the flash / fade; call every frame. */
  update(dt: number): void;
  visible(): boolean;
  dispose(): void;
}

const H = 1.1, W = 0.14, SIDE = 0.56, UP = 0.2;   // bar height / width (m), how far beside and above the head
const VERDICT_HEX: Record<Exclude<MeterVerdict, null>, string> = {
  perfect: '#39ff88', good: '#8cff5c', early: '#ffb340', late: '#ffb340', brick: '#ff4b4b', held: '#ffd166',
};

function unlit(scene: Scene, name: string, hex: string, alpha = 1): StandardMaterial {
  const m = new StandardMaterial(name, scene);
  m.disableLighting = true; m.emissiveColor = Color3.FromHexString(hex); m.diffuseColor = Color3.Black(); m.specularColor = Color3.Black();
  m.alpha = alpha; m.backFaceCulling = false; m.disableDepthWrite = true;
  return m;
}

export function mountShotMeter3D(scene: Scene): ShotMeter3DHandle {
  const root = new TransformNode('shot_meter_3d', scene);
  root.billboardMode = TransformNode.BILLBOARDMODE_ALL;
  const back = unlit(scene, 'shot_meter_back_m', '#0b1220', 0.72);
  const fillM = unlit(scene, 'shot_meter_fill_m', '#22d3ee', 0.95);
  const greenM = unlit(scene, 'shot_meter_green_m', '#39ff88', 0.55);
  const perfectM = unlit(scene, 'shot_meter_perfect_m', '#e8fff0', 0.9);
  const markM = unlit(scene, 'shot_meter_mark_m', '#ffffff', 1);
  const frameM = unlit(scene, 'shot_meter_frame_m', '#ffffff', 0.35);
  const mats = [back, fillM, greenM, perfectM, markM, frameM];
  const plane = (name: string, w: number, h: number, m: StandardMaterial, z: number): Mesh => {
    const p = MeshBuilder.CreatePlane(name, { width: w, height: h }, scene);
    p.material = m; p.parent = root; p.isPickable = false; p.renderingGroupId = 2; p.position.z = z;   // group 2: over the bodies
    return p;
  };
  const frame = plane('shot_meter_frame', W + 0.03, H + 0.03, frameM, 0.002);
  const bg = plane('shot_meter_back', W, H, back, 0.001);
  const fill = plane('shot_meter_fill', W - 0.02, 1, fillM, 0);       // scaled in y from the bottom
  const green = plane('shot_meter_green', W, 1, greenM, -0.001);
  const perfect = plane('shot_meter_perfect', W, 1, perfectM, -0.002);
  const mark = plane('shot_meter_mark', W + 0.05, 0.02, markM, -0.003);
  const all = [frame, bg, fill, green, perfect, mark];
  let shown = false, fading = 0, flash = 0, lastT = 0;
  let alphaK = 1;
  const baseAlpha = mats.map((m) => m.alpha);
  const show = (on: boolean) => { shown = on; for (const p of all) p.isVisible = on; };
  const setAlpha = (k: number) => { if (k === alphaK) return; alphaK = k; mats.forEach((m, i) => { m.alpha = baseAlpha[i] * k; }); };
  const yOf = (t: number) => -H / 2 + t * H;
  const setGreen = (g: { center: number; half: number; perfectHalf?: number }) => {
    const half = Math.max(0.012, g.half), c = Math.max(half, Math.min(1 - half, g.center));
    green.scaling.y = half * 2 * H; green.position.y = yOf(c);
    perfect.scaling.y = Math.min(half, g.perfectHalf ?? half * 0.35) * 2 * H; perfect.position.y = yOf(c);   // HOOPS-DEPTH S6: the band drawn IS the band graded
  };
  show(false);
  return {
    green(g) { if (shown && fading <= 0) setGreen(g); },
    begin(g) {
      setGreen(g);
      fillM.emissiveColor = Color3.FromHexString('#22d3ee'); markM.emissiveColor = Color3.White();
      fading = 0; flash = 0; lastT = 0; setAlpha(1);
      fill.scaling.y = 0.001; fill.position.y = -H / 2; mark.position.y = -H / 2;
      show(true);
    },
    set(t, head) {
      if (!shown || fading > 0) return;
      const k = Math.max(0, Math.min(1, t)); lastT = k;
      fill.scaling.y = Math.max(0.001, k * H); fill.position.y = -H / 2 + (k * H) / 2;
      mark.position.y = yOf(k);
      const cam: Camera | null = scene.activeCamera;
      const right = cam ? cam.getDirection(Vector3.Right()) : Vector3.Right();
      right.y = 0; if (right.lengthSquared() > 1e-6) right.normalize();
      root.position.copyFrom(head).addInPlace(right.scale(SIDE)); root.position.y += UP;
    },
    end(verdict) {
      if (!shown || fading > 0) return;   // idempotent: a mode may call end() every frame the shot is over
      const hex = verdict ? VERDICT_HEX[verdict] : '#ffffff';
      fillM.emissiveColor = Color3.FromHexString(hex); markM.emissiveColor = Color3.FromHexString(hex);
      mark.position.y = yOf(lastT);
      flash = 0.12; fading = 0.001;   // the flash holds bright, then the whole bar fades over FADE_S
    },
    update(dt) {
      if (!shown || fading <= 0) return;
      fading += dt;
      if (fading < flash) return;
      const k = 1 - Math.min(1, (fading - flash) / 0.45);
      setAlpha(k);
      if (k <= 0) { show(false); fading = 0; setAlpha(1); }
    },
    visible: () => shown,
    dispose() { for (const p of all) p.dispose(); for (const m of mats) m.dispose(); root.dispose(); },
  };
}
