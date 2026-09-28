// MUSIC-SUITE P5 (2026-09-25), phone-mpc — the host's half of the phone pad (phonePad.ts): what each phone action means,
// the room's lifetime across tab switches (the room used to die on every one — StudioMode mounted it inside the FLIP tab),
// and the round-trip correction a phone tap gets before ARM REC records it and PERFORM judges it. The phone's half (the
// velocity rule, the buzz, the controller page left unchanged for every other mode) is lib/controller-link/schemas/
// padFeel.test.ts and components/controller-link/controller-page.test.tsx.
import { describe, expect, it } from 'vitest';
import {
  MAX_ONE_WAY_MS, PAD_GAIN, PHONE_BANKS, RTT_WINDOW, medianRtt, oneWaySec, padGain, padVelocity, phoneBadgeShown, phoneCommand,
  phoneRoomOpen, phoneTapSec, pushRtt, transportEffect, judgesPhoneTap,
} from './phonePad';
import { MODE_CONTROLLERS } from '@/lib/controller-link/schemas/registry';
import { tapStep, type StepClock } from './FlipPad';
import { PerformSet } from './performSet';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('phoneCommand: the music_flip schema is the room vocabulary', () => {
  const actions = MODE_CONTROLLERS.music_flip.schemas.flatMap((s) => (s.kind === 'button' ? s.buttons.map((b) => b.action) : []));

  it('every action the phone offers parses — 16 pads, PLAY / STOP / REC, BANK A–D', () => {
    expect(actions).toHaveLength(16 + 3 + 4);
    for (const a of actions) expect(phoneCommand({ a }), a).not.toBeNull();
    expect(actions.filter((a) => phoneCommand({ a })?.kind === 'pad')).toHaveLength(16);
    expect(actions.map((a) => phoneCommand({ a })).filter((c) => c?.kind === 'bank').map((c) => (c as { bank: number }).bank)).toEqual([0, 1, 2, 3]);
    expect(actions.map((a) => phoneCommand({ a })).filter((c) => c?.kind === 'transport').map((c) => (c as { op: string }).op)).toEqual(['play', 'stop', 'rec']);
  });

  it('keeps the sixteen pads exactly as they were (pad_0 … pad_15, 4 columns) and adds the hints only there', () => {
    const pads = MODE_CONTROLLERS.music_flip.schemas.find((s) => s.kind === 'button' && s.buttons.some((b) => b.action === 'pad_0'));
    expect(pads && pads.kind === 'button' && pads.buttons.map((b) => b.action)).toEqual(Array.from({ length: 16 }, (_, i) => `pad_${i}`));
    expect(pads && pads.kind === 'button' && [pads.columns, pads.haptics, pads.velocity]).toEqual([4, true, true]);
  });

  it('a pad carries the velocity the phone measured, or none (the fixed level)', () => {
    expect(phoneCommand({ a: 'pad_3' })).toEqual({ kind: 'pad', pad: 3, velocity: null });
    expect(phoneCommand({ a: 'pad_3', p: { v: 0.62, via: 'force' } })).toEqual({ kind: 'pad', pad: 3, velocity: 0.62 });
    expect(phoneCommand({ a: 'pad_15', p: { v: 7 } })).toEqual({ kind: 'pad', pad: 15, velocity: 1 });   // clamped, never past full
  });

  it('ignores what is not its vocabulary (other modes\' verbs, out-of-range pads, junk)', () => {
    for (const a of ['A', 'shoot', 'charge:down', 'pad_16', 'pad_-1', 'pad_', 'bank_E', 'bank_a', 'PLAY', '', 'pad_03x']) expect(phoneCommand({ a }), a).toBeNull();
    expect(phoneCommand({ a: 42 as unknown as string })).toBeNull();
  });

  it('padVelocity reads only a finite v, clamped to 0..1', () => {
    expect(padVelocity(undefined)).toBeNull();
    expect(padVelocity(null)).toBeNull();
    expect(padVelocity(0.5)).toBeNull();
    expect(padVelocity({ v: '0.5' })).toBeNull();
    expect(padVelocity({ v: Number.NaN })).toBeNull();
    expect(padVelocity({ v: Infinity })).toBeNull();
    expect(padVelocity({ v: -0.2 })).toBe(0);
    expect(padVelocity({ v: 0.35 })).toBe(0.35);
  });

  it('a hit plays at 0.9 × velocity — the fixed 0.9 when the phone measured none (it was 0.9 for every hit)', () => {
    expect(padGain(null)).toBe(PAD_GAIN);
    expect(padGain(undefined)).toBe(PAD_GAIN);
    expect(padGain(1)).toBeCloseTo(0.9, 12);
    expect(padGain(0.5)).toBeCloseTo(0.45, 12);
    expect(padGain(3)).toBeCloseTo(0.9, 12);
  });
});

describe('the phone room lives across tab switches (it was disposed by every one)', () => {
  const run = (views: string[]): { open: boolean[]; opened: number; closed: number } => {
    let on = false; let opened = 0; let closed = 0;
    const open: boolean[] = [];
    for (const v of views) {
      const next = phoneRoomOpen(on, v);
      if (next && !on) opened++;
      if (!next && on) closed++;
      on = next; open.push(on);
    }
    return { open, opened, closed };
  };

  it('stays closed until FLIP first shows (no signaling room on a STUDIO-only visit — as before)', () => {
    expect(run(['studio', 'library', 'listen', 'studio']).open).toEqual([false, false, false, false]);
  });

  it('opens ONCE on the first FLIP and survives every switch after it', () => {
    const r = run(['studio', 'flip', 'studio', 'library', 'flip', 'listen', 'creator', 'studio', 'flip']);
    expect(r.open).toEqual([false, true, true, true, true, true, true, true, true]);
    expect([r.opened, r.closed]).toEqual([1, 0]);
  });

  it('any sequence of tabs: never closed once open, opened exactly once', () => {
    const tabs = ['studio', 'flip', 'library', 'listen', 'creator'];
    let seed = 7;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let n = 0; n < 200; n++) {
      const views = Array.from({ length: 30 }, () => tabs[Math.floor(rnd() * tabs.length)]);
      const r = run(views);
      expect(r.closed).toBe(0);
      expect(r.opened).toBe(views.includes('flip') ? 1 : 0);
      const first = views.indexOf('flip');
      if (first >= 0) expect(r.open.slice(first).every(Boolean)).toBe(true);
    }
  });

  it('the badge: always on FLIP; on another tab only while a phone is connected (hidden, the room still open)', () => {
    expect(phoneBadgeShown('flip', 0)).toBe(true);
    expect(phoneBadgeShown('studio', 0)).toBe(false);
    expect(phoneBadgeShown('studio', 1)).toBe(true);
    expect(phoneBadgeShown('library', 1)).toBe(true);
  });
});

describe('transport: PLAY / STOP / REC, MPC-style', () => {
  it('PLAY starts a stopped transport and never restarts a running one; STOP is the reverse', () => {
    expect(transportEffect('play', { running: false, recArm: false })).toBe('start');
    expect(transportEffect('play', { running: true, recArm: false })).toBeNull();
    expect(transportEffect('stop', { running: true, recArm: false })).toBe('stop');
    expect(transportEffect('stop', { running: false, recArm: false })).toBeNull();
  });
  it('REC toggles ARM REC whether or not the transport runs', () => {
    expect(transportEffect('rec', { running: false, recArm: false })).toBe('arm');
    expect(transportEffect('rec', { running: true, recArm: true })).toBe('disarm');
  });
  it('the banks are A–D, in order', () => { expect([...PHONE_BANKS]).toEqual(['A', 'B', 'C', 'D']); });
});

describe('round trip: a phone tap is moved back by half the measured round trip', () => {
  it('keeps the last RTT_WINDOW samples and reads their median (one Wi-Fi spike does not move it)', () => {
    let w: number[] = [];
    for (const r of [20, 22, 18, 400, 21, 19, 23, 20]) w = pushRtt(w, r);
    expect(w).toHaveLength(RTT_WINDOW);
    expect(medianRtt(w)).toBe(20.5);
    w = pushRtt(w, 30);
    expect(w).toHaveLength(RTT_WINDOW);
    expect(w[0]).toBe(22);
    expect(pushRtt(w, null)).toEqual(w);
    expect(pushRtt(w, Number.NaN)).toEqual(w);
    expect(pushRtt(w, -5)).toEqual(w);
    expect(medianRtt([])).toBeNull();
    expect(medianRtt([40])).toBe(40);
  });

  it('half the round trip, capped at MAX_ONE_WAY_MS; never measured = no correction', () => {
    expect(oneWaySec(40)).toBeCloseTo(0.02, 12);
    expect(oneWaySec(null)).toBe(0);
    expect(oneWaySec(undefined)).toBe(0);
    expect(oneWaySec(0)).toBe(0);
    expect(oneWaySec(-30)).toBe(0);
    expect(oneWaySec(Number.NaN)).toBe(0);
    expect(oneWaySec(1000)).toBeCloseTo(MAX_ONE_WAY_MS / 1000, 12);   // a held-back pong buys at most 50 ms
    expect(phoneTapSec(10, 40)).toBeCloseTo(9.98, 12);
    expect(phoneTapSec(10, null)).toBe(10);
  });

  // steps every 125 ms from t = 1.000 (120 BPM 16ths), the player's own output delay 0 (so only the network moves the tap)
  const clock = (now: number): StepClock => ({
    now, latencySec: 0, stepSec: 0.125, startSec: 1,
    marks: Array.from({ length: 8 }, (_, i) => ({ step: i, time: 1 + i * 0.125 })),
  });

  it('RECORDED: a finger inside step 0 that ARRIVES in step 1 lands on step 0 (QUANTIZE off)', () => {
    const finger = 1.115, rtt = 40, arrival = finger + rtt / 2000;   // 20 ms one-way: arrives at 1.135, in step 1
    expect(tapStep(clock(arrival), 16, false, -1)).toBe(1);                                   // uncorrected: a step late
    expect(tapStep(clock(arrival), 16, false, -1, phoneTapSec(arrival, rtt))).toBe(0);        // corrected: where the finger was
  });

  it('RECORDED: a finger nearest step 0 that arrives nearest step 1 is written to step 0 (QUANTIZE on)', () => {
    const finger = 1.055, rtt = 30, arrival = finger + rtt / 2000;   // 1.070: 70 ms after step 0, 55 ms before step 1
    expect(tapStep(clock(arrival), 16, true, -1)).toBe(1);
    expect(tapStep(clock(arrival), 16, true, -1, phoneTapSec(arrival, rtt))).toBe(0);
  });

  it('JUDGED: a finger 70 ms after a note is PERFECT once the 25 ms of network is taken off (GOOD without)', () => {
    const finger = 1.07, rtt = 50, arrival = finger + rtt / 2000;
    // a note at 1.000 and two rests after it already scheduled: no later note could be nearer, so a tap is decided at once
    const set = (): PerformSet => { const s = new PerformSet({ arena: false }); s.note(0, 1.0, 0.9); s.rest(1, 1.125, 1.0); s.rest(2, 1.25, 1.1); return s; };
    const raw = set();
    expect(raw.tap(arrival)).toBe('GOOD');
    const fixed = set();
    expect(fixed.tap(phoneTapSec(arrival, rtt))).toBe('PERFECT');
    expect(fixed.lastTap?.errorSec).toBeCloseTo(0.07, 9);
  });
});

// The React half is driven live by scripts/probes/_music-p5-phone-mpc.mts (a real phone page over WebRTC); these pin the
// room's wiring so a later edit cannot quietly put the room back inside the FLIP tab.
describe('the room\'s wiring (source pins)', () => {
  const code = (rel: string): string => readFileSync(join(__dirname, '..', '..', '..', rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const room = code('lib/babylon/music/StudioMode.tsx');
  it('the phone room is mounted at ROOM level (not inside the FLIP tab) once FLIP has shown, and stays', () => {
    const lobby = room.indexOf('<HostLobby ');
    const flipTab = room.indexOf("{view === 'flip' && (");
    expect(lobby).toBeGreaterThan(0);
    expect(room.indexOf('<HostLobby ', lobby + 1)).toBe(-1);                    // one room, not one per tab
    expect(lobby).toBeLessThan(flipTab);
    expect(room).toMatch(/\{phoneRoom && \(\s*<div data-qa="phone-room"[^>]*>\s*<HostLobby config=\{MODE_CONTROLLERS\.music_flip\} collapsed onInput=\{phoneInput\} onPeers=\{phonePeers\} \/>/);
    expect(room).toContain('useEffect(() => { setPhoneRoom((on) => phoneRoomOpen(on, view)); }, [view]);');
  });
  it('the bank and ARM REC are the room\'s; a phone pad is judged in PERFORM at its corrected time; FLIP records through the room', () => {
    expect(room).toContain('bank={flipBank} onBank={setFlipBank} recArm={flipRecArm} onRecArm={setFlipRecArm}');
    expect(room).toContain('atSec: phoneTapSec(arrival, rttMs)');
    // MUSIC-SUITE P5 FIX PASS: only where a screen tap counts (judgesPhoneTap: PERFORM on the STUDIO view)
    expect(room).toContain('if (judgesPhoneTap({ mode: modeRef.current, view }) && hit.atSec !== undefined) performTapAt(hit.atSec);');
    expect(room).toContain('onRecordHit={recordFlipHit} />');
    expect(room).toContain('if (fx === \'start\' || fx === \'stop\') playOrStop(true, fx);');
  });
  it('an Arena (staked) set judges a phone tap as it ARRIVES — a round trip the phone answers is not trusted with a stake', () => {
    expect(room).toContain('if (at === undefined || arenaSet) set.tap(eng.context.currentTime); else set.tap(at);');
  });
});

// MUSIC-SUITE P5 FIX PASS (2026-09-25): a phone pad hit counted as a PERFORM tap on every tab — pads played as an instrument
// on FLIP during a set were judged as EXTRA misses. It counts where a screen tap or Space counts: PERFORM on STUDIO.
describe('which phone hits a PERFORM set judges', () => {
  it('PERFORM on the STUDIO view only — never on FLIP (or any other tab), never in BUILD', () => {
    expect(judgesPhoneTap({ mode: 'perform', view: 'studio' })).toBe(true);
    for (const view of ['flip', 'library', 'creator', 'listen']) expect(judgesPhoneTap({ mode: 'perform', view }), view).toBe(false);
    expect(judgesPhoneTap({ mode: 'build', view: 'studio' })).toBe(false);
  });
});
