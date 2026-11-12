// EVERY-SCREEN P7: the owner's four answers of 2026-11-11 (docs/OWNER-DECISIONS.md), each held by a test.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { accountAgeBand } from '@/lib/screen/accountAge';
import { tryAgeBand } from '@/lib/privacy/tryAgeGate';

const src = (p: string) => readFileSync(p, 'utf8');
const on = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12);   // the local calendar day, as the age rules read it

describe('1. a signed-in person with a birth date on file is not asked "How old are you?" again', () => {
  const now = on(2026, 11, 11);
  it('12/13: the 13th birthday is the day the band changes', () => {
    expect(accountAgeBand('2013-11-12', now)).toBe('under-13');   // 13 tomorrow
    expect(accountAgeBand('2013-11-11', now)).toBe('13-17');      // 13 today: a birthday today counts
    expect(accountAgeBand('2013-11-10', now)).toBe('13-17');
  });
  it('17/18: the 18th birthday is the day the band changes', () => {
    expect(accountAgeBand('2008-11-12', now)).toBe('13-17');      // 18 tomorrow
    expect(accountAgeBand('2008-11-11', now)).toBe('18+');        // 18 today
    expect(accountAgeBand('1990-01-01', now)).toBe('18+');
  });
  it('29 February: the birthday falls on 1 March in a plain year', () => {
    expect(accountAgeBand('2008-02-29', on(2026, 2, 28))).toBe('13-17');
    expect(accountAgeBand('2008-02-29', on(2026, 3, 1))).toBe('18+');
  });
  it('a missing, unreadable or future date: no band, so the question is asked exactly as before', () => {
    for (const d of [null, undefined, '', 'not a date', '2013-02-30', '2027-01-01']) expect(accountAgeBand(d, now)).toBeNull();
  });
  it('the band is the one the rest of the app reads from a full birth date (tryAgeBand), never a new rule', () => {
    for (const d of ['2013-11-12', '2013-11-11', '2008-11-12', '2008-11-11', '1990-01-01']) expect(accountAgeBand(d, now)).toBe(tryAgeBand(d, now));
    expect(src('lib/screen/accountAge.ts')).toContain("import { tryAgeBand } from '@/lib/privacy/tryAgeGate';");
  });
  it('the Quick Screen reads it on the server and answers through its own age path; signed out, nothing changes', () => {
    const page = src('app/play/mirror/assess/page.tsx');
    expect(page).toContain('const dob = userId?.id ? await readUserDob(');
    expect(page).toContain('<AssessApp initialRun={run} accountAge={accountAgeBand(dob)} />');
    const app = src('app/play/mirror/assess/_components/assess-app.tsx');
    expect(app).toContain("if (next.step === 'age' && accountAge) { pre({ type: 'age', age: accountAge }); return; }");
    expect(app).toContain("{phase === 'age' && !accountAge ? <AgeStep onAnswer={answerAge} /> : null}");
    expect(app).toContain("{ type: 'age', age: lockSessionAge(tabStorage(), input.age) }");   // the session lock still takes the answer first
  });
});

describe('2. sign-up: the birth date first, then "What did you come for?"', () => {
  const a = src('components/auth-form.tsx');
  it('the choices and the first game show once the birth date is confirmed', () => {
    expect(a).toContain("const choicesOpen = mode === 'signup' && birthYear !== null;");
    expect(a).toMatch(/\{choicesOpen && \(\s*<div className="mb-5">\s*<PathPicker/);
    expect(a).toContain('{choicesOpen && path === \'play\' && (');
    expect(a).toContain('{choicesOpen && path !== \'play\' && (');
    expect(a.indexOf('<AgeStep mode="signup"')).toBeLessThan(a.indexOf('<PathPicker'));
  });
});

describe('3. the /login tagline', () => {
  it('is exactly the owner\'s words', () => {
    const a = src('components/auth-form.tsx');
    expect(a).toContain("? 'Real sports. Real training. Real stats.'");
    expect(a).not.toContain('your on-court reps become real stats');
  });
});

describe('4. the terms tick is a real checkbox: same words, same rule', () => {
  const a = src('components/auth-form.tsx');
  it('an <input type="checkbox"> inside its label, so the label\'s words name it', () => {
    expect(a).toContain('<input type="checkbox" checked={policyAccepted} onChange={(e) => setPolicyAccepted(e.target.checked)} className="peer sr-only" data-terms-tick />');
    expect(a).toContain('peer-focus-visible:ring-2');
    expect(a).not.toContain('onClick={() => setPolicyAccepted(!policyAccepted)}');
    expect(a).toContain('I agree to the{\' \'}');
  });
  it('it must still be ticked to continue', () => {
    expect(a).toContain("disabled={loading || (mode === 'signup' && !policyAccepted)}");
    expect(a).toContain("if (!policyAccepted) {");
  });
});
