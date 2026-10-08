// ShotMeter3D — THE SHOT METER, in the world (owner, 2026-09-18: "put a shot meter"). The 2K read: a bar beside the
// shooter's head that fills as the shot rises, with the GREEN release window drawn on it (and the perfect band inside
// that), a marker riding the fill, and the verdict flashed on the release — green for a perfect / good release, amber
// early or late, red for a brick — then a fade. The HUD's own bar at the bottom of the screen stays; this one is where
// the player is looking. Pure numbers come from the mode's ShotMeter (greenCenter01 / greenHalfWidth01): this only draws.
import { Color3, MeshBuilder, ShaderMaterial, TransformNode, Vector3, Vector4, type Camera, type Scene } from '@babylonjs/core';

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

// IMPROVE (2026-10-06, 1v1 #19): ONE QUAD. The bar was six alpha-blended planes with six materials (the frame, the back, the fill,
// the green, the perfect band, the marker): six sorted transparent draws a frame beside the shooter's head, and `set()` built a new
// camera direction every frame. It is one plane now, sized to the widest and tallest of the six (the marker, the frame), and one
// shader composites the six layers in the order they used to stack, back to front, each at its own colour and alpha — the "over"
// of the layers, blended once, is the same pixel the six blends made. Same public API, same look; the numbers below are the old
// planes' sizes.
const QW = W + 0.05, QH = H + 0.03;   // the marker's width, the frame's height

const VERT = `precision highp float;
attribute vec3 position;
uniform mat4 worldViewProjection;
varying vec2 vPos;
void main(void) {
  vPos = position.xy;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

// vPos is the quad's own local point in metres (the bar centred on the origin), so nothing here depends on a UV convention.
const FRAG = `precision highp float;
varying vec2 vPos;
uniform vec4 uBox;      // x bar width, y bar height, z fill top (m above the bar's foot), w marker y (local)
uniform vec4 uGreen;    // x green centre y (local), y green half-height, z perfect half-height, w the whole bar's alpha factor
uniform vec3 uFillColor;
uniform vec3 uMarkColor;
vec4 layer(vec4 acc, vec3 c, float a, bool inside) {
  if (!inside) return acc;
  return vec4(c * a + acc.rgb * (1.0 - a), a + acc.a * (1.0 - a));
}
void main(void) {
  float w = uBox.x, h = uBox.y, k = uGreen.w;
  float ax = abs(vPos.x), y = vPos.y, foot = -0.5 * h;
  vec4 acc = vec4(0.0);
  acc = layer(acc, vec3(1.0), 0.35 * k, ax <= 0.5 * (w + 0.03) && abs(y) <= 0.5 * (h + 0.03));                                  // the frame
  acc = layer(acc, vec3(0.043137, 0.070588, 0.12549), 0.72 * k, ax <= 0.5 * w && abs(y) <= 0.5 * h);                          // the back (0b1220)
  acc = layer(acc, uFillColor, 0.95 * k, ax <= 0.5 * (w - 0.02) && y >= foot && y <= foot + uBox.z);                        // the fill
  acc = layer(acc, vec3(0.223529, 1.0, 0.533333), 0.55 * k, ax <= 0.5 * w && abs(y - uGreen.x) <= uGreen.y);               // the green (39ff88)
  acc = layer(acc, vec3(0.909804, 1.0, 0.941176), 0.9 * k, ax <= 0.5 * w && abs(y - uGreen.x) <= uGreen.z);                 // the perfect band (e8fff0)
  acc = layer(acc, uMarkColor, k, ax <= 0.5 * (w + 0.05) && abs(y - uBox.w) <= 0.01);                                       // the marker
  if (acc.a <= 0.0001) discard;
  gl_FragColor = vec4(acc.rgb / acc.a, acc.a);
}`;

/** A direction scratch and the camera's local +X, so `set()` builds nothing (it was `cam.getDirection(Vector3.Right())`: two vectors a frame). */
const RIGHT_AXIS = new Vector3(1, 0, 0);

export function mountShotMeter3D(scene: Scene): ShotMeter3DHandle {
  const root = new TransformNode('shot_meter_3d', scene);
  root.billboardMode = TransformNode.BILLBOARDMODE_ALL;
  const mat = new ShaderMaterial('shot_meter_m', scene, { vertexSource: VERT, fragmentSource: FRAG }, {
    attributes: ['position'], uniforms: ['worldViewProjection', 'uBox', 'uGreen', 'uFillColor', 'uMarkColor'], needAlphaBlending: true,
  });
  mat.backFaceCulling = false; mat.disableDepthWrite = true;
  const quad = MeshBuilder.CreatePlane('shot_meter', { width: QW, height: QH }, scene);
  quad.material = mat; quad.parent = root; quad.isPickable = false; quad.renderingGroupId = 2;   // group 2: over the bodies
  const right = new Vector3();
  const fillColor = Color3.FromHexString('#22d3ee'), markColor = Color3.White();
  let fillTop = 0.001, markY = -H / 2, greenY = 0, greenHalf = 0, perfectHalf = 0;
  let shown = false, fading = 0, flash = 0, lastT = 0;
  let alphaK = 1;
  const box = new Vector4(W, H, 0.001, -H / 2), greenU = new Vector4(0, 0, 0, 1);
  const upload = (): void => {
    box.z = fillTop; box.w = markY; greenU.set(greenY, greenHalf, perfectHalf, alphaK);
    mat.setVector4('uBox', box); mat.setVector4('uGreen', greenU);
    mat.setColor3('uFillColor', fillColor); mat.setColor3('uMarkColor', markColor);
  };
  const show = (on: boolean) => { shown = on; quad.isVisible = on; };
  const setAlpha = (k: number) => { if (k === alphaK) return; alphaK = k; upload(); };
  const yOf = (t: number) => -H / 2 + t * H;
  const setGreen = (g: { center: number; half: number; perfectHalf?: number }) => {
    const half = Math.max(0.012, g.half), c = Math.max(half, Math.min(1 - half, g.center));
    greenHalf = half * H; greenY = yOf(c);
    perfectHalf = Math.min(half, g.perfectHalf ?? half * 0.35) * H;   // HOOPS-DEPTH S6: the band drawn IS the band graded
    upload();
  };
  show(false); upload();
  return {
    green(g) { if (shown && fading <= 0) setGreen(g); },
    begin(g) {
      fillColor.copyFromFloats(0x22 / 255, 0xd3 / 255, 0xee / 255); markColor.copyFromFloats(1, 1, 1);
      fading = 0; flash = 0; lastT = 0; alphaK = 1;
      fillTop = 0.001; markY = -H / 2;
      setGreen(g);   // (uploads everything above with it)
      show(true);
    },
    set(t, head) {
      if (!shown || fading > 0) return;
      const k = Math.max(0, Math.min(1, t)); lastT = k;
      fillTop = Math.max(0.001, k * H); markY = yOf(k);
      upload();
      const cam: Camera | null = scene.activeCamera;
      if (cam) cam.getDirectionToRef(RIGHT_AXIS, right); else right.copyFrom(RIGHT_AXIS);
      right.y = 0; if (right.lengthSquared() > 1e-6) right.normalize();
      root.position.copyFrom(head);
      root.position.addInPlaceFromFloats(right.x * SIDE, right.y * SIDE + UP, right.z * SIDE);
    },
    end(verdict) {
      if (!shown || fading > 0) return;   // idempotent: a mode may call end() every frame the shot is over
      const c = Color3.FromHexString(verdict ? VERDICT_HEX[verdict] : '#ffffff');
      fillColor.copyFrom(c); markColor.copyFrom(c);
      markY = yOf(lastT);
      upload();
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
    dispose() { quad.dispose(); mat.dispose(); root.dispose(); },
  };
}
