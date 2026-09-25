// MOVEMENT PLAY P3 (2026-09-24): the body profiles — one row per mode, what the body may press there, and the card's
// words for it. What is pinned: the 28 rows and their verbs against the touch deck's own labels (a card that says POP
// over a button the deck calls PUMP is a lie), the NEVER-table (the baseline's misfires, each made impossible by the
// data), and how a mode's own claims and profile override the row. The registry side (every ENABLED key has its row,
// the four modeId aliases) is registry.drift.test.ts; what the floor does with a row is bodyFloor / bodyGate.
import { describe, it, expect } from 'vitest';
import {
  BODY_PROFILES, FREE_VERBS, MOVE_LABEL, PAUSE_NOTE, SESSION_LINES, SESSION_ONLY_COPY, cardLines, resolveBodyProfile,
  sessionOnly, type BodyBinding, type BodyProfile,
} from './bodyProfiles';
import { MODE_VERBS } from '@/lib/babylon/ui/modeVerbs';
import type { FelInput } from '@/lib/babylon/core/InputBus';

const ROWS = Object.values(BODY_PROFILES);
const byKey = (key: string): BodyProfile => ROWS.find((p) => p.key === key)!;
const froms = (p: BodyProfile) => p.bindings.map((b) => b.from);

/** The MODE_VERBS slot whose emit is this button or trigger: its label is the verb the card must print. */
function slotLabel(key: string, to: string): string | null {
  const cfg = MODE_VERBS[key];
  if (!cfg) return null;
  const hit = cfg.buttons.find((b) => {
    const e = b.emit as FelInput | null;
    if (!e) return false;
    if (to === 'RT' || to === 'LT') return e.t === 'trigger' && e.side === to[0];
    return e.t === 'button' && e.btn === to;
  });
  return hit?.label ?? null;
}

describe('the table', () => {
  it('has 28 rows, one per mode, keyed by modeId, nine of them binding the body', () => {
    expect(ROWS).toHaveLength(28);
    expect(new Set(ROWS.map((p) => p.key)).size).toBe(28);
    for (const [modeId, p] of Object.entries(BODY_PROFILES)) expect(p.modeId).toBe(modeId);
    expect(ROWS.filter((p) => p.bindings.length).map((p) => p.key).sort()).toEqual(
      ['bigair', 'freerun', 'karate_vs', 'mixedcombat', 'showdown', 'skateboard', 'snowboard_slalom', 'sprint', 'surf'],
    );
    // the four registry keys whose modeId differs
    expect(byKey('karate_vs').modeId).toBe('karate-vs');
    expect(byKey('snowboard_slalom').modeId).toBe('snowboard');
    expect(byKey('derby').modeId).toBe('baseball');
    expect(byKey('penalty').modeId).toBe('soccer');
  });

  it('every button or trigger verb is the touch deck\'s own label for the slot that emits it', () => {
    const seen: string[] = [];
    for (const p of ROWS) {
      for (const b of p.bindings) {
        if (b.to === 'Lx' || b.to === 'Ly' || b.to === 'dpadByFoot') continue;
        expect(b.verb, `${p.key} ${b.from} → ${b.to}`).toBe(slotLabel(p.key, b.to));
        seen.push(b.verb);
      }
    }
    expect([...new Set(seen)].sort()).toEqual(['AIR', 'JAB', 'JUMP', 'KICK', 'POP', 'PUMP', 'STRIKE', 'TUCK']);
  });

  it('a stick or d-pad verb is a free verb, and no verb anywhere names a button', () => {
    for (const p of ROWS) {
      for (const b of p.bindings) {
        if (b.to === 'Lx' || b.to === 'Ly' || b.to === 'dpadByFoot') expect(FREE_VERBS as readonly string[], `${p.key}`).toContain(b.verb);
        expect(b.verb, `${p.key}`).not.toMatch(/^(A|B|X|Y|L1|R1|L2|R2|RT|LT|START|SELECT)$/);
      }
    }
  });

  it('the rows the plan names bind exactly what it says', () => {
    const want: Record<string, [BodyBinding['from'], string, string][]> = {
      karate_vs: [['punch', 'A', 'JAB'], ['kick', 'B', 'KICK']],
      mixedcombat: [['punch', 'A', 'STRIKE'], ['kick', 'B', 'KICK']],
      showdown: [['punch', 'A', 'JAB'], ['kick', 'B', 'KICK']],
      skateboard: [['lean', 'Lx', 'STEER'], ['squat', 'RT', 'PUMP'], ['takeoff', 'A', 'POP']],
      snowboard_slalom: [['lean', 'Lx', 'STEER'], ['squat', 'RT', 'TUCK'], ['takeoff', 'A', 'JUMP']],
      surf: [['lean', 'Lx', 'STEER'], ['takeoff', 'A', 'AIR']],
      bigair: [['step', 'dpadByFoot', 'STRIDE']],
      sprint: [['step', 'dpadByFoot', 'STRIDE']],
      freerun: [['cadence', 'Ly', 'RUN'], ['takeoff', 'A', 'JUMP']],
    };
    for (const [key, rows] of Object.entries(want)) {
      expect(byKey(key).bindings.map((b) => [b.from, b.to, b.verb]), key).toEqual(rows);
    }
    // overhead is play where the arms go up in the game itself
    expect(ROWS.filter((p) => p.overheadIsPlay).map((p) => p.key).sort()).toEqual(
      ['aeroaces', 'dance', 'dunk', 'dunkduel', 'freerun', 'onevone', 'threepoint', 'threevthree', 'volleyball'],
    );
  });
});

describe('THE NEVER-TABLE — the baseline\'s misfires, impossible by the data', () => {
  it('no d-pad in the dunk (a body d-pad is the prop picker to the `!== key` readers)', () => {
    for (const k of ['dunk', 'dunkduel']) expect(byKey(k).bindings.some((b) => b.to === 'dpadByFoot'), k).toBe(false);
  });
  it('no crouch → trigger in the dunk, hoops, combat, the kart or the plane (the launch on the rise, the turbo, Focus, the throttle)', () => {
    const where = ROWS.filter((p) => ['dunk', 'hoops', 'combat'].includes(p.family) || ['velocitykart', 'aeroaces'].includes(p.key));
    expect(where).toHaveLength(12);
    for (const p of where) expect(froms(p), p.key).not.toContain('squat');
  });
  it('no jump → A in hoops, the kart or the plane (the 3v3 pass, the item)', () => {
    for (const p of ROWS.filter((x) => x.family === 'hoops' || ['velocitykart', 'aeroaces'].includes(x.key))) {
      expect(froms(p), p.key).not.toContain('takeoff');
    }
  });
  it('nothing at all in the quizzes, the rhythm game and the modes with no plan phase', () => {
    const where = ROWS.filter((p) => ['quiz', 'rhythm', 'later'].includes(p.family));
    expect(where.map((p) => p.key).sort()).toEqual(['brainbrawl', 'carnival', 'dance', 'derby', 'football', 'golf', 'penalty', 'tennis', 'volleyball', 'who_scene_it']);
    for (const p of where) expect(p.bindings, p.key).toEqual([]);
    expect(byKey('who_scene_it').later).toBeNull();
    expect(byKey('brainbrawl').later).toBeNull();
  });
  it('no X, Y, shoulder, START or SELECT anywhere (P3 binds A and B only), and every profile merges', () => {
    for (const p of ROWS) {
      for (const b of p.bindings) expect(['Lx', 'Ly', 'RT', 'LT', 'A', 'B', 'dpadByFoot'], p.key).toContain(b.to);
      expect(p.motion, p.key).toBe('merge');
    }
  });
});

describe('resolveBodyProfile', () => {
  it('the mode\'s own profile, else its row, else session-only', () => {
    const own: BodyProfile = { ...byKey('surf'), key: 'mine', modeId: 'dunk' };
    expect(resolveBodyProfile({ modeId: 'dunk', body: { profile: own } })).toBe(own);
    expect(resolveBodyProfile({ modeId: 'skateboard' })).toBe(BODY_PROFILES.skateboard);
    expect(resolveBodyProfile({ modeId: 'karate-vs' })).toBe(BODY_PROFILES['karate-vs']);
    const none = resolveBodyProfile({ modeId: 'no_such_mode' });
    expect(none).toEqual(sessionOnly('no_such_mode'));
    expect(none).toMatchObject({ key: 'no_such_mode', modeId: 'no_such_mode', bindings: [], motion: 'merge', overheadIsPlay: false });
  });
  it('a claimed move is dropped from the floor (the mode\'s onBody has it), the rest stay; unclaimed leaves the row itself', () => {
    const p = resolveBodyProfile({ modeId: 'skateboard', body: { claims: ['takeoff', 'overhead'] } });
    expect(froms(p)).toEqual(['lean', 'squat']);
    expect(BODY_PROFILES.skateboard.bindings).toHaveLength(3);          // the table row is untouched
    expect(froms(resolveBodyProfile({ modeId: 'freerun', body: { claims: ['cadence', 'takeoff'] } }))).toEqual([]);
    expect(froms(resolveBodyProfile({ modeId: 'karate-vs', body: { claims: ['punch'] } }))).toEqual(['kick']);
    expect(resolveBodyProfile({ modeId: 'surf', body: { claims: [] } })).toBe(BODY_PROFILES.surf);
  });
});

describe('the card', () => {
  it('reads move → verb, in binding order; a session-only mode has no lines', () => {
    expect(cardLines(BODY_PROFILES.skateboard)).toEqual([
      { move: 'Lean', verb: 'STEER' }, { move: 'Crouch', verb: 'PUMP' }, { move: 'Jump', verb: 'POP' },
    ]);
    expect(cardLines(BODY_PROFILES.sprint)).toEqual([{ move: 'Run in place', verb: 'STRIDE' }]);
    expect(cardLines(BODY_PROFILES['karate-vs'])).toEqual([{ move: 'Punch', verb: 'JAB' }, { move: 'Kick', verb: 'KICK' }]);
    expect(cardLines(BODY_PROFILES.dunk)).toEqual([]);
    for (const from of Object.keys(MOVE_LABEL)) expect(MOVE_LABEL[from as BodyBinding['from']]).not.toMatch(/^[A-Z]+$/);
    expect(SESSION_LINES.map((l) => l.verb)).toEqual(['Start / Resume', 'Pause']);
  });
  it('promises only what the session does (the step-3 review): a session-only card never promises a pause', () => {
    // BodySession arms the lost pause only where the body drives the mode, and both hands up while playing do nothing
    // (owner call 3): in a session-only game the camera starts it and brings it back from a pause, and that is all
    expect(SESSION_ONLY_COPY).toMatch(/raise both hands/i);
    expect(SESSION_ONLY_COPY).not.toMatch(/start and pause|\bpauses? (it|the game)\b/i);
    // a bound card's pause line holds only while the body is the one playing (Z5): the note says so
    expect(PAUSE_NOTE).toMatch(/only while your body is playing/);
    expect(PAUSE_NOTE).toMatch(/controller/);
  });
});
