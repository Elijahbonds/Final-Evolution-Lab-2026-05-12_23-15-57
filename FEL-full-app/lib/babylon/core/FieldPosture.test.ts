// FieldPosture — the rules a ball-sport body has to obey (2026-09-13).
//
// Each of these is a coaching fault that a posture table can actually commit, not a shape check. The modes
// they guard rendered with NO posture layer at all until this file existed, so the baseline being compared
// against is "the chest and the head stay wherever the last clip left them".

import { describe, it, expect } from 'vitest';
import {
  FIELD_POSTURE, FIELD_LEGS, batWindow, keeperWindow, strikerWindow, netWindow, fieldPose, fieldBank,
  FIELD_BANK_MAX, NET_REACH_M, NET_MOVE_SPEED, type FieldWindow,
} from './FieldPosture';

const ALL = Object.keys(FIELD_POSTURE) as FieldWindow[];

describe('every window is complete', () => {
  it('poses and legs cover the same windows', () => {
    expect(Object.keys(FIELD_LEGS).sort()).toEqual(ALL.slice().sort());
  });

  it('fieldPose hands back the pair', () => {
    for (const w of ALL) {
      const got = fieldPose(w);
      expect(got.window).toBe(w);
      expect(got.pose).toBe(FIELD_POSTURE[w]);
      expect(got.legs).toBe(FIELD_LEGS[w]);
    }
  });

  it('weights are fractions and spine triples are triples', () => {
    for (const w of ALL) {
      const p = FIELD_POSTURE[w];
      expect(p.weight, w).toBeGreaterThanOrEqual(0);
      expect(p.weight, w).toBeLessThanOrEqual(1);
      expect(p.eyes, w).toBeGreaterThanOrEqual(0);
      expect(p.eyes, w).toBeLessThanOrEqual(1);
      expect(p.spine1, w).toHaveLength(3);
      expect(p.spine2, w).toHaveLength(3);
      expect(FIELD_LEGS[w].weight, w).toBeGreaterThanOrEqual(0);
      expect(FIELD_LEGS[w].weight, w).toBeLessThanOrEqual(1);
    }
  });
});

describe('YOU HAVE TO WATCH THE BALL', () => {
  // The whole reason this module exists. A batter, a keeper, a striker and a tennis player all have exactly
  // one job while the ball is live, and no clip in the tree keys the head.
  it('every live window has the eyes fully on the ball', () => {
    const live = ALL.filter((w) => w !== 'idle');
    for (const w of live) {
      expect(FIELD_POSTURE[w].eyes, `${w} is not watching the ball`).toBeGreaterThanOrEqual(0.9);
    }
  });

  it('only the idle is allowed to look away', () => {
    expect(FIELD_POSTURE.idle.eyes).toBeLessThan(0.9);
  });

  it('the keeper watches the ball even mid-dive, where the clip owns everything else', () => {
    expect(FIELD_POSTURE.keep_dive.weight).toBeLessThan(0.4);   // the clip has the body
    expect(FIELD_POSTURE.keep_dive.eyes).toBe(1);               // the layer keeps the head
  });
});

describe('the batter keeps his head down and his shoulder closed', () => {
  it('the front shoulder stays CLOSED through the load and opens on the fire', () => {
    // chestAim is how hard the chest squares to the ball; a swing that opens early is the classic fault
    expect(FIELD_POSTURE.bat_load.chestAim).toBeLessThanOrEqual(FIELD_POSTURE.bat_wait.chestAim);
    expect(FIELD_POSTURE.bat_fire.chestAim).toBeGreaterThan(FIELD_POSTURE.bat_load.chestAim);
  });

  it('the coil survives the load — the clip’s hips do not drag the chest round', () => {
    expect(FIELD_POSTURE.bat_load.hipYawKeep).toBeLessThan(1);
    expect(FIELD_POSTURE.bat_load.hipYawKeep).toBeLessThan(FIELD_POSTURE.bat_wait.hipYawKeep);
  });

  it('the head goes DOWN on contact and stays there', () => {
    // more negative head pitch = chin further down; the fire is the lowest of the batting windows
    const batting: FieldWindow[] = ['bat_wait', 'bat_load', 'bat_check'];
    for (const w of batting) expect(FIELD_POSTURE.bat_fire.head[0]).toBeLessThanOrEqual(FIELD_POSTURE[w].head[0]);
  });

  it('the swing clip owns the fire’s feet — the layer never fights a keyed pivot', () => {
    expect(FIELD_LEGS.bat_fire.weight).toBe(0);
  });
});

describe('the keeper sets low, and the ready positions are on the balls of the feet', () => {
  it('a set keeper is LOWER than a standing body', () => {
    expect(FIELD_POSTURE.keep_set.lean).toBeGreaterThan(FIELD_POSTURE.idle.lean + 10);
  });

  it('the chest is OPEN in the set — negative clavicle forward, not rounded', () => {
    expect(FIELD_POSTURE.keep_set.forward).toBeLessThan(0);
  });

  it('every window that is about to MOVE is on the balls of the feet, and every wait has its heels down', () => {
    for (const w of ['keep_set', 'net_ready', 'net_split'] as FieldWindow[]) {
      expect(FIELD_LEGS[w].footPitch, w).toBeLessThan(0);
      expect(FIELD_LEGS[w].footPitch, w).toBeGreaterThan(-12);   // on the toes, not en pointe
    }
    // and a body that is WAITING keeps its heels down (the held-crouch-on-tiptoe artefact)
    for (const w of ['bat_wait', 'bat_load'] as FieldWindow[]) expect(FIELD_LEGS[w].footPitch, w).toBe(0);
  });
});

describe('the striker never looks up at the keeper', () => {
  it('the eyes stay pinned to the ball through the run-up and the strike', () => {
    for (const w of ['kick_runup', 'kick_plant', 'kick_strike'] as FieldWindow[]) {
      expect(FIELD_POSTURE[w].eyes, w).toBe(1);
    }
  });

  it('the plant is the most braced moment in the sequence', () => {
    expect(FIELD_POSTURE.kick_plant.weight).toBeGreaterThan(FIELD_POSTURE.kick_runup.weight);
    expect(FIELD_POSTURE.kick_plant.weight).toBeGreaterThan(FIELD_POSTURE.kick_strike.weight);
  });

  it('the strike hands the follow-through back to the clip', () => {
    expect(FIELD_POSTURE.kick_strike.weight).toBeLessThan(0.7);
    expect(FIELD_LEGS.kick_strike.weight).toBe(0);
  });
});

describe('the serve arches BACKWARD and the reach EXTENDS', () => {
  it('the serve is the only window whose spine goes back under a toss', () => {
    expect(FIELD_POSTURE.net_serve.lean).toBeLessThan(0);
    expect(FIELD_POSTURE.net_serve.spine1[0]).toBeLessThan(0);
    expect(FIELD_POSTURE.net_serve.head[0]).toBeGreaterThan(0);   // eyes UP to the ball
  });

  it('a stretched reach extends rather than folds', () => {
    expect(FIELD_POSTURE.net_reach.lean).toBeLessThan(0);
    expect(FIELD_POSTURE.net_reach.shrug).toBeGreaterThan(FIELD_POSTURE.net_strike.shrug);
  });
});

describe('the window resolvers read the sport, not the clip', () => {
  it('batting: nothing coming is idle; a pitch is a wait that becomes a load', () => {
    expect(batWindow({ incoming: false, swinging: false, checked: false, load01: 0 })).toBe('idle');
    expect(batWindow({ incoming: true, swinging: false, checked: false, load01: 0.1 })).toBe('bat_wait');
    expect(batWindow({ incoming: true, swinging: false, checked: false, load01: 0.9 })).toBe('bat_load');
    expect(batWindow({ incoming: true, swinging: true, checked: false, load01: 1 })).toBe('bat_fire');
  });

  it('a CHECK beats a swing — the swing was started and stopped', () => {
    expect(batWindow({ incoming: true, swinging: true, checked: true, load01: 1 })).toBe('bat_check');
  });

  it('keeping: diving beats rising beats reading', () => {
    expect(keeperWindow({ diving: true, rising: true, reading: true })).toBe('keep_dive');
    expect(keeperWindow({ diving: false, rising: true, reading: true })).toBe('keep_rise');
    expect(keeperWindow({ diving: false, rising: false, reading: true })).toBe('keep_set');
    expect(keeperWindow({ diving: false, rising: false, reading: false })).toBe('idle');
  });

  it('striking: the run-up starts the moment it starts', () => {
    expect(strikerWindow({ runup01: 0, planted: false, struck: false })).toBe('idle');
    expect(strikerWindow({ runup01: 0.01, planted: false, struck: false })).toBe('kick_runup');
    expect(strikerWindow({ runup01: 1, planted: true, struck: false })).toBe('kick_plant');
    expect(strikerWindow({ runup01: 1, planted: true, struck: true })).toBe('kick_strike');
  });

  it('net: a swing at arm’s length is a STRETCH, not a stroke', () => {
    const base = { incoming: true, serving: false, swinging: true, speed: 0, splitting: false };
    expect(netWindow({ ...base, reachM: 0.5 })).toBe('net_strike');
    expect(netWindow({ ...base, reachM: NET_REACH_M + 0.1 })).toBe('net_reach');
  });

  it('net: running to the ball is a different body from waiting for it', () => {
    const base = { incoming: true, serving: false, swinging: false, splitting: false, reachM: 3 };
    expect(netWindow({ ...base, speed: NET_MOVE_SPEED + 0.5 })).toBe('net_move');
    expect(netWindow({ ...base, speed: 0 })).toBe('net_ready');
  });

  it('net: the split step fires on the opponent’s strike, and the serve owns the body', () => {
    expect(netWindow({ incoming: false, serving: false, swinging: false, reachM: 5, speed: 0, splitting: true })).toBe('net_split');
    expect(netWindow({ incoming: true, serving: true, swinging: true, reachM: 0, speed: 3, splitting: true })).toBe('net_serve');
  });

  it('net: with nothing coming and nothing to do, the body is idle', () => {
    expect(netWindow({ incoming: false, serving: false, swinging: false, reachM: 9, speed: 0, splitting: false })).toBe('idle');
  });
});

describe('the bank leans into the move', () => {
  it('no lateral, no bank; no speed, no bank', () => {
    expect(fieldBank(0, 1)).toBe(0);
    expect(fieldBank(1, 0)).toBe(0);
  });

  it('a full sprint across the court banks to the cap, and the sign follows the direction', () => {
    expect(fieldBank(1, 1)).toBeCloseTo(FIELD_BANK_MAX, 6);
    expect(fieldBank(-1, 1)).toBeCloseTo(-FIELD_BANK_MAX, 6);
  });

  it('a person banks LESS than a board — 12° against the board table’s 22°', () => {
    expect(FIELD_BANK_MAX).toBeLessThan(22 * Math.PI / 180);
    expect(FIELD_BANK_MAX).toBeGreaterThan(6 * Math.PI / 180);
  });

  it('out-of-range input clamps rather than exploding', () => {
    expect(fieldBank(5, 5)).toBeCloseTo(FIELD_BANK_MAX, 6);
    expect(fieldBank(-5, 5)).toBeCloseTo(-FIELD_BANK_MAX, 6);
  });
});
