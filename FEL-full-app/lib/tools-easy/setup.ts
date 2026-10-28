// setup — the ONE big word of the shared setup card, from the live pose (TOOLS-EASY, 2026-10-28).
//
// VERTICAL-EASY made the Quick Screen's setup say itself: a picture of where the phone goes and one big word — the fix in
// amber ("Step back", "Whole body in view") or "Ready" in green (lib/vertical/copy.ts setupHeadline, read from
// lib/mirror/framing.ts checkFraming). The other camera tools had a caption or nothing. This is the same read for any
// tool's live frames, with a short hold so the word does not flicker between two fixes on a noisy camera.
//
// Pure: frames in, a word out. The framing check and its words are the Mirror's and the vertical lane's, unchanged.
import { checkFraming, type FramingCheck, type FramingView } from '@/lib/mirror/framing';
import { setupHeadline } from '@/lib/vertical/copy';
import type { PoseFrame } from '@/lib/pose/landmarks';

export interface SetupWord {
  word: string;
  ready: boolean;
  /** The fix as one sentence (the framing check's own), shown under the word while something needs fixing. */
  line: string | null;
}

/** (new) A new word must hold this long before it replaces the shown one (ms): a fix is shown, not flashed. */
export const WORD_HOLD_MS = 500;

/** One frame's framing check (the pose service's landmarks carry `v`; the framing check reads `visibility`). */
export function framingOf(f: Pick<PoseFrame, 'present' | 'image'>, view: FramingView): FramingCheck {
  return checkFraming({ present: f.present, landmarks: f.present ? f.image.map((l) => ({ x: l.x, y: l.y, visibility: l.v })) : [] }, view);
}

export class SetupReader {
  private shown: SetupWord | null = null;
  private pending: { w: SetupWord; since: number } | null = null;
  constructor(private readonly view: FramingView = 'front') {}

  /** The word to show after this frame. */
  push(f: Pick<PoseFrame, 't' | 'present' | 'image'>): SetupWord {
    const c = framingOf(f, this.view);
    const h = setupHeadline(c, c.ok);
    const next: SetupWord = { word: h.word, ready: h.ready, line: h.ready ? null : (c.worst && c.worst !== 'noBody' ? c.instruction : null) };
    if (!this.shown) { this.shown = next; return next; }
    if (next.word === this.shown.word) { this.pending = null; this.shown = next; return next; }
    if (!this.pending || this.pending.w.word !== next.word) this.pending = { w: next, since: f.t };
    if (f.t - this.pending.since >= WORD_HOLD_MS) { this.shown = this.pending.w; this.pending = null; }
    return this.shown;
  }
}
