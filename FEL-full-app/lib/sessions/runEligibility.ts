/**
 * lib/sessions/runEligibility.ts — ECONOMY-SESSIONS-HARDEN (2026-09-28): does a run pay? Decided ONCE, at
 * POST /api/sessions/start, from signals the server controls, and stored on the run (SessionRun.payoutEligible). The
 * finish reads the stored answer and never re-reads the client's flags, so nothing a client sends after the start can
 * turn an ineligible run into a paying one. PURE: no DB, no network.
 *
 * The signals, in the order they are named on the response:
 *   AGENT         the start request carried ?agent=1 (query), an `x-fel-agent: 1` header, or came from a page whose URL
 *                 had ?agent=1 (the Referer). The eye and every probe drive modes under ?agent=1.
 *   PLAYTEST      an explicit playtest flag (body `playtest: true` or ?playtest=1), or a start from a /dev/ page (the
 *                 dev harness mounts the real hosts without a real run).
 *   TEST_ACCOUNT  the account is on the server-side test allowlist: User.role is a test role, or its id / email is in
 *                 FEL_TEST_ACCOUNTS (comma-separated, server env). User.role is written by no API route in this app
 *                 (only by an admin with the database), so it is this app's app_metadata. Nothing the user can edit —
 *                 no profile field, no display name, nothing in the session token's user object — is read here.
 *
 * Every signal can only take a payout AWAY. A client that forges ?agent=1 or a Referer loses its own rewards; there is
 * no signal that grants one, so none needs to be trusted.
 */

export type IneligibleReason = 'AGENT' | 'PLAYTEST' | 'TEST_ACCOUNT' | 'NO_RULES';

/** User.role values that mark a test account (server-side only: no API route writes User.role). */
export const TEST_ROLES: ReadonlySet<string> = new Set(['test', 'qa', 'playtest', 'agent']);

export interface EligibilityInput {
  /** The start request's own URL (its query string is read). */
  url: string;
  /** The start request's headers: x-fel-agent, referer. */
  headers: { get(name: string): string | null };
  /** The parsed JSON body of the start request (only `playtest` is read). */
  body: unknown;
  /** The account as the DATABASE has it (never the session token's copy). null = not found. */
  user: { id: string; email?: string | null; role?: string | null } | null;
  /** Server env (FEL_TEST_ACCOUNTS). */
  env?: Record<string, string | undefined>;
}

export interface Eligibility {
  payoutEligible: boolean;
  reason: IneligibleReason | null;
}

const truthy = (v: string | null | undefined): boolean => v === '1' || v === 'true';

/** The query string of a URL-ish string, or null when it has none / cannot be read. */
function params(u: string | null | undefined): URLSearchParams | null {
  if (!u) return null;
  try { return new URL(u, 'http://local.invalid').searchParams; } catch { return null; }
}

function pathOf(u: string | null | undefined): string {
  if (!u) return '';
  try { return new URL(u, 'http://local.invalid').pathname; } catch { return ''; }
}

/** Production is detected by NODE_ENV (Next inlines it at build time). */
export function isProductionEnv(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * Default prod allowlist when FEL_TEST_ACCOUNTS is unset. arena-coins@fel.local is intentionally OFF this list —
 * it is the clean payout-proof account.
 */
export const PROD_DEFAULT_TEST_ACCOUNTS = 'playtest@fel.local';

/** The test allowlist from server env: FEL_TEST_ACCOUNTS = "id-or-email,id-or-email" (case-insensitive for emails). */
export function testAllowlist(env: Record<string, string | undefined> = process.env): ReadonlySet<string> {
  const raw = env.FEL_TEST_ACCOUNTS;
  if (raw !== undefined && raw !== '') {
    return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  }
  if (isProductionEnv(env)) {
    return new Set(PROD_DEFAULT_TEST_ACCOUNTS.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
  }
  return new Set();
}

export function isTestAccount(user: EligibilityInput['user'], env?: Record<string, string | undefined>): boolean {
  if (!user) return false;
  const e = env ?? process.env;
  if (isProductionEnv(e) && user.role && TEST_ROLES.has(String(user.role).toLowerCase())) return true;
  const allow = testAllowlist(e);
  if (allow.size === 0) return false;
  return allow.has(String(user.id).toLowerCase()) || (!!user.email && allow.has(String(user.email).toLowerCase()));
}

/** CYBER (k): the start request asks for an agent run (?agent=1, x-fel-agent, or Referer ?agent=1). */
export function isAgentRunRequest(i: Pick<EligibilityInput, 'url' | 'headers'>): boolean {
  const q = params(i.url);
  const referer = i.headers.get('referer');
  const ref = params(referer);
  return truthy(q?.get('agent')) || truthy(i.headers.get('x-fel-agent')) || truthy(ref?.get('agent'));
}

export function decideRunEligibility(i: EligibilityInput): Eligibility {
  const q = params(i.url);
  const referer = i.headers.get('referer');
  const ref = params(referer);
  if (truthy(q?.get('agent')) || truthy(i.headers.get('x-fel-agent')) || truthy(ref?.get('agent'))) {
    return { payoutEligible: false, reason: 'AGENT' };
  }
  const b = i.body as { playtest?: unknown } | null | undefined;
  if (b?.playtest === true || truthy(q?.get('playtest')) || truthy(ref?.get('playtest')) || pathOf(referer).startsWith('/dev/')) {
    return { payoutEligible: false, reason: 'PLAYTEST' };
  }
  if (isTestAccount(i.user, i.env)) return { payoutEligible: false, reason: 'TEST_ACCOUNT' };
  return { payoutEligible: true, reason: null };
}
