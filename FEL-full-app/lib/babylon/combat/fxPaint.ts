// FX PAINT — the combat visuals' procedural sprites (visual pass, lane/vis-combat, 2026-10-13).
//
// Every one of these is a pure function over a 2-D context: no Babylon, no DynamicTexture, no scene. combatFx.ts and
// arenaBuild.ts hand them a canvas; a test hands them a recording stub and asks what was drawn. The sprites are white
// (or white-hot) with alpha, because the particle and the material tint them: one star texture serves a gold jab and a
// cyan parry. Nothing is downloaded; a sprite is 64–256 px and built once per scene.

export type Ctx = CanvasRenderingContext2D;

/** Seeded rng so a painted sprite is the same every load (and testable). */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** A soft round dot: the streak sparks' body (stretched along the flight by the particle). */
export function paintDot(ctx: Ctx, size: number): void {
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
}

/**
 * The impact STAR: a hot core, a four-point glint (long vertical and horizontal spikes, short diagonals). The thing an
 * anime hit-frame and every fighting game's contact flash is drawn as; a round dot never reads as a hit.
 */
export function paintStar(ctx: Ctx, size: number): void {
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const spike = (angle: number, len: number, halfWidth: number, alpha: number): void => {
    ctx.save(); ctx.translate(c, c); ctx.rotate(angle);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -halfWidth); ctx.lineTo(len, 0); ctx.lineTo(0, halfWidth); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  for (let k = 0; k < 4; k++) spike((k * Math.PI) / 2, c * 0.98, size * 0.045, 1);              // the long cross
  for (let k = 0; k < 4; k++) spike(Math.PI / 4 + (k * Math.PI) / 2, c * 0.52, size * 0.03, 0.7);   // the short diagonals
  const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.42);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
}

/** A thin bright ring with a soft inner and outer edge: the parry ring, the shockwave, the clash flash. */
export function paintRing(ctx: Ctx, size: number): void {
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const r = c * 0.82, w = c * 0.16;
  const g = ctx.createRadialGradient(c, c, r - w * 1.6, c, c, r + w * 1.6);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.42, 'rgba(255,255,255,0.55)'); g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.58, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
}

/** A puff of smoke: a clump of soft discs, white in the middle, so a tinted particle reads as a cloud and not a ball. */
export function paintSmoke(ctx: Ctx, size: number, seed = 5): void {
  const r = rng(seed), c = size / 2;
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2, d = r() * c * 0.38, rad = c * (0.28 + r() * 0.26);
    const x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/** A flame tongue: a teardrop, white-hot in the core and soft at the rim, so a colour gradient on the particle runs
 *  yellow to red up it. Three nested copies, each smaller and brighter, give a hot centre in a cooler body. */
export function paintFlame(ctx: Ctx, w: number, h: number): void {
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2;
  const tongue = (scale: number, alpha: number, lean: number): void => {
    const bw = w * 0.46 * scale, top = h * (1 - 0.94 * scale), bot = h * 0.97, mid = h * 0.62;
    const g = ctx.createLinearGradient(0, bot, 0, top);
    g.addColorStop(0, `rgba(255,255,255,${alpha})`); g.addColorStop(0.55, `rgba(255,255,255,${alpha * 0.7})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, bot);
    ctx.bezierCurveTo(cx - bw * 1.25, bot, cx - bw * 1.15, mid, cx - bw * 0.35 + lean, top + (mid - top) * 0.35);
    ctx.quadraticCurveTo(cx + lean * 1.4, top + (mid - top) * 0.1, cx + lean * 2, top);
    ctx.quadraticCurveTo(cx + bw * 0.5 + lean, top + (mid - top) * 0.45, cx + bw * 1.0, mid);
    ctx.bezierCurveTo(cx + bw * 1.2, bot, cx + bw * 0.4, bot, cx, bot);
    ctx.closePath(); ctx.fill();
  };
  tongue(1, 0.55, w * 0.04); tongue(0.78, 0.7, -w * 0.02); tongue(0.5, 0.95, 0);
}

/** A ground crack: jagged lines out from the middle, dark with a hot seam, on transparent. Used flat on the floor. */
export function paintCrack(ctx: Ctx, size: number, seed = 3, seam = '#ffb070'): void {
  const r = rng(seed), c = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = 'round';
  const branch = (x: number, y: number, ang: number, len: number, width: number, depth: number): void => {
    let px = x, py = y, a = ang;
    const steps = Math.max(3, Math.round(len / 14));
    for (let i = 0; i < steps; i++) {
      a += (r() - 0.5) * 0.7;
      const nx = px + Math.cos(a) * (len / steps), ny = py + Math.sin(a) * (len / steps);
      const fade = 1 - i / steps;
      ctx.strokeStyle = 'rgba(8,6,5,0.9)'; ctx.lineWidth = width * (0.4 + fade * 0.6) + 2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke();
      ctx.strokeStyle = seam; ctx.globalAlpha = 0.55 * fade; ctx.lineWidth = Math.max(1, width * 0.28 * fade);
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(nx, ny); ctx.stroke(); ctx.globalAlpha = 1;
      if (depth > 0 && r() < 0.28) branch(nx, ny, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), len * 0.45, width * 0.6, depth - 1);
      px = nx; py = ny;
    }
  };
  const n = 7 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) branch(c, c, (k / n) * Math.PI * 2 + r() * 0.4, c * (0.55 + r() * 0.4), 9, 2);
  // the crater: a darker dent where the impact landed
  const g = ctx.createRadialGradient(c, c, 0, c, c, c * 0.26);
  g.addColorStop(0, 'rgba(10,8,6,0.8)'); g.addColorStop(1, 'rgba(10,8,6,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
}

/** A scorch / scuff: a soft dark oval with a sooty edge. Where a fire pit's embers or a hard landing left a mark. */
export function paintScorch(ctx: Ctx, size: number, seed = 9): void {
  const r = rng(seed), c = size / 2;
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 6; i++) {
    const x = c + (r() - 0.5) * c * 0.5, y = c + (r() - 0.5) * c * 0.5, rad = c * (0.45 + r() * 0.4);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(12,9,7,0.55)'); g.addColorStop(1, 'rgba(12,9,7,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

/**
 * The aura column: bright at the feet, thinning upward, with vertical streaks of energy and a bright edge on both sides
 * (a cylinder seen from the side is brightest at its silhouette). Wraps horizontally, so it scrolls.
 */
export function paintAuraColumn(ctx: Ctx, w: number, h: number, seed = 21): void {
  const r = rng(seed);
  ctx.clearRect(0, 0, w, h);
  const base = ctx.createLinearGradient(0, h, 0, 0);
  base.addColorStop(0, 'rgba(255,255,255,0.95)'); base.addColorStop(0.35, 'rgba(255,255,255,0.4)'); base.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
  // streaks: tall thin bright ribbons that break the column into flames of energy
  for (let i = 0; i < 26; i++) {
    const x = r() * w, sw = 2 + r() * 7, top = h * (0.05 + r() * 0.5);
    const g = ctx.createLinearGradient(0, h, 0, top);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x, top, sw, h - top);
    if (x + sw > w) ctx.fillRect(x - w, top, sw, h - top);   // wrap, so the seam does not show
  }
  // darker gaps between: knock the base back where there is no streak, a little, so the column is not a solid sheet
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 14; i++) {
    const x = r() * w, gw = 6 + r() * 14;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    ctx.fillStyle = g; ctx.fillRect(x, 0, gw, h);
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** A broad soft pool of light for the floor: additive, round, brightest in the middle. */
export function paintLightPool(ctx: Ctx, size: number): void {
  const c = size / 2;
  ctx.clearRect(0, 0, size, size);
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.3, 'rgba(255,255,255,0.45)'); g.addColorStop(0.65, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
}

/** A speed-line burst: thin white rays pointing at a clear centre, for the anime ultimate (a 2-D overlay, not a scene mesh). */
export function paintSpeedLines(ctx: Ctx, w: number, h: number, seed = 33, rays = 110, rgb = '255,255,255'): void {
  const r = rng(seed);
  ctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h / 2, far = Math.hypot(w, h) / 2, near = far * 0.3;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2 + (r() - 0.5) * 0.045;
    const inner = near * (0.95 + r() * 0.7), outer = far * (0.85 + r() * 0.25), halfW = outer * (0.0035 + r() * r() * 0.016);
    const tx = cx + Math.cos(a) * inner, ty = cy + Math.sin(a) * inner, ox = cx + Math.cos(a) * outer, oy = cy + Math.sin(a) * outer;
    const px = Math.cos(a + Math.PI / 2) * halfW, py = Math.sin(a + Math.PI / 2) * halfW;
    const g = ctx.createLinearGradient(tx, ty, ox, oy);
    g.addColorStop(0, `rgba(${rgb},0)`); g.addColorStop(0.5, `rgba(${rgb},0.55)`); g.addColorStop(1, `rgba(${rgb},0.95)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(ox + px, oy + py); ctx.lineTo(ox - px, oy - py); ctx.closePath(); ctx.fill();
  }
}
