// The app root's session provider (SCREEN-SHIP, Squad gate 5): on the Quick Screen's paths, a fixed signed-out session
// and NO next-auth SessionProvider (which would fetch /api/auth/session and write `nextauth.message` to localStorage as
// the page loads); everywhere else, the same SessionProvider as before.
import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const m = vi.hoisted(() => ({ path: '/', providerMounts: 0 }));
vi.mock('next/navigation', async (orig) => ({ ...(await orig<typeof import('next/navigation')>()), usePathname: () => m.path }));
vi.mock('next-auth/react', async (orig) => {
  const real = await orig<typeof import('next-auth/react')>();
  return {
    ...real,
    SessionProvider: ({ children }: { children: React.ReactNode }) => {
      m.providerMounts++;
      return createElement(real.SessionContext.Provider, { value: { data: null, status: 'loading', update: async () => null } }, children);
    },
  };
});

import { useSession } from 'next-auth/react';
import { Providers, isQuickScreenPath } from './providers';

function Status() {
  const { status } = useSession();
  return createElement('span', null, status);
}
const render = (path: string) => { m.path = path; m.providerMounts = 0; return renderToStaticMarkup(createElement(Providers, null, createElement(Status))); };

describe('isQuickScreenPath', () => {
  it('is the screen\'s own paths, and nothing else', () => {
    for (const p of ['/screen', '/screen/', '/screen/program/dunking', '/play/mirror/assess', '/play/mirror/assess/results']) expect(isQuickScreenPath(p), p).toBe(true);
    for (const p of ['/', '/play/mirror', '/play/brain-brawl', '/screening', '/play/mirror/assessment', '/try', '/screens']) expect(isQuickScreenPath(p), p).toBe(false);
  });
});

describe('Providers', () => {
  it('on a screen path: no SessionProvider (no session fetch, no broadcast), a signed-out session', () => {
    expect(render('/play/mirror/assess')).toContain('unauthenticated');
    expect(m.providerMounts).toBe(0);
    expect(render('/screen/program/posture')).toContain('unauthenticated');
    expect(m.providerMounts).toBe(0);
  });

  it('everywhere else: the SessionProvider, as before', () => {
    expect(render('/play/brain-brawl')).toContain('loading');
    expect(m.providerMounts).toBe(1);
    render('/play/mirror');
    expect(m.providerMounts).toBe(1);
  });
});
