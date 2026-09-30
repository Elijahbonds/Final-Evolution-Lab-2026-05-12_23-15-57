// R-HEALTH-CLIENT (2026-09-30; FE PM 19:46, 19:53 and 19:56 PT), test b: the intake flow, per user.
//
// BROWSER-ONLY PATH (canWriteHealthData false: unknown age, 15, 17 with a parent's yes): the REAL HealthIntakeGate is
// driven click by click (tests/helpers/driveRender.ts, no DOM) with its mount effect run for real during render and a
// recording fetch stubbed in globally. It must record ZERO calls: no status GET, no submit, no clear.
// VERIFIED ADULT PATH (canWriteHealthData true): the gate's own request helpers (./intake-refusal.ts submitIntakeOnce,
// clearOnce) against a stub that answers with the REAL app/api/health/intake route over the write-spy client, plus the
// Mirror's mirrorSave calls through the same stub — so "what was sent" and "what was written" are both counted.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ runEffects: false, userId: null as string | null, prisma: null as any }));
// Run a component's effects synchronously during the render (renderToStaticMarkup never runs them), so the gate's mount
// effect — the status GET — really executes under test. State it sets afterwards is a server-render no-op.
vi.mock('react', async (importOriginal) => {
  const real = await importOriginal<typeof import('react')>();
  return { ...real, useEffect: (fn: () => void | (() => void)) => { if (h.runEffects) fn(); } };
});
vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.userId,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', () => ({ prisma: new Proxy({}, { get: (_t, p) => (p === 'then' ? undefined : h.prisma[p]) }) }));

import { readFileSync } from 'node:fs';
import { createElement, type ReactElement } from 'react';
import { NextRequest } from 'next/server';
import { HealthIntakeGate } from '@/app/play/mirror/_components/health-intake-gate';
import {
  BROWSER_ONLY_LINE, DECLINE_LABEL, NOTHING_SAVED_LINE, NOT_KEPT_LINE, clearOnce, localIntakeOutcome, localIntakeStart,
  submitIntakeOnce, type LocalIntakeStatus,
} from '@/app/play/mirror/_components/intake-refusal';
import { MIRROR_SAVE_URLS, mirrorSave } from '@/app/play/mirror/_components/mirror-save';
import { GET as intakeGET, POST as intakePOST } from '@/app/api/health/intake/route';
import { HEALTH_DATA_CONSENT_COPY, PUBLIC_INTAKE_QUESTIONS, RED_FLAG_COPY, RED_FLAG_QUESTION_IDS } from '@/lib/health/intake';
import { canWriteHealthData } from '@/lib/privacy/healthWriteGate';
import { canSaveScanNumbers } from '@/lib/privacy/scanSaveGate';
import { button, drive, textOf, type Step } from '@/tests/helpers/driveRender';
import {
  HEALTH_ADULT, HEALTH_REFUSED_CASES, newSpyDb, spyPrisma, writesOf, type AgeCase, type SpyDb,
} from '@/tests/helpers/writeSpyDb';

const UID = 'athlete-rhc-1';
const MIRROR = 'MIRROR MOUNTED';
const FLAG = RED_FLAG_QUESTION_IDS[0];

// ── the recording fetch ─────────────────────────────────────────────────────────────────────────────────────────────────
interface Sent { url: string; method: string; body: string | null }
function recorder(respond: (url: string, init?: RequestInit) => Promise<Response> | Response = () => Response.json({})) {
  const calls: Sent[] = [];
  const fn = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: (init?.method ?? 'GET').toUpperCase(), body: typeof init?.body === 'string' ? init.body : null });
    return respond(url, init);
  }) as typeof fetch;
  return { fn, calls };
}
/** A stub that answers /api/health/intake with the real route (over h.prisma) and anything else with 200 {}. */
function realIntakeStub() {
  return recorder(async (url, init) => {
    if (url !== '/api/health/intake') return Response.json({});
    if ((init?.method ?? 'GET') === 'GET') return intakeGET();
    return intakePOST(new NextRequest('http://fel.test/api/health/intake', { method: 'POST', body: init!.body as string, headers: { 'content-type': 'application/json' } }));
  });
}
const health = (calls: Sent[]) => calls.filter((c) => c.url.startsWith('/api/health/'));
const mirror = (calls: Sent[]) => calls.filter((c) => c.url.startsWith('/api/mirror/'));
const scanPosts = (calls: Sent[]) => calls.filter((c) => c.url.startsWith('/api/v1/workout/scan') && c.method === 'POST');

let db: SpyDb;
function as(c: AgeCase) {
  db = newSpyDb();
  c.seed(db, UID);
  h.prisma = spyPrisma(db);
  h.userId = UID;
}

/** The Mirror's four requests (three saves and the history read) as the harness makes them, through mirrorSave. */
function mirrorSession(canSaveScan: boolean, fetchImpl: typeof fetch) {
  const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return [
    mirrorSave(canSaveScan, fetchImpl, '/api/mirror/sessions', post({ patternId: 'splitStancePress', reps: 4 })),
    mirrorSave(canSaveScan, fetchImpl, '/api/mirror/dunks', post({ verticalCm: 40, flightTimeMs: 570 })),
    mirrorSave(canSaveScan, fetchImpl, '/api/mirror/screen', post({ screenId: 'x', screen: 'modified', results: [], grades: [] })),
    mirrorSave(canSaveScan, fetchImpl, '/api/mirror/dunks'),
  ];
}

// ── driving the real component ──────────────────────────────────────────────────────────────────────────────────────────
const decode = (s: string) => s.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
function render(canWriteHealth: boolean, localStatus?: LocalIntakeStatus) {
  return () => HealthIntakeGate({ canWriteHealth, localStatus, children: createElement('main', null, MIRROR) }) as ReactElement;
}
/** One step per public question, in order: the red-flag id (if any) answered "Yes", every other yes/no "No", the year skipped. */
function answerAll(flagId?: string): Step[] {
  return PUBLIC_INTAKE_QUESTIONS.map((q) => (tree: ReactElement) => {
    expect(textOf(tree)).toContain(q.prompt);
    if (q.type === 'birth_year') button(tree, /^Skip$/).props.onClick();
    else button(tree, q.id === flagId ? /^Yes$/ : /^No$/).props.onClick();
  });
}
const markCleared: Step = (tree) => button(tree, /mark cleared/).props.onClick();

/** Drive the gate with the global fetch recorded and the mount effect run for real; returns the markup and the calls. */
function driveRecorded(canWriteHealth: boolean, localStatus: LocalIntakeStatus | undefined, steps: Step[] = []) {
  const stub = recorder();
  vi.stubGlobal('fetch', stub.fn);
  h.runEffects = true;
  try {
    const { html } = drive(render(canWriteHealth, localStatus), steps);
    return { html: decode(html), calls: stub.calls };
  } finally {
    h.runEffects = false;
    vi.unstubAllGlobals();
  }
}

const DUE: LocalIntakeStatus = { intakeDue: true, storedHardStop: false };

beforeEach(() => { h.userId = UID; h.runEffects = false; });

describe('the users (control): canWriteHealthData and canSaveScanNumbers for each, from the database', () => {
  it.each(HEALTH_REFUSED_CASES.map((c) => [c.id, c] as const))('%s: canWriteHealth false, canSaveScan false', async (_id, c) => {
    as(c);
    expect(await canWriteHealthData(h.prisma, UID)).toBe(false);
    expect(await canSaveScanNumbers(h.prisma, UID)).toBe(false);
  });
  it('the adult (1990): canWriteHealth true, canSaveScan false (nobody has the scan opt-in yet)', async () => {
    as(HEALTH_ADULT);
    expect(await canWriteHealthData(h.prisma, UID)).toBe(true);
    expect(await canSaveScanNumbers(h.prisma, UID)).toBe(false);
  });
});

describe('BROWSER-ONLY PATH: the real gate, for each user who is not a verified adult — zero requests of any kind', () => {
  describe.each(HEALTH_REFUSED_CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    let canWriteHealth: boolean;
    beforeEach(async () => {
      as(c);
      canWriteHealth = await canWriteHealthData(h.prisma, UID);
      expect(canWriteHealth).toBe(false);
    });

    it('due: no consent-to-collect screen; the first question says nothing is sent', () => {
      const r = driveRecorded(canWriteHealth, DUE);
      expect(r.html).toContain(BROWSER_ONLY_LINE);
      expect(r.html).toContain(`Question 1 of ${PUBLIC_INTAKE_QUESTIONS.length}`);
      expect(r.html).toContain(PUBLIC_INTAKE_QUESTIONS[0].prompt);
      expect(r.html).not.toContain(HEALTH_DATA_CONSENT_COPY.title);
      expect(r.html).not.toContain(MIRROR);
      expect(r.calls).toEqual([]);
    });

    it('no red flag → ready_unsaved: the Mirror mounts under the quiet line', () => {
      const r = driveRecorded(canWriteHealth, DUE, answerAll());
      expect(r.html).toContain(MIRROR);
      expect(r.html).toContain(NOT_KEPT_LINE);
      expect(r.html).not.toMatch(/parent or guardian|Ask a parent/i);
      expect(r.calls).toEqual([]);
    });

    it.each(RED_FLAG_QUESTION_IDS.map((id) => [id]))('red flag %s → stopped_local with RED_FLAG_COPY; the Mirror does not mount', (id) => {
      const r = driveRecorded(canWriteHealth, DUE, answerAll(id));
      expect(r.html).toContain('Before you continue');
      expect(r.html).toContain(RED_FLAG_COPY);
      expect(r.html).toContain(NOTHING_SAVED_LINE);
      expect(r.html).not.toContain(MIRROR);
      expect(r.calls).toEqual([]);
    });

    it('"mark cleared" after a red flag → ready_unsaved, still with no request', () => {
      const r = driveRecorded(canWriteHealth, DUE, [...answerAll(FLAG), markCleared]);
      expect(r.html).toContain(MIRROR);
      expect(r.html).not.toContain(RED_FLAG_COPY);
      expect(r.calls).toEqual([]);
    });

    it('a stored hard stop → stopped_local at once; "mark cleared" → the Mirror; no request', () => {
      const stopped = driveRecorded(canWriteHealth, { intakeDue: false, storedHardStop: true });
      expect(stopped.html).toContain(RED_FLAG_COPY);
      expect(stopped.html).not.toContain(MIRROR);
      const cleared = driveRecorded(canWriteHealth, { intakeDue: false, storedHardStop: true }, [markCleared]);
      expect(cleared.html).toContain(MIRROR);
      expect([...stopped.calls, ...cleared.calls]).toEqual([]);
    });

    it('not due → ready_unsaved at once (nothing asked, so no "nothing you answered" line); no request', () => {
      const r = driveRecorded(canWriteHealth, { intakeDue: false, storedHardStop: false });
      expect(r.html).toContain(MIRROR);
      expect(r.html).not.toContain(NOT_KEPT_LINE);
      expect(r.calls).toEqual([]);
    });

    it('no localStatus at all → the intake is asked (due), still with no request', () => {
      const r = driveRecorded(canWriteHealth, undefined);
      expect(r.html).toContain(BROWSER_ONLY_LINE);
      expect(r.calls).toEqual([]);
    });

    it('the pure start/finish give the same stages the component showed', () => {
      expect(localIntakeStart(DUE)).toBe('question');
      expect(localIntakeOutcome({ current_pain: false }).stage).toBe('ready_unsaved');
      expect(localIntakeOutcome({ [FLAG]: true })).toEqual({ stage: 'stopped_local', redFlags: [FLAG], copy: RED_FLAG_COPY });
    });
  });

  it('CONTROL: the same recorder sees the verified adult\'s status GET, so a zero above is a real zero', () => {
    const r = driveRecorded(true, DUE);
    expect(r.html).toContain('Checking in');
    expect(r.calls.length).toBeGreaterThan(0);
    expect(r.calls[0]).toEqual({ url: '/api/health/intake', method: 'GET', body: null });
  });

  it('a missing canWriteHealth prop is the browser-only path (default false)', () => {
    const stub = recorder();
    vi.stubGlobal('fetch', stub.fn);
    h.runEffects = true;
    try {
      const { html } = drive(() => HealthIntakeGate({ children: MIRROR }) as ReactElement);
      expect(decode(html)).toContain(BROWSER_ONLY_LINE);
    } finally { h.runEffects = false; vi.unstubAllGlobals(); }
    expect(stub.calls).toEqual([]);
  });
});

describe('STATIC: health-intake-gate.tsx reaches the network only on the verified-adult, not-declined branch', () => {
  const src = readFileSync(new URL('../../app/play/mirror/_components/health-intake-gate.tsx', import.meta.url), 'utf8');
  const code = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const between = (from: string, to: string) => { const i = code.indexOf(from); expect(i).toBeGreaterThan(-1); return code.slice(i, code.indexOf(to, i)); };

  it('the only direct fetch is the status GET inside fetchStatus', () => {
    expect(code.match(/\bfetch\(/g)).toHaveLength(1);
    expect(between('async function fetchStatus()', '\n}')).toContain("fetch('/api/health/intake')");
  });

  it('browserOnly = !canWriteHealth || declined; canWriteHealth defaults to false', () => {
    expect(code).toContain('const browserOnly = !canWriteHealth || declined;');
    expect(code).toMatch(/canWriteHealth = false/);
  });

  it('the status GET runs only after `if (!canWriteHealth) return;` (declined is false at mount)', () => {
    const effect = between('useEffect(() => {', '}, []);');
    expect(effect.indexOf('if (!canWriteHealth) return;')).toBeGreaterThan(-1);
    expect(effect.indexOf('if (!canWriteHealth) return;')).toBeLessThan(effect.indexOf('fetchStatus()'));
    expect(code.match(/fetchStatus\(\)/g)).toHaveLength(2);            // its definition and this one call
  });

  it('the submit and the clear are sent only after the browser-only branch has returned', () => {
    const submit = between('async function submitAnswers(', '\n  }\n');
    expect(submit.indexOf('if (browserOnly) {')).toBeGreaterThan(-1);
    expect(submit.indexOf('if (browserOnly) {')).toBeLessThan(submit.indexOf('submitIntakeOnce(fetch'));
    const clear = between('async function markCleared(', '\n  }\n');
    expect(clear.indexOf("if (browserOnly || stage === 'stopped_local') {")).toBeGreaterThan(-1);
    expect(clear.indexOf("if (browserOnly || stage === 'stopped_local') {")).toBeLessThan(clear.indexOf('clearOnce(fetch'));
    expect(code.match(/submitIntakeOnce\(/g)).toHaveLength(1);
    expect(code.match(/clearOnce\(/g)).toHaveLength(1);
  });

  it('the consent screen offers the refusal, and "decline" only flips state (no request, no consent sent)', () => {
    expect(code).toContain('{DECLINE_LABEL}');
    expect(DECLINE_LABEL).toBe('No thanks, continue without saving');
    const decline = between('function decline() {', '\n  }\n');
    expect(decline).toContain('setDeclined(true);');
    expect(decline).not.toMatch(/fetch|submitIntakeOnce|clearOnce/);
    expect(between("if (stage === 'consent' && status) {", "if (stage === 'question'")).toContain('onClick={decline}');
  });

  it('"I agree" only moves on to the questions: nothing is POSTed before it', () => {
    const consent = between("if (stage === 'consent' && status) {", "if (stage === 'question'");
    expect(consent).toContain("onClick={() => setStage('question')}");
    expect(consent).not.toMatch(/fetch|submitIntakeOnce|clearOnce/);
  });
});

describe('VERIFIED-ADULT PATH, the 403 fallback (a stale render): submitIntakeOnce against the real route', () => {
  describe.each(HEALTH_REFUSED_CASES.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    beforeEach(() => as(c));

    it('no red flag → ready_unsaved, exactly ONE request, no retry, no clear, nothing written', async () => {
      const stub = realIntakeStub();
      expect(await submitIntakeOnce(stub.fn, { current_pain: false })).toEqual({ stage: 'ready_unsaved', redFlags: [] });
      expect(stub.calls).toHaveLength(1);
      expect(stub.calls[0]).toMatchObject({ url: '/api/health/intake', method: 'POST' });
      expect(JSON.parse(stub.calls[0].body!)).toEqual({ answers: { current_pain: false }, consent: true });
      expect(writesOf(db)).toEqual([]);
    });

    it('a red flag → stopped_local with RED_FLAG_COPY, ONE request, nothing written', async () => {
      const stub = realIntakeStub();
      expect(await submitIntakeOnce(stub.fn, { [FLAG]: true })).toEqual({ stage: 'stopped_local', redFlags: [FLAG], copy: RED_FLAG_COPY });
      expect(stub.calls).toHaveLength(1);
      expect(writesOf(db)).toEqual([]);
    });
  });

  it('the adult (stub 200): ready, then stopped for a red flag; ONE request each; the server wrote the intake', async () => {
    as(HEALTH_ADULT);
    const ok = realIntakeStub();
    const ready = await submitIntakeOnce(ok.fn, { current_pain: false });
    expect(ready.stage).toBe('ready');
    expect(ok.calls).toHaveLength(1);
    const flagged = realIntakeStub();
    const stopped = await submitIntakeOnce(flagged.fn, { [FLAG]: true });
    expect(stopped.stage).toBe('stopped');
    if (stopped.stage === 'stopped') expect(stopped.data).toMatchObject({ hardStopped: true, redFlagCopy: RED_FLAG_COPY });
    expect(flagged.calls).toHaveLength(1);
    expect(db.tables.healthIntake).toHaveLength(2);
  });

  it('a thrown fetch and a 500 → error (the only "That didn\'t save"), ONE attempt each', async () => {
    const thrown = recorder(() => { throw new TypeError('Failed to fetch'); });
    expect(await submitIntakeOnce(thrown.fn, {})).toEqual({ stage: 'error' });
    expect(thrown.calls).toHaveLength(1);
    const e500 = recorder(() => Response.json({ error: 'boom' }, { status: 500 }));
    expect(await submitIntakeOnce(e500.fn, {})).toEqual({ stage: 'error' });
    expect(e500.calls).toHaveLength(1);
    const legacy = recorder(() => Response.json({ error: 'guardian_consent_required' }, { status: 412 }));
    expect(await submitIntakeOnce(legacy.fn, {})).toEqual({ stage: 'guardian_needed' });
  });

  it('clearOnce: 2xx → ready, the adults-only 403 → ready_unsaved, 500 → error; one request each', async () => {
    for (const [res, want] of [
      [Response.json({ intake: { id: 'i1', clearedAt: 'now' } }), 'ready'],
      [Response.json({ error: 'health_data_adults_only', saved: false }, { status: 403 }), 'ready_unsaved'],
      [Response.json({ error: 'boom' }, { status: 500 }), 'error'],
    ] as const) {
      const stub = recorder(() => res.clone());
      expect(await clearOnce(stub.fn, 'i1')).toBe(want);
      expect(stub.calls).toEqual([{ url: '/api/health/intake', method: 'POST', body: JSON.stringify({ action: 'clear', intakeId: 'i1' }) }]);
    }
    const thrown = recorder(() => { throw new TypeError('offline'); });
    expect(await clearOnce(thrown.fn, 'i1')).toBe('error');
  });

  it('clearOnce against the real route for a 15-year-old with an old red-flag intake → the page-memory tick, nothing cleared', async () => {
    as(HEALTH_REFUSED_CASES[1]);
    db.tables.healthIntake = [{ id: 'old-1', userId: UID, version: '2026-09-29', answers: {}, redFlags: [FLAG], birthYear: null, consentedAt: new Date(), clearedAt: null, createdAt: new Date() }];
    const stub = realIntakeStub();
    expect(await clearOnce(stub.fn, 'old-1')).toBe('ready_unsaved');
    expect(stub.calls).toHaveLength(1);
    expect(db.tables.healthIntake[0].clearedAt).toBeNull();
    expect(writesOf(db)).toEqual([]);
  });
});

describe('VERIFIED ADULT WITHOUT THE SCAN OPT-IN (FE PM 19:53 PT): the intake saves on agree; the Mirror sends nothing', () => {
  it('consent first, one intake POST after "I agree", then zero /api/mirror/* and zero workout-scan POSTs', async () => {
    as(HEALTH_ADULT);
    const canWriteHealth = await canWriteHealthData(h.prisma, UID);
    const canSaveScan = await canSaveScanNumbers(h.prisma, UID);
    expect([canWriteHealth, canSaveScan]).toEqual([true, false]);
    const stub = realIntakeStub();

    // the status GET the gate makes on mount (canWriteHealth true): the consent screen is what shows
    const status = await (await stub.fn('/api/health/intake')).json();
    expect(status).toMatchObject({ needsIntake: true, hardStopped: false, consent: { title: HEALTH_DATA_CONSENT_COPY.title } });
    expect(stub.calls.filter((c) => c.method !== 'GET')).toEqual([]);          // nothing POSTed before "I agree"

    // "I agree — continue", the questions, and today's single submit
    const answers = Object.fromEntries(PUBLIC_INTAKE_QUESTIONS.filter((q) => q.type === 'yes_no').map((q) => [q.id, false]));
    const outcome = await submitIntakeOnce(stub.fn, answers);
    expect(outcome.stage).toBe('ready');
    expect(JSON.parse(stub.calls[1].body!)).toEqual({ answers, consent: true });
    expect(writesOf(db)).toEqual(['$transaction', 'healthConsent.create', 'healthIntake.create']);

    // the Mirror session: three saves and the history read, all with canSaveScan false
    expect(mirrorSession(canSaveScan, stub.fn)).toEqual([null, null, null, null]);
    expect(stub.calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/health/intake', 'POST /api/health/intake']);
    expect(mirror(stub.calls)).toEqual([]);
    expect(scanPosts(stub.calls)).toEqual([]);
  });
});

describe('VERIFIED ADULT DECLINES (FE PM 19:56 PT): nothing about health is sent, recorded or saved after the click', () => {
  it('status GET → consent → "No thanks" → browser-only intake → ready_unsaved → the Mirror sends nothing', async () => {
    as(HEALTH_ADULT);
    const canSaveScan = await canSaveScanNumbers(h.prisma, UID);
    expect(await canWriteHealthData(h.prisma, UID)).toBe(true);
    const stub = realIntakeStub();
    const status = await (await stub.fn('/api/health/intake')).json();
    expect(status.needsIntake).toBe(true);
    const atDecline = stub.calls.length;

    // declined: browserOnly from here — the gate's submit is localIntakeOutcome in page memory (see the STATIC block)
    const answers = Object.fromEntries(PUBLIC_INTAKE_QUESTIONS.filter((q) => q.type === 'yes_no').map((q) => [q.id, false]));
    expect(localIntakeOutcome(answers)).toEqual({ stage: 'ready_unsaved', redFlags: [] });
    expect(mirrorSession(canSaveScan, stub.fn)).toEqual([null, null, null, null]);

    const after = stub.calls.slice(atDecline);
    expect(health(after)).toEqual([]);
    expect(mirror(after)).toEqual([]);
    expect(scanPosts(after)).toEqual([]);
    expect(stub.calls.some((c) => (c.body ?? '').includes('consent'))).toBe(false);
    expect(writesOf(db)).toEqual([]);
    expect(db.tables.healthConsent ?? []).toEqual([]);
    expect(db.tables.healthIntake ?? []).toEqual([]);
  });

  it('the Mirror URLs the stub would have seen are exactly the three the harness calls (control)', () => {
    const stub = recorder();
    mirrorSession(true, stub.fn);
    expect(stub.calls.map((c) => c.url).sort()).toEqual([...MIRROR_SAVE_URLS, '/api/mirror/dunks'].sort());
  });
});
