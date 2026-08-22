/**
 * scripts/anim-rebind-tests.ts — Phase 1 unit suite.
 *
 * Proves the invariants of the Phase 1 animation-binding remediation:
 *   A. glb-inspect audit: primary hero rig has 9 clips, 52-joint skeleton,
 *      ZERO unbound targets, and strike clips show REAL distinct motion (not
 *      bind-pose duplicates) via the probe-bone motion fingerprint.
 *   B. rebinder: exact-name match beats normalized; normalization strips
 *      mixamorig:/Armature|/fel_/separators/case; unmatched bones are reported
 *      with a closest candidate (never silently dropped); track rewrite retargets
 *      matched bones and drops unmatched ones loudly.
 *   C. clip-select: missing clip -> idle fallback (flagged), missing idle ->
 *      first-available (flagged), never bind pose; blend time floored at 0.15s.
 *
 * Run: yarn tsx scripts/anim-rebind-tests.ts
 */
import assert from 'node:assert';
import path from 'node:path';
import { inspectGlb, boneMotionRange } from '../lib/anim/glb-inspect';
import {
  normalizeBoneName,
  buildBoneMap,
  levenshtein,
  rebindClipTracks,
} from '../lib/anim/rebinder';
import {
  chooseClip,
  resolveBlendSeconds,
  resolveSpeed,
  MIN_BLEND_SECONDS,
} from '../lib/anim/clip-select';

const ROOT = path.resolve(__dirname, '..');
const HERO = path.join(ROOT, 'public', 'models', 'elijah-hero.glb');

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  \u2713 ${name}`);
}

// ---------------------------------------------------------------- A. audit
check('hero rig: 52-joint skeleton, 9 clips, zero unbound targets', () => {
  const r = inspectGlb(HERO, 'elijah-hero.glb');
  assert.strictEqual(r.skeletonJointCount, 52, 'hero skeleton must be 52 joints');
  assert.strictEqual(r.animationCount, 9, 'hero must ship 9 clips');
  const unbound = r.animations.reduce((s, a) => s + a.unresolvedTargets.length, 0);
  assert.strictEqual(unbound, 0, 'primary rig must have zero unbound targets');
  const names = r.animations.map((a) => a.name).sort();
  assert.deepStrictEqual(names, [
    'guard', 'high_kick', 'hook', 'jab', 'jumpshot', 'roundhouse', 'run', 'uppercut', 'walk',
  ]);
});

check('strike clips are REAL distinct motion (not bind-pose duplicates)', () => {
  const motion = boneMotionRange(HERO, 'RightForeArm');
  // Every strike must move the forearm meaningfully.
  for (const clip of ['jab', 'hook', 'uppercut']) {
    assert.ok((motion[clip] ?? 0) > 0.1, `${clip} must move RightForeArm (>0.1), got ${motion[clip]}`);
  }
  // And they must differ from one another (not the same clip re-labelled).
  assert.notStrictEqual(motion['jab'], motion['hook']);
  assert.notStrictEqual(motion['hook'], motion['uppercut']);
});

check('kick clip moves the leg chain', () => {
  const motion = boneMotionRange(HERO, 'LeftUpLeg');
  assert.ok((motion['high_kick'] ?? 0) > 0.1, 'high_kick must move LeftUpLeg');
});

// ------------------------------------------------------------ B. rebinder
check('normalizeBoneName strips decoration + separators + case', () => {
  assert.strictEqual(normalizeBoneName('mixamorig:LeftArm'), 'leftarm');
  assert.strictEqual(normalizeBoneName('fel_Left_Arm'), 'leftarm');
  assert.strictEqual(normalizeBoneName('Armature|LeftArm'), 'leftarm');
  assert.strictEqual(normalizeBoneName('LeftArm.quaternion'), 'leftarm');
  assert.strictEqual(normalizeBoneName('Left Arm'), 'leftarm');
  assert.strictEqual(normalizeBoneName('RightForeArm'), 'rightforearm');
});

check('buildBoneMap: exact match beats normalized', () => {
  const m = buildBoneMap(['Hips', 'LeftArm'], ['Hips', 'LeftArm', 'RightArm']);
  assert.strictEqual(m.unmatchedCount, 0);
  assert.ok(m.matched.every((x) => x.kind === 'exact'));
  assert.strictEqual(m.map['Hips'], 'Hips');
});

check('buildBoneMap: normalized match across rigs (mixamorig -> hero)', () => {
  const src = ['mixamorig:Hips', 'mixamorig:LeftArm', 'Armature|RightUpLeg'];
  const tgt = ['Hips', 'LeftArm', 'RightUpLeg'];
  const m = buildBoneMap(src, tgt);
  assert.strictEqual(m.unmatchedCount, 0, 'all should match after normalization');
  assert.ok(m.matched.every((x) => x.kind === 'normalized'));
  assert.strictEqual(m.map['mixamorig:LeftArm'], 'LeftArm');
});

check('buildBoneMap: unmatched bone reported with closest candidate', () => {
  const m = buildBoneMap(['LeftArm', 'Tail01'], ['LeftArm', 'RightArm', 'Spine']);
  assert.strictEqual(m.unmatchedCount, 1);
  const miss = m.unmatched[0];
  assert.strictEqual(miss.source, 'Tail01');
  assert.ok(miss.closestCandidate !== null, 'must suggest a closest candidate');
  assert.ok(miss.closestDistance >= 0);
});

check('levenshtein basic distances', () => {
  assert.strictEqual(levenshtein('abc', 'abc'), 0);
  assert.strictEqual(levenshtein('abc', 'abd'), 1);
  assert.strictEqual(levenshtein('', 'abc'), 3);
});

check('rebindClipTracks retargets matched + drops unmatched loudly', () => {
  const clip = {
    name: 'test',
    duration: 1,
    tracks: [
      { name: 'mixamorig:Hips.quaternion' },
      { name: 'mixamorig:LeftArm.position' },
      { name: 'Tail01.quaternion' },
    ],
  };
  const misses: string[] = [];
  const res = rebindClipTracks(
    clip as any,
    ['mixamorig:Hips', 'mixamorig:LeftArm', 'Tail01'],
    ['Hips', 'LeftArm', 'Spine'],
    {
      onUnmatched: (m) => misses.push(m.source),
      makeClip: (name, duration, tracks) => ({ name, duration, tracks }) as any,
    },
  );
  assert.strictEqual(res.keptTracks, 2, 'two matched tracks retargeted');
  assert.deepStrictEqual(res.droppedTracks, ['Tail01.quaternion']);
  assert.deepStrictEqual(misses, ['Tail01'], 'unmatched reported');
  assert.strictEqual(res.clip.tracks[0].name, 'Hips.quaternion');
  assert.strictEqual(res.clip.tracks[1].name, 'LeftArm.position');
});

// ---------------------------------------------------------- C. clip-select
check('chooseClip: requested present plays it', () => {
  const c = chooseClip('jab', ['jab', 'guard', 'run'], 'guard');
  assert.strictEqual(c.clip, 'jab');
  assert.strictEqual(c.didFallback, false);
});

check('chooseClip: missing clip -> idle fallback, flagged (never bind pose)', () => {
  const c = chooseClip('spinkick', ['jab', 'guard', 'run'], 'guard');
  assert.strictEqual(c.clip, 'guard');
  assert.strictEqual(c.didFallback, true);
  assert.strictEqual(c.reason, 'idle-fallback');
});

check('chooseClip: missing clip AND missing idle -> first available, flagged', () => {
  const c = chooseClip('spinkick', ['jab', 'run'], 'guard');
  assert.strictEqual(c.clip, 'jab');
  assert.strictEqual(c.didFallback, true);
  assert.strictEqual(c.reason, 'idle-missing');
});

check('resolveBlendSeconds floors at 0.15 (no hard-cut)', () => {
  assert.strictEqual(resolveBlendSeconds(undefined), MIN_BLEND_SECONDS);
  assert.strictEqual(resolveBlendSeconds(0), MIN_BLEND_SECONDS);
  assert.strictEqual(resolveBlendSeconds(0.05), MIN_BLEND_SECONDS);
  assert.strictEqual(resolveBlendSeconds(0.5), 0.5);
});

check('resolveSpeed clamps to positive sane range', () => {
  assert.strictEqual(resolveSpeed(undefined), 1);
  assert.strictEqual(resolveSpeed(0), 1);
  assert.strictEqual(resolveSpeed(-2), 1);
  assert.strictEqual(resolveSpeed(10), 4);
  assert.strictEqual(resolveSpeed(1.5), 1.5);
});

console.log(`\n✅ anim-rebind-tests: ${passed} checks passed`);
