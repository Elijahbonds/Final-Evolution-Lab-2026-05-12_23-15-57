// drillVoice — which rendered take the Coach says for a drill's line (Mirror & coaching plan Phase 6, 2026-10-07).
//
// The DrillRunner hands out its lines as COACH_MOMENTS ids (chart.ts CoachPrompt: coach.drill.go, coach.drill.hold …).
// The Coach's bank (public/audio/voice/v1/coach/coach.json) has two to four takes of each, as `coach.drill.go.01` …
// with the moment they render on each line. This picks a take for a line, turn by turn (the same take twice in a row
// sounds like a recording, spaceVoice.ts's rule), and returns its clip id ('<cast>/<line id>') and its words, for the
// caption. A line with no take in the bank (not loaded yet, or never voiced) is null: the screen line carries the drill
// on its own, and nothing is said.
//
// Pure: the bank's lines are handed in.
import type { CoachPrompt } from './chart';

/** The Coach's cast, as the body-play space check plays it (lib/move/spaceVoice.ts COACH_CAST). */
export const DRILL_VOICE_CAST = 'coach';

export interface VoiceLineLike { id: string; moment?: string; text: string }

export class DrillVoice {
  private readonly takes = new Map<string, VoiceLineLike[]>();
  private readonly turn = new Map<string, number>();

  constructor(lines: readonly VoiceLineLike[] = [], private readonly cast = DRILL_VOICE_CAST) {
    this.load(lines);
  }

  /** The bank came in (or grew): its drill takes, in id order. */
  load(lines: readonly VoiceLineLike[]): void {
    for (const l of lines) {
      if (!l.moment || !l.moment.startsWith('coach.drill.')) continue;
      const list = this.takes.get(l.moment) ?? [];
      if (!list.some((x) => x.id === l.id)) list.push(l);
      list.sort((a, b) => a.id.localeCompare(b.id));
      this.takes.set(l.moment, list);
    }
  }

  /** The take for this line now, or null when the bank has none. */
  pick(prompt: CoachPrompt): { clip: string; text: string } | null {
    const list = this.takes.get(prompt);
    if (!list?.length) return null;
    const i = this.turn.get(prompt) ?? 0;
    this.turn.set(prompt, (i + 1) % list.length);
    const l = list[i % list.length];
    return { clip: `${this.cast}/${l.id}`, text: l.text };
  }
}
