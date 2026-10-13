// COURT SURFACES (vis-court, wave 2, 2026-10-13) — what each playing surface does when a body and a ball meet it.
//
// Pure tables and rules, one place, so a test can argue with them. The net sports (tennis, volleyball) read the surface from the
// place the player picked: the beach's sand (golden hour and night), the gym's varnished boards, and tennis's hard court, red
// clay and lawn. The surface says: what colour the dust is, whether feet leave prints, whether a landing leaves a mark, and
// whether a hard contact sends a ring out across the ground.
//
// Visual only: nothing here is read by a rule, a judge or a timing window.

export type NetSurface = 'sand' | 'night-sand' | 'gym' | 'hard' | 'clay' | 'grass';

export interface SurfaceLook {
  /** the dust a slide, a dig or a landing kicks up (null = none: a varnished floor does not dust) */
  dust: string | null;
  /** 0..1.5 — how much of it */
  dustScale: number;
  /** feet leave prints */
  footprints: boolean;
  /** a ball landing leaves a mark of this size scale (null = none) */
  ballMark: number | null;
  /** a hard contact (a spike) sends a ring along the ground (null = none) */
  ring: string | null;
}

export const SURFACE_LOOK: Readonly<Record<NetSurface, SurfaceLook>> = {
  sand:         { dust: '#e2c892', dustScale: 1.0, footprints: true,  ballMark: 0.5,  ring: '#ffe9b8' },
  'night-sand': { dust: '#b8a47e', dustScale: 0.8, footprints: true,  ballMark: 0.5,  ring: '#9fd8ff' },
  gym:          { dust: null,      dustScale: 0,   footprints: false, ballMark: null, ring: null },
  hard:         { dust: null,      dustScale: 0,   footprints: false, ballMark: 0.22, ring: null },
  clay:         { dust: '#c4673a', dustScale: 1.1, footprints: true,  ballMark: 0.34, ring: null },
  grass:        { dust: '#7aa352', dustScale: 0.5, footprints: false, ballMark: 0.26, ring: null },
};

/** Pure: the surface of a net mode's court. `placeId` is the player's place pick (placeLooks.ts), undefined for a mode with none. */
export function surfaceOf(modeId: string, placeId: string | undefined): NetSurface {
  if (modeId === 'volleyball') return placeId === 'gym' ? 'gym' : placeId === 'night-beach' ? 'night-sand' : 'sand';
  return placeId === 'clay' ? 'clay' : placeId === 'grass' ? 'grass' : 'hard';
}

/** Metres of travel between one footprint and the next (a stride). */
export const STRIDE_M = 0.9;

/** Pure: the footprint gate. Walks `acc` forward by `travel` and says how many prints the walker has laid (usually 0 or 1). */
export function strides(acc: number, travel: number): { acc: number; prints: number } {
  const t = acc + Math.abs(travel);
  const prints = Math.floor(t / STRIDE_M);
  return { acc: t - prints * STRIDE_M, prints: Math.min(prints, 3) };
}

/** Pure: how hard a contact is, 0..1, from its grade — the dust, the ring and the squash scale with it. */
export function contactForce(q: 'perfect' | 'good' | 'late' | 'early' | 'miss', kind: 'swing' | 'serve' | 'spike' | 'set' | 'bump' | 'block'): number {
  const base = q === 'perfect' ? 1 : q === 'good' ? 0.75 : q === 'miss' ? 0 : 0.45;
  const kindK = kind === 'spike' ? 1 : kind === 'serve' ? 0.8 : kind === 'block' ? 0.7 : kind === 'swing' ? 0.7 : 0.35;
  return Math.min(1, base * kindK + (kind === 'spike' && q !== 'miss' ? 0.15 : 0));
}

/** Pure: how long the ball squashes at contact (s) and by how much (the flat axis' scale), by force. */
export function squashOf(force: number): { sec: number; flat: number } {
  const f = Math.max(0, Math.min(1, force));
  return { sec: 0.05 + 0.07 * f, flat: 1 - 0.26 * f };
}
