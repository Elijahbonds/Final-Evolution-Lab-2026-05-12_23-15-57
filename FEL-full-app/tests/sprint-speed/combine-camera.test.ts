// Combine day's camera timing (SPRINT-SPEED, 2026-10-25; combine-day #453 merged into lane/finish-release while this lane
// ran): the coach picks hand or camera per sprint / 5-10-5 station, camera attempts are marked "camera", only a verified
// adult is camera-timed, and — until the owner turns CAMERA_TIMES_SAVED on — a camera time stays on the coach's phone.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'next/server';
import { fakeCombineDb, seedRoster, type FakeCombineDb } from '@/tests/helpers/fakeCombineDb';

const hs = vi.hoisted(() => ({ db: null as unknown as FakeCombineDb, user: null as string | null }));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : (hs.db as unknown as Record<string | symbol, unknown>)[p]) }) }));
vi.mock('@/lib/coach/warmupServer', () => ({
  loadWarmupContext: async () => ({ isYouth: false, painDecision: null, zone: null, screen: 'none', screenAt: null, hardStopped: false, jumpGate: { closed: false, why: '', href: null } }),
}));
vi.mock('@/lib/camp/server', () => ({ currentUserId: async () => hs.user, bad: (error: string, status = 400) => Response.json({ error }, { status }) }));

import { POST as createPOST } from '@/app/api/coach/combine/route';
import { GET as oneGET, PUT as onePUT } from '@/app/api/coach/combine/[id]/route';
import { resetCombineProbe } from '@/lib/combine/store';
import { resetGroupsProbe } from '@/lib/groups/store';
import { parseStation, stationName } from '@/lib/combine/catalogue';
import { cleanEvent, newEvent, recordAttempts } from '@/lib/combine/draft';
import { combineCsv } from '@/lib/combine/csv';
import { CombineRun } from '@/components/combine/combine-run';
import { CombineReport } from '@/components/combine/combine-report';
import { CAMERA_TIMES_SAVED, bestTimedBy, timedBy } from '@/lib/sprint/cameraSprint';
import type { CombineAthlete } from '@/lib/combine/types';
import { OPEN_TODAY } from '@/lib/combine/today';

const adult = (id: string, name: string): CombineAthlete => ({ id, name, source: 'roster', access: { testable: true, camera: true, saveCamera: true, held: null, today: OPEN_TODAY } });
const handOnly: CombineAthlete = { id: 'h', name: 'Hana', source: 'roster', access: { testable: true, camera: false, saveCamera: false, held: null, today: OPEN_TODAY } };
const SPRINT_CAM = parseStation({ kind: 'sprint', variant: '40yd', timing: 'camera' })!;
const AGI_CAM = parseStation({ kind: 'agility', variant: 'pro-agility', timing: 'camera' })!;
const noop = () => {};

describe('the station: hand or camera, the coach\'s pick', () => {
  it('camera is kept for a straight sprint and the 5-10-5 only; the name says (camera)', () => {
    expect(SPRINT_CAM.timing).toBe('camera');
    expect(AGI_CAM.timing).toBe('camera');
    expect(parseStation({ kind: 'agility', variant: 'three-cone', timing: 'camera' })!.timing).toBeUndefined();
    expect(parseStation({ kind: 'cmj', variant: 'standing', timing: 'camera' })!.timing).toBeUndefined();
    expect(parseStation({ kind: 'sprint', variant: '40yd' })!.timing).toBeUndefined();
    expect(stationName(SPRINT_CAM)).toBe('Sprint · 40 yd (camera)');
    expect(stationName({ kind: 'sprint', variant: '40yd' })).toBe('Sprint · 40 yd (hand-timed)');
  });

  it('a camera attempt keeps `method: camera` for an adult; for an athlete the camera is not open to it is a plain time', () => {
    let ev = newEvent({ name: 'T', athletes: [adult('maya', 'Maya'), handOnly], stations: [SPRINT_CAM], localId: 'L', now: 1 });
    ev = recordAttempts(ev, 'maya', SPRINT_CAM.id, [{ value: 5.04, method: 'camera' }]);
    ev = recordAttempts(ev, 'h', SPRINT_CAM.id, [{ value: 5.3, method: 'camera' }]);
    expect(ev.results.maya[SPRINT_CAM.id][0]).toMatchObject({ value: 5.04, method: 'camera' });
    expect(ev.results.h[SPRINT_CAM.id][0]).not.toHaveProperty('method');
    // and a stored draft keeps it, and keeps the station's choice
    const back = cleanEvent(JSON.parse(JSON.stringify(ev)))!;
    expect(back.results.maya[SPRINT_CAM.id][0]?.method).toBe('camera');
    expect(back.stations[0].timing).toBe('camera');
  });

  it('timedBy / bestTimedBy say how attempts were timed', () => {
    expect(timedBy([{ value: 5, method: 'camera' }, { value: 5.1 }])).toBe('camera + hand');
    expect(timedBy([{ value: 5, method: 'camera' }, null])).toBe('camera');
    expect(timedBy([{ value: null }])).toBeNull();
    expect(bestTimedBy([{ value: 5.1 }, { value: 5, method: 'camera' }], 5)).toBe('camera');
  });
});

describe('the run, the report and the CSV', () => {
  const ev0 = newEvent({ name: 'Fall', athletes: [adult('maya', 'Maya'), handOnly], stations: [SPRINT_CAM], localId: 'L', now: 1 });
  it('at a camera station an adult gets the camera timer (and a stopwatch fallback); a hand-only athlete the stopwatch', () => {
    const html = renderToStaticMarkup(h(CombineRun, { ev: ev0, onChange: noop, onReport: noop, onHome: noop, roster: [], saving: true, status: null }));
    expect(html).toContain('data-combine-current="maya"');
    expect(html).toContain('data-combine-camera-timer');
    expect(html).toContain('data-combine-use-stopwatch');
    expect(html).toContain('data-fel-selfview');           // the picture's one place
    expect(html).not.toMatch(/<video|<canvas/);
    const ev1 = recordAttempts(recordAttempts(ev0, 'maya', SPRINT_CAM.id, [{ value: 5.04, method: 'camera' }, { value: 5.0, method: 'camera' }]), 'maya', SPRINT_CAM.id, []);
    const html2 = renderToStaticMarkup(h(CombineRun, { ev: ev1, onChange: noop, onReport: noop, onHome: noop, roster: [], saving: true, status: null }));
    expect(html2).toContain('data-combine-current="h"');
    expect(html2).toContain('data-combine-stopwatch');
    expect(html2).not.toContain('data-combine-camera-timer');
    // maya, one camera attempt in: her slot says camera
    const html3 = renderToStaticMarkup(h(CombineRun, { ev: recordAttempts(ev0, 'maya', SPRINT_CAM.id, [{ value: 5.04, method: 'camera' }]), onChange: noop, onReport: noop, onHome: noop, roster: [], saving: true, status: null }));
    expect(html3).toContain('data-combine-current="maya"');
    expect(html3).toContain('data-slot-camera');
  });

  it('the report marks the camera best, says camera and hand are not comparable; the CSV has a "timed by" column', () => {
    let ev = recordAttempts(ev0, 'maya', SPRINT_CAM.id, [{ value: 5.04, method: 'camera' }]);
    ev = recordAttempts(ev, 'h', SPRINT_CAM.id, [{ value: 5.3 }]);
    const html = renderToStaticMarkup(h(CombineReport, { ev, onChange: noop, onBack: noop, onHome: noop }));
    expect(html).toContain('data-combine-timed-by');
    expect(html).toContain('not directly comparable');
    const csv = combineCsv(ev).split('\r\n');
    expect(csv[0]).toContain('Sprint · 40 yd (camera) timed by');
    expect(csv.find((l) => l.includes('Maya'))).toContain(',camera,');
    expect(csv.find((l) => l.includes('Hana'))).toContain(',hand-timed,');
  });
});

describe('the save: a camera time stays on the coach\'s phone until the owner says otherwise', () => {
  beforeEach(() => {
    hs.db = fakeCombineDb();
    hs.user = 'coach';
    resetCombineProbe();
    resetGroupsProbe();
    seedRoster(hs.db, 'coach', 'maya', { name: 'Maya Okafor' });   // adult, opted in
  });
  const req = (method: string, json?: unknown) => new NextRequest('http://fel.test/api/x', { method, ...(json === undefined ? {} : { body: JSON.stringify(json), headers: { 'content-type': 'application/json' } }) });

  it('CAMERA_TIMES_SAVED is off: camera-timed slots are kept on the device; hand-timed ones save as before', async () => {
    expect(CAMERA_TIMES_SAVED).toBe(false);
    const made = await createPOST(req('POST', { name: 'X', stations: [{ kind: 'sprint', variant: '40yd', attempts: 2, timing: 'camera' }, { kind: 'sprint', variant: '20yd', attempts: 1 }], athleteIds: ['maya'] }));
    const id = ((await made.json()) as { id: string }).id;
    const r = await onePUT(req('PUT', { results: { maya: { 'sprint:40yd': [{ value: 5.04, at: 1, method: 'camera' }, null], 'sprint:20yd': [{ value: 2.9, at: 1 }] } } }), { params: { id } });
    const j = (await r.json()) as { keptOnDevice: unknown };
    expect(j.keptOnDevice).toEqual([{ athleteId: 'maya', stationId: 'sprint:40yd' }]);
    expect(hs.db.results.map((x) => [x.stationId, x.value, x.method])).toEqual([['sprint:20yd', 2.9, 'hand']]);
    // the station's choice is stored with the combine and comes back
    const back = (await (await oneGET(req('GET'), { params: { id } })).json()) as { event: { stations: { id: string; timing?: string }[] } };
    expect(back.event.stations.find((s) => s.id === 'sprint:40yd')?.timing).toBe('camera');
  });
});
