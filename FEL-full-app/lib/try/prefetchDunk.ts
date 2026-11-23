// prefetchDunk — the first dunk starts loading while a first-time visitor gives the birth date (improve-screens, phase 2 of
// docs/IMPROVE-10-PHASE-AUDIT.md; owner 2026-11-22: "Do a 10 phase pass improving the areas that need it most").
//
// WHAT WAS MEASURED (scripts/probes/improve-audit/firstvisit.mts, the phone tier): nothing of the dunk loaded while the visitor
// answered /try's birth date; after CONTINUE the guest waited 41 s for TAP TO START, and about 56 s from the home page to playing.
//
// WHAT THIS DOES, once /try's birth-date step is up (components/games/guest-dunk-shell.tsx):
//   1. fetches the dunk stage's code chunk into the browser cache (the same `import()` next/dynamic makes at mount; it defines
//      modules and starts nothing: no engine, no scene, no sound);
//   2. GETs the static files the first dunk asks for first (DUNK_FIRST_FILES: public/ files every visitor of the dunk gets),
//      with no cookies (`credentials: 'omit'`), no body and no query string, so the cache holds them when the dunk asks.
// Nothing about the visitor is sent: no year, no answer, no id, no analytics; the answer itself still gates everything that
// carries data (the guest row, play_now_click) exactly as before. A visitor turned away never uses what was fetched.
// Each step waits for an idle moment, so a person typing the date is not slowed. Once per page.
//
// Knob `try.prefetchDunk` (lib/feel-panel/knobs.ts): 1 = this; 0 = today exactly (no request at all before the answer).
// assumption: fetching static files before the answer is not data collection (the plan's §7 assumption): every request is a
// GET of a file any visitor's dunk loads, carrying nothing about this visitor. If the owner reads it otherwise, set it to 0.
import { feel } from '@/lib/feel-panel/feel';

/** try.prefetchDunk: 1 starts the guest dunk's code and first files while the birth date is asked; 0 = nothing until the answer. */
export const TRY_PREFETCH_DUNK = 1;

export const tryPrefetchDunk = (): boolean => feel('try.prefetchDunk', TRY_PREFETCH_DUNK) >= 0.5;

/**
 * The static files the guest dunk asks for first, in the order it asks (measured 2026-11-22: scripts/probes/improve-screens/trydunk.mts,
 * the requests between CONTINUE and TAP TO START on today's /try, phone tier, three runs alike; about 5.6 MB). A first-time visitor's
 * court is Venice (lib/babylon/nexus/courtLocations.ts readCourtLocation's default), so these are the same for every first visit.
 * Only paths under public/: never an API route (the hero-body and MC-lines reads stay where they are, after the answer), never a
 * query string. Fonts and code are left to the code chunk (their names carry the build's hash).
 */
export const DUNK_FIRST_FILES: readonly string[] = [
  '/backdrops/baked/beach.jpg',
  '/models/navmesh/venice-blue-court.json',
  '/models/meshy/hoop.glb',
  '/models/props/venice/env2/palm_hero_lod0.glb',
  '/models/props/venice/env2/palm_hero_lod1.glb',
  '/models/props/venice/env2/palm_hero_lod2.glb',
  '/models/props/venice/env2/venice_boardwalk_kit.glb',
  '/models/props/venice/env2/venice_crowd_cards.glb',
  '/loaders/draco/draco_decoder.wasm',
  '/loaders/draco/draco_wasm_wrapper.js',
  '/models/kits/sets/fel-kit-male.shorts1p.glb',
  '/models/kits/sets/fel-kit-male.jerseys.glb',
  '/models/candidates/fel-kit-male.mobile.glb',
  '/models/skins/light-male-1024.jpg',
  '/models/skins/detail-normal-1024.jpg',
  '/models/meshy/ball-basketball.glb',
  '/backdrops/venice-sky-sunset.jpg',
];

/** A path this module may prefetch: a public/ file (no API route, no query, no fragment, no other origin). */
export function isStaticFile(path: string): boolean {
  return /^\/(?!api\/|_next\/data\/)[A-Za-z0-9._\-/]+\.[a-z0-9]{2,5}$/.test(path) && !path.includes('..');
}

export interface PrefetchDeps {
  /** Load the dunk stage's code chunk (the default: the same import next/dynamic makes). */
  loadCode: () => Promise<unknown>;
  /** GET one file into the cache. */
  get: (path: string) => Promise<unknown>;
  /** Run a step when the page is idle. */
  idle: (fn: () => void) => void;
}

const defaultIdle = (fn: () => void): void => {
  const w = typeof window !== 'undefined' ? (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }) : null;
  if (w?.requestIdleCallback) w.requestIdleCallback(fn, { timeout: 1500 }); else setTimeout(fn, 200);
};

export const defaultDeps: PrefetchDeps = {
  loadCode: () => import('@/components/games/dunk-babylon'),
  get: (path) => fetch(path, { method: 'GET', credentials: 'omit', cache: 'default', priority: 'low' } as RequestInit).then((r) => r.arrayBuffer()),
  idle: defaultIdle,
};

let started = false;
/** Test only. */
export function resetPrefetchDunkForTests(): void { started = false; }

/**
 * Start the prefetch once per page, if the knob is on. Returns whether it started now. Failures are swallowed: a prefetch
 * that does not land only means the dunk loads as it does today.
 */
export function prefetchDunk(deps: PrefetchDeps = defaultDeps, files: readonly string[] = DUNK_FIRST_FILES): boolean {
  if (started || !tryPrefetchDunk()) return false;
  started = true;
  deps.idle(() => {
    void deps.loadCode().catch(() => {}).then(() => {
      const list = files.filter(isStaticFile);
      let i = 0;
      // two at a time, each when idle: the step stays responsive and the files arrive in the order the dunk asks for them
      const next = (): void => {
        const path = list[i++];
        if (path === undefined) return;
        deps.idle(() => { void Promise.resolve().then(() => deps.get(path)).catch(() => {}).then(next); });
      };
      next(); next();
    });
  });
  return true;
}
