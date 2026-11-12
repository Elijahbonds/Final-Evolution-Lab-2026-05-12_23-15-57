// hoops-p06 (carried over: GAMEPLAY-CLEAN-AUDIT §4i "left open" 1): THE DRIBBLE HAND CHANGE, headless, on the hero as a hoops mode spawns
// him (the captures, right-handed on screen, the `_left` twins), counted by the gameplay-clean counter (scripts/probes/gameplay-clean/
// popCount.mjs countPops: the same pop / hard-event rule as the browser rig).
//   npx tsx scripts/probes/hoops-p06/handchange.mts [blend=linear|inertial] [key=value ...feel overrides]
// For each dribble loop the tree hands a ball hand to (idle, walk, jog, run) and 8 points of its stride, the loop plays 40 frames, then the
// tree's hand change (its twin, with the tree's own fade: hoopsTransitions 'cross' 0.2 s) — through the BasketballAnimTree, so whatever the
// tree does on a hand change is what is measured — and 40 frames more. Prints, per loop, the hard events and the largest arm turn a frame
// in the 30 frames after the change, and the totals.
import { readFileSync } from 'node:fs';
import { FreeCamera, NullEngine, Quaternion, Scene, SceneLoader, Vector3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const L = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../lib');
const { setFeelOverride, setFeelSession, setFeelUser } = await import(L + '/feel-panel/feel.ts');
const { CharacterAnimator } = await import(L + '/babylon/anim/CharacterAnimator.ts');
const { registerAuthoredClips } = await import(L + '/babylon/anim/authored/index.ts');
const { installOpponentMotion, HERO_CAPTURE } = await import(L + '/babylon/anim/opponentMotion.ts');
const { neverBindPose, sanitizeImportedGroups } = await import(L + '/babylon/anim/importSanitizer.ts');
const { boneNode } = await import(L + '/babylon/anim/boneLookup.ts');
const { rightHandHoops, leftDribbleTwins } = await import(L + '/babylon/anim/hoopsHand.ts');
const { BasketballAnimTree } = await import(L + '/babylon/anim/basketballTree.ts');
const { countPops } = await import('../gameplay-clean/popCount.mjs');
const { mountBallCarry } = await import(L + '/babylon/anim/ballCarry.ts');
const { MeshBuilder } = await import('@babylonjs/core');
const CARRY = process.env.CARRY !== '0';   // the hoops carry on the ball arm, as in play (CARRY=0: the clips alone)

const BONES = ['LeftShoulder', 'RightShoulder', 'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm', 'LeftHand', 'RightHand', 'Spine2', 'Neck'];
const ang = (a: Quaternion, b: Quaternion) => (2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(a, b)))) * 180) / Math.PI;
const [blend = 'linear', ...kv] = process.argv.slice(2);
setFeelUser(true); setFeelSession(null);
for (const p of kv) { const [k, v] = p.split('='); setFeelOverride(k, Number(v)); }
const engine = new NullEngine(); const scene = new Scene(engine); new FreeCamera('c', new Vector3(0, 1, -3), scene);
const r = await SceneLoader.ImportMeshAsync('', '', 'data:model/gltf-binary;base64,' + readFileSync('public/models/fel-hero.glb').toString('base64'), scene, undefined, '.glb');
for (const g of r.animationGroups) g.stop();
const sk = r.skeletons[0]; sanitizeImportedGroups(r.animationGroups);
const A = new CharacterAnimator(scene, r.animationGroups); registerAuthoredClips(A, scene, sk, null); neverBindPose(A, 'idle_stand');
installOpponentMotion(A, scene, sk, undefined, HERO_CAPTURE);
rightHandHoops(A, sk); const twins = leftDribbleTwins(A, sk);
if (blend === 'inertial') (A as unknown as { setBlendMode: (b: string) => void }).setBlendMode('inertial');
(engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => 1000 / 60; scene.useConstantAnimationDeltaTime = true;
const catchGaps: number[] = []; let lastSide = '';
let vt = 1000; (globalThis as unknown as { performance: { now: () => number } }).performance.now = () => vt;   // the tree reads performance.now (its dwell)
const tree = new BasketballAnimTree(A);
const root = r.meshes[0];
const ball = MeshBuilder.CreateSphere('ball', { diameter: 0.24 }, scene);
const palmGap = (sd: string) => { const n = boneNode(sk, sd + 'Hand'); if (!n) return NaN; n.computeWorldMatrix(true); return Vector3.Distance(n.getAbsolutePosition(), ball.getAbsolutePosition()); };
const carry = CARRY ? mountBallCarry({ scene, ball, root, skeleton: sk, hoops: true }) : null;
const nodes = BONES.map((b) => boneNode(sk, b));
const pose = () => nodes.map((n) => { const q = n?.rotationQuaternion ?? Quaternion.Identity(); return [q.x, q.y, q.z, q.w]; });
const LOOPS: [string, number][] = [['idle', 0], ['walk', 1.4], ['jog', 3.2], ['run', 5.4]];
const F: { t: number; ph: string; q: number[][]; r: number[]; c: number }[] = []; const clips: string[] = [];
const cidx = (n: string) => { let i = clips.indexOf(n); if (i < 0) { clips.push(n); i = clips.length - 1; } return i; };
const rows: string[] = []; let worstAll = 0; const changes: number[] = []; const changeLoop: string[] = [];
for (const [label, mps] of LOOPS) {
  for (let ph = 0; ph < 8; ph++) {
    const input = (hand: 'right' | 'left') => ({ role: 'offense' as const, hasBall: true, shooting: false, dunking: false, speed01: Math.min(1, mps / 6.4), speedMps: mps, ballHand: hand, dtSec: 1 / 60 });
    const step = (hand: 'right' | 'left', n: number, mark: boolean) => {
      let worst = 0; let prev = nodes.map((x) => (x?.rotationQuaternion ?? Quaternion.Identity()).clone());
      for (let i = 0; i < n; i++) {
        tree.update(input(hand)); vt += 1000 / 60;
        if (carry) { if ((carry.handAfterMove === 'Left' ? 'left' : 'right') !== hand) carry.toSide(hand); carry.update(1 / 60, Math.min(1, mps / 6.4), true); }
        root.position.z -= mps / 60;
        scene.render();
        if (carry) { if (lastSide && carry.side !== lastSide) catchGaps.push(palmGap(carry.side)); lastSide = carry.side; }
        const now = nodes.map((x) => (x?.rotationQuaternion ?? Quaternion.Identity()).clone());
        if (mark && i < 30) worst = Math.max(worst, ...now.slice(2, 8).map((q, k) => ang(q, prev[k + 2])));
        if (mark && i < 24 && process.env.DETAIL === label + ph) console.log(`  f+${i} ${(A as unknown as { currentName: string }).currentName} ` + BONES.slice(2, 8).map((b, k) => `${b} ${ang(now[k + 2], prev[k + 2]).toFixed(1)}`).join(' ') + (carry ? ` | carry ${carry.side} ${carry.hand} gapL ${palmGap('Left').toFixed(2)} gapR ${palmGap('Right').toFixed(2)}` : ''));
        prev = now;
        F.push({ t: F.length / 60, ph: 'playing', q: pose(), r: [0, 0, 0], c: cidx((A as unknown as { currentName: string }).currentName ?? '') });
      }
      return worst;
    };
    step('right', 40 + ph * 4, false);
    changes.push(F.length); changeLoop.push(label);
    const w = step('left', 40, true);
    worstAll = Math.max(worstAll, w);
    rows.push(`${label.padEnd(5)} phase ${ph}: worst arm turn after the change ${w.toFixed(1)}°/frame`);
    step('left', 20, false); changes.push(F.length); changeLoop.push(label); step('right', 40, false);   // and back (counted below, not printed)
  }
}
const res = countPops(F, clips, BONES);
console.log(`blend ${blend}; twins registered ${twins.length}; overrides ${kv.join(' ') || 'none'}`);
console.log(rows.join('\n'));
const near = (i: number) => changes.some((c) => i >= c && i < c + 30);
const byLoop: Record<string, number> = {}; for (const e of res.hard as { i: number }[]) { const k = changes.findIndex((c) => e.i >= c && e.i < c + 30); if (k >= 0) byLoop[changeLoop[k]] = (byLoop[changeLoop[k]] ?? 0) + 1; }
console.log('hard events near a change, by loop: ' + JSON.stringify(byLoop));
console.log(`hand changes ${changes.length}: hard events within 30 frames of one ${res.hard.filter((e: { i: number }) => near(e.i)).length}, events ${res.events.filter((e: { i: number }) => near(e.i)).length}`);
catchGaps.sort((a, b) => a - b);
if (catchGaps.length) console.log(`the catching palm to the ball on the frame the hand flips: median ${catchGaps[Math.floor(catchGaps.length / 2)].toFixed(3)} m, p90 ${catchGaps[Math.floor(catchGaps.length * 0.9)].toFixed(3)} m (n ${catchGaps.length})`);
console.log(`TOTAL frames ${F.length}: pops ${res.pops.length}, events ${res.events.length}, HARD events ${res.hard.length}; worst arm turn after a change ${worstAll.toFixed(1)}°/frame`);
for (const e of res.hard.slice(0, 12)) console.log(`  hard ${Math.round(e.peak)}°/s at f${e.i} [${[...e.bones].join(',')}] ${e.from} -> ${e.to}`);
