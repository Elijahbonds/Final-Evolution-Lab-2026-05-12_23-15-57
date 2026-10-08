import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import path from 'node:path';
import { Certify, CampGate, loadCamp, type CampLoad } from './camp-view';

// HOTFIX (2026-09-24): the Certify tab reads its paper, and each module's attempt gate, from GET
// /api/v1/camp/assess. A server render is its first paint: pin that a resting module says why and
// cannot be opened, an open one says how many tries are left, and the rules are stated up front.

type State = NonNullable<Parameters<typeof Certify>[0]['state']>;

const mod = (ref: string, attempt: State['modules'][number]['attempt'], required = true): State['modules'][number] => ({
  ref, title: `Module ${ref}`, summary: 'summary', required, presentationId: 'p1',
  questions: [{ key: 'q1', prompt: 'A prompt?', options: ['w', 'x', 'y', 'z'] }],
  attempt,
});

const state: State = {
  status: 'in_progress', missingModules: ['blueprint/m1', 'blueprint/m2'], passedModules: ['blueprint/m3'], credentials: [],
  curriculumVersion: '2026.09-draft2', passMark: 80, policy: { cooldownSec: 300, attemptCap: 3, windowSec: 86_400 },
  modules: [
    mod('blueprint/m1', { open: false, reason: 'cooldown', retryAfterSec: 290, attemptsLeft: 2 }),
    mod('blueprint/m2', { open: true, reason: null, retryAfterSec: null, attemptsLeft: 3 }),
    mod('blueprint/m3', { open: false, reason: 'already_passed', retryAfterSec: null, attemptsLeft: 0 }),
    // Optional and passed: NOT in passedModules (that list is required modules only), so only the gate says so.
    mod('blueprint/m4', { open: false, reason: 'already_passed', retryAfterSec: null, attemptsLeft: 0 }, false),
  ],
};

function render(): string {
  return renderToStaticMarkup(createElement(Certify, { state, onDone: async () => {} }));
}

/** The markup of one module card, by its title. */
function card(markup: string, ref: string): string {
  const start = markup.indexOf(`Module ${ref}`);
  const next = markup.indexOf('Module blueprint/', start + 1);
  return markup.slice(start, next < 0 ? undefined : next);
}

describe('Certify, first paint', () => {
  it('states the rules: pass mark, cooldown, cap', () => {
    const m = render();
    expect(m).toContain('Pass every required module at 80% to certify.');
    expect(m).toContain('After a miss a module rests 5 min; 3 attempts per module every 24 h.');
  });

  it('a resting module says when it opens, and its button is disabled', () => {
    const c = card(render(), 'blueprint/m1');
    expect(c).toContain('Next attempt in 5 min.');
    expect(c).toMatch(/<button disabled=""[^>]*>Take assessment<\/button>/);
  });

  it('an open module says how many attempts are left, and can be opened', () => {
    const c = card(render(), 'blueprint/m2');
    expect(c).toContain('3 attempts left in this window.');
    expect(c).toMatch(/<button (?!disabled)[^>]*>Take assessment<\/button>/);
  });

  it('a passed module shows passed, not a gate line or a button', () => {
    const c = card(render(), 'blueprint/m3');
    expect(c).toContain('passed');
    expect(c).not.toContain('Take assessment');
    expect(c).not.toContain('data-testid="assess-gate"');
  });

  it('a passed OPTIONAL module shows passed too, not a greyed-out button', () => {
    const c = card(render(), 'blueprint/m4');
    expect(c).toContain('passed');
    expect(c).not.toContain('Take assessment');
    expect(c).not.toContain('data-testid="assess-gate"');
  });

  it('shows no questions until a module is opened', () => {
    expect(render()).not.toContain('A prompt?');
  });
});

// QA P0-05 (2026-09-27): GET /api/v1/camp/assess and /plans answer 402 for an account without FEL Coach, on purpose
// (lib/camp/server.ts requirePaidFacilitator). The page read the 402 as "not loaded yet" and Certify spun on Loading…
// forever. The bodies below are the server's own (lib/pro-guard b2bPaywall).
describe('Camp, the first load: paywall, error, or the page', () => {
  const PAYWALL = {
    error: 'pro_required', feature: 'Camp mentees, plans and assessments', tier: 'coach',
    message: 'Camp mentees, plans and assessments is part of FEL Coach ($39/month).', weeklyUsd: 5,
    checkout: { weekly: '/api/stripe/checkout?product=FEL_COACH', monthly: '/api/stripe/checkout?product=FEL_COACH' },
    free: 'Your own training, the Mirror and every game mode stay free. Consent records and credential revocation are never gated.',
  };
  function serve(answers: Record<string, { status: number; body: unknown }>) {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const a = answers[url] ?? { status: 200, body: {} };
      return new Response(typeof a.body === 'string' ? a.body : JSON.stringify(a.body), { status: a.status });
    }));
  }
  const gated = (l: CampLoad) => renderToStaticMarkup(createElement(CampGate, { gate: l.gate, error: l.assess ? null : l.error, onRetry: () => {} }, createElement(Certify, { state: l.assess, onDone: async () => {} })));
  afterEach(() => { vi.unstubAllGlobals(); });

  it('402: the paywall from the body — what is gated, what stays free — and no spinner, no checkout link', async () => {
    serve({ '/api/v1/camp/assess': { status: 402, body: PAYWALL }, '/api/v1/camp/plans': { status: 402, body: PAYWALL } });
    const l = await loadCamp();
    expect(l.gate?.error).toBe('pro_required');
    expect(l.error).toBeNull();
    const m = gated(l);
    expect(m).toContain('data-testid="camp-paywall"');
    expect(m).toContain('Camp mentees, plans and assessments is part of FEL Coach ($39/month).');
    expect(m).toContain('every game mode stay free');
    expect(m).not.toContain('Loading…');
    expect(m).not.toMatch(/stripe|checkout|href=/);
  });

  it('500: an error line and Retry, not a spinner', async () => {
    serve({ '/api/v1/camp/assess': { status: 500, body: { error: 'boom' } } });
    const l = await loadCamp();
    expect(l.gate).toBeNull();
    expect(l.error).toBe('Camp could not load (error 500).');
    const m = gated(l);
    expect(m).toContain('data-testid="camp-error"');
    expect(m).toMatch(/<button[^>]*>Retry<\/button>/);
    expect(m).not.toContain('Loading…');
  });

  it('offline: the same error line, saying so', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const l = await loadCamp();
    expect(l.error).toBe('Camp could not load (no connection).');
  });

  it('200: Certify renders as today', async () => {
    serve({ '/api/v1/camp/assess': { status: 200, body: state }, '/api/v1/camp/plans': { status: 200, body: { plans: [] } }, '/api/auth/session': { status: 200, body: { user: { id: 'u1' } } } });
    const l = await loadCamp();
    expect(l.gate).toBeNull();
    expect(l.error).toBeNull();
    expect(l.me).toBe('u1');
    const m = gated(l);
    expect(m).toBe(render());
  });
});

describe('Camp plan selection wiring', () => {
  const source = fs.readFileSync(path.resolve(__dirname, 'camp-view.tsx'), 'utf8');

  it('normalizes stale plan selections before posting plan-scoped actions', () => {
    expect(source).toContain('visiblePlanId(plans, planId)');
    expect(source).toContain('goalPlanId: visibleId');
    expect(source).toContain('await load(visibleId)');
    expect(source).toContain('const plan = plans.find((p) => p.id === visibleId) ?? null');
  });

  it('binds plan dropdowns to the visible id, not a removed prior id', () => {
    const selectBindings = source.match(/<select value=\{visibleId\}/g) ?? [];
    expect(selectBindings.length).toBeGreaterThanOrEqual(3);
  });
});
