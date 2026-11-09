// DEMO-MODELS-1 (2026-11-09; v2): the five server settings, each OFF by default, and the player-body plan they drive.
// v2: setting 5 (DEMO_LIBRARY_COACH_ENABLED) is gone (owner 10:09 AM: each viewer sees their own body in workouts and anatomy),
// and setting 4 applies only in the /try dunk demo's context.
// With every setting off the plan, the hero-body answer, the masks, the hair and the crowd are exactly what live does today.
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEMO_MODEL_FLAG_ENV, DEMO_MODEL_FLAG_KEYS, NO_DEMO_MODEL_FLAGS, anyDemoModelFlag, coachGarmentSlotOf, demoModelFlags, demoModelFlagsFrom,
  isCoachHairName, planPlayerBody, setDemoModelFlags, type DemoModelFlags, type PlayerBodyContext,
} from '@/lib/babylon/core/demoModels';
import {
  demoModelFlagsFromEnv, isCoachBodyMaskEnabled, isCrowdForgeFrontEnabled, isDemoCoachBodyEnabled,
  isDunkRivalPrefetchEnabled, isTryGuestCoachBodyEnabled,
} from '@/lib/flags';
import { DEFAULT_HERO_URL } from '@/lib/babylon/core/athleteRoster';
import { COACH_BODY_MOBILE_URL, COACH_BODY_URL, KIT_BODY_URL, SCAN_BODY_URL, urlForHeroBody, type HeroBodyKind } from '@/lib/babylon/core/heroBody';

const ENV = Object.values(DEMO_MODEL_FLAG_ENV);
const only = (k: keyof DemoModelFlags): DemoModelFlags => ({ ...NO_DEMO_MODEL_FLAGS, [k]: true });
afterEach(() => { for (const e of ENV) delete process.env[e]; setDemoModelFlags(NO_DEMO_MODEL_FLAGS); });

describe('the five server settings', () => {
  it('are named as the brief asks, one env var each, all distinct', () => {
    expect(DEMO_MODEL_FLAG_ENV).toEqual({
      coachBody: 'DEMO_COACH_BODY_ENABLED', coachBodyMask: 'COACH_BODY_MASK_ENABLED', rivalPrefetch: 'DUNK_RIVAL_PREFETCH_ENABLED',
      tryGuestCoach: 'TRY_GUEST_COACH_BODY_ENABLED', crowdForgeFront: 'CROWD_FORGE_FRONT_ENABLED',
    });
    expect(new Set(ENV).size).toBe(5);
    expect(ENV).not.toContain('DEMO_LIBRARY_COACH_ENABLED');   // v2: setting 5 removed
  });
  it('are all OFF when unset', () => {
    for (const e of ENV) delete process.env[e];
    expect(demoModelFlagsFromEnv()).toEqual(NO_DEMO_MODEL_FLAGS);
    expect(anyDemoModelFlag(demoModelFlagsFromEnv())).toBe(false);
    expect(demoModelFlags()).toEqual(NO_DEMO_MODEL_FLAGS);   // the client's store starts off too
  });
  const readers: Record<keyof DemoModelFlags, () => boolean> = {
    coachBody: isDemoCoachBodyEnabled, coachBodyMask: isCoachBodyMaskEnabled, rivalPrefetch: isDunkRivalPrefetchEnabled,
    tryGuestCoach: isTryGuestCoachBodyEnabled, crowdForgeFront: isCrowdForgeFrontEnabled,
  };
  for (const k of DEMO_MODEL_FLAG_KEYS) {
    it(`${DEMO_MODEL_FLAG_ENV[k]}: on for 1/true/on/yes, off otherwise, and alone`, () => {
      for (const v of ['1', 'true', 'TRUE', ' on ', 'yes']) { process.env[DEMO_MODEL_FLAG_ENV[k]] = v; expect(readers[k](), v).toBe(true); expect(demoModelFlagsFromEnv()).toEqual(only(k)); }
      for (const v of ['0', 'false', '', 'off', 'no', 'enabled']) { process.env[DEMO_MODEL_FLAG_ENV[k]] = v; expect(readers[k](), v).toBe(false); expect(demoModelFlagsFromEnv()).toEqual(NO_DEMO_MODEL_FLAGS); }
    });
  }
  it('the client only takes a strict true (a missing or odd answer is all off)', () => {
    expect(demoModelFlagsFrom(undefined)).toEqual(NO_DEMO_MODEL_FLAGS);
    expect(demoModelFlagsFrom(null)).toEqual(NO_DEMO_MODEL_FLAGS);
    expect(demoModelFlagsFrom('yes')).toEqual(NO_DEMO_MODEL_FLAGS);
    expect(demoModelFlagsFrom({ coachBody: 'true', coachBodyMask: 1, tryGuestCoach: true })).toEqual(only('tryGuestCoach'));
    expect(demoModelFlagsFrom({ libraryCoach: true })).toEqual(NO_DEMO_MODEL_FLAGS);   // v2: the removed key is not a setting
    expect(Object.keys(demoModelFlagsFrom({ libraryCoach: true }))).not.toContain('libraryCoach');
  });
});

describe('planPlayerBody — which file the player spawns', () => {
  const kinds: HeroBodyKind[] = ['scan', 'kit-male', 'kit-female'];
  const contexts: PlayerBodyContext[] = ['tryDunkGuest', 'other'];
  const cases = contexts.flatMap((context) => kinds.map((kind) => ({ kind, context })));
  const ALL_ON = demoModelFlagsFrom(Object.fromEntries(DEMO_MODEL_FLAG_KEYS.map((k) => [k, true])));
  it('every setting off: exactly today\'s body, no fallback, in every context', () => {
    for (const c of cases) expect(planPlayerBody({ ...c, flags: NO_DEMO_MODEL_FLAGS }), JSON.stringify(c)).toEqual({ url: urlForHeroBody(c.kind), fallback: null });
  });
  it('the settings that are not about the player body never change it (mask, rivals, crowd)', () => {
    for (const k of ['coachBodyMask', 'rivalPrefetch', 'crowdForgeFront'] as const)
      for (const c of cases) expect(planPlayerBody({ ...c, flags: only(k) })).toEqual({ url: urlForHeroBody(c.kind), fallback: null });
  });
  it('1 DEMO_COACH_BODY_ENABLED: the scan owner plays the coach body, the Meshy scan is the fallback; nobody else changes', () => {
    for (const context of contexts) {
      expect(planPlayerBody({ kind: 'scan', context, flags: only('coachBody') })).toEqual({ url: COACH_BODY_URL, fallback: SCAN_BODY_URL });
      for (const kind of ['kit-male', 'kit-female'] as const) expect(planPlayerBody({ kind, context, flags: only('coachBody') }).url).toBe(urlForHeroBody(kind));
    }
  });
  it('4 TRY_GUEST_COACH_BODY_ENABLED: only the /try dunk guest context plays the coach body (kit-male fallback)', () => {
    expect(planPlayerBody({ kind: 'kit-male', context: 'tryDunkGuest', flags: only('tryGuestCoach') })).toEqual({ url: COACH_BODY_URL, fallback: KIT_BODY_URL.male });
    expect(planPlayerBody({ kind: 'kit-male', context: 'other', flags: only('tryGuestCoach') })).toEqual({ url: KIT_BODY_URL.male, fallback: null });
    expect(planPlayerBody({ kind: 'kit-female', context: 'other', flags: only('tryGuestCoach') })).toEqual({ url: KIT_BODY_URL.female, fallback: null });
  });
  it('v2: with ALL settings on, the \'other\' context (workouts, anatomy) is the viewer\'s own body for every non-owner', () => {
    for (const kind of ['kit-male', 'kit-female'] as const) expect(planPlayerBody({ kind, context: 'other', flags: ALL_ON })).toEqual({ url: urlForHeroBody(kind), fallback: null });
  });
  it('v2: the owner\'s scan → coach (setting 1) depends only on HIS kind: another viewer never gets it, in any context', () => {
    // hero-body decides 'scan' per viewer (only the scan owner's account); a different viewer's kind is a kit kind
    for (const context of contexts) for (const kind of ['kit-male', 'kit-female'] as const)
      expect(planPlayerBody({ kind, context, flags: { ...only('coachBody'), tryGuestCoach: false } }).url).not.toBe(COACH_BODY_URL);
    expect(planPlayerBody({ kind: 'scan', context: 'other', flags: ALL_ON }).url).toBe(COACH_BODY_URL);   // his own view only
  });
});

describe('the coach body files in the shared rules', () => {
  it('the phone tier maps the coach file to its phone file (and only the coach file)', async () => {
    const { bodyUrlForTier, isPlayerBodyUrl } = await import('@/lib/babylon/core/heroBody');
    expect(bodyUrlForTier(COACH_BODY_URL, 'mobile')).toBe(COACH_BODY_MOBILE_URL);
    expect(bodyUrlForTier(COACH_BODY_URL, 'desktop')).toBe(COACH_BODY_URL);
    expect(isPlayerBodyUrl(COACH_BODY_URL)).toBe(true);
    expect(isPlayerBodyUrl(COACH_BODY_MOBILE_URL)).toBe(true);
    expect(DEFAULT_HERO_URL).toBe(SCAN_BODY_URL);   // the hero request is unchanged: the coach body comes only from the plan
  });
  it('athleteRoster: the full coach path loads as asked; a bare coach filename is the hero request; a tinted coach spawn is a hero URL', async () => {
    const { normalizeHeroUrl } = await import('@/lib/babylon/core/athleteRoster');
    expect(normalizeHeroUrl(COACH_BODY_URL)).toBe(COACH_BODY_URL);
    expect(normalizeHeroUrl(COACH_BODY_MOBILE_URL)).toBe(COACH_BODY_MOBILE_URL);
    expect(normalizeHeroUrl('fel-elijah-coach.prep2.glb')).toBe(DEFAULT_HERO_URL);
  });
  it('garment and hair names (the loader may add _primitive<n> / _c<n>)', () => {
    expect(['Top_compression', 'Top_compression_c3', 'Bottom_training_shorts_primitive0', 'Sock_low', 'Shoe_lowcut_c1'].map(coachGarmentSlotOf)).toEqual(['tops', 'tops', 'shorts', 'shoes', 'shoes']);
    expect(['Body', 'eyes', 'CoachHair_coily', 'Kit_tops_tee', 'Topper', 'Hair_short'].map(coachGarmentSlotOf)).toEqual([null, null, null, null, null, null]);
    expect(isCoachHairName('CoachHair_coily')).toBe(true);
    expect(isCoachHairName('CoachHair_coily_c2')).toBe(true);
    expect(isCoachHairName('Hair_coily')).toBe(false);
  });
  it('credits: the coach files resolve to the coach-body row (CC0, open)', async () => {
    const { creditForPublicPath } = await import('@/lib/credits/credits');
    for (const p of ['models/coach/fel-elijah-coach.prep2.glb', 'public/models/coach/fel-elijah-coach.prep2.mobile.glb', COACH_BODY_URL]) {
      const c = creditForPublicPath(p);
      expect(c?.id, p).toBe('coach-body');
      expect([c?.licence, c?.status]).toEqual(['CC0', 'open']);
    }
  });
});
