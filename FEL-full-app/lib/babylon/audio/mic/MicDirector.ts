// MicDirector — who says what, and when, on the mic at the hoops events (THE MIC, 2026-09-24).
//
// Owner: "add a MC announcer on the mic at the events so it has better commentary and audio … for now create some voices,
// commentary, chatter". Decisions: pre-rendered voices (Kokoro, Apache-2.0, rendered offline to small clips), all the hoops events,
// one MC per court plus a shared courtside sidekick, crowd chatter and player chatter, clean streetball language.
//
// The pure half. A mode says what just happened (`hear`: a moment like 'dunk.make', how big it was, who it was about, which names
// to call after it) and the director answers with CUES: which cast member speaks, which pre-rendered clips back to back, the caption,
// how urgent it is, and whether it cuts off what is playing. Four channels:
//   - the BOOTH (the court's MC and the sidekick share one mic: they never talk over each other);
//   - the CROWD (up to three shouts at once, scattered left to right);
//   - the PLAYERS (one line each, at a time).
// Nothing here touches audio: VoiceKit plays the cues, and a test can drive the director with a clock.

export type MicRole = 'mc' | 'side' | 'crowd' | 'player';
export type Tier = 0 | 1 | 2;

/** One pre-rendered line of a cast member's script. `moment` is a dotted family ('dunk.make', 'game.block', 'filler.dunk'). */
export interface MicLine {
  id: string;
  moment: string;
  text: string;
  /** 0 ordinary, 1 good, 2 huge. No tier = fits any size. */
  tier?: Tier;
  /** A line tagged 'rival:cass' plays only when the event is about Cass. */
  tags?: string[];
  /** Rendered length in seconds (from the clip index). */
  sec?: number;
}
export interface CastScript { cast: string; role: MicRole; name: string; lines: MicLine[] }

export interface MicEvent {
  moment: string;
  tier?: Tier;
  tags?: string[];
  /** Name clips called after the line, e.g. ['dunk:windmill'] → "…THE WINDMILL!" (the MC's 'name' lines tagged 'name:dunk:windmill'). */
  stinger?: string[];
  /** For the player channel: whose voice. */
  who?: string;
  /** Overrides the priority the tier gives (0 filler … 3 the biggest moment). */
  priority?: number;
  /** The crowd's reaction under the call. */
  crowd?: { moment: string; n: number };
  /** The sidekick's chance to answer the MC's call on the same moment (0..1). */
  side?: number;
}

export type MicChannel = 'booth' | 'crowd' | 'player';
export interface MicCue {
  cast: string;
  role: MicRole;
  channel: MicChannel;
  clips: string[];
  caption: string;
  speaker: string;
  sec: number;
  priority: number;
  /** Cut off whatever the booth is saying. */
  interrupt: boolean;
  /** −1 left … 1 right. */
  pan: number;
  /** Relative level (the crowd sits under the booth). */
  gain: number;
}

export interface MicDirectorOpts {
  scripts: CastScript[];
  /** The court's MC and the sidekick. */
  booth: { mc: string; side?: string };
  crowd?: string[];
  /** Player id → the cast id that voices him. */
  players?: Record<string, string>;
  seed?: number;
}

/** A clip with no rendered length yet is timed from its words (~2.6 words a second on the mic). */
export const lineSec = (l: MicLine): number => l.sec ?? Math.max(0.6, l.text.split(/\s+/).length / 2.6);
/** Priority from the moment's size: a huge one outranks a good one outranks an ordinary call outranks filler. */
export const priorityOf = (ev: MicEvent): number => ev.priority ?? (ev.moment.startsWith('filler') ? 0 : 1 + (ev.tier ?? 0));
/** The moment's families, most specific first: 'game.three.corner' → ['game.three.corner', 'game.three', 'game']. */
export function momentChain(m: string): string[] {
  const parts = m.split('.'); const out: string[] = [];
  for (let i = parts.length; i > 0; i--) out.push(parts.slice(0, i).join('.'));
  return out;
}

const GAP = 0.18;             // breath between two clips of one cue, and between the MC and the sidekick
const QUEUE_WAIT = 1.2;       // an equal-priority call waits this long for the booth before it is dropped
const MAX_CROWD = 3;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class MicDirector {
  private readonly byCast = new Map<string, CastScript>();
  private readonly recent = new Map<string, string[]>();          // cast|moment → recently used ids
  private readonly reserved = new Map<string, MicLine>();         // cast|moment|tier → the pre-picked line (prefetch)
  private readonly rand: () => number;
  private boothUntil = 0; private boothPriority = -1;
  private readonly crowdUntil: number[] = [];
  private readonly playerUntil = new Map<string, number>();
  private queued: { at: number; cue: MicCue }[] = [];
  private filler: { moments: string[]; every: [number, number] } | null = null;
  private nextFillerAt = Infinity;
  private crowdIdle: { moment: string; every: [number, number] } | null = null;
  private nextCrowdIdleAt = Infinity;

  constructor(private readonly o: MicDirectorOpts) {
    for (const s of o.scripts) this.byCast.set(s.cast, s);
    this.rand = mulberry(o.seed ?? 20260924);
  }

  /** The line a cast member would say for this event (no side effects beyond the no-repeat memory when `commit`). */
  pick(cast: string, ev: Pick<MicEvent, 'moment' | 'tier' | 'tags'>, commit = true): MicLine | null {
    const s = this.byCast.get(cast); if (!s) return null;
    const rkey = `${cast}|${ev.moment}|${ev.tier ?? '-'}|${(ev.tags ?? []).join(',')}`;
    const held = this.reserved.get(rkey);
    if (held) { if (commit) { this.reserved.delete(rkey); this.remember(cast, held); } return held; }
    for (const m of momentChain(ev.moment)) {
      let pool = s.lines.filter((l) => l.moment === m && (!l.tags?.length || l.tags.every((t) => ev.tags?.includes(t))));
      if (!pool.length) continue;
      pool = this.byTier(pool, ev.tier);
      const seen = this.recent.get(`${cast}|${m}`) ?? [];
      const fresh = pool.filter((l) => !seen.includes(l.id));
      const cands = fresh.length ? fresh : pool;
      const w = cands.map((l) => (l.tags?.some((t) => ev.tags?.includes(t)) ? 4 : 1));
      let r = this.rand() * w.reduce((a, b) => a + b, 0), chosen = cands[cands.length - 1];
      for (let i = 0; i < cands.length; i++) { r -= w[i]; if (r <= 0) { chosen = cands[i]; break; } }
      if (commit) this.remember(cast, chosen); else this.reserved.set(rkey, chosen);
      return chosen;
    }
    return null;
  }
  /** Pre-pick the line for a likely next event (VoiceKit fetches its clip now; `hear` then says the same line). */
  prefetch(ev: MicEvent): string[] {
    const ids: string[] = [];
    const l = this.pick(this.o.booth.mc, ev, false); if (l) ids.push(this.clipId(this.o.booth.mc, l));
    for (const k of ev.stinger ?? []) { const n = this.nameLine(k); if (n) ids.push(this.clipId(this.o.booth.mc, n)); }
    return ids;
  }

  /** Something happened: the cues to start now (the booth's call, the crowd under it). The sidekick's answer is queued for `tick`. */
  hear(ev: MicEvent, now: number): MicCue[] {
    const out: MicCue[] = [];
    if (ev.who) { const c = this.playerCue(ev, now); if (c) out.push(c); }
    else if (ev.moment === 'stinger') {
      // just the names (the judges' total read on the reveal beat: "Forty-seven!")
      const names = (ev.stinger ?? []).map((k) => this.nameLine(k)).filter((x): x is MicLine => !!x);
      if (names.length) { const placed = this.placeBooth(this.boothCue(this.o.booth.mc, names, priorityOf(ev)), now); if (placed) out.push(...placed.now); }
    }
    else {
      const p = priorityOf(ev);
      const line = this.pick(this.o.booth.mc, ev);
      if (line) {
        const names = (ev.stinger ?? []).map((k) => this.nameLine(k)).filter((x): x is MicLine => !!x);
        const cue = this.boothCue(this.o.booth.mc, [line, ...names], p);
        const placed = this.placeBooth(cue, now);
        if (placed) {
          out.push(...placed.now);
          const side = this.o.booth.side;
          if (side && (ev.side ?? 0) > 0 && this.rand() < (ev.side ?? 0)) {
            const reply = this.pick(side, { moment: ev.moment, tier: ev.tier, tags: ev.tags });
            if (reply) this.queued.push({ at: placed.endsAt + GAP, cue: this.boothCue(side, [reply], Math.max(0, p - 1)) });
          }
        }
      }
    }
    if (ev.crowd) out.push(...this.crowdCues(ev.crowd.moment, ev.crowd.n, now, ev.tier));
    this.nextFillerAt = Math.max(this.nextFillerAt === Infinity ? 0 : this.nextFillerAt, this.boothUntil + this.fillerGap());
    return out;
  }

  /** Time passes: queued follow-ups that are due, filler when the booth has been quiet, the crowd's idle chatter. */
  tick(now: number): MicCue[] {
    const out: MicCue[] = [];
    const due = this.queued.filter((q) => q.at <= now); this.queued = this.queued.filter((q) => q.at > now);
    for (const q of due) {
      if (now - q.at > QUEUE_WAIT) continue;   // stale: the moment has passed
      const placed = this.placeBooth(q.cue, now); if (placed) out.push(...placed.now);
    }
    if (this.filler && now >= this.nextFillerAt && now >= this.boothUntil) {
      const side = this.o.booth.side;
      const who = side && this.rand() < 0.3 ? side : this.o.booth.mc;
      const moment = this.filler.moments[Math.floor(this.rand() * this.filler.moments.length)];
      let speaker = who, l = this.pick(who, { moment });
      if (!l && who !== this.o.booth.mc) { speaker = this.o.booth.mc; l = this.pick(speaker, { moment }); }
      if (l) { const placed = this.placeBooth(this.boothCue(speaker, [l], 0), now); if (placed) out.push(...placed.now); }
      this.nextFillerAt = this.boothUntil + this.fillerGap();
    }
    if (this.crowdIdle && now >= this.nextCrowdIdleAt) {
      out.push(...this.crowdCues(this.crowdIdle.moment, 1, now, undefined, 0.55));
      const [a, b] = this.crowdIdle.every; this.nextCrowdIdleAt = now + a + this.rand() * (b - a);
    }
    return out;
  }

  /** Between plays the booth fills the air (crowd work, banter: one of `moments` each time) every `every` seconds of quiet;
   *  null stops it (mid-play). */
  setFiller(moments: string | string[] | null, now: number, every: [number, number] = [7, 12]): void {
    const list = moments === null ? [] : Array.isArray(moments) ? moments : [moments];
    this.filler = list.length ? { moments: list, every } : null;
    this.nextFillerAt = list.length ? Math.max(now, this.boothUntil) + this.fillerGap() : Infinity;
  }
  /** The stands talking among themselves. */
  setCrowdIdle(moment: string | null, now: number, every: [number, number] = [4, 8]): void {
    this.crowdIdle = moment ? { moment, every } : null;
    this.nextCrowdIdleAt = moment ? now + every[0] : Infinity;
  }
  /** The crowd alone (the booth is holding, e.g. through a dunk's flight, but the stands still react to a trick). */
  crowd(moment: string, n: number, now: number, tier?: Tier): MicCue[] { return this.crowdCues(moment, n, now, tier); }
  /** Stop the booth where it is (a skip, the end of the mode). */
  hush(now: number): void { this.boothUntil = now; this.boothPriority = -1; this.queued = []; }
  get boothBusyUntil(): number { return this.boothUntil; }
  script(cast: string): CastScript | undefined { return this.byCast.get(cast); }
  /** The file a clip lives in: '<cast>/<line id>'. */
  clipId(cast: string, l: MicLine): string { return `${cast}/${l.id}`; }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────────
  private remember(cast: string, l: MicLine): void {
    const k = `${cast}|${l.moment}`, pool = this.byCast.get(cast)?.lines.filter((x) => x.moment === l.moment).length ?? 1;
    const ring = (this.recent.get(k) ?? []).filter((id) => id !== l.id); ring.push(l.id);
    while (ring.length > Math.max(0, Math.min(pool - 1, 8))) ring.shift();
    this.recent.set(k, ring);
  }
  private byTier(pool: MicLine[], tier: Tier | undefined): MicLine[] {
    if (tier === undefined) return pool;
    const exact = pool.filter((l) => l.tier === tier); if (exact.length) return exact;
    const any = pool.filter((l) => l.tier === undefined); if (any.length) return any;
    for (let t = tier - 1; t >= 0; t--) { const lower = pool.filter((l) => l.tier === t); if (lower.length) return lower; }
    return pool;
  }
  private nameLine(key: string): MicLine | null {
    const s = this.byCast.get(this.o.booth.mc);
    return s?.lines.find((l) => l.moment === 'name' && l.tags?.includes(`name:${key}`)) ?? null;
  }
  private boothCue(cast: string, lines: MicLine[], priority: number): MicCue {
    const s = this.byCast.get(cast)!;
    return {
      cast, role: s.role, channel: 'booth', clips: lines.map((l) => this.clipId(cast, l)), caption: lines.map((l) => l.text).join(' '),
      speaker: s.name, sec: lines.reduce((a, l) => a + lineSec(l), 0) + GAP * (lines.length - 1), priority, interrupt: false, pan: 0, gain: 1,
    };
  }
  /** The booth has one mic: a bigger moment cuts in, an equal one waits a beat, a smaller one lets it go. */
  private placeBooth(cue: MicCue, now: number): { now: MicCue[]; endsAt: number } | null {
    if (now >= this.boothUntil) { this.claimBooth(cue, now); return { now: [cue], endsAt: this.boothUntil }; }
    if (cue.priority > this.boothPriority) { this.queued = this.queued.filter((q) => q.cue.priority > cue.priority); const c = { ...cue, interrupt: true }; this.claimBooth(c, now); return { now: [c], endsAt: this.boothUntil }; }
    if (cue.priority === this.boothPriority && cue.priority > 0 && this.boothUntil - now <= QUEUE_WAIT) {
      const at = this.boothUntil + GAP; this.queued.push({ at, cue }); return { now: [], endsAt: at + cue.sec };
    }
    return null;
  }
  private claimBooth(cue: MicCue, now: number): void { this.boothUntil = now + cue.sec; this.boothPriority = cue.priority; }
  private crowdCues(moment: string, n: number, now: number, tier?: Tier, gain = 0.8): MicCue[] {
    const casts = this.o.crowd ?? []; if (!casts.length) return [];
    for (let i = this.crowdUntil.length - 1; i >= 0; i--) if (this.crowdUntil[i] <= now) this.crowdUntil.splice(i, 1);
    const out: MicCue[] = [];
    const order = [...casts].sort(() => this.rand() - 0.5);
    for (const cast of order) {
      if (out.length >= n || this.crowdUntil.length >= MAX_CROWD) break;
      const l = this.pick(cast, { moment, tier }); if (!l) continue;
      const s = this.byCast.get(cast)!;
      const sec = lineSec(l);
      this.crowdUntil.push(now + sec);
      out.push({ cast, role: 'crowd', channel: 'crowd', clips: [this.clipId(cast, l)], caption: l.text, speaker: s.name, sec, priority: 0, interrupt: false,
        pan: Math.round((this.rand() * 1.6 - 0.8) * 100) / 100, gain: gain * (0.75 + this.rand() * 0.25) });
    }
    return out;
  }
  private playerCue(ev: MicEvent, now: number): MicCue | null {
    const cast = this.o.players?.[ev.who!]; if (!cast) return null;
    if ((this.playerUntil.get(cast) ?? 0) > now) return null;
    const l = this.pick(cast, ev); if (!l) return null;
    const s = this.byCast.get(cast)!, sec = lineSec(l);
    this.playerUntil.set(cast, now + sec);
    return { cast, role: 'player', channel: 'player', clips: [this.clipId(cast, l)], caption: l.text, speaker: s.name, sec, priority: priorityOf(ev), interrupt: false, pan: 0, gain: 0.9 };
  }
  private fillerGap(): number { const [a, b] = this.filler?.every ?? [7, 12]; return a + this.rand() * (b - a); }
}
