// outputPreset: what the game is coming out of (a phone speaker, a TV across the room, headphones) and the mix for it
// (VOICEOVER, 2026-10-06).
//
// Owner: "hard to hear on a TV or phone". One mix cannot serve all three: a phone speaker has no bass and little headroom
// (the lows only eat the limiter), a TV is across a room with people talking (the voice has to sit clearly over the crowd and
// the music), and headphones hear everything (heavy ducking and compression only pump). Each preset sets the voice's own
// trim and presence, the master's high-pass and gentle "glue" compression ahead of the existing safety limiter, and how far the
// music, the effects and the crowd step down under a voice (ducking.ts).
//
// The player picks it (VolumeMixer, the MC switch's panel); until then it is detected (detectOutputPreset). Pure, apart from the
// guarded localStorage read/write at the bottom.

export type OutputPreset = 'phone' | 'tv' | 'headphones';
export const OUTPUT_PRESET_IDS: readonly OutputPreset[] = ['phone', 'tv', 'headphones'];

export interface GlueSpec { threshold: number; knee: number; ratio: number; attack: number; release: number }
export interface PresetSpec {
  label: string;
  hint: string;
  /** The voice over everything else (dB, on the voice chain). */
  voiceTrimDb: number;
  /** A presence lift on the voice (dB at presenceHz): consonants are what make words readable on a small or distant speaker. */
  presenceDb: number;
  presenceHz: number;
  /** High-pass on the voice chain (Hz): the rumble a small speaker cannot play only costs headroom. */
  voiceHpHz: number;
  /** High-pass on the whole mix (Hz). */
  masterHpHz: number;
  /** How far each target steps down while a voice talks (dB). */
  duck: { music: number; sfx: number; crowd: number };
  attack: number;
  release: number;
  /** The gentle compressor before the safety limiter. */
  glue: GlueSpec;
  /** The whole mix's level change after the glue's automatic makeup is taken back out (dB). */
  loudnessDb: number;
}

// TUNED (VOICEOVER 2026-10-06). Today's mix (no preset) is: no voice trim or presence, no high-pass, no glue, the crowd ducked
// -8 dB under the booth only (attack ~0.15 s, release ~0.75 s), music and effects never ducked. Each number's reason:
//   voiceTrimDb  phone +3, tv +3, headphones +1: the voice clearly over the bed on a small or distant speaker; close to today on
//                headphones.
//   presenceDb   phone +3, tv +2, headphones 0 at 3 kHz: intelligibility where the speaker or the room loses the top end.
//   voiceHpHz    phone 160, tv 80, headphones 60. masterHpHz phone 120, tv 35, headphones 20 (off): a phone speaker rolls off
//                below ~150-300 Hz anyway.
//   duck         music 8/7/5, sfx 4/3/2, crowd 9/8/6 dB (phone/tv/headphones). The crowd's 8 on a TV is today's 0.4. Effects only
//                dip a little: they are the game's feedback.
//   attack 0.08 s, release 0.35 / 0.45 / 0.5 s: down before the first word lands (with ducking.LOOKAHEAD), back up in under
//                half a second so the room does not sound like it is holding its breath.
//   glue         phone -22 dB 2.5:1, tv -20 dB 2:1, headphones -14 dB 1.5:1, soft knees: evens out the loud SFX against the
//                voice before the -3 dB limiter has to; loudnessDb phone +4, tv +2, headphones 0 (phones are the quietest).
export const OUTPUT_PRESETS: Readonly<Record<OutputPreset, PresetSpec>> = Object.freeze({
  phone: {
    label: 'PHONE', hint: 'the phone or tablet speaker',
    voiceTrimDb: 3, presenceDb: 3, presenceHz: 3000, voiceHpHz: 160, masterHpHz: 120,
    duck: { music: 8, sfx: 4, crowd: 9 }, attack: 0.08, release: 0.35,
    glue: { threshold: -22, knee: 10, ratio: 2.5, attack: 0.006, release: 0.25 }, loudnessDb: 4,
  },
  tv: {
    label: 'TV', hint: 'a TV or speakers across the room',
    voiceTrimDb: 3, presenceDb: 2, presenceHz: 3000, voiceHpHz: 80, masterHpHz: 35,
    duck: { music: 7, sfx: 3, crowd: 8 }, attack: 0.08, release: 0.45,
    glue: { threshold: -20, knee: 10, ratio: 2, attack: 0.01, release: 0.3 }, loudnessDb: 2,
  },
  headphones: {
    label: 'HEADPHONES', hint: 'headphones or earbuds',
    voiceTrimDb: 1, presenceDb: 0, presenceHz: 3000, voiceHpHz: 60, masterHpHz: 20,
    duck: { music: 5, sfx: 2, crowd: 6 }, attack: 0.08, release: 0.5,
    glue: { threshold: -14, knee: 12, ratio: 1.5, attack: 0.02, release: 0.35 }, loudnessDb: 0,
  },
});

/** TUNED: a rhythm room's song (the Cypher) dips at most this far under the host: a deeper duck would pump the beat the player
 *  is stepping to. */
export const RHYTHM_MUSIC_DUCK_MAX_DB = 3;
/** Courts whose music is a rhythm game's clock. */
export const RHYTHM_COURTS: readonly string[] = ['cypher'];

/** The music duck for a court (capped in rhythm rooms). */
export function musicDuckDb(spec: PresetSpec, court?: string | null): number {
  return court && RHYTHM_COURTS.includes(court) ? Math.min(spec.duck.music, RHYTHM_MUSIC_DUCK_MAX_DB) : spec.duck.music;
}

/**
 * The Web Audio DynamicsCompressor's static curve (dB in -> dB out): straight below the threshold, a knee from the threshold to
 * threshold + knee whose slope eases from 1 to 1/ratio, then 1/ratio. (The spec's knee is exponential; this quadratic matches it
 * at both ends of the knee and to a fraction of a dB inside.)
 */
export function compressorCurveDb(x: number, c: Pick<GlueSpec, 'threshold' | 'knee' | 'ratio'>): number {
  const { threshold: t, knee: k, ratio: r } = c;
  if (x <= t) return x;
  if (k > 0 && x < t + k) { const d = x - t; return x + (1 / r - 1) * (d * d) / (2 * k); }
  const kneeOut = k > 0 ? t + k * (1 + 1 / r) / 2 : t;
  return kneeOut + (x - t - k) / r;
}
/** The automatic makeup gain the spec adds: (1 / curve(0 dBFS))^0.6, in dB. */
export function makeupDb(c: Pick<GlueSpec, 'threshold' | 'knee' | 'ratio'>): number { return -compressorCurveDb(0, c) * 0.6; }
/** The gain after the glue (dB) that takes its makeup back out and lands the preset's intended loudness change. */
export function glueTrimDb(spec: PresetSpec): number { return spec.loudnessDb - makeupDb(spec.glue); }

export interface DeviceHints { ua?: string; coarsePointer?: boolean; touchPoints?: number; screenW?: number; screenH?: number }

const TV_UA = /\b(SmartTV|SMART-TV|Tizen|Web0S|webOS|NetCast|BRAVIA|AFT[A-Z]|CrKey|GoogleTV|Android TV|AppleTV|HbbTV|Roku|Xbox|PlayStation|Nintendo)\b/i;

/**
 * The preset to start with when the player has not picked one. assumption: a TV browser or a console says so in its user agent;
 * a touch-first device with a phone/tablet-sized screen plays through its own speaker; everything else (a laptop or desktop,
 * often on a TV or speakers) gets 'tv'. Headphones cannot be detected from a web page, so they are never the guess.
 */
export function detectOutputPreset(h: DeviceHints): OutputPreset {
  if (h.ua && TV_UA.test(h.ua)) return 'tv';
  const short = Math.min(h.screenW ?? Infinity, h.screenH ?? Infinity);
  if (h.coarsePointer && (h.touchPoints ?? 0) > 0 && short <= 1100) return 'phone';
  return 'tv';
}

export const OUTPUT_KEY = 'fel-audio-output';
export const isPreset = (v: unknown): v is OutputPreset => typeof v === 'string' && (OUTPUT_PRESET_IDS as readonly string[]).includes(v);

/** The player's saved pick, or null (never picked: detect). Never throws. */
export function loadOutputPreset(): OutputPreset | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = (JSON.parse(localStorage.getItem(OUTPUT_KEY) ?? '{}') as { preset?: unknown }).preset;
    return isPreset(v) ? v : null;
  } catch { return null; }
}
/** Save the pick (null: back to detecting). */
export function saveOutputPreset(p: OutputPreset | null): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(OUTPUT_KEY, JSON.stringify(p ? { preset: p } : {})); }
  catch { /* private mode: the pick lasts the page */ }
}
/** This browser's hints (guarded: none on the server). */
export function browserHints(): DeviceHints {
  try {
    if (typeof window === 'undefined') return {};
    return {
      ua: navigator.userAgent,
      coarsePointer: typeof window.matchMedia === 'function' ? window.matchMedia('(pointer: coarse)').matches : undefined,
      touchPoints: navigator.maxTouchPoints,
      screenW: window.screen?.width, screenH: window.screen?.height,
    };
  } catch { return {}; }
}
