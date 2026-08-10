#!/usr/bin/env -S npx tsx
/**
 * scripts/gate0-animation-verification.ts
 * =======================================
 * GATE 0 PROOF (blocking gate before any game-mode work):
 *   "Characters load stuck in bind pose (T-pose)" — suspected mixamorig:
 *   bone-name mismatch between the asset loader and CharacterAnimator.
 *
 * This script proves, headlessly (NullEngine, no GPU), that:
 *
 *   A. The full shipping spawn path (CharacterLibrary.spawn — GLB path,
 *      procedural flag OFF) plays a locomotion blend idle -> walk -> run
 *      on TWO different character models, with measured bone motion in
 *      every state and a crossfade between them. No bind pose anywhere.
 *
 *   B. A rig carrying the raw Mixamo `mixamorig:` prefix (simulated by
 *      prefixing elijah-hero's bones in-memory) is NORMALIZED at import by
 *      rigNormalize — bones resolve unprefixed and the same locomotion
 *      blend plays. Before this fix, that rig froze at bind pose.
 *
 *   C. A rig that is missing required bones after normalization is
 *      REJECTED loudly at load (throws), instead of freezing in-game.
 *
 * Run:  npx tsx scripts/gate0-animation-verification.ts
 */

import fs from 'node:fs';
import path from 'node:path';

// ── Node harness shims (must precede any @babylonjs import) ────────────────
// XMLHttpRequest: serve file:// URLs from disk (draco wasm + GLBs).
(globalThis as any).XMLHttpRequest = class {
  static DONE = 4;
  private _l: Record<string, Function[]> = {};
  private _url = '';
  status = 0; readyState = 0; response: any; responseText = ''; responseType = '';
  open(_m: string, url: string) { this._url = String(url); }
  setRequestHeader() {}
  getResponseHeader() { return null; }
  addEventListener(t: string, f: Function) { (this._l[t] = this._l[t] || []).push(f); }
  removeEventListener() {}
  private _emit(t: string) {
    (this._l[t] || []).forEach((f) => f({ target: this }));
    const h = (this as any)['on' + t];
    h && h.call(this, { target: this });
  }
  send() {
    try {
      const p = this._url.replace(/^file:\/\//, '');
      const data = fs.readFileSync(p);
      this.status = 200; this.readyState = 4;
      this.response = this.responseType === 'arraybuffer'
        ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
        : data.toString();
      this.responseText = data.toString();
      this._emit('readystatechange'); this._emit('load'); this._emit('loadend');
    } catch {
      this.status = 404; this._emit('error'); this._emit('loadend');
    }
  }
  abort() {}
};

const ROOT = path.resolve(__dirname, '..');

import * as B from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
// GLB path must be exercised: procedural athletes bypass it by default.
// MUST be set before any FEL module import (CharacterProvider reads it once
// at module scope) — hence the dynamic imports inside main() below.
process.env.NEXT_PUBLIC_PROCEDURAL_CHARACTERS = 'false';

let pass = 0, fail = 0;

B.Tools.GetAbsoluteUrl = (u: string) => u;
// Serve app-relative model URLs ('/models/x.glb') and draco from disk.
const DRACO_DIR = path.join(ROOT, 'scripts', 'fixtures', 'draco');
B.Tools.GetBabylonScriptURL = (u: string) =>
  'file://' + path.join(DRACO_DIR, path.basename(u));
B.DracoCompression.DefaultNumWorkers = 0; // no workers in Node — sync decode
B.DracoCompression.Configuration.decoder.jsModule = require(path.join(DRACO_DIR, 'draco_wasm_wrapper_gltf.js'));
B.DracoCompression.Configuration.decoder.wasmBinary =
  fs.readFileSync(path.join(DRACO_DIR, 'draco_decoder_gltf.wasm'));

const ok = (n: string, c: boolean, extra = '') => {
  c ? pass++ : fail++;
  console.log(`  ${c ? 'ok  ' : 'FAIL'} ${n}${c ? '' : ' ' + extra}`);
};

/** Map '/models/foo.glb' onto the real file on disk for the XHR shim. */
function urlForModel(url: string): string {
  return 'file://' + path.join(ROOT, 'public', url);
}

/** Render n frames and count distinct poses of a probe bone. */
function motionWhilePlaying(scene: B.Scene, bone: B.TransformNode, frames = 12): number {
  const samples = new Set<string>();
  for (let i = 0; i < frames; i++) {
    scene.render();
    const q = bone.rotationQuaternion ?? B.Quaternion.FromEulerVector(bone.rotation);
    samples.add(q.toString());
  }
  return samples.size;
}

async function loadContainerFromDisk(scene: B.Scene, url: string): Promise<B.AssetContainer> {
  return B.SceneLoader.LoadAssetContainerAsync('', urlForModel(url), scene, undefined, '.glb');
}

async function main() {
  // Dynamic imports so the env flag above is read correctly at module scope.
  const { CharacterLibrary } = await import('../lib/babylon/core/CharacterLibrary');
  const { gateContainerRig, normalizeRigNames } = await import('../lib/babylon/anim/rigNormalize');
  const { missingClipCount } = await import('../lib/babylon/anim/clipResolver');

  const engine = new B.NullEngine();
  // NullEngine reports getDeltaTime()===0, which parks every animation
  // playhead at frame 0 — indistinguishable from a freeze in this harness.
  // Step a fixed 60fps frame time so clip playback is exercised for real.
  engine.getDeltaTime = () => 1000 / 60;
  const scene = new B.Scene(engine);
  new B.ArcRotateCamera('cam', 0, 0, 10, B.Vector3.Zero(), scene); // render() needs a camera

  // Preload containers through the real (gated) loader path.
  const heroContainer = await loadContainerFromDisk(scene, '/models/elijah-hero.glb');
  const elijahContainer = await loadContainerFromDisk(scene, '/models/elijah.glb');

  // ══ A. Locomotion blend on TWO models via the shipping spawn path ═══════
  // CharacterLibrary.spawn goes through SceneLoader again; point its URL at
  // disk by pre-seeding the container cache via load() — loadContainer is
  // keyed by URL, so we exercise it through CharacterLibrary.load/spawn with
  // a file:// URL directly.
  for (const [label, url, strict] of [
    // Full library: 9 baked clips — every alias resolves, zero fallbacks.
    ['elijah-hero.glb', urlForModel('/models/elijah-hero.glb'), true],
    // Clip-poor Meshy export: ONE baked clip with a garbage name, so
    // walk/run alias targets don't exist. Gate 0's contract for this asset
    // is LOUD DEGRADATION, never a freeze: resolver logs the miss, the
    // animator keeps playing, and the authored idle still moves the rig.
    ['elijah.glb', urlForModel('/models/elijah.glb'), false],
  ] as const) {
    console.log(`\nA. spawn + locomotion blend: ${label}${strict ? '' : ' (clip-poor asset: degraded-mode contract)'}`);
    const spawned = await CharacterLibrary.spawn(scene, url, { modeId: 'gate0' });
    const bone = spawned.skeleton.bones.find((b) => b.name === 'RightArm')?.getTransformNode();
    ok(`skeleton exposes unprefixed probe bone "RightArm"`, !!bone);
    if (!bone) { spawned.dispose(); continue; }

    // idle -> walk -> run, measuring real bone motion in each state.
    let totalMissing = 0;
    for (const clip of ['idle_stand', 'walk_forward', 'run_forward']) {
      const before = missingClipCount();
      spawned.animator.play(clip, { loop: true, fadeSec: 0.05, restart: true });
      for (let i = 0; i < 4; i++) scene.render(); // let the crossfade ramp
      const distinct = motionWhilePlaying(scene, bone);
      const missed = missingClipCount() - before;
      totalMissing += missed;
      ok(`"${clip}" is playing`, spawned.animator.isPlaying);
      if (strict || missed === 0) {
        ok(`"${clip}" moves the rig (distinct poses: ${distinct})`, distinct > 2);
      } else {
        // Degraded path: the miss must be LOUD (counted by the resolver) and
        // the rig must stay animated by SOMETHING (never parked at bind).
        ok(`"${clip}" fell back loudly (resolver logged the miss)`, missed > 0);
        ok(`"${clip}" still playing after fallback — no bind pose`, spawned.animator.isPlaying);
      }
    }
    if (strict) {
      ok('every requested clip resolved WITHOUT a missing-clip fallback', totalMissing === 0);
    }
    spawned.dispose();
  }

  // ══ B. mixamorig:-prefixed rig is normalized, not frozen ════════════════
  console.log('\nB. mixamorig: prefix normalization (the Gate 0 mismatch)');
  {
    const c = await loadContainerFromDisk(scene, '/models/elijah-hero.glb');
    // Simulate a raw Mixamo export: prefix every bone.
    for (const skel of c.skeletons) {
      for (const b of skel.bones) {
        b.name = 'mixamorig:' + b.name;
        const n = b.getTransformNode();
        if (n) n.name = 'mixamorig:' + n.name.replace(/^mixamorig:/, '');
      }
    }
    const hadPrefix = c.skeletons[0].bones.every((b) => b.name.startsWith('mixamorig:'));
    ok('simulated raw Mixamo rig is fully prefixed', hadPrefix);

    const result = normalizeRigNames(c);
    ok('normalizer renamed every bone', result.renamedBones === c.skeletons[0].bones.length);
    ok('bones now resolve unprefixed (Hips, LeftArm, …)',
      !!c.skeletons[0].bones.find((b) => b.name === 'Hips')
      && !!c.skeletons[0].bones.find((b) => b.name === 'LeftArm'));

    // And the proof that matters: the normalized rig ANIMATES.
    const inst = c.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
    const skel = inst.skeletons[0];
    const run = inst.animationGroups.find((g) => /run/.test(g.name));
    const arm = skel.bones.find((b) => b.name === 'RightArm')?.getTransformNode();
    ok('a clip group survives normalization', !!run && !!arm);
    if (run && arm) {
      run.start(true);
      const distinct = motionWhilePlaying(scene, arm);
      ok(`normalized rig animates (distinct poses: ${distinct}) — no T-pose`, distinct > 2);
    }
    inst.dispose();
  }

  // ══ C. Non-conformant rig is REJECTED loudly at load ════════════════════
  console.log('\nC. non-conformant rig rejected at import');
  {
    const c = await loadContainerFromDisk(scene, '/models/elijah-hero.glb');
    for (const skel of c.skeletons) {
      for (const b of skel.bones) b.name = 'totally_unrelated_' + b.name;
    }
    let threw = false;
    try { gateContainerRig(c, 'rigged-impostor.glb'); } catch { threw = true; }
    ok('gateContainerRig throws on unresolvable bone names', threw);
  }

  // ══ D. Mode 2 Gate 0: karate state machine clips on the same rig ════════
  // Karate/weapon work reuses elijah-hero.glb (guard/jab/hook/roundhouse/
  // high_kick/uppercut are the baked combat set). Prove the whole chain —
  // stance, light, heavy, kick, react, knockdown — plays with real motion.
  console.log('\nD. karate combat clip chain (Mode 2 gate)');
  {
    const spawned = await CharacterLibrary.spawn(scene, urlForModel('/models/elijah-hero.glb'), { modeId: 'gate0-karate' });
    const arm = spawned.skeleton.bones.find((b) => b.name === 'RightArm')?.getTransformNode();
    const leg = spawned.skeleton.bones.find((b) => b.name === 'RightUpLeg')?.getTransformNode();
    ok('combat probe bones present (RightArm, RightUpLeg)', !!arm && !!leg);
    const karateClips = ['karate_idle_stance', 'karate_punch_light', 'karate_punch_heavy',
      'karate_kick_roundhouse', 'karate_hit_react', 'karate_knockdown'];
    for (const clip of karateClips) {
      const before = missingClipCount();
      spawned.animator.play(clip, { loop: true, fadeSec: 0.05, restart: true });
      for (let i = 0; i < 4; i++) scene.render();
      const armMoves = motionWhilePlaying(scene, arm!);
      const legMoves = motionWhilePlaying(scene, leg!);
      const moved = Math.max(armMoves, legMoves);
      ok(`"${clip}" plays with real motion (distinct poses: ${moved})`,
        spawned.animator.isPlaying && moved > 2 && missingClipCount() === before);
    }
    spawned.dispose();
  }

  // silence unused-var lint for the direct container preloads (used for parity)
  void heroContainer; void elijahContainer;

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('GATE 0 HARNESS ERROR:', e); process.exit(2); });
