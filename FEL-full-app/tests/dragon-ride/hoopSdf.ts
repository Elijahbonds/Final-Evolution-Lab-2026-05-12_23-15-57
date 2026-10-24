// Test-only: distance from points to the DUNK hoop (the NexusWebScene prop Dunk mode plays on), built from courtDims' HOOP — in the
// hoop frame the dragon modules use: rim centre at (0, RIM_HEIGHT_M, 0), board behind toward −Z, court +Z.
import { HOOP } from '../../lib/babylon/core/courtDims';

const rimY = HOOP.RIM_HEIGHT_M;
export const HOOP_PARTS = {
  rim: { R: HOOP.DUNK_RIM_RADIUS, r: HOOP.RIM_TUBE_M / 2 },
  net: { y0: rimY - HOOP.NET_CENTRE_BELOW_RIM_M - HOOP.NET_H / 2, y1: rimY - HOOP.NET_CENTRE_BELOW_RIM_M + HOOP.NET_H / 2, r0: HOOP.NET_BOTTOM_D / 2, r1: HOOP.NET_TOP_D / 2 },
  board: {
    lo: [-HOOP.BOARD_W / 2, rimY + HOOP.BOARD_CENTRE_ABOVE_RIM_M - HOOP.BOARD_H / 2, HOOP.BOARD_CENTRE_Z_M - HOOP.POLE_BEHIND_RIM_M - HOOP.BOARD_D / 2],
    hi: [HOOP.BOARD_W / 2, rimY + HOOP.BOARD_CENTRE_ABOVE_RIM_M + HOOP.BOARD_H / 2, HOOP.BOARD_CENTRE_Z_M - HOOP.POLE_BEHIND_RIM_M + HOOP.BOARD_D / 2],
  },
  pole: { z: -HOOP.POLE_BEHIND_RIM_M, r: HOOP.POLE_D_M / 2, y0: 0, y1: HOOP.POLE_H_M },
} as const;

export function hoopDistance(x: number, y: number, z: number): number {
  const { rim, net, board, pole } = HOOP_PARTS;
  const q = Math.hypot(x, z) - rim.R; const dRim = Math.hypot(q, y - rimY) - rim.r;
  const yc = Math.min(net.y1, Math.max(net.y0, y)); const rad = net.r0 + ((net.r1 - net.r0) * (yc - net.y0)) / (net.y1 - net.y0);
  const dNet = Math.hypot(Math.max(0, Math.hypot(x, z) - rad), Math.max(0, net.y0 - y, y - net.y1));
  const bx = Math.max(0, board.lo[0] - x, x - board.hi[0]), by = Math.max(0, board.lo[1] - y, y - board.hi[1]), bz = Math.max(0, board.lo[2] - z, z - board.hi[2]);
  const dBoard = Math.hypot(bx, by, bz);
  const dPole = Math.hypot(Math.max(0, Math.hypot(x, z - pole.z) - pole.r), Math.max(0, pole.y0 - y, y - pole.y1));
  return Math.min(dRim, dNet, dBoard, dPole);
}

/** The hoop's floor footprint (XZ), grown by `m`. */
export function inHoopFootprint(x: number, z: number, m: number): boolean {
  const { board, pole, rim, net } = HOOP_PARTS;
  const xr = Math.max(board.hi[0], rim.R + rim.r, net.r1) + m;
  const zlo = Math.min(board.lo[2], pole.z - pole.r) - m, zhi = Math.max(rim.R + rim.r, net.r1) + m;
  return x >= -xr && x <= xr && z >= zlo && z <= zhi;
}
