/**
 * CELL compliance layer (M6 — Studio To Spec, non-LLM slice).
 *
 * A pure, credit-free jurisdiction gate that runs BEFORE any provider network
 * call in `callModel`. Studio specs can pin an allowed set of data-residency
 * jurisdictions; a spec that only permits, say, US-hosted inference must never
 * silently fan out to a provider we treat as out-of-jurisdiction.
 *
 * This is deliberately conservative and additive: the default policy allows
 * every provider we currently ship, so existing call sites keep working with no
 * behaviour change. A spec opts INTO stricter residency by passing a policy.
 *
 * No LLM calls, no credits — this is deterministic policy evaluation only.
 */
import type { Provider } from '@/lib/cell-models';

/** Coarse data-residency jurisdiction for a provider's default inference. */
export type Jurisdiction = 'US' | 'EU' | 'OTHER';

/**
 * Where each provider's default inference is treated as residing. This is a
 * best-effort coarse mapping for spec-level residency gating, NOT a legal
 * guarantee. All four providers we ship today are treated as US.
 *
 * TUNE(elijah): revisit if we add EU-resident endpoints or region pinning.
 */
export const PROVIDER_JURISDICTION: Record<Provider, Jurisdiction> = {
  abacus: 'US',
  openai: 'US',
  anthropic: 'US',
  google: 'US',
};

export interface CompliancePolicy {
  /**
   * Allowed data-residency jurisdictions. A provider is permitted only if its
   * mapped jurisdiction is in this list. `undefined` means "no residency
   * restriction" (allow all) — the backward-compatible default.
   */
  allowedJurisdictions?: Jurisdiction[];
  /**
   * Explicit provider denylist. Any provider named here is blocked regardless
   * of jurisdiction. Empty/undefined means nothing is explicitly denied.
   */
  deniedProviders?: Provider[];
  /**
   * Explicit provider allowlist. When set, ONLY these providers are permitted
   * (still subject to the denylist). `undefined` means "all providers".
   */
  allowedProviders?: Provider[];
}

/** Thrown when a provider is blocked by the active compliance policy. */
export class ComplianceError extends Error {
  readonly provider: Provider;
  readonly reason: string;
  constructor(provider: Provider, reason: string) {
    super(`Compliance: provider "${provider}" blocked — ${reason}`);
    this.name = 'ComplianceError';
    this.provider = provider;
    this.reason = reason;
  }
}

export interface ComplianceDecision {
  allowed: boolean;
  provider: Provider;
  jurisdiction: Jurisdiction;
  reason: string;
}

/**
 * Evaluate a provider against a policy WITHOUT throwing. Returns a structured
 * decision so callers/tests can inspect the outcome. A missing policy (or an
 * empty policy) always allows.
 */
export function evaluateProvider(
  provider: Provider,
  policy?: CompliancePolicy,
): ComplianceDecision {
  const jurisdiction = PROVIDER_JURISDICTION[provider] ?? 'OTHER';
  const base = { provider, jurisdiction };

  if (!policy) return { ...base, allowed: true, reason: 'no policy (allow all)' };

  if (policy.deniedProviders && policy.deniedProviders.includes(provider)) {
    return { ...base, allowed: false, reason: 'provider on denylist' };
  }

  if (
    policy.allowedProviders &&
    policy.allowedProviders.length > 0 &&
    !policy.allowedProviders.includes(provider)
  ) {
    return { ...base, allowed: false, reason: 'provider not on allowlist' };
  }

  if (
    policy.allowedJurisdictions &&
    policy.allowedJurisdictions.length > 0 &&
    !policy.allowedJurisdictions.includes(jurisdiction)
  ) {
    return {
      ...base,
      allowed: false,
      reason: `jurisdiction "${jurisdiction}" not permitted`,
    };
  }

  return { ...base, allowed: true, reason: 'permitted' };
}

/**
 * Assert a provider is allowed by the policy; throws {@link ComplianceError}
 * when it is not. No-op when `policy` is undefined (backward compatible).
 */
export function assertProviderAllowed(
  provider: Provider,
  policy?: CompliancePolicy,
): void {
  const decision = evaluateProvider(provider, policy);
  if (!decision.allowed) {
    throw new ComplianceError(provider, decision.reason);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Content-level denylist — Tencent Cost-Doctrine gate (MODEL_ROUTING_PROTOCOL)
 *
 * Tencent-Cloud-hosted models must NEVER receive:
 *  1. Neuromechanic scoring logic or specs
 *  2. Biometric / likeness / mocap data (BiometricMirror, user video, rigs)
 *  3. EU AI Act disclosure work
 *
 * The denylist is evaluated BEFORE the LLM call when the resolved provider
 * matches a provider whose cloud is restricted. Pure string matching — no
 * LLM, no credits.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Providers whose cloud infrastructure triggers content denylist checks. */
// TUNE(elijah): add new restricted-cloud providers here as they are onboarded.
export const CONTENT_RESTRICTED_PROVIDERS: Set<string> = new Set(['tencent']);

/**
 * Keywords that trigger a content block when the prompt body is destined for a
 * restricted-cloud provider. Case-insensitive substring match. Intentionally
 * broad — false-positives are acceptable (fail safe).
 *
 * TUNE(elijah): expand / narrow as the denylist policy evolves.
 */
export const DENYLIST_KEYWORDS: string[] = [
  // Category 1: Neuromechanic scoring
  'neuromechanic', 'prq_score', 'prqscore', 'prq delta', 'prqdelta',
  'mastery_tracker', 'masterytracker', 'scoring logic',
  // Category 2: Biometric / likeness / mocap
  'biometricmirror', 'biometric_mirror', 'mocap', 'motion capture',
  'animation rig', 'likeness data', 'user video',
  // Category 3: EU AI Act
  'eu ai act', 'ai act disclosure', 'eu_ai_act',
];

export interface ContentDecision {
  allowed: boolean;
  provider: string;
  blockedKeyword: string | null;
  reason: string;
}

/**
 * Check whether a prompt body is safe to send to a given provider. Returns a
 * structured decision. Only providers in {@link CONTENT_RESTRICTED_PROVIDERS}
 * are checked — all others pass immediately.
 */
export function evaluateContent(
  provider: string,
  promptBody: string,
): ContentDecision {
  const base = { provider, blockedKeyword: null as string | null };
  if (!CONTENT_RESTRICTED_PROVIDERS.has(provider.toLowerCase())) {
    return { ...base, allowed: true, reason: 'provider not content-restricted' };
  }
  const lower = promptBody.toLowerCase();
  for (const kw of DENYLIST_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return {
        provider,
        allowed: false,
        blockedKeyword: kw,
        reason: `content denylist: "${kw}" found in prompt destined for restricted provider "${provider}"`,
      };
    }
  }
  return { ...base, allowed: true, reason: 'no denylisted content detected' };
}

/**
 * Assert content is safe for the provider; throws {@link ComplianceError} if
 * a denylisted keyword is found.
 */
export function assertContentAllowed(
  provider: string,
  promptBody: string,
): void {
  const d = evaluateContent(provider, promptBody);
  if (!d.allowed) {
    throw new ComplianceError(provider as Provider, d.reason);
  }
}
