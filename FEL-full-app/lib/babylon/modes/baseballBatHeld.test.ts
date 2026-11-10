// BAT-GRIP-2 (2026-11-10): a bat is drawn only while both fists can be on it.
//
// placeTwoHandBat puts the handle between the batter's two fists every frame, whatever the arms are doing. The innings
// switches the bat on with the stance slot (baseballSlots §4), and the stance BLENDS in over 0.18 s from whatever the
// batter was doing: standing dejected after a strikeout, running a hit out, celebrating. For those first frames the arms
// are still the other clip's, the fists 0.5–0.8 m apart, and the bat hung in the air between two far-apart hands.
//
// This replays real at-bats headless, the way BaseballInningsMode.update does (BaseballSlots → SlotDriver →
// BaseballAnimTree → CharacterAnimator on the rig rig-grip-tests measures on, mountTwoHandBat on top), and reads on
// every 60 Hz frame how far apart the fists are and whether a bat is drawn.
import { describe, expect, it, vi } from 'vitest';
import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { buildRig } from '../characters/proceduralRig';
import { registerProceduralClips } from '../characters/proceduralClips';
import { registerAuthoredClips } from '../anim/authored';
import { CharacterAnimator } from '../anim/CharacterAnimator';
import { boneNode } from '../anim/boneLookup';
import { BaseballAnimTree, chooseBaseballClip, type BaseballAnimState } from '../anim/baseballTree';
import type { SpawnedCharacter } from '../core/CharacterLibrary';
import { BaseballSlots, SlotDriver } from './baseballSlots';
import type { SwingGrade } from './baseballGame';
import { mountTwoHandBat, batHeld, BAT_GRIP_LOST_M, BAT_PALM_M } from './baseballBat';

// bat.glb cannot load here (no XMLHttpRequest), and a load that never settles leaves the scene with a file pending, which
// keeps Babylon's animation clock from ever starting (Scene.animate returns early): every clip would 'play' and no bone
// would move. The prop answers "missing" instead, its documented path: the cylinder stays the look. The real file's fit
// and placement are baseballBatGrip.test.ts's.
vi.mock('../visual/meshyProps', async (orig) => ({ ...(await orig<typeof import('../visual/meshyProps')>()), spawnMeshyProp: async () => null }));

const DT = 1 / 60;
/** A free hand: rig-grip-tests' FREE_MIN. Fists this far apart are not two hands on one handle. */
const FREE_M = 0.4;
interface Frame { state: BaseballAnimState; sep: number; modeShows: boolean; drawn: boolean; held: boolean }

/** One batter on the procedural rig with the innings' own slots, tree and bat; `play` runs frames and records them. */
function atBat(startClip = 'baseball_bat_stance') {
  const engine = new NullEngine(); const scene = new Scene(engine);
  new FreeCamera('cam', new Vector3(0, 1, -5), scene);
  (engine as unknown as { getDeltaTime: () => number }).getDeltaTime = () => DT * 1000;
  scene.useConstantAnimationDeltaTime = true;
  const rig = buildRig(scene, 'default');
  const animator = new CharacterAnimator(scene, []);
  registerProceduralClips(animator, scene, rig.skeleton);
  registerAuthoredClips(animator, scene, rig.skeleton);
  animator.play(startClip, { loop: true, fadeSec: 0 });
  const tree = new BaseballAnimTree(animator);
  const slots = new BaseballSlots(0.6); const driver = new SlotDriver(tree, null);
  let batSec: number | null = null;
  const bat = mountTwoHandBat(scene, { root: rig.root, skeleton: rig.skeleton } as unknown as SpawnedCharacter, () => batSec)!;
  const node = (n: string) => boneNode(rig.skeleton, n)!;
  const fist = (h: string, f: string) => {
    const H = node(h), F = node(f); H.computeWorldMatrix(true); F.computeWorldMatrix(true);
    const p = H.getAbsolutePosition().clone(); return p.add(p.subtract(F.getAbsolutePosition()).normalize().scale(BAT_PALM_M));
  };
  const frames: Frame[] = [];
  /** One frame, in BaseballInningsMode.update's order: the slots, the trees, the bat's clock and switch, then the render. */
  const frame = (driven = true): Frame => {
    let state: BaseballAnimState = 'idle', modeShows = true;
    if (driven) {
      const f = slots.tick(DT); driver.apply(f); batSec = f.batSec; bat.setVisible(f.batVisible);
      state = chooseBaseballClip(f.batter).state; modeShows = f.batVisible;
    }
    scene.render();
    const wrap = scene.getTransformNodeByName(`${bat.carrier.name}_glb`);
    const fr: Frame = {
      state, modeShows, held: batHeld(bat.carrier),
      sep: Vector3.Distance(fist('LeftHand', 'LeftForeArm'), fist('RightHand', 'RightForeArm')),
      drawn: bat.carrier.isVisible || !!(wrap?.isEnabled() && wrap.getChildMeshes().length > 0),
    };
    frames.push(fr); return fr;
  };
  const play = (n: number, driven = true) => { for (let i = 0; i < n; i++) frame(driven); };
  return { slots, frames, frame, play, dispose: () => { bat.dispose(); scene.dispose(); engine.dispose(); } };
}

const grade = (kind: SwingGrade['kind']): SwingGrade => ({ kind, q: kind === 'whiff' ? 0 : 0.9, offsetSec: 0.02, missLine: 'LATE' });
/** The frames the OLD code drew a bat nobody held: the mode shows it, the fists a free hand's width apart. */
const strung = (fr: Frame[]) => fr.filter((f) => f.modeShows && f.sep > FREE_M);

const AT_BATS: [string, (s: BaseballSlots) => void, number][] = [
  ['a strikeout (swing, miss, stand dejected, back to the stance)', (s) => { s.swing(grade('whiff')); s.strikeout(); }, 150],
  ['a single (swing, run it out, back to the stance)', (s) => { const g = grade('single'); s.swing(g); s.contact(g); }, 360],
  ['a fly out (swing, dejected, back to the stance)', (s) => { const g = grade('out'); s.swing(g); s.contact(g); }, 150],
  ['a home run (the power swing, the hold, the celebration, the trot, back to the stance)', (s) => { const g = grade('homer'); s.swing(g); s.contact(g); }, 400],
];

describe('the innings batter: a bat is drawn only while both fists are on it', () => {
  for (const [label, event, n] of AT_BATS) {
    it(label, () => {
      const a = atBat();
      a.play(40);                       // the stance, held
      for (const f of a.frames) { expect(f.state).toBe('stance'); expect(f.drawn).toBe(true); expect(f.sep).toBeLessThan(0.15); }
      event(a.slots);
      a.play(n);
      const after = a.frames.slice(40);

      // THE CONTROL: this at-bat does pass through frames where the mode shows the bat and the fists are a free hand's
      // width apart (the blend back into the stance). The old code drew the bat on every one of them.
      expect(strung(after).length, 'the replay must reach the frames the old code strung the bat across').toBeGreaterThan(0);
      // the fix: no drawn bat between far-apart fists, on any frame
      for (const [i, f] of after.entries()) {
        if (f.drawn) expect(f.sep, `frame ${i} (${f.state}): a bat is drawn with the fists ${f.sep.toFixed(2)} m apart`).toBeLessThanOrEqual(FREE_M + 1e-6);
      }
      // the swing itself never loses the bat: drawn on every frame of the swing slots
      const swing = after.filter((f) => f.state === 'swing_contact' || f.state === 'swing_power');
      expect(swing.length).toBeGreaterThan(8);
      for (const f of swing) expect(f.drawn, `the bat vanished mid-swing (fists ${f.sep.toFixed(2)} m)`).toBe(true);
      // and it is back for the next pitch: 0.25 s into the stance the bat is in the hands again, and it stays
      const lastOther = after.reduce((at, f, i) => (f.state === 'stance' ? at : i), -1);
      const back = after.slice(lastOther + 1);
      expect(back.length, 'the replay must run on into the next stance').toBeGreaterThan(30);
      for (const f of back.slice(15)) { expect(f.drawn).toBe(true); expect(f.sep).toBeLessThan(0.15); }
      a.dispose();
    });
  }

  it('the shipped line is the free-hand line: the bat is lost where a hand is free', () => {
    expect(BAT_GRIP_LOST_M).toBeLessThanOrEqual(FREE_M);
  });

  it('a batter who is not in the stance yet (the first frames of a round) has no bat until the hands meet', () => {
    const a = atBat('idle_stand');      // spawned standing, as a body is before its stance clip holds the arms
    const first = a.frame(false);       // the mode shows the bat from the first frame (Derby never switches it off)
    expect(first.sep).toBeGreaterThan(FREE_M);
    expect(first.drawn, 'a bat is drawn on the very first frame, between hands that are not together').toBe(false);
    a.play(10, false);
    for (const f of a.frames) expect(f.drawn).toBe(false);
    a.dispose();
  });
});
