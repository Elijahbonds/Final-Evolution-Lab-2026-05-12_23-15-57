// SIGNATURE-PROGRAMS (2026-10-25): the four programs as content — every exercise in the library, every week through the
// coach builder's validators, the owner's 8–12 weeks, the prehab field, the six patterns, and the checks themselves.
import { describe, expect, it } from 'vitest';
import { loadLibraryFiles } from '@/lib/library/files';
import type { LibraryExercise } from '@/lib/library/types';
import { PREHAB_NOTE } from '@/lib/library/vocab';
import { patternCoverage } from '@/lib/coach/coverage';
import { MEDICAL_WORDS } from '@/lib/coach/weeklyDraft/copy';
import * as COPY from './copy';
import { SIGNATURE_PROGRAMS, signatureProgram } from './content';
import { isImpactEntry, programProblems, programText, SESSION_CONTACTS_MAX } from './check';
import { applyEdits } from './edits';
import { MAX_PROGRAM_WEEKS, MIN_PROGRAM_WEEKS, expandPlan, planRange, plannedWeeks } from './plan';
import type { SignatureProgram } from './types';

const LIB = new Map(loadLibraryFiles().map((e) => [e.id, e]));
const lookup = (id: string): LibraryExercise | null => LIB.get(id) ?? null;
const ids = (p: SignatureProgram) => p.phases.flatMap((ph) => ph.sessions.flatMap((s) => s.items.flatMap((i) => [i.ex, ...(i.down ? [i.down] : [])])));

describe('the four signature programs', () => {
  it('are the owner\'s four, in order', () => {
    expect(SIGNATURE_PROGRAMS.map((p) => p.id)).toEqual(['vertical-jump', 'basketball-skills', 'athletic-foundation', 'pain-free']);
  });

  it('every exercise and every calm step-down a program uses exists in the shared library', () => {
    const missing = SIGNATURE_PROGRAMS.flatMap((p) => ids(p).filter((x) => !LIB.has(x)).map((x) => `${p.id}: ${x}`));
    expect(missing).toEqual([]);
    // and the library is the full one (seed + FEL drafts), not an empty stand-in
    expect(LIB.size).toBeGreaterThan(5000);
  });

  it('each has no problem: library, builder doses, one key set, youth bands, contacts, length, copy', () => {
    for (const p of SIGNATURE_PROGRAMS) expect(programProblems(p, lookup), p.id).toEqual([]);
  });

  it('runs 8–12 weeks as written and under every decision it can take', () => {
    expect(SIGNATURE_PROGRAMS.map((p) => plannedWeeks(p))).toEqual([10, 10, 12, 8]);
    for (const p of SIGNATURE_PROGRAMS) {
      const r = planRange(p);
      expect(r.min, p.id).toBeGreaterThanOrEqual(MIN_PROGRAM_WEEKS);
      expect(r.max, p.id).toBeLessThanOrEqual(MAX_PROGRAM_WEEKS);
    }
  });

  it('is in phases, with sessions, sets, reps and retests', () => {
    for (const p of SIGNATURE_PROGRAMS) {
      expect(p.phases.length, p.id).toBeGreaterThanOrEqual(3);
      for (const ph of p.phases) {
        expect(ph.sessions.length, `${p.id}/${ph.id}`).toBe(p.daysPerWeek);
        expect(ph.sessions.some((s) => (s.retest ?? []).length > 0), `${p.id}/${ph.id} re-tests`).toBe(true);
        for (const s of ph.sessions) for (const i of s.items) expect(i.sets).toBeGreaterThan(0);
      }
    }
  });

  it('the pain-free program carries exactly "General prehab, not treatment." in its prehab field; the others carry none', () => {
    expect(signatureProgram('pain-free')!.prehabNote).toBe(PREHAB_NOTE);
    expect(PREHAB_NOTE).toBe('General prehab, not treatment.');
    for (const p of SIGNATURE_PROGRAMS.filter((x) => x.id !== 'pain-free')) expect(p.prehabNote).toBeNull();
  });

  it('no line of program copy or page copy uses a medical word or a claim (the prehab note is the one fixed exception)', () => {
    for (const p of SIGNATURE_PROGRAMS) for (const t of programText(p)) expect(MEDICAL_WORDS.test(t), t).toBe(false);
    const lines = Object.values(COPY).flatMap((v) => (typeof v === 'string' ? [v] : []));
    for (const t of lines) expect(MEDICAL_WORDS.test(t), t).toBe(false);
  });

  it('every jump or landing counts its contacts and has a calm, youth-safe step-down; an adult session stays under the owner\'s busiest day', () => {
    for (const p of SIGNATURE_PROGRAMS) {
      for (const ph of p.phases) for (const s of ph.sessions) for (const i of s.items) {
        const e = LIB.get(i.ex)!;
        expect(i.contacts != null, `${p.id} ${i.ex}`).toBe(isImpactEntry(e));
        if (i.contacts != null) {
          const d = LIB.get(i.down!)!;
          expect(isImpactEntry(d), `${i.down}`).toBe(false);
          expect(d.youthOk).toBe(true);
        }
      }
      for (const w of expandPlan(p, { youth: false, cap: false })) for (const s of w.sessions) {
        expect(s.items.reduce((n, i) => n + (i.contacts ?? 0) * i.sets, 0)).toBeLessThanOrEqual(SESSION_CONTACTS_MAX);
      }
    }
  });

  it('the athletic foundation covers the six patterns every week (the coach templates\' coverage strip)', () => {
    const p = signatureProgram('athletic-foundation')!;
    for (const w of expandPlan(p, { youth: false, cap: false })) {
      const items = w.sessions.flatMap((s) => s.items.map((i) => ({ pattern: LIB.get(i.ex)!.pattern, section: i.section, sets: i.sets })));
      const strip = patternCoverage(items, w.sessions.map((s) => s.items.map((i) => ({ pattern: LIB.get(i.ex)!.pattern, section: i.section, sets: i.sets }))));
      expect(strip.cells.filter((c) => c.state !== 'done').map((c) => c.pattern), `week ${w.n}`).toEqual([]);
    }
  });

  it('cites only chapters the books have (Playbook 1–10, Blueprint 1–20 in phases 1–5)', () => {
    for (const p of SIGNATURE_PROGRAMS) {
      for (const s of [...p.sources, ...p.phases.flatMap((ph) => ph.source)]) {
        const chs = [...s.where.matchAll(/ch(\d+)/g)].map((m) => Number(m[1]));
        const max = s.book === 'playbook' ? 10 : s.book === 'blueprint' ? 20 : 99;
        for (const c of chs) expect(c, `${p.id} ${s.where}`).toBeLessThanOrEqual(max);
        for (const m of s.where.matchAll(/phase (\d)/g)) if (s.book === 'blueprint') expect(Number(m[1])).toBeLessThanOrEqual(5);
      }
      // the gaps the books leave are said, not hidden
      expect(p.gaps.length, p.id).toBeGreaterThan(0);
    }
  });

  it('the checks catch what they guard (mutations)', () => {
    const vj = signatureProgram('vertical-jump')!;
    const bad = (edits: Parameters<typeof applyEdits>[1]) => programProblems(applyEdits(vj, edits), lookup);
    expect(bad({ 'base/A/3': { ex: 'not-an-exercise' } }).join(' ')).toMatch(/not in the library/);
    expect(bad({ 'base/A/3': { ex: 'pogo-hop' } }).join(' ')).toMatch(/without its contacts/);
    expect(bad({ 'base/A/2': { ex: 'goblet-squat' } }).join(' ')).toMatch(/contacts on an item that is not a jump/);
    expect(bad({ 'base/A/3': { reps: 'x'.repeat(30) } }).join(' ')).toMatch(/different prescription/);
    expect(bad({ 'build/A/2': { sets: 10 } }).join(' ')).toMatch(/contacts \(max/);
    const wordy: SignatureProgram = { ...vj, summary: 'This program will heal your knee.' };
    expect(programProblems(wordy, lookup).join(' ')).toMatch(/medical word/);
    const short: SignatureProgram = { ...vj, phases: vj.phases.slice(0, 2) };
    expect(programProblems(short, lookup).join(' ')).toMatch(/planned weeks/);
  });
});
