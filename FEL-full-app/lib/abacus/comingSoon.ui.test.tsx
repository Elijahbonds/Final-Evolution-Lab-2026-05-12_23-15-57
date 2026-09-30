// ABACUS-KILL (2026-09-29): the Coach tab and the Studio while the AI switch is off, and when it is on.
// vitest runs without a DOM here, so effects never run: useAiStatus is stubbed to each state it can be in, and the
// real hook's only request (/api/ai/status) is pinned in killSwitch.test.ts. fetch is a spy in every test; with the
// switch off, not one request may go to an AI route.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { drive, field, findAll, settle, typeInto } from '@/tests/helpers/driveRender';

const ai = vi.hoisted(() => ({ state: 'loading' as 'loading' | 'available' | 'coming_soon', mark: vi.fn() }));
vi.mock('@/lib/abacus/useAiStatus', () => ({ useAiStatus: () => [ai.state, ai.mark] }));

import { CoachChat } from '@/app/coach/_components/coach-chat';
import { StudioShell, StudioWorkspace } from '@/components/studio/studio-shell';
import { AI_COMING_SOON_MESSAGE } from '@/lib/abacus/aiStatus';

const AI_ROUTE = /\/api\/(coach\/chat|cell\/(chat|compile|projects\/[^/]+\/files))\b/;
let fetchSpy: ReturnType<typeof vi.fn>;
const aiCalls = () => fetchSpy.mock.calls.map((c) => String(c[0])).filter((u) => AI_ROUTE.test(u));
const comingSoon503 = () =>
  new Response(JSON.stringify({ status: 'coming_soon', feature: 'coach', message: 'x' }), { status: 503 });

beforeEach(() => {
  ai.state = 'loading';
  ai.mark = vi.fn();
  fetchSpy = vi.fn(async () => comingSoon503());
  vi.stubGlobal('fetch', fetchSpy);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const starters = (tree: any) =>
  findAll(tree, (el) => el.type === 'button' && el.props['data-test-ignore'] === 'sends-chat-message');

describe('the Coach tab', () => {
  it('coming_soon: renders the coming-soon panel instead of the chat, and requests nothing', () => {
    ai.state = 'coming_soon';
    const html = renderToStaticMarkup(createElement(CoachChat));
    expect(html).toContain('data-ai-coming-soon="coach"');
    expect(html).toContain(AI_COMING_SOON_MESSAGE.coach);
    expect(html).not.toContain('Ask Coach Bonds anything');
    expect(html).not.toContain('<textarea');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('loading (before /api/ai/status answers): the starters and the box are disabled, and pressing one sends nothing', async () => {
    const { html, tree } = drive(() => CoachChat());
    expect(html).not.toContain('data-ai-coming-soon');
    const s = starters(tree);
    expect(s.length).toBe(4);
    for (const b of s) expect(b.props.disabled).toBe(true);
    s[0].props.onClick();
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('available: a starter still posts to /api/coach/chat (unchanged), and a 503 coming_soon answer flips to the panel', async () => {
    ai.state = 'available';
    drive(() => CoachChat(), [(tree) => starters(tree)[0].props.onClick()]);
    await settle();
    await settle();
    expect(aiCalls()).toEqual(['/api/coach/chat']);
    expect(ai.mark).toHaveBeenCalledTimes(1);
  });
});

describe('the Studio', () => {
  it('coming_soon: only the panel renders; the workspace (and its project fetches) never mounts', () => {
    ai.state = 'coming_soon';
    const html = renderToStaticMarkup(createElement(StudioShell));
    expect(html).toContain('data-ai-coming-soon="studio"');
    expect(html).toContain('coming soon');
    expect(html).not.toContain('NEXUS STUDIO');
    expect(html).not.toContain('<textarea');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('loading: no workspace yet either', () => {
    const html = renderToStaticMarkup(createElement(StudioShell));
    expect(html).not.toContain('NEXUS STUDIO');
    expect(html).not.toContain('data-ai-coming-soon');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('available: the workspace renders as before', () => {
    ai.state = 'available';
    const html = renderToStaticMarkup(createElement(StudioShell));
    expect(html).toContain('NEXUS STUDIO');
    expect(html).not.toContain('data-ai-coming-soon');
  });

  it('available: sending still posts to /api/cell/chat, and a 503 coming_soon answer hands the page back to the panel', async () => {
    ai.state = 'available';
    const onComingSoon = vi.fn();
    const box = (tree: any) => field(tree, /Describe what you want to build/);
    drive(() => StudioWorkspace({ onComingSoon }), [
      (tree) => typeInto(box(tree), 'a tiny puzzle game'),
      (tree) => box(tree).props.onKeyDown({ key: 'Enter', shiftKey: false, preventDefault() {} }),
    ]);
    await settle();
    await settle();
    expect(aiCalls()).toEqual(['/api/cell/chat']);
    expect(onComingSoon).toHaveBeenCalledTimes(1);
  });
});
