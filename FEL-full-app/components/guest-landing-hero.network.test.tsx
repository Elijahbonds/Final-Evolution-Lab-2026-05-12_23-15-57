// JOIN-LAB-HIDE (2026-09-29): `/` sends no signup. vitest runs in node here (no jsdom), so this mounts the real hero the
// way the browser would as far as the network is concerned: `window`, `document`, `localStorage`, `fetch`,
// `XMLHttpRequest` and `navigator.sendBeacon` are stubbed, every request through them is recorded, the hero's mount
// effect runs, and the timers run for a minute. The real lib/analytics runs too (not a stub): its POST to /api/analytics
// is the one request `/` is allowed to make, named in ALLOWED below, so a change to it is a deliberate one.
//
// The last test is the control. With the switch on, submitting the form the hero renders must show up as a POST to
// /api/marketing/subscribe in the same recorder, which proves the recorder would have caught one with the switch off.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { drive, field, findAll, typeInto } from '@/tests/helpers/driveRender';

// Mount effects: renderToStaticMarkup never runs useEffect, so the hero's effects are recorded here and run after the
// render, as a mount would run them. Only this file's own components see this; React's internals keep the real hook.
const fx = vi.hoisted(() => ({ effects: [] as Array<() => unknown> }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useEffect = ((effect: () => unknown) => { fx.effects.push(effect); }) as typeof actual.useEffect;
  const base = ((actual as unknown as { default?: typeof actual }).default ?? actual) as typeof actual;
  return { ...actual, useEffect, default: { ...base, useEffect } };
});

const FLAG = 'NEXT_PUBLIC_JOIN_LAB_ENABLED';

/** The only request `/` may make: the analytics batch (guest_start on load). */
const ALLOWED = ['/api/analytics'];

/** A signup, by any name the app has used or might: the Join the Lab intake, account signup, a waitlist. */
const SIGNUP = /\/api\/marketing\/subscribe|\/api\/signup|waitlist|subscribe/i;

interface Sent { via: 'fetch' | 'xhr' | 'beacon'; method: string; url: string }

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => { m.delete(k); },
    setItem: (k, v) => { m.set(k, String(v)); },
  };
}

let sent: Sent[] = [];
let listeners = new Map<string, Array<() => void>>();

function stubBrowser(): void {
  sent = [];
  listeners = new Map();
  const on = (type: string, fn: () => void) => { listeners.set(type, [...(listeners.get(type) ?? []), fn]); };
  const storage = memoryStorage();
  vi.stubGlobal('window', {
    addEventListener: on, removeEventListener: () => {}, localStorage: storage, location: new URL('http://127.0.0.1/'),
  });
  // head / createElement / createTextNode: sonner (the form's toasts) injects its stylesheet on import once a document
  // exists, so the form's module needs them to load at all.
  const node = () => ({ appendChild() {}, insertBefore() {}, firstChild: null });
  vi.stubGlobal('document', {
    addEventListener: on, removeEventListener: () => {}, visibilityState: 'visible',
    head: node(), createElement: node, createTextNode: () => ({}),
  });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ via: 'fetch', method: String(init?.method ?? 'GET').toUpperCase(), url: String(input) });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  vi.stubGlobal('XMLHttpRequest', class {
    private method = 'GET';
    private url = '';
    open(method: string, url: string) { this.method = method; this.url = url; }
    setRequestHeader() {}
    addEventListener() {}
    send() { sent.push({ via: 'xhr', method: this.method.toUpperCase(), url: this.url }); }
  });
  // false: the beacon "fails", so analytics falls back to fetch and both of its channels are exercised.
  vi.stubGlobal('navigator', {
    userAgent: 'join-lab-hide-test',
    sendBeacon: vi.fn((url: string | URL) => { sent.push({ via: 'beacon', method: 'POST', url: String(url) }); return false; }),
  });
}

/** Load the hero (and the real lib/analytics) fresh, after the browser globals exist: analytics reads them on load. */
async function loadHero() {
  vi.resetModules();
  const { GuestLandingHero } = await import('./guest-landing-hero');
  const { EmailCapture } = await import('@/components/marketing/email-capture');
  const { stopAnalytics } = await import('@/lib/analytics');
  return { GuestLandingHero, EmailCapture, stopAnalytics };
}

/** Render, run the mount effects, then let a minute of timers (the analytics flush interval is 15 s) and the hide run. */
async function mountAndIdle(render: () => void): Promise<void> {
  fx.effects.length = 0;
  render();
  for (const effect of fx.effects.splice(0)) effect();
  await vi.advanceTimersByTimeAsync(60_000);
  for (const fn of listeners.get('pagehide') ?? []) fn();
  await vi.advanceTimersByTimeAsync(1_000);
}

describe('/ sends no signup request', () => {
  let stop: (() => void) | null = null;
  beforeEach(() => { vi.useFakeTimers(); stubBrowser(); });
  afterEach(() => {
    stop?.();
    stop = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([['unset', undefined], ["'false'", 'false']])('with the switch %s: no signup POST, only the allowed analytics', async (_label, value) => {
    vi.stubEnv(FLAG, value);
    const { GuestLandingHero, stopAnalytics } = await loadHero();
    stop = stopAnalytics;
    await mountAndIdle(() => { renderToStaticMarkup(createElement(GuestLandingHero)); });

    expect(sent.filter((r) => r.method === 'POST' && SIGNUP.test(r.url))).toEqual([]);
    expect(sent.filter((r) => !ALLOWED.includes(r.url))).toEqual([]);
    // The recorder is live: the load's guest_start batch went out through it (beacon first, then the fetch fallback).
    expect(sent.some((r) => r.url === '/api/analytics' && r.method === 'POST')).toBe(true);
  });

  it("control: with the switch 'true', submitting the hero's form IS seen as a POST to /api/marketing/subscribe", async () => {
    vi.stubEnv(FLAG, 'true');
    const { GuestLandingHero, EmailCapture, stopAnalytics } = await loadHero();
    stop = stopAnalytics;
    // The hero's own tree, called as a function inside a host render, so its children can be found as elements.
    const hero = drive(() => GuestLandingHero());
    const [capture] = findAll(hero.tree, (el) => el.type === EmailCapture);
    expect(capture, 'the hero renders the form with the switch on').toBeTruthy();

    const form = drive(() => EmailCapture(capture.props), [(tree) => typeInto(field(tree, /you@email/), 'fan@example.com')]);
    const [submit] = findAll(form.tree, (el) => el.type === 'form');
    await submit.props.onSubmit({ preventDefault() {} });
    await vi.advanceTimersByTimeAsync(0);

    expect(sent.filter((r) => r.method === 'POST' && SIGNUP.test(r.url))).toEqual([
      { via: 'fetch', method: 'POST', url: '/api/marketing/subscribe' },
    ]);
  });
});
