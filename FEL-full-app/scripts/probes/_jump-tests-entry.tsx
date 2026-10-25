// The jump tests on a phone, with no server (JUMP-TESTS, 2026-10-25). Bundled by scripts/probes/_jump-tests-phone.mts
// with esbuild and loaded into headless Chromium at 390 px: the real JumpMore panel (the tests, the history, the power
// panel, the pilot panel) with its video decoder stood in by ground-truth takes filmed in the page itself
// (lib/jump/protocolBench.ts through lib/pose/synth.ts), so every number shown is a real read. The file's NAME picks the
// take: "<protocol>[-cheat][-<load kg>].mov".
import { createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { JumpMore } from '@/components/jump/jump-more';
import { SlowMoUpload } from '@/components/jump/slowmo-upload';
import { protocolTake } from '@/lib/jump/protocolBench';
import { calibrateTake } from '@/lib/jump/bench';
import { gradeT5 } from '@/lib/assess/graders/t5-cmj';
import type { ProtocolId } from '@/lib/jump/protocols';
import type { Decoder } from '@/lib/jump/slowmoDecode';
import type { ReachStorage } from '@/lib/jump/reachStore';

const scene = location.hash.slice(1) || 'menu';
const mem = new Map<string, string>();
const storage: ReachStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); }, removeItem: (k) => { mem.delete(k); } };
const FPS = scene === 'review' || scene === 'slowmo' ? 240 : 60;
const decode: Decoder = async (file, onProgress) => {
  for (let k = 0; k <= 5; k++) { onProgress(k * 60, 300); await new Promise((r) => setTimeout(r, 20)); }
  const [id, ...rest] = file.name.replace(/\.mov$/i, '').split('-');
  const cheat = rest.includes('cheat');
  const load = Number(rest.find((x) => /^\d+$/.test(x)) ?? 0);
  // a heavier load jumps lower (the force-velocity scene)
  const heightsM = load ? [0.4 - load * 0.0045, 0.41 - load * 0.0045] : undefined;
  const { frames } = protocolTake(id as ProtocolId, { fps: FPS, seed: 3, kind: cheat ? 'cheat' : 'honest', ...(heightsM ? { heightsM } : {}) });
  return { frames, aspect: 4 / 3, fileFps: FPS };
};
// the live check's read: three hands-on-hips jumps at 60 fps
const live = (() => {
  const { frames } = protocolTake('cmjHips', { fps: 60, seed: 5 });
  const cal = calibrateTake(frames)!;
  return gradeT5(frames, { calibration: cal, aspect: cal.aspect }).t5;
})();
const w = window as unknown as { __csv?: { name: string; text: string }[] };
w.__csv = [];
const onExport = (name: string, text: string) => { w.__csv!.push({ name, text }); };

function App() {
  if (scene === 'slowmo') return h('div', { className: 'mx-auto max-w-md space-y-3 p-4' }, h(SlowMoUpload, { decode, storage, pilot: false }));
  return h('div', { className: 'mx-auto max-w-md space-y-3 p-4' },
    h(JumpMore, { adult: scene !== 'kid', bestHeightCm: live.bestHeightCm, plusMinusCm: live.heightPlusMinusCm, decode, storage, t5: live, pilot: scene === 'pilot', onExport }));
}
createRoot(document.getElementById('root')!).render(h(App));
