// Pad equivalence: movement play phase 7 must not change PAD play (PLAN-P7 G5).
//
// P7 taught the combat core the body's timing: StrikeController.request / StrikeInstance a body strike's elapsed start
// (and its queued onset), StringBook.pressMove and the uppercut link (MOVES.uppercutLink), resolveStrike and
// DefenseController.resolve the body's widened windows, EvadeMoves the slip. Every one of those is an OPTION a pad path
// never passes. This file drives the live core and a frozen copy of the pre-P7 one (tests/fixtures/combat-pre-p7,
// `git show b440b737`) with the SAME pad input on the SAME clock and requires the same answer at every step:
//   • the move table (every old move deep-equal; exactly one move added, which no button sequence resolves to);
//   • resolveMove over every string of up to three presses × stick × situation;
//   • StringBook.press and StrikeQueue over seeded press streams (gaps inside and outside the string window, resets);
//   • StrikeController on the book, karate, staff and blade movesets: request / update / swapMoveset streams at 4–50 ms
//     frames, every return value, the swing's move, phase, remaining time, time to active, hit liveness and cancel reads;
//   • resolveStrike on seeded attacks, distances, lateral offsets and defender states (the outcome and every defender
//     field after);
//   • DefenseController: pressBlock / releaseBlock / resolve / whiffImpact streams;
//   • EvadeMoves: roll / jump / update streams (the slip is never called by a pad).
// One difference is real and pinned: bookMoveset() maps every book move, so the live book moveset has the uppercut link
// as one more entry. It is unreachable from a press (resolveMove never returns it, asserted below).
import { describe, it, expect } from 'vitest';
import * as NS from '../core/StrikeSystem';
import * as OS from '@/tests/fixtures/combat-pre-p7/StrikeSystem.base';
import * as NH from '../core/HordeDynamics';
import * as OH from '@/tests/fixtures/combat-pre-p7/HordeDynamics.base';
import * as NF from '../core/FightCore';
import * as OF from '@/tests/fixtures/combat-pre-p7/FightCore.base';
import * as ND from '../core/DefenseSystem';
import * as OD from '@/tests/fixtures/combat-pre-p7/DefenseSystem.base';
import * as NE from '../core/EvadeMoves';
import * as OE from '@/tests/fixtures/combat-pre-p7/EvadeMoves.base';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
const BTNS = ['A', 'B', 'Y'] as const;
const DIRS = ['n', 'f', 'b'] as const;

describe('pad equivalence — the move table and the book', () => {
  it('every pre-P7 move is unchanged; the only move added is the body uppercut link', () => {
    for (const [id, m] of Object.entries(OH.MOVES)) expect((NH.MOVES as Record<string, unknown>)[id]).toEqual(m);
    const added = Object.keys(NH.MOVES).filter((k) => !(k in OH.MOVES));
    expect(added).toEqual(['uppercutLink']);
    expect(NH.STRIKE_TIMING).toEqual(OH.STRIKE_TIMING);
    expect([NH.STRING_WINDOW_SEC, NH.STRING_MAX, NH.QUEUE_SEC, NH.DASH_ATTACK_SEC]).toEqual([OH.STRING_WINDOW_SEC, OH.STRING_MAX, OH.QUEUE_SEC, OH.DASH_ATTACK_SEC]);
  });

  it('resolveMove: every string of 1–3 presses × stick × situation names the same move, and never the uppercut link', () => {
    const seqs: NH.StrikeBtn[][] = [];
    for (const a of BTNS) { seqs.push([a]); for (const b of BTNS) { seqs.push([a, b]); for (const c of BTNS) seqs.push([a, b, c]); } }
    let n = 0;
    for (const s of seqs) for (const d of DIRS) for (let o = 0; o < 16; o++) {
      const opts = { air: !!(o & 1), afterDash: !!(o & 2), airborne: !!(o & 4), close: !!(o & 8) };
      const got = NH.resolveMove(s, d, opts), want = OH.resolveMove(s, d, opts);
      expect(got).toEqual(want);
      expect(got.id).not.toBe('uppercutLink');
      n++;
    }
    expect(n).toBe(39 * 3 * 16);
  });

  it('StringBook.press and StrikeQueue: the same moves and history over seeded press streams', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = mulberry32(seed);
      const nb = new NH.StringBook(), ob = new OH.StringBook();
      const nq = new NH.StrikeQueue(), oq = new OH.StrikeQueue();
      let t = r() * 3;
      for (let i = 0; i < 200; i++) {
        t += r() < 0.15 ? 0.6 + r() * 1.2 : r() * 0.5;   // inside and outside the string window
        const btn = pick(r, BTNS), dir = pick(r, DIRS);
        const opts = { air: r() < 0.1, afterDash: r() < 0.1, airborne: r() < 0.05, close: r() < 0.3 };
        expect(nb.press(btn, dir, t, opts)).toEqual(ob.press(btn, dir, t, opts));
        expect([...nb.history]).toEqual([...ob.history]);
        if (r() < 0.03) { nb.reset(); ob.reset(); }
        if (r() < 0.4) { nq.push(btn, dir, t); oq.push(btn, dir, t); }
        if (r() < 0.4) { const q = t + r() * 0.6; expect(nq.take(q)).toEqual(oq.take(q)); }
        expect(nq.pending).toBe(oq.pending);
        if (r() < 0.05) { nq.clear(); oq.clear(); }
      }
    }
  });
});

describe('pad equivalence — StrikeController', () => {
  const sets: [string, () => Record<string, NS.CombatMove>, () => Record<string, OS.CombatMove>][] = [
    ['book', () => NS.bookMoveset(NF.KARATE_ATTACKS), () => OS.bookMoveset(OF.KARATE_ATTACKS)],
    ['karate', () => NS.karateMoveset(NF.KARATE_ATTACKS), () => OS.karateMoveset(OF.KARATE_ATTACKS)],
    ['staff', () => NS.stringRule(NS.staffMoveset(NF.STAFF_ATTACKS)), () => OS.stringRule(OS.staffMoveset(OF.STAFF_ATTACKS))],
    ['blade', () => NS.stringRule(NS.bladeMoveset()), () => OS.stringRule(OS.bladeMoveset())],
  ];

  it('the movesets are the same (the live book has the uppercut link as one more entry)', () => {
    for (const [name, mk, mkOld] of sets) {
      const n = mk(), o = mkOld();
      for (const id of Object.keys(o)) expect(n[id], `${name}.${id}`).toEqual(o[id]);
      expect(Object.keys(n).filter((k) => !(k in o))).toEqual(name === 'book' ? ['uppercutLink'] : []);
      // (validateMoveset predates the string rule's '*' and flags it on both: the same lines, plus the added move's own)
      expect(NS.validateMoveset(n).filter((x) => !x.startsWith('uppercutLink'))).toEqual(OS.validateMoveset(o));
    }
    expect([NS.MIN_STARTUP_SEC, NS.QUEUE_MS]).toEqual([OS.MIN_STARTUP_SEC, OS.QUEUE_MS]);
  });

  it('request / update / swapMoveset streams: identical answers at every step (and request(id, now, {}) is a press)', () => {
    let frames = 0;
    for (const [name, mk, mkOld] of sets) {
      const oldIds = Object.keys(mkOld());
      for (let seed = 1; seed <= 25; seed++) {
        const r = mulberry32(seed * 131 + name.length);
        const nc = new NS.StrikeController(mk()), oc = new OS.StrikeController(mkOld());
        const ec = new NS.StrikeController(mk());   // the live one, called with an EMPTY options object every time
        let now = 1000 + r() * 1000;
        for (let i = 0; i < 400; i++) {
          if (r() < 0.35) {
            const id = r() < 0.05 ? 'nope' : pick(r, oldIds);
            const a = nc.request(id, now), b = oc.request(id, now), c = ec.request(id, now, r() < 0.5 ? {} : undefined);
            expect(a).toBe(b); expect(c).toBe(b);
          }
          const dt = r() < 0.03 ? 0.2 + r() * 0.3 : 0.004 + r() * 0.046;
          now += dt * 1000;
          const ua = nc.update(dt, now), ub = oc.update(dt, now), uc = ec.update(dt, now);
          expect(ua).toEqual(ub); expect(uc).toEqual(ub);
          for (const [x, y] of [[nc, oc], [ec, oc]] as const) {
            expect(x.busy).toBe(y.busy);
            expect(x.current?.move.atk.id ?? null).toBe(y.current?.move.atk.id ?? null);
            expect(x.current?.phase ?? null).toBe(y.current?.phase ?? null);
            if (x.current && y.current) {
              expect(x.current.remainingMs).toBe(y.current.remainingMs);
              expect(x.current.secToActive).toBe(y.current.secToActive);
              expect(x.current.hitLive).toBe(y.current.hitLive);
              expect(x.current.inCancelWindow).toBe(y.current.inCancelWindow);
              const probe = pick(r, oldIds);
              expect(x.current.canCancelInto(probe)).toBe(y.current.canCancelInto(probe));
            }
          }
          if (nc.current?.hitLive && r() < 0.5) { nc.current.consumeHit(); oc.current!.consumeHit(); ec.current!.consumeHit(); }
          if (r() < 0.004) { const m = r() < 0.5; nc.swapMoveset(m ? mk() : mk()); oc.swapMoveset(mkOld()); ec.swapMoveset(mk()); }
          frames++;
        }
      }
    }
    expect(frames).toBe(4 * 25 * 400);
  });
});

describe('pad equivalence — the fight rules', () => {
  const attacks = (): NF.AttackDef[] => [
    ...Object.values(NF.KARATE_ATTACKS), ...Object.values(NF.STAFF_ATTACKS), NF.SPECIAL_ATTACK,
    ...Object.values(NS.bookMoveset(NF.KARATE_ATTACKS)).map((m) => m.atk),
  ];

  it('resolveStrike: the same outcome and the same defender after it, for seeded attacks, ranges, offsets and states', () => {
    expect(NF.PARRY_WINDOW_MS).toBe(OF.PARRY_WINDOW_MS);
    expect(NF.STEP_EVADE_M).toBe(OF.STEP_EVADE_M);
    const atks = attacks();
    const r = mulberry32(7);
    for (let i = 0; i < 20000; i++) {
      const atk = pick(r, atks);
      const nd = new NF.FighterState(100), od = new OF.FighterState(100);
      const guard = Math.round(r() * 100), block = r() < 0.5, stun = r() < 0.15 ? r() : 0, stag = r() < 0.1 ? r() : 0;
      for (const d of [nd, od]) { d.guard = guard; d.blockHeld = block; d.stunSec = stun; d.staggerSec = stag; }
      const now = 10000 + r() * 1000;
      const press = r() < 0.5 ? now - r() * 400 : -1e9;
      nd.lastBlockPressMs = press; od.lastBlockPressMs = press;
      const dist = r() * 4, lat = r() < 0.3 ? undefined : r() * 0.8;
      expect(NF.resolveStrike(atk, dist, nd, now, lat)).toBe(OF.resolveStrike(atk, dist, od, now, lat));
      expect({ ...nd }).toEqual({ ...od });
    }
  });

  it('DefenseController: pressBlock / releaseBlock / resolve / whiffImpact streams give the same actions', () => {
    expect([ND.GUARD_IMPACT_WINDOW_MS, ND.SUBSTITUTION_CHI_COST]).toEqual([OD.GUARD_IMPACT_WINDOW_MS, OD.SUBSTITUTION_CHI_COST]);
    const atks = attacks();
    for (let seed = 1; seed <= 20; seed++) {
      const r = mulberry32(seed * 977);
      const n = new ND.DefenseController(), o = new OD.DefenseController();
      let now = 5000;
      for (let i = 0; i < 1000; i++) {
        now += r() * 120;
        const u = r();
        if (u < 0.25) { const f = r() < 0.4; n.pressBlock(now, f); o.pressBlock(now, f); }
        else if (u < 0.4) { n.releaseBlock(); o.releaseBlock(); }
        else if (u < 0.45) { n.whiffImpact(now); o.whiffImpact(now); }
        else {
          const atk = pick(r, atks), dist = r() * 4, blocking = r() < 0.5;
          expect(n.resolve(atk, dist, blocking, now)).toBe(o.resolve(atk, dist, blocking, now));
          expect(n.resolve(atk, dist, blocking, now, undefined)).toBe(o.resolve(atk, dist, blocking, now));
        }
        expect(n.blocking).toBe(o.blocking);
        expect(n.canSubstitute(50, now)).toBe(o.canSubstitute(50, now));
      }
    }
  });

  it('EvadeMoves: roll / jump / update streams give the same motion (a pad never slips)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const r = mulberry32(seed * 313);
      const n = new NE.EvadeMoves(), o = new OE.EvadeMoves();
      for (let i = 0; i < 600; i++) {
        const u = r();
        if (u < 0.05) { const x = r() * 2 - 1, z = r() * 2 - 1; expect(n.roll(x, z)).toBe(o.roll(x, z)); }
        else if (u < 0.08) expect(n.jump()).toBe(o.jump());
        const dt = r() < 0.02 ? 0 : 0.004 + r() * 0.04;
        const a = n.update(dt), b = o.update(dt);
        expect(a === null ? null : [a.x, a.y, a.z]).toEqual(b === null ? null : [b.x, b.y, b.z]);
        expect([n.rolling, n.rollIFrames, n.airborne, n.height, n.rollReady, n.canAct]).toEqual([o.rolling, o.rollIFrames, o.airborne, o.height, o.rollReady, o.canAct]);
        expect(n.slipping).toBe(false);
        if (r() < 0.01) { n.reset(); o.reset(); }
      }
    }
  });
});
