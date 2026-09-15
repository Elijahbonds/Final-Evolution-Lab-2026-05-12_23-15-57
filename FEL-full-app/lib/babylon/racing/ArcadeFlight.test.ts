import { describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import {
  ARCADE_TRAINER as T, spawnArcade, stepArcade, startStunt, dodging, spinOut, topFor, wallTurn, arcadeFrom,
  LOOP_SEC, ROLL_SEC, ROLL_SHIFT, type ArcadeInput,
} from './ArcadeFlight';
import { PLANES } from './garage';

const flat = () => 0;
const I = (o: Partial<ArcadeInput> = {}): ArcadeInput => ({ steer: 0, climb: 0, gas: 0, brake: 0, boostK: 0, bananas: 0, ...o });
const fly = (s: ReturnType<typeof spawnArcade>, input: ArcadeInput, sec: number, floor = flat) => { for (let i = 0; i < sec * 60; i++) stepArcade(s, input, 1 / 60, T, floor, 200); };

describe('arcade flight: nothing a player does crashes the plane', () => {
  it('no stall: diving, climbing and braking never drop below the floor speed', () => {
    const s = spawnArcade(new Vector3(0, 40, 0), 0);
    fly(s, I({ climb: 1, brake: 1 }), 6);
    expect(s.speed).toBeGreaterThanOrEqual(T.minSpeed - 1e-6);
    expect(s.pitch).toBeGreaterThan(0.4);            // still climbing — the nose never falls on its own
  });

  it('the gas reaches top speed, bananas add to it, a boost adds 40%', () => {
    const s = spawnArcade(new Vector3(0, 40, 0), 0);
    fly(s, I({ gas: 1 }), 4);
    expect(s.speed).toBeCloseTo(T.top, 0);
    expect(topFor(I({ gas: 1, bananas: 10 }), T)).toBeCloseTo(T.top + 10 * T.bananaSpeed);
    expect(topFor(I({ gas: 1, bananas: 99 }), T)).toBeCloseTo(T.top + T.bananaCap * T.bananaSpeed);
    expect(topFor(I({ boostK: 1 }), T)).toBeCloseTo(T.top * 1.4);
  });

  it('hands off: the wings and the nose come level', () => {
    const s = spawnArcade(new Vector3(0, 40, 0), 0);
    fly(s, I({ steer: 1, climb: 1 }), 1);
    fly(s, I(), 1.5);
    expect(Math.abs(s.roll)).toBeLessThan(0.05);
    expect(Math.abs(s.pitch)).toBeLessThan(0.05);
  });

  it('the brake tightens the turn', () => {
    const a = spawnArcade(new Vector3(0, 40, 0), 0), b = spawnArcade(new Vector3(0, 40, 0), 0);
    fly(a, I({ steer: 1 }), 1); fly(b, I({ steer: 1, brake: 1 }), 1);
    expect(Math.abs(b.heading)).toBeGreaterThan(Math.abs(a.heading) * 1.4);
  });

  it('the ground lifts the nose instead of wrecking the plane', () => {
    const s = spawnArcade(new Vector3(0, 6, 0), 0);
    let scraped = 0;
    for (let i = 0; i < 180; i++) if (stepArcade(s, I({ climb: -1, gas: 1 }), 1 / 60, T, flat, 200)) scraped++;
    expect(s.pos.y).toBeGreaterThanOrEqual(2.5 - 1e-6);
    expect(s.speed).toBeGreaterThanOrEqual(T.minSpeed);
    expect(scraped).toBeGreaterThan(0);
  });

  it('the course edge turns the plane back instead of pinning it', () => {
    const s = spawnArcade(new Vector3(0, 40, 0), Math.PI / 2 - 0.3);   // flying +x into a wall with normal −x
    expect(wallTurn(s, -1, 0)).toBe(true);
    expect(Math.sin(s.heading)).toBeLessThan(0.3);
  });
});

describe('stunts', () => {
  it('a barrel roll carries the plane sideways and dodges in the middle of it', () => {
    const s = spawnArcade(new Vector3(0, 40, 0), 0);
    expect(startStunt(s, 'roll_right')).toBe(true);
    expect(startStunt(s, 'loop')).toBe(false);        // one stunt at a time
    let dodged = false;
    for (let i = 0; i < ROLL_SEC * 60 + 2; i++) { stepArcade(s, I(), 1 / 60, T, flat, 200); dodged ||= dodging(s); }
    expect(dodged).toBe(true);
    expect(s.stunt).toBeNull();
    expect(Math.abs(s.pos.x)).toBeGreaterThan(ROLL_SHIFT * 0.8);
  });

  it('a loop comes out facing back the way it came, higher', () => {
    const s = spawnArcade(new Vector3(0, 40, 0), 0);
    startStunt(s, 'loop');
    for (let i = 0; i < LOOP_SEC * 60 + 2; i++) stepArcade(s, I(), 1 / 60, T, flat, 200);
    expect(s.stunt).toBeNull();
    expect(Math.cos(s.heading)).toBeLessThan(-0.99);
    expect(s.pos.y).toBeGreaterThan(50);
  });

  it('a spin-out takes control away for a beat and costs speed', () => {
    const s = spawnArcade(new Vector3(0, 40, 0), 0);
    fly(s, I({ gas: 1 }), 3);
    const before = s.speed;
    spinOut(s);
    const h = s.heading;
    fly(s, I({ gas: 1, steer: 1 }), 0.5);
    expect(s.heading).toBeCloseTo(h);
    expect(s.speed).toBeLessThan(before);
  });
});

describe('the garage planes keep their characters', () => {
  it('the darter is faster and the kestrel turns harder than the trainer', () => {
    const tune = (id: string) => arcadeFrom(PLANES.find((p) => p.id === id)!.spec);
    expect(tune('darter').top).toBeGreaterThan(tune('trainer').top);
    expect(tune('kestrel').turnRate).toBeGreaterThan(tune('trainer').turnRate);
  });
});
