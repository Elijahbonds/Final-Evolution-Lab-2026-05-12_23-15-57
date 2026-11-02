// THE PUBLISH GATE (NEX-04, round 8; docs/NEXUS-ROADMAP.md §1.3 "the meter warns but never blocks", §2.1, §3.1).
//
// A venue the owner publishes becomes a mode's DEFAULT place for every player (NEX-02), so before it may be published it must
// pass three checks. Each one is a refusal with a reason the editor shows; nothing is "fixed" silently.
//
//   1. KEEP-OUT. No object inside the target's playing area (targets.ts `playArea`: the surface the mode plays on and where its
//      ball flies) or in the play camera's corridor (from the camera to what it looks at, `crowdView`). A venue never changes
//      gameplay, and an object over the court or in front of the lens is how a look would.
//   2. THE PHONE BUDGET. The venue's measured PHONE column (the meter's Phone switch: the stage rebuilt on the mobile tier) must
//      be under mobileBudget.json's ceiling — draws, meshes, texture memory and skinned bodies. Dropped frames are input lag. A
//      venue with no phone measurement is refused ("measure it on Phone first").
//   3. READABILITY. No hazier, darker or lower-contrast than a place the game already ships: the fog density, the ambient light
//      and the court lines' contrast against the floor stay inside the envelope of every shipped venue spec and place look
//      (READABLE below, held to that data by publishGate.test.ts). assumption: the shipped envelope is the readability line
//      until a per-target ball-contrast measure exists (docs/NEXUS-ROADMAP.md §3.1 "measured per target, not guessed").
//
// Pure: no Babylon, no DOM. It runs in the editor at Publish and again on every published file at load (published.ts) and in CI
// (published.test.ts), so a hand-edited JSON cannot skip it.

import mobileBudget from '../babylon/config/mobileBudget.json';
import { VENUE_SPECS } from '../babylon/nexus/venueSpecs';
import { standPoint, type StandSpec } from '../babylon/visual/crowd/crowdLayout';
import type { StudioVenueExport } from './exportVenue';
import { targetOf, type PlaytestTarget } from './targets';

/** What the meter measured on the phone tier when the owner published (budget.ts BudgetSample, minus the tier). */
export interface PhoneSample { drawCalls: number; activeMeshes: number; textureMb: number; skinnedBodies: number }

export type GateProblem =
  | { kind: 'target'; message: string }
  | { kind: 'keepOut'; zone: 'play' | 'camera'; what: string; at: [number, number]; message: string }
  | { kind: 'budget'; key: keyof PhoneSample; value: number; ceiling: number; message: string }
  | { kind: 'budgetMissing'; message: string }
  | { kind: 'readability'; what: 'fog' | 'ambient' | 'lines'; value: number; limit: number; message: string };

export interface GateResult { ok: boolean; problems: GateProblem[] }

type Ceiling = { drawCalls: number; activeMeshes: number; textureMb: number; skinnedBodies: number };
/** mobileBudget.json `ceiling` (PerfMonitor's MOBILE_BUDGET; budget.test.ts holds the two equal). */
export const PHONE_GATE: Readonly<Ceiling> = (() => {
  const c = (mobileBudget as unknown as { ceiling: Ceiling }).ceiling;
  return { drawCalls: c.drawCalls, activeMeshes: c.activeMeshes, textureMb: c.textureMb, skinnedBodies: c.skinnedBodies };
})();

/**
 * The readability envelope of what the game already ships (every VENUE_SPECS environment and ground, every PLACE_LOOKS sky and
 * ground): the haziest fog (dance's spec, 0.02), the darkest ambient (dance's spec, 0.4) and the lowest line-to-floor contrast
 * (Volleyball's Night Beach, 1.69:1 WCAG). publishGate.test.ts recomputes these from the data, so a new shipped place moves them.
 */
export const READABLE = { maxFogDensity: 0.02, minAmbient: 0.4, minLineContrast: 1.69 } as const;

/** How far an object's own footprint reaches from its spot (m). assumption: a prop, scan, fixture or decal is ~1.2 m across. */
export const FOOTPRINT_M = 0.6;
/** Half the play camera's corridor (m), each side of the line from the camera to what it looks at. assumption. */
export const CORRIDOR_HALF_M = 2;

/**
 * The phone column the gate reads: the WORST of every phone-tier sample the meter took since the venue last changed (a frame
 * that spikes counts). A sample from another tier is ignored.
 */
export function worstPhone(prev: PhoneSample | null, s: { tier: string; drawCalls: number; activeMeshes: number; textureMb: number; skinnedBodies: number }): PhoneSample | null {
  if (s.tier !== 'mobile') return prev;
  if (!prev) return { drawCalls: s.drawCalls, activeMeshes: s.activeMeshes, textureMb: s.textureMb, skinnedBodies: s.skinnedBodies };
  return {
    drawCalls: Math.max(prev.drawCalls, s.drawCalls), activeMeshes: Math.max(prev.activeMeshes, s.activeMeshes),
    textureMb: Math.max(prev.textureMb, s.textureMb), skinnedBodies: Math.max(prev.skinnedBodies, s.skinnedBodies),
  };
}

// ── geometry (x, z on the ground) ───────────────────────────────────────────────────────────────────────────────────────────

type P2 = readonly [number, number];

function segDist(p: P2, a: P2, b: P2): number {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

/** Is `p` inside the convex polygon (either winding)? A point on an edge is inside. */
export function insidePolygon(p: P2, poly: ReadonlyArray<P2>): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

/** Does a disc of radius `r` at `p` touch the polygon? */
export function touchesPolygon(p: P2, r: number, poly: ReadonlyArray<P2>): boolean {
  if (insidePolygon(p, poly)) return true;
  for (let i = 0; i < poly.length; i++) if (segDist(p, poly[i], poly[(i + 1) % poly.length]) < r) return true;
  return false;
}

/** Does a disc touch any of an area's polygons? */
export function touchesArea(p: P2, r: number, area: ReadonlyArray<ReadonlyArray<P2>>): boolean {
  return area.some((poly) => touchesPolygon(p, r, poly));
}

/** The play camera's corridor for a target: the camera's spot and what it looks at, on the ground. */
export function cameraCorridor(t: PlaytestTarget): [P2, P2] {
  return [[t.crowdView.camera.at[0], t.crowdView.camera.at[2]], [t.crowdView.focus[0], t.crowdView.focus[2]]];
}

/** The ground points a stand covers: the four corners of its rows, and points along its front and back edges every 2 m. */
export function standFootprint(s: Pick<StandSpec, 'front' | 'yaw' | 'width' | 'rows' | 'step'>): P2[] {
  const out: P2[] = [];
  const n = Math.max(1, Math.ceil(s.width / 2));
  for (const r of [0, Math.max(0, s.rows - 1)]) {
    for (let i = 0; i <= n; i++) {
      const x = -s.width / 2 + (s.width * i) / n;
      const q = standPoint(s as StandSpec, x, r);
      out.push([q[0], q[2]]);
    }
  }
  return out;
}

/** Every placed thing in an export, as ground points with a footprint and a name for the refusal. */
export function exportFootprints(exp: StudioVenueExport): Array<{ what: string; at: P2; r: number; group?: string }> {
  const out: Array<{ what: string; at: P2; r: number; group?: string }> = [];
  for (const p of exp.look.props) out.push({ what: `${p.kind}`, at: [p.position[0], p.position[2]], r: FOOTPRINT_M });
  for (const k of exp.kit) out.push({ what: `${k.kit} ${k.model}`, at: [k.at[0], k.at[2]], r: FOOTPRINT_M });
  for (const m of exp.meshy) out.push({ what: m.key, at: [m.at[0], m.at[2]], r: FOOTPRINT_M });
  for (const f of exp.fixtures) out.push({ what: `${f.role} light`, at: [f.at[0], f.at[2]], r: FOOTPRINT_M });
  for (const d of exp.decals) out.push({ what: `${d.kind} mark`, at: [d.at[0], d.at[2]], r: FOOTPRINT_M });
  exp.crowd?.stands.forEach((s, i) => { for (const at of standFootprint(s)) out.push({ what: 'crowd stand', at, r: 0, group: `stand:${i}` }); });
  return out;
}

const fmt = (n: number): string => String(Math.round(n * 10) / 10);

// ── readability ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** WCAG relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** WCAG contrast ratio of two #rrggbb colours (1 … 21). */
export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

// ── the gate ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * May this export be published for its target? `phone` is the meter's phone column at the time (null: never measured on Phone).
 * Every problem is listed, not only the first, so the owner fixes them in one pass.
 */
export function publishGate(exp: StudioVenueExport, phone: PhoneSample | null): GateResult {
  const problems: GateProblem[] = [];
  const t = targetOf(exp.target);
  if (!t) {
    problems.push({ kind: 'target', message: `“${exp.target}” is not a mode a Studio venue can be published to.` });
    return { ok: false, problems };
  }
  if (exp.spec !== t.spec) problems.push({ kind: 'target', message: `This venue is laid over “${exp.spec}”, but ${t.label} plays on “${t.spec}”.` });

  // 1. keep-out
  const [cam, focus] = cameraCorridor(t);
  const seen = new Set<string>();
  for (const o of exportFootprints(exp)) {
    const zone: 'play' | 'camera' | null = touchesArea(o.at, o.r, t.playArea) ? 'play' : segDist(o.at, cam, focus) < CORRIDOR_HALF_M + o.r ? 'camera' : null;
    if (!zone) continue;
    if (o.group) { const key = `${zone}|${o.group}`; if (seen.has(key)) continue; seen.add(key); }   // one line per stand is enough
    problems.push({
      kind: 'keepOut', zone, what: o.what, at: [o.at[0], o.at[1]],
      message: zone === 'play'
        ? `A ${o.what} at (${fmt(o.at[0])}, ${fmt(o.at[1])}) is on ${t.label}’s playing area. Move it off the court.`
        : `A ${o.what} at (${fmt(o.at[0])}, ${fmt(o.at[1])}) is in front of ${t.label}’s play camera. Move it out of the camera’s view line.`,
    });
  }

  // 2. the phone budget
  if (!phone) {
    problems.push({ kind: 'budgetMissing', message: 'Measure the venue on Phone first (the meter’s Phone switch): a published venue must fit a phone.' });
  } else {
    for (const key of ['drawCalls', 'activeMeshes', 'textureMb', 'skinnedBodies'] as const) {
      const value = Number(phone[key]);
      if (!Number.isFinite(value) || value > PHONE_GATE[key]) {
        problems.push({ kind: 'budget', key, value, ceiling: PHONE_GATE[key], message: `On a phone this venue costs ${Number.isFinite(value) ? Math.round(value) : '?'} ${BUDGET_WORD[key]}; the ceiling is ${PHONE_GATE[key]}.` });
      }
    }
  }

  // 3. readability
  const sky = exp.look.sky;
  if (sky?.fogDensity !== undefined && sky.fogDensity > READABLE.maxFogDensity) {
    problems.push({ kind: 'readability', what: 'fog', value: sky.fogDensity, limit: READABLE.maxFogDensity, message: `The haze (${sky.fogDensity}) is thicker than any place the game ships (${READABLE.maxFogDensity}): the ball would be hard to see.` });
  }
  if (sky?.ambient !== undefined && sky.ambient < READABLE.minAmbient) {
    problems.push({ kind: 'readability', what: 'ambient', value: sky.ambient, limit: READABLE.minAmbient, message: `The light (${sky.ambient}) is darker than any place the game ships (${READABLE.minAmbient}).` });
  }
  const specGround = (VENUE_SPECS as Record<string, { ground?: { color?: string; lineColor?: string } }>)[t.spec]?.ground;
  const floor = exp.look.ground?.color ?? specGround?.color;
  const line = exp.look.ground?.line ?? specGround?.lineColor;
  if ((exp.look.ground?.color || exp.look.ground?.line) && floor && line) {
    const c = contrast(floor, line);
    if (c < READABLE.minLineContrast) {
      problems.push({ kind: 'readability', what: 'lines', value: Math.round(c * 100) / 100, limit: READABLE.minLineContrast, message: `The court lines (${line}) barely show on the floor (${floor}): contrast ${c.toFixed(2)}:1, the lowest the game ships is ${READABLE.minLineContrast}:1.` });
    }
  }
  return { ok: problems.length === 0, problems };
}

const BUDGET_WORD: Record<keyof PhoneSample, string> = { drawCalls: 'draw calls', activeMeshes: 'meshes', textureMb: 'MB of textures', skinnedBodies: 'animated bodies' };
