// DR_JumpOff_Pass (option B; Elijah, own words, 4:34 PM PT: "Have your player jump off the dragon"). The dragon passes level beside
// the hoop (seat ≥ 1.974 + 0.10; JUMPOFF_SEAT_Y 2.096 on LOD0, raised per frame where the unfolded exit frames need it). On the
// jump tap the rider unparents from DR_Seat and a code arc carries him DOWN to the hang band (the seat is above it: he drops to the
// rim, not up), into the existing hang (DunkHangPump) and slam (SlamLatch), then to the floor (Y 0). No tap: never unparents, the
// dragon flies on. A no-press after the tap is a MISS (PM-accepted, the same as Dunk mode) — never a flush.
// Hoop frame as in swoopDunk.ts: rim centre (0, RIM_HEIGHT_M, 0), court +Z, the pass along +X.
import { gradePump, PUMP_EXTRA_MS } from '../core/DunkHangPump';
import { SlamLatch } from '../core/slamPress';
import {
  CLIP_FRAMES, DRAGON_FPS, DR_FLOOR_MARGIN_M, DR_PASS_SPEED_MPS, DR_RELEASE_DIST_M, DR_UPKICK_MPS, GRAVITY, JUMPOFF_HANG_FEET_Y,
  DR_BASE_HANG_SEC, JUMPOFF_RELEASE_F, JUMPOFF_SEAT_TO_LOW, JUMPOFF_SEAT_Y, POWER_HANG_HAND_Y,
  POWER_SLAM_HAND_Y, RIM_REACH,
} from './dragonRideConsts';

export function jumpOffSeatY(f: number): number {
  const n = CLIP_FRAMES.DR_JumpOff_Pass;
  const a = Math.max(0, Math.min(n, Math.floor(f))), b = Math.max(0, Math.min(n, Math.ceil(f)));
  return Math.max(JUMPOFF_SEAT_Y, Math.max(JUMPOFF_SEAT_TO_LOW[a], JUMPOFF_SEAT_TO_LOW[b]) + DR_FLOOR_MARGIN_M);
}
export function jumpOffSeatAt(f: number): { x: number; y: number; z: number } {
  return { x: ((f - JUMPOFF_RELEASE_F) / DRAGON_FPS) * DR_PASS_SPEED_MPS, y: jumpOffSeatY(f), z: DR_RELEASE_DIST_M };
}

/** The leap: from the seat at release, an up-kick then a fall that meets the hang feet height; the root travels toward the rim
 *  and stops RIM_REACH in front of the ring's centre (core/DriveFlight.ts: the hand is above the head, not in front). */
export interface LeapPlan { feet0: number; tHang: number; vz: number; vy: number; stopZ: number }
export function planLeap(seatY = jumpOffSeatY(JUMPOFF_RELEASE_F)): LeapPlan {
  const h = seatY - JUMPOFF_HANG_FEET_Y, v = DR_UPKICK_MPS, g = GRAVITY;
  const tHang = (v + Math.sqrt(v * v + 2 * g * h)) / g;   // the falling root of y0 + v t − g t²/2 = hangY
  const travel = DR_RELEASE_DIST_M - RIM_REACH;
  return { feet0: seatY, tHang, vz: -travel / tHang, vy: v, stopZ: RIM_REACH };
}

/** TUNE (PM 5:57 PM PT): the rider's sideways leap speed, DERIVED from the solved leap (travel 1.28 − RIM_REACH over the fall to
 *  the hang, with the 0.10 s up-kick) — ≈ 1.94 m/s; replaces the RE-SPEC's 3.22 (1.28 m / 0.398 s, no up-kick, full travel). */
export const RIDER_LEAP_LATERAL_MPS = -planLeap().vz;

export type JumpOffPhase = 'riding' | 'leap' | 'hang' | 'drop' | 'landed';
export type JumpOffOutcome = 'flyOn' | 'slam' | 'miss';

export class JumpOffDunk {
  /** slamHoldSec: SlamLatch.open's hold (TUNE; slamPress has no default, so the caller supplies it). */
  constructor(readonly slamHoldSec: number) {}
  private ph: JumpOffPhase = 'riding';
  private plan: LeapPlan | null = null;
  private t = 0;               // seconds since the tap
  private hangEnd = 0;
  private dropT = 0;
  private latch = new SlamLatch();
  private result: JumpOffOutcome | null = null;
  private pumped = false;
  private feet = { x: 0, y: 0, z: 0 };
  private log: { frame: number; parented: boolean }[] = [];
  private tappedAt: number | null = null;

  get phase(): JumpOffPhase { return this.ph; }
  get outcome(): JumpOffOutcome | null { return this.result; }
  get parented(): boolean { return this.ph === 'riding'; }
  get feetPos(): { x: number; y: number; z: number } { return { ...this.feet }; }
  get leap(): LeapPlan | null { return this.plan; }
  get parentLog(): readonly { frame: number; parented: boolean }[] { return this.log; }
  get tapFrame(): number | null { return this.tappedAt; }

  /** A dragon frame while riding (logs the parenting; places the parented feet on the seat). */
  ride(f: number): void {
    if (this.ph === 'riding') { const s = jumpOffSeatAt(f); this.feet = { ...s }; }
    this.log.push({ frame: f, parented: this.ph === 'riding' });
    if (this.ph === 'riding' && f >= CLIP_FRAMES.DR_JumpOff_Pass && !this.result) this.result = 'flyOn';
  }

  /** The jump tap — only at the release frame (f14 ± 0.5) does it leave the dragon. */
  tap(f: number): boolean {
    if (this.ph !== 'riding' || Math.abs(f - JUMPOFF_RELEASE_F) > 0.5) return false;
    const s = jumpOffSeatAt(JUMPOFF_RELEASE_F);
    this.plan = planLeap(s.y);
    this.feet = { x: s.x, y: s.y, z: s.z };
    this.ph = 'leap'; this.t = 0; this.tappedAt = f;
    this.hangEnd = this.plan.tHang + DR_BASE_HANG_SEC;
    return true;
  }

  /** A slam press (A) `atSec` after the tap. Held up to slamHoldSec before the hang opens. */
  slam(): void {
    if (this.ph === 'riding' || this.result || !this.plan) return;
    const open = this.ph === 'hang';
    if (this.ph === 'drop' || this.ph === 'landed') return;
    if (this.latch.press(this.t, open) === 'slam') this.result = 'slam';
  }
  /** A RUN press in the air: the hang pump (DunkHangPump). Clip time is mapped so the HANG beat is the arc's hang. */
  pump(pumpBeatT: number, slamReadAt: number): boolean {
    if (this.pumped || this.ph !== 'leap' && this.ph !== 'hang') return false;
    const v = gradePump(pumpBeatT, { used: this.pumped, slamReadAt });
    if (!v.ok) return false;
    this.pumped = true; this.hangEnd += PUMP_EXTRA_MS / 1000;
    return true;
  }

  /** Advance `dt` seconds. */
  step(dt: number): void {
    if (this.ph === 'riding' || this.ph === 'landed' || !this.plan) return;
    const p = this.plan; this.t += dt;
    if (this.ph === 'leap') {
      const t = Math.min(this.t, p.tHang);
      this.feet.y = p.feet0 + p.vy * t - 0.5 * GRAVITY * t * t;
      this.feet.z = Math.max(p.stopZ, jumpOffSeatAt(JUMPOFF_RELEASE_F).z + p.vz * t);
      if (this.t >= p.tHang) {
        this.feet.y = JUMPOFF_HANG_FEET_Y; this.ph = 'hang';
        const o = this.latch.open(p.tHang, this.slamHoldSec);
        if (o && 'slamAt' in o) this.result = 'slam';
      }
    }
    if (this.ph === 'hang' && this.t >= this.hangEnd) {
      if (!this.result) this.result = 'miss';
      this.ph = 'drop'; this.dropT = 0;
    }
    if (this.ph === 'drop') {
      this.dropT += this.t > this.hangEnd ? Math.min(dt, this.t - this.hangEnd) : 0;
      const y = JUMPOFF_HANG_FEET_Y - 0.5 * GRAVITY * this.dropT * this.dropT;
      if (y <= 0) { this.feet.y = 0; this.ph = 'landed'; } else this.feet.y = y;
    }
  }

  /** Ball-hand height over the feet at the hang beat / the slam end (the authored power-slam keys). */
  hands(): { hangHandY: number; slamEndHandY: number } {
    return { hangHandY: JUMPOFF_HANG_FEET_Y + POWER_HANG_HAND_Y, slamEndHandY: JUMPOFF_HANG_FEET_Y + POWER_SLAM_HAND_Y };
  }
}
