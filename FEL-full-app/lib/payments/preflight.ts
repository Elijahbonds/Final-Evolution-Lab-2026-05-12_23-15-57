// lib/payments/preflight.ts — PAYMENTS-READY (2026-10-26): the owner's go-live readiness check, as a pure function of an
// env. scripts/payments-preflight.ts prints it; lib/payments/preflight.test.ts drives it.
//
// It lists every money switch, setting and secret the app reads, says what each is set to, and names what is missing or
// inconsistent (a live key with a test publishable key, COACH_CONNECT_LIVE before the coach terms are signed, an
// allow-list typo, a fee value that falls back to its default). It NEVER prints a secret: a secret line says only
// "missing" or "set", and a Stripe key only which KIND it is (test / live / restricted live), never one character of it.
// It reads nothing but the env and the code's own constants: no network, no database, no Stripe.
import { isLiveKey, isTestKey } from '@/lib/coach-store/stripeMode';
import {
  coachFreeClientLimit, coachProPriceCents, moneyEnvProblems, platformFeePolicy, refundProcessingFee,
} from '@/lib/coach-business/config';
import { bpsLabel } from '@/lib/coach-business/fees';
import { openProducts, parseAllowlist, unknownAllowlistEntries } from './allowlist';
import { BUYER_TERMS, COACH_TERMS_VERSION, coachTermsSigned } from './terms';

type Env = Record<string, string | undefined>;
export type Level = 'error' | 'warn' | 'info';
export interface Finding { level: Level; message: string }
export interface FlagLine { group: string; name: string; state: string }
export interface Preflight { flags: FlagLine[]; findings: Finding[]; errors: number; warnings: number; mode: 'none' | 'test' | 'live' | 'unknown' }

const ON = ['1', 'true', 'on', 'yes'];
const on = (env: Env, k: string) => ON.includes((env[k] ?? '').trim().toLowerCase());
const has = (env: Env, k: string) => (env[k] ?? '').trim().length > 0;

/** The KIND of a Stripe secret key, never its value. */
export function keyKind(key: string | undefined): 'missing' | 'test' | 'live' | 'restricted live' | 'not a Stripe secret key' {
  const k = (key ?? '').trim();
  if (!k) return 'missing';
  if (isTestKey(k)) return 'test';
  if (k.startsWith('rk_live_')) return 'restricted live';
  if (isLiveKey(k)) return 'live';
  return 'not a Stripe secret key';
}

function publishableKind(key: string | undefined): 'missing' | 'test' | 'live' | 'not a publishable key' {
  const k = (key ?? '').trim();
  if (!k) return 'missing';
  if (k.startsWith('pk_test_')) return 'test';
  if (k.startsWith('pk_live_')) return 'live';
  return 'not a publishable key';
}

const secret = (env: Env, k: string) => (has(env, k) ? 'set (value not shown)' : 'missing');
const sw = (env: Env, k: string) => (on(env, k) ? 'on' : has(env, k) ? `off (unrecognised value)` : 'off');

export interface PreflightOptions {
  /** The coach terms version in the code (lib/payments/terms.ts). Tests pass a signed one. */
  coachTermsVersion?: string | null;
}

export function preflight(env: Env, opts: PreflightOptions = {}): Preflight {
  const coachTerms = opts.coachTermsVersion === undefined ? COACH_TERMS_VERSION : opts.coachTermsVersion;
  const findings: Finding[] = [];
  const add = (level: Level, message: string) => findings.push({ level, message });
  const kind = keyKind(env.STRIPE_SECRET_KEY);
  const live = kind === 'live' || kind === 'restricted live';
  const mode: Preflight['mode'] = kind === 'missing' ? 'none' : kind === 'test' ? 'test' : live ? 'live' : 'unknown';
  const pub = publishableKind(env.STRIPE_PUBLIC_KEY);
  const policy = platformFeePolicy(env as NodeJS.ProcessEnv);
  const refundFee = refundProcessingFee(env as NodeJS.ProcessEnv);
  const allow = parseAllowlist(env);
  const products = openProducts(env);

  const flags: FlagLine[] = [
    { group: 'Stripe', name: 'STRIPE_SECRET_KEY', state: kind === 'missing' ? 'missing' : `set: ${kind} key (value not shown)` },
    { group: 'Stripe', name: 'STRIPE_PUBLIC_KEY', state: pub === 'missing' ? 'missing' : `set: ${pub} (value not shown)` },
    { group: 'Stripe', name: 'STRIPE_WEBHOOK_SECRET', state: secret(env, 'STRIPE_WEBHOOK_SECRET') },
    { group: 'Stripe', name: 'STRIPE_CONNECT_WEBHOOK_SECRET', state: secret(env, 'STRIPE_CONNECT_WEBHOOK_SECRET') },
    { group: 'Stripe', name: 'STRIPE_BOOKS_WEBHOOK_SECRET', state: has(env, 'STRIPE_BOOKS_WEBHOOK_SECRET') ? 'set (value not shown)' : 'unset (books use STRIPE_WEBHOOK_SECRET)' },
    { group: 'Stripe', name: 'NEXTAUTH_URL', state: has(env, 'NEXTAUTH_URL') ? (env.NEXTAUTH_URL ?? '').trim() : 'missing' },
    { group: 'Stripe', name: 'STRIPE_PM_PIN', state: sw(env, 'STRIPE_PM_PIN') },
    { group: 'Stripe', name: 'STRIPE_TAX_ENABLED / STRIPE_BOOKS_TAX', state: on(env, 'STRIPE_TAX_ENABLED') || on(env, 'STRIPE_BOOKS_TAX') ? 'on (books only)' : 'off' },
    { group: 'Stripe', name: 'STRIPE_PRICE_COINS_SMALL / _LARGE', state: `${has(env, 'STRIPE_PRICE_COINS_SMALL') ? 'set' : 'unset'} / ${has(env, 'STRIPE_PRICE_COINS_LARGE') ? 'set' : 'unset'}` },
    { group: 'FEL products', name: 'VIRTUAL_PURCHASES_ENABLED', state: sw(env, 'VIRTUAL_PURCHASES_ENABLED') },
    { group: 'FEL products', name: 'PURCHASES_ALLOWLIST', state: allow ? allow.join(',') : 'unset (every product the switch opens)' },
    { group: 'FEL products', name: '(products that sell)', state: products.length ? products.join(', ') : 'none' },
    { group: 'FEL products', name: 'SEASON_PASS_PURCHASE', state: sw(env, 'SEASON_PASS_PURCHASE') },
    { group: 'FEL products', name: 'SEASON_PASS_PRO_PRICE_USD_CENTS', state: has(env, 'SEASON_PASS_PRO_PRICE_USD_CENTS') ? (env.SEASON_PASS_PRO_PRICE_USD_CENTS ?? '').trim() : 'unset (no default: 409 price_not_set)' },
    { group: 'FEL products', name: 'BOOK_STORE_ENABLED', state: sw(env, 'BOOK_STORE_ENABLED') },
    { group: 'FEL products', name: 'STUDIO_CREATOR_ENABLED', state: sw(env, 'STUDIO_CREATOR_ENABLED') },
    { group: 'FEL products', name: 'FEL Pro buyer terms (code)', state: BUYER_TERMS.fel_pro.version },
    { group: 'Coach store', name: 'COACH_STORE_ENABLED', state: sw(env, 'COACH_STORE_ENABLED') },
    { group: 'Coach store', name: 'COACH_STORE_PAYMENTS_ENABLED', state: sw(env, 'COACH_STORE_PAYMENTS_ENABLED') },
    { group: 'Coach store', name: 'COACH_STORE_LIVE', state: sw(env, 'COACH_STORE_LIVE') },
    { group: 'Coach store', name: 'COACH_STORE_COACH_USER_IDS', state: `${(env.COACH_STORE_COACH_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean).length} id(s)` },
    { group: 'Coach store', name: 'COACH_STORE_RECONCILE_SECRET', state: secret(env, 'COACH_STORE_RECONCILE_SECRET') },
    { group: 'Coach store', name: 'COACH_REVIEW_UPLOADS_ENABLED', state: sw(env, 'COACH_REVIEW_UPLOADS_ENABLED') },
    { group: 'Coach business', name: 'COACH_CONNECT_PAYMENTS_ENABLED', state: sw(env, 'COACH_CONNECT_PAYMENTS_ENABLED') },
    { group: 'Coach business', name: 'COACH_CONNECT_LIVE', state: sw(env, 'COACH_CONNECT_LIVE') },
    { group: 'Coach business', name: 'COACH_PRO_ENABLED', state: sw(env, 'COACH_PRO_ENABLED') },
    { group: 'Coach business', name: 'COACH_PRO_PRICE_USD_CENTS', state: `${coachProPriceCents(env as NodeJS.ProcessEnv)}${has(env, 'COACH_PRO_PRICE_USD_CENTS') ? '' : ' (default)'}` },
    { group: 'Coach business', name: 'COACH_FREE_CLIENT_LIMIT', state: `${coachFreeClientLimit(env as NodeJS.ProcessEnv)}${has(env, 'COACH_FREE_CLIENT_LIMIT') ? '' : ' (default)'}` },
    { group: 'Coach business', name: 'COACH_MARKETPLACE_ENABLED', state: sw(env, 'COACH_MARKETPLACE_ENABLED') },
    { group: 'Coach business', name: 'COACH_TERMS_VERSION (code)', state: coachTermsSigned(coachTerms) ? String(coachTerms) : 'null (coach + payout terms not signed)' },
    { group: 'Money settings', name: 'PLATFORM_FEE_BPS_FREE', state: `${policy.bpsFree} (${bpsLabel(policy.bpsFree)})${has(env, 'PLATFORM_FEE_BPS_FREE') ? '' : ' default'}` },
    { group: 'Money settings', name: 'PLATFORM_FEE_BPS_PRO', state: `${policy.bpsPro} (${bpsLabel(policy.bpsPro)})${has(env, 'PLATFORM_FEE_BPS_PRO') ? '' : ' default'}` },
    { group: 'Money settings', name: 'PLATFORM_FEE_CAP_CENTS_MONTHLY', state: policy.capCentsMonthly === null ? 'no cap' : `${policy.capCentsMonthly} ($${(policy.capCentsMonthly / 100).toFixed(2)} a month)` },
    { group: 'Money settings', name: 'REFUND_PROCESSING_FEE', state: `${refundFee ? 'on (buyer gets the processing fee back; FEL absorbs it)' : 'off (processing fee kept on refunds)'}${has(env, 'REFUND_PROCESSING_FEE') ? '' : ' default'}` },
    { group: 'Stays off', name: 'PAYOUTS_ENABLED', state: sw(env, 'PAYOUTS_ENABLED') },
    { group: 'Stays off', name: 'REAL_MONEY_COMPETITION', state: sw(env, 'REAL_MONEY_COMPETITION') },
  ];

  const virtual = on(env, 'VIRTUAL_PURCHASES_ENABLED');
  const storePay = on(env, 'COACH_STORE_PAYMENTS_ENABLED');
  const connectPay = on(env, 'COACH_CONNECT_PAYMENTS_ENABLED');
  const pro = on(env, 'COACH_PRO_ENABLED');
  const selling = virtual || storePay || connectPay || pro;

  // ── the key, the webhook, the site ─────────────────────────────────────────────────────────────────────────────────
  if (!selling) add('info', 'Nothing sells: every selling switch is off.');
  if (selling && kind === 'missing') add('error', 'A selling switch is on but STRIPE_SECRET_KEY is missing: every checkout answers 409 payments_not_set_up.');
  if (kind === 'not a Stripe secret key') add('error', 'STRIPE_SECRET_KEY is set but is not an sk_test_/rk_test_/sk_live_/rk_live_ key.');
  if (selling && !has(env, 'STRIPE_WEBHOOK_SECRET')) add('error', 'STRIPE_WEBHOOK_SECRET is missing: /api/stripe/webhook answers 503, so renewals, refunds and disputes are never recorded.');
  if (has(env, 'STRIPE_WEBHOOK_SECRET') && !(env.STRIPE_WEBHOOK_SECRET ?? '').trim().startsWith('whsec_')) add('warn', 'STRIPE_WEBHOOK_SECRET does not start with whsec_: it is probably not an endpoint signing secret.');
  if (has(env, 'STRIPE_CONNECT_WEBHOOK_SECRET') && !(env.STRIPE_CONNECT_WEBHOOK_SECRET ?? '').trim().startsWith('whsec_')) add('warn', 'STRIPE_CONNECT_WEBHOOK_SECRET does not start with whsec_.');
  if (has(env, 'STRIPE_CONNECT_WEBHOOK_SECRET') && (env.STRIPE_CONNECT_WEBHOOK_SECRET ?? '').trim() === (env.STRIPE_WEBHOOK_SECRET ?? '').trim()) add('warn', 'STRIPE_CONNECT_WEBHOOK_SECRET equals STRIPE_WEBHOOK_SECRET: the connected-accounts endpoint has its own secret in Stripe.');
  const site = (env.NEXTAUTH_URL ?? '').trim();
  if (selling && !site) add('error', 'NEXTAUTH_URL is missing: every checkout answers 409 site_url_not_set (Stripe return URLs come from it).');
  if (selling && site && !/^https:\/\//.test(site)) add(live ? 'error' : 'warn', `NEXTAUTH_URL is not https (${site}): Stripe's return URLs would not be the production site.`);
  if (selling && /localhost|127\.0\.0\.1/.test(site)) add(live ? 'error' : 'warn', 'NEXTAUTH_URL points at localhost.');
  if (pub !== 'missing' && mode !== 'none' && mode !== 'unknown' && pub !== (live ? 'live' : 'test')) add('error', `Mode mismatch: STRIPE_SECRET_KEY is a ${live ? 'live' : 'test'} key but STRIPE_PUBLIC_KEY is ${pub}.`);

  // ── live day ───────────────────────────────────────────────────────────────────────────────────────────────────────
  if (live) {
    add('warn', 'LIVE key: confirm by hand that STRIPE_WEBHOOK_SECRET (and STRIPE_CONNECT_WEBHOOK_SECRET) are the LIVE endpoints\' secrets. A test endpoint\'s secret refuses every live event (400), and a secret\'s mode cannot be read from its value.');
    if (virtual && products.length) add('warn', `LIVE key with VIRTUAL_PURCHASES_ENABLED on: these sell for real money now: ${products.join(', ')}.`);
    if (products.includes('books')) add('warn', 'Books refuse any key but sk_test_ (assertStripeTestKey): with a live key the book checkout stays closed until its code change (docs/BOOK-SHOP.md).');
    if (storePay && !on(env, 'COACH_STORE_LIVE')) add('info', 'Coach store: live key without COACH_STORE_LIVE, so its checkout answers 409 live_mode_off.');
    if ((connectPay || pro) && !on(env, 'COACH_CONNECT_LIVE')) add('info', 'Coach business: live key without COACH_CONNECT_LIVE, so Connect payments and Coach Pro answer 409 live_mode_off.');
  }
  if (mode === 'test') {
    if (on(env, 'COACH_CONNECT_LIVE')) add('warn', 'COACH_CONNECT_LIVE is on with a TEST key: it has no effect until the live key is set.');
    if (on(env, 'COACH_STORE_LIVE')) add('warn', 'COACH_STORE_LIVE is on with a TEST key: it has no effect until the live key is set.');
  }
  if (on(env, 'COACH_CONNECT_LIVE') && !coachTermsSigned(coachTerms)) {
    add('error', 'COACH_CONNECT_LIVE is on but COACH_TERMS_VERSION is null (lib/payments/terms.ts): the coach and payout terms are not signed, so live Connect payments and Coach Pro answer 409 coach_terms_unsigned.');
  }

  // ── FEL products (VIRTUAL_PURCHASES_ENABLED + PURCHASES_ALLOWLIST) ─────────────────────────────────────────────────
  for (const e of unknownAllowlistEntries(env)) add('error', `PURCHASES_ALLOWLIST has "${e}", which is not a product id: it opens nothing.`);
  if (allow && !virtual) add('warn', 'PURCHASES_ALLOWLIST is set but VIRTUAL_PURCHASES_ENABLED is off: nothing on it sells.');
  if (virtual && !allow) add('warn', 'VIRTUAL_PURCHASES_ENABLED is on with no PURCHASES_ALLOWLIST: every product opens at once, including FEL Coach, FEL Facility, shard packs and studio credits (docs/LAUNCH-SALES.md §8.1).');
  if (products.includes('fel_pro')) add('info', `FEL Pro buyers tick the Purchase Terms (${BUYER_TERMS.fel_pro.version}, ${BUYER_TERMS.fel_pro.href}). Cancelling is by email until the billing portal is linked from the account page (lib/purchase-terms.ts).`);
  if (on(env, 'SEASON_PASS_PURCHASE')) {
    if (!has(env, 'SEASON_PASS_PRO_PRICE_USD_CENTS')) add('error', 'SEASON_PASS_PURCHASE is on but SEASON_PASS_PRO_PRICE_USD_CENTS is unset: the season checkout answers 409 price_not_set.');
    if (!products.includes('season_pass')) add('warn', 'SEASON_PASS_PURCHASE is on but the season pass is not open (VIRTUAL_PURCHASES_ENABLED off, or not on PURCHASES_ALLOWLIST).');
  }
  if (on(env, 'BOOK_STORE_ENABLED') && !products.includes('books')) add('warn', 'BOOK_STORE_ENABLED is on but books are not open (VIRTUAL_PURCHASES_ENABLED off, or not on PURCHASES_ALLOWLIST).');
  if (on(env, 'STUDIO_CREATOR_ENABLED') && products.includes('studio_credits')) add('warn', 'Studio credit packs are open: a refunded pack keeps its credits (docs/LAUNCH-SALES.md §8.7).');
  if (products.includes('cosmetic')) add('warn', 'The cosmetic SKU is open but grants no item (docs/LAUNCH-SALES.md §8.2: sell coins, not the SKU).');
  if (products.includes('coins') && !has(env, 'STRIPE_PRICE_COINS_SMALL') && !has(env, 'STRIPE_PRICE_COINS_LARGE')) add('info', 'Coin packs are open; STRIPE_PRICE_COINS_* are unset (the packs use inline prices).');

  // ── coach store ────────────────────────────────────────────────────────────────────────────────────────────────────
  if (storePay && !on(env, 'COACH_STORE_ENABLED')) add('warn', 'COACH_STORE_PAYMENTS_ENABLED is on but COACH_STORE_ENABLED is off: the store is a 404.');
  if (storePay && !has(env, 'COACH_STORE_COACH_USER_IDS')) add('warn', 'COACH_STORE_COACH_USER_IDS is empty: every coach-store listing answers not_for_sale.');
  if (storePay && !has(env, 'COACH_STORE_RECONCILE_SECRET')) add('info', 'COACH_STORE_RECONCILE_SECRET is unset: the no-webhook catch-up route is a 404 (recommended, docs/LAUNCH-SALES.md §5).');
  if (on(env, 'COACH_REVIEW_UPLOADS_ENABLED') && !has(env, 'COACH_REVIEWS_BUCKET')) add('warn', 'COACH_REVIEW_UPLOADS_ENABLED is on but COACH_REVIEWS_BUCKET is unset: uploads stay "coming soon".');

  // ── coach business ─────────────────────────────────────────────────────────────────────────────────────────────────
  if (connectPay) {
    add('info', 'Coach payments need prisma/pending/2026-10-25-coach-business.sql applied (else 503 coach_business_not_ready); disputes and the Stripe-setup flag also need 2026-10-26-payments-ready.sql. This check cannot see the database.');
    if (!has(env, 'STRIPE_CONNECT_WEBHOOK_SECRET')) add('warn', 'STRIPE_CONNECT_WEBHOOK_SECRET is missing: account.updated never arrives, so a coach\'s Stripe status refreshes only when they come back from onboarding.');
    if (!refundFee) add('warn', 'REFUND_PROCESSING_FEE is off: a coach-sale refund keeps the processing fee, which the store terms (§2.6) and the owner (2026-10-27, "refund in full") say FEL refunds. Unset it to refund in full.');
  }
  if (has(env, 'COACH_PRO_PRICE_USD_CENTS') && coachProPriceCents(env as NodeJS.ProcessEnv) !== Number((env.COACH_PRO_PRICE_USD_CENTS ?? '').trim())) add('warn', 'COACH_PRO_PRICE_USD_CENTS is not a whole number of cents from 100 to 1000000: the default applies.');
  if (has(env, 'COACH_FREE_CLIENT_LIMIT') && coachFreeClientLimit(env as NodeJS.ProcessEnv) !== Number((env.COACH_FREE_CLIENT_LIMIT ?? '').trim())) add('warn', 'COACH_FREE_CLIENT_LIMIT is not a whole number up to 1000: the default applies.');
  for (const p of moneyEnvProblems(env as NodeJS.ProcessEnv)) add('error', p);
  add('info', `Coach fee: Free ${bpsLabel(policy.bpsFree)}, Pro ${bpsLabel(policy.bpsPro)}, ${policy.capCentsMonthly === null ? 'no monthly cap' : `capped at $${(policy.capCentsMonthly / 100).toFixed(2)} a month`}; refunds ${refundFee ? 'return' : 'keep'} the processing fee.`);

  // ── stays off ──────────────────────────────────────────────────────────────────────────────────────────────────────
  if (on(env, 'REAL_MONEY_COMPETITION')) add('error', 'REAL_MONEY_COMPETITION is on: the owner\'s decision (2026-10-20) is to keep it off until legal review.');
  if (on(env, 'PAYOUTS_ENABLED')) add('warn', 'PAYOUTS_ENABLED is on: creator cash-out is not built (the route answers 503 regardless). Leave it off.');

  const errors = findings.filter((f) => f.level === 'error').length;
  const warnings = findings.filter((f) => f.level === 'warn').length;
  return { flags, findings, errors, warnings, mode };
}

/** The report as text. Contains no secret value (preflight never puts one in). */
export function formatPreflight(p: Preflight): string {
  const lines: string[] = ['Payments preflight (read-only: no network, no database, no Stripe)', ''];
  let group = '';
  const width = Math.max(...p.flags.map((f) => f.name.length));
  for (const f of p.flags) {
    if (f.group !== group) { group = f.group; lines.push(`${group}:`); }
    lines.push(`  ${f.name.padEnd(width)}  ${f.state}`);
  }
  lines.push('');
  for (const level of ['error', 'warn', 'info'] as const) {
    const list = p.findings.filter((f) => f.level === level);
    if (!list.length) continue;
    lines.push(`${level === 'error' ? 'ERRORS' : level === 'warn' ? 'WARNINGS' : 'NOTES'}:`);
    for (const f of list) lines.push(`  - ${f.message}`);
  }
  lines.push('', `Mode: ${p.mode}. ${p.errors} error(s), ${p.warnings} warning(s). ${p.errors ? 'NOT READY.' : 'No blocking errors.'}`);
  return lines.join('\n');
}

/**
 * A .env file's KEY=VALUE lines (the subset the deploy tree's env file uses): `#` comments, blank lines, an optional
 * `export `, and values bare, "double-quoted" or 'single-quoted'. Multi-line values are not supported. No dependency.
 */
export function parseEnvText(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    const q = v[0];
    if ((q === '"' || q === "'") && v.lastIndexOf(q) > 0) v = v.slice(1, v.lastIndexOf(q));
    else v = v.replace(/\s+#.*$/, '');
    out[m[1]] = v;
  }
  return out;
}
