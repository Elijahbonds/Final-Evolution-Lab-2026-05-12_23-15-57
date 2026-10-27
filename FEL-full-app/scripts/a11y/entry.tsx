// The ten key pages, with no server (A11-01). Bundled by scripts/a11y/audit.mts with esbuild and loaded into headless
// Chromium. Each scene calls the REAL page module (its default export, an async server component) with the server's
// pieces stubbed — the session, the database (every query answers empty), Next's router and Link — awaits any async
// server component in the tree it returns, and renders the result between the real StatusRail and TabBar, as
// app/layout.tsx does. So the audit reads the markup the app ships, not a copy of it.
//
// Scenes (location.hash):  landing login signup play train profile learn education playbook account, and coach combine squads,
// and (P9) venues modes library programs readiness speed velocity week guidance
import { Fragment, cloneElement, createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { StatusRail } from '@/components/shell/status-rail';
import { TabBar } from '@/components/shell/tab-bar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each page takes its own props; the scene supplies them
type PageModule = { default: (props: any) => Promise<ReactNode> | ReactNode };

const SCENES: Record<string, { path: string; signedIn: boolean; load: () => Promise<PageModule>; props?: Record<string, unknown> }> = {
  landing: { path: '/', signedIn: false, load: () => import('@/app/page'), props: { searchParams: {} } },
  login: { path: '/login', signedIn: false, load: () => import('@/app/login/page'), props: { searchParams: {} } },
  signup: { path: '/signup', signedIn: false, load: () => import('@/app/signup/page'), props: { searchParams: {} } },
  play: { path: '/play', signedIn: true, load: () => import('@/app/play/page') },
  train: { path: '/train', signedIn: true, load: () => import('@/app/train/page') },
  profile: { path: '/profile', signedIn: true, load: () => import('@/app/profile/page') },
  learn: { path: '/learn', signedIn: true, load: () => import('@/app/learn/page') },
  education: { path: '/education', signedIn: true, load: () => import('@/app/education/page') },
  playbook: { path: '/education/playbook', signedIn: true, load: () => import('@/app/education/playbook/page') },
  account: { path: '/account', signedIn: true, load: () => import('@/app/account/page') },
  // the coach, combine-day and squads pages (A11-06's sweep after coach-parity #456 and combine-day #453 merged)
  coach: { path: '/coach', signedIn: true, load: () => import('@/app/coach/page') },
  combine: { path: '/coach/combine', signedIn: true, load: () => import('@/app/coach/combine/page') },
  squads: { path: '/squads', signedIn: true, load: () => import('@/app/squads/page') },
  // P9 (premium-ui, 2026-10-27): the re-audit past the ten key pages — every TabPage room the rig can render
  venues: { path: '/venues', signedIn: true, load: () => import('@/app/venues/page') },
  modes: { path: '/modes', signedIn: true, load: () => import('@/app/modes/page') },
  library: { path: '/train/library', signedIn: true, load: () => import('@/app/train/library/page') },
  programs: { path: '/train/programs', signedIn: true, load: () => import('@/app/train/programs/page') },
  readiness: { path: '/train/readiness', signedIn: true, load: () => import('@/app/train/readiness/page') },
  speed: { path: '/train/speed', signedIn: true, load: () => import('@/app/train/speed/page') },
  velocity: { path: '/train/velocity', signedIn: true, load: () => import('@/app/train/velocity/page') },
  week: { path: '/profile/week', signedIn: true, load: () => import('@/app/profile/week/page') },
  guidance: { path: '/guidance', signedIn: true, load: () => import('@/app/guidance/page') },
};

const w = window as unknown as Window & { __PATH: string; __SESSION: unknown; __SCENE: string };
const scene = (location.hash.slice(1).split('?')[0] || 'play');
const cfg = SCENES[scene] ?? SCENES.play;
w.__SCENE = scene;
w.__PATH = cfg.path;
w.__SESSION = cfg.signedIn ? { user: { id: 'u1', name: 'Jordan Reyes', email: 'jordan@example.com' }, expires: '2099-01-01' } : null;
try { localStorage.clear(); } catch { /* a fresh page anyway */ }

// Every API answers "nothing yet": the page's empty state, which is what a new account sees.
window.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  if (path === '/api/profile') return Response.json({ profile: { xp: 0 }, role: 'user', prq: null });
  // routes whose clients read a nested shape: unanswered, so the client keeps its own empty state
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
  // effects, the stubbed fetches and the entrance animations (fel-rise, framer's fades) settle before anything is read
  setTimeout(() => { document.body.dataset.a11yReady = '1'; }, 1600);
})().catch((e) => { document.body.dataset.a11yError = String(e?.stack ?? e); });
