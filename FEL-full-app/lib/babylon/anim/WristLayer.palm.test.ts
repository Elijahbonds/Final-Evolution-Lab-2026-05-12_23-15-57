// DUNK MOTION phase 9 (2026-09-23): the forearm turns the palm over the ball, and the hand stays where it was.
import { NullEngine, Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { describe, expect, it } from 'vitest';
import { pronateToward } from './WristLayer';

describe('pronateToward', () => {
  it('turns the palm to face the wanted way (within the cap) without moving the hand', () => {
    const scene = new Scene(new NullEngine());
    const upper = new TransformNode('arm', scene); upper.rotationQuaternion = Quaternion.FromEulerAngles(0.2, 0.4, 0.1); upper.position.set(0, 1.5, 0);
    const fore = new TransformNode('fore', scene); fore.parent = upper; fore.position.set(0, 0.3, 0); fore.rotationQuaternion = Quaternion.RotationAxis(new Vector3(1, 0, 0), 0.5);
    const hand = new TransformNode('hand', scene); hand.parent = fore; hand.position.set(0, 0.27, 0); hand.rotationQuaternion = Quaternion.Identity();
    for (const n of [upper, fore, hand]) n.computeWorldMatrix(true);
    const palmLocal = new Vector3(0, 0, 1);   // the ball sits off the palm along the hand's local +z
    const handBefore = hand.getAbsolutePosition().clone();
    const want = new Vector3(0, -1, 0);
    pronateToward(fore, hand, palmLocal, want, 1, 180);
    const axis = hand.getAbsolutePosition().subtract(fore.getAbsolutePosition()).normalize();
    const flat = (v: Vector3) => v.subtract(axis.scale(Vector3.Dot(v, axis))).normalize();
    const palmNow = palmLocal.applyRotationQuaternion(hand.absoluteRotationQuaternion);
    expect(Vector3.Dot(flat(palmNow), flat(want))).toBeGreaterThan(0.999);
    expect(Vector3.Distance(hand.getAbsolutePosition(), handBefore)).toBeLessThan(1e-5);
  });
  it('never turns past the cap, and a zero weight is no turn', () => {
    const scene = new Scene(new NullEngine());
    const fore = new TransformNode('fore', scene); fore.rotationQuaternion = Quaternion.Identity();
    const hand = new TransformNode('hand', scene); hand.parent = fore; hand.position.set(0, 0.27, 0); hand.rotationQuaternion = Quaternion.Identity();
    fore.computeWorldMatrix(true); hand.computeWorldMatrix(true);
    expect(pronateToward(fore, hand, new Vector3(0, 0, 1), new Vector3(0, 0, -1), 0, 110)).toBe(0);
    expect(Math.abs(pronateToward(fore, hand, new Vector3(0, 0, 1), new Vector3(0, 0, -1), 1, 110))).toBeCloseTo(110 * Math.PI / 180, 5);
  });
});
