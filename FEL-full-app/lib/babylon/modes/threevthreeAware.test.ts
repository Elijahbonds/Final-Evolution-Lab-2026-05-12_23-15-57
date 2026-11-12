// lane/h3-aware (PR #313's H3c, ported): THEIR POSSESSION PLAYS BOTH ENDS. On release every body kept its brain for MY possession:
// on their ball my teammates ran their offence (spacing, screening, cutting) and their men off the ball kept "defending" my players,
// parked in the paint under their own driver. The swap gives my teammates a man to guard and their men a spot to space to.
import { afterEach, describe, expect, it } from 'vitest';
import { Vector3 } from '@babylonjs/core';
import { DefenderBrain, TeammateBrain } from '../core/BasketballCore';
import { foeSpaceAngle } from '../core/PossessionSwap';
import { Aware3v3, type AwareBody } from './threevthreeAware';
import { closeFeel, openFeel } from '@/tests/helpers/feelOpen';

const DT = 1 / 60;
const RIM = new Vector3(0, 3.05, 0);
type B = AwareBody & { id: string };
const body = (id: string, x: number, z: number, brain: TeammateBrain | DefenderBrain | null, role = 'offense'): B =>
  ({ id, char: { root: { position: new Vector3(x, 0, z) }, skeleton: null }, brain, bio: { role, hasBall: false }, tree: { state: null } }) as never;

function court() {
  const me = body('me', 0, 5, null);
  const mates = [body('mate0', -4, 5, new TeammateBrain(Math.PI * 0.3)), body('mate1', 4, 5, new TeammateBrain(-Math.PI * 0.3))];
  const foes = [body('foe0', 0, 6.5, new DefenderBrain(0.6, 0)), body('foe1', -4.5, 6.5, new DefenderBrain(0.6, 1)), body('foe2', 4.5, 6.5, new DefenderBrain(0.6, 2))];
  const st = { theirBall: false, driver: null as B | null, token: 1, ball: new Vector3(0, 1, 6.5) };
  const allies = () => [me, ...mates].map((b) => b.char.root.position), foesPos = () => foes.map((b) => b.char.root.position);
  const aware = new Aware3v3<B>({ bodies: () => ({ me, mates, foes }), driver: () => st.driver, theirBall: () => st.theirBall, token: () => st.token, ball: () => st.ball, rim: RIM, allies, foes: foesPos, clock: () => 0 });
  return { me, mates, foes, st, aware, allies, foesPos };
}

afterEach(() => closeFeel());

describe('the possession role swap', () => {
  it('my ball: nobody is swapped — every body plays its own brain, as release', () => {
    const c = court();
    for (const b of [c.me, ...c.mates, ...c.foes]) { expect(c.aware.swapped(b)).toBe(false); expect(c.aware.intent(b, DT)).toBeNull(); expect(c.aware.job(b)).toBeNull(); expect(c.aware.objective(b)).toBeNull(); }
  });
  it('their ball: each teammate guards one of their men off the ball, as a DefenderBrain on that man would (never their driver: he is mine)', () => {
    const c = court(); c.st.theirBall = true; c.st.driver = c.foes[0];
    for (const [i, man] of [[0, 1], [1, 2]] as const) {
      const got = c.aware.intent(c.mates[i], DT)!;
      const want = new DefenderBrain(0, man).decide(DT, c.mates[i].char.root.position, c.st.ball, RIM, c.allies(), c.foesPos());
      expect(got).not.toBeNull();
      expect(got.moveX).toBeCloseTo(want.moveX, 9); expect(got.moveY).toBeCloseTo(want.moveY, 9);
      expect(got.steal).toBe(false);   // a teammate on D never rolls a poke (#313's assumption, kept)
      expect(['deny', 'help', 'navigate', 'onball', 'closeout', 'recover']).toContain(c.aware.job(c.mates[i]));
    }
  });
  it('their ball: their men off the ball space the floor (the wings and the top), the driver and I are not swapped', () => {
    const c = court(); c.st.theirBall = true; c.st.driver = c.foes[0];
    expect(c.aware.swapped(c.foes[0])).toBe(false); expect(c.aware.swapped(c.me)).toBe(false);
    for (const i of [1, 2]) {
      const got = c.aware.intent(c.foes[i], DT)!;
      const want = new TeammateBrain(foeSpaceAngle(i)).decide(DT, c.foes[i].char.root.position, c.st.ball, RIM, c.foesPos(), c.allies());
      expect(got.moveX).toBeCloseTo(want.moveX, 9); expect(got.moveY).toBeCloseTo(want.moveY, 9);
      expect(['space', 'cut']).toContain(c.aware.job(c.foes[i]));
    }
  });
  it('a spacer of theirs faces the ball (his objective); my teammate faces his job\'s (the ball, or his man on the ball)', () => {
    const c = court(); c.st.theirBall = true; c.st.driver = c.foes[0];
    c.aware.intent(c.mates[0], DT); c.aware.intent(c.foes[1], DT);
    expect(c.aware.objective(c.foes[1])).toBeTruthy();
    expect(c.aware.objective(c.mates[0])).toBeTruthy();
  });
  it('a box-out or a loose ball stays with the body\'s own brain', () => {
    const c = court(); c.st.theirBall = true; c.st.driver = c.foes[0];
    (c.mates[0].brain as TeammateBrain).boxOut(c.foes[1].char.root.position);
    (c.foes[2].brain as DefenderBrain).chaseBall(new Vector3(1, 0, 2));
    expect(c.aware.intent(c.mates[0], DT)).toBeNull();
    expect(c.aware.intent(c.foes[2], DT)).toBeNull();
    expect(c.aware.intent(c.mates[1], DT)).not.toBeNull();
  });
  it('a swing makes a new driver: the marks are handed out again (his old man is my teammate\'s, the new driver mine)', () => {
    const c = court(); c.st.theirBall = true; c.st.driver = c.foes[0];
    c.aware.intent(c.mates[0], DT);
    c.st.driver = c.foes[1];   // the swing to foe1 (by mate0)
    const got = c.aware.intent(c.mates[0], DT)!;
    const want = new DefenderBrain(0, 0).decide(DT, c.mates[0].char.root.position, c.st.ball, RIM, c.allies(), c.foesPos());
    expect(got.moveX).toBeCloseTo(want.moveX, 9); expect(got.moveY).toBeCloseTo(want.moveY, 9);
    expect(c.aware.swapped(c.foes[1])).toBe(false);   // the new driver runs his drive
    expect(c.aware.swapped(c.foes[0])).toBe(true);    // the old one spaces now
  });
  it('the A/B: hoops.possessionSwapOn 0 is release (nobody swapped on their ball either)', () => {
    openFeel({ 'hoops.possessionSwapOn': 0 });
    const c = court(); c.st.theirBall = true; c.st.driver = c.foes[0];
    for (const b of [...c.mates, ...c.foes]) expect(c.aware.intent(b, DT)).toBeNull();
  });
});

describe('the off-ball look through the adapter', () => {
  it('my teammate off the ball on my possession: the eyes on the ball; the knob off: the release feed (null)', () => {
    const c = court();
    const l = c.aware.look(c.mates[0], RIM, 'space')!;
    expect(l.eyes.equals(c.st.ball)).toBe(true);
    openFeel({ 'hoops.offBallLookOn': 0 });
    expect(c.aware.look(c.mates[0], RIM, 'space')).toBeNull();
  });
  it('a body with the ball keeps the release feed (the handler is not this layer\'s)', () => {
    const c = court(); c.mates[1].bio.hasBall = true;
    expect(c.aware.look(c.mates[1], RIM, 'handler')).toBeNull();
  });
  it('their on-ball defender: chest and eyes on his man (my body with the ball is his mark)', () => {
    const c = court(); c.foes[0].bio.role = 'defense'; (c.foes[0].brain as DefenderBrain).job = 'onball';
    const l = c.aware.look(c.foes[0], c.me.char.root.position, 'onball')!;
    expect(l.aim.equals(c.me.char.root.position)).toBe(true);
  });
});
