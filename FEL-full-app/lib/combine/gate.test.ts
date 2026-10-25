// COMBINE-DAY: the teen gate. A combine uses the team gate unchanged (lib/groups/gates.ts → lib/coach/teenGate.ts) and
// adds nothing looser: adults are fully in; every 13–17 is held today (no consent covers coach training); under 13 never;
// a blank year is asked for; a typed name is held. Camera stations need a verified adult; kept camera numbers need the opt-in.
import { describe, expect, it } from 'vitest';
import { groupGate } from '@/lib/groups/gates';
import { teenGate } from '@/lib/coach/teenGate';
import { ADHOC_ACCESS, athleteAccess, canKeepOnServer, canTest } from './gate';
import type { CombineAthlete } from './types';

const NOW = new Date('2026-10-25T12:00:00Z');
const Y = NOW.getFullYear();
const OPT = { scope: 'jump_numbers', granted: true, revokedAt: null };
const accepted = (yearsAgo: number) => [{ requestedAt: new Date(Y - 1, 0, 1), acceptedAt: new Date(Y - 1, 0, 2), revokedAt: null, menteeBirthYear: Y - yearsAgo }];

describe('who may be tested', () => {
  it('a verified adult: every station; camera numbers kept only with the live opt-in', () => {
    expect(athleteAccess({ dobYear: Y - 25, consents: [], optIn: OPT }, NOW)).toEqual({ testable: true, camera: true, saveCamera: true, held: null });
    expect(athleteAccess({ dobYear: Y - 25, consents: [], optIn: null }, NOW)).toEqual({ testable: true, camera: true, saveCamera: false, held: null });
    expect(athleteAccess({ dobYear: Y - 25, consents: [], optIn: { ...OPT, revokedAt: new Date() } }, NOW).saveCamera).toBe(false);
  });

  it('a 15-year-old is held, with or without an accepted guardian consent (none covers coach training today)', () => {
    expect(athleteAccess({ dobYear: Y - 15, consents: [], optIn: OPT }, NOW)).toEqual({ testable: false, camera: false, saveCamera: false, held: 'guardian_consent_required' });
    expect(athleteAccess({ dobYear: Y - 15, consents: accepted(15), optIn: OPT }, NOW).held).toBe('guardian_consent_required');
  });

  it('exactly 18 by year may still be 17: held, as the coach loop holds them', () => {
    expect(athleteAccess({ dobYear: Y - 18, consents: [], optIn: OPT }, NOW).testable).toBe(false);
  });

  it('under 13: never, whatever a guardian said; a blank year: asked for first', () => {
    expect(athleteAccess({ dobYear: Y - 11, consents: accepted(11), optIn: OPT }, NOW).held).toBe('under_13');
    expect(athleteAccess({ dobYear: null, consents: [], optIn: OPT }, NOW).held).toBe('age_required');
  });

  it('is the team gate itself, for every year: nothing looser than teams', () => {
    for (let age = 5; age <= 40; age++) {
      for (const consents of [[], accepted(age)]) {
        const input = { dobYear: Y - age, consents };
        const team = groupGate('team', input, NOW);
        expect(team).toEqual(teenGate(input, NOW));
        const a = athleteAccess({ ...input, optIn: OPT }, NOW);
        expect(a.testable, `age ${age}`).toBe(team.ok);
        if (!team.ok) expect(a.held).toBe(team.error);
      }
    }
  });

  it('a name the coach typed has no age: held, never testable', () => {
    expect(ADHOC_ACCESS).toEqual({ testable: false, camera: false, saveCamera: false, held: 'age_unknown' });
  });
});

describe('which stations, and what is kept', () => {
  const athlete = (access: CombineAthlete['access'], source: CombineAthlete['source'] = 'roster'): CombineAthlete => ({ id: 'x', name: 'X', source, access });
  const adultSaves = athlete({ testable: true, camera: true, saveCamera: true, held: null });
  const adultNoOptIn = athlete({ testable: true, camera: true, saveCamera: false, held: null });
  const consentedTeen = athlete({ testable: true, camera: false, saveCamera: false, held: null });
  const heldTeen = athlete({ testable: false, camera: false, saveCamera: false, held: 'guardian_consent_required' });

  it('camera and video stations need a verified adult; a consented teen (none today) would get the hand-timed ones only', () => {
    for (const k of ['cmj', 'approach', 'skill'] as const) {
      expect(canTest(adultSaves, k)).toBe(true);
      expect(canTest(consentedTeen, k)).toBe(false);
      expect(canTest(heldTeen, k)).toBe(false);
    }
    for (const k of ['sprint', 'agility'] as const) {
      expect(canTest(consentedTeen, k)).toBe(true);
      expect(canTest(heldTeen, k)).toBe(false);
    }
  });

  it('a hand-timed number is kept for any testable athlete; a camera number only with the opt-in; a typed name never', () => {
    expect(canKeepOnServer(adultNoOptIn, 'sprint')).toBe(true);
    expect(canKeepOnServer(adultNoOptIn, 'cmj')).toBe(false);
    expect(canKeepOnServer(adultSaves, 'cmj')).toBe(true);
    expect(canKeepOnServer(adultSaves, 'approach')).toBe(true);
    expect(canKeepOnServer(heldTeen, 'sprint')).toBe(false);
    expect(canKeepOnServer(athlete(adultSaves.access, 'adhoc'), 'sprint')).toBe(false);
  });
});
