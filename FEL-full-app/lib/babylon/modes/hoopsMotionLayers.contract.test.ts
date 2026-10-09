// HOOPS MOTION phase 3c — "The dunk pass's tooling, ported", the modes' side of it (plan §3). The modes are one closure over a scene each,
// so their contract is read off the source (hoopsFeet.contract.test's pattern): the motion layers are mounted on every hoops body (1v1
// player and rival, every 3v3 body inside spawnBody, the 3PT shooter) with the side lean right after the body's posture layer and the
// hinge after every other arm writer; the Dunk Duel's two bodies get the hinge; DunkMode builds its layers through MotionLayers.forBody
// (the extraction); and the posture layer's hip-yaw strip never runs on a planted body (hipYawKeep 1 on every ground window).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { HOOPS_POSTURE, hoopsWindow, HOOPS_INPUT_IDLE, type HoopsPostureInput } from '../core/HoopsPosture';

const read = (rel: string) => readFileSync(path.join(__dirname, rel), 'utf8');
const one = read('OneVOneMode.ts'), three = read('ThreeVThreeMode.ts'), tp = read('ThreePointMode.ts'), duel = read('DunkDuelMode.ts'), dunk = read('DunkMode.ts');
const at = (src: string, re: RegExp): number => { const m = re.exec(src); expect(m, String(re)).not.toBeNull(); return m!.index; };

describe('the motion layers on every hoops body, in the layers\' order', () => {
  it('1v1: both bodies — after their posture layers (the lean), before the carries (their reach solves on the leaned chest); the hinge after the rim reaches', () => {
    const pp = at(one, /foePosture = mountPostureLayer\(/), me = at(one, /meLayers = mountMotionLayers\(\{ scene: ctx\.scene, skeleton: me\.skeleton, root: me\.root, ball, hinge: false \}\)/);
    const foe = at(one, /foeLayers = mountMotionLayers\(\{ scene: ctx\.scene, skeleton: foe\.skeleton, root: foe\.root, ball, hinge: false \}\)/);
    const carry = at(one, /meCarry = mountBallCarry\(/), reach = at(one, /foeReach = mountRimReach\(/), hinge = at(one, /meLayers\.mountHinge\(\); foeLayers\.mountHinge\(\);/);
    expect(pp).toBeLessThan(me); expect(me).toBeLessThan(foe); expect(foe).toBeLessThan(carry); expect(reach).toBeLessThan(hinge);
    expect(one).toMatch(/meLayers\?\.dispose\(\); foeLayers\?\.dispose\(\); meLayers = null; foeLayers = null;/);
    expect((one.match(/meLayers\?\.reset\(\); foeLayers\?\.reset\(\);/g) ?? []).length).toBe(2);   // both check-ups
  });
  it('3v3: inside spawnBody, right after the body\'s posture layer; the ball and the hinge once the carries and the reach are on', () => {
    const spawn = three.slice(three.indexOf('const spawnBody = async ('), three.indexOf('localSource = new LocalInputSource();'));
    expect(spawn).toMatch(/body\.posture = mountPostureLayer\([^\n]*\n(\s*\/\/[^\n]*\n)*\s*body\.layers = mountMotionLayers\(\{ scene: ctx\.scene, skeleton: char\.skeleton, root: char\.root, hinge: false \}\);/);
    const carries = at(three, /carries\.set\(b, mountBallCarry\(/), reach = at(three, /meReach = mountRimReach\(/), hinge = at(three, /b\.layers\?\.setBall\(ball\); b\.layers\?\.mountHinge\(\);/);
    expect(carries).toBeLessThan(hinge); expect(reach).toBeLessThan(hinge);
    expect(three).toMatch(/b\.layers\?\.reset\(\); \}/);
    expect(three).toMatch(/b\?\.layers\?\.dispose\(\);/);
  });
  it('3PT: the shooter — after the posture layer, before the carry; the hinge after the carry', () => {
    const pp = at(tp, /posture = mountPostureLayer\(ctx\.scene, player\.skeleton/), m = at(tp, /layers = mountMotionLayers\(\{ scene: ctx\.scene, skeleton: player\.skeleton, root: player\.root, ball, hinge: false \}\)/);
    const carry = at(tp, /carry = mountBallCarry\(\{ scene: ctx\.scene, ball, root: player\.root/), hinge = at(tp, /layers\.mountHinge\(\);/);
    expect(pp).toBeLessThan(m); expect(m).toBeLessThan(carry); expect(carry).toBeLessThan(hinge);
    expect(tp).toMatch(/layers\?\.dispose\(\); layers = null;/);
  });
  it('Dunk Duel: both duellists get the hinged arm, after the reach (their last writer)', () => {
    const ik = at(duel, /handIkObs = ctx\.scene\.onAfterAnimationsObservable\.add\(handIkApply\);/), h = at(duel, /hinges = \[p1, p2\]\.map\(\(c\) => mountMotionLayers\(\{ scene: ctx\.scene, skeleton: c\.skeleton, root: c\.root, drag: false, lean: false \}\)\)/);
    expect(ik).toBeLessThan(h);
    expect(duel).toMatch(/for \(const h of hinges\) h\.dispose\(\); hinges = \[\];/);
  });
  it('DunkMode: the layers come from MotionLayers.forBody (the extraction) and are called where they were — the contest unchanged', () => {
    expect(dunk).toMatch(/motion = MotionLayers\.forBody\(player\.skeleton, \{ bind: hipsBf, arms, meshes: [^\n]*wrists: true \}\);\s+limbDrag = motion\.drag; wristLayer = motion\.wrists;/);
    expect(dunk).toMatch(/motion\?\.applyHinges\(dt, ikFrame, ARM_TWIST_RATE_DEG\)/);
    expect(dunk).not.toMatch(/LimbDrag\.forRig\(/);
    expect(dunk).not.toMatch(/makeHingeArm\(/);
    // the hinge observer still registers after the dribble's own IK (the same slot)
    expect(at(dunk, /dribble = mountBallCarry\(/)).toBeLessThan(at(dunk, /hingeObs = ctx\.scene\.onAfterAnimationsObservable\.add\(/));
    expect(dunk).toMatch(/applyLimbDrag\(\);       \/\/ DUNK MOTION phase 3: first, on the clips' own values/);
  });
});

describe('the posture layer never swings a planted body (plan §3 "Posture layer ordering")', () => {
  // It registers after FootPlanting and rewrites the Hips' yaw: a pose with hipYawKeep below 1 would turn the pelvis over planted feet.
  // Every window a body on the floor can be in keeps the clip's whole hip yaw; only the drive dunk's flight windows (the body in the air)
  // strip it.
  it('every hoops window without a flight has hipYawKeep 1; the ones that strip are the flight\'s', () => {
    const seen = new Set<string>();
    const roles: HoopsPostureInput['role'][] = ['idle', 'offense', 'defense'] as never;
    for (const role of roles) for (const hasBall of [false, true]) for (const speed01 of [0, 0.3, 0.7, 1]) for (const shot of ['none', 'gather', 'load', 'release', 'follow', 'post', 'fade', 'hook', 'pump', 'footwork'] as const)
      for (const extra of [{}, { landed: true }, { landed: true, celebrate: true }, { celebrate: true }, { reaching: true }, { staggered: true }, { floored: true }, { spinning: true }, { posting: true }, { nearestDefender: 1 }])
        seen.add(hoopsWindow({ ...HOOPS_INPUT_IDLE, role, hasBall, speed01, shot: shot as never, flight: null, ...extra } as HoopsPostureInput));
    expect(seen.size).toBeGreaterThan(8);
    for (const w of seen) expect(HOOPS_POSTURE[w as keyof typeof HOOPS_POSTURE].hipYawKeep, w).toBe(1);
    const strips = Object.entries(HOOPS_POSTURE).filter(([, p]) => p.hipYawKeep < 1).map(([w]) => w).sort();
    expect(strips).toEqual(['brace', 'extend', 'hang', 'jam', 'rise']);
    for (const k of [0, 0.1, 0.3, 0.5, 0.7, 0.99]) expect(strips).toContain(hoopsWindow({ ...HOOPS_INPUT_IDLE, flight: { k, made: k > 0.6 ? true : null } }));
  });
});
