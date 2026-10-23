// HANDLE FX (hoops round 2, owner 2026-10-20: "Feedback on handle moves: sounds (sneaker squeak on the plant, a sharper ball slap on a
// cross), controller rumble, a camera punch on an ankle-breaker (off in reduced motion), and a crowd 'ooh' on an ankle-breaker").
//
// One mount per court mode (1v1, 3v3), and it LISTENS — it never rewrites a move:
//   · the player's carry (anim/ballCarry `move`, read once a frame): a new move is the PLANT (the sneaker squeak); a crossing move's
//     ball arriving in the other hand is the CATCH (the ball slap and a short buzz in the pad);
//   · the Game-Breaker meter (MomentumBus.onReport): an 'ankle_break' is the ANKLES — a big buzz, the camera's punch-in and the crowd's
//     "ooh". When a crossing move is in the air it lands on that move's catch (the moment he bites), never later than ANKLES_WAIT_SEC.
//
// Presentation only: nothing here reads or writes a score, an odds roll, a speed, a timing window or a play-camera number (the punch is
// CameraDirector.pulse, the same beat a make or a flush already plays). Reduced motion (motionPolicy) turns the punch off; the sound and
// the buzz stay (as the harness's own impact does).

import type { ModeContext } from '../../core/ModeHarness';
import type { MomentumEvent } from '../../core/MomentumBus';
import type { CarryMoveState } from '../../anim/ballCarry';
import { SoundKit } from '../../audio/SoundKit';
import { motionPolicy } from '../../../a11y/reducedMotion';

/** TUNED (new, 2026-10-20): first guesses for the owner's ear and hands. */
export const HANDLE_FX = {
  /** The plant's squeak (SoundKit 'squeak'): a crossing move plants hard, any other move a touch softer. */
  squeak: { cross: { volume: 0.55, pitch: 1.08 }, other: { volume: 0.32, pitch: 0.96 } },
  /** Two plants closer than this squeak once (s). */
  squeakGapSec: 0.15,
  /** The catch's slap: its loudness (0..1). */
  slapVolume: 0.6,
  /** The pad's buzz on a cross's catch: strong / weak motor (0..1) and length (ms). */
  rumbleCatch: { strong: 0.2, weak: 0.5, ms: 70 },
  /** …and on an ankle-breaker: bigger and longer. */
  rumbleAnkles: { strong: 0.85, weak: 0.65, ms: 240 },
  /** The camera punch on an ankle-breaker (CameraDirector.pulse: strength 0..1, seconds). */
  punch: { strength: 0.45, sec: 0.38 },
  /** The crowd's "ooh" (0..1). */
  oohVolume: 0.5,
} as const;
/** An ankle-breaker waits at most this long for its move's catch (DefenderReact.READ_BEAT_MAX_MS: the read beat's own cap). */
export const ANKLES_WAIT_SEC = 0.3;

export type HandleFxCue =
  | { kind: 'plant'; move: string; crossing: boolean }
  | { kind: 'catch'; move: string }
  | { kind: 'ankles' };

/** The part of the carry's move the watch reads. */
export type CarryMoveRead = Pick<CarryMoveState, 'name' | 't' | 'k' | 'contact' | 'startHand' | 'endHand'>;

/**
 * The watch (pure): one carry's move, read once a frame, turned into cues. `ankles()` is the meter's report; `step()` returns this
 * frame's cues in the order they happened.
 */
export class HandleFxWatch {
  private cur: { name: string; t: number; crossing: boolean; caught: boolean; endHand: 'left' | 'right' } | null = null;
  private sinceSqueak = Infinity;
  private anklesLeft = -1;   // < 0: no ankle-breaker waiting

  /** An ankle-breaker was reported this frame. */
  ankles(): void { this.anklesLeft = ANKLES_WAIT_SEC; }

  step(dt: number, m: CarryMoveRead | null): HandleFxCue[] {
    const out: HandleFxCue[] = [];
    this.sinceSqueak += Math.max(0, dt);
    if (m) {
      const fresh = !this.cur || m.name !== this.cur.name || m.t < this.cur.t - 1e-6 || m.endHand !== this.cur.endHand;
      if (fresh) {
        const crossing = m.startHand !== m.endHand;
        this.cur = { name: m.name, t: m.t, crossing, caught: false, endHand: m.endHand };
        if (this.sinceSqueak >= HANDLE_FX.squeakGapSec) { out.push({ kind: 'plant', move: m.name, crossing }); this.sinceSqueak = 0; }
      }
      const c = this.cur!;
      c.t = m.t;
      if (c.crossing && !c.caught && m.contact === m.endHand && m.k > 0.2) {
        c.caught = true;
        out.push({ kind: 'catch', move: m.name });
        if (this.anklesLeft >= 0) { this.anklesLeft = -1; out.push({ kind: 'ankles' }); }   // he bit on THIS catch
      }
    } else this.cur = null;
    if (this.anklesLeft >= 0) {
      // nothing in the air to wait for (a move that does not cross, off the head, a move already caught): now; else at most the cap
      const waiting = !!this.cur && this.cur.crossing && !this.cur.caught;
      this.anklesLeft -= Math.max(0, dt);
      if (!waiting || this.anklesLeft < 0) { this.anklesLeft = -1; out.push({ kind: 'ankles' }); }
    }
    return out;
  }
}

// ── the outputs ───────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Buzz every connected pad that can (the Gamepad API's dual-rumble, as lib/feel/sensory-bus does). Silent where there is none. */
export function padRumble(strong: number, weak: number, ms: number): number {
  let n = 0;
  try {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads ?? []) {
      const act = (gp as unknown as { vibrationActuator?: { playEffect?: (k: string, o: object) => Promise<unknown> } } | null)?.vibrationActuator;
      if (!act?.playEffect) continue;
      act.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: strong, weakMagnitude: weak })?.catch?.(() => {});
      n++;
    }
  } catch { /* never throw into play */ }
  return n;
}

/** SoundKit's graph, or null where there is no Web Audio (a server, a headless check). */
function graphOrNull(): ReturnType<typeof SoundKit.graph> {
  try { return typeof window === 'undefined' ? null : SoundKit.graph(); } catch { return null; }
}

let noise: AudioBuffer | null = null;
function noiseOf(ctx: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ctx.sampleRate) return noise;
  const len = Math.floor(ctx.sampleRate * 1.6);
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;   // white: each cue's own filters shape it
  return noise;
}

/**
 * THE SLAP: leather on a palm, sharper than the dribble's pound — a 1 ms crack of bright noise through a high band, and a short low
 * knock under it (the ball's own body). Synthesised on SoundKit's graph (its SFX bus: the player's SFX level and the voice ducking
 * apply), like every other cue in the kit.
 */
export function playSlap(volume: number = HANDLE_FX.slapVolume): boolean {
  if (SoundKit.muted) return false;
  const g = graphOrNull(); if (!g) return false;
  const { ctx, sfx } = g; const t = ctx.currentTime;
  try {
    const src = ctx.createBufferSource(); src.buffer = noiseOf(ctx);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1100;
    const bp = ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 2600; bp.Q.value = 1.4; bp.gain.value = 8;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.9 * volume, t + 0.001); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
    src.connect(hp).connect(bp).connect(ng).connect(sfx);
    src.start(t, Math.random() * 1.2); src.stop(t + 0.07);
    const osc = ctx.createOscillator(); osc.type = 'sine';
    osc.frequency.setValueAtTime(210, t); osc.frequency.exponentialRampToValueAtTime(95, t + 0.05);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.5 * volume, t + 0.002); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    osc.connect(og).connect(sfx); osc.start(t); osc.stop(t + 0.07);
    return true;
  } catch { return false; }
}

/**
 * THE "OOH": a crowd drawing its breath — a dozen voices on an /u/ vowel (two formant bands over detuned saws and breath noise), the
 * pitch rising into the moment and falling off it, about a second long. Into the crowd's duck, so the MC's call sits on top of it.
 */
export function playOoh(volume: number = HANDLE_FX.oohVolume): boolean {
  if (SoundKit.muted) return false;
  const g = graphOrNull(); if (!g) return false;
  const { ctx, crowdDuck } = g; const t = ctx.currentTime; const end = t + 1.25;
  try {
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 340; f1.Q.value = 3.5;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 780; f2.Q.value = 5;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
    const sum = ctx.createGain(); sum.gain.value = 1;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.55 * volume, t + 0.14);
    env.gain.setValueAtTime(0.55 * volume, t + 0.36);
    env.gain.exponentialRampToValueAtTime(0.0001, end);
    sum.connect(f1); sum.connect(f2);
    f1.connect(lp); f2.connect(lp);
    lp.connect(env).connect(crowdDuck);
    for (let i = 0; i < 12; i++) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      const base = 140 + Math.random() * 130;   // men and women, one octave and a bit
      const d = t + Math.random() * 0.06;      // a crowd does not start on one frame
      o.frequency.setValueAtTime(base * 0.94, t);
      o.frequency.linearRampToValueAtTime(base * 1.06, d + 0.28);
      o.frequency.linearRampToValueAtTime(base * 0.86, end);
      const vg = ctx.createGain(); vg.gain.value = 0.045;
      o.connect(vg).connect(sum); o.start(d); o.stop(end + 0.02);
    }
    const br = ctx.createBufferSource(); br.buffer = noiseOf(ctx);
    const bg = ctx.createGain(); bg.gain.value = 0.18;
    br.connect(bg).connect(sum); br.start(t, Math.random() * 0.3); br.stop(end + 0.02);
    return true;
  } catch { return false; }
}

// ── the mount ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export interface HandleFxOpts {
  /** The PLAYER's carry (null while he has no ball). Read each frame. */
  carry: () => { readonly move: CarryMoveRead | null } | null;
}
export interface HandleFx {
  /** What fired, for probes (the rig reads `scene.metadata.felHandleFx`). */
  readonly counts: Record<HandleFxCue['kind'], number> & { punch: number; rumble: number };
  dispose(): void;
}

export function mountHandleFx(ctx: Pick<ModeContext, 'scene' | 'momentum' | 'camDirector'>, o: HandleFxOpts): HandleFx {
  const watch = new HandleFxWatch();
  const counts = { plant: 0, catch: 0, ankles: 0, punch: 0, rumble: 0 };
  const offReport = ctx.momentum?.onReport?.((e: MomentumEvent) => { if (e.kind === 'ankle_break') watch.ankles(); }) ?? (() => {});
  const play = (c: HandleFxCue): void => {
    counts[c.kind]++;
    if (c.kind === 'plant') {
      const s = c.crossing ? HANDLE_FX.squeak.cross : HANDLE_FX.squeak.other;
      SoundKit.play('squeak', { volume: s.volume, pitch: s.pitch });
    } else if (c.kind === 'catch') {
      playSlap();
      const r = HANDLE_FX.rumbleCatch; counts.rumble += padRumble(r.strong, r.weak, r.ms);
    } else {
      const r = HANDLE_FX.rumbleAnkles; counts.rumble += padRumble(r.strong, r.weak, r.ms);
      if (!motionPolicy().reduced) { ctx.camDirector?.pulse(HANDLE_FX.punch.strength, HANDLE_FX.punch.sec); counts.punch++; }
      playOoh();
    }
    console.info(`[HFX] ${c.kind}${'move' in c ? ` ${c.move}` : ''}`);
  };
  const obs = ctx.scene.onBeforeRenderObservable.add(() => {
    const dt = Math.min(0.1, ctx.scene.getEngine().getDeltaTime() / 1000);
    let m: CarryMoveRead | null = null;
    try { m = o.carry()?.move ?? null; } catch { m = null; }
    for (const c of watch.step(dt, m)) play(c);
  });
  const fx: HandleFx = {
    counts,
    dispose() {
      offReport(); ctx.scene.onBeforeRenderObservable.remove(obs);
      const md = ctx.scene.metadata as { felHandleFx?: unknown } | null;
      if (md?.felHandleFx === fx) delete md.felHandleFx;
    },
  };
  (ctx.scene.metadata ??= {}).felHandleFx = fx;
  return fx;
}
