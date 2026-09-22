// boards pass phase 5 (2026-09-22): big air's read into the board animation tree — each of the core's phases lands on a
// BOARD clip (never the sprint, never the standing jump, never the stand idle mid-run).
import { describe, expect, it } from 'vitest';
import { chooseBoardClip } from '../anim/boardTree';
import { airBoardFeed } from './airBoardFeed';

const base = { phase: 'Run' as const, speed: 6, maxRunSpeed: 12, spinTurns: 0, boostHeld: false, grabHeld: false, landBeat: 'none' as const, bailing: false, finished: false };

describe('airBoardFeed → chooseBoardClip', () => {
  it('the run-in cruises on the board, and tucks under the boost', () => {
    expect(chooseBoardClip(airBoardFeed(base)).clip).toBe('board_ride_idle');
    expect(chooseBoardClip(airBoardFeed({ ...base, boostHeld: true })).clip).toBe('board_tuck');
    expect(chooseBoardClip(airBoardFeed({ ...base, boostHeld: true, speed: 2 })).clip).toBe('board_ride_idle');   // rolling but slow: no tuck yet
    expect(chooseBoardClip(airBoardFeed({ ...base, boostHeld: true, speed: 0.5 })).clip).toBe('board_stand_idle');   // stopped is stopped
  });
  it('the air is the board air, the spin the spin, a grab the grab', () => {
    expect(chooseBoardClip(airBoardFeed({ ...base, phase: 'Air' })).clip).toBe('board_air');
    expect(chooseBoardClip(airBoardFeed({ ...base, phase: 'Air', spinTurns: 0.6 })).state).toBe('air_spin');
    expect(chooseBoardClip(airBoardFeed({ ...base, phase: 'Air', spinTurns: 0.6, grabHeld: true })).clip).toBe('board_grab');
    expect(chooseBoardClip(airBoardFeed({ ...base, grabHeld: true })).clip).toBe('board_ride_idle');   // a grab on the ground is nothing
  });
  it('the landing beat reads the grade, a crash bails, the finish stomps', () => {
    expect(chooseBoardClip(airBoardFeed({ ...base, phase: 'Land', landBeat: 'clean' })).clip).toBe('board_land');
    expect(chooseBoardClip(airBoardFeed({ ...base, phase: 'Land', landBeat: 'sketchy' })).clip).toBe('board_land_sketchy');
    expect(chooseBoardClip(airBoardFeed({ ...base, phase: 'Land', bailing: true })).clip).toBe('skate_bail');
    expect(chooseBoardClip(airBoardFeed({ ...base, phase: 'Done', finished: true })).state).toBe('celebrate');
    expect(chooseBoardClip(airBoardFeed({ ...base, phase: 'Done', finished: true, bailing: true })).state).toBe('bail');
    expect(chooseBoardClip(airBoardFeed({ ...base, phase: 'Done', finished: false })).clip).toBe('board_stand_idle');
  });
});
