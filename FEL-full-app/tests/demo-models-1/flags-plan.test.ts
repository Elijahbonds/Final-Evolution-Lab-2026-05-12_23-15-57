// DEMO-MODELS-1 (2026-11-09): the six server settings, each OFF by default, and the player-body plan they drive.
// With every setting off the plan, the hero-body answer, the masks, the hair and the crowd are exactly what live does today.
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEMO_MODEL_FLAG_ENV, DEMO_MODEL_FLAG_KEYS, NO_DEMO_MODEL_FLAGS, anyDemoModelFlag, coachGarmentSlotOf, demoModelFlags, demoModelFlagsFrom,
  isCoachHairName, planPlayerBody, setDemoModelFlags, type DemoModelFlags,
} from '@/lib/babylon/core/demoModels';
import {
  demoModelFlagsFromEnv, isCoachBodyMaskEnabled, isCrowdForgeFrontEnabled, isDemoCoachBodyEnabled, isDemoLibraryCoachEnabled,
  isDunkRivalPrefetchEnabled, isTryGuestCoachBodyEnabled,
} from '@/lib/flags';
import { DEFAULT_HERO_URL } from '@/lib/babylon/core/athleteRoster';
import { COACH_BODY_MOBILE_URL, COACH_BODY_URL, KIT_BODY_URL, SCAN_BODY_URL, urlForHeroBody, type HeroBodyKind } from '@/lib/babylon/core/heroBody';

const ENV = Object.values(DEMO_MODEL_FLAG_ENV);
const only = (k: keyof DemoModelFlags): DemoModelFlags => ({ ...NO_DEMO_MODEL_FLAGS, [k]: true });
afterEach(() => { for (const e of ENV) delete process.env[e]; setDemoModelFlags(NO_DEMO_MODEL_FLAGS); });

describe('the six server settings', () => {
  it('are named as the brief asks, one env var each, all distinct', () => {
    expect(DEMO_MODEL_FLAG_ENV).toEqual({
      coachBody: 'DEMO_COACH_BODY_ENABLED', coachBodyMask: 'COACH_BODY_MASK_ENABLED', rivalPrefetch: 'DUNK_RIVAL_PREFETCH_ENABLED',
      tryGuestCoach: 'TRY_GUEST_COACH_BODY_ENABLED', libraryCoach: 'DEMO_LIBRARY_COACH_ENABLED', crowdForgeFront: 'CROWD_FORGE_FRONT_ENABLED',
    });
    expect(new Set(ENV).size).toBe(6);
  });
  it('are all OFF when unset', () => {
    for (const e of ENV) delete process.env[e];
    expect(demoModelFlagsFromEnv()).toEqual(NO_DEMO_MODEL_FLAGS);
    expect(anyDemoModelFlag(demoModelFlagsFromEnv())).toBe(false);
    expect(demoModelFlags()).toEqual(NO_DEMO_MODEL_FLAGS);   // the client's store starts off too
  });
  const readers: Record<keyof DemoModelFlags, () => boolean> = {
    coachBody: isDemoCoachBodyEnabled, coachBodyMask: isCoachBodyMaskEnabled, rivalPrefetch: isDunkRivalPrefetchEnabled,
    tryGuestCoach: isTryGuestCoachBodyEnabled, libraryCoach: isDemoLibraryCoachEnabled, crowdForgeFront: isCrowdForgeFrontEnabled,
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
    expect(demoModelFlagsFrom({ coachBody: 'true', coachBodyMask: 1, libraryCoach: true })).toEqual(only('libraryCoach'));
  });
});

describe('planPlayerBody — which file the player spawns', () => {
  const kinds: HeroBodyKind[] = ['scan', 'kit-male', 'kit-female'];
  const cases = [false, true].flatMap((signedOut) => [false, true].flatMap((demonstrator) => kinds.map((kind) => ({ kind, signedOut, demonstrator }))));
  it('every setting off: exactly today\'s body, no fallback, for every visitor and stage', () => {
    for (const c of cases) expect(planPlayerBody({ ...c, flags: NO_DEMO_MODEL_FLAGS }), JSON.stringify(c)).toEqual({ url: urlForHeroBody(c.kind), fallback: null, demonstrator: false });
  });
  it('the settings that are not about the player body never change it (mask, rivals, crowd)', () => {
    for (const k of ['coachBodyMask', 'rivalPrefetch', 'crowdForgeFront'] as const)
      for (const c of cases) expect(planPlayerBody({ ...c, flags: only(k) })).toEqual({ url: urlForHeroBody(c.kind), fallback: null, demonstrator: false });
  });
  it('1 DEMO_COACH_BODY_ENABLED: the scan owner plays the coach body, the Meshy scan is the fallback; nobody else changes', () => {
    expect(planPlayerBody({ kind: 'scan', signedOut: false, demonstrator: false, flags: only('coachBody') })).toEqual({ url: COACH_BODY_URL, fallback: SCAN_BODY_URL, demonstrator: false });
    for (const kind of ['kit-male', 'kit-female'] as const) expect(planPlayerBody({ kind, signedOut: false, demonstrator: false, flags: only('coachBody') }).url).toBe(urlForHeroBody(kind));
  });
  it('4 TRY_GUEST_COACH_BODY_ENABLED: a /try guest plays the coach body (kit-male fallback); a signed-in visitor does not', () => {
    expect(planPlayerBody({ kind: 'kit-male', signedOut: true, demonstrator: false, flags: only('tryGuestCoach') })).toEqual({ url: COACH_BODY_URL, fallback: KIT_BODY_URL.male, demonstrator: false });
    expect(planPlayerBody({ kind: 'kit-male', signedOut: false, demonstrator: false, flags: only('tryGuestCoach') }).url).toBe(KIT_BODY_URL.male);
    expect(planPlayerBody({ kind: 'kit-female', signedOut: false, demonstrator: false, flags: only('tryGuestCoach') }).url).toBe(KIT_BODY_URL.female);
  });
  it('5 DEMO_LIBRARY_COACH_ENABLED: every viewer\'s demo shows the coach body, falling back to their own; play spawns do not change', () => {
    for (const kind of kinds) {
      expect(planPlayerBody({ kind, signedOut: false, demonstrator: true, flags: only('libraryCoach') })).toEqual({ url: COACH_BODY_URL, fallback: urlForHeroBody(kind), demonstrator: true });
      expect(planPlayerBody({ kind, signedOut: false, demonstrator: false, flags: only('libraryCoach') }).url).toBe(urlForHeroBody(kind));
    }
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
