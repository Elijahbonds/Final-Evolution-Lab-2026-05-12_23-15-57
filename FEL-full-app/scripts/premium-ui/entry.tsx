// PREMIUM-UI rig scenes (lane/premium-ui, 2026-10-27): the top screens, with no server. The same mechanism as the
// accessibility rig (scripts/a11y/entry.tsx, which this copies rather than imports so neither rig's scene list can break
// the other): each scene calls the REAL page module with the server stubbed (scripts/a11y/rig.mts), awaits any async
// server component in the tree, and renders it between the real StatusRail and TabBar, as app/layout.tsx does.
//
// Scenes (location.hash): landing play train profile learn coach todaydrill screenresults devui endscreen endloss playbook education
import { Fragment, cloneElement, createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { StatusRail } from '@/components/shell/status-rail';
import { TabBar } from '@/components/shell/tab-bar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each page takes its own props; the scene supplies them
type PageModule = { default: (props: any) => Promise<ReactNode> | ReactNode };

/** The Quick Screen's results, from the same synthetic session its own test grades (lib/screen/results-view.test.tsx). */
async function screenResults(): Promise<PageModule> {
  const [{ ResultsView }, { ScreenFrame }, { gradeSession }, replay, { summarize }] = await Promise.all([
    import('@/app/play/mirror/assess/_components/results-view'),
    import('@/app/play/mirror/assess/_components/screen-ui'),
    import('@/lib/assess/runner'),
    import('@/lib/assess/replay'),
    import('@/lib/screen/checks'),
  ]);
  const cal = replay.syntheticCalibration();
  const r = gradeSession({
    calibration: cal, T1: { front: replay.ohsFront({ kneeInL: 0.06 }).frames, side: replay.ohsSide().frames },
    T2: { left: replay.kneeWall('left').frames, right: replay.kneeWall('right', { tibiaMax: 38.5 }).frames },
    T3: { left: replay.singleLegSquat('left').frames, right: replay.singleLegSquat('right').frames },
    T5: replay.cmj([0, 1, 2].map(() => ({ heightM: 0.42 }))).frames,
  });
  const summary = summarize(r)!;
  return { default: () => h(ScreenFrame, null, h(ResultsView, { summary, age: '18+', onClear: () => {}, onRunAgain: () => {} })) };
}

const SCENES: Record<string, { path: string; signedIn: boolean; load: () => Promise<PageModule>; props?: Record<string, unknown> }> = {
  landing: { path: '/', signedIn: false, load: () => import('@/app/page'), props: { searchParams: {} } },
  play: { path: '/play', signedIn: true, load: () => import('@/app/play/page') },
  train: { path: '/train', signedIn: true, load: () => import('@/app/train/page') },
  profile: { path: '/profile', signedIn: true, load: () => import('@/app/profile/page') },
  learn: { path: '/learn', signedIn: true, load: () => import('@/app/learn/page') },
  playbook: { path: '/education/playbook', signedIn: true, load: () => import('@/app/education/playbook/page') },
  education: { path: '/education', signedIn: true, load: () => import('@/app/education/page') },
  coach: { path: '/coach', signedIn: true, load: () => import('@/app/coach/page') },
  todaydrill: { path: '/train/today-drill', signedIn: true, load: () => import('@/app/train/today-drill/page') },
  screenresults: { path: '/play/mirror/assess/results', signedIn: false, load: screenResults },
  devui: { path: '/dev/ui', signedIn: true, load: () => import('@/app/dev/ui/page') },
  // a game's end-of-run card, from its own dev fixture (P5: game menus)
  endscreen: { path: '/dev/end-screen', signedIn: true, load: () => import('@/app/dev/end-screen/page'), props: { searchParams: { case: 'win' } } },
  endloss: { path: '/dev/end-screen', signedIn: true, load: () => import('@/app/dev/end-screen/page'), props: { searchParams: { case: 'loss' } } },
};

const w = window as unknown as Window & { __PATH: string; __SESSION: unknown; __SCENE: string };
const scene = (location.hash.slice(1).split('?')[0] || 'play');
const cfg = SCENES[scene] ?? SCENES.play;
w.__SCENE = scene;
w.__PATH = cfg.path;
w.__SESSION = cfg.signedIn ? { user: { id: 'u1', name: 'Jordan Reyes', email: 'jordan@example.com' }, expires: '2099-01-01' } : null;
try { localStorage.clear(); } catch { /* a fresh page anyway */ }

// Every API answers "nothing yet": the page's empty state, which is what a new account sees.
const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  if (!path.startsWith('/api/')) return realFetch(input, init);   // the rig's own files (images, models) come from the server
  if (path === '/api/profile') return Response.json({ profile: { xp: 0 }, role: 'user', prq: null });
  if (path === '/api/health/consent') return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json({});
}) as typeof fetch;

/** Await every async server component in the tree (they cannot render on the client), leaving client components alone. */
async function resolveTree(node: ReactNode): Promise<unknown> {
  if (Array.isArray(node)) return Promise.all(node.map((n) => resolveTree(n as ReactNode)));
  if (!isValidElement(node)) return node as unknown as string;
  const el = node as ReactElement<Record<string, unknown>>;
  const type = el.type as unknown;
  if (typeof type === 'function' && type.constructor?.name === 'AsyncFunction') {
    return resolveTree((await (type as (p: unknown) => Promise<unknown>)(el.props)) as ReactNode);
  }
  const props: Record<string, unknown> = {};
  let changed = false;
  for (const [k, v] of Object.entries(el.props ?? {})) {
    if (k === 'children' || isValidElement(v) || Array.isArray(v)) { props[k] = await resolveTree(v as ReactNode); changed = true; }
  }
  return changed ? cloneElement(el, props) : el;
}

(async () => {
  const mod = await cfg.load();
  const raw: unknown = await (mod.default(cfg.props ?? {}) as unknown as Promise<unknown>);
  const tree = (await resolveTree(raw as ReactNode)) as ReactNode;
  createRoot(document.getElementById('root')!).render(h(Fragment, null, h(StatusRail), tree, h(TabBar)));
  setTimeout(() => { document.body.dataset.a11yReady = '1'; }, 1600);
})().catch((e) => { document.body.dataset.a11yError = String(e?.stack ?? e); });
