// Controller profiles + player slots — Input & Presence Phase A (2026-09-13).
//
// The mission's acceptance criterion, verbatim: "DualSense, Xbox Series, and Switch Pro each produce
// identical canonical output for the same physical input. Unit-test with recorded fixtures." That is the
// centre of this file, and it is exactly the thing the tree could not do before — nothing read gamepad.id
// or gamepad.mapping at all, so a Switch Pro's non-standard layout was mis-mapped with nothing able to
// notice.

import { describe, it, expect } from 'vitest';
import {
  PROFILES, GENERIC_STANDARD, GENERIC_FALLBACK, STANDARD_MAPPING, SWITCH_PRO_MAPPING,
  profileFor, supportCheck, radialDeadzone, readPad, anyPressed, isIosLike, normalizePadId,
  type PadLike,
} from './profiles';
import {
  freshSlots, pollSlots, playerCount, readSlot, reconnectPrompt, joinPrompt, MAX_SLOTS,
} from './PlayerSlots';
import { applyRemap, validRemap, canRumble, rumble } from './remap';

/** Build a pad fixture: 17 buttons, 4 axes, nothing pressed. */
function pad(id: string, mapping: string, opts: { down?: number[]; axes?: number[]; values?: Record<number, number> } = {}): PadLike & { index: number; connected: boolean } {
  return {
    id, mapping, index: 0, connected: true,
    axes: opts.axes ?? [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: (opts.down ?? []).includes(i),
      value: opts.values?.[i] ?? ((opts.down ?? []).includes(i) ? 1 : 0),
    })),
  };
}

const DUALSENSE = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const XBOX = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)';
const SWITCH_PRO = 'Pro Controller (Vendor: 057e Product: 2009)';

describe('a pad is recognised by what it says it is', () => {
  it('names the vendors the mission lists', () => {
    expect(profileFor({ id: DUALSENSE }).id).toBe('dualsense');
    expect(profileFor({ id: XBOX }).id).toBe('xbox-series');
    expect(profileFor({ id: SWITCH_PRO }).id).toBe('switch-pro');
    expect(profileFor({ id: 'Wireless Controller (Vendor: 054c Product: 09cc)' }).id).toBe('dualshock4');
    expect(profileFor({ id: 'Joy-Con (L) (Vendor: 057e Product: 2006)' }).id).toBe('joycon-single');
    expect(profileFor({ id: 'Joy-Con L/R (Vendor: 057e Product: 200e)' }).id).toBe('joycon-pair');
  });

  it('BOTH BROWSER SPELLINGS of a vendor id match the same profile', () => {
    // Chrome: "Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)"
    // Firefox: "054c-09cc-Wireless Controller" — a table written against one silently fails on the other
    expect(profileFor({ id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)' }).id).toBe('dualshock4');
    expect(profileFor({ id: '054c-09cc-Wireless Controller' }).id).toBe('dualshock4');
    expect(normalizePadId('Vendor: 045E Product: 0B13')).toBe('045e-0b13');
  });

  it('an unknown pad that CLAIMS the standard gets the standard; one that claims nothing is flagged', () => {
    expect(profileFor({ id: 'Some Arcade Stick', mapping: 'standard' }).id).toBe(GENERIC_STANDARD.id);
    expect(profileFor({ id: 'Some Arcade Stick', mapping: '' }).id).toBe(GENERIC_FALLBACK.id);
    expect(profileFor(null).id).toBe(GENERIC_FALLBACK.id);
  });

  it('A RECOGNISED PAD IS MAPPED BY ITS PROFILE WHATEVER IT CLAIMS', () => {
    // the profile usually exists BECAUSE the claim is wrong — a Switch Pro that reports "standard" is still
    // a Switch Pro, and honouring the claim would reintroduce the bug the profile exists to fix
    expect(profileFor({ id: SWITCH_PRO, mapping: 'standard' }).id).toBe('switch-pro');
  });

  it('the more specific entry wins — Switch 2 before Switch Pro', () => {
    expect(profileFor({ id: 'Switch 2 Pro Controller' }).id).toBe('switch2-pro');
    const order = PROFILES.map((p) => p.id);
    expect(order.indexOf('switch2-pro')).toBeLessThan(order.indexOf('switch-pro'));
    expect(order.indexOf('joycon-pair')).toBeLessThan(order.indexOf('joycon-single'));
    expect(order.indexOf('xbox-series')).toBeLessThan(order.indexOf('xbox-one'));
  });
});

describe('THE SAME PHYSICAL INPUT PRODUCES THE SAME CANONICAL OUTPUT', () => {
  // the acceptance criterion. "The bottom face button" is one physical action; all three pads must report it
  // as canonical A, even though the Switch reports it at a different index
  it('the BOTTOM face button is A on all three', () => {
    const ds = readPad(pad(DUALSENSE, 'standard', { down: [0] }));
    const xb = readPad(pad(XBOX, 'standard', { down: [0] }));
    const sw = readPad(pad(SWITCH_PRO, '', { down: [1] }));      // the Switch reports its bottom button at 1
    for (const p of [ds, xb, sw]) {
      expect(p.buttons.A).toBe(true);
      expect(p.buttons.B).toBe(false);
    }
    expect(ds.buttons).toEqual(xb.buttons);
    expect(ds.buttons).toEqual(sw.buttons);
  });

  it('the RIGHT face button is B on all three', () => {
    const ds = readPad(pad(DUALSENSE, 'standard', { down: [1] }));
    const sw = readPad(pad(SWITCH_PRO, '', { down: [0] }));       // physically the right button on a Switch pad
    expect(ds.buttons.B).toBe(true);
    expect(sw.buttons.B).toBe(true);
    expect(ds.buttons).toEqual(sw.buttons);
  });

  it('WITHOUT THE PROFILE THE SWITCH IS WRONG — which is what shipped before this', () => {
    // read the same Switch press through the standard table and the game sees B where the player pressed A
    const wrong = readPad(pad(SWITCH_PRO, '', { down: [1] }), { ...GENERIC_STANDARD, mapping: STANDARD_MAPPING });
    expect(wrong.buttons.A).toBe(false);
    expect(wrong.buttons.B).toBe(true);
  });

  it('triggers, shoulders, sticks and the d-pad all land in the same canonical places', () => {
    const fixtures = [pad(DUALSENSE, 'standard', { down: [4, 12], axes: [0.8, -0.6, 0, 0], values: { 7: 0.5 } }),
                      pad(XBOX, 'standard', { down: [4, 12], axes: [0.8, -0.6, 0, 0], values: { 7: 0.5 } }),
                      pad(SWITCH_PRO, '', { down: [4, 12], axes: [0.8, -0.6, 0, 0], values: { 7: 0.5 } })];
    const read = fixtures.map((f) => readPad(f));
    for (const r of read) {
      expect(r.buttons.L1).toBe(true);
      expect(r.dpad.up).toBe(true);
      expect(r.triggers.R).toBe(0.5);
      expect(r.lx).toBeGreaterThan(0);
      expect(r.ly).toBeLessThan(0);
    }
  });

  it('a sideways Joy-Con swaps its stick axes — the configuration everyone gets wrong', () => {
    const jc = readPad(pad('Joy-Con (L)', '', { axes: [0.9, 0, 0, 0] }));
    // the pad's x is the player's y when the controller is rotated a quarter turn
    expect(Math.abs(jc.ly)).toBeGreaterThan(Math.abs(jc.lx));
  });
});

describe('a controller the device cannot use says so', () => {
  it('the Switch 2 Pro over Bluetooth on iOS is flagged, not left to fail silently', () => {
    const p = profileFor({ id: 'Switch 2 Pro Controller' });
    const ios = supportCheck(p, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)');
    expect(ios.ok).toBe(false);
    if (!ios.ok) {
      expect(ios.why.length).toBeGreaterThan(20);
      // it explains the device limitation without blaming the player or their hardware
      expect(ios.why.toLowerCase()).not.toMatch(/error|unsupported|invalid|broken|fault/);
    }
  });

  it('the same controller is fine on a desktop', () => {
    expect(supportCheck(profileFor({ id: 'Switch 2 Pro Controller' }), 'Mozilla/5.0 (Windows NT 10.0)').ok).toBe(true);
  });

  it('every other profile is supported everywhere', () => {
    for (const p of PROFILES.filter((x) => x.id !== 'switch2-pro')) {
      expect(supportCheck(p, 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)').ok).toBe(true);
    }
  });

  it('iPadOS reports a Mac user agent, and is still iOS-like', () => {
    expect(isIosLike('Mozilla/5.0 (Macintosh; Intel Mac OS X) Mobile/15E148')).toBe(true);
    expect(isIosLike('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false);
  });
});

describe('RADIAL DEADZONE — a round stick needs a round hole', () => {
  it('a diagonal push past the threshold is NOT eaten', () => {
    // the per-axis deadzone the tree had: 0.14 on each axis reads as zero, though the stick is 0.20 out
    const out = radialDeadzone(0.14, 0.14, 0.15);
    expect(Math.hypot(out.x, out.y)).toBeGreaterThan(0);
  });

  it('a resting stick inside the circle is silent', () => {
    expect(radialDeadzone(0.1, 0.05, 0.15)).toEqual({ x: 0, y: 0 });
    expect(radialDeadzone(0, 0, 0.15)).toEqual({ x: 0, y: 0 });
  });

  it('it RESCALES, so the first millimetre past the edge is a small input and not a jump', () => {
    const just = radialDeadzone(0.16, 0, 0.15);
    expect(Math.abs(just.x)).toBeLessThan(0.05);
    const full = radialDeadzone(1, 0, 0.15);
    expect(full.x).toBeCloseTo(1, 4);
  });

  it('direction survives the scaling', () => {
    const out = radialDeadzone(-0.7, 0.7, 0.15);
    expect(out.x).toBeLessThan(0);
    expect(out.y).toBeGreaterThan(0);
    expect(Math.abs(out.x)).toBeCloseTo(Math.abs(out.y), 6);
  });

  it('a pad with a loose stick gets its own threshold', () => {
    const tight = profileFor({ id: DUALSENSE }).deadzone;
    const loose = profileFor({ id: 'Joy-Con (L)' }).deadzone;
    expect(loose).toBeGreaterThan(tight);
  });
});

describe('FOUR CONTROLLERS, FOUR PLAYERS', () => {
  it('a pad is invisible until a button is pressed — and that press IS the join', () => {
    const silent = pad(XBOX, 'standard');
    let s = freshSlots();
    ({ state: s } = pollSlots(s, [silent]));
    expect(playerCount(s)).toBe(0);                       // a silent pad has not joined

    const pressed = { ...pad(XBOX, 'standard', { down: [0] }), index: 0 };
    const out = pollSlots(s, [pressed]);
    expect(playerCount(out.state)).toBe(1);
    expect(out.events[0]).toMatchObject({ kind: 'join', slot: 0 });
  });

  it('four pads fill four slots, in the order they join', () => {
    let s = freshSlots();
    const pads = [DUALSENSE, XBOX, SWITCH_PRO, 'Joy-Con L/R'].map((id, i) => ({ ...pad(id, 'standard', { down: [0] }), index: i }));
    for (let i = 0; i < 4; i++) ({ state: s } = pollSlots(s, pads.slice(0, i + 1)));
    expect(playerCount(s)).toBe(4);
    expect(s.slots.map((x) => x.profile?.id)).toEqual(['dualsense', 'xbox-series', 'switch-pro', 'joycon-pair']);
  });

  it('a fifth controller does not displace anyone', () => {
    let s = freshSlots();
    const pads = Array.from({ length: 5 }, (_, i) => ({ ...pad(XBOX, 'standard', { down: [0] }), index: i }));
    ({ state: s } = pollSlots(s, pads));
    expect(playerCount(s)).toBe(MAX_SLOTS);
    expect(s.slots.every((x) => x.padIndex !== null)).toBe(true);
  });

  it('each slot reads ITS OWN controller through ITS OWN profile', () => {
    let s = freshSlots();
    const ds = { ...pad(DUALSENSE, 'standard', { down: [0] }), index: 0 };
    const sw = { ...pad(SWITCH_PRO, '', { down: [1] }), index: 1 };   // the Switch's bottom button
    ({ state: s } = pollSlots(s, [ds, sw]));
    // both players pressed the bottom button; both read as canonical A
    expect(readSlot(s, 0, [ds, sw])!.buttons.A).toBe(true);
    expect(readSlot(s, 1, [ds, sw])!.buttons.A).toBe(true);
  });
});

describe('A DISCONNECT PAUSES — IT DOES NOT DROP THE RUN', () => {
  it('the slot is HELD and the state goes paused', () => {
    let s = freshSlots();
    const p = { ...pad(XBOX, 'standard', { down: [0] }), index: 0 };
    ({ state: s } = pollSlots(s, [p]));
    const out = pollSlots(s, []);                          // the pad vanished
    expect(out.state.paused).toBe(true);
    expect(out.events[0]).toMatchObject({ kind: 'leave', slot: 0 });
    expect(playerCount(out.state)).toBe(1);                // still a player — the seat is theirs
  });

  it('the same controller reclaims its own seat', () => {
    let s = freshSlots();
    const p = { ...pad(XBOX, 'standard', { down: [0] }), index: 0 };
    ({ state: s } = pollSlots(s, [p]));
    ({ state: s } = pollSlots(s, []));
    const out = pollSlots(s, [p]);
    expect(out.state.paused).toBe(false);
    expect(out.events[0]).toMatchObject({ kind: 'reconnect', slot: 0 });
  });

  it('TWO PEOPLE RECONNECTING DO NOT SWAP PLAYERS', () => {
    // matching by id first is what makes this true, and on a couch it matters: player 2 must come back as
    // player 2, not inherit player 1's game
    let s = freshSlots();
    const a = { ...pad(DUALSENSE, 'standard', { down: [0] }), index: 0 };
    const b = { ...pad(XBOX, 'standard', { down: [0] }), index: 1 };
    ({ state: s } = pollSlots(s, [a, b]));
    ({ state: s } = pollSlots(s, []));                     // both unplugged
    const out = pollSlots(s, [b, a]);                      // both back, in the other order
    expect(out.state.slots[0].padId).toBe(DUALSENSE);
    expect(out.state.slots[1].padId).toBe(XBOX);
  });

  it('the game can say whose controller it is', () => {
    expect(reconnectPrompt(1)).toContain('PLAYER 2');
    expect(joinPrompt(0)).toMatch(/PRESS ANY BUTTON/);
    expect(joinPrompt(1)).toContain('PLAYER 2');
  });

  it('a held slot cannot be read — the mode gets null rather than a frozen input', () => {
    let s = freshSlots();
    const p = { ...pad(XBOX, 'standard', { down: [0] }), index: 0 };
    ({ state: s } = pollSlots(s, [p]));
    ({ state: s } = pollSlots(s, []));
    expect(readSlot(s, 0, [])).toBeNull();
  });

  it('joins can be closed without closing reconnects', () => {
    let s = freshSlots();
    const a = { ...pad(DUALSENSE, 'standard', { down: [0] }), index: 0 };
    ({ state: s } = pollSlots(s, [a]));
    ({ state: s } = pollSlots(s, []));
    const b = { ...pad(XBOX, 'standard', { down: [0] }), index: 1 };
    const out = pollSlots(s, [a, b], false);               // joins closed mid-run
    expect(out.state.slots[0].awaitingReconnect).toBe(false);   // player 1 still came back
    expect(playerCount(out.state)).toBe(1);                     // and the newcomer did not join
  });
});

describe('anyPressed is the join gesture', () => {
  it('a button or a real stick push counts; noise does not', () => {
    expect(anyPressed(pad(XBOX, 'standard'))).toBe(false);
    expect(anyPressed(pad(XBOX, 'standard', { down: [3] }))).toBe(true);
    expect(anyPressed(pad(XBOX, 'standard', { axes: [0.9, 0, 0, 0] }))).toBe(true);
    expect(anyPressed(pad(XBOX, 'standard', { axes: [0.2, 0, 0, 0] }))).toBe(false);
  });
});

describe('REMAP — swapping two buttons actually swaps them', () => {
  it('the classic bug: a sequential rewrite makes both buttons the same', () => {
    const p = readPad(pad(XBOX, 'standard', { down: [0] }));       // A down, B up
    const swapped = applyRemap(p, { A: 'B', B: 'A' });
    expect(swapped.buttons.B).toBe(true);                          // what was A now reads as B
    expect(swapped.buttons.A).toBe(false);
  });

  it('an unmapped button is untouched', () => {
    const p = readPad(pad(XBOX, 'standard', { down: [2] }));       // X
    expect(applyRemap(p, { A: 'B' }).buttons.X).toBe(true);
  });

  it('a button remapped AWAY with nothing mapped onto it goes quiet', () => {
    const p = readPad(pad(XBOX, 'standard', { down: [0] }));
    const out = applyRemap(p, { A: 'Y' });
    expect(out.buttons.Y).toBe(true);
    expect(out.buttons.A).toBe(false);
  });

  it('no remap is a no-op, and returns the same object', () => {
    const p = readPad(pad(XBOX, 'standard', { down: [0] }));
    expect(applyRemap(p, null)).toBe(p);
    expect(applyRemap(p, {})).toBe(p);
  });

  it('two buttons onto one action is rejected — that is confusing, not clever', () => {
    expect(validRemap({ A: 'B', X: 'B' })).toBe(false);
    expect(validRemap({ A: 'B', B: 'A' })).toBe(true);
  });

  it('sticks and triggers survive a face-button remap', () => {
    const p = readPad(pad(XBOX, 'standard', { down: [0], axes: [0.9, 0, 0, 0], values: { 7: 0.7 } }));
    const out = applyRemap(p, { A: 'B' });
    expect(out.lx).toBeCloseTo(p.lx, 6);
    expect(out.triggers.R).toBe(0.7);
  });
});

describe('rumble is optional and never load-bearing', () => {
  it('a pad without an actuator simply does not rumble', () => {
    expect(canRumble({})).toBe(false);
    expect(rumble({})).toBe(false);
    expect(rumble(null)).toBe(false);
  });

  it('a pad with one does, and a throwing actuator is swallowed', () => {
    expect(canRumble({ vibrationActuator: {} })).toBe(true);
    expect(rumble({ vibrationActuator: { playEffect: () => { throw new Error('nope'); } } })).toBe(false);
    expect(rumble({ vibrationActuator: { playEffect: () => Promise.resolve() } })).toBe(true);
  });
});
