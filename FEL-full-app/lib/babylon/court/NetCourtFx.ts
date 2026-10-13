// NET COURT FX (vis-court, wave 2, 2026-10-13) — everything the net sports show that is not the rally.
//
// One object a net mode (tennis, volleyball) mounts in load() and calls at the moments it already has: a body's step, a contact,
// a landing, the ball brushing the net, a swing. It owns the dressing (the beach, the gym hall or the stadium boards), the net,
// the surface's reaction (sand and clay dust, footprints, ball marks, the spike's ring), the ball's squash, the swing trails and
// the sea. The mode keeps every rule; this reads positions and events and draws. A wiring test holds that this folder imports no
// scoring, judging or timing module.
//
// Budget: the beach is two thin-instanced meshes and four flags, the gym ~20 meshes, the stadium eight; the ring pool and the
// trails are a handful each. Phones get the thinned layouts and no ocean, no stand, no ad glow strength.

import type { AbstractMesh, Scene, TransformNode } from '@babylonjs/core';
import { Vector3 } from '@babylonjs/core';
import { EffectsKit } from '../visual/EffectsKit';
import { buildNet, brushStrength, hideVenueNet, type NetHandle } from './NetKit';
import { buildBeachDressing, type BeachDressingHandle } from './BeachDressing';
import { buildGymHall, type GymHandle } from './GymHall';
import { buildStadiumDressing, type StadiumHandle } from './StadiumDressing';
import { mountShockRings, type ShockRingHandle } from './ShockRing';
import { mountSwingTrail, followTip, type SwingTrailHandle } from './SwingTrail';
import { SURFACE_LOOK, contactForce, squashOf, strides, surfaceOf, type NetSurface } from './surfaces';
import { stampDecal } from './decals';

export interface NetCourtOpts {
  modeId: string;
  /** the player's place pick (placeLooks.ts); undefined = home */
  placeId?: string;
  cfg: { halfWidth: number; halfLength: number; netHeight: number };
  cage: boolean;
  /** 'mobile' | 'desktop' | 'high' */
  tier: string;
}

export type ContactKind = 'spike' | 'dig' | 'set' | 'swing' | 'serve' | 'block';

export interface NetCourtFx {
  readonly surface: NetSurface;
  readonly net: NetHandle;
  /** The hall replaces the beach under a place that is indoors: the mode asks before it builds sand. */
  readonly indoors: boolean;
  /** Bind the bodies' right hands so the swings draw their streak: hand and forearm bone nodes for the hero, then the opponent. */
  bindTrails(hero: { hand: TransformNode; fore: TransformNode } | null, foe: { hand: TransformNode; fore: TransformNode } | null): void;
  /** Every frame: the bodies' ground positions, the swing flags, and the net the ball is crossing. */
  update(dt: number, s: { hero: { x: number; z: number }; foe: { x: number; z: number }; heroSwing: boolean; foeSwing: boolean; ball: { x: number; y: number; z: number } | null }): void;
  /** A contact at `at` (the ball's place), the toucher's feet at `feet`. */
  contact(at: { x: number; y: number; z: number }, feet: { x: number; z: number }, q: 'perfect' | 'good' | 'late' | 'early' | 'miss', kind: ContactKind, ball: AbstractMesh | null): void;
  /** A ball came down on the court at (x, z) (a point-ending landing, or each flight's landing in tennis). */
  landing(x: number, z: number, hard: boolean): void;
  dispose(): void;
}

export function mountNetCourtFx(scene: Scene, o: NetCourtOpts): NetCourtFx {
  const surface = surfaceOf(o.modeId, o.placeId);
  const look = SURFACE_LOOK[surface];
  const phone = o.tier === 'mobile';
  const volley = o.modeId === 'volleyball';
  const indoors = surface === 'gym';
  const net = buildNet(scene, o.cfg, volley ? 'volley' : 'tennis');
  hideVenueNet(scene);
  let beach: BeachDressingHandle | null = null, hall: GymHandle | null = null, stadium: StadiumHandle | null = null;
  // the dressing is a picture: a failure in it (no canvas, a missing builder) must never cost the mode its load
  const guard = <T>(what: string, f: () => T): T | null => { try { return f(); } catch (e) { console.warn(`[FEL-COURT] ${what} unavailable:`, e); return null; } };
  if (volley && !indoors) beach = guard('beach', () => buildBeachDressing(scene, o.cfg.halfWidth, o.cfg.halfLength, { phone }));
  else if (volley && indoors) hall = guard('gym hall', () => buildGymHall(scene, o.cfg.halfWidth, o.cfg.halfLength, { phone }));
  else {
    // tennis: outside the cage's glass when there is one (CAGE.sideM 1.2 / backM 1.6), else outside the lines
    // the sponsors stand just INSIDE the glass, against it (the camera looks through one pane at a grazing angle: a board behind the
    // glass was veiled to white on the first capture); the umpire's chair stands outside it
    const rx = o.cfg.halfWidth + (o.cage ? 1.2 : 0.4), rz = o.cfg.halfLength + (o.cage ? 1.6 : 0.8);
    stadium = guard('stadium boards', () => buildStadiumDressing(scene, rx, rz, { x: o.cfg.halfWidth + (o.cage ? 2.9 : 2.4), z: 0 }, { phone, gap: o.cage ? -0.09 : 0.3 }));
  }
  const rings: ShockRingHandle = mountShockRings(scene);
  const trails: { hero: SwingTrailHandle | null; foe: SwingTrailHandle | null } = { hero: null, foe: null };
  const tips: { dispose(): void }[] = [];
  const acc = { hero: 0, foe: 0 }, last = { hero: null as { x: number; z: number } | null, foe: null as { x: number; z: number } | null };
  let squash: { ball: AbstractMesh; t: number; sec: number; flat: number } | null = null;
  const tmp = new Vector3();
  let prevBallZ: number | undefined;

  const dust = (x: number, z: number, k: number): void => {
    if (!look.dust || k <= 0) return;
    tmp.set(x, 0.08, z);
    EffectsKit.burst(scene, tmp, 'dust', Math.max(0.35, k * look.dustScale), look.dust);
  };
  const step = (who: 'hero' | 'foe', p: { x: number; z: number }): void => {
    const prev = last[who];
    last[who] = { x: p.x, z: p.z };
    if (!prev || !look.footprints) return;
    const dx = p.x - prev.x, dz = p.z - prev.z, d = Math.hypot(dx, dz);
    if (d < 1e-4 || d > 2) return;   // a teleport (a point reset) lays nothing
    const r = strides(acc[who], d); acc[who] = r.acc;
    for (let i = 0; i < r.prints; i++) stampDecal(scene, 'foot', p.x, p.z, Math.atan2(dx, dz), volley ? 2.2 : 1.6);
  };

  return {
    surface, net, indoors,
    bindTrails(hero, foe) {
      const mk = (b: { hand: TransformNode; fore: TransformNode } | null, name: string): SwingTrailHandle | null => {
        if (!b) return null;
        const f = followTip(scene, b.hand, b.fore, volley ? 0.18 : 0.5, name);
        tips.push(f);
        return mountSwingTrail(scene, f.tip, { color: volley ? '#fff7e0' : '#eaf6ff', width: volley ? 0.16 : 0.1, length: volley ? 14 : 22, alpha: volley ? 0.5 : 0.65, name });
      };
      trails.hero?.dispose(); trails.foe?.dispose();
      trails.hero = mk(hero, 'hero'); trails.foe = mk(foe, 'foe');
    },
    update(dt, s) {
      net.update(dt); beach?.update(dt);
      trails.hero?.drive(dt, s.heroSwing); trails.foe?.drive(dt, s.foeSwing);
      step('hero', s.hero); step('foe', s.foe);
      if (squash) {
        squash.t += dt;
        const k = Math.max(0, 1 - squash.t / squash.sec);
        const f = 1 - (1 - squash.flat) * k, w = 1 + (1 - squash.flat) * 0.5 * k;
        squash.ball.scaling.set(w, f, w);
        if (k <= 0) { squash.ball.scaling.set(1, 1, 1); squash = null; }
      }
      // the ball brushing the net: it crosses the plane at z = 0 within hands of the tape
      if (s.ball) {
        if (prevBallZ !== undefined && prevBallZ * s.ball.z < 0) net.shake(brushStrength(s.ball.y - o.cfg.netHeight));
        prevBallZ = s.ball.z;
      } else prevBallZ = undefined;
    },
    contact(at, feet, q, kind, ball) {
      const force = contactForce(q, kind === 'dig' ? 'bump' : kind === 'set' ? 'set' : kind);
      if (force <= 0) return;
      if (kind === 'spike' && look.ring) rings.fire({ x: at.x, z: at.z }, { radius: 1.1 + force * 1.6, color: look.ring });
      if (kind === 'spike' || kind === 'dig' || kind === 'serve') dust(feet.x, feet.z, force * (kind === 'spike' ? 1.3 : 0.9));
      if (ball && force >= 0.3) { const s = squashOf(force); ball.scaling.set(1, 1, 1); squash = { ball, t: 0, sec: s.sec, flat: s.flat }; }
    },
    landing(x, z, hard) {
      if (look.ballMark != null) stampDecal(scene, 'scuff', x, z, 0, look.ballMark);
      if (hard) { dust(x, z, 1); if (look.ring) rings.fire({ x, z }, { radius: 1.3, color: look.ring }); }
      else dust(x, z, 0.5);
    },
    dispose() {
      trails.hero?.dispose(); trails.foe?.dispose(); for (const t of tips) t.dispose();
      rings.dispose(); beach?.dispose(); hall?.dispose(); stadium?.dispose(); net.dispose();
      if (squash) squash.ball.scaling.set(1, 1, 1);
    },
  };
}
