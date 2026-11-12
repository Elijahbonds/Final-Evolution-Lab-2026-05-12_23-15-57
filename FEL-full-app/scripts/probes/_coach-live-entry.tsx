// The live session on the rig (COACH-LIVE, 2026-10-25): the real LiveRoom, bundled by scripts/probes/_coach-live-probe.mts
// with esbuild and served by that probe's own static server, which also stands in for the three /api/coach/live routes
// (the door from a fixture; the signals through the real lib/coach/live/server.ts relay over Controller Link's in-memory
// signal store). Two Chromium contexts — the coach and the client — with --use-fake-device-for-media-stream.
// The client's pose comes from the pose service's own dev feed (lib/pose/feed.ts), played a fixture set; its camera
// video is Chromium's fake camera. Every getUserMedia ask is logged on window.__GUM__ for the probe to read.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { LiveRoom } from '@/components/coach/live/live-room';
import { poseService } from '@/lib/pose/PoseService';
import type { PoseFrame } from '@/lib/pose/landmarks';

const w = window as unknown as Window & {
  __LIVE__: { room: string }; __GUM__: MediaStreamConstraints[];
  __feedBegin(): void; __feedPlay(f: PoseFrame[]): Promise<number>; __marks: { k: string; v: string; at: number }[];
};
w.__GUM__ = [];
const gum = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia = (c?: MediaStreamConstraints) => { w.__GUM__.push(JSON.parse(JSON.stringify(c ?? {}))); return gum(c); };
w.__feedBegin = () => poseService().beginFeed();
w.__feedPlay = (frames) => poseService().playFeed(frames);

// wall-clock marks of what changes on screen (the probe lines the two pages up on these: one machine, one clock)
w.__marks = [];
const watch = (sel: string, k: string) => {
  let last = '';
  new MutationObserver(() => {
    const el = document.querySelector(sel);
    const v = el ? (el.getAttribute('data-live-cue') ?? el.textContent ?? '') : '';
    if (v !== last) { last = v; w.__marks.push({ k, v, at: performance.timeOrigin + performance.now() }); }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true });
};
watch('[data-rep-count]', 'coachReps');
watch('[data-client-rep-count]', 'clientReps');
watch('[data-live-cue]', 'cue');

createRoot(document.getElementById('root')!).render(
  createElement('div', { className: 'min-h-screen bg-[#050505] pb-10' }, createElement(LiveRoom, { room: w.__LIVE__.room })),
);
