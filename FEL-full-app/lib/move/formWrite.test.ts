// The session's form-read write, against a fake transaction (vitest does not collect app/; the route's own wiring is
// checked statically at the end, the way lib/api/routeContract.test.ts reads route files). And the owner's rule for
// the PRQ row: a camera estimate feeds PRQ power, "never the verified shield".

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeFormRead, writeFormPlan } from './formWrite';
import {
  boundFormSummary, heightCmForFlight, powerFromJumpCm, planFormWrite, gameRowAttrs, CAMERA_POWER_ATTR,
} from './formSummary';
import { createPrqEntry, PRQ_SOURCES, type CreatePrqEntryInput } from '@/lib/prq-entries';
import { MODE_ATTRS, PRQ_CAMERA_SOURCE, isPrqEstimate } from '@/lib/prq';
import { snapshotFrom } from '@/lib/profile/scanToSnapshot';
import { latestPerAttribute, vouchedPrq } from '@/lib/camp/deltas';
import { attentionBoard, prqSnapshots } from '@/lib/coach/attention';

/** A transaction that records what it was asked to write. */
function fakeTx(previousCamera: number | null = null) {
  const scans: { userId: string; kind: string; metrics: Record<string, unknown> }[] = [];
  const prq: Record<string, unknown>[] = [];
  const lookups: unknown[] = [];
  const tx = {
    workoutScan: {
      createMany: async ({ data }: { data: typeof scans }) => { scans.push(...data); return { count: data.length }; },
    },
    prqEntry: {
      findFirst: async (args: unknown) => { lookups.push(args); return previousCamera === null ? null : { value: previousCamera }; },
      create: async ({ data }: { data: Record<string, unknown> }) => { prq.push(data); return { id: `p${prq.length}` }; },
    },
  };
  return { tx: tx as never, scans, prq, lookups };
}

const jump = (flightMs: number) => ({ kind: 'jump', label: 'WINDMILL', made: true, takeoff: 'two', reads: { heightCm: heightCmForFlight(flightMs), flightMs } });
const AT = new Date('2026-09-24T12:00:00.001Z');

describe('writeFormRead: history + one camera power entry', () => {
  it('writes every attempt to history and ONE power entry from the best jump, as a camera estimate in score units', async () => {
    const { form } = boundFormSummary({ attempts: [jump(520), jump(760), { kind: 'jump', reads: {} }] }, { mode: 'dunkContest' });
    const f = fakeTx(41);
    const out = await writeFormRead(f.tx, form!, { userId: 'u1', sessionId: 's1', measuredAt: AT });

    expect(f.scans).toHaveLength(3);
    expect(f.scans.map((s) => s.kind)).toEqual(['dunk', 'dunk', 'jump']);
    expect(f.prq).toHaveLength(1);
    expect(f.prq[0]).toEqual({
      userId: 'u1', attribute: 'power', value: powerFromJumpCm(heightCmForFlight(760)), unit: 'score',
      source: 'camera', sessionId: 's1', measuredAt: AT,
    });
    expect(out.stored).toBe(3);
    expect(out.power).toMatchObject({ value: powerFromJumpCm(heightCmForFlight(760)), previous: 41, flightMs: 760, source: 'camera' });
    // "previous" is the last CAMERA estimate, not whatever power a game session wrote
    expect(f.lookups[0]).toMatchObject({ where: { userId: 'u1', attribute: 'power', source: 'camera' } });
  });

  it('no measured jump: history only, PRQ untouched', async () => {
    const { form } = boundFormSummary({ attempts: [
      { kind: 'shot', reads: { heightCm: heightCmForFlight(500), flightMs: 500, releaseVsApexMs: -40 } },
      { kind: 'jump', reads: { armSwingMs: -30 } },
    ] }, { mode: 'threePoint' });
    const f = fakeTx();
    const out = await writeFormRead(f.tx, form!, { userId: 'u', sessionId: 's', measuredAt: AT });
    expect(f.scans.map((s) => s.kind)).toEqual(['shot_form', 'jump']);
    expect(f.prq).toHaveLength(0);
    expect(f.lookups).toHaveLength(0);
    expect(out.power).toBeNull();
  });

  it('the stored numbers keep unread as null', async () => {
    const { form } = boundFormSummary({ attempts: [{ kind: 'strike', label: 'CROSS', reads: { handSpeedMps: 8.2 } }] }, { mode: 'karateVersus' });
    const f = fakeTx();
    await writeFormRead(f.tx, form!, { userId: 'u', sessionId: 's', measuredAt: AT });
    expect(f.scans[0].kind).toBe('strike_form');
    expect(f.scans[0].metrics.reads).toEqual({
      guardReturnMs: null, hipLeadMs: null, hipTurnDeg: null, extensionDeg: null, handSpeedMps: 8.2, chamberCm: null,
    });
  });
});

describe('review: the write under a shared camera, a non-dunk session and a failing database', () => {
  it('Dunk Duel: P2\'s jump is neither the signed-in player\'s history nor their power', async () => {
    const { form } = boundFormSummary({ attempts: [{ ...jump(560), player: 1 }, { ...jump(880), player: 2 }] }, { mode: 'dunkduel' });
    const f = fakeTx();
    const out = await writeFormRead(f.tx, form!, { userId: 'u1', sessionId: 's1', measuredAt: AT });
    expect(f.scans).toHaveLength(1);
    expect(f.scans[0].metrics).toMatchObject({ player: 1, flightTimeMs: 560 });
    expect(f.prq).toHaveLength(1);
    expect(f.prq[0].value).toBe(powerFromJumpCm(heightCmForFlight(560)));
    expect(out.power!.flightMs).toBe(560);
  });

  it('a drill session\'s jumps go to history and never to PRQ', async () => {
    const { form } = boundFormSummary({ attempts: [jump(300), jump(320)] }, { mode: 'drills' });
    const f = fakeTx();
    const out = await writeFormRead(f.tx, form!, { userId: 'u', sessionId: 's', measuredAt: AT });
    expect(f.scans.map((r) => r.kind)).toEqual(['jump', 'jump']);
    expect(f.prq).toHaveLength(0);
    expect(f.lookups).toHaveLength(0);
    expect(out.power).toBeNull();
  });

  it('a database failure on the power write is not swallowed (inside a transaction that would roll back the session silently)', async () => {
    const { form } = boundFormSummary({ attempts: [jump(700)] }, { mode: 'dunkContest' });
    const f = fakeTx();
    (f.tx as unknown as { prqEntry: { create: () => Promise<never> } }).prqEntry.create = async () => { throw new Error('connection reset'); };
    await expect(writeFormRead(f.tx, form!, { userId: 'u', sessionId: 's', measuredAt: AT })).rejects.toThrow(/connection reset/);
  });
});

describe('the camera source', () => {
  it('is a PrqEntry source createPrqEntry accepts, and like a drill result it needs its session', async () => {
    expect(PRQ_SOURCES).toContain(PRQ_CAMERA_SOURCE);
    const f = fakeTx();
    const entry: CreatePrqEntryInput = { userId: 'u', attribute: 'power', value: 60, unit: 'score', source: PRQ_CAMERA_SOURCE, measuredAt: AT };
    await expect(createPrqEntry(f.tx, entry)).rejects.toThrow(/sessionId/);
    await expect(createPrqEntry(f.tx, { ...entry, sessionId: 's' })).resolves.toEqual({ id: 'p1' });
  });

  it('is an estimate; the other sources are not', () => {
    expect(isPrqEstimate('camera')).toBe(true);
    for (const s of ['manual', 'device', 'drillResult', '', null, undefined]) expect(isPrqEstimate(s as string)).toBe(false);
  });
});

describe('never the verified shield', () => {
  const NOW = Date.parse('2026-09-24T12:00:00Z');
  const iso = (daysAgo: number) => new Date(NOW - daysAgo * 86_400_000).toISOString();

  it('a camera estimate never makes a snapshot, so it never sets the sourceScanAt the card shield stands on', () => {
    // even if a camera vertical were ever written under the measurement key itself
    const camera = [{ attribute: 'verticalJump', value: 30, unit: 'in', source: 'camera', measuredAt: iso(1) }];
    expect(snapshotFrom(camera, { now: NOW })).toBeNull();
    const manual = [{ attribute: 'verticalJump', value: 30, unit: 'in', source: 'manual', measuredAt: iso(1) }];
    expect(snapshotFrom(manual, { now: NOW })?.sourceScanAt).toBe(iso(1));
    // a camera row newer than the manual one changes nothing
    expect(snapshotFrom([...manual, { ...camera[0], value: 40, measuredAt: iso(0) }], { now: NOW })).toEqual(snapshotFrom(manual, { now: NOW }));
  });

  it('the public card\'s vouched vector leaves camera rows out, and is dated by the rest', () => {
    const d = (s: string) => new Date(s);
    const entries = [
      { attribute: 'speed', value: 61, measuredAt: d('2026-08-01'), source: 'manual' },
      { attribute: 'power', value: 55, measuredAt: d('2026-08-10'), source: 'drillResult' },
      { attribute: 'power', value: 88, measuredAt: d('2026-09-20'), source: 'camera' },
    ];
    expect(vouchedPrq(entries)).toEqual({ values: { speed: 61, power: 55 }, newestAt: d('2026-08-10') });
    expect(vouchedPrq(entries.filter((e) => e.source === 'camera'))).toEqual({ values: {}, newestAt: null });
  });

  it('the card and the route are wired that way (static, like lib/api/routeContract.test.ts)', () => {
    const root = join(__dirname, '../..');
    const card = readFileSync(join(root, 'lib/creator/card-stats-server.ts'), 'utf8');
    expect(card).toMatch(/profile\.prq\.vouched\b/);
    expect(card).toMatch(/profile\.prq\.vouchedAt\b/);
    expect(card).not.toMatch(/profile\.prq\.measured\b/);
    const route = readFileSync(join(root, 'app/api/sessions/route.ts'), 'utf8');
    expect(route).toMatch(/boundFormSummary\(body\?\.form/);
    // inside the one transaction, beside the drillResult entries
    const tx = route.slice(route.indexOf('prisma.$transaction'));
    expect(tx).toMatch(/writeFormPlan\(tx, formPlan\)/);
  });
});

// REVIEW (2026-09-24, D2): camera power and the game's power counter are on different scales, and every latest-wins
// reader takes the newest row. The first cut wrote both in a dunk session (the camera row 1 ms after the drillResult
// row), so one session made two snapshots and an 11-point drop that fired the coach's off-baseline flag, and the next
// hoops run flipped power back. One power reading per session now; these pin it.
describe('review D2: one power reading per session', () => {
  const AT0 = Date.parse('2026-09-24T12:00:00.000Z');
  const DAY = 86_400_000;
  /** PlayerProfile after the session: the game's counters, power seeded 40-70 (lib/profile-service.ts). */
  const COUNTERS: Record<string, number> = { power: 60, speed: 55, flexibility: 50, agility: 52, mental: 48, endurance: 50 };
  /** An honest 640 ms jump: 50.2 cm, which the standing-vertical axis reads as 28. */
  const JUMP = { attempts: [{ kind: 'jump', label: 'WINDMILL', made: true, reads: { heightCm: heightCmForFlight(640), flightMs: 640 } }] };
  type Row = { attribute: string; value: number; measuredAt: Date; source: string };

  /** The PrqEntry rows POST /api/sessions writes for one session, in its order: the plan first, then the game's
   *  rows for gameRowAttrs, then the plan's camera row at the same `at` (the static test below pins the route to it). */
  function sessionRows(mode: string, at: Date, opts: { form?: unknown; cameraOnFile: boolean }): Row[] {
    const { form } = boundFormSummary(opts.form, { mode });
    const plan = form ? planFormWrite(form, { userId: 'u', sessionId: `s${at.getTime()}`, measuredAt: at }) : null;
    const measuredNow = !!plan?.power;
    const game = gameRowAttrs(MODE_ATTRS[mode] ?? ['mental'], { measuredNow, onFile: !measuredNow && opts.cameraOnFile })
      .map((attribute): Row => ({ attribute, value: COUNTERS[attribute], measuredAt: at, source: 'drillResult' }));
    const p = plan?.power;
    return p ? [...game, { attribute: p.attribute, value: p.value, measuredAt: p.measuredAt, source: p.source }] : game;
  }
  const facts = (rows: Row[], nowMs: number) => ({
    clientId: 'c1', name: 'Ama', joinedAtMs: AT0 - 60 * DAY, hasProgram: true,
    sessionTimesMs: [...new Set(rows.map((r) => r.measuredAt.getTime()))], lastActiveMs: nowMs,
    prq: rows.map((r) => ({ attribute: r.attribute, value: r.value, measuredAtMs: r.measuredAt.getTime() })),
  });
  const offBaseline = (rows: Row[], nowMs: number) => attentionBoard([facts(rows, nowMs)], nowMs).triage.flags.filter((f) => f.kind === 'off-baseline');

  it('gameRowAttrs drops power, and only power, when the camera measured it now or has it on file', () => {
    const dunk = MODE_ATTRS.dunkContest;
    expect(dunk).toContain(CAMERA_POWER_ATTR);
    expect(gameRowAttrs(dunk, { measuredNow: true, onFile: false })).toEqual(['speed', 'flexibility']);
    expect(gameRowAttrs(dunk, { measuredNow: false, onFile: true })).toEqual(['speed', 'flexibility']);
    expect(gameRowAttrs(dunk, { measuredNow: false, onFile: false })).toEqual(dunk);   // no camera: as before
    expect(gameRowAttrs(dunk, { measuredNow: false, onFile: false })).not.toBe(dunk);  // a copy, never MODE_ATTRS itself
    expect(gameRowAttrs(MODE_ATTRS.hoops3v3, { measuredNow: true, onFile: true })).toEqual(MODE_ATTRS.hoops3v3);
  });

  it('a dunk session with a measured jump: ONE power row (the camera\'s), every row at the session\'s moment, ONE snapshot', () => {
    const at = new Date(AT0);
    const rows = sessionRows('dunkContest', at, { form: JUMP, cameraOnFile: false });
    const power = rows.filter((r) => r.attribute === 'power');
    expect(power).toEqual([expect.objectContaining({ source: PRQ_CAMERA_SOURCE, value: powerFromJumpCm(heightCmForFlight(640)) })]);
    expect(power[0].value).toBe(28);
    expect(new Set(rows.map((r) => r.measuredAt.getTime()))).toEqual(new Set([at.getTime()]));
    const snaps = prqSnapshots(rows.map((r) => ({ attribute: r.attribute, value: r.value, measuredAtMs: r.measuredAt.getTime() })));
    expect(snaps).toHaveLength(1);
    expect(snaps[0].axes).toEqual({ speed: 55, flexibility: 50, power: 28 });
  });

  it('...so the coach sees no off-baseline drop from one session; the first cut\'s rows (both powers, 1 ms apart) did', () => {
    const at = new Date(AT0);
    const nowMs = AT0 + 3_600_000;
    expect(offBaseline(sessionRows('dunkContest', at, { form: JUMP, cameraOnFile: false }), nowMs)).toEqual([]);
    // control: the rows the first cut wrote for the same session, so this test can tell the two apart
    const firstCut: Row[] = [
      ...MODE_ATTRS.dunkContest.map((attribute): Row => ({ attribute, value: COUNTERS[attribute], measuredAt: at, source: 'drillResult' })),
      { attribute: 'power', value: 28, measuredAt: new Date(AT0 + 1), source: PRQ_CAMERA_SOURCE },
    ];
    expect(offBaseline(firstCut, nowMs)).toHaveLength(1);
  });

  it('a later hoops1v1 session (power is one of its attributes) does not flip power back to the game counter', () => {
    expect(MODE_ATTRS.hoops1v1).toContain('power');
    const dunk = sessionRows('dunkContest', new Date(AT0 - 2 * DAY), { form: JUMP, cameraOnFile: false });
    const hoops = sessionRows('hoops1v1', new Date(AT0), { cameraOnFile: true });
    expect(hoops.map((r) => r.attribute)).toEqual(['agility', 'mental']);
    expect(latestPerAttribute([...dunk, ...hoops], null).power).toBe(28);
    // control: the first cut kept writing the counter, and power swung back to 60
    const hoopsFirstCut = sessionRows('hoops1v1', new Date(AT0), { cameraOnFile: false });
    expect(latestPerAttribute([...dunk, ...hoopsFirstCut], null).power).toBe(60);
  });

  it('a player with no camera reading keeps the game\'s power rows exactly as before', () => {
    const rows = sessionRows('dunkContest', new Date(AT0), { cameraOnFile: false });
    expect(rows.map((r) => [r.attribute, r.source])).toEqual([['power', 'drillResult'], ['speed', 'drillResult'], ['flexibility', 'drillResult']]);
  });

  it('writeFormPlan writes the plan the route made, exactly as writeFormRead does', async () => {
    const { form } = boundFormSummary(JUMP, { mode: 'dunkContest' });
    const ctx = { userId: 'u1', sessionId: 's1', measuredAt: AT };
    const a = fakeTx(12), b = fakeTx(12);
    const viaForm = await writeFormRead(a.tx, form!, ctx);
    const viaPlan = await writeFormPlan(b.tx, planFormWrite(form!, ctx));
    expect(viaPlan).toEqual(viaForm);
    expect(b.prq).toEqual(a.prq);
    expect(b.scans).toEqual(a.scans);
    expect(b.lookups).toEqual(a.lookups);
  });

  it('the route plans before its drillResult rows, filters them through gameRowAttrs, and stamps the camera row at `at` (static)', () => {
    const route = readFileSync(join(__dirname, '../../app/api/sessions/route.ts'), 'utf8');
    const tx = route.slice(route.indexOf('prisma.$transaction'));
    const planAt = tx.search(/planFormWrite\(form, \{ userId, sessionId: sid, measuredAt: at \}\)/);
    const drillAt = tx.indexOf("source: 'drillResult'");
    expect(planAt).toBeGreaterThan(-1);
    expect(drillAt).toBeGreaterThan(planAt);
    expect(tx).toMatch(/for \(const attr of gameRowAttrs\(attrs, \{ measuredNow, onFile \}\)\)/);
    expect(tx).toMatch(/measuredNow = !!formPlan\?\.power/);
    // the camera-on-file lookup asks for a CAMERA power row, nothing else
    expect(tx).toMatch(/where: \{ userId, attribute: CAMERA_POWER_ATTR, source: PRQ_CAMERA_SOURCE \}/);
    expect(route).not.toMatch(/CAMERA_AFTER_GAME_MS|at\.getTime\(\) \+/);
  });
});
