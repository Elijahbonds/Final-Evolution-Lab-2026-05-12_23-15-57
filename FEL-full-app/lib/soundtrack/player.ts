// lib/soundtrack/player.ts — CREATOR SOUNDTRACK piece G: the one soundtrack player per page.
//
// Two <audio> decks (crossOrigin=anonymous, preload=none) so one track can crossfade into the next. Each deck runs
//   <audio> → MediaElementSource → deck gain (normalisation × crossfade) → stage gain (stage × soundtrack level)
//   → SoundKit's MUSIC bus
// so the player's MUSIC volume applies, voiceover's duck under the MC applies (it ducks that bus), and the limiter on the
// way out protects the mix. SoundKit is imported lazily, at the first tap, so the menus' bundle does not carry it.
// Where Web Audio is missing the decks fall back to element.volume (no crossfade curve, same levels).
//
// It starts only after a user gesture, never claims the iOS 'playback' session (the silent switch is respected), and
// decides whether to sound at all through policy.ts (Quick Screen, data saver, focus, hidden tab, …).
//
// Everything the browser provides comes in through PlayerEnv, so player.test.ts drives it with fake decks and a fake clock.

import { CROSSFADE_SEC, FADE_SEC, clampLevel, crossfadeGains, dbToGain, stageGain, DEFAULT_LEVEL } from './gain';
import { decideStage, type PlayConditions, type Silence } from './policy';
import { moodPool, Shuffler } from './shuffle';
import { PlayTracker } from './playCount';
import type { SoundtrackStage, SoundtrackTrack } from './types';
import type { Mood } from '@/lib/creator/creative-card-review';

export interface AudioLike {
  src: string; currentTime: number; duration: number; paused: boolean; volume: number;
  crossOrigin: string | null; preload: string;
  play(): Promise<void> | void; pause(): void;
  addEventListener(type: string, fn: () => void): void;
}

export interface GraphLike { ctx: AudioContext; music: AudioNode }

export interface PlayerEnv {
  createAudio(): AudioLike;
  /** SoundKit's graph (or null: no Web Audio). Called once, after the first tap. */
  graph(): Promise<GraphLike | null>;
  /** Milliseconds, monotonic. */
  now(): number;
  /** Where to load a track from (the device cache, cache.ts); defaults to the URL. */
  resolveSrc?(url: string): Promise<string>;
  /** A play crossed 30 s heard. */
  reportPlay?(trackId: string, heardSec: number): void;
  /** Persisted prefs (on/off, level). */
  loadPrefs?(): { enabled?: boolean; level?: number };
  savePrefs?(p: { enabled: boolean; level: number }): void;
  rng?: () => number;
}

interface Deck { el: AudioLike; node: GainNode | null; track: SoundtrackTrack | null; loops: number; fadingOut: boolean }

export interface PlayerSnapshot {
  track: SoundtrackTrack | null;
  playing: boolean;
  stage: SoundtrackStage | null;
  silent: Silence | null;
  enabled: boolean;
  level: number;
  trackCount: number;
}

/** Bed loops: a gap-free loop region repeats under a game at most this many times before the next track. */
export const BED_MAX_LOOPS = 4;
/** Consecutive load errors before the player stops trying (a broken bucket CORS rule, say). */
export const MAX_ERRORS = 3;

const STAGE_MOOD: Partial<Record<SoundtrackStage, Mood>> = { menu: 'menu', loading: 'menu', bed: 'bed' };

export class SoundtrackPlayer {
  private decks: Deck[] = [];
  private cur = 0;
  private tracks: SoundtrackTrack[] = [];
  private graph: GraphLike | null = null;
  private graphReady: Promise<void> | null = null;
  private stageNode: GainNode | null = null;
  private stage: SoundtrackStage | null = null;
  private silent: Silence | null = 'waiting-for-tap';
  private enabled = true;
  private level = DEFAULT_LEVEL;
  private cond: Omit<PlayConditions, 'enabled' | 'hasTracks'> = {
    pathname: '/', unlocked: false, saveData: false, hidden: false, ageLocked: false, focusHeld: false, requested: null,
  };
  private shuffler: Shuffler;
  private tracker = new PlayTracker();
  private lastTick = 0;
  private errors = 0;
  private starting = false;
  private listeners = new Set<() => void>();

  constructor(private env: PlayerEnv) {
    const p = env.loadPrefs?.() ?? {};
    if (typeof p.enabled === 'boolean') this.enabled = p.enabled;
    this.level = clampLevel(p.level ?? DEFAULT_LEVEL);
    this.shuffler = new Shuffler(env.rng);
  }

  // ── inputs ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  setCatalogue(tracks: SoundtrackTrack[]): void { this.tracks = tracks.slice(); void this.apply(); }
  setPathname(pathname: string): void { if (pathname !== this.cond.pathname) { this.cond.pathname = pathname; void this.apply(); } }
  /** The first user gesture on the page. */
  unlock(): void { if (!this.cond.unlocked) { this.cond.unlocked = true; void this.apply(); } }
  setHidden(hidden: boolean): void { this.cond.hidden = hidden; void this.apply(); }
  setSaveData(on: boolean): void { this.cond.saveData = on; void this.apply(); }
  setAgeLocked(on: boolean): void { this.cond.ageLocked = on; void this.apply(); }
  setFocusHeld(on: boolean): void { this.cond.focusHeld = on; void this.apply(); }
  /** A host's stage (setSoundtrackStage / enterBed), or null to infer it from the page. */
  requestStage(stage: SoundtrackStage | null): void { if (stage !== this.cond.requested) { this.cond.requested = stage; void this.apply(); } }
  setEnabled(on: boolean): void { this.enabled = on; this.save(); void this.apply(); }
  setLevel(v: number): void { this.level = clampLevel(v); this.save(); this.writeStageGain(); this.emit(); }
  skip(): void { if (this.stage) void this.startNext(true); }
  /**
   * Call synchronously INSIDE the first gesture's handler: iOS lets a media element play from script later only if it was
   * played once inside a gesture. Each deck plays a few silent samples and stops.
   */
  primeFromGesture(silentSrc: string): void {
    if (!this.decks.length) this.decks = [this.makeDeck(), this.makeDeck()];
    for (const d of this.decks) {
      if (d.track) continue;
      try { d.el.src = silentSrc; const p = d.el.play(); if (p && typeof p.catch === 'function') p.catch(() => {}); d.el.pause(); } catch { /* the next gesture tries again */ }
    }
    this.unlock();
  }

  // ── outputs ────────────────────────────────────────────────────────────────────────────────────────────────────────
  snapshot(): PlayerSnapshot {
    const d = this.decks[this.cur];
    return {
      track: d?.track ?? null, playing: !!d && !d.el.paused && this.stage !== null, stage: this.stage, silent: this.silent,
      enabled: this.enabled, level: this.level, trackCount: this.tracks.length,
    };
  }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  get conditions(): Readonly<typeof this.cond> { return this.cond; }

  // ── core ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  private async apply(): Promise<void> {
    const d = decideStage({ ...this.cond, enabled: this.enabled, hasTracks: this.tracks.length > 0 });
    if ('silent' in d) {
      this.silent = d.silent;
      if (this.stage !== null) { this.stage = null; this.fadeOutAll(); }
      this.emit();
      return;
    }
    const was = this.stage;
    this.stage = d.stage;
    this.silent = null;
    await this.ensureGraph();
    if (this.stage === null) return;   // went silent while the graph was loading
    this.writeStageGain();
    const deck = this.decks[this.cur];
    const moodOk = !deck?.track || this.inPool(deck.track);
    if (!deck?.track || !moodOk && was !== this.stage) await this.startNext(!!deck?.track);
    else if (deck.el.paused) this.resume(deck);
    this.emit();
  }

  private inPool(t: SoundtrackTrack): boolean {
    return moodPool(this.tracks, this.stage ? STAGE_MOOD[this.stage] ?? null : null).some((x) => x.id === t.id);
  }

  /** One wiring for the page's life; every caller waits for the same one, so no deck ever starts half-wired. */
  private ensureGraph(): Promise<void> {
    if (!this.decks.length) this.decks = [this.makeDeck(), this.makeDeck()];
    this.graphReady ??= this.wireGraph();
    return this.graphReady;
  }

  private async wireGraph(): Promise<void> {
    try { this.graph = await this.env.graph(); } catch { this.graph = null; }
    if (!this.graph) return;
    try {
      const { ctx, music } = this.graph;
      this.stageNode = ctx.createGain();
      this.stageNode.gain.value = 0;
      this.stageNode.connect(music);
      for (const deck of this.decks) {
        const src = ctx.createMediaElementSource(deck.el as unknown as HTMLMediaElement);
        deck.node = ctx.createGain();
        deck.node.gain.value = 0;
        src.connect(deck.node).connect(this.stageNode);
      }
    } catch { this.graph = null; this.stageNode = null; for (const d of this.decks) d.node = null; }
  }

  private makeDeck(): Deck {
    const el = this.env.createAudio();
    el.crossOrigin = 'anonymous';
    el.preload = 'none';
    const deck: Deck = { el, node: null, track: null, loops: 0, fadingOut: false };
    el.addEventListener('timeupdate', () => this.onTime(deck));
    el.addEventListener('ended', () => { if (this.decks[this.cur] === deck && this.stage) void this.startNext(false); });
    el.addEventListener('error', () => this.onError(deck));
    el.addEventListener('playing', () => { this.errors = 0; this.emit(); });
    el.addEventListener('pause', () => this.emit());
    return deck;
  }

  /** Pick and start the next track on the other deck; crossfade from the current one when asked. */
  private async startNext(crossfade: boolean): Promise<void> {
    if (this.starting || !this.stage) return;
    this.starting = true;
    let failed: Deck | null = null;
    try {
      const pool = moodPool(this.tracks, STAGE_MOOD[this.stage] ?? null);
      const id = this.shuffler.next(pool);
      const track = pool.find((t) => t.id === id) ?? null;
      if (!track) return;
      const out = this.decks[this.cur];
      const nextIdx = out?.track ? 1 - this.cur : this.cur;
      const deck = this.decks[nextIdx];
      deck.track = track;
      deck.loops = 0;
      deck.fadingOut = false;
      deck.el.src = this.env.resolveSrc ? await this.env.resolveSrc(track.url) : track.url;
      deck.el.currentTime = 0;
      this.cur = nextIdx;
      this.tracker.start(track.id);
      this.lastTick = this.env.now();
      this.fadeDeck(deck, dbToGain(track.gainDb), crossfade ? CROSSFADE_SEC : FADE_SEC, true);
      if (out && out !== deck && out.track) this.fadeOutDeck(out, crossfade ? CROSSFADE_SEC : FADE_SEC);
      if (!this.stage) return;
      await Promise.resolve(deck.el.play()).catch(() => { failed = deck; });
    } finally {
      this.starting = false;
      this.emit();
    }
    if (failed) this.onError(failed);   // after `starting` clears, so the error can move on to the next track
  }

  private resume(deck: Deck): void {
    if (!deck.track) return;
    deck.fadingOut = false;
    this.lastTick = this.env.now();
    this.fadeDeck(deck, dbToGain(deck.track.gainDb), FADE_SEC, true);
    void Promise.resolve(deck.el.play()).catch(() => this.onError(deck));
  }

  private onTime(deck: Deck): void {
    if (deck !== this.decks[this.cur] || !deck.track) return;
    const t = this.env.now();
    const dt = (t - this.lastTick) / 1000;
    this.lastTick = t;
    const audible = this.stage !== null && this.level > 0 && !this.cond.hidden && !deck.el.paused;
    const counted = this.tracker.tick(dt, audible);
    if (counted) this.env.reportPlay?.(counted, this.tracker.heardSec);
    const loop = deck.track.loop;
    if (this.stage === 'bed' && loop && deck.loops < BED_MAX_LOOPS && deck.el.currentTime >= loop.endSec) {
      deck.el.currentTime = loop.startSec;
      deck.loops++;
      return;
    }
    const dur = Number.isFinite(deck.el.duration) && deck.el.duration > 0 ? deck.el.duration : deck.track.durationSec;
    if (this.stage && !this.starting && dur - deck.el.currentTime <= CROSSFADE_SEC && this.tracks.length > 1) void this.startNext(true);
  }

  private onError(deck: Deck): void {
    if (deck !== this.decks[this.cur]) return;
    this.errors++;
    if (this.errors >= MAX_ERRORS) { this.silent = 'no-tracks'; this.emit(); return; }
    if (this.stage) void this.startNext(false);
  }

  // ── levels ─────────────────────────────────────────────────────────────────────────────────────────────────────────
  private writeStageGain(): void {
    const g = this.stage ? stageGain(this.stage, this.level) : 0;
    if (this.stageNode && this.graph) {
      const p = this.stageNode.gain, now = this.graph.ctx.currentTime;
      p.cancelScheduledValues(now);
      p.setTargetAtTime(g, now, FADE_SEC / 3);
    } else {
      for (const d of this.decks) if (d.track && !d.fadingOut) d.el.volume = Math.min(1, dbToGain(d.track.gainDb) * g);
    }
  }

  /** Ramp a deck to `target` (equal-power when fading in through Web Audio). */
  private fadeDeck(deck: Deck, target: number, sec: number, fadeIn: boolean): void {
    if (deck.node && this.graph) {
      const p = deck.node.gain, now = this.graph.ctx.currentTime;
      p.cancelScheduledValues(now);
      const n = 32, curve = new Float32Array(n), from = p.value;
      for (let i = 0; i < n; i++) {
        const k = crossfadeGains(i / (n - 1));
        curve[i] = fadeIn ? from + (target - from) * k.in : target + (from - target) * k.out;
      }
      try { p.setValueCurveAtTime(curve, now, Math.max(0.05, sec)); } catch { p.setValueAtTime(target, now); }
    } else {
      const g = this.stage ? stageGain(this.stage, this.level) : 0;
      deck.el.volume = Math.min(1, Math.max(0, target * g));
    }
  }

  private fadeOutDeck(deck: Deck, sec: number): void {
    deck.fadingOut = true;
    this.fadeDeck(deck, 0, sec, false);
    const el = deck.el;
    setTimeout(() => { if (deck.fadingOut) el.pause(); }, Math.ceil(sec * 1000) + 50);
  }

  private fadeOutAll(): void { for (const d of this.decks) if (d.track && !d.el.paused) this.fadeOutDeck(d, FADE_SEC); }

  private save(): void { this.env.savePrefs?.({ enabled: this.enabled, level: this.level }); }
  private emit(): void { for (const fn of [...this.listeners]) { try { fn(); } catch { /* a bad listener never stops the music */ } } }
}
