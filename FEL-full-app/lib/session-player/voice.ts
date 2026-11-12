// lib/session-player/voice.ts — PLAT-P01 (2026-10-27): what the player says, and the mute that remembers itself.
//
// The player talks so the phone can be propped two metres away: the exercise's name as it comes up, "Go" (with the cue
// on an exercise's first set), "Rest" (with the next exercise's name when one is coming), and the finish. The go and rest
// words are the Coach's own drill takes (lib/drills/drillVoice.ts, read-only: coach.drill.go / coach.drill.rest), so a
// recorded take plays where the bank has one; the names and cues are the source's words (cue-rewrite owns them), said
// by the browser's voice (lib/babylon/audio/voice/speakNatural.ts) — ./speaker.ts wires both.
//
// The rest's last three seconds tick (a short tone, not a word). Mute silences both, and the device remembers it
// (one localStorage key, every access wrapped: a private window keeps it for the visit).
//
// Pure except for the storage handed in.
import type { CoachPrompt } from '@/lib/drills/chart';
import type { Effect } from './machine';
import type { Session } from './model';

export const MUTE_KEY = 'fel.session-player.mute';

export interface StorageLike { getItem(k: string): string | null; setItem(k: string, v: string): void }

export function readMuted(s: StorageLike | null): boolean {
  try { return s?.getItem(MUTE_KEY) === '1'; } catch { return false; }
}

export function writeMuted(s: StorageLike | null, muted: boolean): void {
  try { s?.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* blocked storage: muted for this visit only */ }
}

/** The Coach's take for a drill moment ({ text }), or null: lib/drills/drillVoice.ts DrillVoice.pick fits. */
export type TakePicker = (moment: CoachPrompt) => { text: string } | null;

export const GO_WORD = 'Go.';
export const REST_WORD = 'Rest.';
export const DONE_LINE = 'Session done.';

const stop = (s: string): string => (/[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** The line for a transition, or null (nothing to say). */
export function lineFor(e: Effect, session: Session, take: TakePicker = () => null): string | null {
  if (e.kind !== 'enter') return null;
  const st = session.steps[e.step];
  if (e.phase === 'finish') return DONE_LINE;
  if (!st) return null;
  if (e.phase === 'ready') return stop(st.name);
  if (e.phase === 'rest') {
    const rest = take('coach.drill.rest')?.text ?? REST_WORD;
    return e.fresh ? `${stop(rest)} Next: ${stop(st.name)}` : stop(rest);
  }
  // work: "Go", and the cue on an exercise's first set
  const go = stop(take('coach.drill.go')?.text ?? GO_WORD);
  return e.set === 1 && st.cue ? `${go} ${stop(st.cue)}` : go;
}

export interface VoiceOut {
  say(text: string): void;
  tick(left: number): void;
  cancel(): void;
}

/** Says what the machine's effects call for, unless muted. */
export class SessionVoice {
  private muted: boolean;

  constructor(private readonly out: VoiceOut, private readonly storage: StorageLike | null, private readonly take: TakePicker = () => null) {
    this.muted = readMuted(storage);
  }

  get isMuted(): boolean { return this.muted; }

  setMuted(m: boolean): void {
    this.muted = m;
    writeMuted(this.storage, m);
    if (m) this.out.cancel();
  }

  play(effects: readonly Effect[], session: Session): void {
    if (this.muted) return;
    for (const e of effects) {
      if (e.kind === 'tick') { this.out.tick(e.left); continue; }
      const line = lineFor(e, session, this.take);
      if (line) this.out.say(line);
    }
  }

  stop(): void { this.out.cancel(); }
}
