// couchTurns — friends in one room each take their own run of the 3-Point Shootout (lane/hoops-couch, 2026-10-24).
//
// Owner, 2026-10-24: "When I played it it didn't allow other people to shoot. They wanted to try and couldn't." Then: "I was
// playing the 3PT shoot out … their jumper in front of the camera didn't trigger a shot, and only mine did."
//
// What was measured (scratchpad round7/hoops-couch, the probes named in the lane report), not assumed:
//   • THE READER IS NOT IT. A second body (0.72×–1.1× the size, 0.5 m aside, 1.2 m further, 0.5 m nearer) read through the
//     FIRST body's calibration tells the same take-off / apex / release / landing as through its own: the floor re-anchors on
//     every planted foot, the metre ruler follows the torso, and the world landmarks are metric.
//   • THE HAND-OVER PAUSES THE GAME. A shooter who walks out for LOST_PAUSE_MS (1.2 s) pauses a body-driven run, and the next
//     person's whole jump shot reaches nobody until somebody holds both hands up (BodySession: "a passer-by does not restart
//     a game"). Under 1.2 s the next jump fires — into the first shooter's score, under their name.
//   • THE MODEL FOLLOWS ONE PERSON. PoseService asks MediaPipe for numPoses: 1 in VIDEO mode, which tracks the body it found
//     and re-detects only when it loses it: with two people in the picture, the one it locked onto is the only shooter.
//   • ONE SHOOTER IN THE MODE. ThreePointMode seats one human ('YOU'); every local pad feeds that one hero (the merged stream),
//     and the host's phone turn order banked a turn and then never started the next one (it waited for a remount nothing did).
//
// So a couch shootout is TURNS, the way the real contest and the party room (lib/party/turns.ts) run it: each shooter takes a
// whole run of their own, their score banked under their name, and between runs the next one is called up — and, when the
// camera is the controller, the space check is taken again for the new body (bodyPlay.handOver(): the safety note and the
// reach for THEIR height, then a still stand), which is also what makes the tracker let go of the last person. Only the
// active shooter's own pad or phone drives; the keyboard, the touch deck and the camera are the room's, and drive whoever is up.
//
// FAIRNESS (owner rule: couch play is never ranked, staked or paid): a turns session posts nothing (postsSession), and is not
// offered at all on a ranked, staked, challenge, Story, Carnival, online or party-room run (couchTurnsBlocked) — the same
// session kinds the feel panel refuses (lib/feel-panel/sessionGate.ts). Solo (one shooter) is the run it always was.
//
// Pure: no DOM, no React, no Babylon.
import { FEEL_BLOCK_PARAMS, type FeelBlock } from '@/lib/feel-panel/sessionGate';
import { SEAT_COLORS, seatTable, type PadIn, type PhoneIn } from '@/lib/party/seats';
import { currentTurn, startTurns, turnStandings, turnsDone, type Standing, type TurnState } from '@/lib/party/turns';

/** Shooters a couch shootout seats (the registry's threepoint maxPlayers). */
export const MAX_SHOOTERS = 4;

/** What a shooter plays with: their own pad, their own phone, or the room's (the camera, the keyboard, a passed pad). */
export type ShooterKind = 'pad' | 'phone' | 'room';

export interface Shooter {
  /** 0-based turn order; P1 is 0. */
  seat: number;
  label: string;
  /** A phone's own name; '' for a pad or the room's seat (the label is the name). */
  name: string;
  color: string;
  kind: ShooterKind;
  /** The InputBus slot of a pad shooter; null otherwise. */
  padSlot: number | null;
  /** The HostSession peer of a phone shooter; null otherwise. */
  peerId: string | null;
}

/** A couch shootout in progress: who shoots, in order, and the party room's turn state over them. */
export interface CouchTurns { shooters: Shooter[]; turns: TurnState }

/** "P2 JORDAN", or "P2" for a shooter with no name of their own. */
export function shooterName(s: Shooter): string {
  return s.name ? `${s.label} ${s.name.toUpperCase()}` : s.label;
}

/** How many people have joined on a device of their own: the local pads plus the phones connected with a seat. */
export function joinedCount(pads: readonly PadIn[], phones: readonly PhoneIn[]): number {
  return pads.length + phones.filter((p) => p.connected && p.slot !== null).length;
}

/** The shooter count after a join: a new pad or phone adds its shooter; a leave never takes one away (the picker does). */
export function wantAfterJoin(want: number, joinedBefore: number, joinedNow: number): number {
  const w = joinedNow > joinedBefore ? Math.max(want, joinedNow) : want;
  return Math.max(1, Math.min(MAX_SHOOTERS, w));
}

/**
 * The running order for `want` shooters: the party room's seat rule (pads first in their InputBus slot order, then phones in
 * the order they joined — lib/party/seats.ts), then the room's seats (the camera, the keyboard) up to `want`.
 */
export function couchLineup(want: number, pads: readonly PadIn[], phones: readonly PhoneIn[]): Shooter[] {
  const n = Math.max(1, Math.min(MAX_SHOOTERS, Math.floor(want) || 1));
  const table = seatTable(pads, phones.filter((p) => p.connected), MAX_SHOOTERS);
  const out: Shooter[] = [];
  for (const s of table.seats) {
    if (out.length >= n) break;
    const i = out.length;
    const pad = s.kind === 'pad' ? Number(s.key.slice(4)) : null;
    out.push({
      seat: i, label: `P${i + 1}`, name: s.kind === 'phone' ? s.name : '', color: SEAT_COLORS[i], kind: s.kind,
      padSlot: pad, peerId: s.kind === 'phone' ? s.key.slice(6) : null,
    });
  }
  while (out.length < n) {
    const i = out.length;
    out.push({ seat: i, label: `P${i + 1}`, name: '', color: SEAT_COLORS[i], kind: 'room', padSlot: null, peerId: null });
  }
  return out;
}

/** Start a shootout over this order (one shooter is not a shootout: null, the solo run). */
export function startCouch(shooters: readonly Shooter[]): CouchTurns | null {
  if (shooters.length < 2) return null;
  return { shooters: [...shooters], turns: startTurns(shooters) };
}

/** Whose run it is now (null once everyone has shot). */
export function activeShooter(c: CouchTurns): Shooter | null {
  const p = currentTurn(c.turns);
  return p ? c.shooters[c.turns.at] ?? null : null;
}

/**
 * Does this local pad drive the run now (InputBus.padFilter)? Solo: every pad, as always. In a shootout a pad that holds a
 * seat drives only its own run; a pad that holds none is the room's (passed round), so it drives a room seat's run only.
 */
export function padDrives(shooters: readonly Shooter[], at: number, slot: number): boolean {
  if (shooters.length < 2) return true;
  const active = shooters[at];
  if (!active) return false;
  if (active.kind === 'pad') return slot === active.padSlot;
  return active.kind === 'room' && !shooters.some((s) => s.kind === 'pad' && s.padSlot === slot);
}

/** Does this phone drive the run now? Solo: every phone, as always. In a shootout, only the phone whose run it is. */
export function phoneDrives(shooters: readonly Shooter[], at: number, peerId: string | undefined): boolean {
  if (shooters.length < 2) return true;
  const active = shooters[at];
  return !!active && active.kind === 'phone' && !!peerId && active.peerId === peerId;
}

/**
 * Whether a finished run goes to the session pipeline (GameShell's onEnd → POST /api/sessions, which pays XP, coins and PRQ
 * and feeds the ladders). One shooter: yes, the solo run it always was. A couch shootout: never — it is several people's
 * play under one account, so it is unranked, unstaked and unpaid, like the party room and the couch room (neither posts).
 */
export function postsSession(shooters: number): boolean {
  return shooters <= 1;
}

/** Why a couch shootout is not offered on this page, or null when it is. The feel panel's session kinds, less the agent's. */
export type CouchBlock = Exclude<FeelBlock, 'AGENT' | 'NOT_PLAYTEST' | 'UNKNOWN' | 'NOT_A_GAME'>;
export function couchTurnsBlocked(pathname: string, search: string): CouchBlock | null {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { return 'RANKED'; }
  for (const [key, block] of FEEL_BLOCK_PARAMS) if (key !== 'agent' && q.has(key)) return block as CouchBlock;
  const path = (pathname || '').replace(/\/+$/, '');
  if (path === '/play/party' || path.startsWith('/play/party/')) return 'PARTY_ROOM';   // the party room runs its own turns
  return null;
}

/** The picker on the READY screen: offered before the first run, on a page that allows it, when more than one could shoot. */
export function pickerShown(o: { allowed: boolean; phase: string; started: boolean; camera: boolean; joined: number }): boolean {
  return o.allowed && !o.started && (o.phase === 'ready' || o.phase === 'loading') && (o.camera || o.joined >= 2);
}

/** The line over the run: "P2 JORDAN — YOUR RACK · 2 OF 3". */
export function turnLine(c: CouchTurns): string {
  const a = activeShooter(c);
  return a ? `${shooterName(a)} — YOUR RACK · ${c.turns.at + 1} OF ${c.shooters.length}` : '';
}

/** The hand-over card between two runs. */
export function handoffCopy(next: Shooter, prev: Shooter | null, camera: boolean): { title: string; sub: string } {
  const title = `${shooterName(next)} — YOUR RACK`;
  if (camera) {
    const out = prev ? `${prev.label}, step out of the picture. ` : '';
    return { title, sub: `${out}${next.label}, step in on your own and stand still.` };
  }
  if (next.kind === 'pad') return { title, sub: `${next.label}, your controller is live.` };
  if (next.kind === 'phone') return { title, sub: `${next.label}, your phone is live.` };
  return { title, sub: `Pass the controller to ${next.label}.` };
}

/** What a press from a pad that is not up is told. */
export function waitLine(shooters: readonly Shooter[], at: number): string {
  const a = shooters[at];
  return a && shooters.length > 1 ? `${shooterName(a)} IS UP — WAIT FOR YOUR TURN` : '';
}

/** The couch board, best first (ties share a place; a shooter still to go sits last with no score). */
export interface CouchRow extends Standing { display: string; up: boolean }
export function couchBoard(c: CouchTurns): CouchRow[] {
  const up = activeShooter(c);
  return turnStandings(c.turns).map((r) => {
    const s = c.shooters[r.seat];
    return { ...r, display: s ? shooterName(s) : r.label, up: !!up && up.seat === r.seat };
  });
}

/** The winner's line once everyone has shot ("P2 JORDAN WINS · 21", or a tie). */
export function finalLine(c: CouchTurns): string {
  if (!turnsDone(c.turns)) return '';
  const board = couchBoard(c);
  const top = board.filter((r) => r.place === 1 && r.score !== null);
  if (!top.length) return 'SHOOTOUT COMPLETE';
  if (top.length > 1) return `TIE AT ${top[0].score} · ${top.map((r) => r.display).join(' & ')}`;
  return `${top[0].display} WINS · ${top[0].score}`;
}
