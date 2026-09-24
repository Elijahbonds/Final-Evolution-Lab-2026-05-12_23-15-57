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

import { SoundKit } from '../SoundKit';
import type { MicCue, MicLine } from './MicDirector';

export const VOICE_BASE = '/audio/voice/v1';
/** One rendered line in a bank: where its bytes are and how long it plays. */
export interface BankLine extends MicLine { off: number; len: number; sec: number }
export interface BankIndex { cast: string; group: string; bank: string; lines: BankLine[] }

type Loaded = { index: BankIndex; bytes: ArrayBuffer };
const RATE = 24000;
const CACHE = 64;

/** The PA per court: the wall that answers (slap-back delay, seconds; 0 = none), the room's length, and how hard the horn is pushed. */
export const PA_PRESETS: Record<string, { slap: number[]; room: number; drive: number; roomWet: number }> = {
  venice: { slap: [0.105], room: 0.45, drive: 2.2, roomWet: 0.1 },      // the beach: one wall, open sky
  blossom: { slap: [0.07], room: 0.35, drive: 1.6, roomWet: 0.08 },     // a park: trees, a short close wall
  orbit: { slap: [], room: 1.2, drive: 1.8, roomWet: 0.2 },             // an arena under a dome: no slap, a long tail
  canopy: { slap: [0.06], room: 0.4, drive: 1.4, roomWet: 0.12 },       // the forest soaks it up
  rooftop: { slap: [0.16, 0.28], room: 0.9, drive: 1.9, roomWet: 0.14 }, // the towers answer, twice
};

class VoiceKitImpl {
  private readonly banks = new Map<string, Promise<Loaded | null>>();
  private readonly where = new Map<string, { bank: string; line: BankLine }>();
  private readonly decoded = new Map<string, AudioBuffer>();
  private readonly decoding = new Map<string, Promise<AudioBuffer | null>>();
  private readonly live = new Set<{ src: AudioBufferSourceNode; gain: GainNode; channel: MicCue['channel'] }>();
  private pa: { court: string; input: GainNode; side: GainNode; nodes: AudioNode[] } | null = null;
  private decoder: BaseAudioContext | null = null;

  /** Fetch the banks a mode needs (e.g. the court's MC in 'shared' + 'dunk'). Resolves to the indexes that arrived. */
  async load(needs: { cast: string; group: string }[]): Promise<BankIndex[]> {
    const got = await Promise.all(needs.map((n) => this.bank(n.cast, n.group)));
    return got.filter((g): g is Loaded => !!g).map((g) => g.index);
  }
  /** The rendered line behind a clip id ('<cast>/<line id>'), once its bank is in. */
  line(clipId: string): BankLine | undefined { return this.where.get(clipId)?.line; }

  /** Decode clips ahead of their moment (the director pre-picks the likely next call). */
  prefetch(clipIds: readonly string[]): void { for (const id of clipIds) void this.buffer(id); }

  /**
   * Play a cue. Resolves true when it started (false: no audio here, the voice is off, or a clip never decoded). `onStart` fires
   * when the first clip starts, for the caption.
   */
  async play(cue: MicCue, court: string, onStart?: () => void): Promise<boolean> {
    if (!SoundKit.voiceOn) return false;
    const g = SoundKit.graph(); if (!g) return false;
    const bufs = await Promise.all(cue.clips.map((c) => this.buffer(c)));
    if (bufs.some((b) => !b)) return false;
    const { ctx } = g;
    if (cue.interrupt || cue.channel === 'booth') this.stop('booth', 0.06);
    const out = this.routeFor(cue, court); if (!out) return false;
    let t = ctx.currentTime + 0.03;
    const t0 = t;
    for (const b of bufs as AudioBuffer[]) {
      const src = ctx.createBufferSource(); src.buffer = b;
      const gain = ctx.createGain(); gain.gain.value = cue.gain;
      src.connect(gain).connect(out);
      src.start(t);
      const rec = { src, gain, channel: cue.channel };
      this.live.add(rec); src.onended = () => this.live.delete(rec);
      t += b.duration + 0.05;
    }
    if (cue.channel === 'booth') this.duck(g.crowdDuck, t0, t);
    onStart?.();
    return true;
  }

  /** Stop a channel (or everything) with a short fade. */
  stop(channel: MicCue['channel'] | 'all', fadeSec = 0.08): void {
    const g = SoundKit.graph(); if (!g) return;
    const now = g.ctx.currentTime;
    for (const rec of [...this.live]) {
      if (channel !== 'all' && rec.channel !== channel) continue;
      try { rec.gain.gain.cancelScheduledValues(now); rec.gain.gain.setTargetAtTime(0, now, fadeSec / 3); rec.src.stop(now + fadeSec); } catch { /* already done */ }
      this.live.delete(rec);
    }
    if (channel === 'all' || channel === 'booth') { g.crowdDuck.gain.cancelScheduledValues(now); g.crowdDuck.gain.setTargetAtTime(1, now, 0.2); }
  }
  stopAll(fadeSec = 0.15): void { this.stop('all', fadeSec); }

  // ── internals ─────────────────────────────────────────────────────────────────────────────────────────────────────
  private bank(cast: string, group: string): Promise<Loaded | null> {
    const key = `${cast}/${group}`;
    let p = this.banks.get(key);
    if (!p) {
      p = (async () => {
        try {
          const idx = await fetch(`${VOICE_BASE}/${cast}/${group}.json`);
          if (!idx.ok) return null;
          const index = (await idx.json()) as BankIndex;
          if (!index.lines.length || !index.bank) return { index, bytes: new ArrayBuffer(0) };   // nothing to say in this group
          const bin = await fetch(`${VOICE_BASE}/${cast}/${index.bank}`);
          if (!bin.ok) return null;
          const bytes = await bin.arrayBuffer();
          for (const line of index.lines) this.where.set(`${cast}/${line.id}`, { bank: key, line });
          return { index, bytes };
        } catch { return null; }
      })();
      this.banks.set(key, p);
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
      const loaded = await this.banks.get(w.bank); if (!loaded) return null;
      const dec = this.decodeCtx(); if (!dec) return null;
      try {
        // decodeAudioData detaches what it is given: hand it a copy of the clip's bytes
        const buf = await dec.decodeAudioData(loaded.bytes.slice(w.line.off, w.line.off + w.line.len));
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
    const lvl = ctx.createGain(); lvl.gain.value = 0.8;   // a player: on the court, dry
    pan.connect(lvl).connect(g.voice);
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
    outBus.connect(g.voice);
    nodes.push(conv, roomWet);
    this.pa = { court, input, side, nodes };
    return this.pa;
  }

  /** The crowd drops ~8 dB while the booth talks, and comes back up after. */
  private duck(node: GainNode, t0: number, t1: number): void {
    node.gain.cancelScheduledValues(t0);
    node.gain.setTargetAtTime(0.4, Math.max(0, t0 - 0.03), 0.05);
    node.gain.setTargetAtTime(1, t1, 0.25);
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
