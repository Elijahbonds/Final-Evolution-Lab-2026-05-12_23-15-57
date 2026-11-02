// The readability rig's scenes (lane/readable, 2026-11-02; docs/READABLE.md). The rig (scripts/readable/audit.mts) writes a
// small entry into its build folder that imports EVERY app/**/page.tsx (and each route's nested layouts) and hands them
// to boot() below, so a new route is audited the day it lands. The mechanism is the accessibility rig's
// (scripts/a11y/entry.tsx): the real page module, the server stubbed (scripts/a11y/rig.mts: no session cookie, every
// database query empty, every API "nothing yet"), any async server component awaited, rendered between the real StatusRail
// and TabBar as app/layout.tsx does. So the audit reads the markup the app ships: a new account's empty state.
//
// Two scenes are the rig's own:
//   #__plant          the probe's control: known-bad text next to known-good (docs/READABLE.md, "Validating the rig")
//   #__hud?frame=<f>  the shared TV HUD pieces (scorebug, banner, hint line, meter, lower third) over a real backdrop,
//                     because the 3D scene itself cannot draw in this container (no WebGL); ?tv=1 is 1080p at zoom 2.25
import { Component, Fragment, cloneElement, createElement as h, isValidElement, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { StatusRail } from '@/components/shell/status-rail';
import { TabBar } from '@/components/shell/tab-bar';
import { bannerCss, calloutCss, scorePopCss } from '@/lib/babylon/premium/juiceStyles';
import { HudBanner, HudChip, HudFrame, HudLine, HudMeter, HudLowerThird, ScoreCell, ScoreDivider, Scorebug } from '@/components/games/tv-hud';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each page takes its own props
type Mod = { default: (props: any) => ReactNode | Promise<ReactNode> };
export interface RouteEntry { path: string; load: () => Promise<Mod>; layouts: (() => Promise<Mod>)[] }

const w = window as unknown as Window & { __PATH: string; __SESSION: unknown; __SCENE: string };

/** Await every async server component in a tree (they cannot render on the client); client components are left alone. */
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

/** A page or layout's element: an async server component is called and awaited; anything else is rendered as a component. */
async function elementOf(mod: Mod, props: Record<string, unknown>): Promise<unknown> {
  const C = mod.default as unknown as { constructor?: { name?: string } } & ((p: unknown) => unknown);
  if (C?.constructor?.name === 'AsyncFunction') return resolveTree((await C(props)) as ReactNode);
  return h(C as unknown as (p: unknown) => ReactNode, props);
}

class Boundary extends Component<{ children: ReactNode }, { err: string | null }> {
  state = { err: null as string | null };
  static getDerivedStateFromError(e: unknown) { return { err: String((e as Error)?.message ?? e) }; }
  componentDidCatch(e: unknown) { document.body.dataset.readableError = String((e as Error)?.stack ?? e).slice(0, 600); }
  render() { return this.state.err ? null : this.props.children; }
}

const ready = (ms = 1800) => setTimeout(() => { document.body.dataset.readableReady = '1'; }, ms);

/** Route params for a dynamic segment: a plausible value, so a page that 404s on a missing record says so. */
function paramsOf(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of path.matchAll(/\[(\.\.\.)?([^\]]+)\]/g)) out[m[2]] = m[2] === 'code' ? 'ABCD' : m[2] === 'modeId' || m[2] === 'key' ? 'dunk' : 'demo';
  return out;
}

export async function boot(routes: Record<string, RouteEntry>): Promise<void> {
  const hash = decodeURIComponent(location.hash.slice(1));
  const [scene, query = ''] = hash.split('?');
  const q = new URLSearchParams(query);
  w.__SCENE = scene;
  try { localStorage.clear(); } catch { /* fresh anyway */ }
  if (q.get('rootfont')) document.documentElement.style.fontSize = `${q.get('rootfont')}%`;
  if (scene === '__plant') return plant();
  if (scene === '__hud') return hud(q.get('frame') ?? '', q.get('tv') === '1');
  if (scene === '__juice') return juice(q.get('frame') ?? '', q.get('tv') === '1', q.get('legacy') === '1');
  const r = routes[scene];
  if (!r) { document.body.dataset.readableError = `no route ${scene}`; return; }
  w.__PATH = r.path.replace(/\[(\.\.\.)?([^\]]+)\]/g, (_, __, k) => paramsOf(`[${k}]`)[k]);
  w.__SESSION = q.get('guest') === '1' ? null : { user: { id: 'u1', name: 'Jordan Reyes', email: 'jordan@example.com', role: 'user' }, expires: '2099-01-01' };
  window.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0];
    if (path === '/api/profile') return Response.json({ profile: { xp: 0 }, role: 'user', prq: null });
    if (path === '/api/auth/session') return Response.json(w.__SESSION ?? {});
    if (path === '/api/health/consent') return Response.json({ error: 'not_found' }, { status: 404 });
    return Response.json({});
  }) as typeof fetch;
  try {
    const props = { params: paramsOf(r.path), searchParams: {} };
    let tree = (await elementOf(await r.load(), props)) as ReactNode;
    for (const L of [...r.layouts].reverse()) {
      try { tree = (await elementOf(await L(), { children: tree, params: props.params })) as ReactNode; } catch { /* a layout that needs the server: the page alone */ }
    }
    createRoot(document.getElementById('root')!).render(h(Fragment, null, h(StatusRail), h(Boundary, null, tree), h(TabBar)));
    ready();
  } catch (e) {
    document.body.dataset.readableError = String((e as Error)?.stack ?? e).slice(0, 600);
  }
}

// ── The control scene ────────────────────────────────────────────────────────────────────────────────────────────────
// Every BAD element must be flagged, by exactly the rule its data-expect names, and nothing GOOD may be flagged.
function plant(): void {
  const bad = (rule: string) => ({ 'data-expect': rule });
  createRoot(document.getElementById('root')!).render(
    h('main', { style: { padding: 16, paddingBottom: 0, color: '#f2f5f9', fontFamily: 'sans-serif' } },
      h('h1', { style: { fontSize: 28, margin: '0 0 12px' } }, 'Rig control'),
      // GOOD: body text, the label step, a large dim number, a scrimmed caption over a bright photo
      h('p', { 'data-good': 1, style: { fontSize: 16, color: '#f2f5f9', margin: '0 0 8px' } }, 'Good body copy reads at sixteen pixels on the page ink, well above the contrast floor.'),
      h('p', { 'data-good': 1, style: { fontSize: 12, color: '#8b97a5', margin: '0 0 8px', textTransform: 'uppercase' } }, 'Label step 12 px'),
      h('p', { 'data-good': 1, style: { fontSize: 32, fontWeight: 700, color: '#7d8794', margin: '0 0 8px' } }, '1,240 XP'),
      h('div', { style: { position: 'relative', height: 90, backgroundImage: 'url(/backdrops/snowboard.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', marginBottom: 8 } },
        h('span', { 'data-good': 1, style: { position: 'absolute', left: 8, bottom: 8, fontSize: 16, color: '#fff', background: 'rgba(5,5,5,0.72)', padding: '2px 8px', borderRadius: 6 } }, 'Scrimmed caption over snow')),
      // BAD 1: 11 px grey #999 on white (size AND contrast, 2.85:1)
      h('div', { style: { background: '#ffffff', padding: 8, marginBottom: 8 } },
        h('span', { ...bad('tiny+contrast'), style: { fontSize: 11, color: '#999999' } }, 'Eleven pixel grey on white')),
      // BAD 2: a score clipped by its box
      h('div', { style: { width: 70, overflow: 'hidden', whiteSpace: 'nowrap', marginBottom: 8, background: '#161d27' } },
        h('span', { ...bad('clip'), style: { fontSize: 16 } }, 'Score 12,345 points')),
      // BAD 3: white text straight on a bright photo, no scrim
      h('div', { style: { position: 'relative', height: 90, backgroundImage: 'url(/backdrops/snowboard.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', marginBottom: 8 } },
        h('span', { ...bad('contrast-over-media'), style: { position: 'absolute', left: 8, top: 8, fontSize: 16, color: '#ffffff' } }, 'Bare white caption on the snow')),
      // BAD 4: two runs drawn on top of each other
      h('div', { style: { position: 'relative', height: 30, marginBottom: 8 } },
        h('span', { ...bad('collide'), style: { position: 'absolute', left: 0, top: 4, fontSize: 16 } }, 'First line here'),
        h('span', { ...bad('collide'), style: { position: 'absolute', left: 30, top: 8, fontSize: 16 } }, 'Second line on top')),
      // BAD 5: the page's last line, under a fixed bottom bar with no room left to scroll it clear
      h('div', { style: { height: 900 } }),
      h('p', { ...bad('covered'), style: { fontSize: 16, margin: 0, paddingBottom: 4 } }, 'The last line sits under the bar'),
      h('nav', { style: { position: 'fixed', left: 0, right: 0, bottom: 0, height: 64, background: '#0c0c11', borderTop: '1px solid #232c38', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        h('span', { 'data-good': 1, style: { fontSize: 14, color: '#f2f5f9' } }, 'Fixed bar')),
    ),
  );
  ready(600);
}

// ── The HUD over a frame ─────────────────────────────────────────────────────────────────────────────────────────────
function hud(frame: string, tv: boolean): void {
  const zoom = tv ? 2.25 : 1;
  document.body.style.margin = '0';
  createRoot(document.getElementById('root')!).render(
    h('div', {
      'data-readable-hud': 1,
      style: { position: 'fixed', inset: 0, overflow: 'hidden', background: frame === 'white' ? '#ffffff' : frame === 'grey' ? '#808080' : `#000 url(/backdrops/${frame}.jpg) center / cover no-repeat` },
    },
    h('div', { style: { position: 'absolute', inset: tv ? '5%' : 0, zoom, ['--fel-hud-zoom' as string]: String(zoom) } as React.CSSProperties },
      h(HudFrame, null,
        h('div', { className: 'absolute inset-x-0 top-3 flex justify-center' },
          h(Scorebug, { accent: 'you', children: null },
            h(ScoreCell, { label: 'YOU', value: 21, tone: 'you' }), h(ScoreDivider, null), h(ScoreCell, { label: 'RIVAL', value: 18, tone: 'them' }),
            h(HudChip, { label: 'SHOT', tone: 'score' }, '0:14'))),
        h('div', { className: 'absolute left-3 top-24' }, h(HudMeter, { label: 'POWER', status: 'READY', value: 72, tone: 'good' })),
        h(HudBanner, { text: 'AND ONE!' }),
        h(HudLowerThird, { cardKey: 'p2', kicker: 'UP NEXT', title: 'PLAYER 2', sub: 'DUNK 4 OF 6 · WINDMILL', enabled: true, holdMs: 1e9 }),   // held up for the shots
        h(HudLine, { text: 'HOLD to run — then tap jump' })))),
  );
  ready(900);
}

// ── JuiceKit's DOM text over a frame ─────────────────────────────────────────────────────────────────────────────────
// The banner, the score pop and the callout, with the styles JuiceKit draws (lib/babylon/premium/juiceStyles.ts).
// ?legacy=1 draws the strings JuiceKit used before lane/readable, copied verbatim, for the before → after.
const LEGACY = {
  banner: (a: string) => `position:absolute;left:50%;top:32%;font:900 clamp(28px,6vw,52px) var(--fel-font-display,ui-monospace);color:${a};letter-spacing:.06em;text-shadow:0 4px 24px rgba(0,0,0,.7),0 0 34px ${a}66;`,
  pop: (a: string) => `font:900 clamp(22px,4vw,34px) var(--fel-font-display,ui-monospace);color:${a};text-shadow:0 2px 12px rgba(0,0,0,.65),0 0 22px ${a}55;`,
  callout: (c: string) => `position:absolute;left:50%;top:68%;transform:translate(-50%,-50%);padding:4px 12px;border-radius:999px;background:rgba(5,6,10,.62);font:800 clamp(12px,1.8vw,16px) var(--fel-font-display,ui-monospace);color:${c};letter-spacing:.12em;pointer-events:none;`,
};
function juice(frame: string, tv: boolean, legacy: boolean): void {
  const zoom = tv ? 2.25 : 1;
  const root = document.getElementById('root')!;
  root.innerHTML = '';
  const bg = document.createElement('div');
  bg.dataset.readableHud = '1';
  bg.style.cssText = `position:fixed;inset:0;overflow:hidden;background:${frame === 'white' ? '#fff' : frame === 'grey' ? '#808080' : `#000 url(/backdrops/${frame}.jpg) center / cover no-repeat`}`;
  const stage = document.createElement('div');
  stage.style.cssText = `position:absolute;inset:0;zoom:${zoom}`;
  const add = (text: string, css: string, extra = '') => { const el = document.createElement('div'); el.textContent = text; el.style.cssText = css + extra; stage.appendChild(el); };
  add('WAVE CLEAR', legacy ? LEGACY.banner('#22d3ee') : bannerCss('#22d3ee'), 'transform:translate(-50%,-50%);');
  add('+12 PRQ', legacy ? LEGACY.pop('#ffd75e') : scorePopCss('#ffd75e'), 'position:absolute;left:30%;top:50%;transform:translate(-50%,-50%);');
  add('WAIT FOR THE QUESTION', legacy ? LEGACY.callout('#cbd5e1') : calloutCss('#cbd5e1'));
  bg.appendChild(stage);
  root.appendChild(bg);
  ready(500);
}
