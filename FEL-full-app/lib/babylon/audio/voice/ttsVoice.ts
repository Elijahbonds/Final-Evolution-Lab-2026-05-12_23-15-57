// ttsVoice: when a line has to be spoken by the browser, pick its least robotic voice (VOICEOVER, 2026-10-06).
//
// Owner: "they sound robotic". Three pages speak with the browser's own speech engine (speechSynthesis) because their lines are
// built at run time (a name, a jump in inches, a form cue): the Mirror coach (app/play/mirror/_components/mirror-harness.tsx),
// the Quick Screen (app/play/mirror/assess/_components/use-voice.ts) and Prove It (app/play/dunkduel/_components/prove-it.tsx).
// None of them chose a voice: every utterance took the engine's default, which on many machines is the oldest, most synthetic
// voice installed (eSpeak on Linux/ChromeOS, a "Compact" voice on older Apple devices), and the Mirror lowered its pitch to 0.9,
// which on formant synthesisers is what makes a voice sound like a machine.
//
// This ranks what the device offers: the neural/"Natural"/"Premium"/"Enhanced" voices first, then the good stock voices, never
// a novelty voice; English that matches the page first. Pure: the voice list is handed in.

export interface TtsVoiceLike { name: string; lang: string; localService?: boolean; default?: boolean }

const NEURAL = /\b(natural|neural|premium|enhanced|online|wavenet|studio|journey)\b/i;
const GOOD = /\b(samantha|alex|ava|allison|susan|zoe|evan|nathan|tom|serena|daniel|karen|moira|tessa|aaron|nicky|jenny|aria|guy|libby|sonia|ryan|google)\b/i;
const ROBOTIC = /\b(espeak|zarvox|trinoids|whisper|bad news|good news|bells|boing|bubbles|cellos|wobble|jester|organ|superstar|bahh|albert|fred|junior|ralph|kathy|hysterical|deranged|compact|robot|novelty)\b/i;

/** A voice's score (higher is better); -Infinity: not English, never use. */
export function scoreTtsVoice(v: TtsVoiceLike, lang = 'en-US'): number {
  const vl = (v.lang || '').replace('_', '-').toLowerCase(), want = lang.toLowerCase();
  if (!vl.startsWith(want.slice(0, 2))) return -Infinity;
  let s = 0;
  if (vl === want) s += 2; else if (vl === 'en-gb' || vl === 'en-us') s += 1;
  if (NEURAL.test(v.name)) s += 6;
  if (GOOD.test(v.name)) s += 3;
  if (ROBOTIC.test(v.name)) s -= 10;
  if (v.default) s += 0.5;
  if (v.localService) s += 0.25;   // no network round trip before the first word
  return s;
}

/** The best voice for `lang`, or null (no English voice, or the list has not loaded yet: the engine's default then). */
export function pickTtsVoice<T extends TtsVoiceLike>(voices: readonly T[], lang = 'en-US'): T | null {
  let best: T | null = null, bs = -Infinity;
  for (const v of voices) { const s = scoreTtsVoice(v, lang); if (s > bs) { bs = s; best = v; } }
  return bs === -Infinity ? null : best;
}

/** TUNED (VOICEOVER 2026-10-06): the browser voice speaks at its natural pitch (the Mirror's 0.9 is gone: on a formant voice a
 *  lowered pitch is what reads as "robot") and at the caller's rate (the Mirror keeps 0.96: an athlete across the room). */
export const TTS_PITCH = 1;
