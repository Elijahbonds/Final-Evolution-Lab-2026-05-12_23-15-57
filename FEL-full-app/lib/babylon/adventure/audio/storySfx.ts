/**
 * THE STORY'S SOUND (improve pass phase 5, lane/improve-world, 2026-11-22; docs/IMPROVE-10-PHASE-AUDIT.md §2.5, finding #8).
 *
 * Measured before: the Adventure's Chapter 1 started 0 sounds in 8 s of play, in all three audit runs, with the stick and a button
 * pressed: the wind bed and the spoken lines were all it had (no file under lib/babylon/adventure used SoundKit). This gives it its
 * effects from what ships — SoundKit's synthesised cues and three nature synths made in code (audio/natureSfx.ts); no new files:
 *
 *   you          footsteps (one per 0.8 m on the ground, quicker and brighter on a wall), the jump, the landing (louder the
 *                harder you came down), the swing of a strike, the homing dash, a knock-down
 *   the rail     the clank on, the grind's hiss while you ride it, a switch, a trick, the hop off
 *   the fight    every hit by outcome (a clean hit, a block, a parry, a guard broken, a dodge), louder the bigger the hit; a foe
 *                going down; a monster's or the boss's wind-up (its tell, heard: owner plan A2's "the view and the audio")
 *   the partner  its steps, its spells, a revive, fusing and coming apart
 *   spells       each cast, pitched by element
 *   the story    a camp's drum when a fight beat starts, the boss's sting, the boss's phase change, a cleared camp or boss, a
 *                chapter's end, a gate's warp, a soft tick on each new line of a scene
 *   ambience     birds now and then round you and a gust over the wind bed
 *
 * Heard by distance: something more than 60 m from the player is not heard; nearer, it falls off as near/d (hubSound's rule).
 * PURE: no Babylon, no audio. The mode hands in the bus, two read-outs and `play`. `story.sfxOn` 0 builds none of it (today).
 */

import type { ActorId, AdventureActor, AdventureBus, Element, MovementState } from '../contracts';

/** story.sfxOn: 1 = the story's sound effects; 0 = the wind bed and the spoken lines only (before this pass). */
export const STORY_SFX_ON = 1;

/** SoundKit's cues this module uses, and the nature synths. */
export type StoryCue =
  | 'thud' | 'whoosh' | 'impact' | 'clang' | 'squeak' | 'swish' | 'powerUp' | 'exhaust' | 'score' | 'miss' | 'uiTick' | 'catch'
  | 'chirp' | 'gull' | 'wave';
export interface StoryCueOpts { volume: number; pitch: number; pan: number; tag: string }
export type StoryPlayFn = (name: StoryCue, opts: StoryCueOpts) => void;

/** A step's sound, metres per step, and the speed below which a body is standing. [TUNE] new numbers, this pass */
export const STEP = { every: 0.8, minSpeed: 0.6, ground: { pitch: 1.25, volume: 0.11 }, wall: { pitch: 1.7, volume: 0.12 }, partner: { pitch: 1.55, volume: 0.06 } } as const;
/** Hearing: full within NEAR, near/d beyond, nothing past FAR (m). [TUNE] */
export const HEAR = { near: 6, far: 60 } as const;
/** The grind's hiss, one grain every this many seconds while on a rail. [TUNE] */
export const GRIND_EVERY = 0.12;
/** Birds every 3–9 s, a gust every 10–20 s. [TUNE] */
export const AMBIENT = { birdMin: 3, birdSpan: 6, gustMin: 10, gustSpan: 10 } as const;

/** A spell's pitch by element (fire low and full, light and lightning high). */
const ELEMENT_PITCH: Record<Element, number> = { fire: 0.8, water: 0.9, earth: 0.7, wind: 1.15, lightning: 1.35, ice: 1.25, light: 1.4, shadow: 0.65 };

/** Loudness of something `d` metres away. */
export function hearGain(d: number, near: number = HEAR.near, far: number = HEAR.far): number {
  if (!(d < far)) return 0;
  return d <= near ? 1 : near / d;
}

/** Stereo pan (−1 left … 1 right) of a source for a listener at (lx, lz) facing `yaw` (0 = +z). */
export function panOf(lx: number, lz: number, yaw: number, sx: number, sz: number): number {
  if (Math.abs(sx - lx) + Math.abs(sz - lz) < 1e-6) return 0;
  const a = Math.atan2(sx - lx, sz - lz) - yaw;
  return Math.max(-1, Math.min(1, Math.sin(a)));
}

/** What the soundscape reads from the host each frame (the mode fills it; nothing here holds a host). */
export interface StorySfxSource {
  playerId: ActorId;
  partnerId: ActorId | null;
  actor(id: ActorId): AdventureActor | undefined;
  /** Seconds a combat verb holds the player (CombatSystem.moveLockOf): rising from 0 is a swing. */
  swingLock(): number;
}

/** A runner event, as much as the soundscape reads (story/chapter.ts RunnerEvent). */
export type StoryRunnerEvent =
  | { kind: 'beat'; beatId: string; beatKind: string }
  | { kind: 'complete'; beatId: string }
  | { kind: 'skip'; beatId: string }
  | { kind: 'chapter'; chapterId: string };

interface Later { at: number; name: StoryCue; o: StoryCueOpts }

export class StorySfx {
  private readonly off: Array<() => void> = [];
  private stepAcc = 0;
  private partnerAcc = 0;
  private grindAcc = 0;
  private birdWait: number;
  private gustWait: number;
  private lastVy = 0;
  private lastSwing = 0;
  private yaw = 0;
  private t = 0;
  private readonly later: Later[] = [];
  /** The beat ids the runner started, by kind (a completed fight or boss beat is a cleared camp). */
  private readonly beatKinds = new Map<string, string>();
  private lastLine: string | null = null;
  /** Cues played, by tag (a probe and the tests read it). */
  readonly counts: Record<string, number> = {};

  constructor(private readonly bus: AdventureBus, private readonly src: StorySfxSource, private readonly play: StoryPlayFn,
    private readonly rand: () => number = Math.random, private readonly ambient = true) {
    this.birdWait = 1.5 + rand() * AMBIENT.birdSpan;
    this.gustWait = AMBIENT.gustMin + rand() * AMBIENT.gustSpan;
    const P = () => this.src.actor(this.src.playerId);
    this.off.push(
      bus.on('state', (e) => {
        if (e.actorId !== this.src.playerId) return;
        const a = P();
        if (e.to === 'air' && (e.from === 'ground' || e.from === 'wallrun') && a && a.vel.y > 1) this.cue('whoosh', 0.16, 1.5, 'jump');
        else if (e.to === 'ground' && e.from === 'air') {
          const k = Math.min(1, Math.max(0, -this.lastVy) / 12);
          this.cue('thud', 0.12 + 0.33 * k, 1.1 - 0.3 * k, 'land');
        } else if (e.to === 'wallrun') this.cue('squeak', 0.12, 0.8, 'wallrun');
        else if (e.to === 'flight') { this.cue('powerUp', 0.3, 0.7, 'flight'); this.cue('whoosh', 0.3, 0.8, 'flight'); }
        else if (e.to === 'ko') this.cue('miss', 0.4, 1, 'ko.player');
      }),
      bus.on('rail:enter', (e) => { if (e.actorId === this.src.playerId) this.cue('clang', 0.22, 1.6, 'rail.on'); }),
      bus.on('rail:switch', (e) => { if (e.actorId === this.src.playerId) this.cue('clang', 0.16, 1.9, 'rail.switch'); }),
      bus.on('rail:trick', (e) => { if (e.actorId === this.src.playerId) this.cue('powerUp', 0.22, 1.5, 'rail.trick'); }),
      bus.on('rail:exit', (e) => { if (e.actorId === this.src.playerId && e.reason !== 'hit') this.cue('whoosh', 0.18, 1.2, 'rail.off'); }),
      bus.on('homing', (e) => { if (e.actorId === this.src.playerId) this.cue('whoosh', e.hit ? 0.38 : 0.22, 1.6, 'homing'); }),
      bus.on('damage', (e) => {
        const at = this.src.actor(e.targetId), k = this.near(at);
        if (k <= 0) return;
        const big = Math.min(1, Math.max(0, e.amount) / 30), mine = e.targetId === this.src.playerId, pan = this.panAt(at);
        const tag = e.source === 'partner' ? 'hit.partner' : e.source === 'spell' ? 'hit.spell' : 'hit';
        switch (e.outcome) {
          case 'hit': this.cue('impact', (0.3 + 0.45 * big) * k, (mine ? 0.8 : 1.1) + this.rand() * 0.1, tag, pan); break;
          case 'blocked': this.cue('clang', 0.28 * k, 1.2, 'block', pan); break;
          case 'parried': this.cue('clang', 0.42 * k, 1.8, 'parry', pan); break;
          case 'guardBreak': this.cue('impact', 0.6 * k, 0.6, 'guardBreak', pan); break;
          case 'dodged': this.cue('whoosh', 0.2 * k, 1.8, 'dodge', pan); break;
          default: break;   // an i-frame: nothing touched
        }
      }),
      bus.on('ko', (e) => {
        if (e.actorId === this.src.playerId) return;   // the player's own knock-down is the 'state' → 'ko' cue
        const a = this.src.actor(e.actorId), k = this.near(a);
        if (k <= 0 || !a || (a.kind !== 'monster' && a.kind !== 'boss')) return;
        this.cue('thud', 0.55 * k, 0.55, a.kind === 'boss' ? 'ko.boss' : 'ko.foe', this.panAt(a));
        if (a.kind === 'boss') this.cue('score', 0.45, 1, 'ko.boss');
      }),
      bus.on('telegraph', (e) => {
        const a = this.src.actor(e.actorId), k = this.near(a);
        if (k <= 0 || !a) return;
        if (a.kind === 'boss') this.cue('exhaust', 0.42 * k, 0.6, 'tell.boss', this.panAt(a));
        else this.cue('exhaust', 0.16 * k, 1.05, 'tell', this.panAt(a));
      }),
      bus.on('boss:phase', (e) => {
        const a = this.src.actor(e.bossId);
        this.cue('impact', 0.7, 0.45, 'boss.phase', this.panAt(a));
        this.cue('exhaust', 0.35, 0.5, 'boss.phase', this.panAt(a));
      }),
      bus.on('spell:cast', (e) => {
        const a = this.src.actor(e.actorId), k = this.near(a);
        if (k <= 0) return;
        const p = e.element ? ELEMENT_PITCH[e.element] : 1;
        if (e.actorId === this.src.playerId) this.cue('powerUp', 0.32, p, 'spell');
        else if (e.actorId === this.src.partnerId) this.cue('powerUp', 0.24 * k, p * 1.2, 'spell.partner', this.panAt(a));
        else this.cue('whoosh', 0.2 * k, 0.7, 'spell.foe', this.panAt(a));
      }),
      bus.on('fusion', (e) => { if (e.actorId === this.src.playerId) this.cue(e.active ? 'powerUp' : 'whoosh', e.active ? 0.55 : 0.25, e.active ? 0.6 : 0.6, e.active ? 'fusion.on' : 'fusion.off'); }),
      bus.on('mount', (e) => { if (e.riderId === this.src.playerId) this.cue('whoosh', 0.22, e.on ? 0.9 : 1.1, 'mount'); }),
      bus.on('revive', (e) => { const a = this.src.actor(e.actorId), k = this.near(a); if (k > 0) this.cue('powerUp', 0.3 * k, 1.3, 'revive', this.panAt(a)); }),
      bus.on('level', (e) => { if (e.actorId === this.src.playerId) this.cue('score', 0.4, 1, 'level'); }),
      bus.on('loot', (e) => { if (e.actorId === this.src.playerId) this.cue('catch', 0.3, 1.2, 'loot'); }),
      bus.on('lock', (e) => { if (e.actorId === this.src.playerId && e.target) this.cue('uiTick', 0.12, 1.2, 'lock'); }),
    );
  }

  /** A chapter-runner event: the camp's drum, the boss's sting, a cleared camp, a chapter's end. */
  runner(e: StoryRunnerEvent): void {
    if (e.kind === 'beat') {
      this.beatKinds.set(e.beatId, e.beatKind);
      if (e.beatKind === 'fight') { this.cue('thud', 0.45, 0.5, 'camp'); this.after(0.24, 'thud', 0.38, 0.5, 'camp'); }
      else if (e.beatKind === 'boss') { this.cue('impact', 0.5, 0.4, 'boss'); this.cue('exhaust', 0.45, 0.45, 'boss'); this.after(0.5, 'thud', 0.5, 0.45, 'boss'); }
    } else if (e.kind === 'complete') {
      const k = this.beatKinds.get(e.beatId);
      if (k === 'fight' || k === 'boss') this.cue('score', k === 'boss' ? 0.5 : 0.35, 1, k === 'boss' ? 'boss.cleared' : 'camp.cleared');
    } else if (e.kind === 'chapter') this.cue('score', 0.55, 0.9, 'chapter');
  }

  /** The party went through a gate (the story runtime's warp). */
  warp(): void { this.cue('whoosh', 0.35, 0.6, 'gate'); this.cue('powerUp', 0.2, 1.1, 'gate'); }

  /** The scene's line on screen (speaker and text, or null): a soft tick when a new one starts. */
  line(key: string | null): void {
    if (key && key !== this.lastLine) this.cue('uiTick', 0.1, 1.1, 'line');
    this.lastLine = key;
  }

  /** Once per frame: footsteps (yours and the partner's), the grind's hiss, a swing, the ambience, the queued second hits. */
  update(dt: number, yaw: number, paused = false): void {
    if (!(dt > 0)) return;
    this.t += dt; this.yaw = yaw;
    for (let i = this.later.length - 1; i >= 0; i--) if (this.later[i].at <= this.t) { const l = this.later[i]; this.later.splice(i, 1); this.play(l.name, l.o); this.count(l.o.tag); }
    const me = this.src.actor(this.src.playerId);
    if (me && !paused) {
      const speed = Math.hypot(me.vel.x, me.vel.z);
      const st: MovementState = me.state;
      if ((st === 'ground' && me.grounded) || st === 'wallrun') {
        const s = st === 'wallrun' ? STEP.wall : STEP.ground;
        if (speed >= STEP.minSpeed) {
          this.stepAcc += speed * dt;
          if (this.stepAcc >= STEP.every) { this.stepAcc -= STEP.every; this.cue('thud', s.volume, s.pitch * (0.94 + this.rand() * 0.12), st === 'wallrun' ? 'step.wall' : 'step'); }
        } else this.stepAcc = Math.min(this.stepAcc, STEP.every * 0.5);
      } else this.stepAcc = Math.min(this.stepAcc, STEP.every * 0.5);
      if (st === 'grind') {
        this.grindAcc += dt;
        if (this.grindAcc >= GRIND_EVERY) { this.grindAcc -= GRIND_EVERY; this.cue('swish', 0.06 + 0.03 * this.rand(), 0.45 + 0.1 * this.rand(), 'rail.grind'); }
      } else this.grindAcc = 0;
      this.lastVy = me.vel.y;
      // a swing: the combat verb's hold rising from nothing
      const lock = this.src.swingLock();
      if (lock > 0 && !(this.lastSwing > 0)) this.cue('whoosh', 0.2, 1.3 + this.rand() * 0.15, 'swing');
      this.lastSwing = lock;
      // the partner's steps, quieter and quicker
      const q = this.src.partnerId ? this.src.actor(this.src.partnerId) : undefined;
      if (q && q.grounded && q.state === 'ground') {
        const qs = Math.hypot(q.vel.x, q.vel.z), k = this.near(q);
        if (qs >= STEP.minSpeed && k > 0) {
          this.partnerAcc += qs * dt;
          if (this.partnerAcc >= STEP.every * 0.8) { this.partnerAcc -= STEP.every * 0.8; this.cue('thud', STEP.partner.volume * k, STEP.partner.pitch * (0.94 + this.rand() * 0.12), 'step.partner', this.panAt(q)); }
        }
      }
    }
    if (!this.ambient) return;
    this.birdWait -= dt;
    if (this.birdWait <= 0) {
      this.birdWait = AMBIENT.birdMin + this.rand() * AMBIENT.birdSpan;
      this.cue('chirp', 0.6 + 0.6 * this.rand(), 0.85 + 0.35 * this.rand(), 'amb.bird', this.rand() * 1.6 - 0.8);
    }
    this.gustWait -= dt;
    if (this.gustWait <= 0) {
      this.gustWait = AMBIENT.gustMin + this.rand() * AMBIENT.gustSpan;
      this.cue('wave', 0.25, 1.6, 'amb.gust', this.rand() * 1.2 - 0.6);
    }
  }

  dispose(): void { for (const f of this.off.splice(0)) f(); this.later.length = 0; }

  private near(a: AdventureActor | undefined): number {
    const me = this.src.actor(this.src.playerId);
    if (!a || !me) return a ? 1 : 0;
    return hearGain(Math.hypot(a.pos.x - me.pos.x, a.pos.z - me.pos.z));
  }

  private panAt(a: AdventureActor | undefined): number {
    const me = this.src.actor(this.src.playerId);
    if (!a || !me || a === me) return 0;
    return panOf(me.pos.x, me.pos.z, this.yaw, a.pos.x, a.pos.z);
  }

  private after(sec: number, name: StoryCue, volume: number, pitch: number, tag: string): void {
    this.later.push({ at: this.t + sec, name, o: { volume, pitch, pan: 0, tag: 'story.' + tag } });
  }

  private cue(name: StoryCue, volume: number, pitch: number, tag: string, pan = 0): void {
    if (!(volume > 0)) return;
    this.play(name, { volume, pitch, pan, tag: 'story.' + tag });
    this.count('story.' + tag);
  }

  private count(tag: string): void { this.counts[tag] = (this.counts[tag] ?? 0) + 1; }
}
