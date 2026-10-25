// COMBINE-DAY: the run screen's moves (record, no-mark, redo, next athlete) and the draft kept on the coach's phone.
import { describe, expect, it } from 'vitest';
import { adhocAthlete, cleanEvent, cleanName, DRAFTS_KEY, dropDraft, keepDraft, lineFor, loadDrafts, MAX_DRAFTS, newEvent, nextAthlete, nextSlot, recordAttempts, redoAttempt, setReach, stationProgress, type DraftStorage } from './draft';
import { parseStation, parseStations, stationId, stationName, formatValue, MAX_ATTEMPTS, MAX_STATIONS, SKILL_DRILLS } from './catalogue';
import type { CombineAthlete } from './types';

const adult = (id: string): CombineAthlete => ({ id, name: id.toUpperCase(), source: 'roster', access: { testable: true, camera: true, saveCamera: false, held: null } });
const handOnly = (id: string): CombineAthlete => ({ id, name: id, source: 'roster', access: { testable: true, camera: false, saveCamera: false, held: null } });
const JUMP = { kind: 'cmj', variant: 'standing', attempts: 3 } as const;
const SPRINT = { kind: 'sprint', variant: '40yd', attempts: 2 } as const;
const J = stationId('cmj', 'standing'), S = stationId('sprint', '40yd');

function memStore(): DraftStorage & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
}

const ev0 = () => newEvent({ name: 'Tryout', athletes: [adult('a'), adult('b'), handOnly('h')], stations: [{ id: '', ...JUMP }, { id: '', ...SPRINT }], now: 1000, localId: 'L1' });

describe('the catalogue', () => {
  it('parses only real stations and variants, clamps attempts 1–5, and never runs a station twice', () => {
    expect(parseStation({ kind: 'sprint', variant: '40yd', attempts: 9 })).toEqual({ id: 'sprint:40yd', kind: 'sprint', variant: '40yd', attempts: MAX_ATTEMPTS });
    expect(parseStation({ kind: 'sprint', variant: '100yd' })).toBeNull();
    expect(parseStation({ kind: 'laser', variant: 'x' })).toBeNull();
    expect(parseStation({ kind: 'cmj', variant: 'standing', attempts: 0 })?.attempts).toBe(1);
    expect(parseStations([{ kind: 'cmj', variant: 'standing' }, { kind: 'cmj', variant: 'standing', attempts: 2 }])).toHaveLength(1);
    const many = Array.from({ length: 12 }, (_, i) => ({ kind: 'sprint', variant: ['10yd', '20yd', '40yd', '10m', '20m', '30m'][i % 6] }));
    expect(parseStations([...many, ...SKILL_DRILLS.map((d) => ({ kind: 'skill', variant: d.id }))]).length).toBe(MAX_STATIONS);
  });

  it('every hand-timed station says so in its name; the skill drills are the scored Mirror drills', () => {
    expect(stationName({ kind: 'sprint', variant: '40yd' })).toBe('Sprint · 40 yd (hand-timed)');
    expect(stationName({ kind: 'agility', variant: 'pro-agility' })).toBe('Agility · 5-10-5 pro agility (hand-timed)');
    expect(stationName({ kind: 'cmj', variant: 'standing' })).toBe('Vertical jump');
    expect(SKILL_DRILLS.length).toBeGreaterThan(3);
    expect(SKILL_DRILLS.map((d) => d.id)).toContain('t-drill');
    expect(SKILL_DRILLS.map((d) => d.id)).not.toContain('wake-up');   // the ten-minute warm-up is not a test
  });

  it('values in the station\'s words, never a ± (no accuracy claims)', () => {
    expect(formatValue('cmj', 50.8)).toBe('20.0 in');
    expect(formatValue('sprint', 4.8)).toBe('4.80 s');
    expect(formatValue('skill', 83.4)).toBe('83%');
    expect(formatValue('cmj', null)).toBe('—');
  });
});

describe('the run', () => {
  it('records into the next free slot, a no-mark as null, and nothing past the attempts', () => {
    let ev = ev0();
    ev = recordAttempts(ev, 'a', J, [{ value: 40.1 }], 2000);
    ev = recordAttempts(ev, 'a', J, [{ value: null }, { value: 42.3 }, { value: 99 }], 3000);
    expect(ev.results.a[J].map((s) => s?.value)).toEqual([40.1, null, 42.3]);
    expect(nextSlot(ev, 'a', J)).toBeNull();
    expect(ev.updatedAt).toBe(3000);
    // a negative or non-number value is a no-mark, never a number
    ev = recordAttempts(ev, 'b', S, [{ value: -1 }, { value: Number.NaN }]);
    expect(ev.results.b[S].map((s) => s?.value)).toEqual([null, null]);
  });

  it('redo clears the latest attempt (or a chosen one), so it is taken again', () => {
    let ev = recordAttempts(ev0(), 'a', J, [{ value: 40 }, { value: 41 }]);
    ev = redoAttempt(ev, 'a', J);
    expect(ev.results.a[J].map((s) => s?.value ?? 'empty')).toEqual([40, 'empty', 'empty']);
    expect(nextSlot(ev, 'a', J)).toBe(1);
    ev = redoAttempt(ev, 'a', J, 0);
    expect(nextSlot(ev, 'a', J)).toBe(0);
    expect(redoAttempt(ev, 'a', J)).toBe(ev);   // nothing to redo: unchanged
  });

  it('a hand-only athlete is not in the camera station\'s line and cannot be recorded there', () => {
    const ev = ev0();
    expect(lineFor(ev, J).map((a) => a.id)).toEqual(['a', 'b']);
    expect(lineFor(ev, S).map((a) => a.id)).toEqual(['a', 'b', 'h']);
    expect(recordAttempts(ev, 'h', J, [{ value: 40 }])).toBe(ev);
  });

  it('next athlete: the next in line with an attempt left, wrapping; null when the station is done', () => {
    let ev = ev0();
    expect(nextAthlete(ev, S, null)).toBe('a');
    expect(nextAthlete(ev, S, 'a')).toBe('b');
    expect(nextAthlete(ev, S, 'h')).toBe('a');
    ev = recordAttempts(ev, 'b', S, [{ value: 5 }, { value: 5.1 }]);
    expect(nextAthlete(ev, S, 'a')).toBe('h');
    ev = recordAttempts(recordAttempts(ev, 'a', S, [{ value: 5 }, { value: 5 }]), 'h', S, [{ value: 5 }, { value: null }]);
    expect(nextAthlete(ev, S, 'a')).toBeNull();
    expect(stationProgress(ev, S)).toEqual({ done: 6, total: 6 });
  });

  it('a typed athlete is held (age unknown) and never in a line', () => {
    const ev = newEvent({ name: '', athletes: [adult('a'), adhocAthlete('Sam  Jones\u0007', [adult('a')])], stations: [{ id: '', ...SPRINT }], now: Date.UTC(2026, 9, 25) });
    expect(ev.name).toMatch(/^Combine Oct 2[45]$/);
    expect(ev.athletes[1]).toMatchObject({ id: 'adhoc:1', name: 'Sam Jones', source: 'adhoc', access: { testable: false, camera: false, held: 'age_unknown' } });
    expect(lineFor(ev, S).map((a) => a.id)).toEqual(['a']);
  });

  it('a standing reach is kept for a camera athlete only, numbers only', () => {
    const ev = setReach(ev0(), 'a', { reachOverLeg: 2.4, reachOverLegSd: 0.02 });
    expect(ev.reach).toEqual({ a: { reachOverLeg: 2.4, reachOverLegSd: 0.02 } });
    expect(setReach(ev, 'h', { reachOverLeg: 2.4, reachOverLegSd: 0.02 }).reach.h).toBeUndefined();
    expect(setReach(ev, 'b', { reachOverLeg: -1, reachOverLegSd: 0 })).toBe(ev);
  });
});

describe('the draft on the phone', () => {
  it('keeps, replaces, lists newest first and drops', () => {
    const s = memStore();
    const a = ev0();
    expect(keepDraft(a, s)).toBe(true);
    const b = { ...newEvent({ name: 'B', athletes: [], stations: [], localId: 'L2', now: 5000 }) };
    keepDraft(b, s);
    keepDraft(recordAttempts(a, 'a', J, [{ value: 40 }], 9000), s);
    const list = loadDrafts(s);
    expect(list.map((d) => d.localId)).toEqual(['L1', 'L2']);
    expect(list[0].results.a[J][0]?.value).toBe(40);
    dropDraft('L1', s);
    expect(loadDrafts(s).map((d) => d.localId)).toEqual(['L2']);
  });

  it('keeps at most MAX_DRAFTS', () => {
    const s = memStore();
    for (let i = 0; i < MAX_DRAFTS + 3; i++) keepDraft(newEvent({ name: `E${i}`, athletes: [], stations: [], localId: `L${i}`, now: i }), s);
    expect(loadDrafts(s)).toHaveLength(MAX_DRAFTS);
  });

  it('no storage, broken storage or a bad shape: an empty list, never a throw', () => {
    expect(loadDrafts(null)).toEqual([]);
    expect(keepDraft(ev0(), null)).toBe(false);
    const broken: DraftStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadDrafts(broken)).toEqual([]);
    expect(keepDraft(ev0(), broken)).toBe(false);
    const s = memStore();
    s.data[DRAFTS_KEY] = '{not json';
    expect(loadDrafts(s)).toEqual([]);
    s.data[DRAFTS_KEY] = JSON.stringify([{ v: 2 }, 7, null]);
    expect(loadDrafts(s)).toEqual([]);
  });

  it('a stored draft is cleaned field by field: a forged access or a stray slot never survives', () => {
    const raw = {
      ...ev0(),
      athletes: [{ id: 'adhoc:1', name: 'X', source: 'roster', access: { testable: true, camera: true, saveCamera: true } }, { id: 'a', name: 'A', source: 'roster', access: { testable: false, camera: true } }],
      results: { 'adhoc:1': { [S]: [{ value: 5, at: 1 }] }, a: { [J]: [{ value: 'high', at: 1 }, { value: 41, at: 2, frames: [1, 2] }, null, { value: 50, at: 3 }] } },
    };
    const ev = cleanEvent(raw)!;
    expect(ev.athletes[0]).toMatchObject({ source: 'adhoc', access: { testable: false, camera: false, held: 'age_unknown' } });
    expect(ev.athletes[1].access).toEqual({ testable: false, camera: false, saveCamera: false, held: 'age_required' });
    expect(ev.results.a[J]).toEqual([{ value: null, at: 1 }, { value: 41, at: 2 }, null]);
  });

  it('a typed name loses control characters and is cut to 60', () => {
    expect(cleanName('  Spring\n\ttryout  ')).toBe('Spring tryout');
    expect(cleanName('x'.repeat(80))).toHaveLength(60);
    expect(cleanName(42, 'fallback')).toBe('fallback');
  });
});
