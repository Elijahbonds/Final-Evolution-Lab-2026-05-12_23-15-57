// Mount a component's hooks in a test that has no DOM, and COUNT its renders (MIRROR-FIRST P1, 2026-10-07).
//
// vitest runs in node here (no jsdom, and no new dependency for one), so driveRender.ts can press buttons only inside a
// server render, and nothing stays mounted: an effect never runs, a timer's setState goes nowhere, and "how many times
// does the Mirror re-render while the camera is live" cannot be asked. This is the smallest hooks runtime that can: one
// component, called as a function, its useState / useRef / useEffect / useCallback / useMemo / useSyncExternalStore
// kept between renders, effects run after each render (cleanups on a deps change and on unmount), and updates BATCHED
// to one re-render per microtask — the way React 18 batches every setState made in one task (one camera frame here).
// The child components in the returned tree are not rendered (they are elements, not calls), which is exactly the
// component's own render cost.
//
// Use it by mocking React in the test file (vi.mock is hoisted, so the helper is imported inside the factory):
//
//   vi.mock('react', async (importOriginal) =>
//     (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));
//
// Outside mount() every hook is React's own, so the rest of the file's imports load and render normally.
import type * as ReactModule from 'react';

type Deps = readonly unknown[] | undefined;
interface EffectSlot { deps: Deps; cleanup?: (() => void) | void; pending?: () => (() => void) | void }

const sameDeps = (a: Deps, b: Deps) =>
  !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));

class Instance {
  slots: unknown[] = [];
  idx = 0;
  renders = 0;
  tree: unknown = null;
  dead = false;
  private scheduled = false;
  private effects: EffectSlot[] = [];

  constructor(private readonly render: () => unknown) {}

  run(): void {
    if (this.dead) return;
    current = this;
    this.idx = 0;
    this.effects = [];
    try { this.tree = this.render(); } finally { current = null; }
    this.renders += 1;
    for (const e of this.effects) {
      if (!e.pending) continue;
      if (typeof e.cleanup === 'function') e.cleanup();
      e.cleanup = e.pending();
      e.pending = undefined;
    }
  }

  schedule(): void {
    if (this.scheduled || this.dead) return;
    this.scheduled = true;
    queueMicrotask(() => { this.scheduled = false; this.run(); });
  }

  slot<T>(init: () => T): { value: T } {
    const i = this.idx++;
    if (!(i in this.slots)) this.slots[i] = { value: init() };
    return this.slots[i] as { value: T };
  }

  effect(fn: () => (() => void) | void, deps: Deps): void {
    const s = this.slot<EffectSlot>(() => ({ deps: undefined })).value;
    if (this.renders === 0 || !sameDeps(s.deps, deps)) { s.pending = fn; s.deps = deps; }
    this.effects.push(s);
  }

  unmount(): void {
    this.dead = true;
    for (const s of this.slots) {
      const e = (s as { value?: EffectSlot }).value;
      if (e && typeof e === 'object' && 'cleanup' in e && typeof e.cleanup === 'function') e.cleanup();
    }
  }
}

let current: Instance | null = null;

export interface Mounted {
  /** Renders so far (the first one included). */
  readonly renders: number;
  /** The tree the last render returned. */
  readonly tree: unknown;
  unmount(): void;
}

/** Mount `render` (which calls the component as a function, e.g. `() => MirrorHarness({})`): one render, then effects. */
export function mount(render: () => unknown): Mounted {
  const inst = new Instance(render);
  inst.run();
  return {
    get renders() { return inst.renders; },
    get tree() { return inst.tree; },
    unmount: () => inst.unmount(),
  };
}

export function hookedReact(actual: typeof ReactModule): typeof ReactModule {
  const base = ((actual as unknown as { default?: typeof ReactModule }).default ?? actual) as typeof ReactModule;
  const pick = <K extends keyof typeof ReactModule>(k: K, mine: (typeof ReactModule)[K]): (typeof ReactModule)[K] =>
    ((...args: unknown[]) => (current ? (mine as (...a: unknown[]) => unknown) : (actual[k] as (...a: unknown[]) => unknown))(...args)) as (typeof ReactModule)[K];

  const useState = pick('useState', ((initial: unknown) => {
    const inst = current!;
    const s = inst.slot(() => ({
      v: typeof initial === 'function' ? (initial as () => unknown)() : initial,
      set: null as null | ((n: unknown) => void),
    })).value;
    s.set ??= (next: unknown) => {
      const v = typeof next === 'function' ? (next as (p: unknown) => unknown)(s.v) : next;
      if (Object.is(v, s.v)) return;
      s.v = v;
      inst.schedule();
    };
    return [s.v, s.set];
  }) as typeof ReactModule.useState);

  const useRef = pick('useRef', ((initial: unknown) => current!.slot(() => ({ current: initial })).value) as typeof ReactModule.useRef);

  const useMemo = pick('useMemo', ((fn: () => unknown, deps: Deps) => {
    const s = current!.slot(() => ({ deps: undefined as Deps, v: undefined as unknown, set: false })).value;
    if (!s.set || !sameDeps(s.deps, deps)) { s.v = fn(); s.deps = deps; s.set = true; }
    return s.v;
  }) as typeof ReactModule.useMemo);

  const useCallback = pick('useCallback', ((fn: unknown, deps: Deps) => {
    const s = current!.slot(() => ({ deps: undefined as Deps, v: undefined as unknown, set: false })).value;
    if (!s.set || !sameDeps(s.deps, deps)) { s.v = fn; s.deps = deps; s.set = true; }
    return s.v;
  }) as typeof ReactModule.useCallback);

  const useEffect = pick('useEffect', ((fn: () => (() => void) | void, deps: Deps) => current!.effect(fn, deps)) as typeof ReactModule.useEffect);
  const useLayoutEffect = pick('useLayoutEffect', ((fn: () => (() => void) | void, deps: Deps) => current!.effect(fn, deps)) as typeof ReactModule.useLayoutEffect);

  const useSyncExternalStore = pick('useSyncExternalStore', ((subscribe: (cb: () => void) => () => void, getSnapshot: () => unknown) => {
    const inst = current!;
    const s = inst.slot(() => ({ v: getSnapshot() })).value;
    s.v = getSnapshot();
    inst.effect(() => subscribe(() => { if (!Object.is(getSnapshot(), s.v)) inst.schedule(); }), [subscribe, getSnapshot]);
    return s.v;
  }) as typeof ReactModule.useSyncExternalStore);

  const hooks = { useState, useRef, useMemo, useCallback, useEffect, useLayoutEffect, useSyncExternalStore };
  return { ...actual, ...hooks, default: { ...base, ...hooks } } as typeof ReactModule;
}
