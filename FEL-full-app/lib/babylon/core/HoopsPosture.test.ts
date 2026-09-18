import { describe, expect, it } from 'vitest';
import { HOOPS_INPUT_IDLE, HOOPS_LEGS, HOOPS_POSTURE, hoopsPose, hoopsWindow, type HoopsPostureInput } from './HoopsPosture';
import { POSTURE } from './DunkPosture';
import { LEGS } from './DunkLegs';

const I = (o: Partial<HoopsPostureInput>): HoopsPostureInput => ({ ...HOOPS_INPUT_IDLE, ...o });

describe('hoops posture windows', () => {
  it('every window has a stance and feet', () => {
    for (const w of Object.keys(HOOPS_POSTURE)) {
      expect(HOOPS_LEGS[w as keyof typeof HOOPS_LEGS]).toBeDefined();
      const p = HOOPS_POSTURE[w as keyof typeof HOOPS_POSTURE];
      expect(p.weight).toBeGreaterThanOrEqual(0); expect(p.weight).toBeLessThanOrEqual(1);
      expect(p.eyes).toBeGreaterThanOrEqual(0); expect(p.chestAim).toBeGreaterThanOrEqual(0);
    }
  });
  it('the flight windows ARE the dunk contest\'s (one table for every dunker)', () => {
    expect(HOOPS_POSTURE.rise).toBe(POSTURE.rise); expect(HOOPS_POSTURE.jam).toBe(POSTURE.jam); expect(HOOPS_POSTURE.brace).toBe(POSTURE.brace);
    expect(HOOPS_LEGS.hang).toBe(LEGS.hang); expect(HOOPS_LEGS.land).toBe(LEGS.land);
  });
  it('offense: dribble / drive / protect by speed and the nearest defender', () => {
    expect(hoopsWindow(I({ role: 'offense', hasBall: true, speed01: 0.3 }))).toBe('dribble');
    expect(hoopsWindow(I({ role: 'offense', hasBall: true, speed01: 0.8 }))).toBe('drive');
    expect(hoopsWindow(I({ role: 'offense', hasBall: true, speed01: 0.05, nearestDefender: 1.0 }))).toBe('protect');
    expect(hoopsWindow(I({ role: 'offense', hasBall: false, speed01: 0.5 }))).toBe('run');
    expect(hoopsWindow(I({ role: 'offense', hasBall: false, speed01: 0.0 }))).toBe('idle');
  });
  it('the shot windows override the loco, in order', () => {
    expect(hoopsWindow(I({ role: 'offense', hasBall: true, speed01: 0.9, shot: 'load' }))).toBe('load');
    expect(hoopsWindow(I({ role: 'offense', shot: 'release' }))).toBe('release');
    expect(hoopsWindow(I({ role: 'offense', shot: 'follow' }))).toBe('follow');
    // the shot squares to the rim: chest aim ≥ 0.9, eyes on the iron
    expect(HOOPS_POSTURE.load.chestAim).toBeGreaterThanOrEqual(0.9); expect(HOOPS_POSTURE.follow.eyes).toBe(1);
  });
  it('defense: set vs sliding, the reach beat on top', () => {
    expect(hoopsWindow(I({ role: 'defense', speed01: 0.05 }))).toBe('defend');
    expect(hoopsWindow(I({ role: 'defense', speed01: 0.5 }))).toBe('slide');
    expect(hoopsWindow(I({ role: 'defense', speed01: 0.5, reaching: true }))).toBe('reach');
    // the chest stays ON the handler through the slide
    expect(HOOPS_POSTURE.slide.chestAim).toBeGreaterThanOrEqual(0.8);
  });
  it('the drive dunk flight rides its clock and resolves to the jam or the brace, then the land', () => {
    expect(hoopsWindow(I({ role: 'offense', hasBall: true, flight: { k: 0.1, made: null } }))).toBe('rise');
    expect(hoopsWindow(I({ role: 'offense', hasBall: true, flight: { k: 0.3, made: null } }))).toBe('hang');
    expect(hoopsWindow(I({ role: 'offense', hasBall: true, flight: { k: 0.5, made: null } }))).toBe('extend');
    expect(hoopsWindow(I({ role: 'offense', hasBall: true, flight: { k: 0.8, made: null } }))).toBe('extend');
    expect(hoopsWindow(I({ role: 'offense', hasBall: true, flight: { k: 0.8, made: true } }))).toBe('jam');
    expect(hoopsWindow(I({ role: 'offense', hasBall: true, flight: { k: 0.8, made: false } }))).toBe('brace');
    expect(hoopsWindow(I({ role: 'offense', landed: true }))).toBe('land');
    expect(hoopsWindow(I({ role: 'offense', landed: true, celebrate: true }))).toBe('celebrate');
  });
  it('the floor and a stagger own the body over everything', () => {
    expect(hoopsWindow(I({ role: 'defense', speed01: 0.5, floored: true, flight: { k: 0.3, made: null } }))).toBe('floor');
    expect(hoopsWindow(I({ role: 'offense', shot: 'load', staggered: true }))).toBe('stagger');
    expect(HOOPS_POSTURE.floor.weight).toBe(0);
  });
  it('hoopsPose returns the matching stance and feet', () => {
    const r = hoopsPose(I({ role: 'defense', speed01: 0.5 }));
    expect(r.window).toBe('slide'); expect(r.pose).toBe(HOOPS_POSTURE.slide); expect(r.legs).toBe(HOOPS_LEGS.slide);
  });
});
