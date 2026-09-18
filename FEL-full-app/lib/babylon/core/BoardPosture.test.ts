import { describe, expect, it } from 'vitest';
import { boardWindow, boardPose, BOARD_POSTURE, BOARD_LEGS, BOARD_INPUT_IDLE, boardBank, BOARD_BANK_MAX, lookAhead, CARVE_LEAN, type BoardPostureInput } from './BoardPosture';
import { CARVE_ON } from '../anim/boardTree';

const I = (o: Partial<BoardPostureInput> = {}): BoardPostureInput => ({ ...BOARD_INPUT_IDLE, ...o });

describe('BoardPosture — the window resolver', () => {
  it('rolling / carving / tucking follow the same lines the clip tree uses', () => {
    expect(CARVE_LEAN).toBe(CARVE_ON);   // the body and the clip must agree on what a carve IS
    expect(boardWindow(I({ speed01: 0.6 }))).toBe('cruise');
    expect(boardWindow(I({ speed01: 0.6, lean: 0.9 }))).toBe('carve');
    expect(boardWindow(I({ speed01: 0.1, lean: 0.9 }))).toBe('idle');    // no carve standing still
    expect(boardWindow(I({ speed01: 0.6, tucking: true }))).toBe('tuck');
    expect(boardWindow(I({ speed01: 0.6, lean: 0.9, tucking: true }))).toBe('carve');   // a racer rises to turn
  });
  it('the air splits into grab / flip / spin / plain air', () => {
    expect(boardWindow(I({ airborne: true }))).toBe('air');
    expect(boardWindow(I({ airborne: true, spinning: true }))).toBe('spin');
    expect(boardWindow(I({ airborne: true, flipping: true, spinning: true }))).toBe('flip');
    expect(boardWindow(I({ airborne: true, grabHeld: true, flipping: true }))).toBe('grab');
  });
  it('the bail beats everything and hands the body back to the clip', () => {
    const w = boardWindow(I({ bailing: true, airborne: true, grabHeld: true, landing: true }));
    expect(w).toBe('bail');
    expect(BOARD_POSTURE.bail.weight).toBe(0);
    expect(BOARD_LEGS.bail.weight).toBe(0);
  });
  it('the landing beat outranks the ride states under it', () => {
    expect(boardWindow(I({ landing: true, speed01: 1, lean: 1 }))).toBe('land');
  });
  it('surf’s barrel is a grounded window, under the air but over the ride', () => {
    expect(boardWindow(I({ barrelled: true, speed01: 0.8 }))).toBe('barrel');
    expect(boardWindow(I({ barrelled: true, airborne: true }))).toBe('air');
  });
});

describe('BoardPosture — the stances', () => {
  it('the land absorbs with the soles DOWN (never a crouch on tiptoe)', () => {
    expect(BOARD_LEGS.land.footPitch).toBe(0);
    expect(BOARD_LEGS.land.weight).toBe(1);
    expect(BOARD_POSTURE.land.lean).toBeGreaterThan(10);
  });
  it('the carve keeps the shoulders down the line while the hips turn under them', () => {
    expect(BOARD_POSTURE.carve.chestAim).toBeGreaterThan(0.9);
    expect(BOARD_POSTURE.carve.hipYawKeep).toBeLessThan(1);
  });
  it('a spin leaves the aim alone — squaring the chest would cancel the rotation', () => {
    expect(BOARD_POSTURE.spin.chestAim).toBe(0);
    expect(BOARD_POSTURE.flip.chestAim).toBe(0);
  });
  it('the air opens the chest instead of folding it forward', () => {
    expect(BOARD_POSTURE.air.spine2[0]).toBeLessThan(0);
    expect(BOARD_POSTURE.air.forward).toBeLessThan(0);
  });
  it('every window has a leg pose and legal weights', () => {
    for (const w of Object.keys(BOARD_POSTURE) as (keyof typeof BOARD_POSTURE)[]) {
      expect(BOARD_LEGS[w]).toBeDefined();
      for (const v of [BOARD_POSTURE[w].weight, BOARD_LEGS[w].weight, BOARD_POSTURE[w].chestAim, BOARD_POSTURE[w].eyes]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
    expect(boardPose(I({ speed01: 0.5 })).window).toBe('cruise');
  });
});

describe('the bank and the look-ahead', () => {
  it('the roll goes with the lean in the BOARD STACK\'s sign, scales with speed, and never breaks the cap', () => {
    expect(Math.abs(boardBank(0, 1))).toBe(0);
    expect(Math.abs(boardBank(1, 0))).toBe(0);             // a lean standing still does not bank
    // BoardSync rolls the deck by −lean and GroundRide the root by −steer: a right lean is a NEGATIVE roll. With the
    // sign the other way the two writers cancel (measured live: a 5.8° peak inside a full carve).
    expect(boardBank(1, 1)).toBeCloseTo(-BOARD_BANK_MAX, 9);
    expect(boardBank(-1, 1)).toBeCloseTo(BOARD_BANK_MAX, 9);
    expect(Math.abs(boardBank(4, 3))).toBeLessThanOrEqual(BOARD_BANK_MAX + 1e-9);
    expect(boardBank(0.5, 1)).toBeCloseTo(-BOARD_BANK_MAX / 2, 9);
  });
  it('the eyes go down the line at head height, ahead of the board', () => {
    const p = lookAhead({ x: 0, y: 0, z: 0 }, 0, 6, 1.5);
    expect(p.z).toBeCloseTo(6, 6);
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(1.5, 6);
    const q = lookAhead({ x: 0, y: 0, z: 0 }, Math.PI / 2, 4, 1.5);
    expect(q.x).toBeCloseTo(4, 6);
    expect(q.z).toBeCloseTo(0, 6);
  });
});
