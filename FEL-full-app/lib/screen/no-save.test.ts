// SCREEN-SHIP (c) and Squad gate 5: NOTHING IS SAVED SERVER-SIDE IN THIS SHIP (A2-3), for anyone; minors are gated
// before any data is kept; camera frames never leave the phone.
//
//   · the screen's client code has no network call at all (a static scan of every file it ships), and a whole screen
//     played through the client pipeline — runner → summary → this tab's storage — calls fetch 0 times and touches the
//     (mocked) database 0 times, for a guest, an under-18 with consent, an adult and a signed-in adult alike;
//   · the route stays as PR #20 has it, unwired from the screen: a guest still gets 401 and a possible minor without
//     consent 412, each with no database write;
//   · the record builder carries numbers only: no image, video, landmark or frame (mediaIn), and no worst-rep skeleton.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const m = vi.hoisted(() => ({
  session: null as unknown,
  users: [] as Row[],
  consents: [] as Row[],
  writes: [] as string[],
}));
vi.mock('next-auth', () => ({ getServerSession: async () => m.session }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, model) => {
      if (model === 'then') return undefined;
      return new Proxy({}, {
        get: (_u, op) => async (a: Row = {}) => {
          const name = `${String(model)}.${String(op)}`;
          if (/^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/.test(String(op))) { m.writes.push(name); return {}; }
          if (model === 'user' && op === 'findUnique') return m.users.find((u) => u.id === (a.where as Row)?.id) ?? null;
          if (model === 'guardianConsent' && op === 'findFirst') return m.consents.find((c) => c.menteeId === (a.where as Row)?.menteeId && c.acceptedAt && !c.revokedAt) ?? null;
          if (op === 'findMany') return [];
          return null;
        },
      });
    },
  }),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/mirror/assessment/route';
import { AssessRunner, gradeSession } from '@/lib/assess/runner';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, standFront, syntheticCalibration } from '@/lib/assess/replay';
import { mediaIn, toRecord } from '@/lib/assess/prqWrite';
import { summarize } from './checks';
import { preStep, PRE_START, type PreEvent } from './flow';
import { readResult, writeResult, writeTakeoff, type StorageLike } from './store';

const cal = syntheticCalibration();
const SESSION = gradeSession({
  calibration: cal, T1: { front: ohsFront({ kneeInL: 0.06 }).frames, side: ohsSide().frames },
  T2: { left: kneeWall('left').frames, right: kneeWall('right').frames },
  T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames }, T5: cmj([0, 1, 2].map(() => ({ heightM: 0.4 }))).frames,
  takeoffLeg: 'left',
});
const device = { class: 'mobile' as const, model: 'lite' as const, poseHz: 30, cameraFps: 30, width: 720, height: 1280 };
const record = () => toRecord({ assessmentId: 'a-screen-ship-1', mode: 'quick', measuredAt: new Date(), device, takeoffLeg: 'left', tests: SESSION.tests, mqs: SESSION.mqs });
const post = (body: unknown) => POST(new NextRequest('http://localhost/api/mirror/assessment', { method: 'POST', body: JSON.stringify(body) }));

class MemStore implements StorageLike {
  m = new Map<string, string>(); writes: string[] = [];
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.writes.push(k); this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

const fetchSpy = vi.fn();
beforeEach(() => { m.session = null; m.users = []; m.consents = []; m.writes = []; fetchSpy.mockReset(); vi.stubGlobal('fetch', fetchSpy); });
afterEach(() => { vi.unstubAllGlobals(); });

/** The client pipeline, as the page runs it: the steps before the camera, the runner, the summary, this tab's storage. */
function playScreen(events: PreEvent[]) {
  const tab = new MemStore();
  let pre = PRE_START;
  for (const e of events) pre = preStep(pre, e);
  const stored = { beforeCamera: tab.writes.length };
  if (pre.step !== 'camera') return { tab, pre, stored };
  const r = new AssessRunner({ aspect: 4 / 3, painAsked: true, takeoffLeg: null, cameraFps: () => 30 });
  let t = 0;
  r.tick({ t, present: false, image: [] }, t);
  // a few frames and the takeoff prompt, as the page would; the grade itself comes from the synthetic session
  for (const f of standFront(1).frames) { t += 33; const v = r.tick({ ...f, t }, t); if (v.step === 'takeoff') { writeTakeoff(tab, pre.gate, 'left'); r.answerTakeoff('left', t); } }
  const s = summarize(SESSION)!;
  writeResult(tab, pre.gate, s);
  return { tab, pre, stored, summary: s };
}

describe('the screen\'s client code makes no network call', () => {
  const root = join(__dirname, '../..');
  const files = [
    ...readdirSync(join(root, 'app/play/mirror/assess/_components')).filter((f) => /\.tsx?$/.test(f)).map((f) => `app/play/mirror/assess/_components/${f}`),
    'app/play/mirror/assess/page.tsx', 'app/play/mirror/assess/results/page.tsx', 'app/screen/page.tsx',
    'app/screen/program/[lane]/page.tsx', 'app/screen/program/[lane]/program-lane.tsx',
    ...readdirSync(join(root, 'lib/screen')).filter((f) => /\.ts$/.test(f) && !f.endsWith('.test.ts')).map((f) => `lib/screen/${f}`),
  ];
  it.each(files)('%s: no fetch, beacon, XHR, socket, postAssessment or /api/ path', (f) => {
    const src = readFileSync(join(root, f), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(src).not.toMatch(/\bfetch\s*\(|sendBeacon|XMLHttpRequest|new WebSocket|EventSource|postAssessment|['"`]\/api\//);
    expect(src).not.toMatch(/localStorage\.setItem|indexedDB|document\.cookie\s*=/);
  });
});

describe('a whole screen, played: 0 requests, 0 database writes, storage only after the gate', () => {
  it('a guest adult: nothing sent; the result stays in this tab', () => {
    const run = playScreen([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m.writes).toEqual([]);
    expect(run.stored.beforeCamera).toBe(0);
    expect(readResult(run.tab)!.summary).toEqual(run.summary);
  });

  it('an under-18 WITH a parent\'s consent: still nothing sent or saved server-side', () => {
    const run = playScreen([{ type: 'start' }, { type: 'age', age: 'under-18' }, { type: 'consent' }, { type: 'pain', hurts: false }]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m.writes).toEqual([]);
    expect(run.pre.gate).toMatchObject({ ageBand: 'under-18', parentCheckbox: true });
  });

  it('an under-18 or an unknown age WITHOUT consent never reaches the camera, and nothing is written anywhere', () => {
    for (const age of ['under-18', 'unknown'] as const) {
      const run = playScreen([{ type: 'start' }, { type: 'age', age }, { type: 'pain', hurts: false }]);
      expect(run.pre.step, age).toBe('consent');
      expect(run.tab.writes, age).toEqual([]);
      // and a result handed to the store without consent is refused
      expect(writeResult(run.tab, preStep(preStep(PRE_START, { type: 'start' }), { type: 'age', age }).gate, summarize(SESSION)!), age).toBe(false);
      expect(run.tab.writes, age).toEqual([]);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m.writes).toEqual([]);
  });

  it('a signed-in adult: the screen still never posts (no save in this ship)', () => {
    m.session = { user: { id: 'adult-1' } };
    m.users.push({ id: 'adult-1', dobYear: 1990 });
    playScreen([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: false }]);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(m.writes).toEqual([]);
  });

  it('"yes" to pain: nothing at all', () => {
    const run = playScreen([{ type: 'start' }, { type: 'age', age: '18+' }, { type: 'pain', hurts: true }]);
    expect(run.pre.step).toBe('painStop');
    expect(run.tab.writes).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('the route, unwired from the screen, still refuses as PR #20 built it', () => {
  it('a guest: 401, nothing written', async () => {
    const r = await post(record());
    expect(r.status).toBe(401);
    expect(m.writes).toEqual([]);
  });

  it('a signed-in under-18 without consent: 412, nothing written', async () => {
    m.session = { user: { id: 'kid-1' } };
    m.users.push({ id: 'kid-1', dobYear: new Date().getFullYear() - 14 });
    const r = await post(record());
    expect(r.status).toBe(412);
    expect(m.writes).toEqual([]);
  });

  it('a signed-in athlete of unknown age without consent: 412, nothing written', async () => {
    m.session = { user: { id: 'who-1' } };
    m.users.push({ id: 'who-1', dobYear: null });
    const r = await post(record());
    expect(r.status).toBe(412);
    expect(m.writes).toEqual([]);
  });
});

describe('camera frames are never uploaded: the record builder carries numbers only', () => {
  it('no media anywhere in the record, no landmarks, no worst-rep skeleton', () => {
    const rec = record();
    expect(mediaIn(rec)).toBeNull();
    const json = JSON.stringify(rec);
    expect(json).not.toMatch(/"image"|"frozen"|"world"|data:image|base64|"frames"/);
    expect(SESSION.tests.some((t) => t.frozen.length > 0)).toBe(true);   // the skeletons existed, in memory only
  });
});
