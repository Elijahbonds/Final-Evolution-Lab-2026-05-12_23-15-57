// THE SLAM PRESS, DRIVEN (HOTFIX 2026-09-24). The real InputBus, fed the keyboard, a pad, the touch overlay and Controller Link
// the way a player plays them, into the pure cores both dunk modes run: TakeoffEcho + SlamLatch (DunkMode), TakeoffEcho +
// FirstPress (DunkDuelMode).
//
// What broke: on the keyboard the take-off is letting go of Space, and InputBus sends that keyup as `trigger R 0` and then,
// in the same instant, `button A pressed`. The R 0 launched the flight and the A landed in it as the attempt's FIRST press —
// held, refused at the window, and the player's J on NOW! came back spent. Every keyboard dunk clanked in the duel, and
// the contest refused TOO EARLY on a slam nobody pressed. The first cut of the fix guessed the Space's A from the R stream,
// which an idle pad, the touch RUN hold and Controller Link write to as well; the bus TAGS it now (`src: 'space'`).
//
// The modes are Babylon scenes and do not run here. Each "flight" below is the modes' onInput ORDER (anchored, and pinned by
// modes/dunkSlamPress.test.ts) around the REAL cores, on one fake clock that InputBus reads too.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { InputBus, type FelInput } from './InputBus';
import { KEY_SPACE_DOWN } from './StartWake';
import { SlamLatch, TakeoffEcho, TAKEOFF_ECHO_MS, LATE_JUMP_MS, type LaunchCause, type TakeoffEchoKind } from './slamPress';
import { FirstPress, PRESS_GRACE, type PressVerdict } from './timingPress';
import { EASTBAY_TIMING } from '../anim/authored/timing';
import { arcTopT, slamBufferSec, ARC_TOP_FRAC } from './DunkLegs';

// ── the window, as both modes draw it (TV factor 1, no style taps) ──────────────────────────────────────────────────
const QTE = 0.28;                                        // modeConfigs.ts DUNK_CONFIG.qteWindowSec
const CENTRE = EASTBAY_TIMING.extend;
const OPEN = CENTRE - QTE / 2, CLOSE = CENTRE + QTE / 2;
const HOLD = slamBufferSec(OPEN, arcTopT(CENTRE, ARC_TOP_FRAC), 0.22);   // DunkMode: SLAM_BUFFER_SEC 0.22, SLAM_APEX_T
const W = { centre: CENTRE, width: QTE };
const DUEL_SLAM_FROM = OPEN - PRESS_GRACE;               // DunkDuelMode SLAM_FROM

// ── one clock for everything: InputBus's Space depth and the modes' performance.now() ──────────────────────────────
let now = 0;

// ── the browser, stubbed (InputBus.keyboard.test.ts / InputBus.multi.test.ts) ─────────────────────────────────────────
type FakePad = { id: string; index: number; mapping: string; connected: boolean; axes: number[]; buttons: { pressed: boolean; value: number }[] };
const pads: (FakePad | null)[] = [null, null, null, null];
const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let keyHandler: ((ev: { key: string; type: string; preventDefault: () => void }) => void) | null = null;

beforeEach(() => {
  for (const k of ['window', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame']) saved[k] = g[k];
  keyHandler = null; pads.fill(null); now = 0;
  g.window = { addEventListener: (type: string, fn: unknown) => { if (type === 'keydown') keyHandler = fn as typeof keyHandler; }, removeEventListener: () => {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 0, getGamepads: () => pads } });
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => {};
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  vi.spyOn(console, 'info').mockImplementation(() => {});   // the bus's [PAD] lines
});
afterEach(() => {
  vi.restoreAllMocks();
  for (const k of ['window', 'requestAnimationFrame', 'cancelAnimationFrame']) g[k] = saved[k];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: saved.navigator });
});

/** A mode's flight around the real cores. `launch()` is the mode's own launch (the run reached the line). */
interface Flight {
  onInput(e: FelInput): void;
  launch(): void;
  /** One update: the window's opening frame judges the press it was holding. */
  frame(): void;
  readonly out: { slamAt: number | null; hit: PressVerdict | null; refusedEarlyMs: number | null; spent: number; echoes: TakeoffEchoKind[] };
  readonly launched: boolean;
  readonly launchMs: number;
}
/** `launchHitchMs`: how long launchDunk's own work takes (a first launch loading its clips). */
interface FlightOpts { launchHitchMs?: number }

/** DunkMode.onInput (DunkMode.ts ~1187-1450) and its window block (~1853): see → A on the run → echo → airButton → R2 → the
 *  in-window slam. airButton's bare A is bufferSlam (a take-off / late echo is dropped there). launchDunk stamps LAST. */
function dunkFlight(o: FlightOpts = {}): Flight {
  const echo = new TakeoffEcho(), latch = new SlamLatch();
  let phase: 'approach' | 'charge' | 'cinematic' = 'approach', launchAt = 0, wasOpen = false;
  const out: Flight['out'] = { slamAt: null, hit: null, refusedEarlyMs: null, spent: 0, echoes: [] };
  const clip = () => (now - launchAt) / 1000;   // 1:1 here: the hang's slow-mo moves the arc, not which press is taken
  const open = () => phase === 'cinematic' && clip() >= OPEN && clip() <= CLOSE;
  const cueOn = () => phase === 'cinematic' && clip() >= OPEN - HOLD && clip() <= CLOSE;   // slamCueOn (no lob)
  const launch = (cause: LaunchCause) => {
    if (phase === 'cinematic') return;
    phase = 'cinematic'; launchAt = now; latch.clear(); wasOpen = false;
    now += o.launchHitchMs ?? 0;                 // the rest of launchDunk
    echo.launched(now, cause);
  };
  return {
    out, launch: () => launch('auto'),
    get launched() { return phase === 'cinematic'; },
    get launchMs() { return launchAt; },
    onInput(e) {
      echo.see();
      const A = e.t === 'button' && e.btn === 'A' && e.pressed;
      if (A && phase === 'charge') launch('press');                              // A on the run is the take-off
      const echoA = phase === 'cinematic' ? echo.of(e, now, cueOn()) : null;
      if (echoA) out.echoes.push(echoA);
      if (A && phase === 'cinematic' && !open() && echoA !== 'space') {         // airButton(ctx, e, echoA !== null)
        if (echoA === null && latch.press(clip(), false) === 'spent') out.spent++;   // bufferSlam (an echo is dropped first)
      }
      if (e.t === 'trigger' && e.side === 'R') {
        if (phase === 'approach' && e.value > 0.02) phase = 'charge';             // beginRun
        if (phase === 'charge' && e.value === 0) launch('press');                 // RUN let go
      }
      if (A && open() && !echoA) { if (latch.press(clip(), true) === 'spent') out.spent++; else out.slamAt = clip(); }
    },
    frame() {
      const isOpen = open();
      if (isOpen && !wasOpen) {
        const h = latch.open(OPEN, HOLD);
        if (h && 'slamAt' in h) out.slamAt = h.slamAt;
        else if (h) out.refusedEarlyMs = Math.round(h.tooEarlySec * 1000);
      }
      wasOpen = isOpen;
    },
  };
}

/** DunkDuelMode.onInput (DunkDuelMode.ts ~642-705) and its window block (~805): see → R2 → A on the run → the flight's A through
 *  TakeoffEcho and FirstPress. */
function duelFlight(o: FlightOpts = {}): Flight {
  const echo = new TakeoffEcho(), first = new FirstPress();
  let phase: 'approach' | 'charge' | 'cinematic' = 'approach', launchAt = 0, wasOpen = false;
  const out: Flight['out'] = { slamAt: null, hit: null, refusedEarlyMs: null, spent: 0, echoes: [] };
  const clip = () => (now - launchAt) / 1000;
  const launch = (cause: LaunchCause) => {
    if (phase === 'cinematic') return;
    phase = 'cinematic'; launchAt = now; first.clear(); wasOpen = false;
    now += o.launchHitchMs ?? 0;
    echo.launched(now, cause);
  };
  return {
    out, launch: () => launch('auto'),
    get launched() { return phase === 'cinematic'; },
    get launchMs() { return launchAt; },
    onInput(e) {
      echo.see();
      if (e.t === 'trigger' && e.side === 'R') {
        if (phase === 'approach' && e.value > 0.02) phase = 'charge';
        if (phase === 'charge' && e.value === 0) launch('press');
      }
      if (e.t === 'button' && e.btn === 'A' && e.pressed && phase === 'charge') launch('press');   // A on the run (HOTFIX)
      if (e.t === 'button' && e.btn === 'A' && e.pressed && phase === 'cinematic') {
        const k = echo.of(e, now, clip() >= DUEL_SLAM_FROM);
        if (k) { out.echoes.push(k); return; }
        const v = first.press(clip(), W);
        if (v === 'spent') out.spent++;
        else if (v !== 'held' && v.hit) { out.hit = v; out.slamAt = clip(); }
      }
    },
    frame() {
      const isOpen = phase === 'cinematic' && clip() >= OPEN && clip() <= CLOSE;
      if (isOpen && !wasOpen) {
        const early = first.open(W);
        if (early?.hit && !out.hit) { out.hit = early; out.slamAt = first.pressedAt; }
        if (early && !early.hit) out.refusedEarlyMs = Math.round((OPEN - (first.pressedAt ?? 0)) * 1000);
      }
      wasOpen = isOpen;
    },
  };
}

/** The real InputBus, wired to a flight. `at(ms)` moves the clock one 16 ms frame at a time: the bus polls (the pad, the
 *  Space's depth), then the mode updates. */
function rig(f: Flight) {
  const bus = new InputBus();
  const seen: FelInput[] = [];
  bus.on((e) => { seen.push(e); f.onInput(e); });
  bus.start();
  const poll = () => (bus as unknown as { pollPads: () => void }).pollPads();
  const at = (ms: number) => { while (now < ms) { now = Math.min(ms, now + 16); poll(); f.frame(); } };
  const key = (k: string, down = true) => keyHandler!({ key: k, type: down ? 'keydown' : 'keyup', preventDefault: () => {} });
  const tap = (k: string) => { key(k); key(k, false); };
  return { bus, seen, at, key, tap, poll };
}
function pad(): FakePad {
  const p: FakePad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD)', index: 0, mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  pads[0] = p;
  return p;
}
const btn = (p: FakePad, i: number, v: number) => { p.buttons[i] = { pressed: v > 0.5, value: v }; };
const A_BTN = 0, R2_BTN = 7;
/** Flight-clock seconds → app ms, for a flight launched at `launchMs`. */
const flightMs = (launchMs: number, clip: number) => launchMs + clip * 1000;
/** A pad A tapped so that the poll AT `ms` carries it. */
const padTapAt = (r: ReturnType<typeof rig>, p: FakePad, ms: number) => { r.at(ms - 16); btn(p, A_BTN, 1); r.at(ms); btn(p, A_BTN, 0); r.at(now + 16); };
/** TouchOverlay's SLAM: the SAME object on every tap (modeVerbs' `emit`), straight into the bus. */
const TOUCH_SLAM: FelInput = { t: 'button', btn: 'A', pressed: true };

const MODES: [string, (o?: FlightOpts) => Flight][] = [['DunkMode', dunkFlight], ['DunkDuelMode', duelFlight]];

// ── the cores, on their own ─────────────────────────────────────────────────────────────────────────────────────────
describe('TakeoffEcho — whose A it is', () => {
  const A: FelInput = { t: 'button', btn: 'A', pressed: true };
  const SPACE_A: FelInput = { t: 'button', btn: 'A', pressed: true, src: 'space' };
  it("the Space's A is known by its TAG, not by the R stream around it", () => {
    const t = new TakeoffEcho();
    t.see(); expect(t.of(SPACE_A, 900)).toBe('space');
    t.see(); expect(t.of(SPACE_A, 900, true)).toBeNull();     // once a slam counts, letting go of Space IS one
    t.see(); expect(t.of(A, 900)).toBeNull();                 // J, untagged, is the player's
  });
  it('an untagged A just after an R 0 (a touch RUN let go, Controller Link, a pad) is the player’s', () => {
    const t = new TakeoffEcho();
    t.launched(0, 'auto');
    t.see(); t.see();                                        // …the R 0, then the A, 1 s into the flight
    expect(t.of(A, 1000)).toBeNull();
  });
  it('the A that launched is the take-off’s however long the launch took (a first-launch hitch)', () => {
    const t = new TakeoffEcho();
    t.see();
    t.launched(0, 'press');
    expect(t.of(A, 500)).toBe('takeoff');                     // the same input: no clock involved
    t.see();
    expect(t.of(A, 500)).toBeNull();                          // the next input is not
  });
  it(`after the player's own launch, an A inside ${TAKEOFF_ECHO_MS} ms is the take-off's; one after it is a real press`, () => {
    const t = new TakeoffEcho();
    t.launched(1000, 'press');
    for (const ms of [1000, 1040, 1000 + TAKEOFF_ECHO_MS - 1]) { t.see(); expect(t.of(A, ms), `+${ms - 1000}`).toBe('takeoff'); }
    for (const ms of [1000 + TAKEOFF_ECHO_MS, 1150, 1500]) { t.see(); expect(t.of(A, ms), `+${ms - 1000}`).toBeNull(); }
  });
  it(`after the LINE launched the run, the first A inside ${LATE_JUMP_MS} ms is the jump pressed late — once`, () => {
    const t = new TakeoffEcho();
    t.launched(1000, 'auto'); t.see();
    expect(t.of(A, 1150)).toBe('late');
    t.see(); expect(t.of(A, 1200)).toBeNull();                // a second tap is a press
    const u = new TakeoffEcho();
    u.launched(1000, 'auto'); u.see();
    expect(u.of(A, 1000 + LATE_JUMP_MS)).toBeNull();          // past the reaction: a real (early) press
    const v = new TakeoffEcho();
    v.launched(1000, 'auto'); v.see();
    expect(v.of(A, 1030)).toBe('takeoff');                    // pressed with the line: that WAS the jump press…
    v.see(); expect(v.of(A, 1150)).toBeNull();                // …so the next one is not owed
  });
  it('only an A press is ever an echo', () => {
    const t = new TakeoffEcho();
    t.launched(0, 'auto');
    t.see(); expect(t.of({ t: 'button', btn: 'B', pressed: true }, 10)).toBeNull();
    t.see(); expect(t.of({ t: 'button', btn: 'A', pressed: false }, 10)).toBeNull();
  });
});

describe("SlamLatch — DunkMode's rule, unchanged: the first A decides", () => {
  it('in the window it slams on the spot; anything after is spent', () => {
    const l = new SlamLatch();
    expect(l.press(CENTRE, true)).toBe('slam');
    expect(l.press(CENTRE + 0.02, true)).toBe('spent');
    expect(l.open(OPEN, HOLD)).toBeNull();
  });
  it('a press inside the buffer is held and fires from WHEN IT WAS PRESSED; one earlier is too early by how far', () => {
    const inBuf = new SlamLatch();
    expect(inBuf.press(OPEN - HOLD / 2, false)).toBe('held');
    expect(inBuf.waiting).toBe(OPEN - HOLD / 2);
    expect(inBuf.open(OPEN, HOLD)).toEqual({ slamAt: OPEN - HOLD / 2 });
    const early = new SlamLatch();
    early.press(0.5, false);
    const v = early.open(OPEN, HOLD);
    expect(v && 'tooEarlySec' in v ? v.tooEarlySec : NaN).toBeCloseTo(OPEN - 0.5, 9);
    expect(early.press(CENTRE, true)).toBe('spent');           // the first press decided
  });
  it('the hold is measured from the window edge (a press right at the reach still fires)', () => {
    const l = new SlamLatch();
    l.press(OPEN - HOLD, false);
    expect(l.open(OPEN, HOLD)).toEqual({ slamAt: OPEN - HOLD });
  });
  it('clears for the next attempt', () => {
    const l = new SlamLatch();
    l.press(0.3, false); l.clear();
    expect(l.committed).toBe(false);
    expect(l.open(OPEN, HOLD)).toBeNull();
    expect(l.press(CENTRE, true)).toBe('slam');
  });
});

// ── the real InputBus, the keyboard ───────────────────────────────────────────────────────────────────────────────
describe.each(MODES)('%s on the KEYBOARD (Space = RUN, J = JUMP on the run and SLAM in the air)', (_name, make) => {
  it("the bus sends the Space release as R 0 and then the Space's tagged A, in the same instant", () => {
    const r = rig(make());
    r.key(' '); r.at(600); r.key(' ', false);
    const i = r.seen.findIndex((e) => e.t === 'trigger' && e.value === 0);
    expect(r.seen.slice(i, i + 2)).toEqual([{ t: 'trigger', side: 'R', value: 0 }, { t: 'button', btn: 'A', pressed: true, src: 'space' }]);
  });

  it('Space down, run, Space up to take off, J on the beat: the J is the slam, and it scores', () => {
    const f = make(), r = rig(f);
    r.key(' '); r.at(700);
    r.key(' ', false);                                         // take-off
    expect(f.launched).toBe(true);
    r.at(flightMs(f.launchMs, CENTRE)); r.tap('j');            // NOW!
    expect(f.out.echoes).toEqual(['space']);                  // the release's own A never reached the slam
    expect(f.out.spent).toBe(0);
    expect(f.out.slamAt).toBeCloseTo(CENTRE, 9);
    expect(f.out.refusedEarlyMs).toBeNull();
    if (f.out.hit) expect(f.out.hit.kind).toBe('clean');       // the duel's verdict
  });

  it('…and with an idle pad plugged in: the run holds until Space comes up, and the J on the beat scores (review probe)', () => {
    const f = make(), r = rig(f);
    pad();                                                     // plugged in, never touched
    r.key(' '); r.at(700);
    expect(f.launched).toBe(false);                            // the pad's R 0 used to launch ~50 ms in (InputBus HOTFIX)
    r.key(' ', false);
    expect(f.launched).toBe(true);
    expect(f.launchMs).toBe(700);
    r.at(flightMs(f.launchMs, CENTRE)); r.tap('j');
    expect(f.out.echoes).toEqual(['space']);
    expect(f.out.spent).toBe(0);
    expect(f.out.refusedEarlyMs).toBeNull();
    expect(f.out.slamAt).toBeCloseTo(CENTRE, 9);
  });

  it('a slow first launch (120 ms of clip loading) does not turn the Space’s A into the slam', () => {
    const f = make({ launchHitchMs: 120 }), r = rig(f);
    r.key(' '); r.at(700); r.key(' ', false);
    r.at(flightMs(f.launchMs, CENTRE)); r.tap('j');
    expect(f.out.echoes).toEqual(['space']);
    expect(f.out.refusedEarlyMs).toBeNull();
    expect(f.out.slamAt).toBeCloseTo(CENTRE, 9);
  });

  it('a real early J is still the slam, still refused at the window — and the J on the beat after it is spent', () => {
    const f = make(), r = rig(f);
    r.key(' '); r.at(700); r.key(' ', false);
    r.at(flightMs(f.launchMs, 0.5)); r.tap('j');               // a real press, 0.6 s before the window
    r.at(flightMs(f.launchMs, CENTRE)); r.tap('j');
    expect(f.out.echoes).toEqual(['space']);
    expect(f.out.refusedEarlyMs).toBe(Math.round((OPEN - 0.5) * 1000));
    expect(f.out.slamAt).toBeNull();
    expect(f.out.hit).toBeNull();
    expect(f.out.spent).toBe(1);
  });

  it('J on the run is the jump (as the hint says): it takes off, the Space let go mid-air is the run key, the J on the beat scores', () => {
    const f = make(), r = rig(f);
    r.key(' '); r.at(700);
    r.tap('j');                                                // "tap jump"
    expect(f.launched).toBe(true);
    r.at(flightMs(f.launchMs, 0.3)); r.key(' ', false);
    r.at(flightMs(f.launchMs, CENTRE)); r.tap('j');
    expect(f.out.echoes).toEqual(['takeoff', 'space']);
    expect(f.out.spent).toBe(0);
    expect(f.out.slamAt).toBeCloseTo(CENTRE, 9);
  });

  it('Space held to the line (the run launches itself), let go in the air: the release is not the slam, the J on the beat is', () => {
    const f = make(), r = rig(f);
    r.key(' '); r.at(1200);
    f.launch();                                                // the line
    r.at(flightMs(f.launchMs, 0.4)); r.key(' ', false);        // the run key comes up mid-air
    r.at(flightMs(f.launchMs, CENTRE)); r.tap('j');
    expect(f.out.echoes).toEqual(['space']);
    expect(f.out.spent).toBe(0);
    expect(f.out.slamAt).toBeCloseTo(CENTRE, 9);
    expect(f.out.refusedEarlyMs).toBeNull();
  });

  it('Space held to the line and let go ON the beat still slams — as it did before the hotfix', () => {
    const f = make(), r = rig(f);
    r.key(' '); r.at(1200);
    f.launch();
    r.at(flightMs(f.launchMs, CENTRE)); r.key(' ', false);
    expect(f.out.echoes).toEqual([]);
    expect(f.out.slamAt).toBeCloseTo(CENTRE, 9);
    expect(f.out.refusedEarlyMs).toBeNull();
    if (f.out.hit) expect(f.out.hit.kind).toBe('clean');
  });

  it('Space tapped too early to be a run is not a take-off: the A lands on the runway, not in a flight', () => {
    const f = make(), r = rig(f);
    r.tap(' ');                                                // 0.01 → 0 on the same instant: never over 0.02
    expect(f.launched).toBe(false);
    expect(f.out.echoes).toEqual([]);
  });
});

describe('the Space let go just before the window: taken as the slam where a J would be', () => {
  it('DunkMode: inside the SLAM read (the buffer) it is held and fires at the window, scored from when it was let go', () => {
    const f = dunkFlight(), r = rig(f);
    r.key(' '); r.at(1200); f.launch();
    const at = OPEN - HOLD / 2;
    r.at(flightMs(f.launchMs, at)); r.key(' ', false);
    r.at(flightMs(f.launchMs, CENTRE));
    expect(f.out.echoes).toEqual([]);
    expect(f.out.slamAt).toBeCloseTo(at, 9);
    expect(f.out.refusedEarlyMs).toBeNull();
  });
  it('DunkDuelMode: inside the grace it is an early hit', () => {
    const f = duelFlight(), r = rig(f);
    r.key(' '); r.at(1200); f.launch();
    r.at(flightMs(f.launchMs, OPEN - PRESS_GRACE / 2)); r.key(' ', false);
    expect(f.out.echoes).toEqual([]);
    expect(f.out.hit).toMatchObject({ hit: true, kind: 'early' });
  });
});

// ── the real InputBus, a pad ─────────────────────────────────────────────────────────────────────────────────────
describe.each(MODES)('%s on a PAD (R2 = RUN, A = JUMP on the run and SLAM in the air)', (_name, make) => {
  it('R2 held, let go to take off, A on the beat: scored, and no echo on the way', () => {
    const f = make(), r = rig(f), p = pad();
    btn(p, R2_BTN, 1); r.at(700);
    btn(p, R2_BTN, 0); r.at(716);                              // released: the next poll launches
    expect(f.launched).toBe(true);
    padTapAt(r, p, flightMs(f.launchMs, CENTRE));
    expect(f.out.echoes).toEqual([]);
    expect(f.out.spent).toBe(0);
    expect(f.out.slamAt).not.toBeNull();
    expect(Math.abs(f.out.slamAt! - CENTRE)).toBeLessThanOrEqual(0.017);
    expect(f.out.refusedEarlyMs).toBeNull();
  });

  it('A pressed as R2 lets go (same frame, and two frames on) is the take-off’s, not the slam — a slow launch too', () => {
    for (const [lagFrames, hitch] of [[0, 0], [2, 0], [0, 120]] as const) {
      now = 0;
      const f = make({ launchHitchMs: hitch }), r = rig(f), p = pad();
      const tag = `lag ${lagFrames} hitch ${hitch}`;
      btn(p, R2_BTN, 1); r.at(700);
      btn(p, R2_BTN, 0);
      if (lagFrames === 0) btn(p, A_BTN, 1);
      r.at(716);
      if (lagFrames > 0) { r.at(f.launchMs + 16 * lagFrames); btn(p, A_BTN, 1); r.at(now + 16); }
      btn(p, A_BTN, 0); r.at(now + 16);
      padTapAt(r, p, flightMs(f.launchMs, CENTRE));
      expect(f.out.echoes, tag).toEqual(['takeoff']);
      expect(f.out.spent, tag).toBe(0);
      expect(f.out.slamAt, tag).not.toBeNull();
      expect(f.out.refusedEarlyMs, tag).toBeNull();
      pads.fill(null);
    }
  });

  it('A on the run is the take-off (DunkMode always; the duel now too), even on a slow launch — the A on the beat scores', () => {
    for (const hitch of [0, 120]) {
      now = 0;
      const f = make({ launchHitchMs: hitch }), r = rig(f), p = pad();
      btn(p, R2_BTN, 1); r.at(500);
      btn(p, A_BTN, 1); r.at(516);                             // "tap jump" on the run
      expect(f.launched, `hitch ${hitch}`).toBe(true);
      btn(p, A_BTN, 0); r.at(now + 16);
      btn(p, R2_BTN, 0); r.at(now + 200);                      // R2 let go in the air: nothing
      padTapAt(r, p, flightMs(f.launchMs, CENTRE));
      expect(f.out.echoes, `hitch ${hitch}`).toEqual(['takeoff']);
      expect(f.out.spent, `hitch ${hitch}`).toBe(0);
      expect(f.out.slamAt, `hitch ${hitch}`).not.toBeNull();
      expect(f.out.refusedEarlyMs, `hitch ${hitch}`).toBeNull();
      pads.fill(null);
    }
  });

  it('R2 held to the line, the jump tapped 150 ms after the line took off, A on the beat: it scores (review probe)', () => {
    const f = make(), r = rig(f), p = pad();
    btn(p, R2_BTN, 1); r.at(1200);
    f.launch();                                                // the line
    padTapAt(r, p, f.launchMs + 150);                          // a human reaction to the take-off
    padTapAt(r, p, flightMs(f.launchMs, CENTRE));
    expect(f.out.echoes).toEqual(['late']);
    expect(f.out.spent).toBe(0);
    expect(f.out.refusedEarlyMs).toBeNull();
    expect(f.out.slamAt).not.toBeNull();
    expect(Math.abs(f.out.slamAt! - CENTRE)).toBeLessThanOrEqual(0.017);
  });

  it(`…but an A ${LATE_JUMP_MS + 50} ms after the line is a real press, and far too early`, () => {
    const f = make(), r = rig(f), p = pad();
    btn(p, R2_BTN, 1); r.at(1200);
    f.launch();
    padTapAt(r, p, f.launchMs + LATE_JUMP_MS + 50);
    padTapAt(r, p, flightMs(f.launchMs, CENTRE));
    expect(f.out.echoes).toEqual([]);
    expect(f.out.refusedEarlyMs).not.toBeNull();
    expect(f.out.slamAt).toBeNull();
    expect(f.out.spent).toBe(1);
  });

  it('a real early A (0.3 s into the flight) is still the slam, still refused — the A on the beat is spent', () => {
    const f = make(), r = rig(f), p = pad();
    btn(p, R2_BTN, 1); r.at(700); btn(p, R2_BTN, 0); r.at(716);
    padTapAt(r, p, flightMs(f.launchMs, 0.3));
    padTapAt(r, p, flightMs(f.launchMs, CENTRE));
    expect(f.out.echoes).toEqual([]);
    expect(f.out.slamAt).toBeNull();
    expect(f.out.hit).toBeNull();
    expect(f.out.refusedEarlyMs).not.toBeNull();
    expect(f.out.refusedEarlyMs!).toBeGreaterThan(700);
    expect(f.out.spent).toBe(1);
  });

  it(`an A ${TAKEOFF_ECHO_MS + 20} ms after RUN is let go is a real press (and far too early) — no late grace for the player's own launch`, () => {
    const f = make(), r = rig(f), p = pad();
    btn(p, R2_BTN, 1); r.at(700); btn(p, R2_BTN, 0); r.at(716);
    const launchMs = f.launchMs;
    r.at(launchMs + TAKEOFF_ECHO_MS + 4); btn(p, A_BTN, 1); r.at(launchMs + TAKEOFF_ECHO_MS + 20); btn(p, A_BTN, 0);   // the poll at +100 carries it
    r.at(flightMs(launchMs, CENTRE) + 16);
    expect(f.out.echoes).toEqual([]);
    expect(f.out.refusedEarlyMs).not.toBeNull();
    expect(f.out.slamAt).toBeNull();
  });
});

// ── the touch overlay and Controller Link, straight into the bus (they do not go through onKey) ─────────────────────
describe.each(MODES)('%s on TOUCH / Controller Link (RUN hold starts at 0.01, the value Space-down sends)', (_name, make) => {
  /** TouchOverlay's RUN hold: `max(0.01, v)` every frame from the press, R 0 on the release. */
  const touchRun = (r: ReturnType<typeof rig>, from: number, to: number) => {
    for (let t = from; t < to; t += 16) { now = t; r.bus.emit({ t: 'trigger', side: 'R', value: Math.max(0.01, Math.min(1, (t - from) / 1100)) }); r.poll(); }
  };
  it('RUN held to the line, then RUN let go and SLAM tapped in the same instant on the beat: the SLAM scores', () => {
    const f = make(), r = rig(f);
    touchRun(r, 0, 1200);
    f.launch();                                                // the line
    const beat = flightMs(f.launchMs, CENTRE);
    touchRun(r, 1216, beat);                                   // still held through the air
    now = beat; f.frame();
    r.bus.emit({ t: 'trigger', side: 'R', value: 0 }); r.bus.emit(TOUCH_SLAM);   // one coalesced pointer frame
    expect(f.out.echoes).toEqual([]);
    expect(f.out.slamAt).toBeCloseTo(CENTRE, 9);
    expect(f.out.spent).toBe(0);
  });
  it('SLAM tapped on the run is the jump, and the SAME SLAM object tapped on the beat is still the slam', () => {
    const f = make(), r = rig(f);
    touchRun(r, 0, 500);
    r.bus.emit(TOUCH_SLAM);                                    // jump
    expect(f.launched).toBe(true);
    r.at(flightMs(f.launchMs, CENTRE)); r.bus.emit(TOUCH_SLAM);
    expect(f.out.echoes).toEqual(['takeoff']);
    expect(f.out.slamAt).toBeCloseTo(CENTRE, 9);
  });
  it("Controller Link: CHARGE (from 0.01) let go and SLAM in the same tick mid-flight — the SLAM is the player's", () => {
    const f = make(), r = rig(f);
    r.bus.emit({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN }); r.at(300);
    r.bus.emit({ t: 'trigger', side: 'R', value: 0.6 }); r.at(1200);
    f.launch();
    r.at(flightMs(f.launchMs, CENTRE));
    r.bus.emit({ t: 'trigger', side: 'R', value: 0 }); r.bus.emit({ t: 'button', btn: 'A', pressed: true });
    expect(f.out.echoes).toEqual([]);
    expect(f.out.slamAt).toBeCloseTo(CENTRE, 9);
  });
});

describe('the duel keeps its grace (FirstPress): an A just before the window still counts, badly', () => {
  it(`an A ${Math.round(PRESS_GRACE * 500)} ms before the window, on the keyboard, is a hit`, () => {
    const f = duelFlight(), r = rig(f);
    r.key(' '); r.at(700); r.key(' ', false);
    r.at(flightMs(f.launchMs, OPEN - PRESS_GRACE / 2)); r.tap('j');
    expect(f.out.echoes).toEqual(['space']);
    expect(f.out.hit).toMatchObject({ hit: true, kind: 'early' });
  });
});
