// lib/session-player/speaker.ts — PLAT-P01 (2026-10-27): the player's voice in a browser.
//
// Words go through lib/babylon/audio/voice/speakNatural.ts (a rendered Coach take where the bank has the line, else the
// device's least robotic voice). The go / rest takes are picked by lib/drills/drillVoice.ts DrillVoice (read-only) from the
// Coach bank's index (VoiceKit.loadIndex: the ~34 KB index only; the audio comes the first time a take plays). The rest's
// last seconds are a short tone through Web Audio — no file, no dependency. Every piece is loaded on first use and fails
// silent: the screen carries the session on its own.
//
// Browser-only.
import type { CoachPrompt } from '@/lib/drills/chart';
import type { TakePicker, VoiceOut } from './voice';

/** Tone length and pitch for the rest's last-seconds tick; the last one is higher (the set is about to start). (new) */
export const TICK_MS = 90;
export const TICK_HZ = 880;
export const TICK_LAST_HZ = 1320;

export interface BrowserVoice { out: VoiceOut; take: TakePicker }

export function browserVoice(source = 'session-player'): BrowserVoice {
  let say: ((text: string) => void) | null = null;
  let cancel: (() => void) | null = null;
  let pick: ((m: CoachPrompt) => { text: string } | null) | null = null;
  let ctx: AudioContext | null = null;

  void (async () => {
    try {
      const [{ speakNatural, cancelNatural, warmBakedVoice }, { DrillVoice }, { VoiceKit }] = await Promise.all([
        import('@/lib/babylon/audio/voice/speakNatural'),
        import('@/lib/drills/drillVoice'),
        import('@/lib/babylon/audio/mic/VoiceKit'),
      ]);
      warmBakedVoice();
      say = (text) => speakNatural(text, { source });
      cancel = cancelNatural;
      const dv = new DrillVoice();
      const idx = await VoiceKit.loadIndex([{ cast: 'coach', group: 'coach' }]).catch(() => []);
      for (const b of idx) dv.load(b.lines);
      pick = (m) => dv.pick(m);
    } catch { /* no voice here: the screen carries it */ }
  })();

  const tone = (hz: number) => {
    try {
      const AC = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
        ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      ctx ??= new AC();
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = hz;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + TICK_MS / 1000);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + TICK_MS / 1000 + 0.02);
    } catch { /* no Web Audio */ }
  };

  return {
    out: {
      say: (text) => say?.(text),
      tick: (left) => tone(left <= 1 ? TICK_LAST_HZ : TICK_HZ),
      cancel: () => { try { cancel?.(); } catch { /* nothing speaking */ } },
    },
    take: (m) => pick?.(m) ?? null,
  };
}
