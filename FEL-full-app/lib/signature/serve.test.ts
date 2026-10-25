// SIGNATURE-PROGRAMS (2026-10-25): today's session through the drills page's gates — youth rules, the jump gate, a pain
// check-in (easier / step down / stop and see someone), a red flag, a Low readiness day — and never harder than planned.
import { describe, expect, it } from 'vitest';
import { loadLibraryFiles } from '@/lib/library/files';
import { MAX_EFFORT_CUE } from '@/lib/coach/taxonomy';
import { easeOffClientLine } from '@/lib/coach/weeklyDraft/copy';
import { RED_FLAG_COPY } from '@/lib/health/intake';
import { PAIN_DECISION_COPY, type PainDecision } from '@/lib/health/painRule';
import { LANDING_CHECK_HREF } from '@/lib/coach/protocolGate';
import { LANDING_CHECK_ENTRY } from '@/lib/drills/route';
import { SIGNATURE_PROGRAMS, signatureProgram } from './content';
import { isImpactEntry } from './check';
import { expandPlan } from './plan';
import { CAREFUL_GATE, IMPACT_LINES, impactWhy, serveSession, type DayGate, type ExerciseLite } from './serve';

const LIB = new Map(loadLibraryFiles().map((e) => [e.id, e]));
const lookup = (id: string): ExerciseLite | null => {
  const e = LIB.get(id);
  return e ? { id: e.id, name: e.name, setup: e.setup, cues: e.cues, faults: e.faults, pattern: e.pattern, category: e.category, youthOk: e.youthOk, prehabNote: e.prehabNote, dosage: e.dosage } : null;
};
const OPEN: DayGate = { youth: false, hardStopped: false, painDecision: null, jumpGate: { closed: false, why: '', href: null }, readinessLow: false };
const BAND = ['idle', 'cruise', 'drive', 'surge', 'full'];
const VJ = signatureProgram('vertical-jump')!;
const vjSession = (week = 3, key = 'A', youth = false) => expandPlan(VJ, { youth })[week - 1].sessions.find((s) => s.key === key)!;

describe('today\'s gates', () => {
  it('an open adult day serves the session as planned', () => {
    const s = vjSession();
    const out = serveSession(s, OPEN, lookup);
    expect(out.items.map((i) => [i.ex, i.sets, i.effortBand])).toEqual(s.items.map((i) => [i.ex, i.sets, i.effortBand]));
    expect(out.notes).toEqual([]);
    expect(out.contacts).toBeGreaterThan(0);
  });

  it('YOUTH RULES: no jump or landing is served, every swap is a calm youth-safe entry, nothing past Drive, no max-effort cue', () => {
    for (const p of SIGNATURE_PROGRAMS) for (const w of expandPlan(p, { youth: true, cap: false })) for (const s of w.sessions) {
      const out = serveSession(s, { ...OPEN, youth: true }, lookup);
      expect(out.contacts, `${p.id} ${s.id}`).toBe(0);
      for (const i of out.items) {
        const e = LIB.get(i.ex)!;
        expect(isImpactEntry(e), `${p.id} ${s.id} ${i.ex}`).toBe(false);
        expect(e.youthOk).toBe(true);
        expect(BAND.indexOf(i.effortBand)).toBeLessThanOrEqual(BAND.indexOf('drive'));
        if (i.cue) expect(MAX_EFFORT_CUE.test(i.cue)).toBe(false);
      }
      if (s.items.some((i) => i.impact)) expect(out.notes.find((n) => n.id === 'impact')?.text).toBe(IMPACT_LINES.youth_impact);
    }
  });

  it('the jump gate shut: jumps swap to their step-downs, with the gate\'s own reason and the landing check\'s front door', () => {
    const out = serveSession(vjSession(), { ...OPEN, jumpGate: { closed: true, why: 'Jumps wait for a landing check.', href: LANDING_CHECK_HREF } }, lookup);
    expect(out.contacts).toBe(0);
    expect(out.items.filter((i) => i.swappedFrom).length).toBe(2);
    const note = out.notes.find((n) => n.id === 'impact')!;
    expect(note.text).toMatch(/Jumps wait for a landing check/);
    expect(note.href).toBe(LANDING_CHECK_ENTRY);
  });

  it('the drills page\'s order: pain, then unread details, then youth, then the gate', () => {
    expect(impactWhy({ ...OPEN, youth: true, painDecision: 'step_down_flag_coach' })).toBe('pain');
    expect(impactWhy({ ...OPEN, youth: true, unavailable: true })).toBe('unavailable');
    expect(impactWhy({ ...OPEN, youth: true, jumpGate: { closed: true, why: '', href: null } })).toBe('youth_impact');
    expect(impactWhy({ ...OPEN, jumpGate: { closed: true, why: '', href: null } })).toBe('jump_gate');
    expect(impactWhy(OPEN)).toBeNull();
    expect(impactWhy(CAREFUL_GATE)).toBe('unavailable');
  });

  it('a pain check-in that says stop and see someone: only calm work runs, in the check-in\'s own words and "check with a clinician"', () => {
    for (const d of ['stop_see_clinician', 'stop_tell_adult'] as PainDecision[]) {
      const youth = d === 'stop_tell_adult';
      const out = serveSession(vjSession(3, 'A', youth), { ...OPEN, youth, painDecision: d }, lookup);
      for (const i of out.items) expect(['prep', 'cooldown']).toContain(i.section);
      expect(out.held.length).toBeGreaterThan(0);
      expect(out.notes.map((n) => n.text)).toEqual([PAIN_DECISION_COPY[d], easeOffClientLine(youth)]);
      expect(out.contacts).toBe(0);
    }
    expect(easeOffClientLine(false)).toMatch(/check with a clinician/);
  });

  it('a pain check-in that asks for an easier version eases the work and routes to the existing "see a professional" wording', () => {
    const out = serveSession(vjSession(), { ...OPEN, painDecision: 'step_down_flag_coach' }, lookup);
    expect(out.contacts).toBe(0);
    expect(out.items.some((i) => i.eased)).toBe(true);
    expect(out.notes.map((n) => n.id)).toEqual(['impact', 'pain_ease', 'see_someone']);
  });

  it('a standing red flag: nothing runs, in the intake\'s own words', () => {
    const out = serveSession(vjSession(), { ...OPEN, hardStopped: true }, lookup);
    expect(out).toMatchObject({ blocked: true, items: [], contacts: 0 });
    expect(out.notes).toEqual([{ id: 'red_flag', text: RED_FLAG_COPY }]);
  });

  it('a Low readiness day eases the work rows (a set less, a step of effort) and says so', () => {
    const s = vjSession();
    const out = serveSession(s, { ...OPEN, readinessLow: true }, lookup);
    const key = out.items.find((i) => i.isKeySet)!;
    const planned = s.items.find((i) => i.isKeySet)!;
    expect(key.sets).toBe(planned.sets - 1);
    expect(BAND.indexOf(key.effortBand)).toBe(BAND.indexOf(planned.effortBand) - 1);
    expect(key.eased).toBeTruthy();
    expect(out.notes.find((n) => n.id === 'readiness')?.text).toMatch(/read Low/);
  });

  it('NEVER HARDER: across every session of every program and every gate, no served row has more sets, a harder band or more contacts than planned', () => {
    const pains: (PainDecision | null)[] = [null, 'continue', 'easier_variation', 'step_down_flag_coach', 'stop_see_clinician', 'stop_tell_adult'];
    let rows = 0;
    for (const p of SIGNATURE_PROGRAMS) for (const youth of [false, true]) for (const w of expandPlan(p, { youth, cap: false })) for (const s of w.sessions) {
      for (const pain of pains) for (const readinessLow of [false, true]) for (const closed of [false, true]) {
        const out = serveSession(s, { youth, hardStopped: false, painDecision: pain, readinessLow, jumpGate: { closed, why: '', href: null } }, lookup);
        const planned = new Map(s.items.map((i) => [i.key, i]));
        const plannedContacts = s.items.reduce((n, i) => n + (i.contacts ?? 0) * i.sets, 0);
        expect(out.contacts).toBeLessThanOrEqual(plannedContacts);
        for (const i of out.items) {
          const was = planned.get(i.key)!;
          expect(i.sets, `${p.id} ${s.id} ${i.ex}`).toBeLessThanOrEqual(was.sets);
          expect(BAND.indexOf(i.effortBand)).toBeLessThanOrEqual(BAND.indexOf(was.effortBand));
          rows++;
        }
        if (pain && pain !== 'continue') expect(out.contacts).toBe(0);
      }
    }
    expect(rows).toBeGreaterThan(30_000);
  });
});
