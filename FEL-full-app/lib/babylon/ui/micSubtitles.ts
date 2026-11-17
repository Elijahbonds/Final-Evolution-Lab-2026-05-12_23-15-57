// micSubtitles — the MC's subtitle while his voice plays (hoops-p08, 2026-11-12; lib/babylon/ui/hudHints.ts has the story). Its own
// module so the caption piece (components/games/mic-caption.tsx) reads nothing but this, the feel knob and the browser's storage.
import { feel } from '@/lib/feel-panel/feel';

/** hud.mcSubsWithVoice: 0 = no subtitle under a line the voice is saying (new); 1 = the subtitle on every line, as before. */
export const MC_SUBS_WITH_VOICE = 0;

/** Draw the MC's subtitle? `voiced`: the line's audio started. `ccOn`: the player turned subtitles on. */
export function showMicCaption(voiced: boolean, ccOn: boolean): boolean {
  if (!voiced || ccOn) return true;
  return feel('hud.mcSubsWithVoice', MC_SUBS_WITH_VOICE) >= 0.5;
}

/** The player's subtitle switch (the CC chip), kept on this device. Default off: the voice carries the line. */
export const CC_STORAGE_KEY = 'fel.hud.cc.v1';
export function readCcPref(): boolean {
  try { return typeof localStorage !== 'undefined' && localStorage.getItem(CC_STORAGE_KEY) === '1'; } catch { return false; }
}
export function writeCcPref(on: boolean): void {
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(CC_STORAGE_KEY, on ? '1' : '0'); } catch { /* storage blocked: this page only */ }
}
