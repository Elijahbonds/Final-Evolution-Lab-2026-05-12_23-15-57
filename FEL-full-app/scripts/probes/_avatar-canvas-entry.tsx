// T-POSE (owner playtest 2026-10-27): the 3D demo the Mirror's Quick Screen, Today's drill and the drills app mount
// (components/coach/exercise-avatar-canvas.tsx, via their drill-demo.tsx), alone, for the rig (scripts/probes/_tpose.mts).
// #canvas:<stat> mounts it with that stat, as each drill-demo does.
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import ExerciseAvatarCanvas from '@/components/coach/exercise-avatar-canvas';

// the rig reads the avatar's joints: every mixer's root is kept (the Avatar builds one per body)
const roots: THREE.Object3D[] = [];
const clipAction = THREE.AnimationMixer.prototype.clipAction;
THREE.AnimationMixer.prototype.clipAction = function (this: THREE.AnimationMixer, ...a: Parameters<typeof clipAction>) {
  const r = this.getRoot() as THREE.Object3D; if (!roots.includes(r)) roots.push(r);
  return clipAction.apply(this, a);
};
(window as unknown as { __rigJoints: () => unknown }).__rigJoints = () => {
  const r = roots[roots.length - 1]; if (!r) return null;
  r.updateMatrixWorld(true);
  const p = (n: string) => { let o: THREE.Object3D | undefined; r.traverse((x) => { if (!o && (x as THREE.Bone).isBone && x.name === n) o = x; }); const v = new THREE.Vector3(); o?.getWorldPosition(v); return o ? v : null; };
  const a = p('LeftArm'), e = p('LeftForeArm'), h = p('LeftHand'), hips = p('Hips'), head = p('Head'), foot = p('LeftFoot');
  return { armFromDownDeg: a && e ? Math.round(Math.acos((a.y - e.y) / a.distanceTo(e)) * 180 / Math.PI) : null, hand: h?.toArray(), hips: hips?.toArray(), head: head?.toArray(), foot: foot?.toArray() };
};

const [, stat = 'mobility'] = decodeURIComponent(location.hash.replace('#', '')).split(':');
createRoot(document.getElementById('root')!).render(createElement('div', { style: { width: 358, background: '#07070d' } }, createElement(ExerciseAvatarCanvas, { stat })));
