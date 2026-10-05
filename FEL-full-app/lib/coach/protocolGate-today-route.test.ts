// MIRROR-COACH P8 (2026-09-29): the protocol gate on Today, run for real — GET /api/coach/me/today and POST
// /api/coach/me/log over the in-memory Today store (lib/coach/todayMemoryDb.ts) with the gate's four tables. Only the
// session and the database are stand-ins; the lane's database is offline on purpose and :3131 was down.
//
// What this proves: THE GATE RUNS ON THE SERVER, before the session leaves it. A coach's depth drop and pogo hops reach
// the athlete as written only with every check passing; otherwise the drop arrives as its ladder's easier step (walked
// past a gated rung) with the one line why, and the pogo — no easier step — is held back with its line. The easier step
// logs against the slot the coach prescribed. A coach's assignment lifts the youth rule and nothing else; a program with
// no certified coach (a FEL template, a self-built plan) keeps it. A stored landing read the device called clean but
// whose numbers fault is a fault. Without health-data consent no intake history or pain row is read. A session with no
// gated item makes none of the gate's reads. And P6's warm-up sees the swap: a gated Prime jump no longer counts as the
// coach's jump work.
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const h = vi.hoisted(() => ({ user: 'client-1' as string | null, store: null as unknown as import('./todayMemoryDb').TodayStore, reads: [] as string[] }));

vi.mock('@/lib/camp/server', () => ({
  currentUserId: async () => h.user,
  bad: (error: string, status = 400) => Response.json({ error }, { status }),
}));
vi.mock('@/lib/db', async () => {
  const { todayMemoryDb } = await import('./todayMemoryDb');
  // every delegate call is recorded, so a test can say which tables a request read
  return {
    prisma: new Proxy({}, {
      get: (_t, k) => {
        const d = (todayMemoryDb(h.store) as Record<string | symbol, any>)[k]; // eslint-disable-line @typescript-eslint/no-explicit-any
        if (!d || typeof d !== 'object') return d;
        return new Proxy(d, { get: (dd, m) => (typeof dd[m] === 'function' ? (...a: unknown[]) => { h.reads.push(`${String(k)}.${String(m)}`); return dd[m](...a); } : dd[m]) });
      },
    }),
  };
});

import { NextRequest } from 'next/server';
import { GET as todayGET } from '@/app/api/coach/me/today/route';
import { POST as logPOST } from '@/app/api/coach/me/log/route';
import { catalogueRow, newTodayStore, seedProgram } from './todayMemoryDb';
import { INTAKE_IDS, INTAKE_VERSION } from '../health/intake';
import { bandOf } from '../assess/thresholds';
import { ASSESSMENT_KIND } from '../assess/prqWrite';
import { GATE_UNREAD_LINE, LANDING_CHECK_HREF, PROTOCOL_WHY, heldLine, jumpNoteOnStep, swappedLine } from './protocolGate';
import { GET as inboxGET } from '@/app/api/coach/inbox/route';
import { planTemplateClone, templateById } from './templates';
import { catalogueCreateInput, templateExercise } from './templateCatalogue';
import { servedWords } from './inboxServed';
import { sessionWarmupInputs } from './warmup';
import type { TodayPayload } from './todayServer';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
let SE: string[][] = [];
let PID = '', S1 = '';

async function today(as = 'client-1') {
  h.user = as;
  h.reads = [];
  const res = await todayGET();
  return { status: res.status, json: await res.json() as TodayPayload };
}
const byName = (p: TodayPayload, name: string) => p.today!.session.exercises.find((e) => e.name === name);
const names = (p: TodayPayload) => p.today!.session.exercises.map((e) => e.name);

// ── the athlete's facts ──
const cleanAnswers = () => ({
  [INTAKE_IDS.currentPain]: false, [INTAKE_IDS.recentInjuryOrSurgery]: false, [INTAKE_IDS.dizzinessFaintingChestPain]: false,
  [INTAKE_IDS.heartOrBpCondition]: false, [INTAKE_IDS.pregnancyOrPostpartum]: false, [INTAKE_IDS.heartRateOrBalanceMedicine]: false,
  [INTAKE_IDS.clinicianToldToAvoid]: false,
});
const consent = (scope = 'health_data', coachId: string | null = null) =>
  h.store.healthConsent!.push({ userId: 'client-1', scope, coachId, grantedAt: ago(30), revokedAt: null });
const intake = (over: Row = {}) =>
  h.store.healthIntake.push({ id: `hi-${h.store.healthIntake.length + 1}`, userId: 'client-1', version: INTAKE_VERSION, createdAt: ago(10), answers: cleanAnswers(), redFlags: [], clearedAt: null, ...over });
const FLEX = bandOf('t5.landingFlex'), VALGUS = bandOf('t5.landingValgus');
const landing = (daysAgo: number, metrics: Row = { landingFlex: FLEX.good, landingValgusLeft: VALGUS.good, landingValgusRight: VALGUS.good }, faults: string[] = []) =>
  h.store.workoutScan!.push({
    id: `ws-${h.store.workoutScan!.length + 1}`, userId: 'client-1', kind: ASSESSMENT_KIND, createdAt: ago(daysAgo),
    metrics: { assessmentId: `a${daysAgo}`, tests: [{ id: 'T5', status: 'scored', confidence: 0.9, sides: { both: { repsValid: 3, repsTotal: 3, complete: true, metrics, faults } } }] },
  });
/** Everything passing for an adult. */
const allClear = () => { consent(); intake(); landing(3); };
const setDob = (dobYear: number | null) => { h.store.user.find((u) => u.id === 'client-1')!.dobYear = dobYear; };

beforeEach(() => {
  h.store = newTodayStore();
  h.store.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: 1990 });
  h.store.fac!.push({ userId: 'coach-1', certificationStatus: 'certified' });
  h.store.pe.push(
    catalogueRow({ id: 'pe-goblet', coachId: 'coach-1', name: 'Goblet Squat', pattern: 'squat', skillLayer: 'strength' }),
    catalogueRow({ id: 'pe-drop', coachId: 'coach-1', name: 'Depth Drop to Vertical', category: 'lower-body', pattern: 'squat', primaryCues: ['Step off, do not jump off'], regressionOfId: 'pe-boxjump' }),
    // a rung that is gated itself: the walk steps past it
    catalogueRow({ id: 'pe-boxjump', coachId: 'coach-1', name: 'Box Jump', category: 'plyometric', pattern: 'squat', regressionOfId: 'pe-boxsquat' }),
    catalogueRow({ id: 'pe-boxsquat', coachId: 'coach-1', name: 'Box Squat', category: 'lower-body', pattern: 'squat', skillLayer: 'strength',
      primaryCues: ['Sit back to the box', 'Stand up fast'], regressionOfId: 'pe-wall' }),
    catalogueRow({ id: 'pe-wall', coachId: 'coach-1', name: 'Wall Sit', category: 'lower-body' }),
    // no easier step at all: held back
    catalogueRow({ id: 'pe-pogo', coachId: 'coach-1', name: 'Pogo hops', category: 'plyometric', pattern: 'locomotion', skillLayer: 'jump-land' }),
  );
  const ids = seedProgram(h.store, {
    coachId: 'coach-1', clientId: 'client-1', name: 'Power block', blockLabel: 'Week 1',
    sessions: [{ order: 1, label: 'Day 1', exercises: [
      { exerciseId: 'pe-pogo', section: 'prime', sets: 2, reps: '10', load: 'body' },
      { exerciseId: 'pe-drop', section: 'key', isKeySet: true, sets: 4, reps: '4', load: 'body', coachNote: 'Stick every landing.' },
      { exerciseId: 'pe-goblet', section: 'assist', sets: 3, reps: '8' },
    ] }],
  });
  SE = ids.exerciseIds; PID = ids.programId; [S1] = ids.sessionIds;
});

describe('open: every check passes', () => {
  it('an adult with consent, a clean intake, no pain and a landing check 3 days old gets the session as written', async () => {
    allClear();
    const { status, json } = await today();
    expect(status).toBe(200);
    expect(names(json)).toEqual(['Pogo hops', 'Depth Drop to Vertical', 'Goblet Squat']);
    expect(json.today!.session.exercises.some((e) => e.protocolGate)).toBe(false);
    expect(json.today!.session.held).toBeUndefined();
    // P6's warm-up reads the coach's Prime jump work off the card: it is there
    expect(sessionWarmupInputs(json.today!.session.exercises).coachAssignedImpact).toBe(true);
  });
});

describe('closed: swapped for the easier step, or held back — with the one line why', () => {
  it('no landing check on file: the drop arrives as Box Squat (past the gated Box Jump), the pogo is held', async () => {
    consent(); intake();
    const { json } = await today();
    const s = json.today!.session;
    expect(names(json)).toEqual(['Box Squat', 'Goblet Squat']);
    const swapped = byName(json, 'Box Squat')!;
    expect(swapped.id).toBe(SE[0][1]);                // the SLOT the coach prescribed
    expect(swapped.exerciseId).toBe('pe-boxsquat');   // what the athlete does (and a pain check-in names)
    expect(swapped.isKeySet).toBe(true);
    // MIRROR-COACH P8 FIX (2026-09-30): the coach's note was written for the drop, so it is said as the drop's — it used
    // to read "Stick every landing." bare, on a Box Squat (this assertion pinned that; it was the bug)
    expect(swapped.coachNote).toBe(jumpNoteOnStep('Depth Drop to Vertical', 'Stick every landing.'));
    expect(swapped.dose).not.toMatch(/jump|contact|landing/i);
    expect(swapped.coaching.cues).toEqual(['Sit back to the box', 'Stand up fast']);
    expect(swapped.coaching.easier).toEqual({ id: 'pe-wall', name: 'Wall Sit' }); // the easier step's own ladder, named
    expect(swapped.coaching.jumpLand).toBe(false);
    expect(swapped.protocolGate).toEqual({
      from: { id: 'pe-drop', name: 'Depth Drop to Vertical' }, line: swappedLine('Depth Drop to Vertical', PROTOCOL_WHY.landing_never),
      href: LANDING_CHECK_HREF, reason: 'landing_never',
    });
    expect(s.held).toEqual([{ id: SE[0][0], name: 'Pogo hops', line: heldLine('Pogo hops', PROTOCOL_WHY.landing_never), href: LANDING_CHECK_HREF, reason: 'landing_never' }]);
    // the warm-up no longer sees coach jump work in Prime (the pogo is not on the card)
    expect(sessionWarmupInputs(s.exercises).coachAssignedImpact).toBe(false);
  });

  it('the easier step logs against the prescribed slot', async () => {
    consent(); intake();
    await today();
    h.user = 'client-1';
    const res = await logPOST(new NextRequest('http://fel.test/api/coach/me/log', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ programId: PID, sessionId: S1, logs: [{ sessionExerciseId: SE[0][1], sets: [{ reps: 4 }, { reps: 4 }] }] }),
    }));
    expect(res.status).toBe(200);
    expect(h.store.log.map((l) => l.sessionExerciseId)).toEqual([SE[0][1]]);
  });

  it('a landing check over 4 weeks old', async () => {
    consent(); intake(); landing(29);
    expect(byName((await today()).json, 'Box Squat')!.protocolGate!.reason).toBe('landing_old');
  });

  it("SERVER-CHECKED: a stored landing read the device called clean, whose numbers fault, is a fault", async () => {
    consent(); intake(); landing(2, { landingFlex: (FLEX.fault as number) - 0.05, landingValgusLeft: VALGUS.good, landingValgusRight: VALGUS.good }, []);
    const g = byName((await today()).json, 'Box Squat')!.protocolGate!;
    expect(g.reason).toBe('landing_fault');
    expect(g.line).toContain('camera estimate');
  });

  it("today's pain decision 'step down' holds it, whatever else passes", async () => {
    allClear();
    h.store.painCheckIn!.push({ userId: 'client-1', exerciseName: 'Goblet Squat', bodyArea: 'knee', decision: 'step_down_flag_coach', createdAt: ago(1) });
    expect(byName((await today()).json, 'Box Squat')!.protocolGate!.reason).toBe('pain_today');
  });

  it("a 'continue' pain decision does not", async () => {
    allClear();
    h.store.painCheckIn!.push({ userId: 'client-1', exerciseName: 'Goblet Squat', bodyArea: 'knee', decision: 'continue', createdAt: ago(1) });
    expect(names((await today()).json)).toContain('Depth Drop to Vertical');
  });

  it("a red flag, even one the athlete cleared, holds it — and a coach's assignment does not lift it", async () => {
    consent(); landing(3);
    intake({ redFlags: [INTAKE_IDS.clinicianToldToAvoid], answers: { ...cleanAnswers(), [INTAKE_IDS.clinicianToldToAvoid]: true }, clearedAt: ago(1) });
    const { json } = await today();
    expect(json.hardStopped).toBe(false); // cleared: P5's pause is lifted, training goes on…
    expect(byName(json, 'Box Squat')!.protocolGate!.reason).toBe('red_flag'); // …jumps and drops do not
  });

  it('WITHOUT health-data consent: closed, and no intake history or pain row is read', async () => {
    intake(); landing(3);
    h.store.painCheckIn!.push({ userId: 'client-1', exerciseName: 'x', bodyArea: 'knee', decision: 'stop_see_clinician', createdAt: ago(1) });
    const { json } = await today();
    expect(byName(json, 'Box Squat')!.protocolGate!.reason).toBe('no_health_consent');
    expect(h.reads).not.toContain('painCheckIn.findMany');
    expect(h.reads).not.toContain('healthIntake.findMany');
    expect(h.reads.filter((r) => r === 'healthIntake.findFirst')).toHaveLength(1); // P5's own hard-stop read, once
  });
});

describe("the youth rule, and a coach's assignment", () => {
  it("a 15-year-old in a certified coach's program: the coach assigned it, so it shows (every other check passing)", async () => {
    allClear(); setDob(new Date().getFullYear() - 15);
    expect(names((await today()).json)).toEqual(['Pogo hops', 'Depth Drop to Vertical', 'Goblet Squat']);
  });
  it('the same athlete in a program with no certified coach (a FEL template, a self-built plan): held by the youth rule', async () => {
    allClear(); setDob(new Date().getFullYear() - 15);
    h.store.fac = [];
    const { json } = await today();
    expect(byName(json, 'Box Squat')!.protocolGate).toMatchObject({ reason: 'minor', line: swappedLine('Depth Drop to Vertical', PROTOCOL_WHY.minor), href: null });
    expect(json.today!.session.held![0].reason).toBe('minor');
  });
  it("a coach who is the athlete is not a coach's assignment", async () => {
    allClear(); setDob(null);
    h.store.program[0].coachId = 'client-1';
    for (const p of h.store.pe) p.coachId = 'client-1'; // their own catalogue, so the ladder reads
    h.store.fac!.push({ userId: 'client-1', certificationStatus: 'certified' });
    expect(byName((await today()).json, 'Box Squat')!.protocolGate!.reason).toBe('age_unknown');
  });
  it('a pending (not certified) coach is not either', async () => {
    allClear(); setDob(null);
    h.store.fac = [{ userId: 'coach-1', certificationStatus: 'pending' }];
    expect(byName((await today()).json, 'Box Squat')!.protocolGate!.reason).toBe('age_unknown');
  });
});

describe('what it costs', () => {
  it('a session with no gated item makes none of the gate\'s reads', async () => {
    h.store.se = h.store.se.filter((e) => e.exerciseId === 'pe-goblet');
    const { json } = await today();
    expect(names(json)).toEqual(['Goblet Squat']);
    for (const t of ['healthConsent', 'painCheckIn', 'workoutScan', 'facilitatorProfile']) expect(h.reads.some((r) => r.startsWith(`${t}.`))).toBe(false);
  });
  it('the ladder is read from the program coach\'s own catalogue only', async () => {
    consent(); intake();
    h.store.pe.push(catalogueRow({ id: 'pe-theirs', coachId: 'coach-2', name: 'Their Private Squat' }));
    h.store.pe.find((p) => p.id === 'pe-drop')!.regressionOfId = 'pe-theirs';
    const { json } = await today();
    expect(names(json)).toEqual(['Goblet Squat']);
    expect(json.today!.session.held!.map((x) => x.name)).toEqual(['Pogo hops', 'Depth Drop to Vertical']);
    expect(JSON.stringify(json)).not.toContain('Their Private Squat');
  });
});


// ── MIRROR-COACH P8 FIX (2026-09-30, code review) ────────────────────────────────────────────────────────────────────

/** A FEL template cloned into the store the way clone_template writes it: every rung seeded, linked, week 1's sessions. */
function cloneInto(templateId: string) {
  h.store = newTodayStore();
  h.store.user.push({ id: 'coach-1', name: 'Coach One', email: 'c1@x.test' }, { id: 'client-1', name: 'Sam', email: 'sam@x.test', dobYear: 1990 });
  h.store.fac!.push({ userId: 'coach-1', certificationStatus: 'certified' });
  const plan = planTemplateClone(templateById(templateId)!);
  const idOf = (k: string | null) => (k ? `pe-${k}` : null);
  for (const l of plan.links) h.store.pe.push(catalogueRow({ id: idOf(l.key), coachId: 'coach-1', ...catalogueCreateInput(l.key), regressionOfId: idOf(l.easier), progressionOfId: idOf(l.harder) }));
  const ids = seedProgram(h.store, {
    coachId: 'coach-1', clientId: 'client-1', name: templateId, blockLabel: plan.blocks[0].label,
    sessions: plan.blocks[0].sessions.map((x) => ({ order: x.order, label: x.label, exercises: x.items.map((i) => ({ exerciseId: idOf(i.exercise)!, ...i.spec })) })),
  });
  return { plan, ids };
}

describe("THE EASIER STEP IS SERVED WITH ITS OWN PRESCRIPTION (blocker: Today kept the jump's dose, cue, tempo and note)", () => {
  for (const t of ['adult-bw-3', 'adult-bw-4', 'adult-gym-3', 'adult-gym-4']) {
    it(`${t}, an adult with nothing on file: Monday's jump arrives as its step — no jump noun, no landing cue, the step's tempo`, async () => {
      const { plan } = cloneInto(t);
      const prime = plan.blocks[0].sessions[0].items.find((i) => i.spec.section === 'prime')!;
      const { json } = await today();
      const card = json.today!.session.exercises.find((e) => e.protocolGate)!;
      expect(card.protocolGate!.from.id).toBe(`pe-${prime.exercise}`);
      const step = templateExercise(card.exerciseId.replace(/^pe-/, ''))!;
      expect(step.impact).toBeNull();
      expect(card.name).toBe(step.catalogue.name);
      expect(card.dose, card.dose).not.toMatch(/jumps?\b|contacts?\b|landings?\b|hops?\b/i);
      expect(card.reps).toBe(String(prime.spec.reps).replace(/\s*(jumps?|contacts?)\b/i, '').trim());
      expect(card.coaching.setup.map((c) => c.id)).not.toContain('quiet-landing');
      expect(card.setupCues).not.toContain('quiet-landing');
      expect(card.tempo).toBe(step.catalogue.defaultTempo);
      expect(card.coachNote).toBeNull();
      expect(card.protocolGate!.line).toBe(swappedLine(templateExercise(prime.exercise)!.catalogue.name, PROTOCOL_WHY.no_health_consent));
    });
  }
});

describe('A FAILED GATE READ CLOSES THE GATE (minor: it made Today answer 500)', () => {
  it('the Quick Screens cannot be read: 200, the drop swapped and the pogo held, each with the unread line', async () => {
    allClear();
    Object.defineProperty(h.store, 'workoutScan', { get: () => { throw new Error('workoutScan is offline'); }, configurable: true });
    const { status, json } = await today();
    expect(status).toBe(200);
    expect(byName(json, 'Box Squat')!.protocolGate).toEqual({
      from: { id: 'pe-drop', name: 'Depth Drop to Vertical' }, line: swappedLine('Depth Drop to Vertical', GATE_UNREAD_LINE), href: null, reason: 'unread',
    });
    expect(json.today!.session.held).toEqual([{ id: SE[0][0], name: 'Pogo hops', line: heldLine('Pogo hops', GATE_UNREAD_LINE), href: null, reason: 'unread' }]);
    expect(names(json)).not.toContain('Depth Drop to Vertical');
  });
});

describe("WHAT THE ATHLETE DID ON A SWAPPED SLOT IS LOGGED, AND THE COACH'S INBOX SAYS SO (major)", () => {
  const log = async (entry: Row, complete = false) => {
    h.user = 'client-1';
    const res = await logPOST(new NextRequest('http://fel.test/api/coach/me/log', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ programId: PID, sessionId: S1, logs: [{ sets: [{ reps: 4 }], ...entry }], complete }),
    }));
    expect(res.status).toBe(200);
  };
  const served = (slot: string) => h.store.log.find((l) => l.sessionExerciseId === slot)?.servedExerciseId;

  it("the page's claim, when it is the slot's ladder step, is stored", async () => {
    consent(); intake();
    await log({ sessionExerciseId: SE[0][1], servedExerciseId: 'pe-boxsquat' });
    expect(served(SE[0][1])).toBe('pe-boxsquat');
  });
  it('no claim (an old tab): the gate re-run on the server records its step', async () => {
    consent(); intake();
    await log({ sessionExerciseId: SE[0][1] });
    expect(served(SE[0][1])).toBe('pe-boxsquat');
  });
  it('a claim naming anything else is not believed: the gate decides', async () => {
    consent(); intake();
    await log({ sessionExerciseId: SE[0][1], servedExerciseId: 'pe-goblet' });
    expect(served(SE[0][1])).toBe('pe-boxsquat');
  });
  it('the gate open: "as written" (null) is stored, claimed or re-derived', async () => {
    allClear();
    await log({ sessionExerciseId: SE[0][1], servedExerciseId: null });
    expect(served(SE[0][1])).toBeNull();
    h.store.log = [];
    await log({ sessionExerciseId: SE[0][1] });
    expect(served(SE[0][1])).toBeNull();
  });
  it('a slot the gate never decides writes no served value at all', async () => {
    consent(); intake();
    await log({ sessionExerciseId: SE[0][2], servedExerciseId: 'pe-boxsquat' });
    expect(served(SE[0][2]) ?? null).toBeNull();
  });
  it("THE INBOX: 'Did Box Squat in place of Depth Drop to Vertical', and nothing on a slot done as written", async () => {
    consent(); intake();
    await log({ sessionExerciseId: SE[0][1], servedExerciseId: 'pe-boxsquat' });
    await log({ sessionExerciseId: SE[0][2] }, true);
    h.user = 'coach-1';
    const res = await inboxGET();
    const j = await res.json() as { items: { logs: { exercise: string; servedLine: string | null }[] }[] };
    const logs = j.items[0].logs;
    expect(logs.find((l) => l.exercise === 'Depth Drop to Vertical')!.servedLine).toBe(servedWords('Box Squat', 'Depth Drop to Vertical'));
    expect(logs.find((l) => l.exercise === 'Goblet Squat')!.servedLine).toBeNull();
  });
});
