/**
 * Story lines, heard and captioned (ADVENTURE PLAN, "Captions go through core/captions.ts as critical, always. Voice
 * goes through audio/voice/voiceQueue: TTS (ttsVoice) for placeholders, recorded lines (bakedLine) when the owner
 * records them").
 *
 *   CAPTIONS   every line that starts is a `critical` cue on the shared caption bus (the /play layout's live region
 *              announces it): speaker and text. Always, voice or not.
 *   VOICE      every line asks the scene's ONE voice lane (VoiceQueue) at story priority with `interrupt`, so the newest
 *              line cuts a lesser one and never talks over it; a line the queue starts goes to the `Speaker`. The
 *              browser's speaker (AdventureMode) is audio/voice/speakNatural: a recorded take when the line's text has
 *              one (bakedLine), else the device's least robotic TTS voice (ttsVoice) — today every line is a
 *              placeholder, so TTS. Headless, the speaker is null and only the queue's decisions are kept.
 *
 * Pure (the clock is handed in; the speaker and the caption sink are injected).
 */

import { VoiceQueue, type Decision } from '@/lib/babylon/audio/voice/voiceQueue';
import { captions, type CueImportance } from '@/lib/babylon/core/captions';
import { lineSec, type DialogueLine } from './dialogue';

/** Story lines outrank the booth's ordinary calls and the coach's filler. [TUNE] */
export const STORY_VOICE_PRIORITY = 2;

export interface StorySpeaker { speak(text: string): void; cancel(): void }

export type CaptionSink = (text: string, importance: CueImportance) => void;

export class StoryVoice {
  private readonly queue = new VoiceQueue();
  private seq = 0;
  private playing: number | null = null;
  /** Texts of the lines waiting in the queue (a line asked for near the end of the last waits for it). */
  private readonly waiting = new Map<number, string>();
  /** Each line's decision, in order (tests and probes). */
  readonly log: { lineId: string; decision: Decision['kind']; caption: string }[] = [];

  constructor(private readonly speaker: StorySpeaker | null, private readonly cue: CaptionSink = (t, i) => { captions.cue(t, i); }) {}

  /** A line started on screen at `nowSec` (any monotonic seconds). */
  line(l: DialogueLine, nowSec: number): Decision {
    const caption = l.speakerName ? `${l.speakerName}: ${l.text}` : l.text;
    this.cue(caption, 'critical');
    const id = ++this.seq;
    const d = this.queue.request({ id, priority: STORY_VOICE_PRIORITY, sec: lineSec(l.text), at: nowSec, interrupt: true, moment: undefined }, nowSec);
    this.log.push({ lineId: l.id, decision: d.kind, caption });
    if (this.log.length > 64) this.log.shift();
    if (d.kind === 'start') this.begin(id, l.text, !!d.cut || this.playing !== null);
    else if (d.kind === 'queued') this.waiting.set(id, l.text);
    for (const e of this.queue.takeEvicted()) this.waiting.delete(e.id);
    return d;
  }

  /** Time passes (each frame): a waiting line whose turn came starts; a stale one is dropped, never said late. */
  update(nowSec: number): void {
    if (!this.waiting.size) return;
    const r = this.queue.next(nowSec);
    for (const x of r.dropped) this.waiting.delete(x.id);
    if (r.start) {
      const text = this.waiting.get(r.start.id);
      this.waiting.delete(r.start.id);
      if (text !== undefined) this.begin(r.start.id, text, this.playing !== null);
    }
  }

  private begin(id: number, text: string, cut: boolean): void {
    if (cut) this.speaker?.cancel();
    this.playing = id;
    this.speaker?.speak(text);
  }

  /** The scene ended or was skipped: hush. */
  stop(nowSec: number): void {
    if (this.playing !== null) this.queue.stopped(this.playing, nowSec);
    this.queue.clear(nowSec);
    this.waiting.clear();
    this.playing = null;
    this.speaker?.cancel();
  }
}
