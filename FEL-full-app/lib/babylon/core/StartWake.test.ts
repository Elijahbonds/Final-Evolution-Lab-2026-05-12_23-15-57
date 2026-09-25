// SHARED-START-UNSTICK (2026-09-14): the READY gate wakes on any deliberate input and the waking press never leaks
// into play. Plus source scans on the two places a regression would come back: the harness's gate, and the 2-D cards.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { isWakeInput, WakeLatch, PauseLedger, WAKE_ECHO_MS, KEY_SPACE_DOWN, SPACE_TAP_MS } from './StartWake';
import type { FelInput } from './InputBus';

const root = path.resolve(__dirname, '../../..');
const src = (p: string) => readFileSync(path.join(root, p), 'utf8');

describe('isWakeInput', () => {
  it('wakes on any button, d-pad press, stick push or trigger pull', () => {
    expect(isWakeInput({ t: 'button', btn: 'A', pressed: true })).toBe(true);
    expect(isWakeInput({ t: 'button', btn: 'START', pressed: true })).toBe(true);
    expect(isWakeInput({ t: 'dpad', dir: 'right', pressed: true })).toBe(true);
    expect(isWakeInput({ t: 'stick', side: 'L', x: 0, y: -1 })).toBe(true);
    expect(isWakeInput({ t: 'stick', side: 'R', x: 0.4, y: 0.4 })).toBe(true);
    expect(isWakeInput({ t: 'trigger', side: 'R', value: 0.9 })).toBe(true);
  });
  it('does not wake on releases, a resting stick or trigger noise', () => {
    expect(isWakeInput({ t: 'button', btn: 'A', pressed: false })).toBe(false);
    expect(isWakeInput({ t: 'dpad', dir: 'up', pressed: false })).toBe(false);
    expect(isWakeInput({ t: 'stick', side: 'L', x: 0.1, y: -0.2 })).toBe(false);
    expect(isWakeInput({ t: 'stick', side: 'L', x: 0, y: 0 })).toBe(false);
    expect(isWakeInput({ t: 'trigger', side: 'L', value: 0.05 })).toBe(false);
  });
});

// MOVEMENT PLAY P3 (2026-09-24): the body starts a game through its own START (both hands held up) and nothing else —
// a lean, a crouch or a jump the floor turned into a FelInput is a person getting ready, not a press (P3 Z4).
describe('isWakeInput — the body never wakes a game through a FelInput', () => {
  it('a body button or d-pad press never wakes', () => {
    expect(isWakeInput({ t: 'button', btn: 'A', pressed: true, src: 'body' })).toBe(false);
    expect(isWakeInput({ t: 'button', btn: 'B', pressed: true, src: 'body' })).toBe(false);
    expect(isWakeInput({ t: 'dpad', dir: 'right', pressed: true, src: 'body' })).toBe(false);
    expect(isWakeInput({ t: 'button', btn: 'A', pressed: true, src: 'key' })).toBe(true);   // the keyboard's tag still wakes
  });
  it('a body stick push never wakes, however far', () => {
    expect(isWakeInput({ t: 'stick', side: 'L', x: 1, y: 0, src: 'body' })).toBe(false);
    expect(isWakeInput({ t: 'stick', side: 'L', x: 0, y: -1, src: 'body' })).toBe(false);
  });
  it('a body trigger pull never wakes, not even at the Space-down marker', () => {
    expect(isWakeInput({ t: 'trigger', side: 'R', value: 1, src: 'body' })).toBe(false);
    expect(isWakeInput({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN, src: 'body' })).toBe(false);
  });
});

describe('WakeLatch', () => {
  it('drops the waking button release so a hold-to-shoot does not fire on the first frame', () => {
    const l = new WakeLatch();
    expect(l.wake({ t: 'button', btn: 'A', pressed: true }, 1000)).toBe(false);
    expect(l.pass({ t: 'button', btn: 'A', pressed: false }, 1400)).toBe(false);
    // the next deliberate press + release are the mode's
    expect(l.pass({ t: 'button', btn: 'A', pressed: true }, 2000)).toBe(true);
    expect(l.pass({ t: 'button', btn: 'A', pressed: false }, 2300)).toBe(true);
  });
  it('forwards a waking stick push — the player is moving on the first playing frame', () => {
    const l = new WakeLatch();
    expect(l.wake({ t: 'stick', side: 'L', x: 0, y: -1 }, 0)).toBe(true);
    expect(l.pass({ t: 'stick', side: 'L', x: 0, y: -1 }, 16)).toBe(true);
  });
  it('swallows the same-instant twin of an arrow key (stick woke it, the d-pad echo follows)', () => {
    const l = new WakeLatch();
    l.wake({ t: 'stick', side: 'L', x: 1, y: 0 }, 500);
    expect(l.pass({ t: 'dpad', dir: 'right', pressed: true, src: 'key' }, 501)).toBe(false);
    expect(l.pass({ t: 'dpad', dir: 'right', pressed: false, src: 'key' }, 640)).toBe(false);
    expect(l.pass({ t: 'dpad', dir: 'right', pressed: true, src: 'key' }, 500 + WAKE_ECHO_MS + 200)).toBe(true);
  });
  it('a held SPACE wakes on key-down (not 550 ms into its charge), and a quick tap does not fire a shot on keyup', () => {
    expect(isWakeInput({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN })).toBe(true);
    expect(isWakeInput({ t: 'trigger', side: 'R', value: 0.03 })).toBe(false);   // pad trigger noise
    const tap = new WakeLatch();
    expect(tap.wake({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN }, 0)).toBe(true);
    expect(tap.pass({ t: 'trigger', side: 'R', value: 0 }, 110)).toBe(true);
    expect(tap.pass({ t: 'button', btn: 'A', pressed: true }, 110)).toBe(false);   // the tap's keyup A = the wake
    expect(tap.pass({ t: 'button', btn: 'A', pressed: true }, 900)).toBe(true);    // the next space is a shot
    const hold = new WakeLatch();
    hold.wake({ t: 'trigger', side: 'R', value: KEY_SPACE_DOWN }, 0);
    expect(hold.pass({ t: 'trigger', side: 'R', value: 0.6 }, 700)).toBe(true);
    expect(hold.pass({ t: 'button', btn: 'A', pressed: true }, SPACE_TAP_MS + 450)).toBe(true);   // a charge's release
  });
  it('InputBus emits the space-down marker by name, so the two cannot drift apart', () => {
    expect(src('lib/babylon/core/InputBus.ts')).toMatch(/value: KEY_SPACE_DOWN \}/);
  });
  it('does not eat an unrelated release', () => {
    const l = new WakeLatch();
    l.wake({ t: 'button', btn: 'START', pressed: true }, 0);
    expect(l.pass({ t: 'button', btn: 'B', pressed: false }, 300)).toBe(true);
  });
});

// MOVEMENT PLAY P3 step 4b (2026-09-24): resume and wake hygiene. The harness drops everything while PAUSED and a press
// resumes, so before this the resuming press's release reached the mode unpaired (the wake latch was never armed on a
// resume), and a key the mode saw go down and that came up during the pause stayed down for the mode for good.
describe('PauseLedger + the resume latch (step 4b)', () => {
  const replayed = (l: PauseLedger): FelInput[] => { const out: FelInput[] = []; l.replay((e) => out.push(e)); return out; };

  it('owes only the releases of keys the mode saw go down (the START that paused and a latched press are not the mode\'s)', () => {
    const l = new PauseLedger();
    l.saw({ t: 'button', btn: 'A', pressed: true });                                  // held when the game paused
    l.saw({ t: 'dpad', dir: 'right', pressed: true });                                // held, and still down at the resume
    l.saw({ t: 'button', btn: 'B', pressed: true }); l.saw({ t: 'button', btn: 'B', pressed: false });   // up in play
    l.saw({ t: 'stick', side: 'L', x: 1, y: 0 });                                     // state, not a key
    // paused: the harness drops all of these
    l.drop({ t: 'button', btn: 'START', pressed: false });   // its press paused the game and never reached the mode
    l.drop({ t: 'button', btn: 'B', pressed: false });       // the mode had B's release already
    l.drop({ t: 'button', btn: 'X', pressed: false });       // never down for the mode
    l.drop({ t: 'stick', side: 'L', x: 0, y: 0 });           // sticks and triggers are re-sent by the resume (resync)
    l.drop({ t: 'trigger', side: 'R', value: 0 });
    l.drop({ t: 'button', btn: 'A', pressed: false });
    expect(replayed(l)).toEqual([{ t: 'button', btn: 'A', pressed: false }]);
  });

  it('a key pressed again during the pause clears its entry (down, as the mode last saw it); a release after that is owed again', () => {
    const l = new PauseLedger();
    l.saw({ t: 'dpad', dir: 'left', pressed: true });
    l.drop({ t: 'dpad', dir: 'left', pressed: false });
    l.drop({ t: 'dpad', dir: 'left', pressed: true, src: 'key' });   // a d-pad press does not resume: it is dropped too
    expect(replayed(l)).toEqual([]);                                  // still down for the mode, and it is down
    l.drop({ t: 'dpad', dir: 'left', pressed: false });
    l.drop({ t: 'dpad', dir: 'left', pressed: true });
    l.drop({ t: 'dpad', dir: 'left', pressed: false });
    expect(replayed(l)).toEqual([{ t: 'dpad', dir: 'left', pressed: false }]);   // once
  });

  it('replays in the order the keys came up, once; the mode has them after, and a new run owes nothing (reset)', () => {
    const l = new PauseLedger();
    for (const btn of ['A', 'B', 'R1'] as const) l.saw({ t: 'button', btn, pressed: true });
    l.saw({ t: 'dpad', dir: 'up', pressed: true });
    l.drop({ t: 'button', btn: 'A', pressed: false });
    l.drop({ t: 'button', btn: 'B', pressed: false });
    l.drop({ t: 'button', btn: 'A', pressed: true });    // A down again: its entry goes…
    l.drop({ t: 'dpad', dir: 'up', pressed: false });
    l.drop({ t: 'button', btn: 'A', pressed: false });   // …and comes back at the end, where A came up last
    expect(replayed(l)).toEqual([
      { t: 'button', btn: 'B', pressed: false },
      { t: 'dpad', dir: 'up', pressed: false },
      { t: 'button', btn: 'A', pressed: false },
    ]);
    expect(replayed(l)).toEqual([]);
    l.drop({ t: 'button', btn: 'B', pressed: false });   // a later pause: B is up for the mode now, nothing is owed
    expect(replayed(l)).toEqual([]);
    l.reset();
    l.drop({ t: 'button', btn: 'R1', pressed: false });  // R1 was down in the run before the reset: not this run's
    expect(replayed(l)).toEqual([]);
  });

  it('the latch on a resume swallows the resuming press\'s release; the release owed on that same key still reaches the mode', () => {
    const latch = new WakeLatch(), ledger = new PauseLedger();
    const mode: FelInput[] = [];
    const play = (e: FelInput, now: number): void => { if (latch.pass(e, now)) { ledger.saw(e); mode.push(e); } };
    latch.wake({ t: 'stick', side: 'L', x: 0, y: -1 }, 0);        // READY: a stick push woke it
    play({ t: 'button', btn: 'A', pressed: true }, 1000);          // a hold-to-shoot starts charging
    // START pauses (it never reaches the mode), and A comes up while paused
    ledger.drop({ t: 'button', btn: 'START', pressed: false });
    ledger.drop({ t: 'button', btn: 'A', pressed: false });
    // A resumes the game: latched like a wake, then the owed release straight to the mode (the harness's resume)
    latch.wake({ t: 'button', btn: 'A', pressed: true }, 3000, true);
    ledger.replay((e) => mode.push(e));
    play({ t: 'button', btn: 'A', pressed: false }, 3200);         // the resuming press comes up: the wake's, not a shot
    expect(mode).toEqual([{ t: 'button', btn: 'A', pressed: true }, { t: 'button', btn: 'A', pressed: false }]);
    // the next deliberate press and release are the mode's
    play({ t: 'button', btn: 'A', pressed: true }, 4000);
    play({ t: 'button', btn: 'A', pressed: false }, 4300);
    expect(mode).toHaveLength(4);
    // the tap on the paused layer is a START press with no release; a pad's START comes up in play and is swallowed too
    latch.wake({ t: 'button', btn: 'START', pressed: true }, 9000, true);
    expect(latch.pass({ t: 'button', btn: 'START', pressed: false }, 9150)).toBe(false);
    // before step 4b a resume never armed the latch, and that release went to the mode unpaired
    expect(new WakeLatch().pass({ t: 'button', btn: 'START', pressed: false }, 9150)).toBe(true);
  });

  it('a resume keeps what the latch already held: the READY wake\'s press, still down through the pause, never comes up unpaired', () => {
    const l = new WakeLatch();
    expect(l.wake({ t: 'button', btn: 'A', pressed: true }, 0)).toBe(false);        // READY: A woke it, and stays down
    expect(l.wake({ t: 'button', btn: 'B', pressed: true }, 5000, true)).toBe(false);   // paused, then B resumed it
    expect(l.pass({ t: 'button', btn: 'A', pressed: false }, 6000)).toBe(false);    // the wake's A: still the wake's
    expect(l.pass({ t: 'button', btn: 'B', pressed: false }, 6100)).toBe(false);    // the resume's B: the resume's
    expect(l.pass({ t: 'button', btn: 'A', pressed: true }, 7000)).toBe(true);      // and play goes on
    expect(l.pass({ t: 'button', btn: 'A', pressed: false }, 7200)).toBe(true);
    // a wake that is not a resume still starts the latch over (a new run: nothing before it is the latch's)
    const fresh = new WakeLatch();
    fresh.wake({ t: 'button', btn: 'A', pressed: true }, 0);
    fresh.wake({ t: 'button', btn: 'B', pressed: true }, 5000);
    expect(fresh.pass({ t: 'button', btn: 'A', pressed: false }, 6000)).toBe(true);
  });

  // ── the step-4b review (2026-09-24) ──
  it('changed: only a stick or trigger value the mode was not last handed is news (neutral before any; reset rests them)', () => {
    const l = new PauseLedger();
    // a keyboard player: never handed a trigger or an R stick — a resting one is no news, and is not re-sent
    expect(l.changed({ t: 'trigger', side: 'R', value: 0 })).toBe(false);
    expect(l.changed({ t: 'trigger', side: 'L', value: 0 })).toBe(false);
    expect(l.changed({ t: 'stick', side: 'R', x: 0, y: 0 })).toBe(false);
    l.saw({ t: 'stick', side: 'L', x: 0, y: -1 });                       // W, held through the pause
    expect(l.changed({ t: 'stick', side: 'L', x: 0, y: -1 })).toBe(false);
    expect(l.changed({ t: 'stick', side: 'L', x: 0, y: 0 })).toBe(true);  // let go of during the pause
    expect(l.changed({ t: 'stick', side: 'L', x: 0.5, y: -1 })).toBe(true);
    l.saw({ t: 'trigger', side: 'R', value: 0.8 });                       // a charge held when the game paused
    expect(l.changed({ t: 'trigger', side: 'R', value: 0 })).toBe(true);
    expect(l.changed({ t: 'trigger', side: 'R', value: 0.8 })).toBe(false);
    expect(l.changed({ t: 'trigger', side: 'L', value: 0 })).toBe(false); // each channel its own
    expect(l.changed({ t: 'button', btn: 'A', pressed: false })).toBe(true);
    l.reset();
    expect(l.changed({ t: 'stick', side: 'L', x: 0, y: -1 })).toBe(true);
    expect(l.changed({ t: 'trigger', side: 'R', value: 0 })).toBe(false);
  });

  it('a d-pad pressed during the pause and still down at the resume: the latch has its release, never the mode (unpaired)', () => {
    const latch = new WakeLatch(), ledger = new PauseLedger();
    latch.wake({ t: 'stick', side: 'L', x: 0, y: -1 }, 0);
    ledger.saw({ t: 'dpad', dir: 'up', pressed: true });                    // the mode saw up go down…
    // paused: a d-pad press does not resume, so all of these are dropped
    ledger.drop({ t: 'dpad', dir: 'left', pressed: true, src: 'key' });    // down now, and still down at the resume
    ledger.drop({ t: 'dpad', dir: 'right', pressed: true });               // pressed and let go inside the pause
    ledger.drop({ t: 'dpad', dir: 'right', pressed: false });
    ledger.drop({ t: 'dpad', dir: 'up', pressed: false });                 // …up came up, and went down again: it is
    ledger.drop({ t: 'dpad', dir: 'up', pressed: true });                  //    down, as the mode last saw it
    const unseen = ledger.heldUnseen();
    expect(unseen).toEqual(['d:left']);
    expect(ledger.heldUnseen()).toEqual([]);                               // handed over once
    // A resumes: latched, and the unseen press with it (the harness's resume)
    latch.wake({ t: 'button', btn: 'A', pressed: true }, 3000, true);
    latch.hold(unseen);
    expect(latch.pass({ t: 'dpad', dir: 'left', pressed: false, src: 'key' }, 3500)).toBe(false);   // the latch's
    expect(latch.pass({ t: 'dpad', dir: 'up', pressed: false }, 3600)).toBe(true);                   // the mode's pair
    expect(latch.pass({ t: 'dpad', dir: 'left', pressed: true }, 4000)).toBe(true);                  // and play goes on
    expect(latch.pass({ t: 'dpad', dir: 'left', pressed: false }, 4200)).toBe(true);
    // the body's resume presses nothing, and the hold works the same without a wake
    const bodyLatch = new WakeLatch();
    bodyLatch.hold(['d:down']);
    expect(bodyLatch.pass({ t: 'dpad', dir: 'down', pressed: false }, 100)).toBe(false);
    // a new run: nothing pressed in the last run's pause is this run's
    ledger.drop({ t: 'dpad', dir: 'down', pressed: true });
    ledger.reset();
    expect(ledger.heldUnseen()).toEqual([]);
  });

  it('replay hands each release over once, leaving the ledger just before it goes: one that throws costs itself alone', () => {
    const l = new PauseLedger();
    for (const btn of ['A', 'B', 'X'] as const) l.saw({ t: 'button', btn, pressed: true });
    for (const btn of ['A', 'B', 'X'] as const) l.drop({ t: 'button', btn, pressed: false });
    const got: FelInput[] = [];
    expect(() => l.replay((e) => { if (e.t === 'button' && e.btn === 'A') throw new Error('mode threw'); got.push(e); })).toThrow('mode threw');
    expect(got).toEqual([]);
    // B and X are still owed; A is never handed over twice
    expect(replayed(l)).toEqual([{ t: 'button', btn: 'B', pressed: false }, { t: 'button', btn: 'X', pressed: false }]);
    // a key the mode is handed again in play owes nothing from before (an entry a throw left behind goes with it)
    l.saw({ t: 'button', btn: 'Y', pressed: true });
    l.drop({ t: 'button', btn: 'Y', pressed: false });
    l.saw({ t: 'button', btn: 'Y', pressed: true });
    expect(replayed(l)).toEqual([]);
  });
});

describe('the gates stay wide open (source scans)', () => {
  it('ModeHarness wakes through isWakeInput and never runs the 800 ms 3-2-1 again', () => {
    const h = src('lib/babylon/core/ModeHarness.ts');
    expect(h).toMatch(/phase === 'ready' && isWakeInput\(e\)/);
    expect(h).not.toMatch(/setInterval\([\s\S]{0,400}?\}, 800\)/);
  });
  it('BootSplash starts on a press anywhere on the READY card, not only on its button', () => {
    expect(src('components/games/boot-splash.tsx')).toMatch(/onPointerDown=\{props\.phase === 'ready'/);
  });
  it('tiebreak and training start through the shared useStartWake hook', () => {
    for (const f of ['components/games/tiebreak-game.tsx', 'components/games/training-game.tsx']) {
      expect(src(f)).toMatch(/useStartWake\(!started/);
    }
  });
});
