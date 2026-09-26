// KitPulse — the FEL 808 kit under the routine (owner decision 2026-09-06:
// "FEL 808 kit pulse under the band"). The StemBand is EARNED by dancing;
// this is the floor the dancer stands on — kick, clap, hats from the
// FEL-owned /audio/kits/808 stems, scheduled on the mode's audio clock with
// the same 16th-note lookahead the band uses, so both stay locked.
//
// Pattern lives in `kitPattern` (pure, tested). Audio lives in the class.
// No asset → that voice is silent, never an error: the mode must run headless.
//
// MUSIC-SUITE P2 (2026-09-25): the grid runs on the SONG clock (SongClock) with StemBand's scheduler (plan16ths, the
// same past-time guard this file's hit() always had), queued notes can be taken back (cancelFrom: a pause), the cursor
// can go back (rewind: the count back in), and the count-in clicks are queued like every other hit so a pause in the
// count-in silences them too. It plays on SoundKit's context through its music bus and limiter (DanceMode wires `dest`).
// DanceMode now calls start() when the count-in is armed, so beat 0 is queued 0.25 s ahead like every later 16th. It
// used to call it on the first frame at or past beat 0 (DanceMode.ts:415-418 at 91c139d1), so beat 0 reached this file
// up to a frame late and the past-time guard below dropped it whenever that frame was over 10 ms late (by reading the
// code; not measured).

import { plan16ths, gridIndexAt, PAST_SLACK_SEC } from './SongClock';

export interface KitPattern {
  /** 16th-note indices within a bar (0..15) on which each voice hits. */
  kick: number[];
  clap: number[];
  hat: number[];
  openhat: number[];
}

/** One pattern per chart, denser with difficulty. */
export function kitPattern(trackId: string): KitPattern {
  switch (trackId) {
    case 'warmup':
      return { kick: [0, 8], clap: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], openhat: [] };
    case 'battle':
      return { kick: [0, 6, 8, 10], clap: [4, 12, 14], hat: Array.from({ length: 16 }, (_, i) => i), openhat: [7, 15] };
    default:
      return { kick: [0, 7, 8], clap: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14, 15], openhat: [14] };
  }
}

export type KitVoice = keyof KitPattern;

export const KIT_URLS: Record<KitVoice, string> = {
  kick: '/audio/kits/808/kick.wav',
  clap: '/audio/kits/808/clap.wav',
  hat: '/audio/kits/808/hat.wav',
  openhat: '/audio/kits/808/openhat.wav',
};

const VOICE_GAIN: Record<KitVoice, number> = { kick: 0.9, clap: 0.55, hat: 0.35, openhat: 0.4 };
const LOOKAHEAD_SEC = 0.25;

export class KitPulse {
  private buffers = new Map<KitVoice, AudioBuffer>();
  private out: GainNode;
  private next16 = 0;
  private startedAt = 0;      // song-clock time of 16th 0
  private started = false;    // not `startedAt !== 0`: a song clock may start at 0
  private dead = false;
  /** Song time → audio time (SongClock.audio). Identity until the mode sets it. */
  private toAudio: (songSec: number) => number = (s) => s;
  /** Every source handed to Web Audio and when it starts (audio time), so a pause can take the queued ones back. */
  private queued: { node: AudioScheduledSourceNode; at: number }[] = [];
  /** 16ths passed over because they were already behind the clock (a dev probe reads it). */
  skipped = 0;

  constructor(
    private ctx: AudioContext,
    dest: AudioNode,
    private bpm: number,
    private pattern: KitPattern,
    level = 0.7,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = level;
    this.out.connect(dest);
  }

  /** Fetch + decode the stems. Resolves to how many voices loaded. */
  async load(fetchImpl: typeof fetch = fetch): Promise<number> {
    const jobs = (Object.keys(KIT_URLS) as KitVoice[]).map(async (v) => {
      try {
        const res = await fetchImpl(KIT_URLS[v]);
        if (!res.ok) return;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        if (!this.dead) this.buffers.set(v, buf);
      } catch { /* silent voice */ }
    });
    await Promise.all(jobs);
    return this.buffers.size;
  }

  get voices(): number { return this.buffers.size; }

  /** The pick screen may change the track after the stems are loaded:
   *  retune tempo + pattern without reloading (only before `start`). */
  retune(bpm: number, pattern: KitPattern): void {
    this.bpm = bpm;
    this.pattern = pattern;
  }

  /** Four hat clicks (the first accented) so the count-in is HEARD on the
   *  audio clock, not just counted on the frame clock. `t0` is AUDIO time (the count back in after a pause puts
   *  them on the song's grid through SongClock.audio). */
  countIn(t0: number, beats = 4): void {
    const bd = 60 / this.bpm;
    for (let i = 0; i < beats; i++) this.hit('hat', t0 + i * bd, i === 0 ? 1 : 0.6);
  }

  /** Map the grid's song time to the context's audio time (SongClock.audio). Without it the two are one clock. */
  setClock(toAudio: (songSec: number) => number): void { this.toAudio = toAudio; }

  /** Start the grid: 16th 0 sounds at song time `nowSec` (it may be ahead — nothing is queued before its lookahead). */
  start(nowSec: number): void {
    this.startedAt = nowSec;
    this.next16 = 0;
    this.started = true;
  }

  private get per16(): number { return 60 / Math.max(1, this.bpm) / 4; }

  /** Drive from the mode's update with the SONG clock. Queues 0.25 s ahead; never in the past. */
  update(nowSec: number): void {
    if (this.dead || !this.started) return;
    const audioNow = this.ctx.currentTime;
    const plan = plan16ths({
      startedAt: this.startedAt, next16: this.next16, per16: this.per16, songNow: nowSec,
      lookahead: LOOKAHEAD_SEC, toAudio: this.toAudio, audioNow,
    });
    for (const { idx, at } of plan.slots) this.schedule16th(idx % 16, at);
    this.next16 = plan.next16;
    this.skipped += plan.skipped;
    if (this.queued.length > 64) this.queued = this.queued.filter((q) => q.at > audioNow - 2);   // long since played
  }

  /** Put the cursor back to song time `songSec` (a resume's count back in replays the bar before the pause point). */
  rewind(songSec: number): void {
    if (!this.started) return;
    this.next16 = gridIndexAt(this.startedAt, this.per16, songSec);
  }

  /** Take back every hit queued to start at or after audio time `audioSec` (a pause: the lookahead and the count-in
   *  clicks must not play into it). Returns how many were taken back. */
  cancelFrom(audioSec: number): number {
    let n = 0;
    this.queued = this.queued.filter((q) => {
      if (q.at < audioSec - 1e-6) return true;
      try { q.node.stop(0); } catch { /* never started, or already stopped */ }
      try { q.node.disconnect(); } catch { /* already gone */ }
      n++;
      return false;
    });
    return n;
  }

  /** Duck to silence and stop scheduling (results, dispose). */
  dispose(): void {
    this.dead = true;
    this.cancelFrom(this.ctx.currentTime);
    try { this.out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); } catch { /* closing */ }
  }

  private schedule16th(idx: number, t: number): void {
    const p = this.pattern;
    if (p.kick.includes(idx)) this.hit('kick', t, idx === 0 ? 1 : 0.85);
    if (p.clap.includes(idx)) this.hit('clap', t, 1);
    if (p.openhat.includes(idx)) this.hit('openhat', t, 0.9);
    else if (p.hat.includes(idx)) this.hit('hat', t, idx % 4 === 0 ? 1 : 0.7);
  }

  private hit(v: KitVoice, t: number, vel: number): void {
    const buf = this.buffers.get(v);
    if (!buf || this.dead) return;
    // A time already behind the clock (stems decoded after the count-in was
    // scheduled) would play NOW and stack into a burst — skip it instead.
    if (t < this.ctx.currentTime - PAST_SLACK_SEC) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = VOICE_GAIN[v] * vel;
    src.connect(g).connect(this.out);
    src.start(t);
    this.queued.push({ node: src, at: t });
  }
}
