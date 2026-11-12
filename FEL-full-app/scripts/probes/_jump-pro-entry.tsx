// The jump check's result on a phone, with no server (JUMP-PRO, 2026-10-24). Bundled by scripts/probes/_jump-pro-phone.mts
// with esbuild and loaded into headless Chromium at 390 px: the real JumpResult, JumpSessionCard and SlowMoUpload, fed
// by takes graded in the page itself (lib/jump/ballistic.ts → gradeT5), so every number shown is a real read.
//   #live30   a 30 fps check where the second jump landed on bent knees (corrected, flagged, not verified)
//   #live60   a clean 60 fps check (verified)
//   #slowmo   the slow-mo reader, its decoder stood in by a 240 fps capture the share sheet stretched 8×
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { JumpResult } from '@/app/play/mirror/assess/_components/jump-result';
import { JumpSessionCard } from '@/components/jump/jump-session-card';
import { SlowMoUpload } from '@/components/jump/slowmo-upload';
import { buildTake, filmTake } from '@/lib/jump/ballistic';
import { calibrateTake } from '@/lib/jump/bench';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';
import type { Decoder } from '@/lib/jump/slowmoDecode';

const scene = location.hash.slice(1) || 'live30';
const graded = (fps: number, bentSecond: boolean) => {
  const take = buildTake([0.42, 0.45, 0.43].map((m, i) => ({ trial: { heightM: m, ...(bentSecond && i === 1 ? { landKnee: 0.2 } : {}) } })), { leadS: 3.2 });
  const { frames } = filmTake(take, { fps, seed: 4 });
  const cal = calibrateTake(frames)!;
  return gradeT5(frames, { calibration: cal, aspect: cal.aspect }).t5;
};
const fake: Decoder = async (_file, onProgress) => {
  const take = buildTake([0.41, 0.44, 0.43].map((m) => ({ trial: { heightM: m } })), { leadS: 2.2 });
  const { frames } = filmTake(take, { fps: 240, seed: 9 });
  for (let k = 0; k <= 10; k++) { onProgress(k * 100, 1000); await new Promise((r) => setTimeout(r, 30)); }
  return { frames: frames.map((f) => ({ ...f, t: f.t * 8 })), aspect: 4 / 3, fileFps: 30 };
};

function App() {
  if (scene === 'slowmo') return h('div', { className: 'mx-auto max-w-md space-y-3 p-4' }, h(SlowMoUpload, { decode: fake }));
  const t5 = graded(scene === 'live60' ? 60 : 30, scene === 'live30');
  return h('div', { className: 'mx-auto max-w-md space-y-3 p-4' },
    h(JumpResult, { heightCm: t5.bestHeightCm, plusMinusCm: t5.heightPlusMinusCm, attempts: t5.jumps.length, kid: false, jumpIn: null, lastIn: null, onFull: () => {}, onAgain: () => {} }),
    h(JumpSessionCard, { t5 }),
    h(SlowMoUpload, {}));
}
createRoot(document.getElementById('root')!).render(h(App));
