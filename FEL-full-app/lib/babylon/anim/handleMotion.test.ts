// HOOPS MOTION phase 4b (plan §3.4, §6) — ONE RENDERER FOR THE HANDLE MOVES. The render is shared (anim/handleMotion); the DECISION stays
// with each call site: per input, the number of resolveHandleMove calls, rolls drawn, chain links and impulses must be today's, in both
// modes, with each mode's own read builder (1v1: its seeded `roll`; 3v3: none passed — Math.random). The requests below are built the
// way each mode builds them (the contract half at the end reads the modes' source for the same shapes).
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestMove, resolveSides, sizeUpMoveOf, SAME_HAND_TWIN, crossClip, crossSourceOverride, type HandleHost, type HandleRequest, type Side } from './handleMotion';
import { resolveHandleMove, pushChain, CHAIN_IDLE, MOVE_SHAPE, MOVE_TURBO_REAL, moveRate, type ChainState, type HandleMove, type DefenderRead } from '../core/HandleSystem';

/** A body for the renderer: a carry that records what it is asked to play, a tree that records its beats, an impulse sink. */
function body(hand: 'Left' | 'Right' = 'Right', busy = false) {
  const log = { beats: [] as { clip: string; fadeSec: number; speedRatio: number }[], runs: [] as { move: string; pace?: number }[], queued: [] as string[], impulses: [] as { forward: number; lateral: number }[],
    starts: [] as ((e: string, m: string) => void)[] };
  const carry = {
    // a running move is on its way to `hand` (its end hand)
    hand, move: busy ? ({ name: 'crossover', endHand: hand === 'Left' ? 'left' : 'right' } as never) : null,
    runMove: (m: unknown, o?: { pace?: number }) => { log.runs.push({ move: String(m), pace: o?.pace }); return true; },
    queueMove: (m: unknown, o?: { onEvent?: (e: string, m: string) => void }) => { log.queued.push(String(m)); if (o?.onEvent) log.starts.push(o.onEvent); return true; },
  };
  const host: HandleHost = { carry: carry as never, beat: (clip, o) => log.beats.push({ clip, ...o }), impulse: (forward, lateral) => log.impulses.push({ forward, lateral }) };
  return { host, log };
}
/** A defender in range: a roll is drawn on every owned move in the window (resolveHandleMove rolls when he is present and within). */
const READ_IN_RANGE: DefenderRead = { present: true, closing: true, set: false, within: true };

/** The two modes' call sites, as each builds its request today (1v1's roll injected; 3v3's resolve takes the default Math.random). */
interface Site { chain: ChainState; resolves: number; rolls: number }
const oneVOne = (s: Site, handle = 100) => {
  const roll = () => { s.rolls++; return 0.99; };   // (never lands: the counts, not the ankles)
  const resolve = (move: HandleMove, read: DefenderRead) => { s.resolves++; const o = resolveHandleMove(move, s.chain, handle, read, roll); return o; };
  return {
    doMove: (move: HandleMove, hint?: Side, cutSide?: Side, flick = false): HandleRequest => ({ move, hint, cutSide, flick, impulse: true, path: move === 'steezo_roll' ? 'momentum_btb' : undefined, decide: { kind: 'resolve', run: () => { const o = resolve(move, READ_IN_RANGE); s.chain = o.chain; return o; } } }),
    stepback: (): HandleRequest => ({ move: 'stepback', clip: 'bball_stepback_gather', path: false, decide: { kind: 'chainOnly', run: () => { s.chain = resolve('stepback', { present: false, closing: false, set: true, within: false }).chain; } } }),
    snatchback: (): HandleRequest => ({ move: 'snatch_back', clip: 'bball_stepback_gather', decide: { kind: 'custom', run: () => { s.chain = resolve('snatch_back', { ...READ_IN_RANGE, set: false }).chain; } } }),
    sizeUp: (clip: string, side: Side): HandleRequest => ({ move: sizeUpMoveOf(clip), hint: side, decide: { kind: 'none' }, fadeSec: 0.08, speedRatio: 1 }),
    spin: (): HandleRequest => ({ move: 'spin', decide: { kind: 'none' }, clip: null, path: 'spin' }),
    jab: (): HandleRequest => ({ move: 'jab', clip: 'bball_hesi', decide: { kind: 'custom', run: () => { roll(); } } }),
  };
};
const threeVThree = (s: Site, handle = 100) => {
  const resolve = (move: HandleMove, read: DefenderRead, roll?: () => number) => { s.resolves++; return roll ? resolveHandleMove(move, s.chain, handle, read, roll) : resolveHandleMove(move, s.chain, handle, read); };
  const roll = () => { s.rolls++; return 0.99; };   // the stick's step-back / snatchback pass 3v3's `roll`; doMove passes none
  return {
    doMove: (move: HandleMove, hint?: Side, cutSide?: Side): HandleRequest => ({ move, hint, cutSide, impulse: true, path: move === 'steezo_roll' ? 'momentum_btb' : undefined, decide: { kind: 'resolve', run: () => { const o = resolve(move, READ_IN_RANGE); s.chain = o.chain; return o; } } }),
    stepback: (): HandleRequest => ({ move: 'stepback', clip: 'bball_stepback_gather', path: false, decide: { kind: 'chainOnly', run: () => { s.chain = resolve('stepback', { present: false, closing: false, set: true, within: false }, roll).chain; } } }),
    snatchback: (): HandleRequest => ({ move: 'snatch_back', clip: 'bball_stepback_gather', decide: { kind: 'custom', run: () => { s.chain = resolve('snatch_back', { ...READ_IN_RANGE, set: false }, roll).chain; } } }),
    sizeUp: (clip: string, side: Side): HandleRequest => ({ move: sizeUpMoveOf(clip), hint: side, decide: { kind: 'none' }, fadeSec: 0.08, speedRatio: 1 }),
    spin: (): HandleRequest => ({ move: 'spin', decide: { kind: 'none' }, clip: null, path: 'spin' }),
    jab: (): HandleRequest => ({ move: 'jab', clip: 'bball_hesi', fadeSec: 0.05, speedRatio: 1, decide: { kind: 'custom', run: () => { Math.random(); } } }),
  };
};

afterEach(() => { vi.restoreAllMocks(); });

describe('the decision is each call site\'s, run once, on the input frame — the counts are today\'s (plan §3.4)', () => {
  // today (plan §3.4's table): resolveHandleMove calls, rolls drawn (a defender in range, the move owned and in the window), chain links, impulses
  const TODAY: Record<string, { resolves: number; rolls: number; links: number; impulses: number }> = {
    'R-stick crossover': { resolves: 1, rolls: 1, links: 1, impulses: 1 },
    'R-stick in-and-out': { resolves: 1, rolls: 1, links: 1, impulses: 0 },
    'R-stick hesi': { resolves: 1, rolls: 1, links: 1, impulses: 0 },
    'R-stick between': { resolves: 1, rolls: 1, links: 1, impulses: 1 },
    'momentum cross': { resolves: 1, rolls: 1, links: 1, impulses: 0 },
    'left-stick reversal (crossover pick)': { resolves: 1, rolls: 1, links: 1, impulses: 1 },
    'pull-back hesi': { resolves: 1, rolls: 1, links: 1, impulses: 0 },
    'step-back': { resolves: 1, rolls: 0, links: 1, impulses: 0 },
    'snatchback': { resolves: 1, rolls: 1, links: 1, impulses: 0 },
    'size-up': { resolves: 0, rolls: 0, links: 0, impulses: 0 },
    'spin (start)': { resolves: 0, rolls: 0, links: 0, impulses: 0 },
    'jab': { resolves: 0, rolls: 1, links: 0, impulses: 0 },
  };
  for (const [mode, sites] of [['1v1', oneVOne], ['3v3', threeVThree]] as const) {
    it(`${mode}: every input's counts`, () => {
      const rnd = vi.spyOn(Math, 'random');
      for (const [input, want] of Object.entries(TODAY)) {
        const s: Site = { chain: { ...CHAIN_IDLE }, resolves: 0, rolls: 0 };
        const cs = sites(s);
        const req: HandleRequest = input === 'R-stick crossover' ? cs.doMove('crossover', 'left')
          : input === 'R-stick in-and-out' ? cs.doMove('in_and_out', 'right')
          : input === 'R-stick hesi' ? cs.doMove('hesi')
          : input === 'R-stick between' ? cs.doMove('between_legs', 'left')
          : input === 'momentum cross' ? cs.doMove('momentum_cross', 'left')
          : input === 'left-stick reversal (crossover pick)' ? cs.doMove('crossover', undefined, 'left')
          : input === 'pull-back hesi' ? cs.doMove('hesi')
          : input === 'step-back' ? cs.stepback() : input === 'snatchback' ? cs.snatchback() : input === 'size-up' ? cs.sizeUp('bball_yoyo', 'right')
          : input === 'spin (start)' ? cs.spin() : cs.jab();
        rnd.mockClear();
        const { host, log } = body();
        const r = requestMove(host, req);
        const rolls = s.rolls + rnd.mock.calls.length;   // (3v3's doMove draws Math.random inside resolveHandleMove)
        expect({ input, resolves: s.resolves, rolls, links: s.chain.length, impulses: log.impulses.length }).toEqual({ input, ...want });
        expect(r.owned).toBe(true);
      }
    });
  }

  it('the decision runs BEFORE the render, and a move not owned renders nothing — no clip, no ball, no impulse (the gate is the upgrade)', () => {
    const order: string[] = [];
    const { host, log } = body();
    const h: HandleHost = { ...host, beat: (c, o) => { order.push('beat'); host.beat(c, o); } };
    requestMove(h, { move: 'crossover', impulse: true, decide: { kind: 'resolve', run: () => { order.push('decide'); return resolveHandleMove('crossover', CHAIN_IDLE, 100, READ_IN_RANGE, () => 0.99); } } });
    expect(order).toEqual(['decide', 'beat']);
    const low = body();
    const r = requestMove(low.host, { move: 'shammgod', impulse: true, decide: { kind: 'resolve', run: () => resolveHandleMove('shammgod', CHAIN_IDLE, 50, READ_IN_RANGE, () => 0.99) } });
    expect(r.owned).toBe(false);
    expect(low.log.beats).toEqual([]); expect(low.log.runs).toEqual([]); expect(low.log.impulses).toEqual([]);
  });

  it('a RESTARTED move (a repeat / out of the window) renders its clip and its ball, but no impulse — as today', () => {
    const chain = pushChain('crossover', { ...CHAIN_IDLE }, 100);   // a crossover straight after a crossover: a repeat restarts the chain
    const { host, log } = body();
    const r = requestMove(host, { move: 'crossover', impulse: true, decide: { kind: 'resolve', run: () => resolveHandleMove('crossover', chain, 100, READ_IN_RANGE, () => 0.99) } });
    expect(r.restarted).toBe(true);
    expect(log.beats.length).toBe(1); expect(log.runs.length).toBe(1); expect(log.impulses).toEqual([]);
  });

  it('off the head is the mode\'s: its flick plays the crossover clip (flickClip), no ball path, no impulse — the mode throws the ball', () => {
    const { host, log } = body();
    requestMove(host, { move: 'off_the_head', flick: true, impulse: true, cutSide: 'left', decide: { kind: 'resolve', run: () => resolveHandleMove('off_the_head', CHAIN_IDLE, 100, { present: false, closing: false, set: false, within: false }) } });
    expect(log.beats.map((b) => b.clip)).toEqual(['bball_crossover_left']);
    expect(log.runs).toEqual([]); expect(log.impulses).toEqual([]);
  });

  it('a rival\'s request (decide none, no impulse, no link) resolves nothing, links nothing, moves no body — only his clip and ball (4f routes his crossover here)', () => {
    const { host, log } = body();
    const r = requestMove(host, { move: 'crossover', decide: { kind: 'none' } });
    expect(r.outcome).toBeNull(); expect(log.impulses).toEqual([]);
    expect(log.beats.map((b) => b.clip)).toEqual(['bball_crossover_left']); expect(log.runs.map((x) => x.move)).toEqual(['crossover']);
  });
});

describe('the sides: one value for the clip and the ball (S31 / U10), and the reversal rule (plan §3.4)', () => {
  it('a move that crosses once ends in the OTHER hand whatever the side named, and its clip is named for that hand; the carry runs its path', () => {
    for (const [hand, other] of [['Right', 'left'], ['Left', 'right']] as const) {
      for (const move of ['crossover', 'between_legs', 'behind_back', 'momentum_cross', 'momentum_btb', 'shammgod', 'snatch_back'] as HandleMove[]) {
        const { host, log } = body(hand);
        const r = requestMove(host, { move, hint: 'right', decide: { kind: 'none' } });   // (a hint on the ball's own side changes nothing)
        expect(r.endHand, `${move} from ${hand}`).toBe(other); expect(r.clipDir).toBe(r.endHand);
        if (r.clip && /_(left|right)$/.test(r.clip)) expect(r.clip.endsWith(`_${other}`), `${move}: ${r.clip}`).toBe(true);
        expect(log.runs.map((x) => x.move)).toEqual([move]);
      }
    }
  });

  it('the left-stick reversal: a crossing pick crosses to the cut side — or, the ball already there, plays its SAME-HAND TWIN (never a cross into him, Q4)', () => {
    const cross = body('Right'); const r1 = requestMove(cross.host, { move: 'crossover', cutSide: 'left', flick: true, decide: { kind: 'none' } });
    expect(r1).toMatchObject({ twin: false, endHand: 'left', clip: 'bball_crossover_left' }); expect(cross.log.runs[0].move).toBe('crossover');
    for (const move of Object.keys(SAME_HAND_TWIN) as HandleMove[]) {
      const same = body('Right'); const r2 = requestMove(same.host, { move, cutSide: 'right', flick: true, decide: { kind: 'none' } });
      expect(r2, move).toMatchObject({ twin: true, rendered: 'in_and_out', endHand: 'right', clip: 'bball_in_and_out_right' });
      expect(same.log.runs[0].move).toBe('in_and_out');
    }
  });

  it('…a same-hand pick keeps the hand while the cut still turns the body; the double cross ends in the start hand; the impulse goes with the move (U18)', () => {
    for (const move of ['in_and_out', 'slip_slide', 'yoyo'] as HandleMove[]) {
      const s = resolveSides(move, 'right', { cutSide: 'left' });
      expect(s.endHand, move).toBe('right'); expect(s.impulseDir, move).toBe('left');
    }
    expect(resolveSides('double_cross', 'right', { cutSide: 'left' }).endHand).toBe('right');
    // the impulse (U18): a crossover to the left goes left — the body with the ball (it went "away from him")
    const { host, log } = body('Right');
    requestMove(host, { move: 'crossover', hint: 'left', impulse: true, decide: { kind: 'none' } });
    expect(log.impulses).toHaveLength(1); expect(log.impulses[0].lateral).toBeLessThan(0);
    const slip = body('Right');
    requestMove(slip.host, { move: 'slip_slide', cutSide: 'left', impulse: true, decide: { kind: 'none' } });
    expect(slip.log.impulses[0].lateral).toBeLessThan(0);   // the slip goes with the cut
  });

  it('the steezo roll renders its wrap here (the spin that follows it is its pull back): one crossing now, the clip named for the end hand', () => {
    const { host, log } = body('Right');
    const r = requestMove(host, { move: 'steezo_roll', hint: 'right', path: 'momentum_btb', decide: { kind: 'none' } });
    expect(r.endHand).toBe('left'); expect(r.clip).toBe('bball_behind_back_left'); expect(log.runs[0].move).toBe('momentum_btb');
  });

  it('with a move running on the carry the path QUEUES behind it (the double request is a double cross) — the decision still runs now', () => {
    const s: Site = { chain: { ...CHAIN_IDLE }, resolves: 0, rolls: 0 };
    const { host, log } = body('Left', true);   // mid-crossover, on its way to the left hand
    const r = requestMove(host, oneVOne(s).doMove('crossover', 'right'));
    expect(s.resolves).toBe(1); expect(r.ball).toBe('queued'); expect(log.queued).toEqual(['crossover']); expect(log.runs).toEqual([]);
    expect(r.startHand).toBe('left'); expect(r.endHand).toBe('right');   // from the running move's destination
    // (4b review F2) its clip beats when its path STARTS (the carry's 'start' at the running move's catch), not now
    expect(r.clipAt).toBe('start'); expect(log.beats).toEqual([]);
    log.starts[0]('start', 'crossover'); log.starts[0]('start', 'crossover');
    expect(log.beats.map((b) => b.clip)).toEqual(['bball_crossover_right']);   // once
  });

  it('a request while one is already QUEUED replaces it and starts from the RUNNING move\'s end hand (the carry\'s `hand` counts the queued crossing it is about to replace) — 4b review F2', () => {
    const { host, log } = body('Left', true);
    // the carry says the ball ends RIGHT (the running crossover to the left + a queued crossing back); the running move itself ends LEFT
    (host.carry as unknown as { hand: string }).hand = 'Right';
    const r = requestMove(host, { move: 'shammgod', cutSide: 'right', decide: { kind: 'none' } });
    expect(r.startHand).toBe('left'); expect(r.endHand).toBe('right'); expect(r.clip).toBe('bball_shammgod_right'); expect(r.ball).toBe('queued');
    expect(log.beats).toEqual([]);
  });

  it('the pace: today\'s MOVE PACE for the clip (moveRate), the turbo\'s real-speed pace for the ball (MOVE_TURBO_REAL — the paths are bounded at it)', () => {
    const { host, log } = body();
    requestMove(host, { move: 'crossover', turbo: true, decide: { kind: 'none' } });
    expect(log.beats[0].speedRatio).toBe(moveRate(true)); expect(log.runs[0].pace).toBe(MOVE_TURBO_REAL);
    const off = body(); requestMove(off.host, { move: 'crossover', decide: { kind: 'none' } });
    expect(off.log.beats[0].speedRatio).toBe(moveRate(false)); expect(off.log.runs[0].pace).toBe(1);
  });

  it('a size-up plays its move\'s clip and ball in place (the between step crosses, named for its end hand) — no impulse, no link', () => {
    expect(sizeUpMoveOf('bball_yoyo')).toBe('yoyo'); expect(sizeUpMoveOf('bball_in_and_out_right')).toBe('in_and_out'); expect(sizeUpMoveOf('bball_between_legs_right')).toBe('between_legs');
    const s: Site = { chain: { ...CHAIN_IDLE }, resolves: 0, rolls: 0 };
    for (const clip of ['bball_yoyo', 'bball_in_and_out_right', 'bball_between_legs_right']) {
      const { host, log } = body('Right');
      const r = requestMove(host, oneVOne(s).sizeUp(clip, 'right'));
      expect(log.impulses).toEqual([]); expect(log.beats).toHaveLength(1);
      expect(r.clip).toBe(clip === 'bball_between_legs_right' ? 'bball_between_legs_left' : clip);
    }
    expect(s.chain.length).toBe(0); expect(s.resolves).toBe(0);
  });

  it('3v3 plays the move with no live foe (U17: its clip sat inside `if (foe)`) — the read is his to make, the render is not', () => {
    const { host, log } = body();
    requestMove(host, { move: 'crossover', hint: 'left', impulse: true, decide: { kind: 'resolve', run: () => resolveHandleMove('crossover', CHAIN_IDLE, 100, { present: false, closing: false, set: false, within: false }) } });
    expect(log.beats).toHaveLength(1); expect(log.runs).toHaveLength(1);
  });

  it('every HandleMove the renderer can be asked for has its shape (MOVE_SHAPE) and every crossing move a twin', () => {
    for (const m of Object.keys(MOVE_SHAPE) as HandleMove[]) { const s = resolveSides(m, 'right'); expect(s.endHand).toMatch(/left|right/); }
    for (const m of Object.keys(MOVE_SHAPE) as HandleMove[]) if (MOVE_SHAPE[m].crosses === 1 && MOVE_SHAPE[m].owner === 'motion' && m !== 'spin') expect(SAME_HAND_TWIN[m], m).toBe('in_and_out');
  });
});

describe('HOOPS MOTION phase 4c: the crossover\'s A/B (plan §4.1 — ?hm4cross=cap|auth, decided on pops and the name verdict)', () => {
  it('the authored v2 clip by default; the capture by its own name under cap (dev only) — the crossover and the momentum cross, nothing else', () => {
    expect(crossSourceOverride('?agent=1&hm4cross=cap', true)).toBe('cap');
    expect(crossSourceOverride('?agent=1&hm4cross=cap', false)).toBe('auth');   // never in a production build
    expect(crossSourceOverride('?agent=1', true)).toBe('auth'); expect(crossSourceOverride(null, true)).toBe('auth');
    expect(crossClip('bball_crossover_left', 'auth')).toBe('bball_crossover_left');
    expect(crossClip('bball_crossover_right', 'cap')).toBe('bball_mc_crossover_right');
    expect(crossClip('bball_momentum_cross_left', 'cap')).toBe('bball_mc_crossover_left');
    expect(crossClip('bball_between_legs_left', 'cap')).toBe('bball_between_legs_left');
    expect(crossClip(null, 'cap')).toBeNull();
  });
  it('the momentum cross plays its OWN clip (its path is wider and further ahead than the crossover\'s)', () => {
    const { host, log } = body('Right');
    requestMove(host, { move: 'momentum_cross', turbo: true, decide: { kind: 'none' } });
    expect(log.beats[0].clip).toBe('bball_momentum_cross_left'); expect(log.runs[0].move).toBe('momentum_cross');
  });
});

describe('the modes\' call sites (contract: the source)', () => {
  const one = readFileSync('lib/babylon/modes/OneVOneMode.ts', 'utf8'), three = readFileSync('lib/babylon/modes/ThreeVThreeMode.ts', 'utf8');
  it('each call site keeps its decision kind: doMove resolves (1v1 with its roll, 3v3 with none), the step-back links (chainOnly), the snatchback and the jab decide themselves (custom), the size-up and the spin decide nothing', () => {
    // H2 rewrote the two RNG pins (same intent): resolveHandleMove takes the unlock gate after the RNG now, so 3v3 names its Math.random
    // (the default it used by passing none) and both pass MOVES_UNLOCKED_GATE — 1v1 still rolls its seeded `roll`, 3v3 still Math.random.
    for (const [name, src, roll] of [['1v1', one, /\}, roll, MOVES_UNLOCKED_GATE\) \},/], ['3v3', three, /within: !!foe && distXZ\(me\.char\.root\.position, foe\.char\.root\.position\) < SHAKE_RANGE,\s*\}, Math\.random, MOVES_UNLOCKED_GATE\) \},/]] as const) {
      const fn = src.slice(src.indexOf('function doMove('), src.indexOf('function doMove(') + 3000);
      expect(fn, name).toMatch(/decide: \{ kind: 'resolve', run: \(\) => resolveHandleMove\(move, chain, handle, \{/);
      expect(fn, name).toMatch(roll);
      expect(src, name).toMatch(/move: 'stepback', decide: \{ kind: 'chainOnly'/);
      expect(src, name).toMatch(/move: 'snatch_back', clip: 'bball_stepback_gather'[\s\S]{0,200}decide: \{ kind: 'custom'/);
      expect(src, name).toMatch(/move: 'jab', clip: 'bball_hesi'[\s\S]{0,200}decide: \{ kind: 'custom'/);
      expect(src, name).toMatch(/move: sizeUpMoveOf\(suClip\), hint: pick\.side \?\? undefined, decide: \{ kind: 'none' \}/);
      expect(src, name).toMatch(/requestMove\(meHost\(\), \{ move: 'spin', decide: \{ kind: 'none' \}, clip: null, path: 'spin' \}\)/);
    }
  });
  it('no switchHand() toggle is left in a move path, and the hero\'s left-stick crossover no longer moves the ball on its own (toSide): it is doMove\'s cut side', () => {
    expect(one).not.toMatch(/meCarry\?\.switchHand\(\)/); expect(three).not.toMatch(/carries\.get\(me\)\?\.switchHand\(\)/);
    expect(one).not.toMatch(/meCarry\?\.toSide\(/); expect(three).not.toMatch(/carries\.get\(me\)\?\.toSide\(/);
  });
  it('startSpin runs the pull and parks the carry only when there is no pull (the pivot, or no ball)', () => {
    for (const src of [one, three]) {
      const fn = src.slice(src.indexOf('function startSpin('), src.indexOf('function startSpin(') + 2200);
      expect(fn).toMatch(/const pulled = !pivotRead && requestMove\(/);
      expect(fn).toMatch(/if \(!pulled\) \{\s*(meCarry\?|carries\.get\(me\)\?)\.update\(0, 0, false\)/);
    }
  });
  it('U14: the jumper\'s and the footwork\'s gathers go to the right hand (gatherToShootingHand), never the carry\'s hand', () => {
    for (const src of [one, three]) {
      expect(src).toMatch(/function gatherToShootingHand\(\): void \{[\s\S]{0,420}gatherBallToHand\(ball, me(\.char)?\.skeleton, hoopsHand\(me(\.char)?\)\);/);
      expect((src.match(/gatherToShootingHand\(\);/g) ?? []).length).toBeGreaterThanOrEqual(2);
      expect(src).not.toMatch(/if \(!ball\.parent\) gatherBallToHand\(ball, me(\.char)?\.skeleton, (meCarry\?|carries\.get\(me\)\?)\.handBone \?\? hoopsHand\(me(\.char)?\)\);\s*(const contest|currentShot)/);
    }
  });
});
