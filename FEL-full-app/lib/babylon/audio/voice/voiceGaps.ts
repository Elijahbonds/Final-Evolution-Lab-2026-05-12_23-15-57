// voiceGaps: what the voice could not say well, logged once each (VOICEOVER, 2026-10-06).
//
// Two kinds of gap, both content the owner has to supply (docs/VOICE-LINES-NEEDED.md lists today's):
//   - 'thin': a moment with fewer than MIN_VARIANTS rendered lines for a voice. A shuffle bag cannot hide a pool of two: the
//     player hears the same pair all night;
//   - 'tts': a line that had no rendered take, so the browser's speech engine said it (the robotic voice the owner hears).
// Pure and bounded: a registry the page exposes (window.__FEL_VOICE_GAPS__) and a probe or the console can read.

export const MIN_VARIANTS = 3;
const CAP = 200;

export interface VoiceGap { kind: 'thin' | 'tts'; key: string; detail: string; n: number }

const gaps = new Map<string, VoiceGap>();

function note(kind: VoiceGap['kind'], key: string, detail: string): boolean {
  const k = `${kind}:${key}`;
  const hit = gaps.get(k);
  if (hit) { hit.n++; return false; }
  if (gaps.size >= CAP) return false;
  gaps.set(k, { kind, key, detail, n: 1 });
  try {
    if (typeof window !== 'undefined') {
      (window as unknown as { __FEL_VOICE_GAPS__?: VoiceGap[] }).__FEL_VOICE_GAPS__ = [...gaps.values()];
      console.info(`[VOICE] content gap (${kind}): ${key}${detail ? ` (${detail})` : ''}`);
    }
  } catch { /* logging is best effort */ }
  return true;
}

/** A pool of `n` lines for `key` ('<cast>|<moment>'). Logged once when n < MIN_VARIANTS. Returns true the first time. */
export function noteThinPool(key: string, n: number): boolean {
  return n < MIN_VARIANTS && n > 0 ? note('thin', key, `${n} variant${n === 1 ? '' : 's'}`) : false;
}
/** A line spoken by the browser's speech engine because no rendered take matched it. */
export function noteTtsLine(source: string, text: string): boolean { return note('tts', `${source}: ${text}`, ''); }

export function voiceGaps(): VoiceGap[] { return [...gaps.values()]; }
export function resetVoiceGaps(): void { gaps.clear(); }
