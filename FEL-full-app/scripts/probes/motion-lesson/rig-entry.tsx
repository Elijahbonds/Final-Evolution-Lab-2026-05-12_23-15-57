// EDU-05 motion lessons: the rig's page (scripts/probes/motion-lesson/rig.mts bundles it with the a11y rig's builder and
// serves it with public/, so the stage loads the real bodies and the real Babylon code). No Next server. Scene = hash:
//   #page             the REAL /teach/motion page module for an owner (role admin), between the real StatusRail and TabBar
//   #soon             the same page for an ordinary signed-in account (the dark answer)
//   #player:<sample>  the real MotionPlayer alone, on one of the preview's lessons (the committed FILE, decoded here)
// ?body=male|female|scan answers the hero-body read as the server would for that account; without it the guest's 401
// (the male kit). On a player scene the rig swaps the lesson on the same stage:
//   window.__rig.setLesson(sample, variant)   variant: 'file' the committed file · 'live' the adapter run HERE, in the
//   browser, on the take's frames (fetched from /__fixtures) · 'raw' the same with BlazePose's points as they come (no leg
//   fit, no pelvis lift, no flight: the "before" of the contact sheet)
import { Fragment, cloneElement, createElement as h, isValidElement, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { StatusRail } from '@/components/shell/status-rail';
import { TabBar } from '@/components/shell/tab-bar';
import { MotionPlayer } from '@/components/motion-lesson/motion-player';
import type { MotionLesson } from '@/lib/motion-lesson/format';
import { framesToRecording, recordingToKeys } from '@/lib/motion-lesson/adapter';
import { loadSample } from '@/lib/motion-lesson/samples';
import { SAMPLE_TAKES, buildSampleLesson, type TakeFile } from '@/lib/motion-lesson/sampleSpecs';

type Variant = 'file' | 'live' | 'raw';
const w = window as unknown as Window & { __PATH: string; __SESSION: unknown; __rig: Record<string, unknown> };
const [scene, arg = 'low-jumps'] = decodeURIComponent(location.hash.replace('#', '')).split(':');
const body = new URLSearchParams(location.search).get('body');
w.__PATH = '/teach/motion';
w.__SESSION = { user: { id: 'u1', name: 'Jordan Reyes', email: 'jordan@example.com', role: scene === 'soon' ? 'user' : 'admin' }, expires: '2099-01-01' };
try { localStorage.clear(); } catch { /* a fresh page anyway */ }

const realFetch = window.fetch.bind(window);
window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const u = new URL(url, location.href);
  if (u.pathname === '/api/v1/hero-body' && body) return Response.json({ body: body === 'scan' ? 'scan' : body === 'female' ? 'kit-female' : 'kit-male', frame: null, palette: null, scanOwned: body === 'scan' });
  if (u.pathname === '/api/profile') return Response.json({ profile: { xp: 0 }, role: 'user', prq: null });
  if (u.pathname.startsWith('/api/v1/')) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (u.pathname.startsWith('/api/')) return Response.json({});
  return realFetch(input, init);
}) as typeof fetch;

/** Await every async server component in the tree (as scripts/a11y/entry.tsx does), leaving client components alone. */
async function resolveTree(node: ReactNode): Promise<unknown> {
  if (Array.isArray(node)) return Promise.all(node.map((n) => resolveTree(n as ReactNode)));
  if (!isValidElement(node)) return node as unknown as string;
  const el = node as ReactElement<Record<string, unknown>>;
  const type = el.type as unknown;
  if (typeof type === 'function' && type.constructor?.name === 'AsyncFunction') return resolveTree((await (type as (p: unknown) => Promise<unknown>)(el.props)) as ReactNode);
  const props: Record<string, unknown> = {};
  let changed = false;
  for (const [k, v] of Object.entries(el.props ?? {})) {
    if (k === 'children' || isValidElement(v) || Array.isArray(v)) { props[k] = await resolveTree(v as ReactNode); changed = true; }
  }
  return changed ? cloneElement(el, props) : el;
}

async function lessonOf(sample: string, variant: Variant): Promise<MotionLesson> {
  const file = await loadSample(sample);
  if (!file) throw new Error(`no sample ${sample}`);
  if (variant === 'file') return file;
  const take = (await (await realFetch(`/__fixtures/${SAMPLE_TAKES[sample].fixture}.json`)).json()) as TakeFile;
  if (variant === 'live') return buildSampleLesson(sample, take);
  const rec = framesToRecording(take.frames, { raw: true });
  if (!rec) throw new Error('no body');
  const { keys, duration } = recordingToKeys(rec);
  return { ...file, keys, duration: Math.round(duration * 100) / 100 };
}

function PlayerScene() {
  const [shown, setShown] = useState<{ id: string; lesson: MotionLesson } | null>(null);
  useEffect(() => {
    const set = async (sample: string, variant: Variant = 'file') => { const lesson = await lessonOf(sample, variant); setShown({ id: `${sample}.${variant}`, lesson }); return { keys: lesson.keys.length, duration: lesson.duration }; };
    w.__rig = { ...w.__rig, setLesson: set, lessonOf };
    void set(arg, 'file');
  }, []);
  return h('main', { className: 'mx-auto w-full max-w-3xl px-5 pt-6' }, h('h1', { className: 'sr-only' }, 'Motion lesson'), shown ? h(MotionPlayer, { lessonId: shown.id, lesson: shown.lesson }) : null);
}

(async () => {
  w.__rig = { scene, arg, body };
  const root = createRoot(document.getElementById('root')!);
  if (scene === 'player') { root.render(h(PlayerScene)); }
  else {
    const mod = await import('@/app/teach/motion/page');
    const raw: unknown = await (mod.default() as unknown as Promise<unknown>);
    root.render(h(Fragment, null, h(StatusRail), (await resolveTree(raw as ReactNode)) as ReactNode, h(TabBar)));
  }
  setTimeout(() => { document.body.dataset.a11yReady = '1'; }, 1200);
})().catch((e) => { document.body.dataset.a11yError = String(e?.stack ?? e); });
