/**
 * CELL model registry & cost engine (Phase 2).
 *
 * A registry of concrete models across providers, each tagged with a capability
 * TIER and a price (USD per 1M tokens). Jobs (roles) map to an ordered
 * ESCALATION LADDER of tiers; we pick the cheapest CAPABLE model whose provider
 * we can actually reach (user key present, or Abacus routing as the fallback).
 *
 * When a lane keeps failing, we climb the ladder to a stronger (pricier) model.
 */

export type Provider = 'abacus' | 'openai' | 'anthropic' | 'google';
export type Tier = 'cheap' | 'mid' | 'frontier';
export type Role = 'architect' | 'builder' | 'critic' | 'summarizer';

export interface ModelSpec {
  id: string;            // canonical id used in API calls
  label: string;         // human label
  provider: Provider;    // who serves it directly
  tier: Tier;
  /** USD per 1M input / output tokens (list price, best-effort). */
  inPerM: number;
  outPerM: number;
  /** Abacus RouteLLM id to use when routing through Abacus (no user key). */
  abacusId?: string;
}

/**
 * Registry. `abacusId` lets us route the same logical model through Abacus when
 * the user has no direct provider key. Prices are public list prices (USD/Mtok)
 * and are used for ESTIMATES shown on the dashboard.
 */
export const MODELS: ModelSpec[] = [
  // ── cheap tier ──
  {
    id: 'gpt-4o-mini', label: 'GPT-4o mini', provider: 'openai', tier: 'cheap',
    inPerM: 0.15, outPerM: 0.6, abacusId: 'gpt-5.4-mini',
  },
  {
    id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', provider: 'anthropic', tier: 'cheap',
    inPerM: 0.8, outPerM: 4, abacusId: 'gpt-5.4-mini',
  },
  {
    id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', provider: 'google', tier: 'cheap',
    inPerM: 0.075, outPerM: 0.3, abacusId: 'gpt-5.4-mini',
  },
  // ── mid tier ──
  {
    id: 'gpt-4o', label: 'GPT-4o', provider: 'openai', tier: 'mid',
    inPerM: 2.5, outPerM: 10, abacusId: 'claude-sonnet-5',
  },
  {
    id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', provider: 'anthropic', tier: 'mid',
    inPerM: 3, outPerM: 15, abacusId: 'claude-sonnet-5',
  },
  {
    id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'google', tier: 'mid',
    inPerM: 1.25, outPerM: 5, abacusId: 'claude-sonnet-5',
  },
  // ── frontier tier ──
  {
    id: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet', provider: 'anthropic', tier: 'frontier',
    inPerM: 3, outPerM: 15, abacusId: 'claude-fable-5',
  },
  {
    id: 'gpt-4.1', label: 'GPT-4.1', provider: 'openai', tier: 'frontier',
    inPerM: 2, outPerM: 8, abacusId: 'claude-fable-5',
  },
];

/** The Abacus fallback model id per tier (used when no user key is available). */
const ABACUS_TIER: Record<Tier, string> = {
  cheap: 'gpt-5.4-mini',
  mid: 'claude-sonnet-5',
  frontier: 'claude-fable-5',
};

/** Rough Abacus routing price estimate (USD/Mtok) per tier — labelled ESTIMATE. */
const ABACUS_PRICE: Record<Tier, { inPerM: number; outPerM: number }> = {
  cheap: { inPerM: 0.15, outPerM: 0.6 },
  mid: { inPerM: 3, outPerM: 15 },
  frontier: { inPerM: 3, outPerM: 15 },
};

/**
 * Escalation ladder per role: ordered list of tiers to try, cheapest first.
 * Cheap builders do the bulk of the work; we only climb on repeated failure.
 */
export const ROLE_LADDER: Record<Role, Tier[]> = {
  summarizer: ['cheap'],
  builder: ['cheap', 'mid', 'frontier'],
  critic: ['mid', 'frontier'],
  architect: ['frontier'],
};

/** Preferred provider order when a user has multiple keys, per tier. */
const PROVIDER_PREF: Record<Tier, Provider[]> = {
  cheap: ['google', 'openai', 'anthropic'],
  mid: ['google', 'openai', 'anthropic'],
  frontier: ['openai', 'anthropic'],
};

export interface ResolvedModel {
  /** id to send to the provider (direct provider id, or Abacus routing id). */
  callId: string;
  provider: Provider;    // 'abacus' when routed through Abacus
  tier: Tier;
  label: string;
  inPerM: number;
  outPerM: number;
  /** true when we fell back to Abacus routing (no user key for a direct provider). */
  viaAbacus: boolean;
}

/**
 * Resolve the model to use for a role at a given escalation level.
 * `haveKeys` = set of providers the user has configured direct keys for.
 */
export function resolveModel(
  role: Role,
  opts: { haveKeys: Set<Provider>; escalation?: number; preferCheap?: boolean }
): ResolvedModel {
  const ladder = ROLE_LADDER[role] || ROLE_LADDER.builder;
  const level = Math.min(opts.escalation ?? 0, ladder.length - 1);
  const tier = ladder[level];

  // Try to use a direct user key at this tier, preferring cheaper providers.
  const pref = PROVIDER_PREF[tier];
  const candidates = MODELS.filter((m) => m.tier === tier);
  for (const prov of pref) {
    if (!opts.haveKeys.has(prov)) continue;
    const m = candidates.find((c) => c.provider === prov);
    if (m) {
      return {
        callId: m.id,
        provider: prov,
        tier,
        label: m.label,
        inPerM: m.inPerM,
        outPerM: m.outPerM,
        viaAbacus: false,
      };
    }
  }

  // Fallback: route this tier through Abacus.
  const price = ABACUS_PRICE[tier];
  return {
    callId: ABACUS_TIER[tier],
    provider: 'abacus',
    tier,
    label: `${tier} (Abacus)`,
    inPerM: price.inPerM,
    outPerM: price.outPerM,
    viaAbacus: true,
  };
}

/** Max escalation index available for a role (0-based). */
export function maxEscalation(role: Role): number {
  return (ROLE_LADDER[role]?.length ?? 1) - 1;
}

/** Compute USD cost from token counts and a resolved model's price. */
export function costOf(model: { inPerM: number; outPerM: number }, inTok: number, outTok: number): number {
  return (inTok / 1_000_000) * model.inPerM + (outTok / 1_000_000) * model.outPerM;
}
