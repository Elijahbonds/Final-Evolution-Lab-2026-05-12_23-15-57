// Where the result lives (SCREEN-SHIP A4-6, Squad gate 5; SCREEN-FIX Cyber 1–2): this tab's sessionStorage only; the
// age answer written once per run and locked stricter-only (a new Start / Film dunk session resets it — AGE-RESET,
// audit 2.2); everything else only after the age answer and (under 18, or no age) "A grown-up is with me"; never
// localStorage; "Done, clear" removes every screen key but the age lock.
import { beforeEach, describe, expect, it } from 'vitest';
import { GROWN_UP_TEXT_VERSION } from './copy';
import { summarize } from './checks';
import { PRE_START, preStep, type PreEvent } from './flow';
import { gradeSession } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import {
  KEYS, LEGACY_LOCAL_KEYS, SCREEN_PREFIX, clearScreen, forgetAgeForTests, gateRecord, keepResult, lockAge, mayPersist, readAge, readResult,
  recall, remember, resetAge, writeResult, writeTakeoff, type GateRecord, type StorageLike,
} from './store';

/** A Storage that records every write. */
class MemStore implements StorageLike {
  m = new Map<string, string>();
  writes: string[] = [];
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes.push(k); this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const cal = syntheticCalibration();
const SUMMARY = summarize(gradeSession({
  calibration: cal, T1: { front: ohsFront({ kneeInL: 0.06 }).frames, side: ohsSide().frames },
  T2: { left: kneeWall('left').frames, right: kneeWall('right').frames },
  T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames }, T5: cmj([0, 1, 2].map(() => ({ heightM: 0.4 }))).frames,
}))!;

let s: MemStore;
beforeEach(() => { s = new MemStore(); clearScreen(null); forgetAgeForTests(); });

describe('the age answer: written once per run, then locked stricter-only', () => {
  it('the first answer is written under the screen prefix, and read back', () => {
    expect(readAge(s)).toBeNull();
    expect(lockAge(s, '13-17')).toBe('13-17');
    expect(s.writes).toEqual([KEYS.age]);
    expect(KEYS.age.startsWith(SCREEN_PREFIX)).toBe(true);
    expect(readAge(s)).toBe('13-17');
  });

  it('a looser second answer in the same run is refused: the stricter one holds and nothing is written', () => {
    lockAge(s, 'under-13');
    expect(lockAge(s, '18+')).toBe('under-13');
    expect(lockAge(s, '13-17')).toBe('under-13');
    expect(s.writes).toEqual([KEYS.age]);
    expect(readAge(s)).toBe('under-13');
  });

  it('a stricter second answer in the same run TIGHTENS the lock and is written; it can never loosen back', () => {
    lockAge(s, '18+');
    expect(lockAge(s, '13-17')).toBe('13-17');                 // a conflicting answer goes to the strictest band
    expect(readAge(s)).toBe('13-17');
    expect(lockAge(s, '18+')).toBe('13-17');                   // and never loosens again within the run
    expect(lockAge(s, 'under-13')).toBe('under-13');
    expect(readAge(s)).toBe('under-13');
    expect(lockAge(s, '13-17')).toBe('under-13');
    expect(lockAge(s, 'unknown')).toBe('under-13');            // equal-rank strictest keeps the held band
    expect(s.writes).toEqual([KEYS.age, KEYS.age, KEYS.age]);
  });

  it('resetAge: a new run asks again — the stored key and the page\'s memory both go', () => {
    lockAge(s, '18+');
    resetAge(s);
    expect(readAge(s)).toBeNull();
    expect(s.getItem(KEYS.age)).toBeNull();
    // and the next answer is a fresh lock, not a conflict with the last person's
    expect(lockAge(s, 'under-13')).toBe('under-13');
    expect(readAge(s)).toBe('under-13');
  });

  it('resetAge on a clean device makes no storage call at all', () => {
    let ops = 0;
    const clean: StorageLike = { length: 0, key: () => null, getItem: () => null, setItem: () => { ops++; }, removeItem: () => { ops++; } };
    resetAge(clean);
    expect(ops).toBe(0);
  });

  it('a browser that refuses sessionStorage still holds the lock for the page\'s life', () => {
    const refusing: StorageLike = { length: 0, key: () => null, getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(lockAge(refusing, 'unknown')).toBe('unknown');
    expect(lockAge(refusing, '18+')).toBe('unknown');
    expect(readAge(null)).toBe('unknown');
    expect(() => resetAge(refusing)).not.toThrow();
    expect(readAge(null)).toBeNull();                          // the reset reaches the page's memory too
  });

  it('a hand-edited answer that is not a band reads as none', () => {
    s.setItem(KEYS.age, 'adult');
    expect(readAge(s)).toBeNull();
  });

  it('"Done, clear my results" keeps the lock; everything else goes', () => {
    lockAge(s, '18+');
    writeResult(s, gateRecord('18+', false), SUMMARY);                // CHANGED (SCREEN-FIX-2): was an under-13 result, which is never kept now
    clearScreen(s);
    expect([...s.m.keys()]).toEqual([KEYS.age]);
    expect(readAge(s)).toBe('18+');
  });
});

describe('the grown-up step comes first', () => {
  it('with no age answered, nothing is written', () => {
    expect(writeResult(s, null, SUMMARY)).toBe(false);
    expect(writeTakeoff(s, null, 'left')).toBe(false);
    expect(s.writes).toEqual([]);
  });

  it('under 18, or an age not given, writes nothing before "A grown-up is with me"', () => {
    for (const age of ['under-13', '13-17', 'unknown'] as const) {
      const g = gateRecord(age, false);
      expect(mayPersist(g), age).toBe(false);
      expect(writeResult(s, g, SUMMARY), age).toBe(false);
      expect(writeTakeoff(s, g, 'right'), age).toBe(false);
    }
    expect(s.writes).toEqual([]);
  });

  // CHANGED (SCREEN-FIX-2; FE PM + Research 11:50 AM PT): was "after the grown-up step (or for an adult) the result goes
  // to this tab's sessionStorage"; an under-18 result is never kept now, grown-up ticked or not
  it('an adult\'s result goes to this tab\'s sessionStorage, under screen keys only; an under-18 result never does', () => {
    for (const age of ['under-13', '13-17', 'unknown'] as const) {
      expect(writeResult(s, gateRecord(age, true), SUMMARY), age).toBe(false);
      expect(writeTakeoff(s, gateRecord(age, true), 'left'), age).toBe(false);
      expect(mayPersist(gateRecord(age, true)), age).toBe(false);
    }
    expect(s.writes).toEqual([]);
    const adult = new MemStore();
    expect(writeResult(adult, gateRecord('18+', false), SUMMARY)).toBe(true);
    expect(adult.writes.every((k) => k.startsWith(SCREEN_PREFIX))).toBe(true);
    expect(readResult(adult)!.summary).toEqual(SUMMARY);
  });

  it('keepResult: an adult\'s is remembered and written; a kid\'s nothing, anywhere', () => {
    expect(keepResult(s, gateRecord('13-17', true), SUMMARY)).toBe('kid');
    expect(keepResult(s, null, SUMMARY)).toBe('kid');
    expect(s.writes).toEqual([]);
    expect(recall(null)).toBeNull();
    expect(keepResult(s, gateRecord('18+', false), SUMMARY)).toBe('adult');
    expect(recall(null)!.summary).toEqual(SUMMARY);
    expect(readResult(s)!.summary).toEqual(SUMMARY);
  });

  it('the gate record holds exactly the age band, the grown-up checkbox, a timestamp and the text version', () => {
    const g = gateRecord('under-13', true, new Date('2026-09-29T12:00:00Z'));
    expect(g).toEqual({ ageBand: 'under-13', grownUp: true, at: '2026-09-29T12:00:00.000Z', textVersion: GROWN_UP_TEXT_VERSION });
    writeResult(s, gateRecord('18+', false), SUMMARY);                  // CHANGED (SCREEN-FIX-2): only an adult's is written
    expect(Object.keys(JSON.parse(s.getItem(KEYS.gate)!)).sort()).toEqual(['ageBand', 'at', 'grownUp', 'textVersion']);
  });

  it('a crafted result cannot skip the grown-up step: a minor\'s record without the checkbox reads as nothing', () => {
    s.setItem(KEYS.gate, JSON.stringify({ ageBand: '13-17', grownUp: false, at: 'x', textVersion: GROWN_UP_TEXT_VERSION }));
    s.setItem(KEYS.summary, JSON.stringify(SUMMARY));
    expect(readResult(s)).toBeNull();
    s.setItem(KEYS.gate, JSON.stringify({ ageBand: '13-17', grownUp: true, at: 'x', textVersion: 'old' }));
    expect(readResult(s)).toBeNull();
    // ADDED (SCREEN-FIX-2): a kid's record reads as nothing even with the checkbox and the current wording
    s.setItem(KEYS.gate, JSON.stringify({ ageBand: '13-17', grownUp: true, at: 'x', textVersion: GROWN_UP_TEXT_VERSION }));
    expect(readResult(s)).toBeNull();
    s.setItem(KEYS.gate, JSON.stringify({ ageBand: '18+', grownUp: false, at: 'x', textVersion: GROWN_UP_TEXT_VERSION, name: 'extra' }));
    expect(readResult(s)).toBeNull();                          // an extra field is refused: the record holds four
  });

  it('the text version was bumped: a gate record from the screen-v1 wording no longer reads', () => {
    expect(GROWN_UP_TEXT_VERSION).toBe('screen-grown-up-v3-2026-09-29');      // CHANGED (SCREEN-FIX-2): was v2; the step's body changed
    // the v1 record's own shape (its checkbox field and version), as a tab from before this change holds it
    s.setItem(KEYS.gate, JSON.stringify({ ageBand: 'under-18', parentCheckbox: true, at: 'x', textVersion: 'screen-v1' }));
    s.setItem(KEYS.summary, JSON.stringify(SUMMARY));
    expect(readResult(s)).toBeNull();
  });

  it('a result with no gate record, a bad summary, or an old version is nothing', () => {
    s.setItem(KEYS.summary, JSON.stringify(SUMMARY));
    expect(readResult(s)).toBeNull();
    s.setItem(KEYS.gate, JSON.stringify(gateRecord('18+', false)));
    s.setItem(KEYS.summary, JSON.stringify({ ...SUMMARY, thresholdsVersion: 'jump-screen-0.1-provisional' }));
    expect(readResult(s)).toBeNull();
    s.setItem(KEYS.summary, JSON.stringify({ ...SUMMARY, lane: 'snowboard' }));
    expect(readResult(s)).toBeNull();
    s.setItem(KEYS.summary, '{not json');
    expect(readResult(s)).toBeNull();
  });
});

describe('clearing, and a new screen', () => {
  it('"Done, clear my results" removes every screen key but the age lock, keeps the rest, and PR #20\'s old localStorage keys go too', () => {
    writeResult(s, gateRecord('18+', false), SUMMARY);
    writeTakeoff(s, gateRecord('18+', false), 'left');
    s.setItem('fel.agent', '1');
    const local = new MemStore();
    for (const k of LEGACY_LOCAL_KEYS) local.setItem(k, 'x');
    clearScreen(s, local);
    expect([...s.m.keys()]).toEqual(['fel.agent']);
    expect(local.length).toBe(0);
    expect(readResult(s)).toBeNull();
    // ADDED (SCREEN-FIX-2): a clean device's localStorage sees no call at all
    const clean = new MemStore();
    let removes = 0;
    clean.removeItem = () => { removes++; };
    clearScreen(s, clean);
    expect(removes).toBe(0);
  });

  it('the page\'s memory is held under the same gate and cleared with the keys', () => {
    remember(gateRecord('unknown', false), SUMMARY);
    expect(recall(null)).toBeNull();
    remember(gateRecord('18+', false), SUMMARY);
    expect(recall(null)!.summary).toEqual(SUMMARY);
    clearScreen(s);
    expect(recall(null)).toBeNull();
  });

  it('no storage (a browser that refuses it) is not a crash', () => {
    expect(writeResult(null, gateRecord('18+', false), SUMMARY)).toBe(false);
    expect(readResult(null)).toBeNull();
    const throwing: StorageLike = { length: 0, key: () => null, getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(writeResult(throwing, gateRecord('18+', false), SUMMARY)).toBe(false);
    expect(readResult(throwing)).toBeNull();
    expect(() => clearScreen(throwing, throwing)).not.toThrow();
  });
});

// AGE-RESET (audit 2.2, 2026-10-03): on a shared phone the next person is not the last one. Two runs back-to-back in
// one tab: the second Start clears the first person's answer, the age question comes back, and a kid answering after
// an adult gets kid handling — the grown-up step, and nothing kept.
describe('a new Start asks the age again: nobody inherits the last person\'s answer', () => {
  /** The page (assess-app.tsx pre()): a start wipes the old screen AND the age, then the flow runs. */
  const page = (tab: MemStore) => {
    let pre = PRE_START;
    return {
      run(events: PreEvent[]) {
        for (const e of events) {
          if (e.type === 'start') { clearScreen(tab); resetAge(tab); }
          pre = preStep(pre, e.type === 'start' ? { type: 'start', locked: readAge(tab) }
            : e.type === 'age' ? { type: 'age', age: lockAge(tab, e.age) } : e);
        }
      },
      get pre() { return pre; },
    };
  };

  it.each(['13-17', 'under-13'] as const)('adult, then %s, in one tab: the second run answers again, gets the grown-up step and keeps nothing', (second) => {
    const p = page(s);
    p.run([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }, { type: 'takeoff', side: 'left' }, { type: 'cameraOn' }]);
    expect(p.pre.step).toBe('camera');
    expect(keepResult(s, p.pre.gate, SUMMARY)).toBe('adult');
    expect(readAge(s)).toBe('18+');

    p.run([{ type: 'start' }]);
    expect(p.pre.step).toBe('age');                                // the question is asked again
    expect(readAge(s)).toBeNull();
    p.run([{ type: 'age', age: second }]);
    expect(p.pre.step).toBe('grownUp');                            // kid handling: the grown-up step before the camera
    p.run([{ type: 'grownUp' }, { type: 'pain', hurts: false }, { type: 'takeoff', side: 'right' }, { type: 'cameraOn' }]);
    expect(p.pre.step).toBe('camera');
    expect(keepResult(s, p.pre.gate, SUMMARY)).toBe('kid');        // and nothing of theirs is kept
    expect(readResult(s)).toBeNull();
    expect(readAge(s)).toBe(second);                               // only their own age answer remains
  });

  it('kid, then adult, in one tab: the second run answers 18 or older and keeps its result', () => {
    const p = page(s);
    p.run([{ type: 'start' }, { type: 'age', age: 'under-13' }, { type: 'grownUp' }, { type: 'pain', hurts: false }, { type: 'takeoff', side: null }, { type: 'cameraOn' }]);
    expect(keepResult(s, p.pre.gate, SUMMARY)).toBe('kid');
    p.run([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }, { type: 'takeoff', side: 'left' }, { type: 'cameraOn' }]);
    expect(p.pre.step).toBe('camera');
    expect(keepResult(s, p.pre.gate, SUMMARY)).toBe('adult');
    expect(readResult(s)!.summary).toEqual(SUMMARY);
  });
});

describe('never localStorage', () => {
  it('the store\'s only writes are to the storage it is handed; the page hands it sessionStorage', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'store.ts'), 'utf8');
    expect(src).toMatch(/window\.sessionStorage/);
    // localStorage is reached once, only to REMOVE PR #20's two old keys
    expect(src.match(/window\.localStorage/g)!.length).toBe(1);
    // CHANGED (SCREEN-FIX-2): was `local?.removeItem(k)` for both keys; now only a key that is there is removed
    expect(src).toMatch(/for \(const k of LEGACY_LOCAL_KEYS\) if \(local && local\.getItem\(k\) !== null\) local\.removeItem\(k\)/);
    expect(src).not.toMatch(/local\??\.setItem|localStorage\.setItem|indexedDB|document\.cookie/);
  });
  it('a record for the gate type-checks as exactly four fields', () => {
    const g: GateRecord = { ageBand: '18+', grownUp: false, at: '', textVersion: '' };
    expect(Object.keys(g)).toHaveLength(4);
  });
});
