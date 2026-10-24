// COUCH TURNS (lane/hoops-couch, 2026-10-24): friends in one room each take their own 3PT run. The rules (lib/hoops/couchTurns),
// the per-slot routing on a real InputBus (two pads: P2's press never fires P1's shot), the turn order and hand-over, the scores
// per shooter, solo unchanged, and a couch shootout never ranked, staked or paid.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { InputBus, type FelInput } from '@/lib/babylon/core/InputBus';
import { recordTurnScore, turnsDone } from '@/lib/party/turns';
import { controllerConfigFor } from '@/lib/controller-link/schemas/registry';
import {
  MAX_SHOOTERS, activeShooter, couchBoard, couchLineup, couchTurnsBlocked, finalLine, handoffCopy, joinedCount, padDrives, phoneDrives,
  pickerShown, postsSession, shooterName, startCouch, turnLine, waitLine, wantAfterJoin, type CouchTurns,
} from './couchTurns';

const ROOT = path.resolve(__dirname, '../..');
const phone = (peerId: string, name: string, slot: number, connected = true) => ({ peerId, name, slot, ready: true, connected });
const bank = (c: CouchTurns, score: number): CouchTurns => ({ ...c, turns: recordTurnScore(c.turns, score) });

describe('the lineup: pads first, then phones, then the room (camera / keyboard)', () => {
  it('seats a pad as P1, a phone as P2 by name, and fills the rest with room seats', () => {
    const l = couchLineup(4, [{ slot: 0, name: 'DualSense' }], [phone('p-a', 'Jordan', 0)]);
    expect(l.map(shooterName)).toEqual(['P1', 'P2 JORDAN', 'P3', 'P4']);
    expect(l.map((s) => s.kind)).toEqual(['pad', 'phone', 'room', 'room']);
    expect(l[0].padSlot).toBe(0);
    expect(l[1].peerId).toBe('p-a');
  });
  it('one camera, no pads: room seats only', () => {
    expect(couchLineup(3, [], []).map((s) => `${s.label}:${s.kind}`)).toEqual(['P1:room', 'P2:room', 'P3:room']);
  });
  it('never more than four, never fewer than one; a phone that dropped is not seated', () => {
    expect(couchLineup(9, [], [])).toHaveLength(MAX_SHOOTERS);
    expect(couchLineup(0, [], [])).toHaveLength(1);
    expect(couchLineup(2, [], [phone('x', 'Gone', 0, false)])[0].kind).toBe('room');
  });
  it('a joiner adds a shooter; a leave does not take one away; the picker is the only way down', () => {
    expect(joinedCount([{ slot: 0, name: 'a' }, { slot: 1, name: 'b' }], [phone('x', 'J', 0), phone('y', 'K', 1, false)])).toBe(3);
    expect(wantAfterJoin(1, 1, 2)).toBe(2);
    expect(wantAfterJoin(3, 2, 1)).toBe(3);
    expect(wantAfterJoin(1, 0, 6)).toBe(4);
  });
});

describe('who drives: only the shooter who is up', () => {
  const two = couchLineup(2, [{ slot: 0, name: 'a' }, { slot: 1, name: 'b' }], []);
  it("P1's run: P1's pad drives, P2's does not; P2's run: the other way round", () => {
    expect(padDrives(two, 0, 0)).toBe(true);
    expect(padDrives(two, 0, 1)).toBe(false);
    expect(padDrives(two, 1, 0)).toBe(false);
    expect(padDrives(two, 1, 1)).toBe(true);
    expect(padDrives(two, 2, 0)).toBe(false);   // everyone has shot: nobody
  });
  it("a room seat's run (the camera, a passed pad): a pad no shooter holds drives, a seated pad never does", () => {
    const l = couchLineup(2, [{ slot: 0, name: 'a' }], []);   // P1 the pad, P2 the room
    expect(padDrives(l, 1, 0)).toBe(false);
    expect(padDrives(l, 1, 3)).toBe(true);
  });
  it("a phone drives only its own run", () => {
    const l = couchLineup(2, [], [phone('p1', 'Ann', 0), phone('p2', 'Bo', 1)]);
    expect(phoneDrives(l, 0, 'p1')).toBe(true);
    expect(phoneDrives(l, 0, 'p2')).toBe(false);
    expect(phoneDrives(l, 1, 'p2')).toBe(true);
    expect(phoneDrives(l, 1, undefined)).toBe(false);
  });
  it('the wait line names who is up', () => {
    expect(waitLine(two, 0)).toBe('P1 IS UP — WAIT FOR YOUR TURN');
    expect(waitLine(two.slice(0, 1), 0)).toBe('');
  });
});

describe('solo is unchanged', () => {
  it('one shooter: no shootout, every pad and phone drives, and the run posts as it always did', () => {
    const solo = couchLineup(1, [{ slot: 0, name: 'a' }, { slot: 1, name: 'b' }], [phone('p', 'C', 0)]);
    expect(solo).toHaveLength(1);
    expect(startCouch(solo)).toBeNull();
    for (const slot of [0, 1, 2, 3]) expect(padDrives(solo, 0, slot)).toBe(true);
    expect(padDrives([], 0, 1)).toBe(true);
    expect(phoneDrives(solo, 0, 'p')).toBe(true);
    expect(postsSession(1)).toBe(true);
  });
  it('the picker is not offered to one pad with no camera (the solo READY screen is the one it was)', () => {
    expect(pickerShown({ allowed: true, phase: 'ready', started: false, camera: false, joined: 1 })).toBe(false);
    expect(pickerShown({ allowed: true, phase: 'ready', started: false, camera: true, joined: 0 })).toBe(true);
    expect(pickerShown({ allowed: true, phase: 'ready', started: false, camera: false, joined: 2 })).toBe(true);
    expect(pickerShown({ allowed: true, phase: 'playing', started: false, camera: true, joined: 2 })).toBe(false);
    expect(pickerShown({ allowed: true, phase: 'ready', started: true, camera: true, joined: 2 })).toBe(false);
  });
});

describe('turn order, the hand-over and the scores per shooter', () => {
  it('three shooters each bank their own score, in order, and the board names every one', () => {
    let c = startCouch(couchLineup(3, [], [phone('j', 'Jordan', 0)]))!;
    expect(turnLine(c)).toBe('P1 JORDAN — YOUR RACK · 1 OF 3');
    c = bank(c, 14);
    expect(activeShooter(c)!.label).toBe('P2');
    expect(handoffCopy(c.shooters[1], c.shooters[0], true)).toEqual({ title: 'P2 — YOUR RACK', sub: 'P1, step out of the picture. P2, step in on your own and stand still.' });
    expect(couchBoard(c).map((r) => `${r.display}:${r.score ?? (r.up ? 'UP' : '-')}`)).toEqual(['P1 JORDAN:14', 'P2:UP', 'P3:-']);
    c = bank(c, 21);
    c = bank(c, 9);
    expect(turnsDone(c.turns)).toBe(true);
    expect(activeShooter(c)).toBeNull();
    expect(couchBoard(c).map((r) => [r.display, r.score, r.place])).toEqual([['P2', 21, 1], ['P1 JORDAN', 14, 2], ['P3', 9, 3]]);
    expect(finalLine(c)).toBe('P2 WINS · 21');
  });
  it('a tie says so; the hand-over copy without a camera names the controller', () => {
    let c = startCouch(couchLineup(2, [{ slot: 0, name: 'a' }, { slot: 1, name: 'b' }], []))!;
    c = bank(bank(c, 12), 12);
    expect(finalLine(c)).toBe('TIE AT 12 · P1 & P2');
    const l = couchLineup(2, [{ slot: 0, name: 'a' }], [phone('q', 'Sam', 0)]);
    expect(handoffCopy(l[0], null, false).sub).toBe('P1, your controller is live.');
    expect(handoffCopy(l[1], l[0], false).sub).toBe('P2, your phone is live.');
    expect(handoffCopy(couchLineup(2, [], [])[1], null, false).sub).toBe('Pass the controller to P2.');
  });
});

describe('a couch shootout is never ranked, staked or paid', () => {
  it('posts nothing for two to four shooters', () => {
    for (let n = 2; n <= MAX_SHOOTERS; n++) expect(postsSession(n)).toBe(false);
  });
  it('is not offered on a staked, ranked, challenge, Story, Carnival, online or party-room run', () => {
    for (const k of ['arena', 'mp', 'c', 'signature', 'story', 'carnival', 'net', 'party', 'ranked']) {
      expect(couchTurnsBlocked('/play/threepoint', `?${k}=1`), k).not.toBeNull();
      expect(couchTurnsBlocked('/play/threepoint', `?${k}=`), `${k} (empty)`).not.toBeNull();
    }
    expect(couchTurnsBlocked('/play/party', '?mode=threepoint')).toBe('PARTY_ROOM');
    expect(couchTurnsBlocked('/play/threepoint', '')).toBeNull();
    expect(couchTurnsBlocked('/play/threepoint', '?playtest=1')).toBeNull();
  });
  it("the host: a couch run returns before onEnd (nothing reaches POST /api/sessions), and the picker and gates are wired", () => {
    const src = readFileSync(path.join(ROOT, 'components/games/three-point-babylon.tsx'), 'utf8');
    const sink = src.slice(src.indexOf('const resultSink'), src.indexOf('onEndRef.current({'));
    expect(sink).toMatch(/if \(c && !postsSession\(c\.shooters\.length\)\) \{[\s\S]*?return;\s*\}/);
    expect(sink).toMatch(/bodyPlay\.handOver\(\)/);
    expect(src).toMatch(/bus\.padFilter = \(slot\) => padDrives\(/);
    expect(src).toMatch(/phoneDrives\(gateRef\.current\.shooters, gateRef\.current\.at, peerId\)/);
    expect(src).toMatch(/couchTurnsBlocked\(window\.location\.pathname, window\.location\.search\) === null/);
  });
  it("the controller registry's four for the shootout is now four real shooters", () => {
    expect(controllerConfigFor('threepoint')?.maxPlayers).toBe(MAX_SHOOTERS);
  });
});

// ── the routing on a real InputBus: two local pads, the merged stream the mode reads ─────────────────────────────────────
type FakePad = { id: string; index: number; mapping: string; connected: boolean; axes: number[]; buttons: { pressed: boolean; value: number }[] };
const pads: (FakePad | null)[] = [null, null, null, null];
const fake = (id: string, index: number): FakePad => ({ id, index, mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) });
const press = (p: FakePad, i: number, down = true): void => { p.buttons[i] = { pressed: down, value: down ? 1 : 0 }; };
const g = globalThis as unknown as Record<string, unknown>;
const saved: Record<string, unknown> = {};
beforeEach(() => {
  for (const k of ['window', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame']) saved[k] = g[k];
  pads.fill(null);
  g.window = { addEventListener: () => {}, removeEventListener: () => {} };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'Mozilla/5.0 (Macintosh)', maxTouchPoints: 0, getGamepads: () => pads } });
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = () => {};
});
afterEach(() => {
  for (const k of ['window', 'requestAnimationFrame', 'cancelAnimationFrame']) g[k] = saved[k];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: saved.navigator });
});

describe("InputBus.padFilter: P2's press never fires P1's shot", () => {
  function rig() {
    const bus = new InputBus();
    const merged: FelInput[] = [];
    bus.on((e) => merged.push(e));
    bus.start();
    const tick = () => (bus as unknown as { pollPads: () => void }).pollPads();
    return { bus, merged, tick, shots: () => merged.filter((e) => e.t === 'button' && e.btn === 'A' && e.pressed).length };
  }
  it('no filter (solo): either pad fires the one hero, as always', () => {
    const r = rig();
    pads[0] = fake('Xbox Wireless Controller', 0); pads[1] = fake('Xbox Wireless Controller', 1);
    r.tick();
    press(pads[1]!, 0); r.tick();
    expect(r.shots()).toBe(1);
  });
  it("a shootout: on P1's run P2's A reaches nothing; on P2's run P2's A fires and P1's does not", () => {
    const r = rig();
    pads[0] = fake('Xbox Wireless Controller', 0); pads[1] = fake('Xbox Wireless Controller', 1);
    r.tick();
    const lineup = couchLineup(2, r.bus.pads().map((p) => ({ slot: p.slot, name: p.name })), []);
    let c = startCouch(lineup)!;
    r.bus.padFilter = (slot) => padDrives(c.shooters, c.turns.at, slot);
    press(pads[1]!, 0); r.tick(); press(pads[1]!, 0, false); r.tick();
    expect(r.shots()).toBe(0);                    // P2 pressed during P1's run: no shot
    press(pads[0]!, 0); r.tick(); press(pads[0]!, 0, false); r.tick();
    expect(r.shots()).toBe(1);                    // P1's own press: P1's shot
    c = bank(c, 17);                              // P1's run is banked; P2 is up
    press(pads[0]!, 0); r.tick(); press(pads[0]!, 0, false); r.tick();
    expect(r.shots()).toBe(1);                    // P1 pressed during P2's run: no shot
    press(pads[1]!, 0); r.tick();
    expect(r.shots()).toBe(2);                    // P2's own press: P2's shot
  });
  it('the slot stream still hears every pad (the wait hint reads it)', () => {
    const r = rig();
    const slotted: number[] = [];
    r.bus.onSlot((e, slot) => { if (e.t === 'button' && e.pressed) slotted.push(slot); });
    pads[0] = fake('Xbox Wireless Controller', 0); pads[1] = fake('Xbox Wireless Controller', 1);
    r.tick();
    r.bus.padFilter = (slot) => slot === 0;
    press(pads[1]!, 0); r.tick();
    expect(slotted).toEqual([1]);
    expect(r.shots()).toBe(0);
  });
});
