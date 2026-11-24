// arenaContact — what a body-on-body hit in the Physics Arena means (owner 2026-11-24: "Hard collisions: YES. Bodies can be knocked
// over and fouls are called; both behind knobs, and the shipping bar applies"). Pure: the arena's modes hand it the contact Havok
// reported (arenaPhysics BodyContact: the closing speed along the normal, who was moving into whom) and what each body was doing,
// and it answers who goes down and which call the referee makes. The modes carry the call out.
//
// The calls are the shared referee's (core/Ref.ts: one handbook, so the arena cannot disagree with the shipped hoops), at the
// shared foul speed (core/ContactSystem FOUL_CLOSING_SPEED):
//   SHOOTING FOUL   a defender into a shooter (the gather, the air): in the air at the foul speed, on the floor at the reckless one.
//                   The attempt plays out (a make counts, a miss is the shooter's ball). The arena has no free throws.
//   LOOSE BALL      contact at the reckless speed while nobody has the ball: the fouled side's ball.
// Every call needs a foul-grade hit first (ContactSystem classifyContact: 4.2 m/s closing on a shooter in the air, 5.25 m/s on the
// floor), the gate the shipped hoops reads its calls behind; the charge and the blocking foul then also need the attacker's own speed.
//   CHARGE          the handler running at the foul speed into a SET defender (moving under 1 m/s). A moving defender is beaten.
//   BLOCKING FOUL   a defender running at the foul speed into the handler: the offence keeps it.
// Off the ball (no handler in the hit, the ball not loose) there is no call, as in the shipped hoops: the first 3v3 run with the
// fouls on called every defender who ran into a cutter (43 whistles in three minutes, the game stuck at 1–0).
// Teammates bump without a call. A knockdown is the physics' read, team or not: the speed of the body running in (along the
// normal) against arena.knockMps (a body in the air goes down at KNOCK_AIR_SHARE of it). The running body's own speed, not the
// closing speed of the two: two jogs meeting head-on close at 8.8 m/s, and on the closing speed the first 3v3 run put a body down
// every four seconds.

import { contactFoul, judge, type Call, type RuleId, type Side } from '../core/Ref';
import { classifyContact, FOUL_CLOSING_SPEED } from '../core/ContactSystem';
import { KNOCK_AIR_SHARE } from './arenaConfig';
import type { BodyContact } from './arenaPhysics';

/** What a body was doing when it was hit. */
export interface ContactBody {
  id: string;
  /** The referee's two sides (the 3v3's home team is 'me'). */
  side: Side;
  airborne: boolean;
  /** In a shot: the gather, the flight with the ball, or in the air after his own release. */
  shooting: boolean;
  /** Its flat speed (m/s) going into the step (a SET defender moves under 1). */
  speed: number;
  /** The ball is in its hands or its dribble. */
  hasBall: boolean;
}

export interface ContactRules {
  knockdowns: boolean;
  fouls: boolean;
  knockMps: number;
  /** The side on offence. */
  offense: Side;
  /** Nobody has the ball (a rebound, a scramble, a poked dribble). */
  looseBall: boolean;
}

export interface ContactCall {
  id: RuleId;
  by: string;
  on: string;
  /** The referee's answer: the banner and whose ball. */
  call: Call;
}

export interface ContactRuling {
  /** The body that goes down (the victim), or null. */
  down: string | null;
  foul: ContactCall | null;
}

/** The ruling on one contact. `att` / `vic` are the bodies Havok named the attacker and the victim (the one moving into the other). */
export function ruleContact(c: BodyContact, att: ContactBody, vic: ContactBody, r: ContactRules): ContactRuling {
  const knockAt = vic.airborne ? r.knockMps * KNOCK_AIR_SHARE : r.knockMps;
  const down = r.knockdowns && c.attackerSpeed >= knockAt ? vic.id : null;
  if (!r.fouls || att.side === vic.side) return { down, foul: null };
  const severity = classifyContact(c.closingSpeed, { shooterAirborne: vic.shooting && vic.airborne });
  // every call needs a foul-grade hit first (the shipped hoops' gate: OneVOneMode reads its calls inside severity === 'foul'), then
  // the attacker's own speed: a jog into a body is a push, not a whistle
  if (severity !== 'foul') return { down, foul: null };
  let id: RuleId | null = null;
  if (vic.shooting) id = 'shooting_foul';
  else if (r.looseBall) id = 'loose_ball_foul';
  else if (att.hasBall) id = contactFoul(c.attackerSpeed, vic.speed, FOUL_CLOSING_SPEED) === 'charge' ? 'charge' : null;   // a moving defender is beaten
  else if (vic.hasBall && c.attackerSpeed >= FOUL_CLOSING_SPEED) id = 'blocking_foul';
  if (!id) return { down, foul: null };
  const call = judge(id, { offense: r.offense, fouled: vic.side, shooter: vic.shooting ? vic.side : undefined });
  return { down, foul: { id, by: att.id, on: vic.id, call } };
}
