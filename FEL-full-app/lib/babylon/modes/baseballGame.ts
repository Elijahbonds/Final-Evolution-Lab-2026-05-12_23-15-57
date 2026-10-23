// baseballGame — BASEBALL-3INN (2026-10-22, ALL-MODES-TO-75 §6): the rules and the clock of /play/baseball, with no
// Babylon in them, so the suite can play a whole game headless. BaseballInningsMode is only the view: it draws what this
// decides, when this says.
//
// The swing is graded, not rolled. The stub this replaces (BaseballMode.ts, still excluded from tsc and pinned dead by
// controlsScreen.scan.test.ts) drew the pitch timing AND the player's timing from Math.random(), so a press was a coin
// flip. Here each pitch has a known flight — released PITCH_RELEASE_SEC into the delivery (Derby's key), from Derby's
// release depth, at the speed Derby's pitchSpec gives it — and the press timestamp is graded against the ball crossing
// the plate with Derby's own swingQuality and its ±0.15 s window. Same press time, same pitch: same outcome, every time.
//
// The game: 3 innings (Elijah, 2026-10-22 2:50 PM PT via PM: "Baseball 3 innings"); three strikes is an out, three outs
// end the inning (both TUNE). Every pitch is in the zone, so a taken pitch is a called strike. Runs are the score, and
// the end card and the saved session read the same number (baseballResult / baseballHeadline). Nothing ends it but the
// last out: there is no quit button.

import { swingQuality } from './aimSwingCore';
import { timingMiss, timingMissLine } from '../core/DerbyLoop';
import { TimerBag, BannerChannel } from '../core/GolfLoop';

/** Elijah, 2026-10-22: "Baseball 3 innings". */
export const INNINGS = 3;
/** TUNE: outs that retire the side. */
export const OUTS_PER_INNING = 3;
/** TUNE: strikes that make an out. */
export const STRIKES_PER_OUT = 3;
/** TUNE: the side also retires after this many batters, so a hitter who never makes an out still reaches the end. */
export const BATTERS_PER_INNING_CAP = 9;
/** Derby's numbers (precisionModes.ts pitch()/onInput): the ball leaves the hand 17.5 m out and is graded at z 0.3. */
export const RELEASE_Z = 17.5;
export const CONTACT_Z = 0.3;
/** Derby's swing window, full width (swingQuality(…, 0.3)): ±0.15 s around the crossing connects. */
export const SWING_WINDOW_SEC = 0.3;
/** TUNE: swingQuality thresholds. 0.75 = within ±37.5 ms of the crossing, 0.6 = ±60 ms, 0.33 = ±100 ms; anything else
 *  that connects (to ±150 ms) is weak contact, an out. */
export const HIT_Q = { homer: 0.75, double: 0.6, single: 0.33 } as const;
/** TUNE: dead time between pitches, between innings, and the FINAL board before the card. Game clock, not wall clock. */
export const NEXT_PITCH_MS = 1600;
export const NEXT_INNING_MS = 2600;
export const FINAL_HOLD_MS = 2400;
/** How long a result banner stays up (game clock). */
export const BANNER_MS = 1100;

export interface BaseballPitch { speed: number; label: string }
export type SwingKind = 'homer' | 'double' | 'single' | 'out' | 'whiff';
export interface SwingGrade {
  kind: SwingKind;
  /** swingQuality: 1 = dead on the crossing, 0 = outside the window. */
  q: number;
  /** Press time minus crossing time (s): negative is early. */
  offsetSec: number;
  /** For a whiff: Derby's early/late line. */
  missLine: string;
}

/** When the ball reaches the contact point, in seconds from the start of the delivery. */
export function crossSec(pitch: BaseballPitch, releaseSec: number): number {
  return releaseSec + (RELEASE_Z - CONTACT_Z) / Math.max(pitch.speed, 0.1);
}

/** Where the ball is (z) `t` seconds into the delivery: in the hand until the release, then straight in at speed. */
export function ballZAt(t: number, pitch: BaseballPitch, releaseSec: number): number {
  return t < releaseSec ? RELEASE_Z : RELEASE_Z - pitch.speed * (t - releaseSec);
}

/** Grade a press `pressSec` into the delivery. Pure: no clock, no randomness. */
export function gradeSwing(pressSec: number, pitch: BaseballPitch, releaseSec: number): SwingGrade {
  const z = ballZAt(pressSec, pitch, releaseSec);
  const q = swingQuality(z, CONTACT_Z, pitch.speed, SWING_WINDOW_SEC);
  const offsetSec = pressSec - crossSec(pitch, releaseSec);
  if (q <= 0) {
    return { kind: 'whiff', q: 0, offsetSec, missLine: timingMissLine(timingMiss(z, CONTACT_Z, pitch.speed, SWING_WINDOW_SEC / 2), pressSec >= releaseSec) };
  }
  const kind: SwingKind = q >= HIT_Q.homer ? 'homer' : q >= HIT_Q.double ? 'double' : q >= HIT_Q.single ? 'single' : 'out';
  return { kind, q, offsetSec, missLine: '' };
}

/** Bases after a hit of `n` bases (4 = home run): every runner moves n, the batter takes base n. Returns the runs in. */
export function advance(bases: readonly boolean[], n: number): { bases: boolean[]; runs: number } {
  const next = [false, false, false];
  let runs = 0;
  for (let b = 2; b >= 0; b--) {
    if (!bases[b]) continue;
    const to = b + n;
    if (to >= 3) runs++; else next[to] = true;
  }
  if (n >= 4) runs++; else next[n - 1] = true;
  return { bases: next, runs };
}

export interface BaseballStats { runs: number; hits: number; homers: number; strikeouts: number; outs: number; pitches: number; innings: number }
export interface BaseballResult { outcome: 'FINAL'; score: number; stats: Record<string, number> }

/** What ctx.end receives: the score IS the runs, and the stats carry the same runs (the card reads either). */
export function baseballResult(s: BaseballStats): BaseballResult {
  return { outcome: 'FINAL', score: s.runs, stats: { runs: s.runs, hits: s.hits, homers: s.homers, strikeouts: s.strikeouts, outs: s.outs, pitches: s.pitches, innings: s.innings } };
}

/** The end card's line, built from the posted score — the number on the card and the saved number are one. */
export function baseballHeadline(r: { score: number; stats?: Record<string, number> }): string {
  const st = r.stats ?? {};
  const n = (k: string) => Number(st[k] ?? 0);
  return `FINAL · ${r.score} ${r.score === 1 ? 'RUN' : 'RUNS'} · ${n('hits')} H · ${n('homers')} HR · ${n('innings') || INNINGS} INNINGS`;
}

/** The view's side of the game: what to draw and play, called on the game clock. */
export interface BaseballView {
  /** The pitcher starts the delivery (the ball leaves the hand `releaseSec` later). */
  windup(pitch: BaseballPitch, pitchNo: number): void;
  /** The ball leaves the hand. */
  release(pitch: BaseballPitch): void;
  /** The batter swings (every accepted press). */
  swing(grade: SwingGrade): void;
  /** Bat on ball: the contact frame (the crack, the flight). Fires on the press that connected. */
  contact(grade: SwingGrade): void;
  banner(text: string): void;
  hud(patch: Record<string, string | number>): void;
  end(result: BaseballResult): void;
}

export type BaseballPhase = 'idle' | 'between' | 'pitch' | 'over';

/** The game. tick(dt) is the only clock: a paused harness stops calling it, so nothing — pitch, banner, end — moves. */
export class BaseballGame {
  inning = 1; outs = 0; strikes = 0; batters = 0;
  bases: boolean[] = [false, false, false];
  runs = 0; hits = 0; homers = 0; strikeouts = 0; totalOuts = 0; pitchNo = 0;
  phase: BaseballPhase = 'idle';
  /** Seconds into the current delivery. */
  pitchSec = 0;
  pitch: BaseballPitch | null = null;
  released = false; swung = false;
  readonly timers = new TimerBag({ gameClock: true });
  private readonly banners: BannerChannel;

  constructor(private readonly view: BaseballView, private readonly pitchFor: (n: number) => BaseballPitch, readonly releaseSec: number) {
    this.banners = new BannerChannel(this.timers, (t) => view.banner(t));
  }

  start(): void {
    this.phase = 'between';
    this.pushHud();
    this.banners.flash(`INNING 1 OF ${INNINGS}`, BANNER_MS);
    this.timers.later(() => this.deliver(), NEXT_PITCH_MS);
  }

  tick(dt: number): void {
    this.timers.tick(dt);
    if (this.phase !== 'pitch' || !this.pitch) return;
    this.pitchSec += dt;
    if (!this.released && this.pitchSec >= this.releaseSec) { this.released = true; this.view.release(this.pitch); }
    // a taken pitch: once the window behind the plate has closed with no swing, it is a called strike
    if (!this.swung && this.pitchSec > crossSec(this.pitch, this.releaseSec) + SWING_WINDOW_SEC / 2) this.strike('STRIKE — LOOKING');
  }

  /** The swing button. Returns what happened: 'refused' between pitches or on a second swing. */
  press(): SwingKind | 'refused' {
    if (this.phase !== 'pitch' || !this.pitch || this.swung) return 'refused';
    this.swung = true;
    const g = gradeSwing(this.pitchSec, this.pitch, this.releaseSec);
    this.view.swing(g);
    if (g.kind === 'whiff') { this.strike(`STRIKE — ${g.missLine}`); return g.kind; }
    this.view.contact(g);
    if (g.kind === 'out') this.out('FLY OUT');
    else this.hit(g.kind === 'homer' ? 4 : g.kind === 'double' ? 2 : 1);
    return g.kind;
  }

  stats(): BaseballStats {
    return { runs: this.runs, hits: this.hits, homers: this.homers, strikeouts: this.strikeouts, outs: this.totalOuts, pitches: this.pitchNo, innings: INNINGS };
  }

  dispose(): void { this.timers.clear(); this.phase = 'over'; }

  private deliver(): void {
    if (this.phase === 'over') return;
    this.pitchNo++;
    this.pitch = this.pitchFor(this.pitchNo);
    this.pitchSec = 0; this.released = false; this.swung = false;
    this.phase = 'pitch';
    this.view.windup(this.pitch, this.pitchNo);
  }

  private strike(line: string): void {
    this.strikes++;
    if (this.strikes >= STRIKES_PER_OUT) { this.strikeouts++; this.out('STRIKE THREE — YOU\'RE OUT'); return; }
    this.banners.flash(`${line} · ${this.strikes} STRIKE${this.strikes === 1 ? '' : 'S'}`, BANNER_MS);
    this.settle();
  }

  private out(line: string): void {
    this.outs++; this.totalOuts++; this.strikes = 0; this.batters++;
    this.banners.flash(`${line} · ${this.outs} OUT${this.outs === 1 ? '' : 'S'}`, BANNER_MS);
    this.settle();
  }

  private hit(n: number): void {
    const r = advance(this.bases, n);
    this.bases = r.bases; this.runs += r.runs; this.hits++; this.strikes = 0; this.batters++;
    if (n === 4) this.homers++;
    const name = n === 4 ? 'HOME RUN' : n === 2 ? 'DOUBLE' : 'SINGLE';
    this.banners.flash(r.runs > 0 ? `${name}! +${r.runs} RUN${r.runs === 1 ? '' : 'S'}` : `${name}!`, BANNER_MS);
    this.settle();
  }

  /** The pitch is over: next pitch, next inning, or the end. */
  private settle(): void {
    this.phase = 'between'; this.pitch = null;
    if (this.outs >= OUTS_PER_INNING || this.batters >= BATTERS_PER_INNING_CAP) {
      if (this.inning >= INNINGS) {
        this.phase = 'over';
        this.pushHud();
        this.banners.flash(`FINAL — ${this.runs} ${this.runs === 1 ? 'RUN' : 'RUNS'}`, FINAL_HOLD_MS);
        this.timers.later(() => this.view.end(baseballResult(this.stats())), FINAL_HOLD_MS);
        return;
      }
      this.inning++; this.outs = 0; this.strikes = 0; this.batters = 0; this.bases = [false, false, false];
      this.pushHud();
      this.timers.later(() => this.banners.flash(`INNING ${this.inning} OF ${INNINGS}`, BANNER_MS), BANNER_MS);
      this.timers.later(() => this.deliver(), NEXT_INNING_MS);
      return;
    }
    this.pushHud();
    this.timers.later(() => this.deliver(), NEXT_PITCH_MS);
  }

  private pushHud(): void {
    const on = ['1B', '2B', '3B'].filter((_, i) => this.bases[i]).join(' ');
    this.view.hud({
      round: `INN ${this.inning}/${INNINGS} · ${this.outs} OUT · ${this.strikes} STR${on ? ` · ${on}` : ''}`,
      score: `${this.runs} ${this.runs === 1 ? 'RUN' : 'RUNS'}`,
      runs: this.runs, hits: this.hits, inning: this.inning, strikes: this.strikes,
    });
  }
}
