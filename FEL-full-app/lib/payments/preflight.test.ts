// PAYMENTS-READY: the owner's readiness check. It names what is missing or inconsistent and never prints a secret.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatPreflight, keyKind, parseEnvText, preflight } from './preflight';

// Fake values, built at run time so no key-shaped literal sits in the source (secret scanners).
const fake = (prefix: string, tail: string) => [prefix, tail].join('_');
const SECRETS = {
  STRIPE_SECRET_KEY: fake('sk_live', 'FAKEnotAkeyTAILaaaa'),
  STRIPE_WEBHOOK_SECRET: fake('whsec', 'FAKEwebhookTAILbbbb'),
  STRIPE_CONNECT_WEBHOOK_SECRET: fake('whsec', 'FAKEconnectTAILcccc'),
  STRIPE_BOOKS_WEBHOOK_SECRET: fake('whsec', 'FAKEbooksTAILdddd'),
  COACH_STORE_RECONCILE_SECRET: fake('reconcile', 'FAKEsecretTAILeeee'),
  STRIPE_PUBLIC_KEY: fake('pk_live', 'FAKEpublishableTAILffff'),
};
const messages = (env: Record<string, string>, opts = {}) => preflight(env, opts).findings.map((f) => `${f.level}: ${f.message}`);

describe('never prints a secret', () => {
  it('no secret value, and no part of one past its prefix, reaches the report', () => {
    const env = { ...SECRETS, COACH_CONNECT_PAYMENTS_ENABLED: '1', COACH_CONNECT_LIVE: '1', VIRTUAL_PURCHASES_ENABLED: '1', NEXTAUTH_URL: 'https://fel.test' };
    const text = formatPreflight(preflight(env));
    for (const v of Object.values(SECRETS)) {
      expect(text).not.toContain(v);
      expect(text).not.toContain(v.slice(8, 20));
    }
    expect(text).toMatch(/STRIPE_SECRET_KEY\s+set: live key \(value not shown\)/);
    expect(text).toMatch(/STRIPE_WEBHOOK_SECRET\s+set \(value not shown\)/);
  });

  it('the key kind only', () => {
    expect(keyKind(undefined)).toBe('missing');
    expect(keyKind('sk_test_x')).toBe('test');
    expect(keyKind('rk_test_x')).toBe('test');
    expect(keyKind('sk_live_x')).toBe('live');
    expect(keyKind('rk_live_x')).toBe('restricted live');
    expect(keyKind('pk_live_x')).toBe('not a Stripe secret key');
  });
});

describe('today\'s config (every switch off) is clean', () => {
  it('no errors, no warnings, every flag listed, the fee defaults said', () => {
    const p = preflight({});
    expect(p.errors).toBe(0);
    expect(p.warnings).toBe(0);
    expect(p.mode).toBe('none');
    const names = p.flags.map((f) => f.name);
    for (const k of ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_CONNECT_WEBHOOK_SECRET', 'VIRTUAL_PURCHASES_ENABLED', 'PURCHASES_ALLOWLIST',
      'COACH_CONNECT_PAYMENTS_ENABLED', 'COACH_CONNECT_LIVE', 'COACH_TERMS_VERSION (code)', 'PLATFORM_FEE_BPS_FREE', 'PLATFORM_FEE_BPS_PRO',
      'PLATFORM_FEE_CAP_CENTS_MONTHLY', 'REFUND_PROCESSING_FEE', 'REAL_MONEY_COMPETITION', 'PAYOUTS_ENABLED']) expect(names).toContain(k);
    expect(messages({})).toContain('info: Coach fee: Free 5%, Pro 5%, no monthly cap; refunds keep the processing fee.');
  });
});

describe('missing and inconsistent', () => {
  it('a selling switch without a key, webhook secret or site URL', () => {
    const m = messages({ COACH_CONNECT_PAYMENTS_ENABLED: '1' });
    expect(m.some((x) => /^error: .*STRIPE_SECRET_KEY is missing/.test(x))).toBe(true);
    expect(m.some((x) => /^error: STRIPE_WEBHOOK_SECRET is missing/.test(x))).toBe(true);
    expect(m.some((x) => /^error: NEXTAUTH_URL is missing/.test(x))).toBe(true);
    expect(m.some((x) => /^warn: STRIPE_CONNECT_WEBHOOK_SECRET is missing/.test(x))).toBe(true);
  });

  it('COACH_CONNECT_LIVE without signed coach terms is an error; with them it is not', () => {
    const env = { STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', NEXTAUTH_URL: 'https://fel.test', COACH_CONNECT_PAYMENTS_ENABLED: '1', COACH_CONNECT_LIVE: '1' };
    expect(messages(env).some((x) => /^error: COACH_CONNECT_LIVE is on but COACH_TERMS_VERSION is null/.test(x))).toBe(true);
    expect(messages(env, { coachTermsVersion: 'coach-terms-2026-11-01' }).some((x) => /COACH_TERMS_VERSION is null/.test(x))).toBe(false);
    // also with a test key: the switch says "live" before the terms exist
    expect(messages({ ...env, STRIPE_SECRET_KEY: 'sk_test_x' }).some((x) => /^error: COACH_CONNECT_LIVE is on but COACH_TERMS_VERSION is null/.test(x))).toBe(true);
  });

  it('a live secret key with a test publishable key; a live key always asks to confirm the webhook secrets\' mode', () => {
    const env = { STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_PUBLIC_KEY: 'pk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', NEXTAUTH_URL: 'https://fel.test' };
    const m = messages(env);
    expect(m).toContain('error: Mode mismatch: STRIPE_SECRET_KEY is a live key but STRIPE_PUBLIC_KEY is test.');
    expect(m.some((x) => /^warn: LIVE key: confirm by hand that STRIPE_WEBHOOK_SECRET/.test(x))).toBe(true);
    expect(messages({ ...env, STRIPE_PUBLIC_KEY: 'pk_live_x' }).some((x) => /Mode mismatch/.test(x))).toBe(false);
  });

  it('a live key with VIRTUAL_PURCHASES_ENABLED names what sells for real money; books cannot', () => {
    const env = { STRIPE_SECRET_KEY: 'rk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', NEXTAUTH_URL: 'https://fel.test', VIRTUAL_PURCHASES_ENABLED: '1', PURCHASES_ALLOWLIST: 'fel_pro,books' };
    const m = messages(env);
    expect(m).toContain('warn: LIVE key with VIRTUAL_PURCHASES_ENABLED on: these sell for real money now: fel_pro, books.');
    expect(m.some((x) => /^warn: Books refuse any key but sk_test_/.test(x))).toBe(true);
  });

  it('live switches with a test key do nothing (warned); a live key without them closes (noted)', () => {
    expect(messages({ STRIPE_SECRET_KEY: 'sk_test_x', COACH_STORE_LIVE: '1' })).toContain('warn: COACH_STORE_LIVE is on with a TEST key: it has no effect until the live key is set.');
    expect(messages({ STRIPE_SECRET_KEY: 'sk_live_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', NEXTAUTH_URL: 'https://fel.test', COACH_PRO_ENABLED: '1' }))
      .toContain('info: Coach business: live key without COACH_CONNECT_LIVE, so Connect payments and Coach Pro answer 409 live_mode_off.');
  });

  it('the allow list: a typo, set while the switch is off, and the switch on with no list', () => {
    expect(messages({ PURCHASES_ALLOWLIST: 'felpro' })).toEqual(expect.arrayContaining([
      'error: PURCHASES_ALLOWLIST has "felpro", which is not a product id: it opens nothing.',
      'warn: PURCHASES_ALLOWLIST is set but VIRTUAL_PURCHASES_ENABLED is off: nothing on it sells.',
    ]));
    expect(messages({ VIRTUAL_PURCHASES_ENABLED: '1', STRIPE_SECRET_KEY: 'sk_test_x' }).some((x) => /^warn: VIRTUAL_PURCHASES_ENABLED is on with no PURCHASES_ALLOWLIST/.test(x))).toBe(true);
  });

  it('season pass without its price; money settings that are not understood', () => {
    expect(messages({ SEASON_PASS_PURCHASE: '1' }).some((x) => /^error: SEASON_PASS_PURCHASE is on but SEASON_PASS_PRO_PRICE_USD_CENTS is unset/.test(x))).toBe(true);
    const m = messages({ PLATFORM_FEE_BPS_PRO: '5%', PLATFORM_FEE_CAP_CENTS_MONTHLY: '-1', REFUND_PROCESSING_FEE: 'maybe' });
    expect(m.filter((x) => x.startsWith('error: PLATFORM_FEE_') || x.startsWith('error: REFUND_PROCESSING_FEE'))).toHaveLength(3);
  });

  it('the owner\'s fee choices read back', () => {
    expect(messages({ PLATFORM_FEE_BPS_PRO: '0' })).toContain('info: Coach fee: Free 5%, Pro 0%, no monthly cap; refunds keep the processing fee.');
    expect(messages({ PLATFORM_FEE_CAP_CENTS_MONTHLY: '5000', REFUND_PROCESSING_FEE: '1' })).toContain('info: Coach fee: Free 5%, Pro 5%, capped at $50.00 a month; refunds return the processing fee.');
  });

  it('coach payments on with the processing fee kept: the store-terms conflict is flagged for the owner', () => {
    const env = { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', NEXTAUTH_URL: 'https://fel.test', COACH_CONNECT_PAYMENTS_ENABLED: '1' };
    expect(messages(env).some((x) => /^warn: REFUND_PROCESSING_FEE is off/.test(x))).toBe(true);
    expect(messages({ ...env, REFUND_PROCESSING_FEE: '1' }).some((x) => /REFUND_PROCESSING_FEE is off/.test(x))).toBe(false);
  });

  it('what stays off', () => {
    expect(messages({ REAL_MONEY_COMPETITION: '1' }).some((x) => x.startsWith('error: REAL_MONEY_COMPETITION is on'))).toBe(true);
    expect(messages({ PAYOUTS_ENABLED: '1' }).some((x) => x.startsWith('warn: PAYOUTS_ENABLED is on'))).toBe(true);
  });
});

describe('the script', () => {
  it('--env-file reads only that file, prints no secret, exits 1 on an error and 0 when clean', () => {
    const dir = mkdtempSync(join(tmpdir(), 'preflight-'));
    const bad = join(dir, 'bad.env');
    writeFileSync(bad, Object.entries({ ...SECRETS, COACH_CONNECT_PAYMENTS_ENABLED: '1', COACH_CONNECT_LIVE: '1' }).map(([k, v]) => `${k}="${v}"`).join('\n'));
    let out = '';
    let code = 0;
    try {
      out = execFileSync('npx', ['tsx', 'scripts/payments-preflight.ts', '--env-file', bad], { encoding: 'utf8', env: { ...process.env, STRIPE_SECRET_KEY: '' } });
    } catch (e) {
      const err = e as { status: number; stdout: string };
      code = err.status;
      out = err.stdout;
    }
    expect(code).toBe(1);
    expect(out).toMatch(/COACH_CONNECT_LIVE is on but COACH_TERMS_VERSION is null/);
    for (const v of Object.values(SECRETS)) expect(out).not.toContain(v);

    const clean = join(dir, 'clean.env');
    writeFileSync(clean, '# nothing on\nVIRTUAL_PURCHASES_ENABLED=""\n');
    expect(execFileSync('npx', ['tsx', 'scripts/payments-preflight.ts', '--env-file', clean], { encoding: 'utf8' })).toMatch(/0 error\(s\), 0 warning\(s\)/);
  }, 60_000);
});

it('reads an env file the way the deploy tree writes it', () => {
  expect(parseEnvText('# c\nexport A="1"\nB=\'two words\'\nC=bare # note\n\nD=""\nnot a line\nE=a=b')).toEqual({ A: '1', B: 'two words', C: 'bare', D: '', E: 'a=b' });
});
