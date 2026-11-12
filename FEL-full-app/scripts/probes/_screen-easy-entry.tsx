// The full Quick Screen on a phone, screen by screen, with no server (SCREEN-EASY, 2026-10-28). Bundled by
// scripts/probes/_screen-easy-phone.mts with esbuild and loaded into headless Chromium at 390 px. The same entry builds
// against the lane's base (the "before" tree, built from git objects) and this lane (the "after").
//
// The live screens are the real LiveHud fed the real runner's views: lib/screen-easy/sim.ts plays the full screen in the
// page, and each scene picks the first view that matches. The result is the real ResultsView over a graded synthetic
// screen (a caving left knee, a stiffer right ankle).
//   #age #pain #takeoff #setup #turn #wall #pain-check #result #result-clean
import { createElement as h, useEffect, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgeStep, PainStep, TakeoffStep } from '@/app/play/mirror/assess/_components/gate-steps';
import { ScreenFrame } from '@/app/play/mirror/assess/_components/screen-ui';
import { LiveHud } from '@/app/play/mirror/assess/_components/live-hud';
import { ResultsView } from '@/app/play/mirror/assess/_components/results-view';
import { drawSkeleton, fitToBox } from '@/app/play/mirror/assess/_components/skeleton';
import { simulateFullScreen } from '@/lib/screen-easy/sim';
import type { RunnerView } from '@/lib/assess/runner';
import { gradeSession } from '@/lib/assess/runner';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { cmj, kneeWall, ohsFront, ohsSide, singleLegSquat, syntheticCalibration } from '@/lib/assess/replay';
import { summarize } from '@/lib/screen/checks';

declare const __VER__: string;
const scene = location.hash.slice(1) || 'age';
const W = window as unknown as { __READY__?: boolean };

function viewOf(pick: (v: RunnerView) => boolean): { v: RunnerView; f: PoseFrame } | null {
  let got: { v: RunnerView; f: PoseFrame } | null = null;
  simulateFullScreen({ seed: 1, noise: true, limitMs: 200_000, onView: (v, f) => { if (!got && pick(v)) got = { v: { ...v }, f }; } });
  return got;
}

function Stage({ v, f }: { v: RunnerView; f: PoseFrame }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    // assumption: a phone held portrait gives a 3:4 picture (480×640); the synthetic body is re-framed into it
    c.width = 480; c.height = 640;
    const g = ctx.createLinearGradient(0, 0, 0, 640); g.addColorStop(0, '#2a2f38'); g.addColorStop(1, '#14161b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 480, 640);
    ctx.fillStyle = '#3a3f48'; ctx.fillRect(0, 560, 480, 80);
    if (f.present && f.image.length >= 33) drawSkeleton(ctx, fitToBox(f.image, 4 / 3, 480, 640, 0.14), { colour: '#FFFFFF', minVisibility: 0.3 });
  }, [f]);
  return h('div', { className: 'relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black', style: { aspectRatio: '480 / 640', maxHeight: 'min(72vh, 100dvh - 12rem)' } },
    h('div', { className: 'absolute inset-0', style: { transform: 'scaleX(-1)' } }, h('canvas', { ref, className: 'absolute inset-0 h-full w-full' })),
    h(LiveHud, { view: v, voiceOn: true, onPain: () => {}, onTakeoff: () => {}, onStop: () => {}, onSkipWall: () => {} } as Parameters<typeof LiveHud>[0]));
}

function summary(flagged: boolean) {
  const cal = syntheticCalibration();
  return summarize(gradeSession({
    calibration: cal, T1: { front: ohsFront({ kneeInL: flagged ? 0.06 : 0 }).frames, side: ohsSide().frames },
    T2: { left: kneeWall('left').frames, right: kneeWall('right', { tibiaMax: flagged ? 38.5 : 44 }).frames },
    T3: { left: singleLegSquat('left').frames, right: singleLegSquat('right').frames },
    T5: cmj([0, 1, 2].map(() => ({ heightM: 0.42 }))).frames,
  }))!;
}

function App() {
  let body: ReactNode = null;
  const live = (pick: (v: RunnerView) => boolean) => {
    const got = viewOf(pick);
    return got ? h(Stage, { v: got.v, f: got.f }) : h('p', { 'data-missing': scene }, `no view for ${scene}`);
  };
  switch (scene) {
    case 'age': body = h(AgeStep, { onAnswer: () => {} }); break;
    case 'pain': body = h(PainStep, { onAnswer: () => {} }); break;
    case 'takeoff': body = __VER__ === 'before' ? h(TakeoffStep, { onAnswer: () => {} }) : h('p', { 'data-skipped': true, className: 'text-white/60' }, '(no take-off step)'); break;
    case 'setup': body = live((v) => v.step === 'position' && v.part === 'T1-front' && v.setupReady); break;
    case 'turn': body = live((v) => v.step === 'position' && v.part === 'T1-side' && !v.setupReady); break;
    case 'wall': body = live((v) => v.step === 'position' && v.part === 'T2-left'); break;
    case 'pain-check': body = live((v) => v.step === 'painCheck' && v.mini?.test === 'T3'); break;
    case 'result': body = h(ResultsView, { summary: summary(true), age: '18+', onClear: () => {}, onRunAgain: () => {} }); break;
    case 'result-clean': body = h(ResultsView, { summary: summary(false), age: '18+', onClear: () => {}, onRunAgain: () => {} }); break;
  }
  useEffect(() => { W.__READY__ = true; }, []);
  return h(ScreenFrame, { back: '/screen', children: body });
}
createRoot(document.getElementById('root')!).render(h(App));
