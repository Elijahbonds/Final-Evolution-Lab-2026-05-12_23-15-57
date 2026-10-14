// THE 3-POINT CONTEST'S SET (vis-hoops-dunk, Part B threepoint): the lit racks and the 3D scoreboard, mounted together and driven
// from one `update(state)` the mode calls with numbers it already has (the score, the rack, the clock, the streak). The contest
// had a bare court and a plank of balls; this is what a televised one stands in. Display only.

import { Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { mountBoard3D, type Board3DHandle } from './Board3D';
import { paintShootout, type ShootoutBoard } from './boardPaint';
import { mountRackDressing, type RackDressingHandle } from './RackDressing';
import { yawToward } from './faceToward';

export interface ShootoutState extends ShootoutBoard { moneyRackIdx: number }

export interface ShootoutDressingHandle {
  update(s: ShootoutState): void;
  readonly board: Board3DHandle<ShootoutBoard>;
  readonly racks: RackDressingHandle;
  dispose(): void;
}

/** Where the scoreboard hangs, from the rim and the court's centre: high behind the hoop (a stadium's scoreboard: above the backboard
 *  from every rack, never across it), turned to face the arc. Measured on the rig: left of the hoop it crossed the backboard from the
 *  first rack's camera; above it, no rack's camera has them touch. */
export function boardSpot(rim: { x: number; z: number }, arcCentre: { x: number; z: number }): { x: number; y: number; z: number; yaw: number } {
  const at = { x: rim.x, y: 7.2, z: rim.z - 7.9 };
  return { ...at, yaw: yawToward(at, arcCentre) };
}

export function mountShootoutDressing(scene: Scene, stands: readonly Vector3[], rim: Vector3, initial: ShootoutState): ShootoutDressingHandle {
  const racks = mountRackDressing(scene, stands, -1, (scene.metadata as { felTier?: string } | null)?.felTier);
  const spot = boardSpot(rim, { x: rim.x, z: rim.z + 7 });
  const board = mountBoard3D<ShootoutBoard>(scene, {
    name: 'tp_board', at: new Vector3(spot.x, spot.y, spot.z), yaw: spot.yaw, width: 6.4, height: 2.4, px: [1024, 384], posts: true,
  }, paintShootout);
  const handle: ShootoutDressingHandle = {
    board, racks,
    update(s) {
      board.set(`${s.score}|${s.rack}|${s.racks}|${s.clock === null ? 'x' : Math.ceil(s.clock)}|${s.streak >= s.fireAt ? 'F' : s.streak}|${s.moneyRack ? 1 : 0}`, s);
      racks.setMoneyRack(s.moneyRackIdx);
      racks.setActive(s.rack);
    },
    dispose() { board.dispose(); racks.dispose(); },
  };
  handle.update(initial);   // the face reads true from the first frame (the board stands through READY, before the mode's update runs)
  return handle;
}
