/**
 * Stripe Connect payouts — a stub.
 *
 * Off unless STRIPE_CONNECT_ENABLED is on. Even with the flag on, this build makes no Connect API call: it
 * throws, so nobody mistakes a flag flip for a working onboarding flow. Which Stripe account, and the split,
 * are Elijah's decisions (docs/CREATOR-PLATFORM.md).
 */

import { creatorFlagOn } from './creatorEnv';

export type OnboardingLinkResult = { ok: false; reason: 'CONNECT_DISABLED' };

export async function createOnboardingLink(
  profileSlug: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<OnboardingLinkResult> {
  if (!creatorFlagOn(env, 'STRIPE_CONNECT_ENABLED')) return { ok: false, reason: 'CONNECT_DISABLED' };
  throw new Error(`Stripe Connect onboarding is not implemented in this build (profile ${profileSlug}).`);
}
