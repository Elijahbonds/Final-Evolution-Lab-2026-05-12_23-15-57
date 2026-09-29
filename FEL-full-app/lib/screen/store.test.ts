// Where the result lives (SCREEN-SHIP A4-6, Squad gate 5): this tab's sessionStorage only, only after the age answer and
// (under 18, or no age) a parent's consent; never localStorage; "Done, clear" removes every screen key.
import { beforeEach, describe, expect, it } from 'vitest';
import { CONSENT_TEXT_VERSION } from './copy';
import { summarize } from './checks';
import { gradeSession } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import {
  KEYS, LEGACY_LOCAL_KEYS, SCREEN_PREFIX, clearScreen, gateRecord, mayPersist, readResult, recall, remember, writeResult, writeTakeoff,
  type GateRecord, type StorageLike,
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
beforeEach(() => { s = new MemStore(); clearScreen(null); });

describe('the consent gate comes first', () => {
  it('with no age answered, nothing is written', () => {
    expect(writeResult(s, null, SUMMARY)).toBe(false);
    expect(writeTakeoff(s, null, 'left')).toBe(false);
    expect(s.writes).toEqual([]);
  });

  it('under 18, or an age not given, writes nothing before a parent\'s consent', () => {
    for (const age of ['under-18', 'unknown'] as const) {
      const g = gateRecord(age, false);
      expect(mayPersist(g), age).toBe(false);
      expect(writeResult(s, g, SUMMARY), age).toBe(false);
      expect(writeTakeoff(s, g, 'right'), age).toBe(false);
    }
    expect(s.writes).toEqual([]);
  });

  it('after consent (or for an adult) the result goes to this tab\'s sessionStorage, under screen keys only', () => {
    expect(writeResult(s, gateRecord('under-18', true), SUMMARY)).toBe(true);
    expect(s.writes.every((k) => k.startsWith(SCREEN_PREFIX))).toBe(true);
    const adult = new MemStore();
    expect(writeResult(adult, gateRecord('18+', false), SUMMARY)).toBe(true);
    expect(readResult(adult)!.summary).toEqual(SUMMARY);
  });

  it('the consent record holds exactly the age band, the parent checkbox, a timestamp and the text version', () => {
    const g = gateRecord('under-18', true, new Date('2026-09-29T12:00:00Z'));
    expect(g).toEqual({ ageBand: 'under-18', parentCheckbox: true, at: '2026-09-29T12:00:00.000Z', textVersion: CONSENT_TEXT_VERSION });
    writeResult(s, g, SUMMARY);
    expect(Object.keys(JSON.parse(s.getItem(KEYS.gate)!)).sort()).toEqual(['ageBand', 'at', 'parentCheckbox', 'textVersion']);
  });

  it('a crafted result cannot skip consent: a minor\'s record without the checkbox reads as nothing', () => {
    s.setItem(KEYS.gate, JSON.stringify({ ageBand: 'under-18', parentCheckbox: false, at: 'x', textVersion: CONSENT_TEXT_VERSION }));
    s.setItem(KEYS.summary, JSON.stringify(SUMMARY));
    expect(readResult(s)).toBeNull();
    s.setItem(KEYS.gate, JSON.stringify({ ageBand: 'under-18', parentCheckbox: true, at: 'x', textVersion: 'old' }));
    expect(readResult(s)).toBeNull();
    s.setItem(KEYS.gate, JSON.stringify({ ageBand: '18+', parentCheckbox: false, at: 'x', textVersion: CONSENT_TEXT_VERSION, name: 'extra' }));
    expect(readResult(s)).toBeNull();                          // an extra field is refused: the record holds four
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
  it('"Done, clear my results" removes every screen key, keeps the rest, and PR #20\'s old localStorage keys go too', () => {
    writeResult(s, gateRecord('18+', false), SUMMARY);
    writeTakeoff(s, gateRecord('18+', false), 'left');
    s.setItem('fel.agent', '1');
    const local = new MemStore();
    for (const k of LEGACY_LOCAL_KEYS) local.setItem(k, 'x');
    clearScreen(s, local);
    expect([...s.m.keys()]).toEqual(['fel.agent']);
    expect(local.length).toBe(0);
    expect(readResult(s)).toBeNull();
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

describe('never localStorage', () => {
  it('the store\'s only writes are to the storage it is handed; the page hands it sessionStorage', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(__dirname, 'store.ts'), 'utf8');
    expect(src).toMatch(/window\.sessionStorage/);
    // localStorage is reached once, only to REMOVE PR #20's two old keys
    expect(src.match(/window\.localStorage/g)!.length).toBe(1);
    expect(src).toMatch(/for \(const k of LEGACY_LOCAL_KEYS\) local\?\.removeItem\(k\)/);
    expect(src).not.toMatch(/local\??\.setItem|localStorage\.setItem|indexedDB|document\.cookie/);
  });
  it('a record for the gate type-checks as exactly four fields', () => {
    const g: GateRecord = { ageBand: '18+', parentCheckbox: false, at: '', textVersion: '' };
    expect(Object.keys(g)).toHaveLength(4);
  });
});
