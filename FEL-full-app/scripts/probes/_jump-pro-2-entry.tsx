// The jump check's other jumps on a phone, with no server (JUMP-PRO 2, 2026-10-25). Bundled by
// scripts/probes/_jump-pro-2-phone.mts with esbuild and loaded into headless Chromium at 390 px: the real JumpMore panel
// (approach + touch height, standing reach, drop jump, power), its video decoder stood in by ground-truth takes filmed in
// the page itself (lib/jump/approachTake.ts, dropTake.ts through lib/pose/synth.ts), so every number shown is a real read.
//   #approach   a 60 fps side-on run-up, one-foot take-off, the standing reach already kept on the phone
//   #noreach    the same with no standing reach: the vertical, and the line that asks for the check
//   #reach      the standing-reach check reading a reach clip, saved on the (stand-in) phone
//   #drop       a 60 fps drop jump off a 38 cm box (200 ms contact)
//   #power      the power estimate with a typed body weight
//   #kid        the panel for anyone the page's age gate calls a kid: nothing
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { JumpMore } from '@/components/jump/jump-more';
import { filmTake } from '@/lib/jump/ballistic';
import { APPROACH_CAMERA, buildApproach, buildReach } from '@/lib/jump/approachTake';
import { buildDrop } from '@/lib/jump/dropTake';
import { DROP_CAMERA_M } from '@/lib/jump/dropBench';
import { readReach } from '@/lib/jump/reach';
import { saveReach, type ReachStorage } from '@/lib/jump/reachStore';
import type { Decoder } from '@/lib/jump/slowmoDecode';

const scene = location.hash.slice(1) || 'approach';
const mem = new Map<string, string>();
const storage: ReachStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); }, removeItem: (k) => { mem.delete(k); } };
const reachFrames = () => filmTake({ clip: buildReach().clip, truth: [], decoys: 0 }, { fps: 60, seed: 3, distance: 3 }).frames;
if (scene === 'approach') {
  const r = readReach(reachFrames(), 4 / 3);
  if (r.ok) saveReach({ reachOverLeg: r.reachOverLeg, reachOverLegSd: r.reachOverLegSd, at: '2026-10-25T12:00:00.000Z' }, storage);
}
const decoder = (make: () => { frames: ReturnType<typeof filmTake>['frames'] }): Decoder => async (_file, onProgress) => {
  for (let k = 0; k <= 5; k++) { onProgress(k * 60, 300); await new Promise((r) => setTimeout(r, 20)); }
  return { frames: make().frames, aspect: 4 / 3, fileFps: 60 };
};
const decode: Decoder | undefined =
  scene === 'approach' || scene === 'noreach' ? decoder(() => { const t = buildApproach({ heightM: 0.66, takeoff: 'one' }); return filmTake({ clip: t.clip, truth: t.truth, decoys: 0 }, { fps: 60, seed: 5, distance: APPROACH_CAMERA.distance }); })
  : scene === 'drop' ? decoder(() => { const t = buildDrop({ boxM: 0.38, heightM: 0.33, contactMs: 200 }); return filmTake({ clip: t.clip, truth: t.truth, decoys: 0 }, { fps: 60, seed: 5, distance: DROP_CAMERA_M }); })
  : scene === 'reach' ? decoder(() => ({ frames: reachFrames() }))
  : undefined;

function App() {
  return h('div', { className: 'mx-auto max-w-md space-y-3 p-4' },
    h(JumpMore, { adult: scene !== 'kid', bestHeightCm: 43.2, plusMinusCm: 2.8, decode, storage }));
}
createRoot(document.getElementById('root')!).render(h(App));
