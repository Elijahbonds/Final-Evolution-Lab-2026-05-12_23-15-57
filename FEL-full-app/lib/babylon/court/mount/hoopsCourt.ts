// HOOPS COURT (vis-hoops-court, 2026-10-14) — the one mount the two court modes call.
//
// OneVOneMode and ThreeVThreeMode are 3 600- and 3 900-line closures that the owner's right-stick pass (PR #240) is editing, so
// neither carries visual work: each mounts this once in load(), calls its two hooks (holdIntro at the top of update(), deadBall at
// the head of its possession reset) and disposes it. Everything the Part B pass adds to a court game is built from here:
//
//   the broadcast  (hoopsBroadcast)  the intro holds the game, moments noted, the replay at the next dead ball
//   the scuffs     (hoopsScuffs)     the court keeps the marks of the cuts, stops and landings
//   the dusk       (hoopsDusk)       the light goes down over the game and the lamps come up
//   the set        (streetballDressing, 3v3 only)  the cage, the walls, the benches, the pole lights, the team rings
//
// It owns no rule and no number the modes tune: it is handed what to read (positions, a progress, whether this is the end) and
// what to do (the reset), and never writes a score, a clock, a speed or a camera distance.

import type { Vector3 } from '@babylonjs/core';
import type { TransformNode } from '@babylonjs/core';
import type { ModeContext } from '../../core/ModeHarness';
import { mountHoopsBroadcast, type HoopsBroadcast } from './hoopsBroadcast';
import { mountHoopsScuffs } from '../hoopsScuffs';
import { mountDusk } from './hoopsDusk';
import { mountStreetball, type StreetballTeams } from '../streetballDressing';

export interface HoopsCourtOpts {
  kind: 'onevone' | 'threevthree';
  rim: Vector3;
  /** The bodies on the court (read each frame: they are spawned in load()). */
  bodies: () => readonly (TransformNode | null | undefined)[];
  /** The possession that just ended was the game's last (the mode's `ended`, its buzzer). Never replayed. */
  final: () => boolean;
  /** How far through the game it is, 0..1 (the score against the target; 3v3 also the clock). */
  progress: () => number;
  /** 3v3 only: who is on whose side, for the rings under their feet. */
  teams?: StreetballTeams;
}

export interface HoopsCourt extends HoopsBroadcast {
  readonly kind: 'onevone' | 'threevthree';
  /** Probes and the rig: hold the dusk at this progress (0..1) whatever the score; null lets the game drive it again. */
  force(progress: number | null): void;
}

export function mountHoopsCourt(ctx: ModeContext, o: HoopsCourtOpts): HoopsCourt {
  const tier = (ctx.scene.metadata as { felTier?: string } | null)?.felTier ?? 'desktop';
  const broadcast = mountHoopsBroadcast(ctx, { rim: o.rim, final: o.final });
  const scuffs = mountHoopsScuffs(ctx.scene, o.bodies);
  let forced: number | null = null;
  const dusk = mountDusk(ctx, () => forced ?? o.progress());
  const set = o.kind === 'threevthree' ? mountStreetball(ctx.scene, { tier, rim: o.rim, teams: o.teams }) : null;
  const court: HoopsCourt = {
    kind: o.kind,
    holdIntro: broadcast.holdIntro, deadBall: broadcast.deadBall, note: broadcast.note, reset: broadcast.reset, force(p) { forced = p; },
    get replays() { return broadcast.replays; },
    dispose() {
      broadcast.dispose(); scuffs.dispose(); dusk.dispose(); set?.dispose();
      const m = ctx.scene.metadata as { felHoops?: unknown } | null;
      if (m?.felHoops === court) delete m.felHoops;
    },
  };
  (ctx.scene.metadata ??= {}).felHoops = court;   // for probes and the rig: a moment can be noted and a dead ball called by hand
  return court;
}
