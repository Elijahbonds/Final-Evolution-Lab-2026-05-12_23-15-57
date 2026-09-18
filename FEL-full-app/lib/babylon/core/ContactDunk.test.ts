// Is he dunked ON, or dunked NEXT TO?
//
// The poster already floored a defender and shook the camera. What it did not do was keep him in the
// picture — the bump shoved him off the drive line, so the slam landed beside a bystander. These tests are
// about geometry: is the victim actually between the dunker and the ring when the ball goes through.

import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  dunkKindFor, isContactDunk, posterPlant, posterFall, contactBanner, contactHitStopMs,
  POSTER_STANDOFF, POSTER_RELEASE_K,
} from './ContactDunk';

const RIM = new Vector3(0, 0, -0.6);

describe('which dunk is this', () => {
  it('nobody there is a clean slam', () => {
    expect(dunkKindFor({ strength01: 0, set: false, present: false })).toBe('clean');
  });

  it('a body beaten LATE is a shoulder you went through, not a poster', () => {
    expect(dunkKindFor({ strength01: 0.8, set: false, present: true })).toBe('through');
  });

  it('a SET body under the rim is a poster', () => {
    expect(dunkKindFor({ strength01: 0.3, set: true, present: true })).toBe('poster');
  });

  it('a set body plus a hard contest you still finished is a BODY BAG', () => {
    expect(dunkKindFor({ strength01: 0.8, set: true, present: true })).toBe('body_bag');
  });

  it('only a poster or a body bag pulls him into the animation', () => {
    // dragging a late-sliding defender under the rim would read as a teleport
    expect(isContactDunk('through')).toBe(false);
    expect(isContactDunk('clean')).toBe(false);
    expect(isContactDunk('poster')).toBe(true);
    expect(isContactDunk('body_bag')).toBe(true);
  });
});

describe('chest to chest: the victim is BETWEEN the dunker and the ring', () => {
  it('he is planted on the side the drive is coming from', () => {
    const dunker = new Vector3(0, 0, 5);                 // driving from +z
    const { spot } = posterPlant(RIM, dunker);
    expect(spot.z).toBeGreaterThan(RIM.z);               // between the rim and me
    expect(spot.z).toBeLessThan(dunker.z);               // and not out at my feet
  });

  it('he stands a body off the ring, not under it', () => {
    const { spot } = posterPlant(RIM, new Vector3(0, 0, 5));
    expect(Math.hypot(spot.x - RIM.x, spot.z - RIM.z)).toBeCloseTo(POSTER_STANDOFF, 5);
  });

  it('the plant follows the drive line from ANY angle, not one axis', () => {
    for (const from of [new Vector3(4, 0, 4), new Vector3(-5, 0, 2), new Vector3(0, 0, -6)]) {
      const { spot } = posterPlant(RIM, from);
      const toSpot = new Vector3(spot.x - RIM.x, 0, spot.z - RIM.z).normalize();
      const toDunker = new Vector3(from.x - RIM.x, 0, from.z - RIM.z).normalize();
      expect(Vector3.Dot(toSpot, toDunker)).toBeCloseTo(1, 4);   // same bearing off the rim
    }
  });

  it('he FACES the dunker — he is contesting it, not watching it', () => {
    const dunker = new Vector3(0, 0, 5);
    const { spot, faceYaw } = posterPlant(RIM, dunker);
    const expected = Math.atan2(dunker.x - spot.x, dunker.z - spot.z);
    expect(faceYaw).toBeCloseTo(expected, 6);
  });

  it('a dunker standing exactly on the rim does not produce a NaN plant', () => {
    const { spot, faceYaw } = posterPlant(RIM, RIM.clone());
    expect(Number.isFinite(spot.x) && Number.isFinite(spot.z)).toBe(true);
    expect(Number.isFinite(faceYaw)).toBe(true);
  });
});

describe('how he goes down', () => {
  it('he falls BACKWARD away from the ring, the way he was leaning', () => {
    const victim = new Vector3(0, 0, 0.35);              // between rim (z -0.6) and the drive
    const fall = posterFall(RIM, victim, 'poster');
    expect(fall.z).toBeGreaterThan(0);                   // away from the rim, not sideways
    expect(fall.y).toBeGreaterThan(0);                   // and off his feet
  });

  it('a body bag puts him down harder than a poster', () => {
    const victim = new Vector3(0, 0, 0.35);
    expect(posterFall(RIM, victim, 'body_bag').length())
      .toBeGreaterThan(posterFall(RIM, victim, 'poster').length());
  });

  it('he is let go at the flush, so the fall happens AFTER the ball is through', () => {
    expect(POSTER_RELEASE_K).toBeGreaterThan(0.5);
    expect(POSTER_RELEASE_K).toBeLessThan(1);
  });
});

describe('the crowd is told what it just saw', () => {
  it('each kind has its own call, loudest for the body bag', () => {
    expect(contactBanner('body_bag')).toMatch(/BODY BAG/);
    expect(contactBanner('poster')).toMatch(/POSTER/);
    expect(contactBanner('through')).toMatch(/CONTACT/);
    expect(contactBanner('clean')).toBe('SLAM!');
  });

  it('the frame holds longer the bigger the contact', () => {
    expect(contactHitStopMs('body_bag')).toBeGreaterThan(contactHitStopMs('poster'));
    expect(contactHitStopMs('poster')).toBeGreaterThan(contactHitStopMs('through'));
    expect(contactHitStopMs('through')).toBeGreaterThan(contactHitStopMs('clean'));
  });
});
