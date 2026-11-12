// Committed copy of the PLAT-P03 rig scenes (the planner's rig, scripts/plat-plan, stays untracked): copy it beside
// scripts/plat-plan/entry.tsx and spread RESULT_SCENES into its SCENES to re-run the six result screens and My progress.
// PLAT-P03 rig scenes: the six result screens, each in its RESULT state, from the same fixtures before and after.
//
//   rreadiness  /train/readiness (the real page, a verified adult): six normal days kept on this phone, today ~6 % up,
//               the check driven through the pose service's own feed (lib/pose/PoseService.ts beginFeed / pushFeed)
//   rvelocity   /train/velocity (the real page, an adult who keeps sets on this phone): 100 kg back squat, six reps
//               0.80 → 0.62 m/s filmed by the VBT bench and pushed through the feed; yesterday's set at 100 kg kept
//   rsprint     the sprint result (components/sprint/run-result.tsx) under the speed page's own header: 40 yd 5.12 s
//               ± 0.06, last run on this phone 5.31 s
//   rcombine    the athlete's combine page (components/combine/my-combines.tsx): two combines, a re-test 6 weeks apart
//   rchapter    the chapter check's score (components/education/chapter-check.tsx ChapterCheckView): 4 of 5, passed
//   rjump       a jump test's result (components/jump/jump-tests.tsx): hands-on-hips, read from a 60 fps video,
//               driven open → pick → file; last one kept on this phone
//   rjumpcheck  the jump check's result as assess-app shows an adult (JumpResult + JumpSessionCard, live 60 fps take)
//
// Every scene renders the component and then DRIVES it to its result in the page; the rig waits for `ready()`.
import { createElement as h, useEffect, useState, type ReactNode } from 'react';
import { poseService } from '@/lib/pose/PoseService';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { localDayKey } from '@/lib/health/readiness';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- scene modules
type PageModule = { default: (props: any) => Promise<ReactNode> | ReactNode };
export interface ResultScene { path: string; signedIn: boolean; load: () => Promise<PageModule>; drive?: () => Promise<void> }

const W = window as unknown as Window & { __API?: Record<string, unknown>; __DB?: Record<string, unknown> };
const dayAgo = (n: number) => localDayKey(new Date(Date.now() - n * 86_400_000));
const isoAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(sel: string, ms = 45000): Promise<HTMLElement> {
  const t0 = Date.now();
  for (;;) {
    const el = document.querySelector<HTMLElement>(sel);
    if (el) return el;
    if (Date.now() - t0 > ms) throw new Error(`scene: ${sel} never appeared`);
    await sleep(50);
  }
}
/** Type into a React-controlled input. */
function type(sel: string, value: string) {
  const el = document.querySelector<HTMLInputElement>(sel);
  if (!el) throw new Error(`scene: no ${sel}`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
/** Hand a file input a (fake) file, the way a pick does. */
function pickFile(sel: string, name: string) {
  const el = document.querySelector<HTMLInputElement>(sel);
  if (!el) throw new Error(`scene: no ${sel}`);
  const dt = new DataTransfer();
  dt.items.add(new File(['rig'], name, { type: 'video/quicktime' }));
  el.files = dt.files;
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const shell = (...kids: ReactNode[]) => h('main', { className: 'mx-auto min-h-screen max-w-xl bg-fel-bg px-4 py-6 pb-24' }, ...kids);

// ── readiness ───────────────────────────────────────────────────────────────────────────────────────────────────
async function readinessScene(): Promise<PageModule> {
  const [{ DEVICE_KEY }] = await Promise.all([import('@/lib/coach/readiness/deviceHistory')]);
  const NORMAL = [41.6, 42.3, 41.9, 42.5, 41.8, 42.2].map((b, i) => ({ day: dayAgo(i + 1), bestCm: b, meanCm: b - 1.1, teCm: 1.3, jumps: 3, poseHz: 60, belowReal: false, band: 'normal' }));
  try { localStorage.setItem(DEVICE_KEY, JSON.stringify(NORMAL)); } catch { /* reads "building" */ }
  W.__DB = { 'user.findUnique': { dobYear: 1990 } };
  W.__API = { '/api/readiness/check': { ok: true, canSave: false, ready: false, kept: 'device', coaches: [], history: null, trend: null, today: null } };
  return import('@/app/train/readiness/page');
}
async function readinessDrive() {
  const { buildTake, filmTake } = await import('@/lib/jump/ballistic');
  const take = buildTake([0.42, 0.425, 0.418].map((m) => ({ trial: { heightM: m * 1.06 } })), { leadS: 3.2 });
  const frames = filmTake(take, { fps: 60, seed: 11 }).frames;
  const start = await until('[data-readiness-start]:not([disabled])');
  poseService().beginFeed();
  start.click();
  await until('[data-readiness-caption]');
  for (let i = 0; i < frames.length; i += 40) {
    frames.slice(i, i + 40).forEach((f) => poseService().pushFeed(f));
    await sleep(10);
    if (document.querySelector('[data-readiness-result]')) break;
  }
  await until('[data-readiness-result]');
}

// ── bar speed ───────────────────────────────────────────────────────────────────────────────────────────────────
async function velocityScene(): Promise<PageModule> {
  const [{ featuresFor }, { DEVICE_SETS_KEY, cleanSet }] = await Promise.all([import('@/lib/vbt/gate'), import('@/lib/vbt/sets')]);
  const last = cleanSet({ day: dayAgo(1), at: Date.now() - 86_400_000, lift: 'back_squat', loadKg: 100, source: 'pose', fps: 60, reps: 5, partials: 0, bestMcv: 0.74, meanMcv: 0.69, lastMcv: 0.62, bestPv: 1.2, lossPct: 16, stopPct: 20, repMcvs: [0.74, 0.72, 0.69, 0.66, 0.62], warmup: false, band: null });
  try { localStorage.setItem(DEVICE_SETS_KEY, JSON.stringify([last])); } catch { /* none */ }
  W.__DB = { 'user.findUnique': { dobYear: 1990 } };
  W.__API = { '/api/vbt/sets': { ok: true, tier: 'adult', features: featuresFor('adult'), canSave: false, ready: true, kept: 'device', history: null, coaches: [], targets: [] } };
  return import('@/app/train/velocity/page');
}
async function velocityDrive() {
  const [{ filmSet }, { LIFTS }] = await Promise.all([import('@/lib/vbt/bench'), import('@/lib/vbt/lifts')]);
  const reps = [0.8, 0.78, 0.74, 0.7, 0.66, 0.62].map((v) => ({ romM: 0.5, concMs: (0.5 / v) * 1000 }));
  const f = filmSet(LIFTS.back_squat, { reps, leadMs: 1500 }, { fps: 60, seed: 7 });
  await until('[data-vbt-load]');
  type('[data-vbt-load]', '100');
  type('[data-vbt-height]', '178');
  await sleep(50);
  poseService().beginFeed();
  (await until('[data-vbt-start]:not([disabled])')).click();
  await until('[data-vbt-phase="live"]');
  for (let i = 0; i < f.frames.length; i += 30) {
    f.frames.slice(i, i + 30).forEach((fr) => poseService().pushFeed({ t: fr.t, present: true, image: fr.image } as PoseFrame));
    await sleep(10);
  }
  (await until('[data-vbt-end]')).click();
  await until('[data-vbt-summary]');
}

// ── sprint ──────────────────────────────────────────────────────────────────────────────────────────────────────
async function sprintScene(): Promise<PageModule> {
  const [{ RunResultCard }, { TabPage }, { RUNS_KEY }] = await Promise.all([
    import('@/components/sprint/run-result'), import('@/components/shell/tab-page'), import('@/lib/sprint/store'),
  ]);
  const prior = { v: 1, id: 'run-prior', at: isoAgo(2), test: 'gate', label: '40 yd', distanceM: 36.576, timeS: 5.31, sdS: 0.03, startKind: 'go', reactionIncluded: true, splits: [{ label: '10 yd', s: 1.84 }, { label: '20 yd', s: 3.05 }], topSpeed: null, topSpeedSd: null, vmax: null, vmaxSd: null, tau: null, f0PerKg: null, pmaxPerKg: null, poseHz: 60, method: 'camera' };
  try { localStorage.setItem(RUNS_KEY, JSON.stringify([prior])); } catch { /* none */ }
  const result = { ok: true, test: 'gate', label: '40 yd', timeS: 5.12, sdS: 0.03, startKind: 'go', reactionIncluded: true, splits: [{ label: '10 yd', s: 1.78 }, { label: '20 yd', s: 2.95 }], trace: null, turns: null, poseHz: 60, tips: [] } as const;
  return {
    default: () => h(TabPage, {
      eyebrow: 'Train', title: 'Sprint speed', accent: '#00FF9D',
      lede: 'Time a sprint, a flying 10 or a 5-10-5 with your phone\'s camera, and read your top speed. Every number is an estimate.',
      // the result arrives after the run (not with the page), as it does on /train/speed
      children: h('div', { className: 'mx-auto max-w-md' }, h(function Late() {
        const [on, setOn] = useState(false);
        useEffect(() => { const t = setTimeout(() => setOn(true), 400); return () => clearTimeout(t); }, []);
        return on ? h(RunResultCard as never, { result, last: prior, onAgain: () => {} }) : null;
      })),
    } as never),
  };
}

// ── combine (athlete) ───────────────────────────────────────────────────────────────────────────────────────────
async function combineScene(): Promise<PageModule> {
  const { MyCombines } = await import('@/components/combine/my-combines');
  const ev = (id: string, name: string, days: number, cmj: number, sprint: number, rank: number) => ({
    id, name, createdAt: Date.now() - days * 86_400_000,
    stations: [
      { id: 'cmj:standing', kind: 'cmj', variant: 'standing', best: cmj, touchCm: null, attempts: [cmj - 2.1, cmj, cmj - 1.2], rank, of: 14 },
      { id: 'sprint:40yd', kind: 'sprint', variant: '40yd', best: sprint, touchCm: null, attempts: [sprint + 0.08, sprint], rank: rank + 1, of: 14 },
    ],
  });
  const events = [ev('c2', 'Spring tryout', 3, 58.4, 5.06, 2), ev('c1', 'Winter combine', 45, 54.1, 5.21, 5)];
  return {
    default: () => shell(
      h('a', { href: '/train', className: 'text-[14px] text-fel-soft' }, '← Train'),
      h('h1', { className: 'mb-4 mt-2 font-display text-[20px] font-bold uppercase tracking-[0.03em] text-white' }, 'Your combines'),
      h(MyCombines as never, { available: true, events }),
    ),
  };
}

// ── chapter check ───────────────────────────────────────────────────────────────────────────────────────────────
async function chapterScene(): Promise<PageModule> {
  const [{ ChapterCheckView }, { PrimaryCta }] = await Promise.all([import('@/components/education/chapter-check'), import('@/components/ui/fel/primary-cta')]);
  const qs = [
    ['q1', 'Where should your knees point when you land?', ['Over your toes', 'Inward', 'Straight back']],
    ['q2', 'What does a soft landing sound like?', ['Quiet', 'Loud', 'It does not matter']],
    ['q3', 'When should you stop a drill?', ['If anything hurts', 'Never', 'Only when told']],
    ['q4', 'How long should you rest between hard sprints?', ['2 to 3 minutes', '5 seconds', 'No rest']],
    ['q5', 'What makes a jump count?', ['Hands on hips the whole way', 'A run-up', 'Bending at the landing']],
  ] as const;
  const info = { available: true, draft: false, passMark: 80, saves: true, worth: 10, questions: qs.map(([id, question, options]) => ({ id, question, options: [...options], draft: false })) };
  const picked = Object.fromEntries(qs.map(([id, , o]) => [id, o[0]]));
  const result = { score: 80, passed: true, correct: 4, total: 5, passMark: 80, results: qs.map(([id], i) => ({ id, correct: i !== 3 })), saved: true, awarded: 10, bonus: 0 };
  // the reader's own docked primary sits on this screen too (components/education/chapter-reader.tsx): "Next chapter"
  return { default: () => shell(h(ChapterCheckView as never, { info, picked, result, busy: false, error: false, onPick: () => {}, onSubmit: () => {}, onRetry: () => {} }), h(PrimaryCta as never, { href: '/education/playbook/2', docked: true }, 'Next chapter')) };
  // the check sits at the chapter's end: the reader scrolls to it, so the result is what the first screen shows
}
async function chapterDrive() {
  (await until('[data-check-result]')).scrollIntoView({ block: 'start' });
}

// ── jump: a test's result, and the jump check's ─────────────────────────────────────────────────────────────────
async function jumpScene(): Promise<PageModule> {
  const [{ JumpTests }, { protocolTake }, { HISTORY_KEY }] = await Promise.all([
    import('@/components/jump/jump-tests'), import('@/lib/jump/protocolBench'), import('@/lib/jump/historyStore'),
  ]);
  const prior = { id: 'jump-priorhips01', at: isoAgo(6), test: 'cmjHips', bestCm: 38.6, plusMinusCm: 1.4, jumps: 3, verified: false, manualFrames: false, source: 'video', fps: 60, rsi: null, contactMs: null, v0Mps: null, rsiMod: null };
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify([prior])); } catch { /* none */ }
  const decode = async (file: File, onProgress: (d: number, t: number) => void) => {
    onProgress(300, 300);
    const id = file.name.replace(/\.mov$/i, '') as 'cmjHips';
    const { frames } = protocolTake(id, { fps: 60, seed: 3, kind: 'honest' });
    return { frames, aspect: 4 / 3, fileFps: 60 };
  };
  return { default: () => h('div', { className: 'mx-auto min-h-screen max-w-md space-y-3 bg-fel-bg p-4' }, h(JumpTests as never, { adult: true, decode, storage: localStorage, pilot: false })) };
}
async function jumpDrive() {
  (await until('[data-tests-open]')).click();
  (await until('[data-test-pick="cmjHips"]')).click();
  await until('[data-test-file="cmjHips"]');
  pickFile('[data-test-file="cmjHips"]', 'cmjHips.mov');
  await until('[data-test-result="cmjHips"]');
}
async function jumpCheckScene(): Promise<PageModule> {
  const [{ JumpResult }, { JumpSessionCard }, { buildTake, filmTake }, { calibrateTake }, { gradeT5 }] = await Promise.all([
    import('@/app/play/mirror/assess/_components/jump-result'), import('@/components/jump/jump-session-card'),
    import('@/lib/jump/ballistic'), import('@/lib/jump/bench'), import('@/lib/assess/graders/t5-cmj'),
  ]);
  const take = buildTake([0.42, 0.45, 0.43].map((m) => ({ trial: { heightM: m } })), { leadS: 3.2 });
  const { frames } = filmTake(take, { fps: 60, seed: 4 });
  const cal = calibrateTake(frames)!;
  const t5 = gradeT5(frames, { calibration: cal, aspect: cal.aspect }).t5;
  return {
    default: () => h('div', { className: 'mx-auto min-h-screen max-w-md space-y-3 bg-fel-bg p-4' },
      // as assess-app mounts it since #480 (vertical-easy): the session card is the adult's detail, under "More detail"
      h(JumpResult as never, { heightCm: t5.bestHeightCm, plusMinusCm: t5.heightPlusMinusCm, attempts: t5.jumps.length, kid: false, jumpIn: null, lastIn: null, onFull: () => {}, onAgain: () => {}, more: h(JumpSessionCard as never, { t5 }) })),
  };
}


// ── My progress ─────────────────────────────────────────────────────────────────────────────────────────────────
// youth: the REAL page (its server loader over the rig's empty database: a teen's account reads nothing saved), and
// the phone's jump history holding 12 jump checks; adult: the page's view with an opted-in adult's saved jumps and two
// combines. Both count every request the page makes (window.__SENT holds the writes; the brief: 0).
async function progressYouthScene(): Promise<PageModule> {
  const { HISTORY_KEY } = await import('@/lib/jump/historyStore');
  const jumps = Array.from({ length: 12 }, (_, i) => ({ id: `jump-teen${String(i).padStart(4, '0')}`, at: isoAgo(24 - i * 2), test: 'check', bestCm: 38 + (i % 4) * 0.8 + i * 0.3, plusMinusCm: 1.4, jumps: 3, verified: false, manualFrames: false, source: 'live', fps: 60, rsi: null, contactMs: null, v0Mps: null, rsiMod: null }));
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(jumps)); } catch { /* none */ }
  W.__DB = { 'user.findUnique': { dobYear: 2011 } };
  return import('@/app/train/progress/page');
}
async function progressAdultScene(): Promise<PageModule> {
  const [{ ProgressView }, { TabPage }, { RUNS_KEY }] = await Promise.all([
    import('@/components/progress/progress-view'), import('@/components/shell/tab-page'), import('@/lib/sprint/store'),
  ]);
  const run = (id: string, days: number, t: number) => ({ v: 1, id, at: isoAgo(days), test: 'gate', label: '40 yd', distanceM: 36.576, timeS: t, sdS: 0.03, startKind: 'go', reactionIncluded: true, splits: [], topSpeed: null, topSpeedSd: null, vmax: null, vmaxSd: null, tau: null, f0PerKg: null, pmaxPerKg: null, poseHz: 60, method: 'camera' });
  try { localStorage.setItem(RUNS_KEY, JSON.stringify([run('r3', 1, 5.12), run('r2', 9, 5.31), run('r1', 20, 5.35)])); } catch { /* none */ }
  const DAY = 86_400_000;
  const st = (cmj: number, sprint: number, rank: number) => [
    { id: 'cmj:standing', kind: 'cmj', variant: 'standing', best: cmj, touchCm: null, attempts: [cmj], rank, of: 14 },
    { id: 'sprint:40yd', kind: 'sprint', variant: '40yd', best: sprint, touchCm: null, attempts: [sprint], rank: rank + 1, of: 14 },
  ];
  const saved = {
    canSave: true,
    jumps: [52.1, 53.4, 52.8, 54.9, 55.2, 57.0].map((cm, i) => ({ at: Date.now() - (30 - i * 5) * DAY, cm })),
    readiness: [], sets: [],
    combines: { available: true, events: [{ id: 'c2', name: 'Spring tryout', createdAt: Date.now() - 3 * DAY, stations: st(58.4, 5.06, 2) }, { id: 'c1', name: 'Winter combine', createdAt: Date.now() - 45 * DAY, stations: st(54.1, 5.21, 5) }] },
  };
  return {
    default: () => h(TabPage, { eyebrow: 'Train', title: 'My progress', lede: 'Your numbers over time.', children: h('div', { className: 'mx-auto max-w-md' }, h(ProgressView as never, { saved })) } as never),
  };
}

export const RESULT_SCENES: Record<string, ResultScene> = {
  rreadiness: { path: '/train/readiness', signedIn: true, load: readinessScene, drive: readinessDrive },
  rvelocity: { path: '/train/velocity', signedIn: true, load: velocityScene, drive: velocityDrive },
  rsprint: { path: '/train/speed', signedIn: true, load: sprintScene },
  rcombine: { path: '/train/combine', signedIn: true, load: combineScene },
  rchapter: { path: '/education/playbook/1', signedIn: true, load: chapterScene, drive: chapterDrive },
  rjump: { path: '/play/mirror/assess', signedIn: true, load: jumpScene, drive: jumpDrive },
  rjumpcheck: { path: '/play/mirror/assess', signedIn: true, load: jumpCheckScene },
  progressyouth: { path: '/train/progress', signedIn: true, load: progressYouthScene },
  progressyouthopen: { path: '/train/progress', signedIn: true, load: progressYouthScene, drive: async () => { (await until('[data-progress-row] button')).click(); await until('[data-progress-history]'); } },
  progressadult: { path: '/train/progress', signedIn: true, load: progressAdultScene },
};
