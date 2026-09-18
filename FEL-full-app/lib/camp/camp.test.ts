import { describe, expect, it } from 'vitest';
import { computeResiliency } from './resiliency';
import { certificationStatusFor, needsGuardianConsent } from './certification';
import { CURRICULUM_VERSION } from '../curriculum/blueprint';

const m = 60_000;
describe('computeResiliency', () => {
  it('counts a retry only when the same mode is played again inside the window', () => {
    const r = computeResiliency([
      { at: 0, modeKey: 'dunk', outcome: 'loss' },
      { at: 5 * m, modeKey: 'dunk', outcome: 'win' },        // retry
      { at: 10 * m, modeKey: 'karate', outcome: 'loss' },
      { at: 60 * m, modeKey: 'karate', outcome: 'win' },     // too late to count as a retry
      { at: 70 * m, modeKey: 'tennis', outcome: 'abandoned' },
    ]);
    expect(r).toMatchObject({ attempts: 5, failures: 3, retriesAfterFail: 1, retryRate: 0.333 });
  });
  it('knows whether the mentee came back after the last loss', () => {
    expect(computeResiliency([{ at: 0, modeKey: 'a', outcome: 'loss' }]).returnedAfterLoss).toBe(false);
    expect(computeResiliency([{ at: 0, modeKey: 'a', outcome: 'loss' }, { at: m, modeKey: 'b', outcome: 'complete' }]).returnedAfterLoss).toBe(true);
    expect(computeResiliency([{ at: 0, modeKey: 'a', outcome: 'win' }]).returnedAfterLoss).toBeNull();
  });
  it('is order independent and safe on empty input', () => {
    const a = [{ at: 5 * m, modeKey: 'x', outcome: 'win' as const }, { at: 0, modeKey: 'x', outcome: 'loss' as const }];
    expect(computeResiliency(a).retriesAfterFail).toBe(1);
    expect(computeResiliency([])).toEqual({ attempts: 0, failures: 0, retriesAfterFail: 0, retryRate: 0, returnedAfterLoss: null });
  });
});

describe('certificationStatusFor', () => {
  const pass = (moduleKey: string, version = CURRICULUM_VERSION) => ({ trackKey: 'blueprint', moduleKey, curriculumVersion: version, passed: true });
  it('certifies only when every required module is passed on the current version', () => {
    expect(certificationStatusFor([pass('m1'), pass('m2'), pass('m3')], null).status).toBe('certified');
    expect(certificationStatusFor([pass('m1'), pass('m2')], null)).toMatchObject({ status: 'in_progress', missingModules: ['blueprint/m3'] });
    expect(certificationStatusFor([pass('m1'), pass('m2'), pass('m3', '2020.01')], null).status).toBe('in_progress');
  });
  it('a failed attempt puts the facilitator in progress; nothing at all is none', () => {
    expect(certificationStatusFor([{ ...pass('m1'), passed: false }], null).status).toBe('in_progress');
    expect(certificationStatusFor([], null).status).toBe('none');
  });
  it('the owner revoke wins over passes', () => {
    expect(certificationStatusFor([pass('m1'), pass('m2'), pass('m3')], new Date()).status).toBe('revoked');
  });
});

describe('needsGuardianConsent', () => {
  it('requires consent under 18 and when the age is unknown', () => {
    const now = new Date('2026-09-03');
    expect(needsGuardianConsent(2012, now)).toBe(true);
    expect(needsGuardianConsent(2008, now)).toBe(false);
    expect(needsGuardianConsent(null, now)).toBe(true);
  });
});
