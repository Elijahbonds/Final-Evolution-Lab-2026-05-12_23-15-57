// VoiceKit — the pre-rendered voices, played on the court (THE MIC, 2026-09-24).
//
// The director (MicDirector, pure) decides who says which clip; this plays them:
//   - the clips come in BANKS: one file per voice per event group (a bank is the rendered .m4a clips back to back, and an
//     index with each line's byte range and length). One request per bank, fetched when the mode loads, never awaited by it;
//     a missing bank is silence (the caption still carries the line), never an error;
//   - each clip is decoded when it is first needed (or prefetched) at 24 kHz, the rate it was rendered at, and kept in a small
//     cache: decoding a whole bank would hold ~100 MB of float samples;
//   - the MCs and the sidekick are ON THE MIC: through the court's PA (a horn EQ, a little drive, a compressor, the slap-back
//     off the nearest wall and a short room), and the crowd ducks under them while they talk. The crowd's own voices go into
//     the crowd (panned across the stands, filtered, ducked with it); the players are dry, on the court;
//   - a cue's clips are scheduled back to back on the audio clock (the line, then the dunk's name), never on timers, so slow-mo,
//     hit-stop and a busy frame cannot pull them apart.

//
// VOICEOVER (2026-10-06): ONE LANE PER SCENE. Every foreground line (the booth, a player, the coach, a room's host) now asks
// voiceQueue.ts before it plays: lines never overlap, a bigger moment cuts in with a fade, an equal one waits its turn inside a
// window or is dropped, a line that decoded too late is dropped (never played late), and the same moment has a cooldown. Each clip
// plays at its loudness trim (loudness.ts), the music, the effects and the crowd duck under every foreground voice (SoundKit,
// ducking.ts), and `onStart` fires when the audio actually starts, so the caption is in step with what is heard. The crowd's own
// shouts stay a background layer under all of it, as before.

import { SoundKit } from '../SoundKit';
import type { MicCue, MicLine } from './MicDirector';
import { VoiceQueue } from '../voice/voiceQueue';
import { lineGain } from '../voice/loudness';

export const VOICE_BASE = '/audio/voice/v1';
/** One rendered line in a bank: where its bytes are and how long it plays (`lufs`: its measured loudness, once measured). */
export interface BankLine extends MicLine { off: number; len: number; sec: number; lufs?: number }
export interface BankIndex { cast: string; group: string; bank: string; lines: BankLine[] }

/** What became of a line: it played, the voice is off (or there is no Web Audio), a clip is missing, or the lane dropped it
 *  (stale, cooling down, or a busier moment had the mic). A dropped line shows no caption: nothing was said. */
export type VoicePlayResult = 'played' | 'off' | 'missing' | 'dropped';

const RATE = 24000;
const CACHE = 64;
/** The breath between two clips of one cue (the line, then the dunk's name). */
const CLIP_GAP = 0.05;
/** The scheduling lead from "now" to the first sample (the audio thread needs a few ms). */
const LEAD = 0.03;
const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
/** Text as a lookup key: case, curly quotes, punctuation and spacing do not matter. */
export const textKey = (t: string): string => t.toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** The PA per court: the wall that answers (slap-back delay, seconds; 0 = none), the room's length, and how hard the horn is pushed. */
export const PA_PRESETS: Record<string, { slap: number[]; room: number; drive: number; roomWet: number }> = {
  venice: { slap: [0.105], room: 0.45, drive: 2.2, roomWet: 0.1 },      // the beach: one wall, open sky
  blossom: { slap: [0.07], room: 0.35, drive: 1.6, roomWet: 0.08 },     // a park: trees, a short close wall
  orbit: { slap: [], room: 1.2, drive: 1.8, roomWet: 0.2 },             // an arena under a dome: no slap, a long tail
  canopy: { slap: [0.06], room: 0.4, drive: 1.4, roomWet: 0.12 },       // the forest soaks it up
  rooftop: { slap: [0.16, 0.28], room: 0.9, drive: 1.9, roomWet: 0.14 }, // the towers answer, twice
  // MUSIC-SUITE P8 (2026-09-25): Stoop's own PA — the Cypher is not one of THE MIC's five courts (it has no
  // CourtLocationId), but VoiceKit.play needs SOME preset for role 'mc' (paFor falls back to `venice` for an unknown
  // court, which reads too beachy-bright for a block party). A soft single slap and a short room: a stoop with a
  // mic and a folding chair, not an arena.
  cypher: { slap: [0.05], room: 0.5, drive: 1.7, roomWet: 0.12 },
};

interface LiveRec { id: number; src: AudioBufferSourceNode; gain: GainNode; channel: MicCue['channel'] }
interface Waiting { cue: MicCue; court: string; bufs: AudioBuffer[]; onStart?: () => void; resolve: (r: VoicePlayResult) => void }

class VoiceKitImpl {
  private readonly indexes = new Map<string, Promise<BankIndex | null>>();
  private readonly bins = new Map<string, Promise<ArrayBuffer | null>>();
  private readonly binName = new Map<string, string>();
  private readonly where = new Map<string, { bank: string; line: BankLine }>();
  private readonly byText = new Map<string, string>();
  private readonly decoded = new Map<string, AudioBuffer>();
  private readonly decoding = new Map<string, Promise<AudioBuffer | null>>();
  private readonly live = new Set<LiveRec>();
  private pa: { court: string; input: GainNode; side: GainNode; nodes: AudioNode[] } | null = null;
  private decoder: BaseAudioContext | null = null;
  // VOICEOVER: the scene's one foreground lane
  private readonly lane = new VoiceQueue();
  private readonly waiting = new Map<number, Waiting>();
  private seq = 0;
  private wake: ReturnType<typeof setTimeout> | null = null;

  /** Fetch the banks a mode needs (e.g. the court's MC in 'shared' + 'dunk'). Resolves to the indexes that arrived. */
  async load(needs: { cast: string; group: string }[]): Promise<BankIndex[]> {
    const got = await Promise.all(needs.map(async (n) => {
      const index = await this.index(n.cast, n.group);
      if (index?.bank) await this.bin(`${n.cast}/${n.group}`);   // the audio too: a mode wants its first call on time
      return index;
    }));
    return got.filter((g): g is BankIndex => !!g);
  }
  /** VOICEOVER: fetch only the banks' indexes (the text of every line): the audio is fetched the first time a line is played.
   *  For a page that speaks mostly with the browser's voice and wants a rendered take only where one exists (findText). */
  async loadIndex(needs: { cast: string; group: string }[]): Promise<BankIndex[]> {
    const got = await Promise.all(needs.map((n) => this.index(n.cast, n.group)));
    return got.filter((g): g is BankIndex => !!g);
  }
  /** The rendered line behind a clip id ('<cast>/<line id>'), once its bank is in. */
  line(clipId: string): BankLine | undefined { return this.where.get(clipId)?.line; }
  /** VOICEOVER: the clip whose script text is `text` (case, punctuation and spacing aside) in a loaded index, optionally only
   *  from these voices. */
  findText(text: string, casts?: readonly string[]): string | undefined {
    const id = this.byText.get(textKey(text));
    return id && (!casts || casts.includes(id.split('/')[0])) ? id : undefined;
  }

  /** Decode clips ahead of their moment (the director pre-picks the likely next call). */
  prefetch(clipIds: readonly string[]): void { for (const id of clipIds) void this.buffer(id); }

  /**
   * Play a cue. Resolves true when it started (false: no audio here, the voice is off, a clip never decoded, or the lane dropped
   * it). `onStart` fires when the first clip starts, for the caption.
   */
  async play(cue: MicCue, court: string, onStart?: () => void): Promise<boolean> {
    return (await this.playEx(cue, court, onStart)) === 'played';
  }

  /**
   * VOICEOVER: play a cue through the scene's lane and say what became of it. A crowd shout plays at once (it is the bed); every
   * other line asks the lane: it starts now, waits its turn (the promise resolves when it starts) or is dropped. Its window runs
   * from THIS call, so a slow decode cannot make it late.
   */
  async playEx(cue: MicCue, court: string, onStart?: () => void): Promise<VoicePlayResult> {
    const askedAt = clock();
    if (!SoundKit.voiceOn) return 'off';
    if (!SoundKit.graph()) return 'off';
    const bufs = await Promise.all(cue.clips.map((c) => this.buffer(c)));
    if (bufs.some((b) => !b)) return 'missing';
    if (cue.channel === 'crowd') return this.startClips(0, cue, court, bufs as AudioBuffer[], 0, onStart) ? 'played' : 'off';
    const sec = (bufs as AudioBuffer[]).reduce((a, b) => a + b.duration, 0) + CLIP_GAP * (bufs.length - 1);
    return new Promise<VoicePlayResult>((resolve) => {
      const id = ++this.seq;
      const d = this.lane.request({ id, priority: cue.priority, sec, at: askedAt, moment: cue.moment, interrupt: cue.interrupt }, clock());
      for (const e of this.lane.takeEvicted()) this.settle(e.id, 'dropped');
      if (d.kind === 'drop') { resolve('dropped'); return; }
      this.waiting.set(id, { cue, court, bufs: bufs as AudioBuffer[], onStart, resolve });
      if (d.kind === 'start') {
        if (d.cut) this.cut(d.cut.id, d.cut.fadeSec);
        this.begin(id, Math.max(0, d.at - clock()));
      }
      this.schedule();
    });
  }

  /** Stop a channel (or everything) with a short fade. What was waiting on it is dropped. */
  stop(channel: MicCue['channel'] | 'all', fadeSec = 0.08): void {
    const g = SoundKit.graph(); if (!g) return;
    const now = g.ctx.currentTime, t = clock();
    const ids = new Set<number>();
    for (const rec of [...this.live]) {
      if (channel !== 'all' && rec.channel !== channel) continue;
      this.fadeOut(rec, now, fadeSec);
      ids.add(rec.id);
    }
    for (const id of ids) this.lane.stopped(id, t);
    if (channel === 'all') { for (const r of this.lane.clear(t)) this.settle(r.id, 'dropped'); }
    else for (const [id, w] of [...this.waiting]) if (w.cue.channel === channel) { this.lane.stopped(id, t); this.settle(id, 'dropped'); }
    if (ids.size || channel === 'all') SoundKit.releaseDuck(now + fadeSec);
    this.schedule();
  }
  stopAll(fadeSec = 0.15): void { this.stop('all', fadeSec); }

  // ── the lane (VOICEOVER) ──────────────────────────────────────────────────────────────────────────────────────────────
  /** Start a waiting line `delay` seconds from now. */
  private begin(id: number, delay: number): void {
    const w = this.waiting.get(id); if (!w) return;
    this.waiting.delete(id);
    if (!SoundKit.voiceOn || !this.startClips(id, w.cue, w.court, w.bufs, delay, w.onStart)) {
      this.lane.stopped(id, clock()); w.resolve('off'); return;
    }
    if (delay > 0.02) setTimeout(() => w.resolve('played'), delay * 1000); else w.resolve('played');
  }
  /** A line that will not play now resolves as dropped. */
  private settle(id: number, r: VoicePlayResult): void { const w = this.waiting.get(id); if (w) { this.waiting.delete(id); w.resolve(r); } }
  private cut(id: number, fadeSec: number): void {
    const g = SoundKit.graph(); if (!g) return;
    const now = g.ctx.currentTime;
    for (const rec of [...this.live]) if (rec.id === id) this.fadeOut(rec, now, fadeSec);
  }
  private fadeOut(rec: LiveRec, now: number, fadeSec: number): void {
    try { rec.gain.gain.cancelScheduledValues(now); rec.gain.gain.setTargetAtTime(0, now, fadeSec / 3); rec.src.stop(now + fadeSec); } catch { /* already done */ }
    this.live.delete(rec);
  }
  /** Wake when the lane next changes on its own (a line ends, a waiting line goes stale). */
  private schedule(): void {
    if (this.wake) { clearTimeout(this.wake); this.wake = null; }
    const t = this.lane.nextWake(clock()); if (t === null) return;
    this.wake = setTimeout(() => this.pump(), Math.max(10, (t - clock()) * 1000 + 5));
  }
  private pump(): void {
    this.wake = null;
    const { start, dropped } = this.lane.next(clock());
    for (const d of dropped) this.settle(d.id, 'dropped');
    if (start) this.begin(start.id, 0);
    this.schedule();
  }

  /** Schedule a cue's clips back to back on the audio clock, `delay` seconds out. False: no graph. */
  private startClips(id: number, cue: MicCue, court: string, bufs: AudioBuffer[], delay: number, onStart?: () => void): boolean {
    const g = SoundKit.graph(); if (!g) return false;
    const out = this.routeFor(cue, court); if (!out) return false;
    const { ctx } = g;
    let t = ctx.currentTime + LEAD + delay;
    const t0 = t;
    cue.clips.forEach((clip, i) => {
      const b = bufs[i];
      const src = ctx.createBufferSource(); src.buffer = b;
      const gain = ctx.createGain(); gain.gain.value = lineGain(cue.role, cue.cast, this.line(clip), cue.gain);
      src.connect(gain).connect(out);
      src.start(t);
      const rec: LiveRec = { id, src, gain, channel: cue.channel };
      this.live.add(rec); src.onended = () => { this.live.delete(rec); };
      t += b.duration + CLIP_GAP;
    });
    if (cue.channel !== 'crowd') SoundKit.duckForVoice(t0, t - CLIP_GAP, court);
    if (onStart) { if (delay > 0.02) setTimeout(onStart, delay * 1000); else onStart(); }
    return true;
  }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────────
  private index(cast: string, group: string): Promise<BankIndex | null> {
    const key = `${cast}/${group}`;
    let p = this.indexes.get(key);
    if (!p) {
      p = (async () => {
        try {
          const res = await fetch(`${VOICE_BASE}/${cast}/${group}.json`);
          if (!res.ok) return null;
          const index = (await res.json()) as BankIndex;
          if (!index.lines.length || !index.bank) return index;   // nothing to say in this group
          this.binName.set(key, index.bank);
          for (const line of index.lines) {
            const clipId = `${cast}/${line.id}`;
            this.where.set(clipId, { bank: key, line });
            const k = textKey(line.text); if (k && !this.byText.has(k)) this.byText.set(k, clipId);
          }
          return index;
        } catch { return null; }
      })();
      this.indexes.set(key, p);
    }
    return p;
  }
  private bin(key: string): Promise<ArrayBuffer | null> {
    let p = this.bins.get(key);
    if (!p) {
      const name = this.binName.get(key);
      if (!name) return Promise.resolve(null);
      p = (async () => {
        try {
          const res = await fetch(`${VOICE_BASE}/${key.split('/')[0]}/${name}`);
          return res.ok ? await res.arrayBuffer() : null;
        } catch { return null; }
      })();
      this.bins.set(key, p);
    }
    return p;
  }

  private buffer(clipId: string): Promise<AudioBuffer | null> {
    const hit = this.decoded.get(clipId);
    if (hit) { this.decoded.delete(clipId); this.decoded.set(clipId, hit); return Promise.resolve(hit); }   // LRU touch
    let p = this.decoding.get(clipId);
    if (p) return p;
    p = (async () => {
      const w = this.where.get(clipId); if (!w) return null;
      const bytes = await this.bin(w.bank); if (!bytes) return null;
      const dec = this.decodeCtx(); if (!dec) return null;
      try {
        // decodeAudioData detaches what it is given: hand it a copy of the clip's bytes
        const buf = await dec.decodeAudioData(bytes.slice(w.line.off, w.line.off + w.line.len));
        this.decoded.set(clipId, buf);
        while (this.decoded.size > CACHE) this.decoded.delete(this.decoded.keys().next().value as string);
        return buf;
      } catch { return null; }
      finally { this.decoding.delete(clipId); }
    })();
    this.decoding.set(clipId, p);
    return p;
  }
  /** Decode at the rendered rate (a buffer plays at any context rate; this halves the memory against a 48 kHz decode). */
  private decodeCtx(): BaseAudioContext | null {
    if (this.decoder) return this.decoder;
    try {
      const Off = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
      if (Off) { this.decoder = new Off(1, 1, RATE); return this.decoder; }
    } catch { /* fall through to the live context */ }
    this.decoder = SoundKit.graph()?.ctx ?? null;
    return this.decoder;
  }

  private routeFor(cue: MicCue, court: string): AudioNode | null {
    const g = SoundKit.graph(); if (!g) return null;
    const { ctx } = g;
    if (cue.role === 'mc' || cue.role === 'side') {
      const pa = this.paFor(court); if (!pa) return null;
      return cue.role === 'side' ? pa.side : pa.input;
    }
    const pan = ctx.createStereoPanner(); pan.pan.value = cue.pan;
    if (cue.role === 'crowd') {
      // up in the stands: the top rolled off, a touch of the room, under the crowd's duck
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3600;
      const lvl = ctx.createGain(); lvl.gain.value = 0.55;
      pan.connect(lp).connect(lvl).connect(g.crowdDuck);
      return pan;
    }
    const lvl = ctx.createGain(); lvl.gain.value = 0.8;   // a player: on the court, dry (loudness.ROUTE_TRIM_DB lifts him on his clip's gain)
    pan.connect(lvl).connect(g.voiceIn);
    return pan;
  }

  /** The court's PA, built once per court: horn EQ → drive → compressor → dry + slap-back(s) + room → the voice bus. */
  private paFor(court: string): { input: GainNode; side: GainNode } | null {
    if (this.pa?.court === court) return this.pa;
    const g = SoundKit.graph(); if (!g) return null;
    const { ctx } = g;
    for (const n of this.pa?.nodes ?? []) { try { n.disconnect(); } catch { /* gone */ } }
    const P = PA_PRESETS[court] ?? PA_PRESETS.venice;
    const input = ctx.createGain();
    const side = ctx.createGain(); side.gain.value = 0.82;   // the sidekick: the same PA, his own mic a little lower
    side.connect(input);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 240; hp.Q.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5600; lp.Q.value = 0.7;
    const horn = ctx.createBiquadFilter(); horn.type = 'peaking'; horn.frequency.value = 2200; horn.gain.value = 4.5; horn.Q.value = 1.1;
    const pre = ctx.createGain(); pre.gain.value = 1.4;
    const drive = ctx.createWaveShaper(); drive.curve = tanhCurve(P.drive); drive.oversample = '2x';
    const post = ctx.createGain(); post.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
    input.connect(hp).connect(lp).connect(horn).connect(pre).connect(drive).connect(post).connect(comp);
    const outBus = ctx.createGain();
    comp.connect(outBus);
    const nodes: AudioNode[] = [input, side, hp, lp, horn, pre, drive, post, comp, outBus];
    for (const d of P.slap) {
      const delay = ctx.createDelay(1); delay.delayTime.value = d;
      const fb = ctx.createGain(); fb.gain.value = 0.18;
      const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2500;
      const wet = ctx.createGain(); wet.gain.value = 0.22 / P.slap.length;
      comp.connect(delay).connect(dl).connect(fb).connect(delay);
      dl.connect(wet).connect(outBus);
      nodes.push(delay, fb, dl, wet);
    }
    const conv = ctx.createConvolver(); conv.buffer = roomIR(ctx, P.room);
    const roomWet = ctx.createGain(); roomWet.gain.value = P.roomWet;
    comp.connect(conv).connect(roomWet).connect(outBus);
    outBus.connect(g.voiceIn);   // VOICEOVER: through the preset's voice chain to the voice bus
    nodes.push(conv, roomWet);
    this.pa = { court, input, side, nodes };
    return this.pa;
  }
}

function tanhCurve(k: number): Float32Array {
  const n = 1024, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); }
  return c;
}
/** A procedural room: decaying noise, darkened (no impulse-response asset to ship). */
function roomIR(ctx: BaseAudioContext, sec: number): AudioBuffer {
  const n = Math.max(1, Math.floor(ctx.sampleRate * sec)), buf = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; lp += 0.35 * (w - lp); d[i] = lp * Math.pow(1 - i / n, 3); }
  }
  return buf;
}

export const VoiceKit = new VoiceKitImpl();
