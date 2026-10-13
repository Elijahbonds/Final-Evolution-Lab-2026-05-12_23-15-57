// THE DUEL'S SET (vis-hoops-dunk, Part B dunkduel: "a 3D score tower beside the court that counts up", "the same judges' table as
// dunk"): the score tower and the judges' table, mounted together. The tower is a lit panel on posts at the baseline, turned to the
// runway: both totals, the colour of whoever has the floor. The table is the dunk contest's (JudgesTable). Display only.

import { Vector3 } from '@babylonjs/core';
import type { Scene } from '@babylonjs/core';
import { mountBoard3D, type Board3DHandle } from './Board3D';
import { paintDuel, type DuelBoard } from './boardPaint';
import { DUNK_COURT } from './courtLayout';
import { yawToward } from './faceToward';
import { mountJudgesTable, type JudgesTableHandle } from './JudgesTable';

export interface DuelDressingHandle {
  update(s: DuelBoard): void;
  readonly board: Board3DHandle<DuelBoard>;
  readonly judges: JudgesTableHandle;
  dispose(): void;
}

/** Where the tower stands: beside the hoop on the right, turned to the runway's start. */
export function towerSpot(): { x: number; y: number; z: number; yaw: number } {
  const at = { x: 6.2, y: 3.4, z: DUNK_COURT.rimZ - 0.6 };
  return { ...at, yaw: yawToward(at, { x: 0, z: DUNK_COURT.startZ }) };
}

export function mountDuelDressing(scene: Scene, initial: DuelBoard, judgeCount: number): DuelDressingHandle {
  const spot = towerSpot();
  const board = mountBoard3D<DuelBoard>(scene, {
    name: 'dd_tower', at: new Vector3(spot.x, spot.y, spot.z), yaw: spot.yaw, width: 4.4, height: 2.5, px: [768, 440], posts: true,
  }, paintDuel);
  const judges = mountJudgesTable(scene, DUNK_COURT.judgesAt, DUNK_COURT.judgesFace, judgeCount);
  const handle: DuelDressingHandle = {
    board, judges,
    update(s) { board.set(`${s.p1}|${s.p2}|${s.up}|${s.dunk}`, s); },
    dispose() { board.dispose(); judges.dispose(); },
  };
  handle.update(initial);
  return handle;
}
