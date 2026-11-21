// FEL NETPLAY — one shared game (lane/online-play, 2026-11-21).
//
// MEASURED BEFORE THIS FILE (scripts/probes/online-play/match-room.mts, a real local netd): no mode ever published a world, so
// every `?net=` page ran ITS OWN game; and the other human's input never reached it either (the two pages' ticks never matched,
// lib/net/NetClock.ts InputQueue). Two people who pressed "Start together" were each playing the AI.
//
// THE SHAPE. Exactly one page RUNS the game at a time (its mode's update() runs; it publishes the world as drawn, its HUD writes
// and its end). Every other page DRAWS it (its mode's update() is held, like a broadcast replay holds it; its bodies, poses and
// ball are written from the world; its camera follows its own player's body; its player's input goes to the running page).
//
//   1v1 (NET_POSSESSION_SWAP): the page whose player HAS THE BALL runs the game. A turnover hands it over (`poss`, with the
//        score): the defending page draws, the attacking page plays its full offence — every move, the meter, the dunks — which
//        the mode only gives to "me". The rival's slot reads the other human; with nobody there it falls back to the AI.
//   3v3: the room's first page (the host) runs it; the seats drive bodies (lib/net/seats.ts), an empty seat is the AI.
//   Either: the running page leaving hands the game to a drawing page (it takes over from a check-up with the score it saw).
//
// netd needs nothing new for this: it relays any frame (server/netd/src/index.ts), the build deployed today too.
import type { AbstractMesh, Observer, Scene, TransformNode } from '@babylonjs/core';
import { Vector3 } from '@babylonjs/core';
import type { ModeContext, HudValue } from '../babylon/core/ModeHarness';
import type { Intent } from '../babylon/core/PlayerSlot';
import type { NetSession } from './NetSession';
import type { EndMsg, HudMsg, PlayMsg, PossMsg, WorldMsg } from './protocol';
import { TICK_MS } from './protocol';
import { WorldBuffer, adaptiveDelayMs } from './worldBuffer';
import { BodyMirror } from './mirror';
import { PRIVATE_HUD, flipBanner, flipOutcome, hudForSide, localOrder } from './perspective';
import { SEAT_LAYOUTS, canonicalOf, localCanonical, isWatcherPeer } from './seats';
import { netMirrorOn, netPoseHz, netPossessionSwap, netRenderDelayMs } from './knobs';

export type PlayRole = 'run' | 'draw';

export interface PlayHooks {
  /** The bodies (this page's cast order: [me, my team…, the other team…]) and the ball. Null until spawned. */
  cast(): { bodies: TransformNode[]; loose: AbstractMesh[] } | null;
  /** While drawing: this page's player's intent (poll the mode's own slot). */
  localIntent(dt: number): Intent | null;
  /** This page runs the game from now: set both scores and restart from a check-up (1v1: with this page's ball). */
  takeOver(score: { mine: number; theirs: number }, why: 'ball' | 'left', hud: Readonly<Record<string, unknown>>, ctx: ModeContext): void;
  /** The running page's scores now. */
  scores(): { mine: number; theirs: number };
}

/** How long without a world before a drawing page says so, and before it treats the running page as gone. */
export const STALE_MS = 2500;
export const GONE_MS = 9000;

export interface PlayStats { role: PlayRole; worldsIn: number; worldsOut: number; bytesOut: number; handOffs: number; takeOvers: number; delayMs: number; ageMs: number }

export class NetPlay {
  role: PlayRole = 'run';
  private ctx: ModeContext | null = null;
  private hooks: PlayHooks | null = null;
  private mirror: BodyMirror | null = null;
  private buf = new WorldBuffer();
  private origHud: ((u: Record<string, HudValue>) => void) | null = null;
  private origEnd: ModeContext['end'] | null = null;
  private pub: Observer<Scene> | null = null;
  private lastTick = -1;
  private lastPoseAt = 0;
  private open = false;
  private seq = 0;
  /** The hand-over this page's game belongs to (see WorldMsg.epoch). */
  private epoch = 0;
  private staleShown = false;
  private ended = false;
  private camVel = new Vector3();
  private prevHero: Vector3 | null = null;
  /** The peer whose page runs the game, as last seen (a world's author). */
  runner: string | null = null;
  stats: PlayStats = { role: 'run', worldsIn: 0, worldsOut: 0, bytesOut: 0, handOffs: 0, takeOvers: 0, delayMs: 0, ageMs: Infinity };

  constructor(private session: NetSession, readonly mode: string, private now: () => number = () => Date.now(), readonly room = '') {
    session.onPlay = (m, at) => this.receive(m, at);
  }

  get enabled(): boolean { return netMirrorOn() && !!SEAT_LAYOUTS[this.mode]; }
  get self(): string { return this.session.selfId; }
  get watcher(): boolean { return isWatcherPeer(this.self) || canonicalOf(this.mode, this.self) === null; }
  /** 1v1 hands the game to whoever has the ball. */
  get swaps(): boolean { return this.mode === 'onevone' && netPossessionSwap(); }

  // ── the room ───────────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * netd's welcome: the room's first page runs the game; a watcher never does. A watcher that walked in first holds netd's
   * authority but runs nothing, so then the host seat (`h…`) runs it.
   */
  opened(isAuthority: boolean, authority: string | null = null): void {
    this.open = true;
    if (!this.enabled) return;
    const firstIsWatcher = !!authority && isWatcherPeer(authority);
    const run = !this.watcher && (isAuthority || (firstIsWatcher && canonicalOf(this.mode, this.self) === 0));
    this.setRole(run ? 'run' : 'draw');
  }
  closed(): void { this.open = false; }

  /** A peer left the room. If it was running the game, a drawing page takes over (the first seat still here, in join order). */
  peerLeft(peer: string): void {
    if (!this.enabled || this.role === 'run' || this.watcher) return;
    if (peer !== this.runner) return;
    this.takeOver('left');
  }

  private setRole(r: PlayRole): void {
    this.session.setAuthority(r === 'run');
    if (this.role === r && (r === 'run' || this.mirror)) return;
    this.role = r;
    this.stats.role = r;
    if (r === 'draw') { this.ensureMirror()?.hold(); this.prevHero = null; }
    else { this.mirror?.release(); this.buf.clear(); this.hudSent = {}; }
  }

  private ensureMirror(): BodyMirror | null {
    if (this.mirror || !this.ctx || !this.hooks) return this.mirror;
    const cast = this.hooks.cast();
    if (!cast || !cast.bodies.length) return null;
    this.mirror = new BodyMirror(this.ctx.scene, cast);
    return this.mirror;
  }

  // ── binding to a mode ──────────────────────────────────────────────────────────────────────────────────────────────

  /** Once, from the mode's first update (its cast exists). Tees the HUD and the end so every page shows the running page's. */
  bind(ctx: ModeContext, hooks: PlayHooks): void {
    if (this.ctx) return;
    this.ctx = ctx; this.hooks = hooks;
    if (!this.enabled) return;
    const hud = ctx.setHud.bind(ctx), end = ctx.end.bind(ctx);
    this.origHud = hud; this.origEnd = end;
    ctx.setHud = (u) => { hud(u); if (this.role === 'run' && this.open && !this.ended) this.queueHud(u); };
    ctx.end = (outcome, score, stats, detail) => {
      if (this.role === 'run' && this.open && !this.ended) { this.flushHud(); this.sendEnd(outcome); }
      this.ended = true;
      end(outcome, score, stats, detail);
    };
    this.pub = ctx.scene.onAfterRenderObservable.add(() => this.publish());
    if (this.role === 'draw') this.ensureMirror()?.hold();
  }

  /**
   * Call FIRST in the mode's update(). True = this page is drawing the shared game this frame: the mode must return without
   * simulating. False = run the frame as usual (this page runs the game, or shared play is off).
   */
  frame(ctx: ModeContext, dt: number, hooks: PlayHooks): boolean {
    this.bind(ctx, hooks);
    if (!this.enabled || this.role === 'run') return false;
    const m = this.ensureMirror();
    const intent = hooks.localIntent(dt);
    if (intent && !this.watcher) this.session.sendLocalIntent(intent);
    const now = this.now();
    const age = this.buf.ageMs(now);
    this.stats.ageMs = age;
    if (m && this.buf.size) {
      const delay = netRenderDelayMs() > 0 ? netRenderDelayMs() : adaptiveDelayMs(this.buf.jitterMs);
      this.stats.delayMs = delay;
      const tick = this.buf.renderTick(now, delay);
      const roots = this.buf.sample(tick);
      const latest = this.buf.newest!;
      const { order } = localOrder(latest, this.self);
      if (roots) m.apply(order, roots, this.buf.samplePosed(tick));
    }
    // the camera follows THIS page's player (the hero root the harness knows), on the mode's objective
    const hero = ctx.heroRef.current;
    if (hero) {
      const p = hero.position;
      if (this.prevHero && dt > 1e-4) this.camVel.set((p.x - this.prevHero.x) / dt, 0, (p.z - this.prevHero.z) / dt);
      this.prevHero = (this.prevHero ?? new Vector3()).copyFrom(p);
      ctx.camDirector.update(p, this.camVel, ctx.objectiveRef.current ?? null);
    }
    if (age > STALE_MS && !this.staleShown && this.origHud) { this.staleShown = true; this.origHud({ banner: this.buf.size ? 'RECONNECTING…' : 'WAITING FOR THE OTHER PLAYERS…' }); }
    if (age <= STALE_MS && this.staleShown && this.origHud) { this.staleShown = false; this.origHud({ banner: '' }); }
    // the running page vanished without netd saying so yet (a dead tab): take the game on
    if (this.buf.size && age > GONE_MS && !this.watcher) this.takeOver('left');
    return true;
  }

  /**
   * 1v1, from the mode's startDefense(): the ball goes to the other human, so their page runs the game from here. True = handed
   * over (the mode stops; this page draws). False = nobody to hand it to (shared play off, alone in the room): the mode plays
   * its own defence against the AI, as single-player does.
   */
  handOff(score: { mine: number; theirs: number }, banner?: string): boolean {
    if (!this.enabled || !this.swaps || this.role !== 'run' || !this.open || this.ended) return false;
    const to = this.opponent();
    if (!to) return false;
    this.epoch++;
    const msg: PossMsg = { t: 'poss', from: this.self, to, sent: this.now(), seq: ++this.seq, score: { [this.self]: score.mine, [to]: score.theirs }, epoch: this.epoch };
    if (banner) msg.banner = banner;
    this.session.sendPlay(msg);
    this.stats.handOffs++;
    this.seenHud = { score: score.mine, foeScore: score.theirs };
    this.runner = to;
    this.setRole('draw');
    if (banner) this.origHud?.({ banner });
    return true;
  }

  /** The other seated human in a 1v1 (not a watcher). */
  private opponent(): string | null {
    for (const p of this.session.peers) if (!isWatcherPeer(p) && canonicalOf(this.mode, p) !== null) return p;
    return null;
  }

  private takeOver(why: 'ball' | 'left', score?: Record<string, number>): void {
    if (!this.hooks || !this.ctx || this.ended) return;
    let mine: number, theirs: number;
    if (score) {
      mine = score[this.self] ?? 0;
      theirs = Object.entries(score).filter(([k]) => k !== this.self).reduce((a, [, v]) => Math.max(a, v), 0);
    } else {
      // the running page went away: the last score this page drew, from its own side
      mine = typeof this.seenHud.score === 'number' ? this.seenHud.score : 0;
      theirs = typeof this.seenHud.foeScore === 'number' ? this.seenHud.foeScore : 0;
    }
    this.stats.takeOvers++;
    if (why === 'left') this.epoch++;
    this.runner = this.self;
    this.setRole('run');
    if (why === 'left' && this.origHud) this.origHud({ banner: 'THE GAME IS YOURS TO RUN — PLAY ON' });
    this.hooks.takeOver({ mine, theirs }, why, this.drawnHud, this.ctx);
  }
  /** The score and the rival's score as this page last drew them (its own side). */
  private seenHud: { score?: number; foeScore?: number } = {};
  /** Everything the running page's HUD said, from this page's side (a clock to carry on from). */
  private drawnHud: Record<string, unknown> = {};
  /** HUD writes not yet sent (only changed values), flushed at the tick rate. */
  private hudOut: Record<string, unknown> = {};
  private hudSent: Record<string, unknown> = {};

  /** True while this page draws the shared game (its mode is held). */
  get drawing(): boolean { return this.enabled && this.role === 'draw'; }

  // ── the wire ───────────────────────────────────────────────────────────────────────────────────────────────────────

  private teamsAndSeats(n: number): { teams: number[]; seats: Record<string, number> } {
    const L = SEAT_LAYOUTS[this.mode];
    const local = localCanonical(this.mode, this.self);
    const myTeam = L.teams[local[0]];
    const teams = local.slice(0, n).map((c) => (L.teams[c] === myTeam ? 0 : 1));
    const seats: Record<string, number> = { [this.self]: 0 };
    for (const p of this.session.peers) {
      const c = canonicalOf(this.mode, p);
      if (c === null) continue;
      const i = local.indexOf(c);
      if (i >= 0 && i < n) seats[p] = i;
    }
    return { teams, seats };
  }

  private publish(): void {
    if (!this.enabled || this.role !== 'run' || !this.open || this.ended || !this.session.peers.length) return;
    const tick = Math.floor(this.now() / TICK_MS);
    if (tick === this.lastTick) return;
    this.lastTick = tick;
    this.flushHud();
    const m = this.ensureMirror();
    if (!m) return;
    const now = this.now();
    const withPose = now - this.lastPoseAt >= 1000 / Math.max(1, netPoseHz()) - 1;
    if (withPose) this.lastPoseAt = now;
    const w = m.sample(withPose);
    const { teams, seats } = this.teamsAndSeats(w.bodies.length);
    const msg: WorldMsg = { t: 'world', from: this.self, tick, sent: now, bodies: w.bodies, loose: w.loose, seats, teams, epoch: this.epoch };
    this.session.sendPlay(msg);
    this.stats.worldsOut++;
    this.stats.bytesOut += JSON.stringify(msg).length;
  }

  private queueHud(u: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(u)) {
      if (PRIVATE_HUD.test(k)) continue;
      const same = typeof v === 'object' && v !== null ? JSON.stringify(v) === JSON.stringify(this.hudSent[k]) : v === this.hudSent[k];
      if (same && !(k in this.hudOut)) continue;
      this.hudOut[k] = v;
    }
  }
  private flushHud(): void {
    const keys = Object.keys(this.hudOut);
    if (!keys.length) return;
    const msg: HudMsg = { t: 'hud', from: this.self, sent: this.now(), hud: this.hudOut };
    Object.assign(this.hudSent, this.hudOut);
    this.hudOut = {};
    this.session.sendPlay(msg);
  }

  private sendEnd(outcome: string): void {
    const sc = this.hooks?.scores() ?? { mine: 0, theirs: 0 };
    const L = SEAT_LAYOUTS[this.mode];
    const team: Record<string, number> = {};
    const local = localCanonical(this.mode, this.self);
    const myTeam = L.teams[local[0]];
    for (const p of [this.self, ...this.session.peers]) { const c = canonicalOf(this.mode, p); if (c !== null) team[p] = L.teams[c] === myTeam ? 0 : 1; }
    const msg: EndMsg = { t: 'end', from: this.self, sent: this.now(), outcome, score: { [this.self]: sc.mine }, teamScore: [sc.mine, sc.theirs], team };
    this.session.sendPlay(msg);
    this.announce(msg);
  }

  /** Tell the page (the party, for "winners stay on") who won: the winning SEATS, by the ids netd handed out. */
  private announce(m: EndMsg): void {
    const winTeam = m.outcome === 'WIN' ? 0 : m.outcome === 'LOSS' ? 1 : null;
    if (winTeam === null || typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    const winners = Object.entries(m.team).filter(([, t]) => t === winTeam).map(([p]) => p);
    const score = winTeam === 0 ? m.teamScore : [m.teamScore[1], m.teamScore[0]];
    try { window.dispatchEvent(new CustomEvent('fel:net-result', { detail: { room: this.room, mode: this.mode, winners, score } })); } catch { /* no DOM events */ }
  }

  /** My team relative to the running page's (0 = the same), from the newest world; a watcher reads as the runner's team. */
  private sameTeamAsRunner(): boolean {
    const w = this.buf.newest;
    if (!w) return false;
    const { team, seat } = localOrder(w, this.self);
    return seat === null ? true : team === 0;
  }

  receive(m: PlayMsg, at: number): void {
    if (!this.enabled) return;
    if (m.t === 'world') {
      if (this.role === 'run') {
        // two pages running at once (a hand-off crossed a take-over): the one with the lower id draws
        if (m.from < this.self) this.setRole('draw'); else return;
      }
      this.runner = m.from;
      this.buf.push(m, at);
      this.stats.worldsIn++;
      return;
    }
    if (m.t === 'hud') {
      if (this.role !== 'draw' || !this.origHud) return;
      const side = hudForSide(m.hud, this.sameTeamAsRunner()) as Record<string, HudValue>;
      if (typeof side.score === 'number') this.seenHud.score = side.score;
      if (typeof side.foeScore === 'number') this.seenHud.foeScore = side.foeScore;
      Object.assign(this.drawnHud, side);
      if (Object.keys(side).length) this.origHud(side);
      return;
    }
    if (m.t === 'poss') {
      this.epoch = Math.max(this.epoch, m.epoch ?? 0);
      if (m.to !== this.self) return;
      const banner = m.banner;
      this.takeOver('ball', m.score);
      if (banner && this.origHud) this.origHud({ banner: flipBanner(banner) });
      return;
    }
    if (m.t === 'end') {
      if (this.ended || !this.origEnd) return;
      const myTeam = m.team[this.self];
      const same = myTeam === undefined ? true : myTeam === 0;
      const mine = same ? m.teamScore[0] : m.teamScore[1];
      const theirs = same ? m.teamScore[1] : m.teamScore[0];
      this.ended = true;
      this.announce(m);
      // a watcher played no side: its card is the final score, not a win or a loss
      if (this.watcher) { this.origEnd('FINAL', Math.max(m.teamScore[0], m.teamScore[1]), { foeScore: Math.min(m.teamScore[0], m.teamScore[1]), online: 1, watched: 1 }); return; }
      this.origEnd(flipOutcome(m.outcome, same), mine, { foeScore: theirs, online: 1 });
    }
  }

  dispose(): void {
    if (this.pub && this.ctx) this.ctx.scene.onAfterRenderObservable.remove(this.pub);
    this.pub = null;
    this.mirror?.dispose(); this.mirror = null;
    this.session.onPlay = null;
  }
}
