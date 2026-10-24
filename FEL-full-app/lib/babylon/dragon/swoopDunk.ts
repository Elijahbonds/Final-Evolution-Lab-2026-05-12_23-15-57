// DR_Swoop_Dunk (option A; built by 3D Art per PM relay of Elijah, 4:35 PM PT "Build both options"). The rider STAYS parented to
// DR_Seat; the dragon's code path drops the seat to the hang/slam band at contact (f16) and the rider's hands do the dunk.
//   Seat per frame = max(SWOOP_SEAT_Y, (seat − lowest)(f) + 0.10)  — 3D Art's rule; the floor is checked per frame (DR-F1).
//   Path: along the board on the court side at DR_PASS_SPEED_MPS, seat SWOOP_SEAT_TO_RIM_M in front of the rim at contact.
//   Feel: hold-run → tap (commits the swoop) → slam press in the read around contact → slam; no press → a MISS, never a flush.
// Hoop frame: rim centre at (0, RIM_HEIGHT_M, 0), the board behind it toward −Z, the court toward +Z, the pass along +X.
import { SlamLatch } from '../core/slamPress';
import {
  CLIP_FRAMES, DRAGON_FPS, DR_FLOOR_MARGIN_M, DR_PASS_SPEED_MPS, POWER_HANG_HAND_Y, POWER_SLAM_HAND_Y, SWOOP_CONTACT_F,
  SWOOP_SEAT_TO_LOW, SWOOP_SEAT_TO_RIM_M, SWOOP_SEAT_Y, SWOOP_SLAM_WINDOW_F,
} from './dragonRideConsts';

/** The code seat height at swoop frame `f` (fractional frames sample the nearer measured frame's floor, conservatively). */
export function swoopSeatY(f: number): number {
  const n = CLIP_FRAMES.DR_Swoop_Dunk;
  const a = Math.max(0, Math.min(n, Math.floor(f))), b = Math.max(0, Math.min(n, Math.ceil(f)));
  const low = Math.max(SWOOP_SEAT_TO_LOW[a], SWOOP_SEAT_TO_LOW[b]);
  return Math.max(SWOOP_SEAT_Y, low + DR_FLOOR_MARGIN_M);
}

/** The seat's hoop-frame position at swoop frame `f`. */
export function swoopSeatAt(f: number): { x: number; y: number; z: number } {
  return { x: ((f - SWOOP_CONTACT_F) / DRAGON_FPS) * DR_PASS_SPEED_MPS, y: swoopSeatY(f), z: SWOOP_SEAT_TO_RIM_M };
}

/** The rider's ball-hand height at the hang beat and at the slam end (the rider stands on the seat at contact). */
export function swoopHands(): { hangHandY: number; slamEndHandY: number; seatY: number } {
  const seatY = swoopSeatY(SWOOP_CONTACT_F);
  return { seatY, hangHandY: seatY + POWER_HANG_HAND_Y, slamEndHandY: seatY + POWER_SLAM_HAND_Y };
}

export type SwoopOutcome = 'flyOn' | 'slam' | 'miss';

/** One swoop attempt on the clip's frame clock. */
export class SwoopDunk {
  /** slamHoldSec: SlamLatch.open's hold (TUNE; slamPress has no default, so the caller supplies it). */
  constructor(readonly slamHoldSec: number) {}
  private committed = false;
  private latch = new SlamLatch();
  private result: SwoopOutcome | null = null;
  private frame = 0;

  /** The jump tap during the hold-run commits the swoop; without one the dragon flies on. */
  tap(): void { if (!this.result) this.committed = true; }
  get isCommitted(): boolean { return this.committed; }
  get rider(): 'parented' { return 'parented'; }

  /** A slam press (A) at frame `f`. */
  slam(f: number): void {
    if (!this.committed || this.result) return;
    const open = f >= SWOOP_SLAM_WINDOW_F[0] && f <= SWOOP_SLAM_WINDOW_F[1];
    if (f > SWOOP_SLAM_WINDOW_F[1]) return;
    const r = this.latch.press(f / DRAGON_FPS, open);
    if (r === 'slam') this.result = 'slam';
  }

  /** Advance to frame `f`; resolves when the read closes. */
  step(f: number): SwoopOutcome | null {
    const prev = this.frame; this.frame = f;
    if (this.result) return this.result;
    if (prev < SWOOP_SLAM_WINDOW_F[0] && f >= SWOOP_SLAM_WINDOW_F[0] && this.latch.waiting !== null) {
      const o = this.latch.open(SWOOP_SLAM_WINDOW_F[0] / DRAGON_FPS, this.slamHoldSec);
      if (o && 'slamAt' in o) this.result = 'slam';
    }
    if (!this.result && f > SWOOP_SLAM_WINDOW_F[1]) this.result = this.committed ? 'miss' : 'flyOn';
    return this.result;
  }
  get outcome(): SwoopOutcome | null { return this.result; }
}
