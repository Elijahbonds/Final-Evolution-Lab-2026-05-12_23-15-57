// END SCREEN — personal bests and win runs, computed on this device (the server sends none).
import { describe, it, expect } from 'vitest';
import { applyRun, parseRecords, playedOn, localDay, EMPTY_RECORDS, memoryStore, mergeAccountBest, readAccountBestAnswer, type DeviceRecords } from './records';

const T = new Date(2026, 9, 6, 20, 30).getTime();
const run = (o: Partial<Parameters<typeof applyRun>[1]> = {}) => ({ mode: 'threePoint', score: 20, won: true, accepted: true, nowMs: T, ...o });

describe('personal best', () => {
  it('a first accepted run is logged, not called a beaten record', () => {
    const { next, callouts } = applyRun(EMPTY_RECORDS, run({ score: 18 }));
    expect(callouts).toMatchObject({ firstRun: true, newBest: false, previousBest: null, best: 18 });
    expect(next.modes.threePoint).toMatchObject({ best: 18, runs: 1 });
  });

  it('beating the best is a NEW PERSONAL BEST, with what it was', () => {
    const a = applyRun(EMPTY_RECORDS, run({ score: 18 })).next;
    const { callouts, next } = applyRun(a, run({ score: 21 }));
    expect(callouts).toMatchObject({ newBest: true, previousBest: 18, best: 21, shortBy: null });
    expect(next.modes.threePoint.best).toBe(21);
  });

  it('equalling the best is not a new best; falling short says by how much', () => {
    const a = applyRun(EMPTY_RECORDS, run({ score: 18 })).next;
    expect(applyRun(a, run({ score: 18 })).callouts).toMatchObject({ newBest: false, shortBy: null });
    expect(applyRun(a, run({ score: 11 })).callouts).toMatchObject({ newBest: false, shortBy: 7, best: 18 });
  });

  it('a run the server did not accept (NO PLAY, unpaid, an Arena refusal) never sets a best — but still counts as played today', () => {
    const a = applyRun(EMPTY_RECORDS, run({ score: 18 })).next;
    const { next, callouts } = applyRun(a, run({ score: 99_999, accepted: false }));
    expect(callouts).toBeNull();
    expect(next.modes.threePoint.best).toBe(18);
    expect(next.modes.threePoint.runs).toBe(1);
    expect(playedOn(next, localDay(T)).has('threePoint')).toBe(true);
  });

  it('modes keep their own bests', () => {
    let r = applyRun(EMPTY_RECORDS, run({ mode: 'golf', score: 300 })).next;
    r = applyRun(r, run({ mode: 'tennis', score: 5 })).next;
    expect(applyRun(r, run({ mode: 'tennis', score: 6 })).callouts?.newBest).toBe(true);
    expect(applyRun(r, run({ mode: 'golf', score: 6 })).callouts?.newBest).toBe(false);
  });
});

describe('win runs', () => {
  it('counts wins in a row and resets on a loss', () => {
    let r: DeviceRecords = EMPTY_RECORDS;
    const outs: number[] = [];
    for (const won of [true, true, true, false, true]) {
      const x = applyRun(r, run({ won }));
      r = x.next; outs.push(x.callouts!.winRun);
    }
    expect(outs).toEqual([1, 2, 3, 0, 1]);
  });
});

describe('played today, the Signature day, and storage that lies', () => {
  it('played today is by local day', () => {
    const r = applyRun(EMPTY_RECORDS, run()).next;
    expect([...playedOn(r, localDay(T))]).toEqual(['threePoint']);
    expect(playedOn(r, localDay(T + 86_400_000)).size).toBe(0);
  });

  it('a Signature run marks the day', () => {
    expect(applyRun(EMPTY_RECORDS, run({ signatureRun: true })).next.signatureDay).toBe(localDay(T));
    expect(applyRun(EMPTY_RECORDS, run()).next.signatureDay).toBeUndefined();
  });

  it('garbage, an old version or a broken entry in storage reads as nothing, never a crash', () => {
    for (const raw of [null, '', '{', '"x"', '{"v":2,"modes":{}}', '{"v":1}', '{"v":1,"modes":null}']) expect(parseRecords(raw)).toEqual({ v: 1, modes: {} });
    expect(parseRecords('{"v":1,"modes":{"golf":{"best":"NaN","runs":-3,"winRun":2.7},"x":null}}').modes).toEqual({ golf: { best: 0, runs: 0, winRun: 2 } });
    const round = applyRun(EMPTY_RECORDS, run({ signatureRun: true })).next;
    expect(parseRecords(JSON.stringify(round))).toEqual(round);
  });

  it('the in-memory store round-trips (what the dev fixture and the card tests use)', () => {
    const s = memoryStore();
    s.save(applyRun(s.load(), run()).next);
    expect(s.current.modes.threePoint.best).toBe(20);
  });
});

// IMPROVE (2026-10-06, owner decision): verified adults' bests come from the account and are merged with this device's;
// teens (and anyone the server answers { scope: 'device' }) keep this device's records exactly as they were.
describe('the account\'s best, merged', () => {
  const device = applyRun(EMPTY_RECORDS, run({ score: 30, won: true })).next;   // this device: best 30, 1 run, 1 win in a row

  it('a higher best set elsewhere becomes the best to beat here — a 35 is no record against an account best of 40', () => {
    const merged = mergeAccountBest(device, { mode: 'threePoint', best: 40, runs: 12 });
    expect(merged.modes.threePoint).toMatchObject({ best: 40, runs: 12, winRun: 1 });
    const { callouts } = applyRun(merged, run({ score: 35 }));
    expect(callouts).toMatchObject({ newBest: false, firstRun: false, previousBest: 40, shortBy: 5 });
    expect(applyRun(merged, run({ score: 41 })).callouts).toMatchObject({ newBest: true, previousBest: 40 });
  });

  it('the merge only raises: a lower account best leaves this device\'s best alone', () => {
    expect(mergeAccountBest(device, { mode: 'threePoint', best: 12, runs: 3 }).modes.threePoint.best).toBe(30);
  });

  it('a first run on this device is not a "first run" when the account has played the mode', () => {
    const merged = mergeAccountBest(EMPTY_RECORDS, { mode: 'golf', best: 500, runs: 4 });
    expect(applyRun(merged, run({ mode: 'golf', score: 450 })).callouts).toMatchObject({ firstRun: false, previousBest: 500 });
  });

  it('teen locality: a device-scoped answer (or none) changes nothing at all', () => {
    expect(readAccountBestAnswer({ scope: 'device' }, 'threePoint')).toBeNull();
    expect(mergeAccountBest(device, null)).toBe(device);
    expect(mergeAccountBest(device, readAccountBestAnswer({ scope: 'device', best: 999, runs: 9 }, 'threePoint'))).toBe(device);
  });

  it('the answer is checked: the wrong mode, no best or a junk best is no account best', () => {
    expect(readAccountBestAnswer({ scope: 'account', mode: 'golf', best: 9, runs: 1 }, 'threePoint')).toBeNull();
    expect(readAccountBestAnswer({ scope: 'account', mode: 'golf', best: null, runs: 0 }, 'golf')).toBeNull();
    expect(readAccountBestAnswer({ scope: 'account', mode: 'golf', best: 'x', runs: 1 }, 'golf')).toBeNull();
    expect(readAccountBestAnswer({ scope: 'account', mode: 'golf', best: 9, runs: 2 }, 'golf')).toEqual({ mode: 'golf', best: 9, runs: 2 });
    expect(mergeAccountBest(device, { mode: 'threePoint', best: 50, runs: 0 })).toBe(device);
  });
});
