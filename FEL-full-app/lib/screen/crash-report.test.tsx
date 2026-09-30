// SCREEN-FIX-2 amend 4 (FE PM + Research, 11:50 AM PT): CRASH REPORTING OFF ON THE QUICK SCREEN, the recovery screen
// kept. The app's catchers POST a crash to /api/telemetry/crash: the /play boundary (components/reliability, mounted
// for every /play route by app/play/layout.tsx) and the root screen (app/global-error.tsx). On the screen's paths:
//   · the screen's own boundary (app/screen/layout.tsx, app/play/mirror/assess/layout.tsx) catches a crash in its pages
//     first, shows the same recovery screen, and reports nothing (its "back" goes to /screen, never the hub);
//   · the root screen skips the report when the path is a Quick Screen path (components/providers.tsx isQuickScreenPath).
// A crash anywhere else still reports, as before.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidElement, type ReactElement, type ReactNode } from 'react';

// GlobalError's only hook is its reporting effect: capture it and run it by hand (the pattern of
// components/reliability/global-error-boundary.test.tsx), so no DOM is needed.
const effects: Array<() => void> = [];
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return { ...actual, useEffect: (fn: () => void) => { effects.push(fn); } };
});

import GlobalError from '@/app/global-error';
import PlayLayout from '@/app/play/layout';
import AssessLayout from '@/app/play/mirror/assess/layout';
import ScreenLayout from '@/app/screen/layout';
import { ScreenErrorBoundary } from '@/app/play/mirror/assess/_components/screen-error-boundary';
import { CrashScreen, GlobalErrorBoundary } from '@/components/reliability/global-error-boundary';
import { isQuickScreenPath } from '@/components/providers';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); effects.length = 0; });

const crash = () => Object.assign(new Error('boom in the screen'), { digest: '42' });
/** Every quick-screen address a crash can happen on. */
const SCREEN_PATHS = ['/screen', '/screen/privacy', '/screen/program/correctives', '/screen/program/posture', '/screen/program/dunking',
  '/play/mirror/assess', '/play/mirror/assess/results'];

function quiet(path: string) {
  const fetchMock = vi.fn((_u: string, _i?: RequestInit) => Promise.resolve(new Response('{}')));
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('location', { pathname: path, assign: vi.fn(), reload: vi.fn() });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  return fetchMock;
}

describe('a crash on the Quick Screen sends nothing', () => {
  it.each(SCREEN_PATHS)('%s: the screen\'s own boundary catches it, shows the recovery screen and reports nothing', (path) => {
    const fetchMock = quiet(path);
    expect(isQuickScreenPath(path)).toBe(true);
    const b = new ScreenErrorBoundary({ children: null });
    b.state = ScreenErrorBoundary.getDerivedStateFromError(crash());
    b.componentDidCatch(crash());
    const fallback = b.render() as ReactElement<{ onHome: () => void }>;
    expect(fallback.type).toBe(CrashScreen);
    fallback.props.onHome();
    expect((location as unknown as { assign: ReturnType<typeof vi.fn> }).assign).toHaveBeenCalledWith('/screen');   // never the hub
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(SCREEN_PATHS)('%s: a crash that takes down the root layout: the root screen shows, and reports nothing', (path) => {
    const fetchMock = quiet(path);
    const doc = GlobalError({ error: crash(), reset: () => {} });
    expect(isValidElement(doc)).toBe(true);
    expect(effects).toHaveLength(1);
    effects[0]();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('the screen\'s boundary is the one closest to its pages: both screen layouts mount it, inside the /play boundary', () => {
    for (const Layout of [AssessLayout, ScreenLayout]) {
      const tree = Layout({ children: 'page' }) as ReactElement<{ children: ReactNode }>;
      expect(tree.type).toBe(ScreenErrorBoundary);
      expect(tree.props.children).toBe('page');
    }
    // /play/mirror/assess sits under the /play layout, whose boundary reports: the screen's is nested inside it, so
    // React hands a crash in the screen's pages to the screen's boundary first
    expect((PlayLayout({ children: null }) as ReactElement).type).toBe(GlobalErrorBoundary);
  });
});

describe('a crash anywhere else still reports', () => {
  it.each(['/', '/try', '/profile', '/play/dunk', '/play/mirror', '/screening'])('%s: the root screen reports once', (path) => {
    const fetchMock = quiet(path);
    GlobalError({ error: crash(), reset: () => {} });
    effects[0]();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/telemetry/crash');
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body))).toMatchObject({ path, caughtBy: 'root' });
  });

  it('the /play boundary still reports a mode\'s crash', () => {
    const fetchMock = quiet('/play/dunk');
    new GlobalErrorBoundary({ children: null }).componentDidCatch(crash(), { componentStack: '' } as never);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
