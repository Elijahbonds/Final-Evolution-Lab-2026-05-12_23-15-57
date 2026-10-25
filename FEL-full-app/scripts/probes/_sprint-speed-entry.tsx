// /train/speed on a phone, with no server and no camera (SPRINT-SPEED, 2026-10-25). Bundled by
// scripts/probes/_sprint-speed-probe.mts with esbuild and loaded into headless Chromium at 390 px. The camera is the pose
// service's own feed (lib/pose/PoseService.ts beginFeed / pushFeed), pushed synthetic sprinters filmed by the same pinhole
// camera the tests use (tests/helpers/sprintSynth.ts), so every number on screen is a real read of frames.
//   app     the speed app (the probe drives the gate, flying, trace and 5-10-5 runs in it)
//   teen    a non-adult opens the page: one line, no camera
//   combine combine day's run screen at a sprint station the coach set to the camera (an adult: the camera timer)
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { SpeedApp } from '@/components/sprint/speed-app';
import { ADULTS_ONLY_LINE } from '@/lib/sprint/copy';
import { poseService } from '@/lib/pose/PoseService';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { makeCamera, project } from '@/lib/pose/synth';
import { agilityRunState, bisect, film, sprinter } from '../../tests/helpers/sprintSynth';
import { CombineRun } from '@/components/combine/combine-run';
import { newEvent, recordAttempts } from '@/lib/combine/draft';
import { parseStation } from '@/lib/combine/catalogue';
import { OPEN_TODAY } from '@/lib/combine/today';

const scene = location.hash.slice(1) || 'app';
const W = 1280, H = 720;
const CAM = {
  gate: { width: W, height: H, hfovDeg: 66, distance: 4, heightM: 1.1 },
  flying: { width: W, height: H, hfovDeg: 66, distance: 15, heightM: 1.1 },
  trace: { width: W, height: H, hfovDeg: 66, distance: 25, heightM: 1.1 },
  agility: { width: W, height: H, hfovDeg: 70, distance: 9, heightM: 1.0 },
};
const pic = (spec: typeof CAM.gate, p: [number, number, number]) => { const q = project(makeCamera(spec), p); return { x: q.x, y: q.y }; };
const torsoX = (img: { x: number }[]) => (img[11].x + img[12].x + img[23].x + img[24].x) / 4;

/** Each run's frames on the page clock from t0 (ms), and its truth (s from t0). */
const RUNS = {
  // 40 yd from the Go as the athlete heard it at t0 (the timer's start: the phone's Go + its output delay + the sound's
  // 0.107 s over 40 yd); they react in 0.17 s, and the time includes that reaction
  gate: (t0: number) => {
    const reactS = 0.17;
    const run = sprinter({ vmax: 9.3, tau: 1.12, startX: -36.576 });
    const f = film((t) => run(t - reactS), 1.8, reactS + 3.6, reactS + 6.4, t0, { fps: 60, camera: CAM.gate, noise: 0.002, seed: 11 });
    return { frames: f.frames, truthS: bisect((t) => torsoX(f.render(t)) - 0.5, 3.9, 6.5) };
  },
  flying: (t0: number) => {
    const run = sprinter({ vmax: 9.6, tau: 1.05, startX: -32 });
    const f = film(run, 1.8, 2.2, 5.4, t0, { fps: 60, camera: CAM.flying, noise: 0.0015, seed: 12 });
    const tx = (t: number) => { const s = run(t).s; return s.hipX + 0.5 * s.lean * (0.818 - 0.53) * 1.8; };
    return { frames: f.frames, truthS: bisect((t) => tx(t) - 5, 2.2, 5.4) - bisect((t) => tx(t) + 5, 2.2, 5.4) };
  },
  trace: (t0: number) => {
    const f = film(sprinter({ vmax: 9.2, tau: 1.15, startX: -14 }), 1.8, -1.0, 5.6, t0, { fps: 60, camera: CAM.trace, noise: 0.0015, seed: 13 });
    return { frames: f.frames, truthS: 9.2 };
  },
  agility: (t0: number) => {
    const a = agilityRunState({ firstSide: 1, t1: 1.3, t2: 2.15 });
    const f = film(a.state, 1.8, -1.2, a.turnsS[1] + 1.5, t0, { fps: 60, camera: CAM.agility, noise: 0.0015, seed: 14 });
    return { frames: f.frames, truthS: a.finishS() };
  },
};

const w = window as unknown as Window & { __sprint: unknown };
let pending: PoseFrame[] = [];
w.__sprint = {
  begin: () => poseService().beginFeed(),
  /** Build a run's frames on the page clock from t0 (default now); returns the count and the truth. */
  load: (kind: keyof typeof RUNS, t0?: number) => { const r = RUNS[kind](t0 ?? performance.now()); pending = r.frames; return { n: r.frames.length, truthS: r.truthS }; },
  /** Push the next n frames. Returns how many are left. */
  push: (n: number) => { for (const f of pending.splice(0, n)) poseService().pushFeed(f); return pending.length; },
  /** Where to tap (normalised), per test. */
  taps: {
    gate: [pic(CAM.gate, [0, 0, 0]), pic(CAM.gate, [0, 1.6, 0])],
    flying: [pic(CAM.flying, [-5, 0, 0]), pic(CAM.flying, [-5, 1.6, 0]), pic(CAM.flying, [5, 0, 0]), pic(CAM.flying, [5, 1.6, 0])],
    trace: [pic(CAM.trace, [-14, 0, 0]), pic(CAM.trace, [14, 0, 0])],
    agility: [pic(CAM.agility, [-4.572, 0, 0]), pic(CAM.agility, [0, 0, 0]), pic(CAM.agility, [4.572, 0, 0])],
  },
};

const shell = (child: unknown) => h('main', { className: 'mx-auto min-h-screen max-w-md bg-[#050505] px-4 py-6 pb-20' }, child as never);
const root = createRoot(document.getElementById('root')!);
if (scene === 'teen') root.render(shell(h('div', { className: 'fel-card rounded-xl p-5 text-sm text-white/75', 'data-sprint-adults-only': '' }, ADULTS_ONLY_LINE)));
else if (scene === 'combine') {
  const st = parseStation({ kind: 'sprint', variant: '40yd', timing: 'camera' })!;
  const a = (id: string, name: string, camera: boolean) => ({ id, name, source: 'roster' as const, access: { testable: true, camera, saveCamera: camera, held: null, today: OPEN_TODAY } });
  let ev = newEvent({ name: 'Fall tryout', athletes: [a('maya', 'Maya Okafor', true), a('jo', 'Jo Reyes', true), a('h', 'Hana (16)', false)], stations: [st], localId: 'L' });
  ev = recordAttempts(ev, 'maya', st.id, [{ value: 5.04, method: 'camera' }]);
  root.render(shell(h(CombineRun, { ev, onChange: () => {}, onReport: () => {}, onHome: () => {}, roster: [], saving: true, status: null })));
} else root.render(shell(h(SpeedApp)));
