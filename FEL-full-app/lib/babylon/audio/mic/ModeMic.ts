// ModeMic — THE MIC inside a mode: one per run (THE MIC, 2026-09-24).
//
// A mode makes one in load() with the event groups it needs and the court it is on, calls `say()` at its moments (the sites are
// mapped in ~/Claude/outbox/finish-release/mic/MAP.md), `update()` every frame and `dispose()` on the way out. Behind it: the
// banks for the court's MC, the sidekick, the crowd and the players load in the background (the mode never waits on them); the
// director picks the lines; VoiceKit plays them on the court's PA; the caption goes on the HUD (`mic`, `micWho`) so a muted
// player, a deaf player and a screen reader get the call too.
//
// Speech runs on real time, not the game's clock: a slow-mo or a hit-stop must not stretch the MC.

import type { ModeContext } from '@/lib/babylon/core/ModeHarness';
import { MicDirector, type CastScript, type MicCue, type MicEvent, type MicLine } from './MicDirector';
import { VoiceKit, type BankIndex } from './VoiceKit';
import { CROWD, SIDEKICK, castById, mcFor } from './cast';
import type { MicGroup } from './moments';

export interface ModeMicOpts {
  /** The event groups this mode's MC needs ('shared' always rides along; 'names' for the dunk and game-dunk stingers). */
  groups: (MicGroup | 'names')[];
  court?: string | null;
  /** Who speaks on the court: a player id the mode uses → the voice (cast id). */
  players?: Record<string, string>;
  crowd?: boolean;
  /** Load the coach (movement play: the form read after an attempt, spoken as who: 'coach'). */
  coach?: boolean;
  seed?: number;
}

/** The last cues, for probes (`window.__FEL_MIC__`). */
const LOG: { t: number; cast: string; clips: string[]; caption: string; played: boolean }[] = [];
function logCue(c: MicCue, played: boolean): void {
  LOG.push({ t: Math.round(performance.now()), cast: c.cast, clips: c.clips, caption: c.caption, played });
  if (LOG.length > 80) LOG.shift();
  console.info(`[MIC] ${c.cast}${played ? '' : ' (caption only)'}: ${c.caption}`);
  if (typeof window !== 'undefined') (window as unknown as { __FEL_MIC__?: typeof LOG }).__FEL_MIC__ = LOG;
}

const now = (): number => performance.now() / 1000;

export class ModeMic {
  private director: MicDirector | null = null;
  private readonly court: string;
  private readonly mc: string;
  private captionUntil = 0;
  private holdUntil = 0;
  private pending: { ev: MicEvent; at: number } | null = null;
  private filler: string | string[] | null = null;
  private seq: { ev: MicEvent; at: number }[] = [];
  private crowdIdle: string | null = null;
  private disposed = false;

  constructor(private readonly ctx: ModeContext, private readonly o: ModeMicOpts) {
    this.court = o.court ?? ctx.location ?? 'venice';
    this.mc = mcFor(this.court);
    void this.load();
  }

  /** Something happened. Before the banks are in, a big moment waits (up to 1.5 s); anything smaller is let go. */
  say(ev: MicEvent): void {
    if (this.disposed) return;
    if (!this.director) { if ((ev.priority ?? 1 + (ev.tier ?? 0)) >= 2) this.pending = { ev, at: now() }; return; }
    if (now() < this.holdUntil && !ev.who) {   // the booth is holding its breath (the dunk's flight): only the stands react
      if (ev.crowd) this.run(this.director.crowd(ev.crowd.moment, ev.crowd.n, now(), ev.tier));
      return;
    }
    this.run(this.director.hear(ev, now()));
  }
  /** Say this once the booth is free (an intro after the welcome, a rival's jab after the MC's call). Stale after 8 s. */
  then(ev: MicEvent): void { if (!this.disposed) this.seq.push({ ev, at: now() }); }
  /** The stands alone (they react to a trick in the air while the booth holds). */
  crowd(moment: string, n: number): void { if (this.director && !this.disposed) this.run(this.director.crowd(moment, n, now())); }
  /** Pre-pick and decode the line for a moment that is about to happen (a dunk in the air → its make call). */
  expect(ev: MicEvent): void { if (this.director) VoiceKit.prefetch(this.director.prefetch(ev)); }
  /** Every frame. */
  update(): void {
    if (this.disposed) return;
    const t = now();
    if (this.director) {
      if (this.pending && t - this.pending.at <= 1.5) { const p = this.pending; this.pending = null; this.say(p.ev); }
      else this.pending = null;
      if (t >= this.holdUntil) {
        this.run(this.director.tick(t));
        this.seq = this.seq.filter((s) => t - s.at < 8);
        if (this.seq.length && t >= this.director.boothBusyUntil + 0.25) { const s = this.seq.shift()!; this.say(s.ev); }
      }
    }
    if (this.captionUntil && t >= this.captionUntil) { this.captionUntil = 0; this.ctx.setHud({ mic: '', micWho: '' }); }
  }
  /** The booth fills quiet stretches with this moment ('filler.banter', 'filler.crowd'); null while play is live. */
  setFiller(moments: string | string[] | null): void { this.filler = moments; this.director?.setFiller(moments, now()); }
  /** The stands talk among themselves. */
  setCrowdIdle(moment: string | null): void { this.crowdIdle = moment; this.director?.setCrowdIdle(moment, now()); }
  /** The booth stays silent for `sec` (the dunk: from take-off to contact the only sounds are the rhythm cues). */
  hold(sec: number): void { this.holdUntil = Math.max(this.holdUntil, now() + sec); }
  release(): void { this.holdUntil = 0; }
  /** Cut the booth (a skip, a reset). */
  hush(): void { this.seq = []; this.director?.hush(now()); VoiceKit.stop('booth', 0.08); this.clearCaption(); }
  dispose(): void {
    this.disposed = true;
    VoiceKit.stopAll(0.12);
    this.clearCaption();
  }
  get booth(): { mc: string; side: string } { return { mc: this.mc, side: SIDEKICK }; }
  /** The voices are in (a call can be spoken). */
  get ready(): boolean { return !!this.director; }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────────
  private async load(): Promise<void> {
    const groups = [...new Set<string>(['shared', ...this.o.groups])];
    const needs: { cast: string; group: string }[] = [];
    for (const g of groups) { needs.push({ cast: this.mc, group: g }); if (g !== 'names') needs.push({ cast: SIDEKICK, group: g }); }
    const crowd = this.o.crowd !== false ? CROWD : [];
    for (const c of crowd) needs.push({ cast: c, group: 'crowd' });
    const players = [...new Set(Object.values(this.o.players ?? {}))];
    for (const p of players) needs.push({ cast: p, group: 'chatter' });
    if (this.o.coach) needs.push({ cast: 'coach', group: 'coach' });
    const idx = await VoiceKit.load(needs);
    if (this.disposed) return;
    this.director = new MicDirector({
      scripts: toScripts(idx),
      booth: { mc: this.mc, side: SIDEKICK },
      crowd: crowd.filter((c) => idx.some((i) => i.cast === c)),
      players: this.o.coach ? { ...this.o.players, coach: 'coach' } : this.o.players,
      seed: this.o.seed ?? Math.floor(Math.random() * 2 ** 31),   // a fixed seed opened every session with the same two shouts
    });
    if (this.filler) this.director.setFiller(this.filler, now());
    if (this.crowdIdle) this.director.setCrowdIdle(this.crowdIdle, now());
  }
  private run(cues: MicCue[]): void {
    for (const c of cues) {
      const caption = c.channel !== 'crowd';
      void VoiceKit.play(c, this.court, () => { if (caption) this.showCaption(c); }).then((played) => {
        logCue(c, played);
        if (!played && caption) this.showCaption(c);   // no audio (muted, no bank, no Web Audio): the words still land
      });
    }
  }
  private showCaption(c: MicCue): void {
    if (this.disposed) return;
    this.ctx.setHud({ mic: c.caption, micWho: c.speaker });
    this.captionUntil = now() + c.sec + 0.7;
  }
  private clearCaption(): void { this.captionUntil = 0; try { this.ctx.setHud({ mic: '', micWho: '' }); } catch { /* the harness is gone */ } }
}

/** The loaded banks as the director's scripts: one per cast, its lines from every group that arrived. */
export function toScripts(idx: readonly BankIndex[]): CastScript[] {
  const by = new Map<string, MicLine[]>();
  for (const b of idx) by.set(b.cast, [...(by.get(b.cast) ?? []), ...b.lines]);
  return [...by.entries()].map(([cast, lines]) => {
    const c = castById(cast);
    return { cast, role: c?.role ?? 'crowd', name: c?.name ?? cast.toUpperCase(), lines };
  });
}
