// Lookahead sequencer — schedules ~100ms ahead on the AudioContext clock,
// checked every 25ms. setTimeout-driven sequencers drift audibly within ~10s;
// this is the only reliable browser timing model.

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

  get context(): AudioContext { return this.ctx; }
  get isRunning(): boolean { return this.timerId !== null; }
  setState(s: SequencerState): void { this.state = s; }
  setBpm(bpm: number): void { this.state.bpm = Math.max(40, Math.min(220, bpm)); }

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
