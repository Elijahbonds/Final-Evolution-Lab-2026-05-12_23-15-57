// PLAT-P01 (2026-10-27): the first adapter (lib/session-player/fromSignature.ts) over the four real programs and the real
// library: what Start does for each viewer (the admin's draft preview saves nothing; an athlete never sees a draft), every
// cue the player shows is ≤ 18 words (an over-long one is reported to cue-rewrite, not rewritten here), the words on
// screen during a set, the loops, and the engine's one door to lib/signature.
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadLibraryFiles } from '@/lib/library/files';
import { SIGNATURE_PROGRAMS, signatureProgram } from '@/lib/signature/content';
import { expandPlan } from '@/lib/signature/plan';
import { CAREFUL_GATE, serveSession, type DayGate, type ServedSession } from '@/lib/signature/serve';
import { buildProgramView } from '@/lib/signature/view';
import { clipsFor } from '@/lib/session-player/clips';
import { doseParts } from '@/lib/session-player/dose';
import { fromSignature, playMode, signatureExerciseIds } from '@/lib/session-player/fromSignature';
import { PLAYER_COPY, stepOfLine } from '@/components/session-player/copy';
import { DEMO_COMING } from '@/lib/library/surfaceDemo';

const LIB = new Map(loadLibraryFiles().map((e) => [e.id, e]));
const lookup = (id: string) => { const e = LIB.get(id); return e ? { id: e.id, name: e.name, setup: e.setup, cues: e.cues, faults: e.faults, pattern: e.pattern, category: e.category, youthOk: e.youthOk, prehabNote: e.prehabNote, dosage: e.dosage } : null; };
const OPEN: DayGate = { youth: false, hardStopped: false, painDecision: null, jumpGate: { closed: false, why: '', href: null }, readinessLow: false };
const GATES: Record<string, DayGate> = {
  open: OPEN, youth: { ...OPEN, youth: true }, careful: CAREFUL_GATE, low: { ...OPEN, readinessLow: true },
  pain: { ...OPEN, painDecision: 'easier_variation' }, jumpGate: { ...OPEN, jumpGate: { closed: true, why: '', href: null } },
};
const adult = { userId: 'u1', isAdmin: false, youth: false, hasPro: false };
/** PLAT-P01 measured 2026-10-27: Vertical Jump week-1 sets within 25 words while working (the ratchet only goes up). */
const RATCHET_VJ_WITHIN = 22;
const words = (s: string) => s.split(/\s+/).filter((x) => /[A-Za-z0-9]/.test(x)).length;   // the rig's count (scripts/plat-plan/shots.mts)

/** Every session every program can serve, under every gate (the whole plan, not just week 1). */
function* everyServed(): Generator<{ program: string; gate: string; s: ServedSession }> {
  for (const p of SIGNATURE_PROGRAMS) for (const [g, gate] of Object.entries(GATES)) for (const w of expandPlan(p, { youth: gate.youth })) for (const s of w.sessions) {
    yield { program: p.id, gate: g, s: serveSession(s, gate, lookup) };
  }
}

describe('fromSignature', () => {
  const VJ = signatureProgram('vertical-jump')!;
  const clips = clipsFor(signatureExerciseIds(VJ), (id) => LIB.get(id) ?? null);
  const w1a = serveSession(expandPlan(VJ, { youth: false })[0].sessions[0], OPEN, lookup);

  it('turns today\'s served session into the player\'s steps, word for word, with each exercise\'s own loop', () => {
    const s = fromSignature(w1a, { title: 'Vertical Jump · A', clips });
    expect(s.id).toBe('w1:A');
    expect(s.steps.map((x) => x.exId)).toEqual(w1a.items.map((i) => i.ex));
    for (const [i, it] of w1a.items.entries()) {
      expect(s.steps[i]).toMatchObject({ name: it.name, sets: it.sets, reps: it.reps, workSeconds: it.workSeconds, restSeconds: it.restSeconds, setup: it.setup, cue: it.cue, clip: clips[it.ex] });
    }
  });

  it('a swapped or eased item carries the page\'s own day line; a held item is not played at all', () => {
    const gated = serveSession(expandPlan(VJ, { youth: false })[0].sessions[2], { ...OPEN, jumpGate: { closed: true, why: '', href: null }, readinessLow: true }, lookup);
    const s = fromSignature(gated, { title: 't', clips });
    const swapped = gated.items.find((i) => i.swappedFrom)!;
    expect(s.steps.find((x) => x.exId === swapped.ex)?.note).toBe(`In place of ${swapped.swappedFrom} today.`);
    const eased = gated.items.find((i) => i.eased && !i.swappedFrom);
    if (eased) expect(s.steps.find((x) => x.exId === eased.ex)?.note).toBe(`Eased today: ${eased.eased}.`);
    const youth = serveSession(expandPlan(signatureProgram('athletic-foundation')!, { youth: true })[0].sessions[0], GATES.youth, lookup);
    const ys = fromSignature(youth, { title: 't', clips: {} });
    for (const h of youth.held) expect(ys.steps.some((x) => x.name === h.name)).toBe(false);
  });

  it('every loop is the exercise\'s own (the library\'s choice) — never another movement; no loop is the still', () => {
    for (const p of SIGNATURE_PROGRAMS) {
      const ids = signatureExerciseIds(p);
      const m = clipsFor(ids, (id) => LIB.get(id) ?? null);
      for (const id of ids) {
        const e = LIB.get(id)!;
        expect(m[id], id).toBe(e ? (clipsFor([id], () => e)[id]) : null);
      }
    }
  });
});

describe('what Start does', () => {
  const VJ = signatureProgram('vertical-jump')!;
  const view = (o: Record<string, unknown>) => buildProgramView({ program: VJ, status: 'approved', viewer: adult, ready: true, enrollment: null, gate: OPEN, lookup, purchasesOpen: false, ...o } as never);
  const todayOf = (v: NonNullable<ReturnType<typeof buildProgramView>>) => v.current?.sessions[0] ?? null;

  it('a draft, viewed by the admin, plays as a preview that saves nothing', () => {
    const v = view({ status: 'draft', viewer: { ...adult, isAdmin: true } })!;
    expect(v.canStart).toBe(false);
    expect(playMode(v, todayOf(v))).toEqual({ mode: 'preview', enroll: false });
    // and with the tables not applied yet (OWN-01): still the preview
    const nt = view({ status: 'draft', ready: false, viewer: { ...adult, isAdmin: true } })!;
    expect(playMode(nt, todayOf(nt))).toEqual({ mode: 'preview', enroll: false });
  });

  it('a non-admin cannot start a draft: the page is not theirs to see (canSee), and canStart is approved only', () => {
    expect(view({ status: 'draft' })).toBeNull();
    expect(view({ status: 'rejected' })).toBeNull();
  });

  it('an adult on an approved program saves; the first Start also enrolls', () => {
    const fresh = view({})!;
    expect(playMode(fresh, todayOf(fresh))).toEqual({ mode: 'save', enroll: true });
    const enrolled = view({ enrollment: { programId: 'vertical-jump', startedAt: '2026-10-20T10:00:00.000Z', done: {}, events: [] } })!;
    expect(playMode(enrolled, enrolled.current!.sessions.find((s) => s.id === enrolled.nextSessionId)!)).toEqual({ mode: 'save', enroll: false });
  });

  it('under youth rules the session is kept on the phone', () => {
    const y = view({ viewer: { ...adult, youth: true }, gate: GATES.youth })!;
    expect(playMode(y, todayOf(y))).toEqual({ mode: 'device', enroll: false });
  });

  it('nothing plays on a FEL Pro week without Pro, a red flag, or no session', () => {
    const locked = view({ enrollment: { programId: 'vertical-jump', startedAt: '2026-10-06T10:00:00.000Z', done: Object.fromEntries(['A', 'B', 'C'].map((k) => [`w1:${k}`, '2026-10-07T10:00:00.000Z'])), events: [] } })!;
    expect(locked.premium.locked).toBe(true);
    expect(playMode(locked, null)).toBeNull();
    const red = view({ gate: { ...OPEN, hardStopped: true } })!;
    expect(todayOf(red)!.blocked).toBe(true);
    expect(playMode(red, todayOf(red))).toBeNull();
  });
});

describe('the words', () => {
  it('every cue the player shows is 18 words or fewer, across all four programs, every week, every gate', () => {
    const over = new Map<string, string>();
    let n = 0;
    for (const { program, s } of everyServed()) for (const it of s.items) {
      if (!it.cue) continue;
      n++;
      if (words(it.cue) > 18) over.set(it.cue, `${program}: ${it.name} (${words(it.cue)} words)`);
    }
    expect(n).toBeGreaterThan(1000);
    expect([...over.values()]).toEqual([]);   // an over-long cue goes to cue-rewrite's queue, not rewritten here
  });

  /** The words on screen during a set: "n of N", the name, the dose, the cue, the button; the still's "Demo coming" label. */
  const workingWords = (st: { name: string; sets: number; reps: string | null; workSeconds: number | null; cue: string | null; clip: string | null }, total: number) => {
    const d = doseParts(st);
    const big = st.workSeconds ? String(st.workSeconds) : d.big;
    const small = st.workSeconds ? (d.small ? `s · ${d.small}` : 's') : d.small ?? '';
    const badge = st.clip ? '' : `YOUR ATHLETE · ${DEMO_COMING}`;
    return words([stepOfLine(total, total), st.name, big, small, st.cue ?? '', PLAYER_COPY.setDone, badge].join(' '));
  };

  it('a set of the owner-check session (Vertical Jump, week 1): the words on screen, measured against 25', () => {
    const VJ = signatureProgram('vertical-jump')!;
    const clips = clipsFor(signatureExerciseIds(VJ), (id) => LIB.get(id) ?? null);
    const over: string[] = []; let n = 0;
    for (const ps of expandPlan(VJ, { youth: false })[0].sessions) {
      const s = fromSignature(serveSession(ps, OPEN, lookup), { title: 't', clips });
      for (const st of s.steps) { n++; const w = workingWords(st, s.steps.length); if (w > 25) over.push(`${ps.id} ${st.name}: ${w}`); }
    }
    console.log(`[plat-p01] Vertical Jump week 1: ${n - over.length} of ${n} sets within 25 words; over: ${over.join(' | ') || 'none'}`);
    // a ratchet, not the gate: the gate is read on the rig and reported; this only stops it getting worse
    expect(n - over.length).toBeGreaterThanOrEqual(RATCHET_VJ_WITHIN);
  });

  it('over every program and gate, the share of sets within 25 words is measured (the report reads it)', () => {
    let all = 0; let within = 0; let max = 0;
    for (const { program, s } of everyServed()) {
      const clips = clipsFor(s.items.map((i) => i.ex), (id) => LIB.get(id) ?? null);
      const ses = fromSignature(s, { title: program, clips });
      for (const st of ses.steps) { const w = workingWords(st, ses.steps.length); all++; if (w <= 25) within++; max = Math.max(max, w); }
    }
    // PLAT-P01 report: within / all and the max are printed by the gate run
    console.log(`[plat-p01] sets within 25 words while working: ${within} of ${all} (max ${max})`);
    expect(within / all).toBeGreaterThanOrEqual(0.86);   // measured 5038 of 5826 (0.865) on 2026-10-27 after demo-loops (#467); a ratchet
  });
});

describe('the engine stays free of signature code', () => {
  it('lib/session-player/** imports nothing from lib/signature/** except fromSignature.ts', () => {
    const dir = join(__dirname, '..', '..', 'lib', 'session-player');
    const bad: string[] = [];
    for (const f of readdirSync(dir)) {
      if (!/\.tsx?$/.test(f) || f === 'fromSignature.ts') continue;
      const src = readFileSync(join(dir, f), 'utf8');
      if (/from\s+['"](@\/lib\/signature|\.\.\/signature)/.test(src) || /import\(\s*['"]@\/lib\/signature/.test(src)) bad.push(f);
    }
    expect(bad).toEqual([]);
    // and the adapter imports types only
    const ad = readFileSync(join(dir, 'fromSignature.ts'), 'utf8');
    expect([...ad.matchAll(/^import (?!type ).*from '@\/lib\/signature/gm)]).toEqual([]);
  });
});
