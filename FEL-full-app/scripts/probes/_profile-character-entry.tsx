// PROFILE-CHARACTER rig page (lane/profile-character, 2026-10-27). The REAL profile page modules with the server stubbed
// (scripts/probes/_profile-character.mts bundles this with esbuild and serves it with public/, so the hero GLB, its skins
// and Babylon load exactly as on the site):
//
//   #own     app/profile/page.tsx, signed in as u1, whose closet answers a saved look (hair, skin, kit, jersey)
//   #viewer  app/u/[slug]/page.tsx for an ADULT owner who chose public, seen by another signed-in account
//
// Links never navigate (the probe taps the page to time tap response). The page's own data attributes say what the
// athlete stage is showing (data-athlete-state).
import { Fragment, cloneElement, createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { StatusRail } from '@/components/shell/status-rail';
import { TabBar } from '@/components/shell/tab-bar';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each page takes its own props
type PageModule = { default: (props: any) => Promise<ReactNode> | ReactNode };

const w = window as unknown as Window & { __PATH: string; __SESSION: unknown; __DB: Record<string, Record<string, unknown>> };
const scene = location.hash.slice(1) || 'own';

/** The saved look the closet answers for u1 (the account's own body: locs, deep skin, the Bonds jersey, Glitch shorts). */
const LOOK = {
  face: { skinTone: '#8D5524', faceShape: 'Oval', hairStyle: 'Locs', hairColor: '#2B1B0E', eyeShape: 'Almond', eyeColor: '#3B2A1A', brows: 'Natural', mouth: 'Neutral', nose: 'Straight' },
  equipped: { headwear: null, tops: 'top_bonds', shorts: 'shorts_glitch', shoes: 'shoes_flight', accessory: null },
  skinCardId: null,
  jersey: { number: 23, name: 'REYES' },
};

const SCENES: Record<string, { path: string; session: unknown; load: () => Promise<PageModule>; props?: Record<string, unknown>; db?: Record<string, Record<string, unknown>> }> = {
  own: { path: '/profile', session: { user: { id: 'u1', name: 'Jordan Reyes', email: 'jordan@example.com' } }, load: () => import('@/app/profile/page'),
    db: { user: { findUnique: { id: 'u1', name: 'Jordan Reyes', dobYear: 1996, createdAt: new Date('2025-03-01T00:00:00Z') } }, avatarLook: { findUnique: { updatedAt: new Date('2026-10-20T10:00:00Z') } } } },
  viewer: { path: '/u/jordan', session: { user: { id: 'u9', name: 'Sam Lee', email: 'sam@example.com' } }, load: () => import('@/app/u/[slug]/page'), props: { params: { slug: 'jordan' } },
    db: { creatorCard: { findUnique: { ownerId: 'u1', published: true, showStats: null } }, user: { findUnique: { id: 'u1', name: 'Jordan Reyes', dobYear: 1996, createdAt: new Date('2025-03-01T00:00:00Z') } } } },
};
const cfg = SCENES[scene] ?? SCENES.own;
w.__PATH = cfg.path;
w.__SESSION = cfg.session ? { ...(cfg.session as object), expires: '2099-01-01' } : null;
w.__DB = cfg.db ?? {};

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
  if (!path.startsWith('/api/')) return realFetch(input, init);
  // the SIGNED-IN visitor's own look: in #viewer that is u9's (who has none) — the stage must never show it as u1's
  if (path === '/api/v1/closet') return scene === 'own' ? Response.json({ look: LOOK, skins: [], lookLocal: false }) : Response.json({ look: null, skins: [] });
  if (path === '/api/v1/hero-body') return Response.json({ body: 'kit-male', guest: false, frame: null, palette: null, scanOwned: false });
  if (path === '/api/profile') return Response.json({ profile: { xp: 0 }, role: 'user', prq: null });
  return Response.json({});
}) as typeof fetch;

// a tap on a link is timed, never followed
document.addEventListener('click', (e) => { const a = (e.target as Element | null)?.closest?.('a'); if (a) e.preventDefault(); }, true);

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
  document.body.dataset.rigReady = '1';
})().catch((e) => { document.body.dataset.rigError = String(e?.stack ?? e); });
