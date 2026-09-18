// lib/impact-system.ts
// FEL M8.3 — Shared Impact System
// ONE canonical module for climax feedback across ALL game modes (2D canvas + 3D R3F).
//
// DESIGN DECISION (documented per spec):
//   Hit-stop pauses BOTH logic AND render CONSISTENTLY by scaling the game's
//   delta-time (dt) toward zero during the freeze window. This is the SAME
//   mechanism used by the M8.2 dragon slow-mo (camera-director dt scaling), so
//   presentation and simulation never desync. When frozen, updateHitStop returns
//   a timeScale of 0 (or a small floor) and the caller multiplies its dt by it —
//   every timer, physics step, and animation advances by ~0, i.e. the whole
//   world holds. The hit-stop's OWN internal countdown uses realDt so it always
//   releases on schedule regardless of the frozen game clock.
//
// Building blocks (composable — a mode picks what it needs):
//   - HitStop : brief full-freeze (dunk rim contact, KO, big strike)
//   - Flash   : screen/overlay bloom (crowd pop, rim reaction, KO)
//   - Burst   : particle pop (crowd celebration, death, wave clear)
//   - Squash  : compression pop (landing crouch, impact recoil)
//
// Flash/Squash are render-agnostic: the same state drives a 2D canvas fillRect
// OR a 3D DOM radial-gradient overlay / avatar scale. Burst draws to a 2D canvas;
// 3D modes use Flash overlays for crowd pops instead of DOM particles.
//
// ALL feel magnitudes are marked // TUNE(elijah) — Elijah owns the numbers.

// ----------------------------------------------------------------------------
// HIT-STOP
// ----------------------------------------------------------------------------

export interface HitStopState {
  active: boolean;
  t: number;          // elapsed real seconds inside the freeze
  duration: number;   // total freeze length (real seconds)
  timeScale: number;  // multiply game dt by this (0 = frozen, 1 = normal)
}

export function createHitStop(): HitStopState {
  return { active: false, t: 0, duration: 0, timeScale: 1 };
}

// duration in SECONDS. Common values:
//   ~0.033 = 2 frames @60 (dunk rim tap)   // TUNE(elijah)
//   ~0.30  = KO / round-ending blow         // TUNE(elijah)
export function triggerHitStop(s: HitStopState, duration: number): void {
  // Take the stronger of any in-flight freeze so a big hit is never shortened.
  if (s.active && s.duration - s.t > duration) return;
  s.active = true;
  s.t = 0;
  s.duration = duration;
  s.timeScale = 0;
}

// Advance the freeze by REAL delta-time. Returns the timeScale the caller
// should multiply its own game dt by this frame.
export function updateHitStop(s: HitStopState, realDt: number): number {
  if (!s.active) return 1;
  s.t += realDt;
  if (s.t >= s.duration) {
    s.active = false;
    s.t = 0;
    s.duration = 0;
    s.timeScale = 1;
    return 1;
  }
  s.timeScale = 0; // full hold // TUNE(elijah) — set a small floor (e.g. 0.05) for a "heavy" drag instead of dead stop
  return s.timeScale;
}

// ----------------------------------------------------------------------------
// FLASH (render-agnostic bloom)
// ----------------------------------------------------------------------------

export interface FlashState {
  alpha: number;   // current opacity 0..1 (read by renderer)
  color: string;   // css/hex color
  decay: number;   // alpha units per second
}

export function createFlash(): FlashState {
  return { alpha: 0, color: '#ffffff', decay: 3 };
}

// intensity 0..1 initial opacity; decay in alpha/sec (higher = snappier)
export function triggerFlash(
  s: FlashState,
  color: string,
  intensity = 0.6,   // TUNE(elijah)
  decay = 3,         // TUNE(elijah)
): void {
  s.color = color;
  s.alpha = Math.max(s.alpha, intensity);
  s.decay = decay;
}

export function updateFlash(s: FlashState, realDt: number): void {
  if (s.alpha <= 0) return;
  s.alpha = Math.max(0, s.alpha - s.decay * realDt);
}

// 2D canvas draw helper (full-screen tint). 3D modes read s.alpha for a DOM div.
export function drawFlash(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  s: FlashState,
): void {
  if (s.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = s.alpha;
  ctx.fillStyle = s.color;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

// ----------------------------------------------------------------------------
// BURST (particle pop)
// ----------------------------------------------------------------------------

export interface ImpactParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;     // remaining seconds
  maxLife: number;
  size: number;
  color: string;
}

export interface BurstState {
  particles: ImpactParticle[];
}

export function createBurst(): BurstState {
  return { particles: [] };
}

export interface BurstOpts {
  colors?: string[];   // sampled per-particle
  speed?: number;      // base outward speed (px/s)
  spread?: number;     // vertical bias (negative = pop upward)
  life?: number;       // seconds
  size?: number;       // base radius px
  gravity?: number;    // px/s^2 downward applied in update
}

export function spawnBurst(
  s: BurstState,
  x: number,
  y: number,
  count = 18,           // TUNE(elijah)
  opts: BurstOpts = {},
): void {
  const colors = opts.colors ?? ['#FFD700', '#00E5FF', '#ffffff']; // TUNE(elijah)
  const speed = opts.speed ?? 220;   // TUNE(elijah)
  const spread = opts.spread ?? -60; // TUNE(elijah) upward bias
  const life = opts.life ?? 0.7;     // TUNE(elijah)
  const size = opts.size ?? 3;       // TUNE(elijah)
  for (let i = 0; i < count; i++) {
    const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
    const sp = speed * (0.5 + Math.random());
    s.particles.push({
      x,
      y,
      vx: Math.cos(ang) * sp,
      vy: Math.sin(ang) * sp + spread,
      life,
      maxLife: life,
      size: size * (0.6 + Math.random() * 0.8),
      color: colors[(Math.random() * colors.length) | 0],
    });
  }
}

// gravity default keeps confetti falling. Pass through opts at spawn if needed.
export function updateBurst(s: BurstState, realDt: number, gravity = 320): void {
  if (!s.particles.length) return;
  for (const p of s.particles) {
    p.life -= realDt;
    p.x += p.vx * realDt;
    p.y += p.vy * realDt;
    p.vy += gravity * realDt; // TUNE(elijah)
  }
  s.particles = s.particles.filter((p) => p.life > 0);
}

export function drawBurst(ctx: CanvasRenderingContext2D, s: BurstState): void {
  if (!s.particles.length) return;
  ctx.save();
  for (const p of s.particles) {
    const a = Math.max(0, p.life / p.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function burstActive(s: BurstState): boolean {
  return s.particles.length > 0;
}

// ----------------------------------------------------------------------------
// SQUASH (compression pop — landing crouch / recoil)
// ----------------------------------------------------------------------------

export interface SquashState {
  active: boolean;
  t: number;
  duration: number;
  amount: number; // peak compression 0..1 (0.2 = 20% squash)
}

export function createSquash(): SquashState {
  return { active: false, t: 0, duration: 0, amount: 0 };
}

// duration seconds, amount 0..1 peak compression. // TUNE(elijah)
export function triggerSquash(s: SquashState, duration = 0.22, amount = 0.18): void {
  s.active = true;
  s.t = 0;
  s.duration = duration;
  s.amount = amount;
}

// Returns compression factor 0..amount (0 at rest, peaks mid, eases back).
// Renderer: scaleY = 1 - factor ; scaleXZ = 1 + factor*0.5 (volume-ish pop).
export function updateSquash(s: SquashState, realDt: number): number {
  if (!s.active) return 0;
  s.t += realDt;
  if (s.t >= s.duration) {
    s.active = false;
    s.t = 0;
    return 0;
  }
  const k = s.t / s.duration;        // 0..1
  return Math.sin(k * Math.PI) * s.amount; // rise then settle // TUNE(elijah)
}

export function squashActive(s: SquashState): boolean {
  return s.active;
}

// ----------------------------------------------------------------------------
// CONVENIENCE — a mode can hold one bundle instead of four fields.
// ----------------------------------------------------------------------------

export interface ImpactBundle {
  hitStop: HitStopState;
  flash: FlashState;
  burst: BurstState;
  squash: SquashState;
}

export function createImpactBundle(): ImpactBundle {
  return {
    hitStop: createHitStop(),
    flash: createFlash(),
    burst: createBurst(),
    squash: createSquash(),
  };
}
