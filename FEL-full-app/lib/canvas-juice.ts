/**
 * Canvas Juice Utilities — screen shake, floating score popups, hit flash.
 * Import into any game-*.tsx and call from the game loop.
 */

/* ── Screen Shake ────────────────────────────────────── */
export interface ShakeState {
  t: number;      // remaining ms
  intensity: number;
  ox: number;     // current offset x
  oy: number;     // current offset y
}

export function createShake(): ShakeState {
  return { t: 0, intensity: 0, ox: 0, oy: 0 };
}

export function triggerShake(s: ShakeState, intensity = 6, durationMs = 200) {
  s.t = durationMs;
  s.intensity = intensity;
}

export function updateShake(s: ShakeState, dt: number) {
  if (s.t <= 0) { s.ox = 0; s.oy = 0; return; }
  s.t -= dt * 1000;
  const decay = Math.max(0, s.t / 200);
  s.ox = (Math.random() - 0.5) * 2 * s.intensity * decay;
  s.oy = (Math.random() - 0.5) * 2 * s.intensity * decay;
}

export function applyShake(ctx: CanvasRenderingContext2D, s: ShakeState) {
  if (s.ox || s.oy) ctx.translate(s.ox, s.oy);
}

export function resetShake(ctx: CanvasRenderingContext2D, s: ShakeState) {
  if (s.ox || s.oy) ctx.translate(-s.ox, -s.oy);
}

/* ── Floating Score Popups ───────────────────────────── */
export interface ScorePopup {
  text: string;
  x: number;
  y: number;
  t: number;    // remaining life (s)
  color: string;
}

export function createPopups(): ScorePopup[] { return []; }

export function addPopup(arr: ScorePopup[], text: string, x: number, y: number, color = '#00FF9D') {
  arr.push({ text, x, y, t: 1.0, color });
  if (arr.length > 12) arr.shift();
}

export function updatePopups(arr: ScorePopup[], dt: number) {
  for (let i = arr.length - 1; i >= 0; i--) {
    arr[i].t -= dt;
    arr[i].y -= 40 * dt;
    if (arr[i].t <= 0) arr.splice(i, 1);
  }
}

export function drawPopups(ctx: CanvasRenderingContext2D, arr: ScorePopup[]) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = 'bold 18px "Barlow Condensed", sans-serif';
  for (const p of arr) {
    const alpha = Math.max(0, p.t);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }
  ctx.restore();
}

/* ── Hit Flash ───────────────────────────────────────── */
export interface FlashState {
  t: number;      // remaining ms
  color: string;
}

export function createFlash(): FlashState {
  return { t: 0, color: '#fff' };
}

export function triggerFlash(f: FlashState, color = '#ffffff', durationMs = 80) {
  f.t = durationMs;
  f.color = color;
}

export function drawFlash(ctx: CanvasRenderingContext2D, f: FlashState, W: number, H: number, dt: number) {
  if (f.t <= 0) return;
  f.t -= dt * 1000;
  const alpha = Math.min(0.35, f.t / 80 * 0.35);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = f.color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/* ── Gamepad Utility ─────────────────────────────────── */
export interface GamepadState {
  a: boolean;       // face button A (action/confirm)
  b: boolean;       // face button B (secondary)
  x: boolean;       // face button X
  y: boolean;       // face button Y
  lb: boolean;      // left bumper
  rb: boolean;      // right bumper
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  lx: number;       // left stick X (-1..1)
  ly: number;       // left stick Y (-1..1)
  start: boolean;
}

export function createGamepadState(): GamepadState {
  return { a: false, b: false, x: false, y: false, lb: false, rb: false, up: false, down: false, left: false, right: false, lx: 0, ly: 0, start: false };
}

const DEADZONE = 0.2;

export function pollGamepad(gs: GamepadState): boolean {
  try {
    const pads = navigator?.getGamepads?.();
    if (!pads) return false;
    const gp = pads[0] || pads[1] || pads[2] || pads[3];
    if (!gp) return false;

    gs.a = !!gp.buttons[0]?.pressed;
    gs.b = !!gp.buttons[1]?.pressed;
    gs.x = !!gp.buttons[2]?.pressed;
    gs.y = !!gp.buttons[3]?.pressed;
    gs.lb = !!gp.buttons[4]?.pressed;
    gs.rb = !!gp.buttons[5]?.pressed;
    gs.up = !!gp.buttons[12]?.pressed;
    gs.down = !!gp.buttons[13]?.pressed;
    gs.left = !!gp.buttons[14]?.pressed;
    gs.right = !!gp.buttons[15]?.pressed;
    gs.start = !!gp.buttons[9]?.pressed;

    const lx = gp.axes[0] ?? 0;
    const ly = gp.axes[1] ?? 0;
    gs.lx = Math.abs(lx) > DEADZONE ? lx : 0;
    gs.ly = Math.abs(ly) > DEADZONE ? ly : 0;

    // also map stick to dpad
    if (gs.lx < -DEADZONE) gs.left = true;
    if (gs.lx > DEADZONE) gs.right = true;
    if (gs.ly < -DEADZONE) gs.up = true;
    if (gs.ly > DEADZONE) gs.down = true;

    return true;
  } catch { return false; }
}
