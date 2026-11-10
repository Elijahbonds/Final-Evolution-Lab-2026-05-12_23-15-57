#!/usr/bin/env -S npx tsx
/**
 * scripts/gameplay-clean-pops-tests.ts — the gameplay-clean rig's pop counter (scripts/probes/gameplay-clean/popCount.mjs).
 *
 *   A. A RESET frame (the root over RESET_M in one frame) and the frame after it are cuts: a bone jump there is not a pop.
 *   B. THE CONTROL: the same bone jump on a frame the root did not jump IS a hard pop, counted exactly as before clean-5.
 *   C. skipResets false is the pre-clean-5 count (the reset frame counted), for the tables that predate it.
 *
 * Run: npx tsx scripts/gameplay-clean-pops-tests.ts
 */
import assert from 'node:assert';
import { countPops, resetFrames, RESET_M } from './probes/gameplay-clean/popCount.mjs';

let pass = 0;
const ok = (n: string, fn: () => void) => { fn(); pass++; console.log(`  ✓ ${n}`); };

const BONES = ['Hips', 'LeftUpLeg'];
const qx = (deg: number): number[] => { const h = (deg * Math.PI) / 360; return [Math.sin(h), 0, 0, Math.cos(h)]; };
/** 120 playing frames: the hips still, a thigh swinging gently (≤ 3.4° a frame), the root walking 0.05 m a frame. */
function frames(opts: { jumpAt?: number; teleportAt?: number } = {}) {
  const F: { t: number; ph: string; q: number[][]; r: number[]; c: number }[] = [];
  let x = 0;
  for (let i = 0; i < 120; i++) {
    let thigh = 20 * Math.sin(i / 6);
    if (opts.jumpAt !== undefined && i >= opts.jumpAt) thigh += 40;            // a 40° one-frame step, then held: a hard pop
    x += 0.05; if (opts.teleportAt !== undefined && i === opts.teleportAt) x += 12;   // a reset: the root 12 m in a frame
    F.push({ t: i / 60, ph: 'playing', q: [qx(0), qx(thigh)], r: [x, 0, 0], c: 0 });
  }
  return F;
}

console.log('\nA. reset frames are cuts');
ok(`a root move over ${RESET_M} m marks that frame and the next`, () => {
  const cut = resetFrames(frames({ teleportAt: 60 }));
  assert.deepEqual([...cut].sort((a: number, b: number) => a - b), [60, 61]);
});
ok('the thigh stepping 40° on the reset frame is not a pop', () => {
  const r = countPops(frames({ jumpAt: 60, teleportAt: 60 }), ['carry'], BONES);
  assert.equal(r.hard.length, 0, `hard events ${r.hard.length}`);
  assert.equal(r.resetFrames, 2);
});
ok('…nor on the frame after it (the new pose against the cut one)', () => {
  const r = countPops(frames({ jumpAt: 61, teleportAt: 60 }), ['carry'], BONES);
  assert.equal(r.hard.length, 0, `hard events ${r.hard.length}`);
});

console.log('\nB. the control: a real pop still counts');
ok('the same 40° step with the root walking: one hard event, on the thigh', () => {
  const r = countPops(frames({ jumpAt: 60 }), ['carry'], BONES);
  assert.equal(r.hard.length, 1, `hard events ${r.hard.length}`);
  assert.ok([...r.hard[0].bones].includes('LeftUpLeg'));
  assert.ok(r.hard[0].peak >= 2000, `peak ${r.hard[0].peak}°/s`);
  assert.equal(r.resetFrames, 0);
});
ok('a step two frames after a reset is past the cut: it counts', () => {
  const r = countPops(frames({ jumpAt: 62, teleportAt: 60 }), ['carry'], BONES);
  assert.equal(r.hard.length, 1, `hard events ${r.hard.length}`);
});
ok('the gentle swing alone: nothing', () => {
  assert.equal(countPops(frames(), ['carry'], BONES).events.length, 0);
});

console.log('\nC. the pre-clean-5 count');
ok('skipResets false counts the reset frame (the tables before clean-5)', () => {
  const r = countPops(frames({ jumpAt: 60, teleportAt: 60 }), ['carry'], BONES, { skipResets: false });
  assert.equal(r.hard.length, 1);
});

console.log(`\n${pass} passed`);
