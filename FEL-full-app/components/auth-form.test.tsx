// LOGIN-LOOP-FIX (2026-10-04) regression test: signing in from plain /login (default landing /play/dunk) bounced
// between /play/dunk and /login?next=%2Fplay%2Fdunk — thousands of times a minute on a phone — because the
// post-sign-in landing used router.replace(dest), and Next's router cache still held a redirect-to-login response
// that ModeCarousel had prefetched for /play/dunk while the visitor was signed out. See mode-carousel.tsx for the
// other half of the fix (no more of that prefetch) and lib/auth/safeNext.test.ts for the pure-helper half
// (safePostSignInDestination never resolves to /login).
//
// This drives the REAL AuthForm with next-auth's signIn/signOut mocked (as lib/sessions-route.test.ts and friends
// mock next-auth) and window/fetch stubbed (as components/guest-landing-hero.network.test.tsx stubs the browser),
// using the no-DOM render pattern from tests/helpers/driveRender (vitest runs in node here — no jsdom). It asserts
// the sign-in success path calls a full navigation (window.location.replace) exactly once, and never with a /login
// target, across every branch: the plain default destination, a ?next=, a ?next= nested at /login (the loop's own
// shape), and the age-gate redirect.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { drive, field, findAll, typeInto } from '@/tests/helpers/driveRender';

const signIn = vi.fn();
const signOut = vi.fn();
vi.mock('next-auth/react', () => ({
  signIn: (...a: unknown[]) => signIn(...a),
  signOut: (...a: unknown[]) => signOut(...a),
}));

type Gate = { blocked?: boolean; needed?: boolean };
const gate = vi.hoisted(() => ({ response: null as Gate | null }));
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  if (url.includes('/api/account/birth-year')) {
    const body = gate.response ?? { blocked: false, needed: false };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response('{}', { status: 200 });
});

function locationStub(href: string) {
  return { href, replace: vi.fn(), assign: vi.fn() };
}

import { AuthForm } from './auth-form';

/** Render AuthForm(mode), type an email + password, and return its <form> element ready to submit. */
function renderForm(mode: 'login' | 'signup') {
  const r = drive(() => AuthForm({ mode }), [
    (tree) => typeInto(field(tree, /^Email$/), 'athlete@example.com'),
    (tree) => typeInto(field(tree, /Password/), 'correct-horse-battery'),
  ]);
  const [form] = findAll(r.tree, (el) => el.type === 'form');
  expect(form, 'the credentials form is open').toBeTruthy();
  return form;
}

describe('AuthForm: a successful sign-in always lands with ONE full navigation, never back at /login', () => {
  let win: ReturnType<typeof locationStub>;

  beforeEach(() => {
    signIn.mockReset();
    signOut.mockReset();
    fetchMock.mockClear();
    gate.response = null;
    signIn.mockResolvedValue({ error: undefined });
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  function stubWindow(href: string) {
    win = locationStub(href);
    vi.stubGlobal('window', { location: win });
    return win;
  }

  it('no ?next=: lands on the default game (/play/dunk), exactly one full navigation, never /login', async () => {
    stubWindow('http://127.0.0.1/login');
    const form = renderForm('login');
    await form.props.onSubmit({ preventDefault() {} });

    expect(signIn).toHaveBeenCalledWith('credentials', { email: 'athlete@example.com', password: 'correct-horse-battery', redirect: false });
    expect(win.replace).toHaveBeenCalledTimes(1);
    expect(win.assign).not.toHaveBeenCalled();
    const [dest] = win.replace.mock.calls[0];
    expect(dest).toBe('/play/dunk');
    expect(dest).not.toMatch(/^\/login(?:[/?#]|$)/);
  });

  it('?next=/play/dunk (the exact reported bug path): one full navigation to /play/dunk, no loop', async () => {
    stubWindow('http://127.0.0.1/login?next=%2Fplay%2Fdunk');
    const form = renderForm('login');
    await form.props.onSubmit({ preventDefault() {} });

    expect(win.replace).toHaveBeenCalledTimes(1);
    expect(win.replace.mock.calls[0][0]).toBe('/play/dunk');
  });

  it('?next=/coach/session (NOT affected by the bug): one full navigation there', async () => {
    stubWindow('http://127.0.0.1/login?next=%2Fcoach%2Fsession');
    const form = renderForm('login');
    await form.props.onSubmit({ preventDefault() {} });

    expect(win.replace).toHaveBeenCalledTimes(1);
    expect(win.replace.mock.calls[0][0]).toBe('/coach/session');
  });

  it('?next=/login (bare): falls back to the default destination, never navigates to /login', async () => {
    stubWindow('http://127.0.0.1/login?next=%2Flogin');
    const form = renderForm('login');
    await form.props.onSubmit({ preventDefault() {} });

    expect(win.replace).toHaveBeenCalledTimes(1);
    const [dest] = win.replace.mock.calls[0];
    expect(dest).not.toMatch(/^\/login(?:[/?#]|$)/);
    expect(dest).toBe('/play/dunk');
  });

  it('?next=/login?next=%2Flogin (nested): also falls back, never a /login?next= URL', async () => {
    stubWindow('http://127.0.0.1/login?next=%2Flogin%3Fnext%3D%252Flogin');
    const form = renderForm('login');
    await form.props.onSubmit({ preventDefault() {} });

    expect(win.replace).toHaveBeenCalledTimes(1);
    const [dest] = win.replace.mock.calls[0];
    expect(dest).not.toMatch(/^\/login(?:[/?#]|$)/);
  });

  it('age gate needed: one full navigation to /age?next=..., not router-cached, and the ?next= it carries is also loop-safe', async () => {
    gate.response = { blocked: false, needed: true };
    stubWindow('http://127.0.0.1/login?next=%2Fplay%2Fdunk');
    const form = renderForm('login');
    await form.props.onSubmit({ preventDefault() {} });

    expect(win.replace).toHaveBeenCalledTimes(1);
    const [dest] = win.replace.mock.calls[0];
    expect(dest).toBe('/age?next=%2Fplay%2Fdunk');
  });

  it('age gate blocked: signs out and shows the turn-away — no navigation call at all', async () => {
    gate.response = { blocked: true };
    stubWindow('http://127.0.0.1/login');
    const form = renderForm('login');
    await form.props.onSubmit({ preventDefault() {} });

    expect(signOut).toHaveBeenCalledWith({ redirect: false });
    expect(win.replace).not.toHaveBeenCalled();
    expect(win.assign).not.toHaveBeenCalled();
  });

  it('invalid credentials: no navigation at all', async () => {
    signIn.mockResolvedValue({ error: 'CredentialsSignin' });
    stubWindow('http://127.0.0.1/login');
    const form = renderForm('login');
    await form.props.onSubmit({ preventDefault() {} });

    expect(win.replace).not.toHaveBeenCalled();
    expect(win.assign).not.toHaveBeenCalled();
  });

  it('never calls router-style client navigation: the component imports no next/navigation router', () => {
    const src = readFileSync(join(__dirname, 'auth-form.tsx'), 'utf8');
    expect(src).not.toMatch(/\buseRouter\(/);
    expect(src).not.toMatch(/\brouter\.replace\(|\brouter\.push\(/);
  });

  // Signup shares this exact submit function (mode is a prop, not a different code path) — including the
  // challenge-return branch, which is why a static check here is enough rather than re-driving AgeStep's own
  // gating just to reach signup's credentials form.
  it('signup\'s challenge-return branch is also a full navigation, not router.replace', () => {
    const src = readFileSync(join(__dirname, 'auth-form.tsx'), 'utf8');
    expect(src).toMatch(/window\.location\.replace\(challengeReturnPath\(challengeCode\)\)/);
  });
});
