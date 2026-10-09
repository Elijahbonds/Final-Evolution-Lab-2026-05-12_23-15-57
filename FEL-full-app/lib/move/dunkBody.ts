// dunkBody — P5, dunk (and dunk duel) played from the body (BODY-PLAY-WORKS follow-on).
//
// The contest already reads a pad: RT holds the run, L2 gathers, A on the run is the take-off, A in the
// flight is the slam, B on the runway cycles style. This turns the pose reader's events into those same
// presses. It does not touch the flight, the judges, or the clips.
//
// A jog (the fight read's stride line) holds RUN at a whisper, so the approach moves and the power bar
// stays empty. The take-off writes the bar from the jump's own predicted rise. The slam is the airborne
// strike or release, placed on the flight clock by how early or late it was against the body's own apex,
// so the existing window grades it. A wave, a stand, and a slow walk press nothing: no jog, no take-off.
//
// P6 (3PT, 1v1, 3v3) can reuse this shape — cadence for the drive, take-off for the jump, release for the
// shot — through their ControlSource, not these RT / L2 / A / B presses. Not built here.
//
// Feel, flagged: DUNK_FULL_RISE_M (0.70 m of predicted rise is a full trigger). DUNK_RUN_HOLD (0.05) is
// just over the modes' 0.02 run start, so a jog is not a full-power jump. The jog line is FIGHT_STRIDE_HZ.
//
// Pure: no DOM, no camera, no network.
import type { FelInput } from '@/lib/babylon/core/InputBus';
import type { ModeBodySpec } from '@/lib/input/bodyProfiles';
import { EASTBAY_TIMING } from '@/lib/babylon/anim/authored/timing';
import { realAt, QTE_WINDOW_SEC } from '@/lib/pose/baseline';
import {
  BodyReader, DIP_MIN_M, FIGHT_STRIDE_HZ, type BodyEvent,
} from '@/lib/pose/BodyReader';
import { bodyPackets } from '@/lib/pose/seamReplay';
import type { Emitted } from '@/lib/pose/baseline';
import type { PoseFrame } from '@/lib/pose/landmarks';

/** A jog. The fight read's own line (BodyReader FIGHT_STRIDE_HZ): a slower walk is not a run-up. */
export const DUNK_JOG_HZ = FIGHT_STRIDE_HZ;

/**
 * Predicted hip rise (m) that fills the run trigger. Shorter jumps scale down, so a hop is not a max jump.
 * Flag: a new mapping onto the existing 0–1 trigger. The contest's apex formula is unchanged.
 */
export const DUNK_FULL_RISE_M = 0.70;

/** RT while jogging. Above the modes' 0.02 run start, under any real jump's power. */
export const DUNK_RUN_HOLD = 0.05;

const G = 9.81;

/** What the mode claims, and the card the READY screen shows once the body drives the dunk. */
export const DUNK_BODY: ModeBodySpec = {
  claims: ['step', 'penultimate', 'dip', 'takeoff', 'apex', 'reach', 'strike', 'release', 'land'],
  lines: [
    { move: 'Run in place', verb: 'RUN' },
    { move: 'Plant', verb: 'GATHER' },
    { move: 'Jump', verb: 'TAKE OFF' },
    { move: 'Swing through at the top', verb: 'SLAM' },
  ],
};

export interface DunkBodyAct {
  /** Presses to deliver now, in order. */
  now: FelInput[];
  /** Flight-clock second of the slam, once the airborne finish is known. */
  slamClip: number | null;
  /** The mode took this event (a wave returns false, so it is not play). */
  took: boolean;
}

const trigger = (side: 'L' | 'R', value: number): FelInput => ({ t: 'trigger', side, value, src: 'body' });
const tap = (btn: 'A' | 'B'): FelInput[] => [
  { t: 'button', btn, pressed: true, src: 'body' },
  { t: 'button', btn, pressed: false, src: 'body' },
];

/** One attempt's binding. A mount keeps one; reset it when the contest starts the next dunk. */
export class DunkBodyBinder {
  private running = false;
  private gathered = false;
  private launched = false;
  private styled = false;
  private finished = false;
  /** App time of the take-off press. The slam is placed this far after it. */
  launchAt = 0;
  private takeoffT = 0;
  private apexT: number | null = null;
  /** The take-off's predicted rise, and the trigger it wrote (0 when no jump has left the floor). */
  heightM = 0;
  power01 = 0;

  reset(): void {
    this.running = false;
    this.gathered = false;
    this.launched = false;
    this.styled = false;
    this.finished = false;
    this.launchAt = 0;
    this.takeoffT = 0;
    this.apexT = null;
    this.heightM = 0;
    this.power01 = 0;
  }

  see(ev: BodyEvent): DunkBodyAct {
    const now: FelInput[] = [];
    let slamClip: number | null = null;
    let took = false;

    if (ev.kind === 'step' && ev.cadenceHz !== null && ev.cadenceHz >= DUNK_JOG_HZ && !this.running && !this.launched) {
      this.running = true;
      now.push(trigger('R', DUNK_RUN_HOLD));
      took = true;
    }
    if ((ev.kind === 'penultimate' || (ev.kind === 'dip' && ev.depthM >= DIP_MIN_M)) && !this.gathered && !this.launched) {
      this.gathered = true;
      now.push(trigger('L', 1));
      took = true;
    }
    // B cycles style only on the runway, before RUN. In the charge it is a kick-up, so a reach after the jog starts
    // is not a style press. A wave never gathers, so it never reaches this.
    if (ev.kind === 'reach' && this.gathered && !this.running && !this.styled && !this.launched) {
      this.styled = true;
      now.push(...tap('B'));
      took = true;
    }
    if (ev.kind === 'takeoff' && !this.launched) {
      const power = Math.max(0, Math.min(1, ev.predictedHeightM / DUNK_FULL_RISE_M));
      this.power01 = power;
      this.heightM = ev.predictedHeightM;
      this.takeoffT = ev.t;
      this.launchAt = ev.seen;
      this.launched = true;
      this.running = true;
      now.push(trigger('R', Math.max(DUNK_RUN_HOLD, power)));
      now.push(...tap('A'));
      took = true;
    }
    if (ev.kind === 'apex' && this.launched) this.apexT = ev.t;
    if ((ev.kind === 'strike' || ev.kind === 'release') && ev.airborne === true && this.launched && !this.finished) {
      this.finished = true;
      const apex = this.apexT ?? this.takeoffT + Math.sqrt((2 * Math.max(this.heightM, 0.05)) / G) * 1000;
      const lateSec = (ev.t - apex) / 1000;
      const half = QTE_WINDOW_SEC / 2;
      slamClip = Math.min(EASTBAY_TIMING.extend + half, Math.max(EASTBAY_TIMING.extend - half, EASTBAY_TIMING.extend + lateSec));
      took = true;
    }
    return { now, slamClip, took };
  }
}

/**
 * One synthetic stream through the real reader and this binding. Presses are stamped at the frame's arrival.
 * The slam is stamped where the flight clock grades that same lateness, so dunkRead / duelRead can score it
 * without a scene.
 */
export function dunkBodyReplay(frames: readonly PoseFrame[]): { events: Emitted[]; power01: number; heightM: number } {
  const binder = new DunkBodyBinder();
  const stamped: (Emitted & { seq: number })[] = [];
  let seq = 0;
  let launchAt = 0;
  for (const p of bodyPackets(frames)) {
    for (const ev of p.events) {
      const act = binder.see(ev);
      if (act.now.some((e) => e.t === 'button' && e.btn === 'A' && e.pressed)) launchAt = p.arrivedAt;
      for (const e of act.now) stamped.push({ e, at: p.arrivedAt, t: ev.t, frame: p.frame, seq: seq++ });
      if (act.slamClip !== null) {
        const at = launchAt + realAt(act.slamClip) * 1000;
        stamped.push({
          e: { t: 'button', btn: 'A', pressed: true, src: 'body' },
          at, t: ev.t, frame: p.frame, seq: seq++,
        });
      }
    }
  }
  stamped.sort((a, b) => a.at - b.at || a.seq - b.seq);
  return { events: stamped.map(({ seq: _s, ...e }) => e), power01: binder.power01, heightM: binder.heightM };
}

/** The reader, so a test can see which events a stream actually produced. */
export function readPoseEvents(frames: readonly PoseFrame[]): BodyEvent[] {
  const reader = new BodyReader();
  return frames.flatMap((f) => reader.read(f).events);
}
