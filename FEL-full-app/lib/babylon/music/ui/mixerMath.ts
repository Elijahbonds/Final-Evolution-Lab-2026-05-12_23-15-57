// lib/babylon/music/ui/mixerMath.ts — THE MIXER'S READOUTS, pure: how a meter fills, when a clip light comes on and how
// long it holds, and the words on a strip. MixerStrip.tsx draws them from AudioEngine.meters() (mixGraph.ts).
//
// MUSIC-SUITE P4 (2026-09-25), "Pocket studio + melody". There was no mixer and no meter (understand-wf_3a55346f-032.json
// problems[16]); the engine lane built the desk (mixGraph.ts: per-row fader / pan / mute-solo gate / room + slap sends, a
// limiter, analyser taps). What a player needs to SEE of it:
//   * A PEAK METER per strip and on the master, in dBFS from METER_FLOOR_DB (−60) to 0.
//   * A CLIP LIGHT. The master can't clip any more — the limiter and the −0.3 dBFS ceiling hold every render and the
//     speakers under full scale (mixGraph CEILING) — so the master's light says THE MIX WOULD HAVE CLIPPED: the limiter
//     is pulling ≥ 1.5 dB (LIMIT_CLIP_DB: with its threshold at −1.5 dBFS and ratio 20 that is a bus peak at about full
//     scale), or the ceiling itself is acting (a peak within 0.1 dB of it). The meter after the limiter reads about −2 dBFS
//     at most, so a light keyed on that peak alone would almost never come on (measured: scripts/probes/_music-p4-grid.mts).
//     A strip's light is a true over: its tap is BEFORE the bus, so a row at fader 1.5 with loud hits can pass 0 dBFS
//     there (it is caught later, but it is the row to turn down). A light holds CLIP_HOLD_MS after the last over.
//   * The limiter's pull (MeterReadout.limiterDb, ≤ 0) as "LIMIT −3.1 dB" on the master.

import { CEILING_DBFS, toDb } from '../mixGraph';

/** The meter's floor: quieter than this reads empty. */
export const METER_FLOOR_DB = -60;
/** How long a clip light stays on after the last over. */
export const CLIP_HOLD_MS = 1500;
/** The master's light: within 0.1 dB of the ceiling (the limiter + ceiling are holding the level). */
export const MASTER_CLIP_DB = CEILING_DBFS - 0.1;
/** A strip's light: a true over, 0 dBFS, at its (pre-bus) tap. */
export const STRIP_CLIP_DB = 0;
/** The master's light also comes on while the limiter pulls at least this much (≤ 0 dB): the bus reached full scale. */
export const LIMIT_CLIP_DB = -1.5;

/** Would the master have clipped? The ceiling acting, or the limiter pulling ≥ 1.5 dB. */
export function masterOver(peakLin: number, limiterDb: number): boolean {
  return toDb(Math.abs(peakLin)) >= MASTER_CLIP_DB || (Number.isFinite(limiterDb) && limiterDb <= LIMIT_CLIP_DB);
}

/** How full a meter is, 0..1, for a linear peak: −60 dBFS (or silence) empty, 0 dBFS full. */
export function meterFill(peakLin: number): number {
  const db = toDb(Math.abs(peakLin));
  if (db <= METER_FLOOR_DB) return 0;
  return Math.min(1, (db - METER_FLOOR_DB) / -METER_FLOOR_DB);
}

/** When a clip light goes out: a peak at or over `clipDb` re-arms it for CLIP_HOLD_MS from `now`; otherwise it keeps its time. */
export function clipUntil(prevUntil: number, peakLin: number, now: number, clipDb: number, holdMs = CLIP_HOLD_MS): number {
  return overUntil(prevUntil, toDb(Math.abs(peakLin)) >= clipDb, now, holdMs);
}
/** The same for any "over" (the master's masterOver). */
export function overUntil(prevUntil: number, over: boolean, now: number, holdMs = CLIP_HOLD_MS): number {
  return over ? now + holdMs : prevUntil;
}
/** Is the light on at `now`? */
export function clipLit(until: number, now: number): boolean { return now < until; }

/** '−12.3 dB', '−∞' for silence (under the floor). */
export function dbLabel(peakLin: number): string {
  const db = toDb(Math.abs(peakLin));
  if (db <= METER_FLOOR_DB) return '−∞';
  const r = Math.round(db * 10) / 10;
  return r < 0 ? `−${(-r).toFixed(1)} dB` : `${r.toFixed(1)} dB`;
}

/** 'LIMIT −3.1 dB' while the limiter pulls ≥ 0.1 dB; '' otherwise. */
export function limiterLabel(limiterDb: number): string {
  if (!Number.isFinite(limiterDb) || limiterDb > -0.1) return '';
  return `LIMIT −${(-limiterDb).toFixed(1)} dB`;
}

/** A pan knob's words: 'C', 'L 30', 'R 100'. */
export function panLabel(pan: number): string {
  const n = Math.round(Math.max(-1, Math.min(1, pan)) * 100);
  return n === 0 ? 'C' : n < 0 ? `L ${-n}` : `R ${n}`;
}
/** A fader's words: '+2.0 dB', '0.0 dB', '−6.0 dB', '−∞' at 0. */
export function faderLabel(gain: number): string {
  if (!(gain > 0)) return '−∞';
  const db = Math.round(20 * Math.log10(gain) * 10) / 10;
  return db > 0 ? `+${db.toFixed(1)} dB` : db < 0 ? `−${(-db).toFixed(1)} dB` : '0.0 dB';
}
/** A send's words: '0 %' … '100 %'. */
export function sendLabel(v: number): string { return `${Math.round(Math.max(0, Math.min(1, v)) * 100)} %`; }

// ── MUSIC-SUITE P4 FIX PASS (2026-09-25): a phone fader moves only from a sideways drag ─────────────────────────────────
// The review, 375 × 812 with touch: open the mixer, expand the first strip, then a 200 px upward finger SCROLL starting on
// the VOL track — gain 1 → 0.26 (≈ −11.7 dB) while the page scrolled 950 → 1210: a full-width <input type=range> jumps to
// the finger on touch-down (Chromium's mobile emulation; assumption: Android Chrome alike, iOS range tracks don't jump),
// and every strip's sliders and the master LEVEL sit on the phone's scroll path. On the phone layout a fader is driven
// by the room (MixerStrip Fader): a touch does nothing until it is a sideways drag (dragIntent), a vertical one is left to
// the browser's scroll, and the value follows the finger's x on the track (faderValueAt). The input stays for the keys.

/** How far (px) a touch moves before its intent is read, and how much more sideways than up / down a fader drag must be. */
export const DRAG_DECIDE_PX = 8;
export const DRAG_SIDEWAYS_RATIO = 1.5;
/** What a touch that has moved (dx, dy) from its down is: a FADER drag, a SCROLL, or not decided yet. */
export function dragIntent(dx: number, dy: number): 'fader' | 'scroll' | 'wait' {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return 'wait';
  if (ax >= DRAG_DECIDE_PX && ax >= DRAG_SIDEWAYS_RATIO * ay) return 'fader';
  if (ay >= DRAG_DECIDE_PX) return 'scroll';
  return 'wait';
}
/** The fader value under x on a track spanning [left, left + width): clamped to [min, max], on `step`. */
export function faderValueAt(x: number, track: { left: number; width: number }, min: number, max: number, step: number): number {
  const w = track.width > 0 ? track.width : 1;
  const f = Math.max(0, Math.min(1, (x - track.left) / w));
  const raw = min + f * (max - min);
  const snapped = step > 0 ? Math.round((raw - min) / step) * step + min : raw;
  return Math.max(min, Math.min(max, Math.round(snapped * 1e6) / 1e6));
}
