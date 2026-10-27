// "Measure my vertical" on a phone, screen by screen, with no server (VERTICAL-EASY, 2026-10-27). Bundled by
// scripts/probes/_vertical-easy-phone.mts with esbuild and loaded into headless Chromium at 390 px. The same entry builds
// against this lane's base (the "before" sheet) and this lane (the "after"): `__VER__` is defined at build time.
//
// The live screens are the real LiveHud fed the real runner's views: lib/vertical/sim.ts plays the jump-only runner in
// the page with JUMP-PRO's physics bench (lib/jump/ballistic.ts), and each scene picks the first view of its step. The
// skeleton is painted from that frame. The result is the real JumpResult over a take graded in the page.
//   #landing #start #age #pain #takeoff #setup-fix #setup-ready #position #countdown #go #refusal #pain-check #result
import { createElement as h, useEffect, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AgeStep, PainStep, StartStep, TakeoffStep } from '@/app/play/mirror/assess/_components/gate-steps';
import { ScreenFrame } from '@/app/play/mirror/assess/_components/screen-ui';
import { LiveHud } from '@/app/play/mirror/assess/_components/live-hud';
import { JumpResult } from '@/app/play/mirror/assess/_components/jump-result';
import { drawSkeleton } from '@/app/play/mirror/assess/_components/skeleton';
import { JumpSessionCard } from '@/components/jump/jump-session-card';
import { GuestLandingHero } from '@/components/guest-landing-hero';
import { simulateLiveJump } from '@/lib/vertical/sim';
import type { RunnerView } from '@/lib/assess/runner';
import type { PoseFrame } from '@/lib/pose/landmarks';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { calibrateTake } from '@/lib/jump/bench';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';

declare const __VER__: string;
const scene = location.hash.slice(1) || 'start';
const W = window as unknown as { __READY__?: boolean; __META__?: unknown };

/** The first runner view of a step (and its frame), from a live run of the jump-only flow. */
function viewOf(pick: (v: RunnerView) => boolean, o: Partial<Parameters<typeof simulateLiveJump>[0]> = {}): { v: RunnerView; f: PoseFrame } | null {
  let got: { v: RunnerView; f: PoseFrame } | null = null;
  simulateLiveJump({
    fps: 30, seed: 2, trials: [0.38, 0.42, 0.45].map((m) => ({ heightM: m })), limitMs: 40_000, ...o,
    onView: (v, f) => { if (!got && pick(v)) got = { v: { ...v }, f }; },
  });
  return got;
}

function Stage({ v, f, voiceOn = true }: { v: RunnerView; f: PoseFrame; voiceOn?: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current, ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    c.width = 640; c.height = 480;
    const g = ctx.createLinearGradient(0, 0, 0, 480); g.addColorStop(0, '#2a2f38'); g.addColorStop(1, '#14161b');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 480);
    ctx.fillStyle = '#3a3f48'; ctx.fillRect(0, 400, 640, 80);
    if (f.present && f.image.length >= 33) drawSkeleton(ctx, f.image, { colour: '#FFFFFF', minVisibility: 0.3 });
  }, [f]);
  return h('div', { className: 'relative w-full overflow-hidden rounded-3xl border border-white/10 bg-black', style: { aspectRatio: '640 / 480', maxHeight: 'min(72vh, 100dvh - 12rem)' } },
    h('div', { className: 'absolute inset-0', style: { transform: 'scaleX(-1)' } }, h('canvas', { ref, className: 'absolute inset-0 h-full w-full' })),
    h(LiveHud, { view: v, voiceOn, onPain: () => {}, onTakeoff: () => {}, onStop: () => {} }));
}

function result(): ReactNode {
  const take = buildTake([0.41, 0.44, 0.43].map((m) => ({ trial: { heightM: m } })), { leadS: 3.2 });
  const { frames } = filmTake(take, { fps: 60, seed: 4 });
  const cal = calibrateTake(frames)!;
  const t5 = gradeT5(frames, { calibration: cal, aspect: cal.aspect }).t5;
  const props = { heightCm: t5.bestHeightCm, plusMinusCm: t5.heightPlusMinusCm, attempts: t5.jumps.length, counted: t5.jumps.filter((j) => j.valid).length, kid: false, jumpIn: null, lastIn: null, onFull: () => {}, onAgain: () => {} };
  const card = h(JumpSessionCard, { t5 });
  return __VER__ === 'before' ? h('div', { className: 'space-y-3' }, h(JumpResult, props), card) : h(JumpResult, { ...props, more: card });
}

function App() {
  let body: ReactNode = null;
  let frame = true;
  const live = (pick: (v: RunnerView) => boolean, o?: Partial<Parameters<typeof simulateLiveJump>[0]>, voiceOn = true) => {
    const got = viewOf(pick, o);
    return got ? h(Stage, { v: got.v, f: got.f, voiceOn }) : h('p', { 'data-missing': scene }, `no view for ${scene}`);
  };
  switch (scene) {
    case 'landing': frame = false; body = h(GuestLandingHero); break;
    case 'start': body = h(StartStep, { jumpHref: '/play/mirror/assess?run=jump', fullHref: '/play/mirror/assess?run=full' }); break;
    case 'age': body = h(AgeStep, { onAnswer: () => {} }); break;
    case 'pain': body = h(PainStep, { onAnswer: () => {} }); break;
    case 'takeoff': body = __VER__ === 'before' ? h(TakeoffStep, { onAnswer: () => {} }) : h('p', { 'data-skipped': true, className: 'text-white/60' }, '(no take-off step on the jump-only run)'); break;
    case 'setup-fix': body = live((v) => v.step === 'framing' && !!v.framing && !v.framing.ok && v.framing.worst !== 'noBody', { film: { distance: 2.0 } }); break;
    case 'setup-ready': body = live((v) => v.step === 'calibrate' && v.hold > 0.3); break;
    case 'position': body = live((v) => v.step === 'position' && v.setupReady); break;
    case 'countdown': body = live((v) => v.step === 'countdown' && v.countdown === 2); break;
    case 'go': body = live((v) => v.step === 'active' && v.flash === 'start'); break;
    case 'refusal': body = live((v) => !!v.rejection, { style: { armSwing: true } }, false); break;
    case 'pain-check': body = live((v) => v.step === 'painCheck'); break;
    case 'result': body = result(); break;
  }
  useEffect(() => { W.__READY__ = true; }, []);
  return frame ? h(ScreenFrame, { back: '/screen', children: body }) : h('div', null, body);
}
createRoot(document.getElementById('root')!).render(h(App));
