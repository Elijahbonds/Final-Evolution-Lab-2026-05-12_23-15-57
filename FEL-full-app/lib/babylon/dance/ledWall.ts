// THE CYPHER'S LED WALL — an animated screen where the banner stand-in was (vis-party, 2026-10-13;
// docs/VISUAL-PASS-PLAN.md Part B, dance: "a real LED wall: an animated procedural DynamicTexture, beat-synced patterns, the
// player's name, replacing the banner stand-in").
//
// The wall is a grid of lit CELLS painted into one canvas and shown as an emissive texture, the way a real LED panel is a
// grid of pixels. What each cell shows is a pure function of the song's beat/bar position (`ledCell`, below), so:
//   · the wall is on the song's clock, never the frame's — a pause freezes it, a count-back-in resyncs it (beatBus.ts's rule);
//   · the patterns can be argued with in a test without a canvas;
//   · "reduce flashing" has one switch: `calm` holds a pattern for the whole bar (it changes once a bar, softly) instead of
//     stepping on every beat, and the cheer burst is skipped — the "stops lamp/LED strobing" rule (PLAN phase 8 (c)).
// The mesh is deliberately NOT named for the foundation's GlowLayer include list (scene/EmissiveGlow.ts GLOW_MESH matches
// `led_?wall`): a glow layer draws the halo over whatever stands in front (an include list does not occlude — its own header
// says so), and a 15 m screen behind the dancer washed him out to a white ghost on the first capture. Bloom alone gives the
// wall its light; the small cans on the moving heads, which no body stands in front of, keep the halo.
//
// Cost: one plane, one PBR material, one DynamicTexture re-uploaded only when the frame's key changes (about 8 Hz).

import { Color3, DynamicTexture, Mesh, MeshBuilder, PBRMaterial, type Scene } from '@babylonjs/core';

/** TUNED (new): how hard the wall emits. At 1.0 the foundation's glow layer and bloom turned a 15 m screen into a white wash over the dancer. */
export const LED_GAIN = 0.75;
export const LED_COLS = 48;
export const LED_ROWS = 12;

export type LedKind = 'name' | 'eq' | 'chevron' | 'rings';
/** The wall's phrase, one pattern per bar. Bar −1 and below (the count-in) show the name card. */
const SEQUENCE: readonly LedKind[] = ['name', 'eq', 'chevron', 'eq', 'rings', 'chevron'];
export function ledKindAt(barIndex: number): LedKind {
  if (barIndex < 0) return 'name';
  return SEQUENCE[barIndex % SEQUENCE.length];
}

/** The two colours a bar is lit in (bottom → top of the wall), cycling with the bar. Hex, so a test can read them. */
const PALETTE: readonly (readonly [string, string])[] = [
  ['#FF2D95', '#00E5FF'], ['#FFD60A', '#7B5CFF'], ['#00E5FF', '#FF2D95'], ['#7B5CFF', '#FFD60A'],
];
export function ledColors(barIndex: number): readonly [string, string] {
  return PALETTE[((Math.floor(barIndex) % PALETTE.length) + PALETTE.length) % PALETTE.length];
}

export interface LedState {
  beatIndex: number; beatPhase: number; barIndex: number;
  /** BeatBus.cheerPulse — a streak or an S grade flares the wall. */
  cheer: number;
  /** Reduced flashing / motion: hold a pattern for the whole bar and take out the flare. */
  calm: boolean;
}

/** A small deterministic hash 0..1 — the same (a, b) is the same value on every machine. */
export function hash01(a: number, b = 0): number {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

const frac = (v: number): number => v - Math.floor(v);

/**
 * How lit cell (col, row) is, 0..1 (row 0 is the TOP of the wall). Pure: a function of the cell and the state alone.
 * In `calm` the beat steps become bar steps and the beat's own phase is held at 0, so nothing on the wall changes inside a bar.
 */
export function ledCell(kind: LedKind, col: number, row: number, s: LedState): number {
  const step = s.calm ? Math.floor(s.barIndex) * 3 : s.beatIndex;   // 3, not 4: the chevron's stripe period is 8 and rings'/eq's steps must not repeat bar to bar
  const ph = s.calm ? 0 : s.beatPhase;
  switch (kind) {
    case 'eq': {
      // equaliser bars: each column rises to a height drawn per beat and eases from the last beat's, topped by a bright cap
      const h = (b: number): number => 0.18 + 0.75 * hash01(col * 7.3, b);
      const from = h(step - 1), to = h(step);
      const k = 1 - Math.exp(-ph * 9);
      const height = (from + (to - from) * k) * LED_ROWS;
      const fromBottom = LED_ROWS - 1 - row;
      if (fromBottom + 1 > height + 0.5) return 0;
      return fromBottom + 1 > height - 0.5 ? 1 : 0.55 + 0.25 * (fromBottom / LED_ROWS);
    }
    case 'chevron': {
      // diagonal chevrons that scroll one stripe a beat
      const mid = (LED_ROWS - 1) / 2;
      const pos = col + Math.abs(row - mid) * 2.2 - (step + ph * 0.6) * 2;
      const w = frac(pos / 8);
      return w < 0.45 ? 1 : w < 0.55 ? 0.4 : 0.06;
    }
    case 'rings': {
      // rings opening from the centre, one a beat
      const dx = (col - (LED_COLS - 1) / 2) / 2.4, dy = row - (LED_ROWS - 1) / 2;
      const d = Math.hypot(dx, dy);
      const w = frac(d / 3.2 - (step + ph) * 0.55);
      return w < 0.28 ? 1 - w * 1.8 : 0.05;
    }
    default: {
      // the name card: faint scan-lines for the text to sit on, which breathe once a bar
      return row % 2 === 0 ? 0.22 : 0.1;
    }
  }
}

/** The key a frame is repainted on: the pattern, the step inside it (quarter-beats; whole bars when calm) and the cheer. */
export function ledFrameKey(s: LedState): string {
  const kind = ledKindAt(s.barIndex);
  const cheer = s.calm ? 0 : Math.round(Math.min(1.5, s.cheer) * 4);
  if (kind === 'name') return `name|${Math.floor(s.barIndex)}|${cheer}`;   // the card does not move inside a bar
  return s.calm ? `${kind}|${Math.floor(s.barIndex)}` : `${kind}|${s.beatIndex}|${Math.floor(s.beatPhase * 4)}|${cheer}`;
}

/** The lines the name card cycles through, by bar: the room, the player (when the device has one), the song. */
export function ledCardText(barIndex: number, track: string, player: string): string {
  const lines = ['THE CYPHER', player ? player : '', track].filter((l) => l.length > 0);
  return lines[Math.floor(Math.max(0, barIndex) / SEQUENCE.length) % lines.length];
}

export interface LedWallOptions {
  /** World position of the wall's centre and its size, metres. The wall faces −z (toward the stage camera). */
  at: [number, number, number];
  width: number;
  height: number;
  /** Phones paint half the resolution. */
  small: boolean;
  /** The song's title and the player's party name (device-local), for the name card. */
  track: string;
  player?: string;
}

export interface LedWallHandle {
  mesh: Mesh;
  /** Repaint if the frame's key moved. Returns whether it repainted (tests, cost accounting). */
  update(s: LedState): boolean;
  setTrack(track: string): void;
  dispose(): void;
}

export function mountLedWall(scene: Scene, o: LedWallOptions): LedWallHandle {
  const cell = o.small ? 8 : 16;
  const W = LED_COLS * cell, H = LED_ROWS * cell;
  const tex = new DynamicTexture('dance_ledwall_tex', { width: W, height: H }, scene, false);
  const g = tex.getContext() as unknown as CanvasRenderingContext2D;
  const mesh = MeshBuilder.CreatePlane('dance_screen_panel', { width: o.width, height: o.height }, scene);
  mesh.position.set(o.at[0], o.at[1], o.at[2]);
  mesh.isPickable = false;
  // An emissive texture over a black albedo. (Measured 2026-10-13: an UNLIT albedo texture over-exposed to a white wash under the
  // rig's bloom, and with a flipped u it drew black; the emissive path renders the painted colours and flips cleanly.) The plane's
  // front looks down +z from behind; the stage camera is on the −z side, so the picture is painted mirrored (paint() flips the canvas)
  // to read forwards. (A negative uScale was tried first: a dynamic texture clamps, so the flipped coordinates sampled one edge
  // texel and the whole panel drew a flat colour.)
  const mat = new PBRMaterial('dance_screen_mat', scene);
  mat.albedoColor = Color3.Black();
  mat.emissiveTexture = tex;
  mat.emissiveColor = new Color3(LED_GAIN, LED_GAIN, LED_GAIN);
  mat.roughness = 1; mat.metallic = 0;
  mesh.material = mat;
  let track = o.track;
  let lastKey = '';
  const font = (px: number): string => `900 ${px}px "Arial Black", Impact, system-ui, sans-serif`;

  function paint(s: LedState): void {
    g.setTransform(-1, 0, 0, 1, W, 0);   // mirrored in x: see the material's note
    const kind = ledKindAt(s.barIndex);
    const [c0, c1] = ledColors(s.barIndex);
    g.fillStyle = '#04010a'; g.fillRect(0, 0, W, H);
    const a = Color3.FromHexString(c0), b = Color3.FromHexString(c1);
    const flare = s.calm ? 0 : Math.min(1, s.cheer) * 0.5;
    for (let r = 0; r < LED_ROWS; r++) {
      const k = r / (LED_ROWS - 1);   // 0 top .. 1 bottom
      const cr = Math.round((b.r + (a.r - b.r) * k) * 255), cg = Math.round((b.g + (a.g - b.g) * k) * 255), cb = Math.round((b.b + (a.b - b.b) * k) * 255);
      for (let c = 0; c < LED_COLS; c++) {
        const v = Math.min(1, ledCell(kind, c, r, s) + flare * 0.5);
        if (v < 0.03) continue;
        g.fillStyle = `rgba(${cr},${cg},${cb},${v.toFixed(2)})`;
        g.fillRect(c * cell + 1, r * cell + 1, cell - 2, cell - 2);
      }
    }
    if (kind === 'name' || flare > 0.35) {
      const text = kind === 'name' ? ledCardText(s.barIndex, track, o.player ?? '') : track;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      let px = Math.round(H * 0.62);
      g.font = font(px);
      const wText = g.measureText(text).width;
      if (wText > W * 0.9) { px = Math.max(10, Math.floor((px * W * 0.9) / wText)); g.font = font(px); }
      g.shadowColor = c1; g.shadowBlur = cell * 2.5;
      g.fillStyle = '#ffffff'; g.fillText(text, W / 2, H / 2 + px * 0.04);
      g.shadowBlur = 0;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    tex.update(false);
  }

  return {
    mesh,
    update(s) {
      const key = ledFrameKey(s);
      if (key === lastKey) return false;
      lastKey = key;
      paint(s);
      return true;
    },
    setTrack(t) { if (t !== track) { track = t; lastKey = ''; } },
    dispose() { mesh.dispose(false, true); tex.dispose(); },
  };
}
