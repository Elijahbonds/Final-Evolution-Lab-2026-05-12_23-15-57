import { describe, expect, it } from 'vitest';
import { latestPerAttribute, numericDelta, prqDelta, toOutcomes, vouchedPrq } from './deltas';
import { PRQ_CAMERA_SOURCE, PRQ_ESTIMATE_SOURCES, isPrqEstimate } from '@/lib/prq';
import { PRQ_SOURCES } from '@/lib/prq-entries';
import { ageDaysOf, freshnessOf } from '@/lib/creator/claimClock';
import { boundFormSummary, heightCmForFlight, planFormWrite, powerFromJumpCm } from '@/lib/move/formSummary';
import { writeFormRead } from '@/lib/move/formWrite';

const d = (s: string) => new Date(s);
describe('Camp deltas', () => {
  it('takes the latest value per attribute at or before a date', () => {
    const e = [
      { attribute: 'speed', value: 60, measuredAt: d('2026-08-01') }, { attribute: 'speed', value: 64, measuredAt: d('2026-08-20') },
      { attribute: 'power', value: 50, measuredAt: d('2026-08-10') }, { attribute: 'speed', value: 70, measuredAt: d('2026-09-01') },
    ];
    expect(latestPerAttribute(e, null)).toEqual({ speed: 70, power: 50 });
    expect(latestPerAttribute(e, d('2026-08-25'))).toEqual({ speed: 64, power: 50 });
    expect(prqDelta(latestPerAttribute(e, d('2026-08-25')), latestPerAttribute(e, null))).toEqual({ speed: 6, power: 0 });
  });
  it('only reports attributes present on both sides', () => {
    expect(prqDelta({ speed: 1 }, { speed: 2.555, mental: 9 })).toEqual({ speed: 1.56 });
  });
  it('walks nested numeric leaves and ignores flags and strings', () => {
    const a = { pillars: { power: 40, mobility: 55 }, flags: ['x'], grade: 'B' };
    const b = { pillars: { power: 46, mobility: 52 }, flags: ['x', 'y'], grade: 'A' };
    expect(numericDelta(a, b)).toEqual({ 'pillars.power': 6, 'pillars.mobility': -3 });
    expect(numericDelta(null, b)).toEqual({});
  });
  it('maps game sessions to resiliency outcomes', () => {
    expect(toOutcomes([{ mode: 'dunk', won: false, createdAt: d('2026-09-01') }])).toEqual([{ at: d('2026-09-01').getTime(), modeKey: 'dunk', outcome: 'loss' }]);
  });
});

// Movement play, phase 10 (2026-09-24): the session's best measured jump is written as PRQ power with source 'camera'
// (lib/prq.ts PRQ_CAMERA_SOURCE). The owner: it "feeds PRQ power as a camera estimate, never the verified shield".
// `latestPerAttribute` is the PRQ VECTOR (it counts the estimate); `vouchedPrq` is what a card's shield may stand on
// (lib/creator/card-stats-server.ts reads profile.prq.vouched / vouchedAt). These pin the split.
describe('a camera estimate beside the verified PRQ', () => {
  type Entry = { attribute: string; value: number; measuredAt: Date; source: string };
  const DAY = 86_400_000;
  const NOW = Date.parse('2026-09-24T12:00:00.000Z');
  const at = (daysAgo: number, ms = 0) => new Date(NOW - daysAgo * DAY + ms);

  it('is an estimate; every other source a PrqEntry can carry is not (so the filter drops the estimate and nothing else)', () => {
    expect(isPrqEstimate(PRQ_CAMERA_SOURCE)).toBe(true);
    for (const s of PRQ_ESTIMATE_SOURCES) expect(PRQ_SOURCES as readonly string[], s).toContain(s);
    const verified = PRQ_SOURCES.filter((s) => !isPrqEstimate(s));
    expect([...verified].sort()).toEqual(['device', 'drillResult', 'manual']);
    // each verified source is vouched as it stands
    for (const source of verified) {
      expect(vouchedPrq([{ attribute: 'power', value: 57, measuredAt: at(2), source }]), source)
        .toEqual({ values: { power: 57 }, newestAt: at(2) });
    }
  });

  it('a camera power reading NEWER than a verified one leads the vector, and never replaces the verified value on the shield', () => {
    // a dunk session after a game session: the measured jump is the latest power reading in the vector (the route
    // writes it at the session's own moment and, since review D2, no drillResult power beside it: gameRowAttrs)...
    const e: Entry[] = [
      { attribute: 'strength', value: 61, measuredAt: at(10), source: 'manual' },
      { attribute: 'power', value: 55, measuredAt: at(0), source: 'drillResult' },
      { attribute: 'power', value: 92, measuredAt: at(0, 1), source: PRQ_CAMERA_SOURCE },
    ];
    expect(latestPerAttribute(e, null)).toEqual({ strength: 61, power: 92 });
    // ...and the vouched vector still carries the verified 55, dated by the verified row, not the camera one
    const v = vouchedPrq(e);
    expect(v.values).toEqual({ strength: 61, power: 55 });
    expect(v.newestAt).toEqual(at(0));
    expect(v.newestAt!.getTime()).toBeLessThan(at(0, 1).getTime());
  });

  it('a camera row stamped in the SAME millisecond as a verified one is still left out of the vouched vector', () => {
    const e: Entry[] = [
      { attribute: 'power', value: 40, measuredAt: at(1), source: 'manual' },
      { attribute: 'power', value: 99, measuredAt: at(1), source: PRQ_CAMERA_SOURCE },
    ];
    expect(vouchedPrq(e).values).toEqual({ power: 40 });
    expect(vouchedPrq([...e].reverse()).values).toEqual({ power: 40 });
  });

  it('adding camera rows (any attribute, any time, any value) never changes what is vouched', () => {
    const verified: Entry[] = [
      { attribute: 'speed', value: 64, measuredAt: at(20), source: 'manual' },
      { attribute: 'power', value: 48, measuredAt: at(12), source: 'drillResult' },
      { attribute: 'agility', value: 71, measuredAt: at(5), source: 'device' },
    ];
    const before = vouchedPrq(verified);
    const cams: Entry[] = [];
    for (const attribute of ['power', 'speed', 'agility', 'mental']) {
      for (const daysAgo of [30, 12, 5, 0]) {
        for (const value of [0, 50, 100]) cams.push({ attribute, value, measuredAt: at(daysAgo, 1), source: PRQ_CAMERA_SOURCE });
      }
    }
    expect(vouchedPrq([...verified, ...cams])).toEqual(before);
    expect(vouchedPrq([...cams, ...verified])).toEqual(before);
  });

  it('the shield clock does not tick on a camera jump: an old verified reading stays stale (or expired) beside a fresh estimate', () => {
    const now = NOW;
    const stale: Entry[] = [
      { attribute: 'power', value: 60, measuredAt: at(45), source: 'manual' },
      { attribute: 'power', value: 80, measuredAt: at(0), source: PRQ_CAMERA_SOURCE },
    ];
    const v = vouchedPrq(stale);
    expect(v.newestAt).toEqual(at(45));
    const ageDays = ageDaysOf(v.newestAt!.toISOString(), now)!;
    expect(ageDays).toBe(45);
    expect(freshnessOf(ageDays)).toBe('stale');          // card-stats-server: verified = measured && fresh → false

    const expired: Entry[] = [
      { attribute: 'speed', value: 70, measuredAt: at(200), source: 'drillResult' },
      { attribute: 'power', value: 80, measuredAt: at(0), source: PRQ_CAMERA_SOURCE },
    ];
    const ve = vouchedPrq(expired);
    expect(freshnessOf(ageDaysOf(ve.newestAt!.toISOString(), now)!)).toBe('expired');
    // the camera power is not smuggled into the vouched values on another attribute's clock
    expect(ve.values).toEqual({ speed: 70 });
  });

  it('only camera estimates: nothing is vouched (no value, no clock); every attribute is absent, never 0', () => {
    const e: Entry[] = [
      { attribute: 'power', value: 74, measuredAt: at(0), source: PRQ_CAMERA_SOURCE },
      { attribute: 'power', value: 0, measuredAt: at(3), source: PRQ_CAMERA_SOURCE },
    ];
    const v = vouchedPrq(e);
    expect(v).toEqual({ values: {}, newestAt: null });
    expect('power' in v.values).toBe(false);
    // the vector still has it: an estimate counts in PRQ power
    expect(latestPerAttribute(e, null)).toEqual({ power: 74 });
  });

  it('the row a dunk session plans IS the estimate, a new row beside the verified one: the vector moves, the vouched vector does not', () => {
    const { form } = boundFormSummary({ attempts: [
      { kind: 'jump', label: 'WINDMILL', reads: { heightCm: heightCmForFlight(700), flightMs: 700 } },
    ] }, { mode: 'dunkContest' });
    const plan = planFormWrite(form!, { userId: 'u1', sessionId: 's1', measuredAt: at(0, 1) });
    expect(plan.power).not.toBeNull();
    expect(plan.power!.source).toBe(PRQ_CAMERA_SOURCE);
    expect(isPrqEstimate(plan.power!.source)).toBe(true);
    expect(plan.power!.attribute).toBe('power');

    const verified: Entry[] = [{ attribute: 'power', value: 33, measuredAt: at(0), source: 'drillResult' }];
    const after = [...verified, plan.power!];
    expect(latestPerAttribute(after, null).power).toBe(powerFromJumpCm(heightCmForFlight(700)));
    expect(vouchedPrq(after)).toEqual(vouchedPrq(verified));
  });

  it('the write only CREATES: a verified PrqEntry is never updated, upserted or deleted by a form read', async () => {
    const store: Record<string, unknown>[] = [
      { id: 'v1', userId: 'u1', attribute: 'power', value: 55, unit: 'score', source: 'manual', measuredAt: at(3) },
    ];
    const snapshot = JSON.stringify(store);
    const calls: string[] = [];
    const refuse = (name: string) => async () => { calls.push(name); throw new Error(`${name} must not be called`); };
    const tx = {
      workoutScan: { createMany: async ({ data }: { data: unknown[] }) => { calls.push('workoutScan.createMany'); return { count: data.length }; } },
      prqEntry: {
        findFirst: async () => { calls.push('prqEntry.findFirst'); return null; },
        create: async ({ data }: { data: Record<string, unknown> }) => { calls.push('prqEntry.create'); store.push({ id: `c${store.length}`, ...data }); return { id: `c${store.length}` }; },
        update: refuse('prqEntry.update'), updateMany: refuse('prqEntry.updateMany'), upsert: refuse('prqEntry.upsert'),
        delete: refuse('prqEntry.delete'), deleteMany: refuse('prqEntry.deleteMany'),
      },
    };
    const { form } = boundFormSummary({ attempts: [
      { kind: 'jump', label: 'TOMAHAWK', reads: { heightCm: heightCmForFlight(760), flightMs: 760 } },
    ] }, { mode: 'dunkContest' });
    const out = await writeFormRead(tx as never, form!, { userId: 'u1', sessionId: 's1', measuredAt: at(0) });

    expect(calls.filter((c) => c.startsWith('prqEntry.') && c !== 'prqEntry.findFirst')).toEqual(['prqEntry.create']);
    expect(JSON.stringify(store.slice(0, 1))).toBe(snapshot);          // the verified row is byte-for-byte untouched
    expect(store).toHaveLength(2);
    expect(store[1]).toMatchObject({ attribute: 'power', source: PRQ_CAMERA_SOURCE, sessionId: 's1' });
    expect(out.power!.source).toBe(PRQ_CAMERA_SOURCE);
    const rows = store.map((r) => ({ attribute: r.attribute as string, value: r.value as number, measuredAt: r.measuredAt as Date, source: r.source as string }));
    expect(vouchedPrq(rows)).toEqual({ values: { power: 55 }, newestAt: at(3) });
  });
});

// "Unread form lines stay unread, never 0" (the owner). A form read the camera could not make writes no PRQ row, so
// power stays ABSENT from both vectors (and from a delta) rather than arriving as a 0.
describe('an unread jump is absent from PRQ, never 0', () => {
  const NOW = new Date('2026-09-24T12:00:00.000Z');
  const verified = [{ attribute: 'speed', value: 64, measuredAt: new Date('2026-09-20T12:00:00.000Z'), source: 'manual' }];

  it('a jump with nothing read, a client\'s 0 cm / 0 ms, or a height with no flight writes no power row', () => {
    const cases: Record<string, unknown>[] = [
      { kind: 'jump', reads: {} },
      { kind: 'jump', reads: { heightCm: null, flightMs: null, armSwingMs: -40 } },
      { kind: 'jump', reads: { heightCm: 0, flightMs: 0 } },                            // 0 is out of range: unread
      { kind: 'jump', reads: { heightCm: heightCmForFlight(640) } },                   // no flight: cannot be checked
    ];
    for (const attempt of cases) {
      const { form } = boundFormSummary({ attempts: [attempt] }, { mode: 'dunkContest' });
      const plan = planFormWrite(form!, { userId: 'u', sessionId: 's', measuredAt: NOW });
      const label = JSON.stringify(attempt.reads);
      expect(plan.power, label).toBeNull();
      expect(plan.best, label).toBeNull();
      // nothing to append: power is absent from the vector and the vouched vector, and a delta does not report it
      const after = latestPerAttribute(verified, null);
      expect('power' in after, label).toBe(false);
      expect('power' in vouchedPrq(verified).values, label).toBe(false);
      expect('power' in prqDelta({ speed: 60 }, after), label).toBe(false);
    }
  });

  it('the history row keeps an unread line as null (not 0), and an unread jump is not filed where a missing height reads as 0', () => {
    const { form } = boundFormSummary({ attempts: [
      { kind: 'jump', label: 'WINDMILL', reads: { heightCm: 0, flightMs: 0, kneeDriveCm: 12 } },
    ] }, { mode: 'dunkContest' });
    const plan = planFormWrite(form!, { userId: 'u', sessionId: 's', measuredAt: NOW });
    const row = plan.scans[0];
    expect(row.kind).toBe('jump');                                   // not the Mirror's 'dunk' history ("|| 0")
    const reads = row.metrics.reads as Record<string, number | null>;
    expect(reads.heightCm).toBeNull();
    expect(reads.flightMs).toBeNull();
    expect(reads.kneeDriveCm).toBe(12);
    for (const [k, v] of Object.entries(reads)) if (k !== 'kneeDriveCm') expect(v, k).toBeNull();
    expect(row.metrics).not.toHaveProperty('verticalCm');
    expect(row.metrics.source).toBe(PRQ_CAMERA_SOURCE);
  });
});
