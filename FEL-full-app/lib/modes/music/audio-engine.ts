// Lookahead sequencer — schedules ~100ms ahead on the AudioContext clock,
// checked every 25ms. setTimeout-driven sequencers drift audibly within ~10s;
// this is the only reliable browser timing model.
//
// MUSIC-SUITE P2 (2026-09-25): the legacy /create Music maker had the Academy's swing bug. advance() (was :71-76) added
// base × swing / 2 to a running clock after every odd step, so the off-beat stayed straight, the NEXT on-beat was
// late, and the delays piled up: at its slider's top (1.0) a 92 BPM loop played at 73.6 BPM (P1 BASELINE 2c). Its
// renderStems (was :103-125) ignored swing and pan and skipped the 0.8 master, so the Creator Card stems neither
// matched what the maker played nor summed to it. Both now place every step with the Academy's pure step time
// (lib/babylon/music/stepTime.ts gridStepTime): odd 16ths delayed on a fixed grid, bar lines never drift, and each
// stem goes volume → pan → the 0.8 bus, as the live master does.

//
// MUSIC-SUITE P2 FIX PASS (2026-09-25): the Academy engine's two fixes, here too — a step whose time has already gone by
// when the scheduler reaches it (a main-thread stall, a throttled background timer) is passed over instead of being
// started in the past (src.start(pastTime) plays at once: every missed step used to sound in one burst), and the engine
// claims the 'playback' audio session before it builds its context and gives it back on dispose (lib/audio/session.ts).

import { gridStepTime, retempoGrid, songStepTime, stepDurSec, stepIsPast, type StepGrid } from '@/lib/babylon/music/stepTime';
import { claimPlaybackSession } from '@/lib/audio/session';

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
/** The master bus level — live and in every stem render. */
const MASTER_GAIN = 0.8;

export class AudioEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private samples = new Map<string, Sample>();
  private timerId: number | null = null;
  private currentStep = 0;
  /** MUSIC-SUITE P2: steps scheduled since start(), and the straight grid they sit on (stepTime.ts). */
  private stepIndex = 0;
  private grid: StepGrid = { originSec: 0, originIndex: 0, bpm: 90 };
  private state: SequencerState;
  private scheduledSteps: { step: number; time: number }[] = [];
  public onStep: ((step: number) => void) | null = null;
  /** Fired when a step becomes audible — the Perform layer scores against these. */
  public onStepAudible: ((step: number, time: number) => void) | null = null;
  /** MUSIC-SUITE P2 FIX PASS: steps passed over because their time had gone by (a stall) — for the probes. */
  public skippedSteps = 0;
  private releaseSession: () => void;

  constructor(initial: SequencerState) {
    this.releaseSession = claimPlaybackSession();
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = MASTER_GAIN;
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
    this.currentStep = 0; this.stepIndex = 0;
    this.grid = { originSec: this.ctx.currentTime + 0.05, originIndex: 0, bpm: this.state.bpm };
    this.timerId = window.setInterval(() => this.scheduler(), LOOKAHEAD_MS);
  }
  stop(): void {
    if (this.timerId !== null) { clearInterval(this.timerId); this.timerId = null; }
    this.scheduledSteps = [];
  }

  private scheduler(): void {
    const horizon = this.ctx.currentTime + SCHEDULE_AHEAD_S;
    for (let t = this.nextStepTime(); t < horizon; t = this.nextStepTime()) {
      this.scheduleStep(this.currentStep, t);
      this.advance();
    }
    this.drainPlayhead();
  }
  private secondsPerStep(): number { return stepDurSec(this.state.bpm); }   // 16ths
  /** The next step's place on the live grid; a tempo change re-anchors the grid at this step (nothing jumps). */
  private nextStepTime(): number {
    this.grid = retempoGrid(this.grid, this.stepIndex, this.state.bpm);
    return gridStepTime(this.grid, this.stepIndex, this.currentStep, this.state.swing);
  }
  private advance(): void {
    this.stepIndex++;
    this.currentStep = (this.currentStep + 1) % this.state.steps;
  }
  private scheduleStep(step: number, time: number): void {
    if (stepIsPast(time, this.ctx.currentTime)) {   // MUSIC-SUITE P2 FIX PASS: gone by — start nothing
      this.skippedSteps++;
      this.scheduledSteps.push({ step, time });
      return;
    }
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

  /**
   * Offline-render each track to a WAV blob — the Creator Card stems. MUSIC-SUITE P2: swung on the live loop's grid,
   * panned, and through the same 0.8 bus as the live master, so the stems sum to what the maker plays.
   */
  async renderStems(bars = 2): Promise<Blob[]> {
    const stepDur = this.secondsPerStep();
    const totalDur = stepDur * this.state.steps * bars + 1.0;
    const blobs: Blob[] = [];
    for (const track of this.state.tracks) {
      const sample = this.samples.get(track.sampleId);
      if (!sample || track.muted) continue;
      const offline = new OfflineAudioContext(2, Math.ceil(44100 * totalDur), 44100);
      const bus = offline.createGain();
      bus.gain.value = MASTER_GAIN;
      bus.connect(offline.destination);
      for (let bar = 0; bar < bars; bar++) {
        for (let step = 0; step < this.state.steps; step++) {
          if (!track.pattern[step]) continue;
          const src = offline.createBufferSource();
          src.buffer = sample.buffer;
          const g = offline.createGain();
          g.gain.value = track.volume;
          const pan = offline.createStereoPanner();
          pan.pan.value = track.pan;
          src.connect(g).connect(pan).connect(bus);
          src.start(songStepTime(bar, step, this.state.steps, this.state.bpm, this.state.swing));
        }
      }
      blobs.push(encodeWav(await offline.startRendering()));
    }
    return blobs;
  }

  dispose(): void { this.stop(); void this.ctx.close(); this.releaseSession(); }
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
