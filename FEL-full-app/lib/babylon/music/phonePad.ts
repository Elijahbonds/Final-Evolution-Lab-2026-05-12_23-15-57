// The phone as an MPC — the host's half (the phone's half is lib/controller-link/schemas/padFeel.ts + the controller page).
//
// MUSIC-SUITE P5 (2026-09-25), phone-mpc — owner decision #16: "Phone pad: MPC-style (stays connected across tabs,
// transport, banks, haptic buzz, velocity where supported)". What was wrong before, measured in the code:
//   * THE ROOM DIED ON EVERY TAB SWITCH. StudioMode mounted <HostLobby> inside `{view === 'flip' && …}` (StudioMode.tsx
//     :1650 before this pass), and HostLobby's session effect disposes the HostSession on unmount (host-lobby.tsx
//     :102-118) — so leaving FLIP closed the phone's data channel, and coming back opened a NEW room with a NEW code:
//     the phone was left "Reconnecting…" to a room that no longer existed. The room now opens the first time FLIP shows
//     (phoneRoomOpen — the room did not open a signaling room on every Academy load before, and still doesn't) and lives
//     until the Academy unmounts.
//   * THE PADS ONLY PLAYED ON THE FLIP TAB: a phone hit went to FlipPad's play() through a ref FlipPad fills while it is
//     mounted. From any other tab the room now plays the bank's pad itself (same baked chop, same strip).
//   * NO TRANSPORT, NO BANKS: the schema was sixteen pads. PLAY / STOP / REC and BANK A–D are phone actions now.
//   * A HIT HAD NO VELOCITY (always gain 0.9) and ARRIVED LATE by the network's one-way delay, uncorrected, when ARM REC
//     placed it. Now a measured velocity scales the hit like a grid step's (volume × vel) and is written into the step it
//     records; the tap's time is moved back by half the measured round trip (phoneTapSec) before it is judged (PERFORM)
//     or recorded (ARM REC). Not in an Arena (staked) set: the PHONE answers the pings, so a held-back pong would buy
//     late taps an earlier time the server cannot check — a staked set judges a phone tap as it arrives, as before.

declare global {
  interface Window {
    /** MUSIC-SUITE P5 (phone-mpc): the dev / probe readout of the phone pad (StudioMode writes it on each phone input). */
    __FEL_PHONE__?: {
      hits: number; bank: string; recArm: boolean; phones: number;
      last: { pad: number; velocity: number | null; arrivalSec: number | null; atSec: number | null; rttMs: number | null; view: string; how: string; sentAt: number; arrivedAt: number };
    };
  }
}

/** What one phone action asks the room for. */
export type PhoneCommand =
  | { kind: 'pad'; pad: number; velocity: number | null }
  | { kind: 'transport'; op: 'play' | 'stop' | 'rec' }
  | { kind: 'bank'; bank: number };

export const PHONE_BANKS = ['A', 'B', 'C', 'D'] as const;
export const PHONE_PADS = 16;

/**
 * A velocity the phone MEASURED (padFeel.pressMessage's { v }), 0..1 — or null: no payload, a payload without a finite
 * `v`, or anything else is the fixed pad level. Nothing a phone sends can push a hit past full scale.
 */
export function padVelocity(p: unknown): number | null {
  if (!p || typeof p !== 'object') return null;
  const v = (p as { v?: unknown }).v;
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
}

/** A phone action ('pad_3', 'play', 'bank_B' …) as a command; null = not this room's vocabulary (ignored). */
export function phoneCommand(ev: { a: string; p?: unknown }): PhoneCommand | null {
  const a = typeof ev?.a === 'string' ? ev.a : '';
  const pad = /^pad_(\d{1,2})$/.exec(a);
  if (pad) {
    const i = Number(pad[1]);
    return i >= 0 && i < PHONE_PADS ? { kind: 'pad', pad: i, velocity: padVelocity(ev.p) } : null;
  }
  if (a === 'play' || a === 'stop' || a === 'rec') return { kind: 'transport', op: a };
  const bank = /^bank_([A-D])$/.exec(a);
  if (bank) return { kind: 'bank', bank: PHONE_BANKS.indexOf(bank[1] as (typeof PHONE_BANKS)[number]) };
  return null;
}

/**
 * A phone hit whose chop is still being baked (the first hit after a reload, on a tab without FlipPad) plays only if the
 * bake is done within this long of the hit's arrival; later than that it is dropped (the room says the bank is loading).
 */
export const PHONE_LATE_S = 0.06;

/** A pad hit's gain: the fixed 0.9 it always had, scaled by a measured velocity like a grid step's (AudioEngine playHit). */
export const PAD_GAIN = 0.9;
export function padGain(velocity: number | null | undefined): number {
  return typeof velocity === 'number' && Number.isFinite(velocity) ? PAD_GAIN * Math.max(0, Math.min(1, velocity)) : PAD_GAIN;
}

/**
 * THE ROOM'S LIFETIME: closed until the FLIP tab is first shown (the pairing badge lives there — nothing opened a
 * signaling room on the other tabs before, and nothing does now), then open for as long as the Academy is mounted,
 * whatever tab is showing. A pure latch, so "a tab switch never closes it" is a property of this function (phonePad.test).
 */
export function phoneRoomOpen(open: boolean, view: string): boolean {
  return open || view === 'flip';
}
/** Is the pairing badge shown on this tab? On FLIP always; elsewhere only while a phone is connected (it is still open). */
export function phoneBadgeShown(view: string, phones: number): boolean {
  return view === 'flip' || phones > 0;
}

// ── ROUND TRIP ─────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * The most a phone tap is moved back: half a 100 ms round trip. The host measures rtt itself (host.ts ping every second,
 * `rttMs = now − ping.t` on the pong — host.ts:149), but the PHONE decides when to answer a ping: a pong held back would
 * buy a late tap an earlier time. Capped, a held pong buys at most this much; a phone on the same Wi-Fi measures ~5-40 ms.
 */
export const MAX_ONE_WAY_MS = 50;
/** How many recent round trips the correction reads (their median: one Wi-Fi power-save spike does not move it). */
export const RTT_WINDOW = 8;

/** Add a round-trip sample (ms) to the recent window (null / non-finite / negative = no sample). */
export function pushRtt(win: readonly number[], rttMs: number | null | undefined): number[] {
  if (typeof rttMs !== 'number' || !Number.isFinite(rttMs) || rttMs < 0) return [...win];
  return [...win, rttMs].slice(-RTT_WINDOW);
}
/** The median of the window (null when empty). */
export function medianRtt(win: readonly number[]): number | null {
  if (!win.length) return null;
  const s = [...win].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Half the round trip, in seconds, capped at MAX_ONE_WAY_MS (0 when never measured — a tap is then taken as it arrives). */
export function oneWaySec(rttMs: number | null | undefined): number {
  if (typeof rttMs !== 'number' || !Number.isFinite(rttMs) || rttMs <= 0) return 0;
  return Math.min(rttMs / 2, MAX_ONE_WAY_MS) / 1000;
}
/**
 * When the finger came down, on the audio clock: the time the hit ARRIVED (ctx.currentTime in the input handler) minus the
 * one-way network delay. This is the tap ARM REC places (chopEdit.recordStep, which then takes the player's own output
 * delay off as it does for a screen tap) and free-play PERFORM judges (PerformSet.tap; an Arena set judges the arrival).
 */
export function phoneTapSec(arrivalSec: number, rttMs: number | null | undefined): number {
  return arrivalSec - oneWaySec(rttMs);
}

// ── PERFORM: which phone hits the set judges ─────────────────────────────────────────────────────────────────────────
/**
 * MUSIC-SUITE P5 FIX PASS (2026-09-25): a phone pad hit is a PERFORM tap only where a screen tap or Space is one — a
 * PERFORM set on the STUDIO view (StudioMode's TAP button and its keyboard handler are STUDIO-only). P5 judged every phone
 * hit in PERFORM whatever the view, so a player finger-drumming the pads on FLIP during a set lost accuracy for every
 * off-note hit (performSet counts an EXTRA as a miss; decision #13 wins at 50 %). Before P5 a phone hit never reached the
 * set at all; decision #11's own phone lanes are Phase 6.
 */
export function judgesPhoneTap(s: { mode: string; view: string }): boolean {
  return s.mode === 'perform' && s.view === 'studio';
}

// ── TRANSPORT ──────────────────────────────────────────────────────────────────────────────────────────────────────────
/**
 * What PLAY / STOP / REC do to the room, MPC-style: PLAY starts the transport (the room's own PLAY, count-in and all) and
 * does nothing while it runs (a second PLAY never restarts the bar); STOP stops it and does nothing when stopped; REC
 * toggles ARM REC (taps write into the grid while the transport runs).
 */
export type TransportEffect = 'start' | 'stop' | 'arm' | 'disarm' | null;
export function transportEffect(op: 'play' | 'stop' | 'rec', s: { running: boolean; recArm: boolean }): TransportEffect {
  if (op === 'play') return s.running ? null : 'start';
  if (op === 'stop') return s.running ? 'stop' : null;
  return s.recArm ? 'disarm' : 'arm';
}
