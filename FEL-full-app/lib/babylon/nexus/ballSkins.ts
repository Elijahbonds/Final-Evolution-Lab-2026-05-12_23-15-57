// BALL SKINS — your ball, picked on the same screen as your court (2026-09-12).
//
// Owner: "let people choose their ball on the same screen as their map, look at the meshy assets, hoopbus
// and rainbow balls".
//
// The court picker already exists on the boot splash (courtLocations.ts) and the Meshy basketball already
// rides the physics sphere via dressBall. What was missing was any CHOICE of ball, and a second screen to
// make it on would be the wrong answer — the pick belongs beside the map pick, in the same ritual, so one
// screen covers "where am I playing and what am I playing with".
//
// Deliberately NOT new GLB downloads. The baked Meshy basketball is the mesh; a skin re-tints it. That keeps
// every skin free at runtime (no extra fetch, no extra draw call, nothing to 404) which matters because the
// owner's court picker is free too — a cosmetic that costs a download would be the only thing on this
// screen that can fail.
//
// This module is pure data + localStorage, mirroring courtLocations.ts exactly so the two picks behave the
// same way: `?ball=` wins, then the remembered pick, then the classic.

export const BALL_SKIN_IDS = ['classic', 'rainbow', 'sunset', 'mint', 'midnight', 'hoopbus'] as const;
export type BallSkinId = (typeof BALL_SKIN_IDS)[number];

export interface BallSkin {
  id: BallSkinId;
  /** Shown on the picker. */
  label: string;
  /** The swatch, and the tint multiplied onto the baked ball. */
  tint: string;
  /** A second colour for the skins that read as two-tone. */
  tint2?: string;
  /** The ball cycles through hues as it spins — the "rainbow" read. */
  cycle?: boolean;
  /** How bright the ball glows on a make, 0..1. A loud ball should answer loudly. */
  glow: number;
  /** Off means it is in the list but not offered yet — same contract as a court location's `ready`. */
  ready: boolean;
  /** One line on the picker, so a skin is a thing and not just a colour. */
  sub: string;
}

export const BALL_SKINS: Record<BallSkinId, BallSkin> = {
  classic: {
    id: 'classic', label: 'CLASSIC', tint: '#c0552a', glow: 0.1, ready: true,
    sub: 'The leather. Nothing to prove.',
  },
  rainbow: {
    id: 'rainbow', label: 'RAINBOW', tint: '#ff4d6d', tint2: '#4dd4ff', cycle: true, glow: 0.55, ready: true,
    sub: 'Cycles as it spins. Loud on purpose.',
  },
  sunset: {
    id: 'sunset', label: 'SUNSET', tint: '#ff8a3d', tint2: '#ff3d81', glow: 0.3, ready: true,
    sub: 'Venice at seven in the evening.',
  },
  mint: {
    id: 'mint', label: 'MINT', tint: '#4dffb8', glow: 0.25, ready: true,
    sub: 'Cold. Reads clean against asphalt.',
  },
  midnight: {
    id: 'midnight', label: 'MIDNIGHT', tint: '#2b3a6b', tint2: '#8fa8ff', glow: 0.35, ready: true,
    sub: 'Dark ball, bright seams.',
  },
  hoopbus: {
    id: 'hoopbus', label: 'HOOPBUS', tint: '#ffd75e', tint2: '#ff6b3d', glow: 0.45, ready: true,
    sub: 'The bus colours. Earned on the boardwalk.',
  },
};

export function isBallSkinId(v: unknown): v is BallSkinId {
  return typeof v === 'string' && (BALL_SKIN_IDS as readonly string[]).includes(v);
}

/** Skins the picker offers. */
export function readyBallSkins(): BallSkin[] {
  return BALL_SKIN_IDS.map((id) => BALL_SKINS[id]).filter((s) => s.ready);
}

export const BALL_SKIN_KEY = 'fel-ball-skin';

/** The player's pick: `?ball=` wins, then the remembered pick, then the classic. */
export function readBallSkin(): BallSkinId {
  try {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search).get('ball');
      if (isBallSkinId(q) && BALL_SKINS[q].ready) return q;
      const s = window.localStorage.getItem(BALL_SKIN_KEY);
      if (isBallSkinId(s) && BALL_SKINS[s].ready) return s;
    }
  } catch { /* private mode: the classic */ }
  return 'classic';
}

export function writeBallSkin(id: BallSkinId): void {
  try { window.localStorage.setItem(BALL_SKIN_KEY, id); } catch { /* convenience only */ }
}

/** Hex -> 0..1 rgb. Bad input returns white rather than throwing: a cosmetic must never break a mode. */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 1, g: 1, b: 1 };
  const n = parseInt(m[1], 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}

/**
 * The rainbow's hue at a moment, as a hex string.
 *
 * Driven by the ball's own spin rather than a wall clock, so a ball sitting still does not strobe — which
 * would be both ugly and a seizure risk. `spin` is accumulated revolutions.
 */
export function cycleTint(spin: number): string {
  const h = ((spin * 0.35) % 1 + 1) % 1;
  // hue -> rgb at full saturation and value
  const i = Math.floor(h * 6), f = h * 6 - i;
  const q = 1 - f;
  const [r, g, b] = [[1, f, 0], [q, 1, 0], [0, 1, f], [0, q, 1], [f, 0, 1], [1, 0, q]][i % 6];
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}
