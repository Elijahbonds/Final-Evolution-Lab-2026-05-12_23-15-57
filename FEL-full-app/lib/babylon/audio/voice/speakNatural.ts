// speakNatural: say a line with a rendered take when one exists, else with the browser's best voice (VOICEOVER, 2026-10-06).
//
// The pages that build their lines at run time (the Mirror coach, the Quick Screen, Prove It) called speechSynthesis directly.
// They now call this, which:
//   1. looks the text up in the Coach's rendered bank (VoiceKit.findText: only the index is fetched, ~34 KB; the audio is fetched
//      the first time a line matches) and, when the take is there and the game's audio is running, plays it through the voice lane
//      (so it never talks over another voice, ducks the bed, and sounds like the rest of the cast);
//   2. otherwise speaks it with the device's least robotic voice (ttsVoice.pickTtsVoice) at its natural pitch, and logs the line
//      as a content gap (voiceGaps: `window.__FEL_VOICE_GAPS__`), so docs/VOICE-LINES-NEEDED.md can be kept honest.
// Today no Mirror / Quick Screen / Prove It line has a rendered take (their text is built at run time), so (2) is what plays until
// the owner records them: rendering a line into the coach bank with the same text is all it takes for (1) to pick it up. The
// production script for every one of them is tools/voice/script/coach.csv; tools/voice/import-voices.mts puts the takes in the bank.
// Browser-only (it touches speechSynthesis and VoiceKit); every decision it makes is in the pure modules it calls.

import { SoundKit } from '../SoundKit';
import { VoiceKit } from '../mic/VoiceKit';
import { TTS_PITCH, pickTtsVoice } from './ttsVoice';
import { noteTtsLine } from './voiceGaps';
import { bakedClipsFor } from './bakedLine';

/** The voices whose rendered takes may stand in for a run-time line. */
const BAKED_CASTS: readonly string[] = ['coach'];
let warmed = false;

/** Fetch the Coach's script index once, and let the first touch or key unlock the game's audio (a take cannot play before). */
export function warmBakedVoice(): void {
  if (warmed || typeof window === 'undefined') return;
  warmed = true;
  void VoiceKit.loadIndex([{ cast: 'coach', group: 'coach' }]);
  try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.getVoices(); } catch { /* Chrome fills the list on first ask */ }
  const unlock = (): void => { try { SoundKit.unlock(); } catch { /* no Web Audio */ } };
  window.addEventListener('pointerdown', unlock, { once: true, capture: true });
  window.addEventListener('keydown', unlock, { once: true, capture: true });
}

export interface SpeakOpts {
  /** Where the line comes from (for the gap log): 'mirror', 'assess', 'prove-it'. */
  source: string;
  rate?: number;
  /** Called when the line has finished (or could not be said). */
  onend?: () => void;
  /** A line that must not be cut by the next ordinary one (the caller's own rule; here it only raises its priority). */
  protect?: boolean;
}

let endTimer: ReturnType<typeof setTimeout> | null = null;

/** Stop whatever this module is saying (both kinds). */
export function cancelNatural(): void {
  try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* nothing speaking */ }
  if (endTimer) { clearTimeout(endTimer); endTimer = null; }
  try { VoiceKit.stop('player', 0.12); } catch { /* no audio */ }
}

/** Say `text` now (cancelling this module's previous line). */
export function speakNatural(text: string, o: SpeakOpts): void {
  warmBakedVoice();
  cancelNatural();
  // IMPROVE (2026-10-06): the whole line's take, or one take per sentence when the page built the line from recorded parts
  // (bakedLine.ts); a take's `match` covers a page string whose spoken words differ ("130 cm").
  const clips = bakedClipsFor(text, (t) => VoiceKit.findText(t, BAKED_CASTS));
  if (clips && SoundKit.voiceOn && SoundKit.audioRunning) {
    const sec = clips.reduce((a, c) => a + (VoiceKit.line(c)?.sec ?? 2), 0) + 0.05 * (clips.length - 1);
    void VoiceKit.playEx({
      cast: clips[0].split('/')[0], role: 'coach', channel: 'player', clips, caption: text, speaker: 'Coach',
      sec, priority: o.protect ? 2 : 1, interrupt: true, pan: 0, gain: 1,
    }, 'venice').then((r) => {
      if (r === 'played') { endTimer = setTimeout(() => { endTimer = null; o.onend?.(); }, sec * 1000); return; }
      speakTts(text, o);   // the take would not play (no bank audio, a decode error): the browser says it
    });
    return;
  }
  speakTts(text, o);
}

function speakTts(text: string, o: SpeakOpts): void {
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') { o.onend?.(); return; }
  noteTtsLine(o.source, text);
  try {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickTtsVoice(speechSynthesis.getVoices(), (typeof navigator !== 'undefined' && navigator.language) || 'en-US');
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = o.rate ?? 1;
    u.pitch = TTS_PITCH;
    u.onend = () => o.onend?.();
    u.onerror = () => o.onend?.();
    speechSynthesis.speak(u);
  } catch { o.onend?.(); }
}

/** The `Speaker` shape lib/session-setup/voice.ts's speakCues drives (Prove It). */
export function naturalSpeaker(source: string, rate?: number): { cancel(): void; speak(line: string, onend?: () => void): void } {
  return { cancel: cancelNatural, speak: (line, onend) => speakNatural(line, { source, rate, onend }) };
}
