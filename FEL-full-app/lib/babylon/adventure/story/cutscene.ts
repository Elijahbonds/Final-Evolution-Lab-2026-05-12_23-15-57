/**
 * The cutscene runner (ADVENTURE PLAN, "The dialogue and cutscene player": "CinematicPlayer from
 * lib/cinematic/timeline.ts runs the camera track; its beats (`id: 'line'`, `payload: <lineId>`) drive the dialogue,
 * clips and partner moves. The sim pauses; the camera hint is `cutscene`"). Pure.
 *
 * A cutscene is built into a `Cinematic`: a camera track around the focus (a slow push-in, an orbit, or a wide shot)
 * and one `line` beat per line, spaced by each line's reading time, plus the effect beats (`fuse`, `end`). The runner
 * advances the CinematicPlayer each real frame and hands the dialogue player each line as its beat fires.
 *
 * THE PLAYHEAD NEVER RUNS AHEAD OF THE WORDS. While a line is still on screen the timeline holds just short of the next
 * line's beat (the camera eases on until then); a tap that finishes a line early lets the timeline CATCH UP at
 * CATCHUP_RATE, so the camera never jumps. A HOLD skips the cutscene: the dialogue is cleared and every effect beat
 * not yet fired fires now, in order (a skipped first fusion still fuses: a skip never loses progress).
 */

import { CinematicPlayer, type Beat, type Cinematic, type CameraKey } from '@/lib/cinematic/timeline';
import type { CameraFrame } from '@/lib/camera/rigs';
import type { Vec3 } from '../contracts';
import type { CutsceneShot } from './format';
import { lineSec, type DialoguePlayer, type DialogueLine } from './dialogue';

/** The gap the timeline leaves around the lines, seconds. [TUNE] */
export const CUTSCENE_LEAD_SEC = 0.5;
export const CUTSCENE_TAIL_SEC = 0.6;
/** How fast the timeline catches up after a tap finished a line early (× real time). [TUNE] */
export const CATCHUP_RATE = 4;
/** The shots' framing, metres and degrees. [TUNE] */
export const SHOTS: Readonly<Record<CutsceneShot, { from: { dist: number; h: number; side: number }; to: { dist: number; h: number; side: number }; fov: [number, number] }>> = {
  push: { from: { dist: 9, h: 3.2, side: 2.5 }, to: { dist: 5.5, h: 2.2, side: 1.2 }, fov: [48, 42] },
  orbit: { from: { dist: 7, h: 2.6, side: -5 }, to: { dist: 7, h: 2.6, side: 5 }, fov: [46, 46] },
  wide: { from: { dist: 16, h: 6, side: 6 }, to: { dist: 13, h: 5, side: 3 }, fov: [52, 50] },
};

export type CutsceneEffect = 'fuse';

export interface CutsceneSpec {
  id: string;
  lines: readonly DialogueLine[];
  shot?: CutsceneShot;
  /** The point framed (the focus body's chest, a spawn), and the way it faces (radians, 0 = +z). */
  focus: Vec3;
  facingYaw: number;
  effects?: readonly CutsceneEffect[];
}

/** The camera track and beats for a cutscene. Pure: the same spec builds the same cinematic. */
export function buildCinematic(spec: CutsceneSpec): Cinematic {
  const beats: Beat[] = [];
  let t = CUTSCENE_LEAD_SEC;
  for (const l of spec.lines) { beats.push({ t, id: 'line', payload: l.id }); t += lineSec(l.text); }
  // effects land on the last line (the moment the words name), the end after the tail
  const effectAt = spec.lines.length ? beats[beats.length - 1].t : t;
  for (const e of spec.effects ?? []) beats.push({ t: effectAt, id: e });
  const duration = Math.max(t + CUTSCENE_TAIL_SEC, CUTSCENE_LEAD_SEC + CUTSCENE_TAIL_SEC);
  beats.push({ t: duration, id: 'end' });
  beats.sort((a, b) => a.t - b.t);
  const s = SHOTS[spec.shot ?? 'push'];
  const key = (tt: number, f: { dist: number; h: number; side: number }, fov: number): CameraKey => {
    // in front of the focus (it faces the camera), a little to its side
    const fx = Math.sin(spec.facingYaw), fz = Math.cos(spec.facingYaw), rx = Math.cos(spec.facingYaw), rz = -Math.sin(spec.facingYaw);
    const frame: CameraFrame = {
      position: { x: spec.focus.x + fx * f.dist + rx * f.side, y: spec.focus.y + f.h, z: spec.focus.z + fz * f.dist + rz * f.side },
      target: { x: spec.focus.x, y: spec.focus.y + 0.4, z: spec.focus.z },
      fov,
    };
    return { t: tt, frame };
  };
  return { id: spec.id, duration, track: [key(0, s.from, s.fov[0]), key(duration, s.to, s.fov[1])], beats };
}

export interface CutsceneHooks {
  /** An effect beat fired (a skip fires every one not yet fired). */
  onEffect?: (e: CutsceneEffect) => void;
  /** The cutscene is over (played out, or skipped). */
  onEnd?: (skipped: boolean) => void;
}

export class CutsceneRunner {
  private readonly player = new CinematicPlayer();
  private cin: Cinematic | null = null;
  private lines = new Map<string, DialogueLine>();
  private fired = new Set<number>();
  private pending: DialogueLine[] = [];
  private frame: CameraFrame | null = null;
  private ended = false;

  constructor(private readonly dialogue: DialoguePlayer, private readonly hooks: CutsceneHooks = {}) {}

  get active(): boolean { return this.cin !== null; }
  get id(): string | null { return this.cin?.id ?? null; }
  /** The camera frame this frame (null when no cutscene runs). */
  camera(): Readonly<CameraFrame> | null { return this.cin ? this.frame : null; }
  get progress(): number { return this.player.progress; }

  start(spec: CutsceneSpec): void {
    this.cin = buildCinematic(spec);
    this.lines = new Map(spec.lines.map((l) => [l.id, l]));
    this.fired = new Set();
    this.pending = [];
    this.ended = false;
    this.player.play(this.cin);
    this.dialogue.clear();
    this.frame = this.cin.track[0].frame;
  }

  /** Real seconds pass. */
  update(dt: number): void {
    const cin = this.cin;
    if (!cin) return;
    let d = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const t = this.player.progress * cin.duration;
    const nextLine = cin.beats.find((b, i) => b.id === 'line' && !this.fired.has(i));
    const busy = this.dialogue.active;
    if (busy && nextLine) d = Math.min(d, Math.max(0, nextLine.t - t - 1e-4));       // hold short of the next line
    else if (!busy && nextLine && nextLine.t > t) d *= CATCHUP_RATE;                     // the words ran ahead: catch up
    else if (busy && !nextLine) d = Math.min(d, Math.max(0, cin.duration - t - 1e-4)); // the last line is still up
    // CinematicPlayer clamps a step at 50 ms: walk it in steps so catch-up is real
    let left = d;
    do {
      const step = Math.min(left, 0.05);
      left -= step;
      const tick = this.player.update(step);
      this.frame = tick.frame;
      for (const b of tick.fired) this.fire(b);
      if (!this.cin) return;
      if (tick.done) { this.finish(false); return; }
    } while (left > 1e-9);
    // a line whose beat fired while another was up waits its turn
    if (!this.dialogue.active && this.pending.length) this.showLine(this.pending.shift()!);
  }

  /** The hold: clear the words, fire every effect not yet fired, end. */
  skip(): void {
    const cin = this.cin;
    if (!cin) return;
    this.dialogue.clear();
    for (let i = 0; i < cin.beats.length; i++) {
      const b = cin.beats[i];
      if (this.fired.has(i) || b.id === 'line' || b.id === 'end') continue;
      this.fired.add(i);
      this.hooks.onEffect?.(b.id as CutsceneEffect);
    }
    this.finish(true);
  }

  private fire(b: Beat): void {
    const cin = this.cin!;
    const i = cin.beats.indexOf(b);
    if (i < 0 || this.fired.has(i)) return;
    this.fired.add(i);
    if (b.id === 'line') {
      const l = this.lines.get(String(b.payload));
      if (!l) return;
      if (this.dialogue.active) this.pending.push(l); else this.showLine(l);
    } else if (b.id !== 'end') this.hooks.onEffect?.(b.id as CutsceneEffect);
  }

  private showLine(l: DialogueLine): void {
    this.dialogue.play(`${this.cin?.id ?? 'cutscene'}:${l.id}`, [l]);
  }

  private finish(skipped: boolean): void {
    if (this.ended) return;
    this.ended = true;
    this.player.stop();
    this.cin = null;
    this.pending = [];
    this.dialogue.clear();
    this.hooks.onEnd?.(skipped);
  }
}
