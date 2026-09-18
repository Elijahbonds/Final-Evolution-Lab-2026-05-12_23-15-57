// Shootout turns — four phones, one ball (2026-09-13).
//
// These exist because of a defect I shipped and caught: opening the lobby to four phones while the host
// funnelled every slot into one InputBus would have put four people on one pair of hands. The first test is
// that exact case.

import { describe, it, expect } from 'vitest';
import {
  MAX_SHOOTERS, freshOrder, syncLobby, activeShooter, slotDrives, recordTurn, standings, winner,
  turnBanner, waitingBanner, type ShootoutOrder,
} from './shootoutTurns';

const lobby = (n: number, connected = true) =>
  Array.from({ length: n }, (_, i) => ({ slot: i, name: `P${i + 1}`, connected }));

const withFour = (): ShootoutOrder => syncLobby(freshOrder(), lobby(4));

describe('ONLY ONE PHONE DRIVES AT A TIME', () => {
  it('four phones join, and exactly one of them is shooting', () => {
    const o = withFour();
    expect(o.shooters).toHaveLength(4);
    expect(slotDrives(o, 0)).toBe(true);
    expect(slotDrives(o, 1)).toBe(false);
    expect(slotDrives(o, 2)).toBe(false);
    expect(slotDrives(o, 3)).toBe(false);
  });

  it('the turn passes when a score comes in', () => {
    let o = withFour();
    o = recordTurn(o, 18);
    expect(slotDrives(o, 0)).toBe(false);
    expect(slotDrives(o, 1)).toBe(true);
    expect(activeShooter(o)!.name).toBe('P2');
  });

  it('A SOLO PLAYER IS NEVER GATED BY A LOBBY THEY ARE NOT USING', () => {
    // keyboard and local pad both arrive as slot 0 with no phones connected; if an empty lobby gated them
    // the mode would be unplayable on its own
    const empty = freshOrder();
    expect(slotDrives(empty, 0)).toBe(true);
    expect(slotDrives(empty, 3)).toBe(true);
  });
});

describe('the running order', () => {
  it('is locked once the first rack is in the books', () => {
    let o = syncLobby(freshOrder(), lobby(2));
    o = recordTurn(o, 12);                                  // P1 has shot
    o = syncLobby(o, [...lobby(2), { slot: 2, name: 'LATE', connected: true }]);
    expect(o.shooters.map((s) => s.name)).toEqual(['P1', 'P2']);   // the latecomer watches
  });

  it('accepts joins right up until the first score', () => {
    let o = syncLobby(freshOrder(), lobby(1));
    o = syncLobby(o, lobby(3));
    expect(o.shooters).toHaveLength(3);
  });

  it('never seats more than four', () => {
    const o = syncLobby(freshOrder(), lobby(9));
    expect(o.shooters).toHaveLength(MAX_SHOOTERS);
  });

  it('ignores phones that are not connected, and slots that were never assigned', () => {
    const o = syncLobby(freshOrder(), [
      { slot: 0, name: 'ON', connected: true },
      { slot: 1, name: 'OFF', connected: false },
      { slot: null, name: 'NOSLOT', connected: true },
    ]);
    expect(o.shooters.map((s) => s.name)).toEqual(['ON']);
  });

  it('a rename does not reshuffle the order', () => {
    let o = syncLobby(freshOrder(), lobby(3));
    o = syncLobby(o, [{ slot: 0, name: 'RENAMED', connected: true }, ...lobby(3).slice(1)]);
    expect(o.shooters.map((s) => s.slot)).toEqual([0, 1, 2]);
    expect(o.shooters[0].name).toBe('RENAMED');
  });
});

describe('the board', () => {
  it('finishes after the last shooter, and names a winner', () => {
    let o = withFour();
    o = recordTurn(o, 11);
    o = recordTurn(o, 23);
    o = recordTurn(o, 7);
    expect(o.done).toBe(false);
    o = recordTurn(o, 19);
    expect(o.done).toBe(true);
    expect(winner(o)!.score).toBe(23);
    expect(winner(o)!.name).toBe('P2');
  });

  it('there is no winner while anyone still has a turn', () => {
    let o = withFour();
    o = recordTurn(o, 30);
    expect(winner(o)).toBeNull();
  });

  it('A BLANK IS NOT A ZERO — players who have not shot sort last', () => {
    let o = withFour();
    o = recordTurn(o, 0);                                   // P1 shot and scored nothing
    const board = standings(o);
    expect(board[0].name).toBe('P1');                       // a real 0 still beats an unplayed turn
    expect(board.slice(1).every((s) => s.score === null)).toBe(true);
  });

  it('an empty shootout has no winner and no active shooter', () => {
    const o = freshOrder();
    expect(winner(o)).toBeNull();
    expect(activeShooter(o)).toBeNull();
    expect(standings(o)).toEqual([]);
  });

  it('recording a turn on an empty or finished order changes nothing', () => {
    const empty = freshOrder();
    expect(recordTurn(empty, 9)).toBe(empty);
    let o = syncLobby(freshOrder(), lobby(1));
    o = recordTurn(o, 5);
    expect(o.done).toBe(true);
    expect(recordTurn(o, 99)).toBe(o);
  });
});

describe('everybody is told what is happening', () => {
  it('the TV names whose turn it is, then the winner', () => {
    let o = withFour();
    expect(turnBanner(o)).toContain('P1');
    o = recordTurn(o, 1); o = recordTurn(o, 2); o = recordTurn(o, 3); o = recordTurn(o, 4);
    expect(turnBanner(o)).toContain('WINS');
  });

  it('A WAITING PHONE IS TOLD WHY — silence reads as a broken link', () => {
    const o = withFour();
    expect(waitingBanner(o, 0)).toBe('');                   // it is your turn; nothing to say
    expect(waitingBanner(o, 1)).toContain('P1');
  });

  it('and a phone that has already shot is told its score', () => {
    let o = withFour();
    o = recordTurn(o, 21);
    expect(waitingBanner(o, 0)).toContain('21');
  });

  it('says nothing at all when nobody has joined', () => {
    expect(turnBanner(freshOrder())).toBe('');
  });
});
