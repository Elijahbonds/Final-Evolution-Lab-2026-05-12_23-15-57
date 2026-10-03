// gameRecorder — canvas.captureStream plus the game mix, kept on the device.
//
// The machine in recorderMachine.ts decides the buttons. This file only runs the recorder the machine
// asked for, in short segments so the last 30 seconds is a set of real files (replayBuffer.ts).
// Audio is the SoundKit mix when the page can tap it. No upload.

import { pickCodec, type CodecPick } from './codecs';
import { REC_IDLE, recStep, type RecModel } from './recorderMachine';
import { REPLAY_MS, SEGMENT_MS, retainSegments, type TimedPiece } from './replayBuffer';

export interface SegmentSource {
  /** One playable piece. Null when recording cannot start or was cancelled. */
  next(ms: number): Promise<Blob | null>;
  /** Stop the piece in progress. The next next() may start another. */
  stop(): void;
}

interface Piece extends TimedPiece {
  blob: Blob;
}

/**
 * Browser source: one MediaRecorder per segment, on a captureStream, with the game-audio tracks added.
 * `onCodec` fires with the pick the first time a recorder is built, so the HUD can say when iOS fell back.
 */
export function canvasSegmentSource(
  canvas: HTMLCanvasElement,
  audio: () => MediaStream | null,
  onCodec?: (pick: CodecPick) => void,
  fps = 30,
): SegmentSource {
  let current: MediaRecorder | null = null;
  let cancel = false;
  let reported = false;
  return {
    async next(ms: number) {
      cancel = false;
      if (typeof MediaRecorder === 'undefined') return null;
      let stream: MediaStream;
      try {
        stream = canvas.captureStream(fps);
      } catch {
        return null;
      }
      const shared = new Set<MediaStreamTrack>();
      try {
        const mix = audio();
        for (const track of mix?.getAudioTracks() ?? []) {
          shared.add(track);
          stream.addTrack(track);
        }
      } catch { /* a silent clip is still a clip */ }
      const release = () => {
        for (const track of stream.getTracks()) {
          if (shared.has(track)) continue;
          try { track.stop(); } catch { /* gone */ }
        }
      };
      const codec = pickCodec(
        (mime) => (typeof MediaRecorder.isTypeSupported === 'function' ? MediaRecorder.isTypeSupported(mime) : false),
        typeof navigator !== 'undefined' ? navigator.userAgent : '',
      );
      if (!reported) { reported = true; onCodec?.(codec); }
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(stream, codec.mime ? { mimeType: codec.mime } : undefined);
      } catch {
        try { rec = new MediaRecorder(stream); }
        catch { release(); return null; }
      }
      current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const done = new Promise<Blob | null>((resolve) => {
        rec.onstop = () => {
          release();
          resolve(chunks.length ? new Blob(chunks, { type: chunks[0].type || codec.mime || 'video/webm' }) : null);
        };
        rec.onerror = () => { release(); resolve(null); };
      });
      try { rec.start(250); } catch {
        release();
        return null;
      }
      await new Promise<void>((resolve) => {
        const poll = setInterval(() => {
          if (!cancel) return;
          clearTimeout(timer);
          clearInterval(poll);
          resolve();
        }, 40);
        const timer = setTimeout(() => { clearInterval(poll); resolve(); }, ms);
      });
      if (rec.state !== 'inactive') {
        try { rec.stop(); } catch { /* already stopped */ }
      }
      return done;
    },
    stop() {
      cancel = true;
      if (current && current.state !== 'inactive') {
        try { current.stop(); } catch { /* already stopped */ }
      }
    },
  };
}

export class GameRecorder {
  model: RecModel = REC_IDLE;
  codecNote: string | null = null;
  private segments: Piece[] = [];
  private replayBlobs: Blob[] = [];
  private takeBlobs: Blob[] = [];
  private running = false;
  private mode: 'buffer' | 'take' | null = null;
  private gen = 0;
  private loopDone: Promise<void> = Promise.resolve();
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly source: SegmentSource, private readonly now: () => number = () => Date.now()) {}

  get replay(): readonly Blob[] { return this.replayBlobs; }
  get take(): readonly Blob[] { return this.takeBlobs; }

  armBuffer(): Promise<void> {
    return this.enqueue(async () => {
      const next = recStep(this.model, { type: 'arm-buffer' });
      if (next === this.model) return;
      await this.finishPiece();
      this.model = next;
      this.begin('buffer', false);
    });
  }

  record(): Promise<void> {
    return this.enqueue(async () => {
      const next = recStep(this.model, { type: 'record' });
      if (next === this.model) return;
      await this.finishPiece();
      this.model = next;
      this.begin('take', false);
    });
  }

  /**
   * Snapshot the pieces that fall in the last 30 seconds. A buffer stops. A take keeps going, and the
   * open piece is closed first so the snapshot includes the moment the button was pressed.
   */
  saveReplay(): Promise<Blob[]> {
    return this.enqueue(async () => {
      const was = this.mode;
      const next = recStep(this.model, { type: 'save-replay' });
      if (!next.replay) return this.replayBlobs;
      await this.finishPiece();
      this.replayBlobs = retainSegments(this.segments, this.now(), REPLAY_MS).map((p) => p.blob);
      this.model = next;
      if (was === 'take') this.begin('take', true);
      else this.mode = null;
      return this.replayBlobs;
    });
  }

  stop(): Promise<Blob[]> {
    return this.enqueue(async () => {
      const next = recStep(this.model, { type: 'stop' });
      if (next === this.model) return [];
      const was = this.mode;
      await this.finishPiece();
      if (was === 'take') this.takeBlobs = this.segments.map((p) => p.blob);
      if (was === 'buffer') this.replayBlobs = retainSegments(this.segments, this.now(), REPLAY_MS).map((p) => p.blob);
      this.mode = null;
      this.model = next;
      return next.take ? this.takeBlobs : this.replayBlobs;
    });
  }

  discard(): Promise<void> {
    return this.enqueue(async () => {
      await this.finishPiece();
      this.segments = [];
      this.replayBlobs = [];
      this.takeBlobs = [];
      this.mode = null;
      this.model = REC_IDLE;
    });
  }

  fail(message: string): Promise<void> {
    return this.enqueue(async () => {
      await this.finishPiece();
      this.mode = null;
      this.model = recStep(REC_IDLE, { type: 'fail', message });
    });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  /** Close the open piece and wait until its bytes are in `segments`. */
  private async finishPiece(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.source.stop();
    await this.loopDone;
  }

  private begin(mode: 'buffer' | 'take', keep: boolean): void {
    this.gen += 1;
    this.running = true;
    this.mode = mode;
    if (!keep) this.segments = [];
    const gen = this.gen;
    this.loopDone = this.loop(mode, gen);
  }

  private async loop(run: 'buffer' | 'take', gen: number): Promise<void> {
    while (this.gen === gen && this.running && this.mode === run) {
      const t0 = this.now();
      const blob = await this.source.next(SEGMENT_MS);
      if (this.gen !== gen || !blob) break;
      const t1 = Math.max(this.now(), t0 + 1);
      this.segments.push({ blob, t0, t1 });
      if (run === 'buffer') this.segments = retainSegments(this.segments, t1, REPLAY_MS);
      if (!this.running || this.mode !== run) break;
    }
  }
}
