// PERF-834-LCP (a), PL-1 (2026-10-29): /try's age-step buttons are in the server HTML before React attaches their handlers (DIAG Q1:
// a tap at ~2 s was dropped). Until the shell has mounted, "Play without saving" and Continue are disabled with a "Loading…" status
// beside them; after mount both are live and the status is gone. The button's text never changes (guest-dunk-shell.test matches it).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { drive, findAll } from '@/tests/helpers/driveRender';

const fx = vi.hoisted(() => ({ effects: [] as Array<() => unknown> }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  const useEffect = ((effect: () => unknown) => { fx.effects.push(effect); }) as typeof actual.useEffect;
  const base = ((actual as unknown as { default?: typeof actual }).default ?? actual) as typeof actual;
  return { ...actual, useEffect, default: { ...base, useEffect } };
});
vi.mock('next/dynamic', () => ({ default: () => function Stage() { return null; } }));
vi.mock('@/lib/analytics', () => ({ track: () => {}, flush: async () => {} }));

import { GuestDunkShell } from './guest-dunk-shell';

beforeEach(() => {
  vi.stubGlobal('document', { cookie: '' });
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {} });
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}')));
});
afterEach(() => { vi.unstubAllGlobals(); });

const button = (html: string, text: string) => (html.match(new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*${text}(?:(?!</button>)[\\s\\S])*</button>`)) ?? [''])[0];
const isDisabled = (tag: string) => /<button[^>]*\sdisabled=""/.test(tag);

describe('PL-1: /try age step is not tappable before hydration', () => {
  it('server render (no effects): both buttons disabled, the Loading… status is up, the text is exactly "Play without saving"', () => {
    fx.effects.length = 0;
    const html = renderToStaticMarkup(createElement(GuestDunkShell, { challengeCode: 'C1' }));
    const play = button(html, 'Play without saving'), cont = button(html, 'Continue');
    expect(play).not.toBe(''); expect(cont).not.toBe('');
    expect(isDisabled(play)).toBe(true); expect(isDisabled(cont)).toBe(true);
    expect(play).toContain('aria-busy="true"');
    expect(html).toMatch(/<p role="status"[^>]*>Loading…<\/p>/);
  });
  it('after mount (effects run): both enabled, the status gone, the same button text', () => {
    const r = drive(() => { fx.effects.length = 0; return GuestDunkShell({ challengeCode: 'C1' }); }, [
      () => { for (const e of fx.effects.splice(0)) e(); },
    ]);
    const play = button(r.html, 'Play without saving'), cont = button(r.html, 'Continue');
    expect(isDisabled(play)).toBe(false); expect(isDisabled(cont)).toBe(false);
    expect(r.html).not.toContain('Loading…');
    const el = findAll(r.tree, (e) => e.type === 'button' && e.props.children === 'Play without saving');
    expect(el).toHaveLength(1);
  });
});
