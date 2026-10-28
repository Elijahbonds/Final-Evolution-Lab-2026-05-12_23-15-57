// threevthreeAware — the 3v3's AWARENESS, in one place (lane/h3-aware, owner decision 2026-10-24: port PR #313's H3c onto current
// release). ThreeVThreeMode holds one of these and calls it from one-line hooks; everything it decides is here:
//   - THEIR POSSESSION PLAYS BOTH ENDS (core/PossessionSwap): on their ball my teammates guard their men off the ball (a DefenderBrain
//     each) and their men off the ball space the floor (a TeammateBrain each). `intent` / `objective` / `job` answer for a swapped body.
//   - THE BODIES OFF THE BALL WATCH IT (core/OffBallLook): `look` is the chest and eyes the posture feed uses for every body off the ball.
//   - THE DEFENSIVE STANCE (core/DefenseStance): a LandingAbsorb hold per body raises the standing defensive captures (`mountStance`,
//     `tickStances`), and `pose` sits the defend / slide windows' chest up.
// Each piece has its own 0/1 feel knob (group "Hoops · 3v3 awareness"); with all three off the mode plays exactly as release.
import type { Scene, Skeleton, TransformNode, Vector3 } from '@babylonjs/core';
import { DefenderBrain, TeammateBrain, distXZ } from '../core/BasketballCore';
import { jobObjective } from '../core/HoopsOffball';
import type { Intent } from '../core/PlayerSlot';
import type { PosturePose } from '../core/DunkPosture';
import { OffBallLook, offBallLookOn } from '../core/OffBallLook';
import { assignMateMarks, foeSpaceAngle, possessionSwapOn } from '../core/PossessionSwap';
import { stanceHold, stanceHoldOpts, stancePose } from '../core/DefenseStance';
import { mountLandingAbsorb, type LandingAbsorbHandle } from '../anim/LandingAbsorb';

/** What the adapter reads of a 3v3 body (ThreeVThreeMode's Body has all of it). */
export interface AwareBody {
  char: { root: TransformNode; skeleton: Skeleton };
  brain: TeammateBrain | DefenderBrain | null;
  bio: { role: string; hasBall: boolean };
  tree: { state: string | null };
}
/** What the adapter reads of the mode, live (the bodies are rebuilt at load, so they are read through the getter each time). */
export interface AwareView<B extends AwareBody> {
  bodies(): { me: B; mates: readonly B[]; foes: readonly B[] };
  driver(): B | null;
  /** Their ball (the mode's carrierId === 'foeTeam'). */
  theirBall(): boolean;
  /** The possession token (the marks are handed out again when it moves). */
  token(): number;
  ball(): Vector3;
  rim: Vector3;
  /** My team's positions [me, mate0, mate1] and theirs (the mode's refilled lists). */
  allies(): Vector3[];
  foes(): Vector3[];
  /** The mode's clock (s) — the off-ball defenders' glance. */
  clock(): number;
}

/** A body's man on defence is this close to the driver: he is on the ball (a teammate guarding without the swap). */
const ON_DRIVER_M = 2.5;

export class Aware3v3<B extends AwareBody> {
  private readonly def = new Map<B, DefenderBrain>();
  private readonly off = new Map<B, TeammateBrain>();
  private readonly looks = new Map<B, OffBallLook>();
  private readonly stances = new Map<B, LandingAbsorbHandle>();
  private key = '';
  constructor(private readonly v: AwareView<B>) {}

  // ── THEIR POSSESSION PLAYS BOTH ENDS ──
  private own(b: B): { boxing: boolean; chasing: boolean } | null { return b.brain; }
  /** Is the swap on for this body this frame: their ball, not me, not their driver, not boxing out or chasing a loose ball. */
  swapped(b: B): boolean {
    if (!this.v.theirBall() || !possessionSwapOn()) return false;
    const { me } = this.v.bodies();
    if (b === me || b === this.v.driver()) return false;
    const o = this.own(b);
    return !!o && !o.boxing && !o.chasing;
  }
  /** Hand the marks out again if the possession or the driver changed (a swing makes a new driver: he is mine to guard). */
  private sync(): void {
    const { mates, foes } = this.v.bodies(), driver = this.v.driver();
    const di = driver ? foes.indexOf(driver) : -1;
    const key = `${this.v.token()}|${di}`;
    if (key === this.key) return;
    this.key = key;
    const marks = assignMateMarks(mates.map((m) => m.char.root.position), foes.map((f) => f.char.root.position), di);
    mates.forEach((m, i) => this.defBrain(m).setMark(marks[i]));
    foes.forEach((f, i) => this.off.set(f, new TeammateBrain(foeSpaceAngle(i))));   // (the lanes read per possession)
  }
  /** My teammate's defence brain (aggression 0: a teammate on D never rolls a poke — #313's assumption, kept). */
  private defBrain(b: B): DefenderBrain { let d = this.def.get(b); if (!d) { d = new DefenderBrain(0, null); this.def.set(b, d); } return d; }
  /** The swapped brain this body runs this frame, or null. */
  private brainOf(b: B): DefenderBrain | TeammateBrain | null {
    if (!this.swapped(b)) return null;
    this.sync();
    return this.v.bodies().mates.includes(b) ? this.defBrain(b) : this.off.get(b) ?? null;
  }
  /** A swapped body's intent this frame (my teammate guarding, their man spacing), or null: the body's own brain stands. */
  intent(b: B, dt: number): Intent | null {
    const br = this.brainOf(b); if (!br) return null;
    const p = b.char.root.position, ball = this.v.ball();
    return br instanceof DefenderBrain ? br.decide(dt, p, ball, this.v.rim, this.v.allies(), this.v.foes()) : br.decide(dt, p, ball, this.v.rim, this.v.foes(), this.v.allies());
  }
  /** hoops-p03 (1v1/3v3 phase 3): their team-mate SETS A SCREEN for their handler (hoops/teamOffense3v3) — his spacing brain takes the
   *  'screen' job (TeammateBrain: to the handler's defender's shoulder, plant, roll or pop). False when he is not swapped (the swap is
   *  off, or he is boxing / chasing): no screen. */
  callScreen(b: B): boolean {
    if (!this.swapped(b) || !this.v.bodies().foes.includes(b)) return false;
    this.sync();
    const br = this.off.get(b); if (!br) return false;
    br.setJob('screen');
    return true;
  }
  /** The screen a body of theirs is running (its state while the job is screen / roll / pop; 'done' after), or null: no screen called. */
  screenOf(b: B): { phase: 'approach' | 'set' | 'roll' | 'pop' | 'done' } | null {
    const br = this.off.get(b); if (!br) return null;
    return br.job === 'screen' || br.job === 'roll' || br.job === 'pop' ? { phase: br.screen.phase } : { phase: 'done' };
  }
  /** A swapped body's job (for the mode's jobOf), or null. */
  job(b: B): string | null { const br = this.swapped(b) ? (this.def.get(b) ?? this.off.get(b) ?? null) : null; return br ? br.job : null; }
  /** A swapped body's chest target (for the mode's objectiveFor), or null: my teammate his job's (his man / the ball), their spacer the ball. */
  objective(b: B): Vector3 | null {
    if (!this.swapped(b)) return null;
    const sd = this.def.get(b);
    if (sd && this.v.bodies().mates.includes(b)) return jobObjective(sd.job, { ball: this.v.ball(), rim: this.v.rim, mark: this.markPos(sd) });
    const so = this.off.get(b);
    return so ? so.objective ?? this.v.ball() : null;
  }
  private markPos(d: DefenderBrain): Vector3 | null { const m = d.mark; return m !== null ? this.v.bodies().foes[m]?.char.root.position ?? null : null; }

  // ── THE BODIES OFF THE BALL WATCH IT ──
  /** A body's man: a defender's mark, a teammate on D his swap mark (or the driver / the man nearest him), mine the driver; a screener
   *  the man he screens. */
  private manOf(b: B, def: boolean): Vector3 | null {
    const { me, mates, foes } = this.v.bodies(), driver = this.v.driver();
    if (!def) return b.brain instanceof TeammateBrain && mates.includes(b) ? b.brain.screened : null;
    if (b.brain instanceof DefenderBrain && foes.includes(b)) { const m = b.brain.mark; const al = this.v.allies(); return m !== null && m >= 0 && m < al.length ? al[m] : null; }
    if (this.swapped(b)) { const sd = this.def.get(b); if (sd) return this.markPos(sd); }
    if (b === me || !driver) return driver?.char.root.position ?? null;
    const self = b.char.root.position;
    if (distXZ(self, driver.char.root.position) < ON_DRIVER_M) return driver.char.root.position;
    let best: B | null = null;
    for (const f of foes) if (f !== driver && (!best || distXZ(f.char.root.position, self) < distXZ(best.char.root.position, self))) best = f;
    return best?.char.root.position ?? null;
  }
  /** The chest and eyes for a body OFF the ball (the posture feed's aim / eyes), or null: the release feed (the look off, or he has it).
   *  `jobAim` / `job` are the mode's objectiveFor / jobOf for the body. */
  look(b: B, jobAim: Vector3, job: string): { aim: Vector3; eyes: Vector3 } | null {
    if (b.bio.hasBall || !offBallLookOn()) return null;
    const { me, mates, foes } = this.v.bodies();
    const def = b.bio.role === 'defense';
    // a teammate on D without the swap carries his offence job's name: on D he is on the ball near the driver, else helping
    let j = job;
    if (def && b !== me && mates.includes(b) && !this.swapped(b) && job !== 'boxout' && job !== 'chase') {
      const d = this.v.driver(); j = d && distXZ(b.char.root.position, d.char.root.position) < ON_DRIVER_M ? 'onball' : 'help';
    }
    let l = this.looks.get(b);
    if (!l) { const idx = [me, ...mates, ...foes].indexOf(b); l = new OffBallLook(0.37 * Math.max(0, idx)); this.looks.set(b, l); }
    return l.update({ self: b.char.root.position, ball: this.v.ball(), jobAim, man: this.manOf(b, def), side: def ? 'defense' : 'offense', job: j, clock: this.v.clock() });
  }

  // ── THE DEFENSIVE STANCE ──
  /** The posture pose for a body's window (the defend / slide windows' chest up with the stance on). */
  pose(window: string, pose: PosturePose): PosturePose { return stancePose(window, pose); }
  /** Mount a body's stance hold — FIRST after the animations, so the posture, the carries and the feet work off the raised body. */
  mountStance(b: B, scene: Scene): void {
    this.stances.get(b)?.dispose();
    this.stances.set(b, mountLandingAbsorb(scene, b.char.skeleton, b.char.root, { auto: false, first: true }));
  }
  /** Every body's stance this frame (read by its hold on the next animation pass). */
  tickStances(): void {
    const o = stanceHoldOpts();
    for (const [b, h] of this.stances) h.hold(stanceHold(b.tree.state), o);
  }
  /** The hold applied now (m, negative = raised), for probes. */
  stanceDrop(b: B): number { return this.stances.get(b)?.drop ?? 0; }

  dispose(): void {
    for (const h of this.stances.values()) h.dispose();
    this.stances.clear(); this.looks.clear(); this.def.clear(); this.off.clear(); this.key = '';
  }
}
