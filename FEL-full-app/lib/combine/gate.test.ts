// COMBINE-DAY: the teen gate. A combine uses the team gate unchanged (lib/groups/gates.ts → lib/coach/teenGate.ts) and
// adds nothing looser: adults are fully in; every 13–17 is held today (no consent covers coach training); under 13 never;
// a blank year is asked for; a typed name is held. Camera stations need a verified adult; kept camera numbers need the opt-in.
import { describe, expect, it } from 'vitest';
import { groupGate } from '@/lib/groups/gates';
import { teenGate } from '@/lib/coach/teenGate';
import { ADHOC_ACCESS, athleteAccess, canKeepOnServer, canTest, heldToday } from './gate';
import { HELD_TODAY, OPEN_TODAY, todayHolds, stationHeldToday } from './today';
import { FALLBACK_WARMUP_CONTEXT, type WarmupContext } from '@/lib/coach/warmup';
import { drillsAccess } from '@/lib/drills/access';
import { SKILL_DRILLS } from './catalogue';
import type { CombineAthlete } from './types';

const NOW = new Date('2026-10-25T12:00:00Z');
const Y = NOW.getFullYear();
const OPT = { scope: 'jump_numbers', granted: true, revokedAt: null };
const accepted = (yearsAgo: number) => [{ requestedAt: new Date(Y - 1, 0, 1), acceptedAt: new Date(Y - 1, 0, 2), revokedAt: null, menteeBirthYear: Y - yearsAgo }];

describe('who may be tested', () => {
  it('a verified adult: every station; camera numbers kept only with the live opt-in', () => {
    expect(athleteAccess({ dobYear: Y - 25, consents: [], optIn: OPT }, NOW, OPEN_TODAY)).toEqual({ testable: true, camera: true, saveCamera: true, held: null, today: OPEN_TODAY });
    expect(athleteAccess({ dobYear: Y - 25, consents: [], optIn: null }, NOW, OPEN_TODAY)).toEqual({ testable: true, camera: true, saveCamera: false, held: null, today: OPEN_TODAY });
    // the jump gate not read: everything held (the careful side)
    expect(athleteAccess({ dobYear: Y - 25, consents: [], optIn: OPT }, NOW).today).toEqual(HELD_TODAY);
    expect(athleteAccess({ dobYear: Y - 25, consents: [], optIn: { ...OPT, revokedAt: new Date() } }, NOW).saveCamera).toBe(false);
  });

  it('a 15-year-old is held, with or without an accepted guardian consent (none covers coach training today)', () => {
    expect(athleteAccess({ dobYear: Y - 15, consents: [], optIn: OPT }, NOW, OPEN_TODAY)).toEqual({ testable: false, camera: false, saveCamera: false, held: 'guardian_consent_required', today: HELD_TODAY });
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
    expect(ADHOC_ACCESS).toEqual({ testable: false, camera: false, saveCamera: false, held: 'age_unknown', today: HELD_TODAY });
  });
});

describe('which stations, and what is kept', () => {
  const athlete = (access: CombineAthlete['access'], source: CombineAthlete['source'] = 'roster'): CombineAthlete => ({ id: 'x', name: 'X', source, access });
  const adultSaves = athlete({ testable: true, camera: true, saveCamera: true, held: null, today: OPEN_TODAY });
  const adultNoOptIn = athlete({ testable: true, camera: true, saveCamera: false, held: null, today: OPEN_TODAY });
  const consentedTeen = athlete({ testable: true, camera: false, saveCamera: false, held: null, today: HELD_TODAY });
  const heldTeen = athlete({ testable: false, camera: false, saveCamera: false, held: 'guardian_consent_required', today: HELD_TODAY });

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

// THE JUMP GATE (lib/combine/today.ts): the warm-up's context through the drills page's own verdict — not a new rule.
describe('the jump gate, today', () => {
  const OPEN: WarmupContext = { isYouth: false, painDecision: null, zone: null, screen: 'none', screenAt: null, hardStopped: false, jumpGate: { closed: false, why: '', href: null } };
  const JUMP = { kind: 'cmj', variant: 'standing' } as const, APPROACH = { kind: 'approach', variant: 'approach' } as const;
  const floorDrill = { kind: 'skill', variant: 'countermovement-geometry' } as const, jumpDrill = { kind: 'skill', variant: 'lateral-bound' } as const;
  const SPRINT = { kind: 'sprint', variant: '40yd' } as const;

  it('open: every gate let them through today — nothing held', () => {
    expect(todayHolds(OPEN)).toEqual(OPEN_TODAY);
    for (const st of [JUMP, APPROACH, floorDrill, jumpDrill, SPRINT]) expect(stationHeldToday(todayHolds(OPEN), st)).toBe(false);
  });

  it('shut: P8\'s gate closed (no landing check, an intake answer …) holds the jump stations and the jumping drills, not the floor drill', () => {
    const t = todayHolds({ ...OPEN, jumpGate: { closed: true, why: 'x', href: null } });
    expect(t.jump).toBe(true);
    expect(stationHeldToday(t, APPROACH)).toBe(true);
    expect(stationHeldToday(t, jumpDrill)).toBe(true);
    expect(stationHeldToday(t, floorDrill)).toBe(false);
    // the T-drill never leaves the floor (fast feet, shuffles, touches: no jump or land target), so phaseImpact keeps it open
    expect(stationHeldToday(t, { kind: 'skill', variant: 't-drill' })).toBe(false);
    expect(stationHeldToday(t, SPRINT)).toBe(false);
  });

  it('shut: a pain step-down or stop today holds them; an easier variation does not change the jump verdict from the drills page', () => {
    for (const p of ['step_down_flag_coach', 'stop_see_clinician', 'stop_tell_adult'] as const) expect(todayHolds({ ...OPEN, painDecision: p }).jump, p).toBe(true);
    const easier = drillsAccess({ ...OPEN, painDecision: 'easier_variation' }).drills.find((d) => d.id === 'pogo-bilateral')!.gate !== 'open';
    expect(todayHolds({ ...OPEN, painDecision: 'easier_variation' }).jump).toBe(easier);
  });

  it('shut: a standing intake red flag holds every camera station, the floor drill too', () => {
    const t = todayHolds({ ...OPEN, hardStopped: true });
    expect(t).toEqual({ jump: true, skills: SKILL_DRILLS.map((d) => d.id) });
    expect(stationHeldToday(t, floorDrill)).toBe(true);
  });

  it('a failed read closes it: the warm-up\'s careful context holds the jump stations and every jumping drill', () => {
    const t = todayHolds(FALLBACK_WARMUP_CONTEXT);
    expect(t.jump).toBe(true);
    expect(stationHeldToday(t, jumpDrill)).toBe(true);
    // and no answer at all is held, whatever the station
    expect(stationHeldToday(undefined, floorDrill)).toBe(true);
    expect(stationHeldToday(undefined, SPRINT)).toBe(false);
  });

  it('the verdict is the drills page\'s own for a chapter-6 jump drill, on every combination of the four inputs', () => {
    for (const isYouth of [false, true]) for (const hardStopped of [false, true]) for (const closed of [false, true]) {
      for (const painDecision of [null, 'continue', 'easier_variation', 'step_down_flag_coach', 'stop_tell_adult'] as const) {
        const ctx = { ...OPEN, isYouth, hardStopped, painDecision, jumpGate: { closed, why: '', href: null } };
        const a = drillsAccess(ctx);
        expect(todayHolds(ctx).jump).toBe(a.stopped || a.drills.find((d) => d.id === 'pogo-bilateral')!.gate !== 'open');
      }
    }
  });

  it('heldToday reads the athlete\'s holds', () => {
    const a = { access: { testable: true, camera: true, saveCamera: true, held: null, today: { jump: true, skills: [] } } };
    expect(heldToday(a, JUMP)).toBe(true);
    expect(heldToday(a, floorDrill)).toBe(false);
  });
});
