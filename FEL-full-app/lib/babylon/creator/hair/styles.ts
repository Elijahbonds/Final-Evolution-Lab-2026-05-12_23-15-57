// THE STYLES (2026-10-07, the hair expansion; owner: all four packs, every style a DISTINCT silhouette). One recipe per
// catalog name (lib/closet/wearable-catalog HAIR_STYLES), built from the primitives (prims.ts) against the head's own
// measurements (headKit.ts). Pure.
//
// HOW THE TEXTURED AND PROTECTIVE STYLES ARE BUILT (they are the first pack, and built as what they are):
//   Locs        ~40 ropes (≈1.2 cm), lumpy, rounded ends, from roots all over the scalp, to the shoulders; a dark under-
//               layer so no scalp shows between them.
//   Box Braids  ~50 thinner braids (≈0.85 cm) with the plait's zig-zag, each from its own square part (a raised pad with
//               the scalp showing round it), long, down the back.
//   Twists      ~50 two-strand twists (a two-lobed helix), shoulder length.
//   Cornrows    braided rows lying flat on the scalp, straight back, front hairline to nape, the parting between rows bare,
//               short braided ends.
//   Bantu Knots coiled knots on their own sections, the parting bare between them.
//   Afro Puffs  two coily puffs high on the head over a tight coily base.
//   Afro        a round coily ball, its volume standing off the head from the hairline.
// Every number is a first guess, flagged TUNED in the commit: the owner's eye is the judge.

import { HeadKit, DEG } from './headKit';
import { angOf, dirOf } from './headField';
import {
  K, add, clumps, coil, coilKnot, cross, curtain, hash, len, mix, noise3, norm, rayColumn, rayEllipsoid, scalpRoots, scale, shell, smooth, strands, sub, tail,
  type Ctx, type V3,
} from './prims';
import { TEX, keyed, type TexBand } from './geo';

type Recipe = (c: Ctx) => void;

// ── shared pieces ────────────────────────────────────────────────────────────────────────────────────────────────────

const std = (c: Ctx) => (a: number) => c.k.hairline(a, 'standard');
/** A thin, slick cap combed towards a point (the hair under a ponytail, a bun, a knot): faint comb lines. */
function slickCap(c: Ctx, toward: V3, opts: { t?: number; part?: boolean; kind?: 'standard' | 'ears' } = {}): void {
  const t = opts.t ?? 0.0055;
  shell(c, {
    low: (a) => c.k.hairline(a, opts.kind ?? 'standard'),
    outer: (_a, _b, s, e) => s + t * smooth(0, 0.01, e),
    attrs: (a, b, e) => {
      const d = dirOf(a, b);
      // comb lines run towards `toward`: shade by the angle round it
      const side = cross(norm(toward), d);
      const lines = 0.86 + 0.14 * Math.sin(Math.atan2(side[0], side[2] + 1e-6) * 22 + (side[1] * 30));
      const part = opts.part ? smooth(0.0025, 0.006, Math.abs(d[0]) * c.k.r(a, b)) : 1;
      return { shade: lines, dens: Math.min(part, 0.35 + 0.65 * smooth(0, 0.008, e)) };
    },
  });
}

/** A fade: `top` thickness above the fade line `fadeY(a)`, down to bare skin at the hairline below it. */
function fadeCap(c: Ctx, o: { top: (a: number, b: number, s: number) => number; fadeY: (a: number) => number; side?: number; band?: number; texture?: number }): void {
  const band = o.band ?? 0.02;
  // the fade line never dips under the hairline (over the forehead the hairline is the higher of the two): a fade line
  // below it read as a bare scalp on top (seen in the Studio 2026-10-07)
  const fadeAt = (a: number) => Math.max(o.fadeY(a), c.k.hairline(a) + 0.012);
  shell(c, {
    low: std(c), rows: Math.round(c.d.rows * 1.3),
    outer: (a, b, s, e) => {
      const y = s * Math.sin(b), f = fadeAt(a);
      const k = smooth(f - band * 0.3, f + band, y);
      const sideT = (o.side ?? 0.0025) * smooth(0, 0.012, e);
      const tex = o.texture ? coil(scale(dirOf(a, b), s), 70, o.texture).off * k : 0;
      return s + mix(sideT, o.top(a, b, s), k) + tex;
    },
    attrs: (a, b, e, _h, r, s) => {
      const y = s * Math.sin(b), f = fadeAt(a);
      const dens = mix(0.08, 1, smooth(c.k.hairline(a) + 0.002, f + 0.006, y)) * mix(0.6, 1, smooth(0, 0.006, e));
      const sh = o.texture ? coil(scale(dirOf(a, b), r), 70, o.texture).shade : 1;
      return { dens, shade: sh };
    },
  });
}

/** A ridge along the head's midline from the front hairline to the nape (a mohawk's crest, a durag's seam). `h(u, v)`:
 *  height off the scalp at u (0 front → 1 back) and v (−1 right → 1 left). */
function ridge(c: Ctx, w: number, h: (u: number, v: number) => number, opts: { from?: number; to?: number; rows?: number; cols?: number; attrs?: (u: number, v: number) => Record<string, number> } = {}): void {
  const k = c.k;
  const rows = opts.rows ?? Math.round(c.d.rows * 2.2), cols = opts.cols ?? 8;
  const phi0 = opts.from ?? (90 - Math.atan2(k.L.hairFront, k.L.foreheadZ) / DEG) * DEG;   // from straight up, forwards
  const phi1 = opts.to ?? 150 * DEG;
  c.g.grid(rows, cols, (r, cc) => {
    const u = r / rows, v = -1 + (2 * cc) / cols;
    const phi = mix(-phi0, phi1, u);   // 0 = straight up; negative forward
    const dir: V3 = [0, Math.cos(phi), Math.sin(-phi)];
    const from: V3 = [v * w, 0, 0];
    const base = k.rayToScalp(from, dir) ?? add(from, dir, 0.1);
    return { p: add(base, norm([v * 0.15, dir[1], dir[2]]), 0.0015 + h(u, v)), along: u, ...(opts.attrs?.(u, v) ?? {}) };
  }, { out: (p) => [p[0] * 0.3, p[1], p[2]] });
}

/** A small square pad of hair on the scalp around a root (a box braid's part; a bantu knot's base). */
function pad(c: Ctx, a: number, b: number, half: number, t: number, coily = 0): void {
  const k = c.k;
  const r0 = k.r(a, b);
  const da = half / Math.max(0.03, r0 * Math.cos(b)), db = half / r0;
  c.g.grid(3, 3, (r, cc) => {
    const aa = a + (-1 + (2 * cc) / 3) * da, bb = b + (-1 + (2 * r) / 3) * db;
    const edge = Math.min(r, 3 - r, cc, 3 - cc) > 0 ? 1 : 0.3;
    const s = k.r(aa, bb);
    const cl = coily ? coil(scale(dirOf(aa, bb), s), 120, coily) : null;
    return { p: scale(dirOf(aa, bb), s + 0.0012 + t * edge + (cl?.off ?? 0)), shade: (cl?.shade ?? 0.92) * 0.9 };
  }, { out: (p) => p });
}

// ── the recipes ──────────────────────────────────────────────────────────────────────────────────────────────────────

const R: Record<string, Recipe> = {};

// ── pack 2: fades & cuts ─────────────────────────────────────────────────────────────────────────────────────────────

R['Buzz'] = (c) => shell(c, {
  low: std(c),
  outer: (a, b, s, e) => s + 0.0032 * smooth(0, 0.008, e),
  attrs: (a, b, e, _h, r) => ({ dens: 0.25 + 0.55 * smooth(0, 0.01, e), shade: coil(scale(dirOf(a, b), r), 140, 0).shade * 0.95 }),
});

R['Fade'] = (c) => fadeCap(c, {
  fadeY: () => c.k.L.ear.top + 0.032,
  top: (a, b) => 0.02 + 0.006 * smooth(-0.3, 0.9, Math.cos(a)) * Math.sin(b),
  texture: 0.0025,
});

R['Taper'] = (c) => fadeCap(c, {
  // a low taper: the hair stays on the sides; only the last 1.5 cm at the nape and the sideburns thins out
  fadeY: (a) => c.k.hairline(a) + 0.016,
  top: (a, b) => 0.011 + 0.006 * Math.max(0, Math.sin(b)),
  side: 0.004, band: 0.012, texture: 0.0018,
});

R['Drop Fade'] = (c) => {
  const k = c.k;
  // the fade line drops behind the ear towards the nape
  const fadeY = (a: number) => keyed([[0, k.L.ear.top + 0.035], [80, k.L.ear.top + 0.03], [110, k.L.ear.top + 0.01], [150, k.L.nape + 0.02], [180, k.L.nape + 0.015]], Math.abs(a) / DEG);
  // a hard part on the left: a bare line along the side of the top
  const partY = (a: number) => k.L.ear.top + 0.05 + 0.012 * Math.cos(a);
  fadeCap(c, {
    fadeY,
    top: (a, b, s) => {
      const y = s * Math.sin(b);
      const onPart = a > 18 * DEG && a < 135 * DEG ? 1 - smooth(0.0025, 0.007, Math.abs(y - partY(a))) : 0;
      return 0.024 * (1 - onPart) + 0.0005;
    },
    texture: 0.002,
  });
  // the part line itself is bare skin: a thin strip laid in the groove
  c.g.with({ kind: K.skin }, () => c.g.grid(Math.round(c.d.rows * 1.5), 1, (r, cc) => {
    const a = mix(20 * DEG, 132 * DEG, r / Math.round(c.d.rows * 1.5));
    const b = k.betaAt(a, partY(a) + (cc ? 0.0022 : -0.0022));
    return { p: k.surf(a, b, 0.0018), dens: 0 };
  }, { out: (p) => p }));
};

R['Cropped'] = (c) => shell(c, {
  // a short textured crop with a little fringe brushed forward
  low: (a) => c.k.hairline(a) - 0.012 * smooth(40 * DEG, 0, Math.abs(a)),
  outer: (a, b, s, e) => {
    const t = 0.009 + 0.008 * Math.max(0, Math.sin(b)) + 0.004 * smooth(-0.2, 1, Math.cos(a)) * Math.max(0, Math.sin(b));
    const ch = coil(scale(dirOf(a, b), s), 38, 0.0035);
    return s + (t + ch.off) * smooth(0, 0.012, e) + 0.002;
  },
  attrs: (a, b, e, _h, r) => ({ shade: coil(scale(dirOf(a, b), r), 38, 0).shade, dens: 0.6 + 0.4 * smooth(0, 0.008, e) }),
});

R['Waves'] = (c) => {
  // 360 waves: a short brushed cap, ridges in rings round a whorl at the crown's back, a slight swirl
  const wa = Math.PI, wb = 62 * DEG;
  const whorl = dirOf(wa, wb);
  const phase = (a: number, b: number) => {
    const d = dirOf(a, b);
    const ang = Math.acos(Math.max(-1, Math.min(1, d[0] * whorl[0] + d[1] * whorl[1] + d[2] * whorl[2])));
    const tang = sub(d, scale(whorl, ang > 1e-6 ? Math.cos(ang) : 1));
    const swirl = Math.atan2(tang[0], tang[1] + 1e-6);
    return (ang * 0.105) / 0.0115 * Math.PI * 2 + swirl * 1.5;
  };
  shell(c, {
    low: std(c), rows: Math.round(c.d.rows * 2.4),
    outer: (a, b, s, e) => s + (0.0055 + 0.0013 * Math.sin(phase(a, b))) * smooth(0, 0.008, e),
    attrs: (a, b, e) => ({ shade: 0.74 + 0.26 * (0.5 + 0.5 * Math.sin(phase(a, b))), dens: 0.45 + 0.55 * smooth(0, 0.008, e) }),
  });
};

R['High-Top Fade'] = (c) => {
  const k = c.k;
  const top = k.L.top + 0.068, w = k.L.halfWidth + 0.008, dpt = (k.L.foreheadZ - k.L.back) / 2 + 0.012;
  const zc = (k.L.foreheadZ + k.L.back) / 2;
  fadeCap(c, {
    fadeY: () => k.L.ear.top + 0.036, band: 0.012,
    top: (a, b, s) => {
      const d = dirOf(a, b);
      // the column is centred front-to-back on the skull: shift the ray's origin by solving in a shifted frame
      const col = rayColumn([d[0], d[1], d[2] - 0], w, dpt, top, zc, 7) + zc * d[2] * 0.6;
      return Math.max(0.006, col - s);
    },
    texture: 0.003,
  });
};

R['Mohawk'] = (c) => {
  // shaved sides (a very short buzz), a tall spiked crest down the middle
  shell(c, { low: std(c), outer: (_a, _b, s, e) => s + 0.0012 * smooth(0, 0.006, e), attrs: () => ({ dens: 0.22 }) });
  ridge(c, 0.017, (u, v) => {
    const H = 0.055 * smooth(0, 0.12, u) * (1 - 0.45 * smooth(0.55, 1, u));
    const saw = 1 - 0.55 * ((u * 7.5) % 1);
    return H * saw * Math.pow(Math.max(0, 1 - v * v), 0.7);
  }, { rows: Math.round(c.d.rows * 3), cols: 8, attrs: (u) => ({ along: 0.4 + 0.6 * ((u * 7.5) % 1) }) });
};

R['Frohawk'] = (c) => {
  // tapered sides (short, not bare), a rounded textured crest
  shell(c, {
    low: std(c),
    outer: (a, b, s, e) => s + 0.004 * smooth(0, 0.01, e) + coil(scale(dirOf(a, b), s), 90, 0.001).off,
    attrs: (a, b, e) => ({ dens: 0.35 + 0.45 * smooth(0, 0.012, e), shade: 0.9 }),
  });
  // POLISH (2026-10-07): the crest is soft coily texture (the coil band), fuller and rounder on top
  c.g.with({ tex: TEX.coil, vLen: 0.035, uLen: 0.035 }, () => ridge(c, 0.038, (u, v) => {
    const H = 0.046 * smooth(0, 0.16, u) * (1 - 0.55 * smooth(0.6, 1, u));
    return H * Math.pow(Math.max(0, 1 - v * v), 0.45) + coil([u * 0.3, v * 0.04, 0], 40, 0.003).off;
  }, { rows: Math.round(c.d.rows * 2.6), cols: 12, attrs: (u, v) => ({ shade: 0.75 + 0.3 * noise3(u * 30, v * 6, 1) }) }));
};

R['Bald'] = () => { /* nothing */ };

// ── pack 4: game flair ───────────────────────────────────────────────────────────────────────────────────────────────

R['Spiky'] = (c) => {
  const k = c.k;
  shell(c, { low: std(c), outer: (a, b, s, e) => s + 0.011 * smooth(0, 0.012, e), attrs: () => ({ shade: 0.9 }) });
  const roots = scalpRoots(k, 0.032 / Math.sqrt(c.d.strands), { border: 0.018, above: k.L.ear.top + 0.012 });
  roots.forEach(([a, b], i) => {
    const base = k.surf(a, b, 0.006);
    const n = dirOf(a, b);
    // up and back: the gel's lean
    const dir = norm(add(add(n, [0, 0.5, -0.35]), [0, 0, 0], 1));
    const L = 0.045 + 0.022 * hash(i, 7) + 0.012 * Math.max(0, Math.sin(b));
    const tip = add(base, dir, L);
    const pts: V3[] = [];
    for (let j = 0; j <= 4; j++) pts.push(add(base, sub(tip, base), j / 4));
    c.g.tube(pts, (t) => 0.012 * (1 - t) + 0.0004, Math.max(4, c.d.sides - 1), { attrs: (t) => ({ along: t }) });
  });
};

R['Swept'] = (c) => {
  const k = c.k;
  // a long fringe from a part on the left, swept across the forehead to the right; short back and sides
  const partA = 34 * DEG;
  shell(c, {
    rows: Math.round(c.d.rows * 1.4),
    low: (a) => {
      const base = k.hairline(a);
      // over the forehead, from the part across to the right temple, down towards the brow
      const fr = smooth(partA, 8 * DEG, a) * smooth(-75 * DEG, -40 * DEG, a);
      return mix(base, k.L.brow + 0.016 + 0.01 * smooth(-60 * DEG, 20 * DEG, a), fr);
    },
    outer: (a, b, s, e) => {
      const top = Math.max(0, Math.sin(b));
      const sweep = 0.018 * smooth(60 * DEG, -20 * DEG, a) * smooth(-120 * DEG, -40 * DEG, a);
      const t = 0.01 + 0.012 * top + sweep * (0.4 + 0.6 * top);
      return s + t * smooth(0, 0.01, e) + 0.003;
    },
    attrs: (a, b) => {
      const d = dirOf(a, b);
      return { shade: 0.84 + 0.16 * Math.sin(a * 30 + d[1] * 10), dens: a > partA - 2 * DEG && a < partA + 2 * DEG && d[1] > 0.4 ? 0.4 : 1 };
    },
  });
};

R['Streaks'] = (c) => {
  const k = c.k;
  // POLISH (2026-10-07, owner: "should look like dyed streaks, not anime spikes"): a jaw-length layered cut swept from a
  // left part across the forehead, with bold DYED streaks — whole locks and bands of the cap in the second colour (a
  // lighter shade of the hair when the player has not picked one). Spiky keeps the anime spikes.
  const partA = 34 * DEG;
  shell(c, {
    rows: Math.round(c.d.rows * 1.3), full: true,
    low: (a) => {
      const base = k.hairline(a, 'ears') + 0.01;
      const fr = smooth(partA, 8 * DEG, a) * smooth(-75 * DEG, -40 * DEG, a);
      return mix(base, k.L.brow + 0.02 + 0.012 * smooth(-60 * DEG, 20 * DEG, a), fr);
    },
    outer: (a, b, s, e) => s + (0.013 + 0.01 * Math.max(0, Math.sin(b)) + 0.012 * smooth(60 * DEG, -20 * DEG, a) * Math.max(0, Math.sin(b))) * smooth(0, 0.01, e) + 0.003,
    attrs: (a) => ({ streak: Math.sin(a * 7 + 0.4) > 0.55 ? 1 : 0, shade: 0.86 + 0.14 * Math.sin(a * 30) }),
  });
  clumps(c, {
    arc: [52 * DEG, 308 * DEG], count: 20, top: () => k.L.ear.top + 0.03,
    length: (_a, i) => 0.11 + 0.06 * hash(i, 27), width: 0.016, thick: 0.006, gap: 0.014, volume: 0.007, frontUnder: 96 * DEG,
    chains: 2, hang: k.L.ear.bottom - 0.01, streak: (i) => i % 3 === 0,
  });
};

R['Mullet'] = (c) => {
  const k = c.k;
  shell(c, {
    low: std(c),
    outer: (a, b, s, e) => s + (0.009 + 0.012 * Math.max(0, Math.sin(b)) + 0.006 * smooth(110 * DEG, 160 * DEG, Math.abs(a))) * smooth(0, 0.01, e),
    attrs: (a, b) => ({ shade: 0.86 + 0.14 * Math.sin(a * 26 + b * 8) }),
  });
  // POLISH (2026-10-07): a dark under-layer and, over it, tapering clumps of uneven length down the back of the neck
  c.g.with({ uLen: 0.05 }, () => curtain(c, {
    arc: [118 * DEG, 242 * DEG], top: () => k.L.nape + 0.035, bottom: () => k.L.neckBase - 0.01, gap: 0.008, cols: Math.round(c.d.sheet * 0.6),
    attrs: () => ({ shade: 0.52 }),
  }));
  clumps(c, {
    arc: [114 * DEG, 246 * DEG], count: 13, top: () => k.L.nape + 0.04,
    length: (_a, i) => 0.12 + 0.06 * hash(i, 26), width: 0.016, thick: 0.006, gap: 0.01, volume: 0.008, chains: 2, hang: k.L.neckTop - 0.005,
  });
};

// ── pack 3: long & tied ──────────────────────────────────────────────────────────────────────────────────────────────

/** The cap under long hair: over the ears, a centre or side part. */
function longCap(c: Ctx, o: { t?: number; partA?: number; volume?: number; curls?: number }): void {
  const partA = o.partA ?? 0;
  shell(c, {
    low: (a) => c.k.hairline(a, 'ears'), full: true, rows: Math.round(c.d.rows * 1.2),
    outer: (a, b, s, e) => {
      const d = dirOf(a, b);
      const part = 1 - 0.75 * (1 - smooth(0.002, 0.008, Math.abs(Math.sin(a - partA)) * s * Math.cos(b))) * smooth(0.2, 0.6, d[1]) * smooth(-0.2, 0.3, Math.cos(a - partA));
      const t = (o.t ?? 0.009) + (o.volume ?? 0) * Math.max(0, Math.sin(b));
      const cl = o.curls ? coil(scale(d, s), 45, o.curls).off : 0;
      return s + (t * part + cl) * smooth(0, 0.01, e) + 0.002;
    },
    attrs: (a, b, _e, _h, r) => {
      const d = dirOf(a, b);
      const onPart = (1 - smooth(0.002, 0.006, Math.abs(Math.sin(a - partA)) * r * Math.cos(b))) * smooth(0.25, 0.6, d[1]) * smooth(0, 0.4, Math.cos(a - partA));
      const sh = o.curls ? coil(scale(d, r), 45, 0).shade : 0.86 + 0.14 * Math.sin((a - partA) * 34);
      return { dens: 1 - 0.85 * onPart, shade: sh };
    },
  });
}

/** Long hair's curtain round the back and sides: sides end at the collarbone in front of the shoulders, the back long. */
function longCurtain(c: Ctx, o: { back: number; sides: number; gap: number; extra?: (a: number, y: number, t: number) => number; tuck?: number; shade?: (a: number, y: number) => number; arc?: number; panels?: boolean; top?: number }): void {
  const k = c.k;
  const arc = o.arc ?? 64 * DEG;
  curtain(c, {
    arc: [arc, 2 * Math.PI - arc],
    top: (a) => (o.top ?? k.L.ear.top + 0.012) - 0.01 * smooth(150 * DEG, 180 * DEG, Math.abs(Math.PI - Math.abs(((a + Math.PI) % (2 * Math.PI)) - Math.PI))),
    bottom: (a) => {
      const d = Math.abs(((a + Math.PI) % (2 * Math.PI)) - Math.PI);   // from the front, 0..π
      return mix(o.sides, o.back, smooth(95 * DEG, 145 * DEG, d));
    },
    gap: o.gap, extra: o.extra, tuck: o.tuck,
    rows: Math.round(c.d.rows * 1.8),
    attrs: (a, y) => ({ shade: o.shade ? o.shade(a, y) : 0.84 + 0.16 * Math.sin(a * 46 + y * 4) }),
    panels: o.panels === false ? undefined : { hang: k.L.neckTop - 0.01, n: 3, attach: 'Neck' },
  });
  // clips sit on the curtain's side over the ear (left first)
  for (const s of [1, -1]) c.anchors.clips.push({ p: HeadKit.cyl(s * 96 * DEG, k.L.ear.top + 0.022, k.horiz(s * 96 * DEG, k.L.ear.top + 0.022) + o.gap + 0.003), n: [s, 0.15, 0] });
}

/** POLISH (2026-10-07, owner: "flat cardboard panels that end abruptly at the shoulders"): long hair is CLUMPS over a dark,
 *  shorter under-layer (the curtain fills the gaps between locks so no neck shows through). The clumps taper to points at
 *  ragged lengths and drape over the shoulders — the front ones forward onto the chest, the rest down the back. */
function under(c: Ctx, back: number, sides: number, gap: number, o: { arc?: number; tex?: TexBand } = {}): void {
  c.g.with({ tex: o.tex ?? TEX.streak, vLen: 0.07, uLen: 0.05 }, () => longCurtain(c, {
    back, sides, gap, arc: o.arc, shade: (a, y) => 0.5 + 0.08 * Math.sin(a * 46 + y * 4),
  }));
}
const fromFront = (a: number) => Math.abs(((a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);

R['Straight'] = (c) => {
  const k = c.k;
  longCap(c, { t: 0.008 });
  under(c, -0.3, k.L.neckBase + 0.01, 0.01);
  // sleek: straight clumps, close to the head, long down the back, the front ones over the collarbones
  clumps(c, {
    arc: [64 * DEG, 296 * DEG], count: 28, top: () => k.L.ear.top + 0.02,
    length: (a, i) => mix(0.27, 0.46, smooth(90 * DEG, 150 * DEG, fromFront(a))) * (0.9 + 0.2 * hash(i, 21)),
    width: 0.021, thick: 0.006, gap: 0.011, frontUnder: 96 * DEG, chains: 3,
  });
};

R['Wavy'] = (c) => {
  const k = c.k;
  longCap(c, { t: 0.012, partA: 30 * DEG, volume: 0.006 });
  under(c, -0.26, k.L.neckBase, 0.018);
  // soft S-waves you can see from the front, more volume, each clump in its own phase
  clumps(c, {
    arc: [60 * DEG, 300 * DEG], count: 26, top: () => k.L.ear.top + 0.022,
    length: (a, i) => mix(0.25, 0.38, smooth(90 * DEG, 150 * DEG, fromFront(a))) * (0.88 + 0.24 * hash(i, 22)),
    width: 0.021, thick: 0.007, gap: 0.016, wave: { amp: 0.014, period: 0.075 }, volume: 0.012, frontUnder: 96 * DEG, chains: 3,
  });
};

R['Curly'] = (c) => {
  const k = c.k;
  c.g.with({ tex: TEX.coil, vLen: 0.035 }, () => longCap(c, { t: 0.02, volume: 0.016, curls: 0.006 }));
  under(c, -0.18, k.L.neckBase + 0.02, 0.026, { arc: 58 * DEG, tex: TEX.coil });
  // ringlets: round curl clumps spiralling down to the shoulders, a big soft volume
  clumps(c, {
    arc: [56 * DEG, 304 * DEG], count: 24, top: () => k.L.ear.top + 0.03,
    length: (a, i) => mix(0.17, 0.25, smooth(90 * DEG, 150 * DEG, fromFront(a))) * (0.85 + 0.3 * hash(i, 23)),
    width: 0.011, thick: 0.0085, gap: 0.03, curl: { radius: 0.011, pitch: 0.03 }, volume: 0.02, frontUnder: 96 * DEG, chains: 3,
  });
};

R['Long Layered'] = (c) => {
  const k = c.k;
  longCap(c, { t: 0.012, partA: -28 * DEG, volume: 0.008 });
  under(c, -0.32, k.L.neckBase - 0.02, 0.012);
  // the long layer down the back, and over it a shorter, face-framing layer stepping longer towards the back
  clumps(c, {
    arc: [70 * DEG, 290 * DEG], count: 22, top: () => k.L.ear.top + 0.018,
    length: (a, i) => mix(0.3, 0.46, smooth(100 * DEG, 150 * DEG, fromFront(a))) * (0.9 + 0.2 * hash(i, 24)),
    width: 0.017, thick: 0.0055, gap: 0.012, frontUnder: 96 * DEG, chains: 3,
  });
  clumps(c, {
    arc: [56 * DEG, 304 * DEG], count: 18, top: () => k.L.ear.top + 0.032,
    length: (a, i) => mix(0.1, 0.2, smooth(60 * DEG, 160 * DEG, fromFront(a))) * (0.85 + 0.3 * hash(i, 25)),
    width: 0.016, thick: 0.005, gap: 0.02, layer: 0.008, volume: 0.006, frontUnder: 96 * DEG, chains: 2,
  });
};

R['Bob'] = (c) => {
  const k = c.k;
  // blunt bangs to the brow, a chin-length curtain tucked under at the hem
  shell(c, {
    low: (a) => mix(k.hairline(a, 'ears'), k.L.brow + 0.016, smooth(60 * DEG, 30 * DEG, Math.abs(a))), full: true,
    rows: Math.round(c.d.rows * 1.3),
    outer: (a, b, s, e) => s + (0.013 + 0.01 * Math.max(0, Math.sin(b))) * smooth(0, 0.006, e) + 0.004,
    attrs: (a, b) => ({ shade: 0.86 + 0.14 * Math.sin(a * 50 + b * 4) }),
  });
  curtain(c, {
    arc: [48 * DEG, 312 * DEG],
    top: () => k.L.ear.top + 0.016,
    bottom: (a) => mix(k.L.chin.y + 0.012, k.L.chin.y - 0.004, smooth(60 * DEG, 160 * DEG, Math.abs(((a + Math.PI) % (2 * Math.PI)) - Math.PI))),
    gap: 0.018, tuck: 0.014, extra: (_a, _y, t) => 0.006 * Math.sin(Math.PI * t),
    attrs: (a, y) => ({ shade: 0.86 + 0.14 * Math.sin(a * 46 + y * 3) }),
    panels: { hang: k.L.ear.bottom - 0.01, n: 3, attach: 'Head' },
  });
  for (const s of [1, -1]) c.anchors.clips.push({ p: HeadKit.cyl(s * 70 * DEG, k.L.ear.top + 0.03, k.horiz(s * 70 * DEG, k.L.ear.top + 0.03) + 0.022), n: [s * 0.8, 0.2, 0.4] });
};

/** Where the hair is gathered at the back of the head: the scalp point, and the outward direction there. */
function gatherAt(c: Ctx, a: number, b: number): { base: V3; n: V3 } {
  return { base: c.k.surf(a, b, 0.006), n: dirOf(a, b) };
}

R['Bun'] = (c) => {
  const k = c.k;
  const g = gatherAt(c, Math.PI, k.betaAt(Math.PI, k.L.nape + 0.035));
  slickCap(c, g.n);
  const axis = norm(add(g.n, [0, -0.2, 0]));
  coilKnot(c, g.base, axis, 0.042, 0.012, 0.042, 2.6, 0.017);
  c.anchors.bases.push({ p: add(g.base, axis, 0.008), t: axis, r: 0.034, chain: -1 });
  for (const s of [1, -1]) c.anchors.clips.push({ p: k.surf(s * 100 * DEG, k.betaAt(s * 100 * DEG, k.L.ear.top + 0.02), 0.008), n: [s, 0.1, 0] });
};

R['Top Knot'] = (c) => {
  const k = c.k;
  const g = gatherAt(c, Math.PI, 76 * DEG);
  slickCap(c, g.n, { t: 0.006 });
  const axis = norm(add(g.n, [0, 0.6, 0.1]));
  coilKnot(c, g.base, axis, 0.036, 0.01, 0.046, 2.4, 0.016);
  c.anchors.bases.push({ p: add(g.base, axis, 0.006), t: axis, r: 0.03, chain: -1 });
  void k;
};

R['Space Buns'] = (c) => {
  const k = c.k;
  longCap(c, { t: 0.006 });
  for (const s of [1, -1]) {
    const g = gatherAt(c, s * 62 * DEG, 50 * DEG);
    const axis = norm(add(g.n, [0, 0.35, -0.1]));
    coilKnot(c, g.base, axis, 0.033, 0.009, 0.038, 2.3, 0.0145);
    c.anchors.bases.push({ p: add(g.base, axis, 0.006), t: axis, r: 0.028, chain: -1 });
  }
  void k;
};

/** A ponytail from a base point: out and back, then hanging, tapering to a point. */
function ponyPath(base: V3, out: V3, length: number, droop = 1, reach = 0.075): V3[] {
  const pts: V3[] = [];
  const o = norm(out);
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    // a quadratic: out first, then gravity
    const p = add(add(base, o, reach * Math.sin(Math.min(1, t * 2.2) * Math.PI / 2)), [0, -1, 0], length * Math.pow(t, 1.25) * droop);
    pts.push(p);
  }
  return pts;
}

R['Ponytail'] = (c) => {
  const k = c.k;
  const g = gatherAt(c, Math.PI, 46 * DEG);
  slickCap(c, g.n);
  const path = ponyPath(g.base, add(g.n, [0, 0.25, 0]), 0.3);
  tail(c, path, (t) => (t < 0.06 ? 0.016 : 0.016 + 0.014 * Math.sin(Math.min(1, (t - 0.06) / 0.5) * Math.PI / 2)) * (1 - 0.96 * smooth(0.4, 1, t)) + 0.0006, {
    attach: 'Head', profile: (t, phi) => 1 + 0.1 * Math.sin(phi * 5 + t * 20),
  });
  void k;
};

R['Pigtails'] = (c) => {
  const k = c.k;
  longCap(c, { t: 0.006 });
  for (const s of [1, -1]) {
    const a = s * 118 * DEG;
    const g = gatherAt(c, a, k.betaAt(a, k.L.ear.bottom + 0.008));
    const path = ponyPath(g.base, add(g.n, [0, 0.1, 0]), 0.22, 1, 0.025);
    // keep the tail clear of the shoulder behind
    for (const p of path) { const r = Math.hypot(p[0], p[2]); const need = k.horiz(Math.atan2(p[0], p[2]), p[1]) + 0.022; if (r < need) { p[0] *= need / r; p[2] *= need / r; } }
    tail(c, path, (t) => (0.012 + 0.009 * Math.sin(Math.min(1, t / 0.4) * Math.PI / 2)) * (1 - 0.96 * smooth(0.45, 1, t)) + 0.0006, { attach: 'Head', profile: (t, phi) => 1 + 0.1 * Math.sin(phi * 5 + t * 18) });
  }
  for (const s of [1, -1]) c.anchors.clips.push({ p: k.surf(s * 75 * DEG, k.betaAt(s * 75 * DEG, k.L.ear.top + 0.035), 0.008), n: [s, 0.3, 0.2] });
};

R['Braided Ponytail'] = (c) => {
  const k = c.k;
  const g = gatherAt(c, Math.PI, 30 * DEG);
  slickCap(c, g.n);
  const pts: V3[] = [];
  const out = norm(add(g.n, [0, 0.05, 0]));
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const p = add(add(g.base, out, 0.03 * Math.sin(Math.min(1, t * 4) * Math.PI / 2)), [0, -1, 0], 0.46 * Math.pow(t, 1.1));
    const r = Math.hypot(p[0], p[2]); const need = k.horiz(Math.PI, p[1]) + 0.022;
    if (r < need) { p[0] *= need / r; p[2] *= need / r; }
    pts.push(p);
  }
  tail(c, pts, (t) => 0.02 * (1 - 0.55 * smooth(0.6, 1, t)) + 0.003, { attach: 'Neck', braid: true });
};

// ── pack 1: textured & protective ────────────────────────────────────────────────────────────────────────────────────

R['Afro'] = (c) => {
  const k = c.k;
  // POLISH (2026-10-07, owner: "reads as a mushroom"): a full ROUND ball, centred near the middle of the head so its widest
  // point is at the temples (full sides, no cap on a stalk), coming down close to the face at the hairline, its surface the
  // coil band's soft clumps over a gentle lumpiness
  const ctr: V3 = [0, 0.036, -0.014];
  const rad: V3 = [k.L.halfWidth + 0.07, k.L.top - 0.036 + 0.062, (k.L.foreheadZ - k.L.back) / 2 + 0.062];
  c.g.with({ tex: TEX.coil, vLen: 0.04 }, () => shell(c, {
    low: (a) => k.hairline(a) - 0.006 * smooth(50 * DEG, 0, Math.abs(a)), full: true,
    rows: Math.round(c.d.rows * 1.5), bias: 0.8,
    outer: (a, b, s, e) => {
      const d = dirOf(a, b);
      const ball = rayEllipsoid(d, ctr, rad);
      const cl = coil(scale(d, ball), 22, 0.008);
      // rises from the hairline on a short rounded profile: the volume starts right at the face
      const rise = Math.pow(smooth(0, 0.03, e), 0.55);
      return s + 0.003 + Math.max(0, ball - s) * rise + cl.off * rise;
    },
    attrs: (a, b, _e, _h, r) => ({ shade: coil(scale(dirOf(a, b), r), 22, 0).shade * mix(0.86, 1, smooth(-0.4, 0.5, Math.sin(b))) }),
  }));
};

R['Afro Puffs'] = (c) => {
  const k = c.k;
  c.g.a = { ...c.g.a, tex: TEX.coil, vLen: 0.035 };
  shell(c, {
    low: std(c),
    outer: (a, b, s, e) => s + (0.006 + coil(scale(dirOf(a, b), s), 110, 0.0015).off) * smooth(0, 0.008, e),
    attrs: (a, b, _e, _h, r) => ({ shade: coil(scale(dirOf(a, b), r), 110, 0).shade }),
  });
  for (const s of [1, -1]) {
    const a = s * 70 * DEG, b = 46 * DEG;
    const base = k.surf(a, b, 0.004);
    const n = norm(add(dirOf(a, b), [0, 0.45, -0.05]));
    const R0 = 0.064;
    const ctr = add(base, n, R0 * 0.9);
    let chain = -1;
    if (c.sway > 0) chain = c.g.addChain({ attach: 'Head', root: base, dir: n, length: R0 * 1.8, swing: c.sway });
    c.g.with({ chain, uLen: 0.035, vLen: 0.035 }, () => c.g.blob(ctr, (d) => R0 * (1 - 0.18 * Math.max(0, -(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]))) + coil(add(ctr, d, R0), 34, 0.006).off,
      Math.round(c.d.rows * 0.9), Math.round(c.d.cols * 0.45), (d) => ({ shade: coil(add(ctr, d, R0), 34, 0).shade })));
    c.anchors.bases.push({ p: add(base, n, 0.012), t: n, r: 0.03, chain });
  }
  c.g.a = { ...c.g.a, tex: TEX.streak, vLen: 0.06 };
};

R['Locs'] = (c) => {
  const k = c.k;
  // the under-layer: dark, so no scalp shows between the ropes
  c.g.with({ tex: TEX.coil, vLen: 0.03 }, () => shell(c, { low: std(c), outer: (_a, _b, s, e) => s + 0.004 * smooth(0, 0.008, e), attrs: () => ({ shade: 0.55 }) }));
  const roots = scalpRoots(k, 0.04 / Math.sqrt(c.d.strands), { border: 0.012, jitter: 0.3 });
  // POLISH (2026-10-07, owner): round ropes, thick and matte — each a little different in thickness, length and colour,
  // lumpy along its length, rounded at the end; the coil band's matted texture round each one
  strands(c, {
    roots, rr: (i) => 0.0082 * (0.8 + 0.4 * hash(i, 1)), length: (i) => 0.26 + 0.09 * hash(i, 2),
    profile: (t, phi, i) => 1 + 0.16 * (noise3(t * 16 + i, Math.cos(phi) * 1.2, Math.sin(phi) * 1.2) - 0.5),
    radius: (t) => (t < 0.04 ? 0.75 + 6 * t : t > 0.92 ? Math.sqrt(Math.max(0.06, 1 - ((t - 0.92) / 0.08) ** 2)) : 1),
    chains: 5, layerGain: 1.9, push: 0.4, curl: 0.003,
    tex: { band: TEX.streak, vLen: 0.05 }, shade: (i) => 0.84 + 0.16 * hash(i, 9),
  });
};

R['Box Braids'] = (c) => {
  const k = c.k;
  const spacing = 0.037 / Math.sqrt(c.d.strands);
  const roots = scalpRoots(k, spacing, { border: 0.01 });
  // each braid's own square part: a pad with the scalp showing round it
  for (const [a, b] of roots) pad(c, a, b, spacing * 0.36, 0.0022);
  // POLISH (2026-10-07): round braids; the plait is the detail texture's plait band (two crossings per 2.2 cm) so it reads
  // at any row spacing; a slightly squared section, lengths and shades vary braid to braid, the ends taper
  strands(c, {
    roots, rr: (i) => 0.0044 * (0.9 + 0.2 * hash(i, 6)), length: (i) => 0.39 + 0.07 * hash(i, 4),
    profile: (_t, phi) => 1 + 0.08 * Math.cos(4 * phi),
    radius: (t) => (t > 0.9 ? 1 - 0.55 * smooth(0.9, 1, t) : 1),
    chains: 6, layerGain: 2.4, push: 0.38,
    tex: { band: TEX.plait, vLen: 0.022 }, shade: (i) => 0.88 + 0.12 * hash(i, 8),
  });
};

R['Twists'] = (c) => {
  const k = c.k;
  c.g.with({ tex: TEX.coil, vLen: 0.03 }, () => shell(c, { low: std(c), outer: (_a, _b, s, e) => s + 0.0035 * smooth(0, 0.008, e), attrs: () => ({ shade: 0.6 }) }));
  const roots = scalpRoots(k, 0.035 / Math.sqrt(c.d.strands), { border: 0.01, jitter: 0.2 });
  // POLISH (2026-10-07): visibly two-strand — a section of two round lobes side by side, the diagonal of the plait band
  // winding round it (a twist, not a plait), lengths and thickness varying, a coiled flick at the end
  strands(c, {
    roots, rr: (i) => 0.0056 * (0.88 + 0.24 * hash(i, 3)), length: (i) => 0.14 + 0.06 * hash(i, 5),
    profile: (_t, phi) => 0.78 + 0.3 * Math.abs(Math.cos(phi)),
    twist: (t, i) => t * 9 + i,
    radius: (t) => (t > 0.9 ? 1 - 0.4 * smooth(0.9, 1, t) : 1),
    chains: 5, layerGain: 3.2, push: 0.3, curl: 0.007, clearance: 0.02,
    tex: { band: TEX.plait, vLen: 0.026, uSpan: 0.5 }, shade: (i) => 0.86 + 0.14 * hash(i, 7),
  });
};

R['Cornrows'] = (c) => {
  const k = c.k;
  const rows = Math.max(5, Math.round(9 * Math.sqrt(c.d.strands)));
  const xMax = k.L.halfWidth - 0.016;
  const tails: V3[][] = [];
  for (let i = 0; i < rows; i++) {
    const x = mix(-xMax, xMax, i / (rows - 1));
    const pts: V3[] = [];
    // march over the head in the plane x = const, front to back
    for (let j = 0; j <= 60; j++) {
      const phi = mix(-80 * DEG, 205 * DEG, j / 60);   // 0 = straight up
      const dir: V3 = [0, Math.cos(phi), Math.sin(-phi)];
      const p = k.rayToScalp([x, 0, 0], dir, false, 0.0032);
      if (!p) continue;
      const [a] = angOf(p[0], p[1], p[2]);
      if (p[1] < k.hairline(a) + 0.006) { if (pts.length) break; continue; }
      pts.push(p);
    }
    if (pts.length < 4) continue;
    c.g.with({ tex: TEX.plait, vLen: 0.02 }, () => c.g.tube(pts, (t) => 0.0042 * (t < 0.03 ? 0.6 : 1), c.d.sides, {
      profile: (t, phi) => 1 + 0.22 * Math.abs(Math.sin(t * (0.28 / 0.009) * Math.PI + (Math.cos(phi) > 0 ? 0 : Math.PI / 2))),
    }));
    // a short braided end hanging from the nape
    const end = pts[pts.length - 1];
    const tl: V3[] = [];
    for (let j = 0; j <= 6; j++) tl.push(add(end, [0, -0.012, -0.004], j));
    tails.push(tl);
  }
  if (tails.length) strandsFromPaths(c, tails, 0.0038);
};

/** Hanging ends from given paths (cornrow ends), on one chain. */
function strandsFromPaths(c: Ctx, paths: V3[][], rr: number): void {
  let chain = -1;
  if (c.sway > 0) {
    const root = scale(paths.reduce((s, p) => add(s, p[0]), [0, 0, 0] as V3), 1 / paths.length);
    chain = c.g.addChain({ attach: 'Neck', root, dir: [0, -1, 0], length: 0.07, swing: c.sway });
  }
  for (const p of paths) {
    c.g.with({ chain }, () => c.g.tube(p, (t) => rr * (1 - 0.4 * t), Math.max(4, c.d.sides - 1), {
      profile: (t, phi) => 1 + 0.22 * Math.abs(Math.sin(t * 6 * Math.PI + (Math.cos(phi) > 0 ? 0 : Math.PI / 2))),
      attrs: (t) => ({ along: 0.8 + 0.2 * t }),
    }));
    c.anchors.ends.push({ p: p[p.length - 1], t: [0, -1, 0], r: rr, chain });
  }
}

R['Bantu Knots'] = (c) => {
  const k = c.k;
  const roots = scalpRoots(k, 0.056, { border: 0.014, above: k.L.ear.top - 0.004 });
  for (const [a, b] of roots) {
    pad(c, a, b, 0.016, 0.003, 0.001);
    const base = k.surf(a, b, 0.003);
    coilKnot(c, base, dirOf(a, b), 0.019, 0.005, 0.028, 2.3, 0.0085);
  }
};

R['Durag'] = (c) => {
  const k = c.k;
  const low = (a: number) => k.hairline(a, 'wrap');
  c.g.with({ kind: K.fabric }, () => {
    shell(c, {
      low, full: true, rows: Math.round(c.d.rows * 1.2),
      outer: (a, b, s, e) => s + 0.005 + 0.002 * smooth(0, 0.02, e) + 0.0012 * Math.sin(a * 9 + b * 14),
      attrs: (a, b, e) => ({ kind: e < 0.012 ? K.fabric : K.fabric, shade: 0.9 + 0.1 * Math.sin(a * 9 + b * 14) }),
    });
    // the seam down the middle
    ridge(c, 0.0035, (u, v) => 0.0062 * (1 - v * v), { cols: 4, rows: Math.round(c.d.rows * 2), attrs: () => ({ kind: K.trim }) });
    // the ties round the head at the band, to a knot at the back
    for (const s of [1, -1]) {
      const pts: V3[] = [];
      for (let j = 0; j <= 16; j++) {
        const a = s * mix(55 * DEG, 172 * DEG, j / 16);
        const y = low(a) + 0.009;
        pts.push(k.surf(a, k.betaAt(a, y, true), 0.0085, true));
      }
      c.g.tube(pts, () => 0.0042, 4, { profile: (_t, phi) => 1 - 0.55 * Math.abs(Math.sin(phi)) });
    }
  });
  // the tail: a flat flap from the knot down the back
  const knot = k.surf(Math.PI, k.betaAt(Math.PI, low(Math.PI) + 0.009, true), 0.012, true);
  c.g.with({ kind: K.fabric }, () => c.g.blob(knot, () => 0.014, 6, 10));
  let chain = -1;
  const L = 0.3;
  if (c.sway > 0) chain = c.g.addChain({ attach: 'Neck', root: knot, dir: [0, -1, 0], length: L, swing: c.sway });
  c.g.with({ kind: K.fabric, chain }, () => c.g.grid(10, 4, (r, cc) => {
    const t = r / 10, w = mix(0.05, 0.065, t);
    const y = knot[1] - L * t;
    const a = Math.PI + ((cc / 4) * 2 - 1) * (w / 0.11);
    const rad = Math.max(k.horiz(a, y) + 0.012, 0.06);
    return { p: HeadKit.cyl(a, y, rad + 0.004 * Math.sin(t * 9)), along: t };
  }, { out: (p) => [p[0], 0, p[2]] }));
};

R['Headwrap'] = (c) => {
  const k = c.k;
  const ctr: V3 = [0, 0.062, -0.036];
  const rad: V3 = [k.L.halfWidth + 0.032, k.L.top - 0.062 + 0.075, (k.L.foreheadZ - k.L.back) / 2 + 0.05];
  c.g.with({ kind: K.fabric }, () => {
    shell(c, {
      low: (a) => k.hairline(a, 'wrap') - 0.004, full: true, rows: Math.round(c.d.rows * 1.6),
      outer: (a, b, s, e) => {
        const d = dirOf(a, b);
        const vol = rayEllipsoid(d, ctr, rad);
        // diagonal folds wound round the wrap
        const fold = 0.0055 * Math.sin(a * 5 + d[1] * 42);
        return s + 0.008 + Math.max(0, vol - s) * smooth(0, 0.03, e) + fold * smooth(0, 0.02, e);
      },
      attrs: (a, b, e) => {
        const d = dirOf(a, b);
        const band = e < 0.016;
        return { kind: band ? K.trim : K.fabric, shade: 0.82 + 0.18 * (0.5 + 0.5 * Math.sin(a * 5 + d[1] * 42 + 0.8)) };
      },
    });
    // the twist at the front
    const front = k.surf(0, 52 * DEG, 0.03, true);
    coilKnot(c, front, norm([0, 0.8, 0.6]), 0.016, 0.006, 0.026, 1.6, 0.0105);
  });
};

R['Hijab'] = (c) => {
  const k = c.k, L = k.L;
  // the face opening: from just above the brow to under the chin, wide to the cheeks' edge
  const yTop = L.brow + 0.026, yBot = L.chin.y - 0.016, yc = (yTop + yBot) / 2, hh = (yTop - yBot) / 2;
  const W = 64 * DEG;
  const open = (y: number) => W * Math.sqrt(Math.max(0, 1 - ((y - yc) / hh) ** 2));
  const gapAt = (y: number) => 0.016 + 0.006 * smooth(yBot, yTop + 0.04, y);
  c.g.with({ kind: K.fabric }, () => {
    // the crown, closed over the top
    shell(c, { low: () => yTop - 0.022, full: true, outer: (_a, _b, s) => s + gapAt(yTop), attrs: (a, b) => ({ shade: 0.92 + 0.08 * Math.sin(a * 6 + b * 3) }) });
    // round the face and down over the neck and shoulders: rings from the brow down to the hem, open at the face
    const rows = Math.round(c.d.rows * 2.6), cols = c.d.sheet + 8;
    const yHem = (a: number) => mix(L.neckBase - 0.1, L.neckBase - 0.14, smooth(60 * DEG, 160 * DEG, Math.abs(a)));
    const pts: V3[][] = [];
    let prevR: number[] = [];
    for (let r = 0; r <= rows; r++) {
      const t = r / rows;
      const row: V3[] = [];
      const rr: number[] = [];
      for (let cc = 0; cc <= cols; cc++) {
        const u = cc / cols;
        // the columns run from one edge of the opening round the back to the other
        const yTmp = mix(yTop, yHem(Math.PI), t);
        const o = yTmp < yTop && yTmp > yBot ? open(yTmp) : 0;
        const a = o + u * (2 * Math.PI - 2 * o);
        const y = mix(yTop, yHem(a), t);
        const oo = y < yTop && y > yBot ? open(y) : 0;
        const aa = oo + u * (2 * Math.PI - 2 * oo);
        // metres-ish from the opening's edge (only where there is an opening: the face)
        const edge = oo > 0 ? Math.min(u, 1 - u) * (2 * Math.PI - 2 * oo) * 0.1 : 1;
        const base = k.horiz(aa, y);
        let rad = base + mix(0.004, gapAt(y), smooth(0, 0.02, edge));
        if (prevR.length && y < L.chin.y) rad = Math.max(rad, prevR[cc] - 0.002);
        // soft folds in the drape
        rad += 0.004 * Math.sin(aa * 9) * smooth(L.chin.y, L.neckBase - 0.06, y);
        rr.push(rad);
        row.push(HeadKit.cyl(aa, y, rad));
      }
      prevR = rr;
      pts.push(row);
    }
    c.g.grid(rows, cols, (r, cc) => {
      const u = cc / cols;
      const trim = Math.min(u, 1 - u) < 0.012 && pts[r][cc][1] > yBot - 0.01 ? K.trim : K.fabric;
      return { p: pts[r][cc], kind: trim, shade: 0.88 + 0.12 * Math.sin(u * 60) };
    }, { out: (p) => [p[0], 0.2 * p[1], p[2]] });
  });
};

export const STYLE_RECIPES: Readonly<Record<string, Recipe>> = R;
export { rayColumn };
void len; void mix;
