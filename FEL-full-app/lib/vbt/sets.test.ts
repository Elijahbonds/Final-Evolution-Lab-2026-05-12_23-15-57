// A kept set is numbers only, validated the same on the route and the phone; the phone's history and the milestones
// survive a broken storage; the copy says "estimate" and no medical word.
import { describe, expect, it } from 'vitest';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import { FIXED_LINES, ESTIMATE_LINE, setupLines, statusLine } from './copy';
import { filmSet } from './bench';
import { LIFTS } from './lifts';
import { VbtLive } from './live';
import { addMilestones, openChallenges, readMilestones } from './milestones';
import { barSpeedDays, cleanSet, keepDeviceSet, keptOf, readDeviceSets, type KeptSet } from './sets';

function store(): Storage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) } as never;
}
const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };

function aSet(): KeptSet {
  const f = filmSet(LIFTS.back_squat, { reps: [0.8, 0.7].map((v) => ({ romM: 0.5, concMs: 500 / v })) }, { fps: 60, seed: 2, plate: true });
  const live = new VbtLive({ lift: 'back_squat', loadKg: 100, heightM: f.heightM, aspect: f.aspect });
  for (const fr of f.frames) live.push(fr);
  return keptOf(live.finish(), { day: '2026-10-25', at: 1, lift: 'back_squat', loadKg: 100, warmup: true, band: 'normal' })!;
}

describe('a kept set', () => {
  it('carries numbers only: no frame, landmark or picture', () => {
    const s = aSet();
    expect(Object.keys(s).sort()).toEqual(['at', 'band', 'bestMcv', 'bestPv', 'day', 'fps', 'lastMcv', 'lift', 'loadKg', 'lossPct', 'meanMcv', 'partials', 'repMcvs', 'reps', 'source', 'stopPct', 'warmup']);
    expect(s.reps).toBe(2);
    expect(cleanSet(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it('refuses the implausible and the unknown', () => {
    const s = aSet();
    for (const bad of [{ lift: 'curl' }, { loadKg: 900 }, { bestMcv: 40 }, { repMcvs: ['x'] }, { day: 'today' }, { source: 'video' }, { reps: 1.5 }, { band: 'great' }]) {
      expect(cleanSet({ ...s, ...bad }), JSON.stringify(bad)).toBeNull();
    }
  });

  it('the phone keeps them newest first; blocked storage keeps nothing and never throws', () => {
    const st = store();
    const a = aSet(), b = { ...aSet(), at: 5 };
    expect(keepDeviceSet(st, a)).toBe(true);
    expect(keepDeviceSet(st, b)).toBe(true);
    expect(readDeviceSets(st).map((x) => x.at)).toEqual([5, 1]);
    expect(keepDeviceSet(broken, a)).toBe(false);
    expect(readDeviceSets(broken)).toEqual([]);
    st.map.set('fel.vbt.sets.v1', '{not json');
    expect(readDeviceSets(st)).toEqual([]);
  });

  it('a warm-up set is a bar-speed readiness day', () => {
    const d = barSpeedDays([aSet()]);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ lift: 'back_squat', loadKg: 100, band: 'normal' });
  });
});

describe('milestones on the device', () => {
  it('ids only, new ones reported once, a broken storage never throws', () => {
    const st = store();
    expect(addMilestones(st, ['first_set', 'body_1ms'])).toEqual(['first_set', 'body_1ms']);
    expect(addMilestones(st, ['first_set'])).toEqual([]);
    expect(readMilestones(st)).toEqual(['first_set', 'body_1ms']);
    expect(openChallenges(st).map((c) => c.id)).toEqual(['first_set', 'body_1ms']);
    st.map.set('fel.vbt.milestones.v1', JSON.stringify(['first_set', 'made_up', 7]));
    expect(readMilestones(st)).toEqual(['first_set']);
    expect(addMilestones(broken, ['first_set'])).toEqual(['first_set']);
  });
});

describe('copy', () => {
  it('no medical words; the estimate line says estimate', () => {
    const all = [...FIXED_LINES, ...(['barbell', 'dbkb', 'body', 'medball'] as const).flatMap(setupLines), ...(['waiting', 'no_body', 'no_ruler', 'reading'] as const).map(statusLine)];
    for (const l of all) expect(l, l).not.toMatch(MEDICAL_WORDS);
    expect(ESTIMATE_LINE).toMatch(/estimate/i);
  });
});
