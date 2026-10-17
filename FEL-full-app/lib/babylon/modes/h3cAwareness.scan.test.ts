// H3c (owner 2026-10-16: "situational awareness") — the modes' wiring of the awareness pieces. The pure parts are tested where they live
// (core/HoopsLook, core/OffBallLook, the DefenderBrain's HAS_BALL_M, anim/LandingAbsorb's hold); this pins that the modes call them:
// every body's chest and eyes from its look, the deep defensive captures raised on every body, and in THEIR 3v3 possession the roles off
// the ball swapped (my teammates guard a man, their men off the ball space the floor).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const strip = (s: string) => s.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');
const V3 = strip(readFileSync(path.join(__dirname, 'ThreeVThreeMode.ts'), 'utf8'));
const V1 = strip(readFileSync(path.join(__dirname, 'OneVOneMode.ts'), 'utf8'));

describe('3v3: the bodies off the ball', () => {
  it('the posture feed takes every body\'s look (mine with the ball, an AI handler\'s, the rest off the ball)', () => {
    expect(V3).toMatch(/const look = b === me && b\.bio\.hasBall \? meLook : lookOf\.get\(b\) \?\? null;/);
    expect(V3).toMatch(/aim: look \? look\.aim : objectiveFor\(b\), eyes: look \? look\.eyes :/);
    expect(V3).toMatch(/for \(const b of everyBody\(\)\) if \(b !== me\) tickAwareness\(b, dt\);/);
    expect(V3).toMatch(/new OffBallLook\(/); expect(V3).toMatch(/new HandlerLook\(/);
  });
  it('every body holds a stance: the deep defensive captures raised, my protect sunk', () => {
    expect(V3).toMatch(/stances\.get\(b\)\?\.hold\(b\.tree\.state && DEEP_DEFENSE_STATES\.has\(b\.tree\.state\) \? -DEFENSE_RAISE_M : 0\)/);
    expect(V3).toMatch(/meSink\?\.hold\(protecting \? PROTECT_SINK_M : me\.tree\.state && DEEP_DEFENSE_STATES\.has\(me\.tree\.state\) \? -DEFENSE_RAISE_M : 0\)/);
  });
  it('their possession swaps the roles off the ball: my teammates guard (a DefenderBrain), their men space (a TeammateBrain)', () => {
    expect(V3).toMatch(/let intent = swapped\(body\) \? mateDefBrain\(body\)\.decide\(dt, body\.char\.root\.position, ballWorld\(\), RIM, allyPositions\(\), foePositions\(\)\) : body\.slot\.intent;/);   // H3e: let — his read (mateCall) steers it when he drives with the ball
    expect(V3).toMatch(/const intent = swapped\(f\) \? foeOffBrain\(f\)\.decide\(dt, f\.char\.root\.position, ballWorld\(\), RIM, foePositions\(\), allyPositions\(\)\) : f\.slot\.intent;/);
    expect(V3).toMatch(/const swapped = \(b: Body\): boolean => carrierId === 'foeTeam' && b !== me && b !== driver && !\(/);   // a box-out or a loose ball stays with the body's own brain
    expect(V3).toMatch(/new DefenderBrain\(0, null\)/);   // a teammate never rolls a poke
  });
});

describe('1v1: the rival', () => {
  it('reads me when he has the ball, and both bodies\' deep defensive captures stand taller', () => {
    expect(V1).toMatch(/foeBio\.hasBall \? foeLook\.aim : RIM/);
    expect(V1).toMatch(/foeLook\.update\(\{ self: foe\.root\.position/);
    expect(V1).toMatch(/foeSink\?\.hold\(deep\(foeAnimTree\.state\) \? -DEFENSE_RAISE_M : 0\)/);
    expect(V1).toMatch(/meSink\?\.hold\(protecting \? PROTECT_SINK_M : deep\(meAnimTree\.state\) \? -DEFENSE_RAISE_M : 0\)/);
  });
});
