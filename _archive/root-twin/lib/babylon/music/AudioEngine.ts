// AudioEngine v2 — REPLACES the M28 file. Three additions for the Studio
// (everything M28 shipped is kept byte-for-byte in behavior):
//   loadBuffer()     — register an already-synthesized AudioBuffer directly
//                      (SynthKit's path — no fetch, no asset files).
//   masterPolish()   — the one-tap "master this": a gentle compressor +
//                      low/high shelf sweetening on the master bus,
//                      toggleable live.
//   renderMixdown()  — offline-render the FULL MIX (not just per-track
//                      stems) to one WAV blob — what the save/library layer
//                      stores and replays.

export interface Sample {
  id: string; name: string; buffer: AudioBuffer;
  category: 'kick' | 'snare' | 'hat' | 'perc' | 'bass' | 'melody' | 'vox' | 'fx';
}
export interface TrackState {
  sampleId: string; pattern: boolean[]; volume: number; muted: boolean; pan: number;
}
export interface SequencerState {
  bpm: number; steps: number; tracks: TrackState[]; swing: number;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

export class AudioEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private polishChain: { comp: DynamicsCompressorNode; low: BiquadFilterNode; high: BiquadFilterNode } | null = null;
  private polished = false;
  private samples = new Map<string, Sample>();
  private timerId: number | null = null;
  private currentStep = 0;
  private nextNoteTime = 0;
  private state: SequencerState;
  private scheduledSteps: { step: number; time: number }[] = [];
  public onStep: ((step: number) => void) | null = null;
  /** Fired when a step becomes audible — the Perform layer scores against these. */
  public onStepAudible: ((step: number, time: number) => void) | null = null;

  constructor(initial: SequencerState) {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(this.ctx.destination);
    this.state = initial;
  }

  async loadSample(id: string, name: string, url: string, category: Sample['category']): Promise<void> {
    const res = await fetch(url);
    const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
    this.samples.set(id, { id, name, buffer, category });
  }

  /** Direct-buffer registration — SynthKit's zero-asset path. */
  loadBuffer(id: string, name: string, buffer: AudioBuffer, category: Sample['category']): void {
    this.samples.set(id, { id, name, buffer, category });
  }

  /** Swap the whole kit in place (kit picker) — patterns/volumes untouched. */
  swapKit(buffers: Map<string, AudioBuffer>): void {
    for (const [id, buffer] of buffers) {
      const existing = this.samples.get(id);
      if (existing) existing.buffer = buffer;
    }
  }

  get context(): AudioContext { return this.ctx; }
  get isRunning(): boolean { return this.timerId !== null; }
  get isPolished(): boolean { return this.polished; }
  setState(s: SequencerState): void { this.state = s; }
  setBpm(bpm: number): void { this.state.bpm = Math.max(40, Math.min(220, bpm)); }

  /** One-tap master: gentle glue compression + shelf sweetening. */
  masterPolish(on: boolean): void {
    if (on === this.polished) return;
    this.polished = on;
    this.master.disconnect();
    if (on) {
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 3;
      comp.attack.value = 0.01; comp.release.value = 0.18;
      const low = this.ctx.createBiquadFilter();
      low.type = 'lowshelf'; low.frequency.value = 120; low.gain.value = 2.5;
      const high = this.ctx.createBiquadFilter();
      high.type = 'highshelf'; high.frequency.value = 8000; high.gain.value = 2;
      this.master.connect(comp).connect(low).connect(high).connect(this.ctx.destination);
      this.polishChain = { comp, low, high };
    } else {
      this.polishChain = null;
      this.master.connect(this.ctx.destination);
    }
  }

  start(): void {
    if (this.timerId !== null) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.05;
    this.timerId = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
  }
  stop(): void {
    if (this.timerId !== null) { clearInterval(this.timerId); this.timerId = null; }
    this.scheduledSteps = [];
  }

  private scheduler(): void {
    while (this.nextNoteTime < this.ctx.currentTime + SCHEDULE_AHEAD_S) {
      this.scheduleStep(this.currentStep, this.nextNoteTime);
      this.advance();
    }
    this.drainPlayhead();
  }
  private secondsPerStep(): number { return (60.0 / this.state.bpm) / 4; }   // 16ths
  private advance(): void {
    const base = this.secondsPerStep();
    const swingOffset = this.currentStep % 2 === 1 ? base * this.state.swing * 0.5 : 0;
    this.nextNoteTime += base + swingOffset;
    this.currentStep = (this.currentStep + 1) % this.state.steps;
  }
  private scheduleStep(step: number, time: number): void {
    for (const track of this.state.tracks) {
      if (track.muted || !track.pattern[step]) continue;
      const sample = this.samples.get(track.sampleId);
      if (!sample) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = sample.buffer;
      const gain = this.ctx.createGain();
      gain.gain.value = track.volume;
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = track.pan;
      src.connect(gain).connect(panner).connect(this.master);
      src.start(time);
    }
    this.scheduledSteps.push({ step, time });
  }
  private drainPlayhead(): void {
    const now = this.ctx.currentTime;
    while (this.scheduledSteps.length && this.scheduledSteps[0].time <= now) {
      const s = this.scheduledSteps.shift()!;
      this.onStep?.(s.step);
      this.onStepAudible?.(s.step, s.time);
    }
  }

  /** Offline-render each track to a WAV blob — the Creator Card stems. */
  async renderStems(bars = 2): Promise<Blob[]> {
    const stepDur = this.secondsPerStep();
    const totalDur = stepDur * this.state.steps * bars + 1.0;
    const blobs: Blob[] = [];
    for (const track of this.state.tracks) {
      const sample = this.samples.get(track.sampleId);
      if (!sample || track.muted) continue;
      const offline = new OfflineAudioContext(2, Math.ceil(44100 * totalDur), 44100);
      for (let bar = 0; bar < bars; bar++) {
        for (let step = 0; step < this.state.steps; step++) {
          if (!track.pattern[step]) continue;
          const src = offline.createBufferSource();
          src.buffer = sample.buffer;
          const g = offline.createGain();
          g.gain.value = track.volume;
          src.connect(g).connect(offline.destination);
          src.start((bar * this.state.steps + step) * stepDur);
        }
      }
      blobs.push(encodeWav(await offline.startRendering()));
    }
    return blobs;
  }

  /** Offline-render the FULL MIX (all unmuted tracks, swing, pan, and the
   *  polish chain if enabled) — what the library saves and replays. */
  async renderMixdown(bars = 2): Promise<Blob> {
    const stepDur = this.secondsPerStep();
    const totalDur = stepDur * this.state.steps * bars + 1.2;
    const offline = new OfflineAudioContext(2, Math.ceil(44100 * totalDur), 44100);
    const bus = offline.createGain();
    bus.gain.value = 0.8;
    if (this.polished) {
      const comp = offline.createDynamicsCompressor();
      comp.threshold.value = -18; comp.knee.value = 24; comp.ratio.value = 3;
      comp.attack.value = 0.01; comp.release.value = 0.18;
      const low = offline.createBiquadFilter();
      low.type = 'lowshelf'; low.frequency.value = 120; low.gain.value = 2.5;
      const high = offline.createBiquadFilter();
      high.type = 'highshelf'; high.frequency.value = 8000; high.gain.value = 2;
      bus.connect(comp).connect(low).connect(high).connect(offline.destination);
    } else {
      bus.connect(offline.destination);
    }
    for (const track of this.state.tracks) {
      const sample = this.samples.get(track.sampleId);
      if (!sample || track.muted) continue;
      for (let bar = 0; bar < bars; bar++) {
        for (let step = 0; step < this.state.steps; step++) {
          if (!track.pattern[step]) continue;
          const at = (bar * this.state.steps + step) * stepDur
            + (step % 2 === 1 ? stepDur * this.state.swing * 0.5 : 0);
          const src = offline.createBufferSource();
          src.buffer = sample.buffer;
          const g = offline.createGain();
          g.gain.value = track.volume;
          const pan = offline.createStereoPanner();
          pan.pan.value = track.pan;
          src.connect(g).connect(pan).connect(bus);
          src.start(at);
        }
      }
    }
    return encodeWav(await offline.startRendering());
  }

  dispose(): void { this.stop(); void this.ctx.close(); }
}

/** Minimal 16-bit PCM WAV encoder. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels;
  const len = buffer.length * numCh * 2 + 44;
  const ab = new ArrayBuffer(len);
  const view = new DataView(ab);
  const chans: Float32Array[] = [];
  let offset = 0, pos = 0;
  const setStr = (s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(pos++, s.charCodeAt(i)); };
  const set32 = (v: number) => { view.setUint32(pos, v, true); pos += 4; };
  const set16 = (v: number) => { view.setUint16(pos, v, true); pos += 2; };
  setStr('RIFF'); set32(len - 8); setStr('WAVE');
  setStr('fmt '); set32(16); set16(1); set16(numCh);
  set32(buffer.sampleRate); set32(buffer.sampleRate * 2 * numCh);
  set16(numCh * 2); set16(16);
  setStr('data'); set32(len - pos - 4);
  for (let i = 0; i < numCh; i++) chans.push(buffer.getChannelData(i));
  while (pos < len) {
    for (let i = 0; i < numCh; i++) {
      const s = Math.max(-1, Math.min(1, chans[i][offset]));
      view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      pos += 2;
    }
    offset++;
  }
  return new Blob([ab], { type: 'audio/wav' });
}
