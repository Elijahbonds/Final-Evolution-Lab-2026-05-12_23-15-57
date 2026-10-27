// PLAT-P01 (2026-10-27): Start on the signature program page opens the session player, and the finish lands where it
// should — mounted with no DOM (tests/helpers/hookRuntime.ts), a fetch spy and a hand-driven clock:
//   · youth (device mode): a whole session plays with ZERO network requests, and the done mark lands in deviceProgress;
//   · the admin's draft preview plays end to end and saves nothing (no request, nothing on the phone);
//   · an adult's first Start enrolls (the existing `start` action) and the finish posts the existing `done` action.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react', async (importOriginal) => (await import('@/tests/helpers/hookRuntime')).hookedReact(await importOriginal()));

import { isValidElement, type ReactElement } from 'react';
import { mount } from '@/tests/helpers/hookRuntime';
import { ProgramPage } from '@/components/signature/program-page';
import { useSessionPlayer } from '@/components/session-player/use-session-player';
import type { FinishResult } from '@/components/session-player/session-player';
import { loadLibraryFiles } from '@/lib/library/files';
import { signatureProgram } from '@/lib/signature/content';
import { buildProgramView } from '@/lib/signature/view';
import { DEVICE_KEY, readDeviceProgram } from '@/lib/signature/deviceProgress';
import type { DayGate } from '@/lib/signature/serve';
import type { Clock } from '@/lib/session-player/ticker';
import type { Session } from '@/lib/session-player/model';
import type { PlayMode } from '@/lib/session-player/fromSignature';

const LIB = new Map(loadLibraryFiles().map((e) => [e.id, e]));
const lookup = (id: string) => { const e = LIB.get(id); return e ? { id: e.id, name: e.name, setup: e.setup, cues: e.cues, faults: e.faults, pattern: e.pattern, category: e.category, youthOk: e.youthOk, prehabNote: e.prehabNote, dosage: e.dosage } : null; };
const OPEN: DayGate = { youth: false, hardStopped: false, painDecision: null, jumpGate: { closed: false, why: '', href: null }, readinessLow: false };
const adult = { userId: 'u1', isAdmin: false, youth: false, hasPro: false };

let t = 0;
let beat: (() => void) | null = null;
const clock: Clock = { now: () => t, every: (_ms, f) => { beat = f; return () => { beat = null; }; } };
const flush = () => new Promise((r) => setTimeout(r, 0));
const store = new Map<string, string>();
const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  t = 0; beat = null; store.clear();
  fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === 'POST' ? { ok: true, reward: { streakCounted: true, streakDays: 3 }, decision: null } : {}), { status: 200 }));
  vi.stubGlobal('fetch', fetchSpy);
  vi.stubGlobal('window', { localStorage: storage });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', { wakeLock: { request: async () => ({ release: async () => {} }) } });
  vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} });
});
afterEach(() => { vi.unstubAllGlobals(); });

/** Every element in a rendered tree (child components are elements, not calls: hookRuntime renders one component). */
function* walk(n: unknown): Generator<ReactElement<Record<string, unknown>>> {
  if (Array.isArray(n)) { for (const x of n) yield* walk(x); return; }
  if (!isValidElement(n)) return;
  const el = n as ReactElement<Record<string, unknown>>;
  yield el;
  for (const v of Object.values(el.props ?? {})) if (isValidElement(v) || Array.isArray(v)) yield* walk(v);
}
const find = (tree: unknown, f: (p: Record<string, unknown>) => boolean) => [...walk(tree)].find((e) => f(e.props ?? {})) ?? null;

/** Tap Start, then play the whole session the player was handed: one tap per counted set, the clock does the rest. */
async function startAndPlay(initial: NonNullable<ReturnType<typeof buildProgramView>>) {
  const page = mount(() => ProgramPage({ initial, clips: {} }));
  await flush();
  const startWrap = find(page.tree, (p) => 'data-start' in p);
  expect(startWrap, 'a Start button').not.toBeNull();
  const startBtn = find(startWrap, (p) => typeof p.onClick === 'function');   // the kit's PrimaryCta inside it
  (startBtn!.props.onClick as () => void)();
  await flush();
  const player = find(page.tree, (p) => !!p.session && !!p.mode);
  expect(player, 'the player opened on the same tap').not.toBeNull();
  const { session, mode, onFinish } = player!.props as { session: Session; mode: PlayMode; onFinish: () => Promise<FinishResult> };
  let api!: ReturnType<typeof useSessionPlayer>;
  let finished = 0;
  const run = mount(() => { api = useSessionPlayer(session, { clock, voice: { say: () => {}, tick: () => {}, cancel: () => {} }, demoSettled: true, onFinish: () => { finished++; } }); return null; });
  await flush();
  let taps = 0; let guard = 0;
  while (api.state.phase !== 'finish' && guard++ < 20_000) {
    if (api.state.phase === 'work' && api.state.leftMs === null) { api.primary(); taps++; } else { t += 1000; beat?.(); }
    await flush();
  }
  expect(api.state.phase).toBe('finish');
  expect(finished).toBe(1);
  const result = await onFinish();
  run.unmount();
  return { page, session, mode, result, taps };
}

describe('Start on a signature program page', () => {
  it('youth: a whole session plays with zero network requests, and the done mark lands on this phone', async () => {
    const BB = signatureProgram('basketball-skills')!;
    const v = buildProgramView({ program: BB, status: 'approved', viewer: { ...adult, youth: true }, ready: true, enrollment: null, gate: { ...OPEN, youth: true }, lookup, purchasesOpen: false })!;
    expect(v.keep).toBe('device');
    const r = await startAndPlay(v);
    expect(r.mode).toBe('device');
    expect(r.result.ok).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    const d = readDeviceProgram(storage, 'basketball-skills');
    expect(d?.done[r.session.id]).toBeTruthy();
    expect(r.taps).toBe(r.session.steps.filter((s) => !s.workSeconds).reduce((n, s) => n + s.sets, 0));
    r.page.unmount();
  });

  it("the admin's preview of a draft plays end to end and saves nothing", async () => {
    const VJ = signatureProgram('vertical-jump')!;
    const v = buildProgramView({ program: VJ, status: 'draft', viewer: { ...adult, isAdmin: true }, ready: false, enrollment: null, gate: OPEN, lookup, purchasesOpen: false })!;
    const r = await startAndPlay(v);
    expect(r.mode).toBe('preview');
    expect(r.result).toEqual({ ok: true, line: null });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(store.get(DEVICE_KEY)).toBeUndefined();
    r.page.unmount();
  });

  it("an adult's first Start enrolls, and the finish posts the existing done action for today's session", async () => {
    const VJ = signatureProgram('vertical-jump')!;
    const v = buildProgramView({ program: VJ, status: 'approved', viewer: adult, ready: true, enrollment: null, gate: OPEN, lookup, purchasesOpen: false })!;
    const r = await startAndPlay(v);
    expect(r.mode).toBe('save');
    const posts = fetchSpy.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST').map(([url, init]) => [url, JSON.parse(String((init as RequestInit).body))]);
    expect(posts).toEqual([
      ['/api/signature-programs/vertical-jump', { action: 'start' }],
      ['/api/signature-programs/vertical-jump', { action: 'done', sessionId: 'w1:A' }],
    ]);
    expect(r.result.ok).toBe(true);
    expect(r.result.line).toMatch(/Streak: 3 days/);
    r.page.unmount();
  });

  it('a failed save says so (the finish offers Try again)', async () => {
    fetchSpy.mockImplementation(async () => new Response('{}', { status: 503 }));
    const VJ = signatureProgram('vertical-jump')!;
    const v = buildProgramView({ program: VJ, status: 'approved', viewer: adult, ready: true, enrollment: null, gate: OPEN, lookup, purchasesOpen: false })!;
    const r = await startAndPlay(v);
    expect(r.result).toEqual({ ok: false, line: null });
    r.page.unmount();
  });
});
