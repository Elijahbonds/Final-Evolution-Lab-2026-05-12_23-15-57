// PreSnap — Mode 4 Phase 2: the pre-snap phase as a first-class game state.
// This is the mechanic we're explicitly trying to beat Madden on: the read
// must be GENUINELY INFORMATIVE, not decorative.
//
//   Formation — offense + defense line up as data (positions/labels), the
//     mode renders them; both sides are inspectable before the snap.
//   PlayCall — a small playbook of distinct concepts (run lanes, pass
//     concepts); picking one sets the offensive assignments.
//   DefensiveRead — the read tool: box count (run fit), coverage shell
//     (man vs zone tells from alignment + depth), and a blitz indicator
//     (a creeped-up defender is a REAL tell that maps to their AI role).
//     A player who reads correctly gets a mechanically exploitable answer
//     (the right play vs the shell pays more).
//   Snap — countdown/trigger with a clean flow.

import { Vector3 } from '@babylonjs/core';

// ── Formations ─────────────────────────────────────────────────────────────
export interface FormationSpot { id: string; label: string; pos: Vector3; role: string }

export interface Formation {
  id: string;
  label: string;
  spots: FormationSpot[];
}

export const OFFENSE_FORMATIONS: Formation[] = [
  {
    id: 'spread', label: 'SPREAD', spots: [
      { id: 'qb', label: 'QB', pos: new Vector3(0, 0, -3), role: 'quarterback' },
      { id: 'rb', label: 'RB', pos: new Vector3(-1.5, 0, -3.5), role: 'back' },
      { id: 'wr1', label: 'WR', pos: new Vector3(-8, 0, 0), role: 'receiver' },
      { id: 'wr2', label: 'WR', pos: new Vector3(8, 0, 0), role: 'receiver' },
      { id: 'ol', label: 'OL ×3', pos: new Vector3(0, 0, -0.5), role: 'line' },
    ],
  },
  {
    id: 'strong', label: 'STRONG', spots: [
      { id: 'qb', label: 'QB', pos: new Vector3(0, 0, -1.5), role: 'quarterback' },
      { id: 'rb', label: 'RB', pos: new Vector3(1.2, 0, -4), role: 'back' },
      { id: 'wr1', label: 'WR', pos: new Vector3(-8, 0, 0), role: 'receiver' },
      { id: 'te', label: 'TE', pos: new Vector3(2.5, 0, 0), role: 'blocker' },
      { id: 'ol', label: 'OL ×3', pos: new Vector3(0, 0, -0.5), role: 'line' },
    ],
  },
];

export const DEFENSE_FORMATIONS: Formation[] = [
  {
    id: 'cover2', label: 'COVER 2', spots: [
      { id: 'dl', label: 'DL ×2', pos: new Vector3(0, 0, 0.8), role: 'rush' },
      { id: 'lb1', label: 'LB', pos: new Vector3(-3, 0, 4), role: 'hook' },
      { id: 'lb2', label: 'LB', pos: new Vector3(3, 0, 4), role: 'hook' },
      { id: 's1', label: 'S', pos: new Vector3(-6, 0, 10), role: 'deep-half' },
      { id: 's2', label: 'S', pos: new Vector3(6, 0, 10), role: 'deep-half' },
      { id: 'cb1', label: 'CB', pos: new Vector3(-8.5, 0, 2), role: 'flat' },
      { id: 'cb2', label: 'CB', pos: new Vector3(8.5, 0, 2), role: 'flat' },
    ],
  },
  {
    id: 'press-man', label: 'PRESS MAN', spots: [
      { id: 'dl', label: 'DL ×2', pos: new Vector3(0, 0, 0.8), role: 'rush' },
      { id: 'lb1', label: 'LB', pos: new Vector3(-2, 0, 2.5), role: 'blitz' },
      { id: 'lb2', label: 'LB', pos: new Vector3(2, 0, 2.5), role: 'blitz' },
      { id: 's1', label: 'S', pos: new Vector3(0, 0, 9), role: 'centerfield' },
      { id: 'cb1', label: 'CB', pos: new Vector3(-8.2, 0, 0.5), role: 'press' },
      { id: 'cb2', label: 'CB', pos: new Vector3(8.2, 0, 0.5), role: 'press' },
    ],
  },
];

// ── Playbook ───────────────────────────────────────────────────────────────
export interface PlayCall {
  id: string;
  label: string;
  concept: 'run' | 'pass' | 'playaction';
  /** what this play beats (the read payoff) */
  beatsCoverage: 'zone' | 'man' | 'blitz' | 'none';
  primaryLane?: 'left' | 'middle' | 'right';
}

export const PLAYBOOK: PlayCall[] = [
  { id: 'dive', label: 'DIVE', concept: 'run', beatsCoverage: 'blitz', primaryLane: 'middle' },
  { id: 'toss', label: 'TOSS', concept: 'run', beatsCoverage: 'zone', primaryLane: 'left' },
  { id: 'slants', label: 'SLANTS', concept: 'pass', beatsCoverage: 'zone' },
  { id: 'streaks', label: 'STREAKS', concept: 'pass', beatsCoverage: 'man' },
  { id: 'pa_cross', label: 'PA CROSS', concept: 'playaction', beatsCoverage: 'blitz' },
];

// ── The read tool (the beat-Madden mechanic) ───────────────────────────────
export interface DefensiveRead {
  boxCount: number;               // defenders within 3m of the line
  shell: 'zone' | 'man';
  blitzComing: boolean;
  /** what the read says to call (the exploitable answer) */
  suggestion: string;
  confidence01: number;           // how clean the read is
}

/** Read a defensive formation honestly: alignment facts in, exploitable
 *  truths out. Box count drives run fits; shell depth drives pass choice. */
export function readDefense(def: Formation): DefensiveRead {
  const box = def.spots.filter((s) => Math.abs(s.pos.z) < 3 && s.role !== 'deep-half' && s.role !== 'centerfield').length;
  const isMan = def.id === 'press-man';
  const blitz = def.spots.some((s) => s.role === 'blitz' && Math.abs(s.pos.z) < 3);
  const shell = isMan ? 'man' : 'zone';
  let suggestion = 'Balanced look';
  if (blitz) suggestion = 'BLITZ — Dive/PA beats it';
  else if (box >= 6) suggestion = 'Heavy box — pass wins';
  else if (box <= 4) suggestion = 'Light box — run wins';
  else if (shell === 'man') suggestion = 'Man shell — Streaks beat press';
  else suggestion = 'Zone shell — Slants find the windows';
  return {
    boxCount: box, shell, blitzComing: blitz, suggestion,
    confidence01: blitz ? 0.95 : isMan ? 0.85 : 0.75,
  };
}

/** Does the called play exploit the defense? The read pays off here. */
export function playBeatsShell(play: PlayCall, read: DefensiveRead): boolean {
  if (read.blitzComing) return play.beatsCoverage === 'blitz';
  return play.beatsCoverage === read.shell;
}

// ── Pre-snap state machine ─────────────────────────────────────────────────
export type PreSnapPhase = 'formation' | 'playcall' | 'read' | 'snapReady' | 'snapped';

// ── Audibles & motion ──────────────────────────────────────────────────────
/** Audible: swap the called play post-read (low-friction — one tap cycles
 *  to the concept that beats the read). Returns the new playcall. */
export function audibleToCounter(read: DefensiveRead): PlayCall {
  const target = read.blitzComing ? 'blitz' : read.shell;
  const idx = PLAYBOOK.findIndex((p) => p.beatsCoverage === target);
  return PLAYBOOK[idx >= 0 ? idx : 0];
}

/** Pre-snap motion: move an offensive spot across the formation; returns
 *  how the DEFENSE responds — a man defender follows (MAN TELL), a zone
 *  defender bumps over one zone (ZONE TELL). This is the motion read:
 *  the defense's response reveals the coverage before the snap. */
export interface MotionResult {
  movedTo: Vector3;
  defenseResponse: 'followed' | 'bumped' | 'held';
  revealedShell: 'man' | 'zone' | null;
}

export function motionPlayer(def: Formation, fromX: number, toX: number): MotionResult {
  const isMan = def.id === 'press-man';
  // the corner nearest the moving receiver reacts
  const cb = def.spots.find((s) => s.role === 'press' || s.role === 'flat');
  if (!cb) return { movedTo: new Vector3(toX, 0, 0), defenseResponse: 'held', revealedShell: null };
  if (isMan) {
    const followed = Math.sign(toX) !== Math.sign(cb.pos.x);
    cb.pos.x = toX + 0.2 * Math.sign(toX);               // he follows across
    return { movedTo: new Vector3(toX, 0, 0), defenseResponse: followed ? 'followed' : 'followed', revealedShell: 'man' };
  }
  // zone: the flat defender bumps a step, stays on his side
  cb.pos.x += Math.sign(toX - cb.pos.x) * 1.2;
  return { movedTo: new Vector3(toX, 0, 0), defenseResponse: 'bumped', revealedShell: 'zone' };
}

export class PreSnapFlow {
  phase: PreSnapPhase = 'formation';
  playcallIdx = 0;
  offense: Formation;
  defense: Formation;
  read: DefensiveRead | null = null;

  constructor(offIdx = 0, defIdx = 0) {
    this.offense = OFFENSE_FORMATIONS[offIdx];
    this.defense = DEFENSE_FORMATIONS[defIdx];
  }

  get playcall(): PlayCall { return PLAYBOOK[this.playcallIdx]; }

  /** Audible to the concept that beats the current read (if read taken). */
  audible(): boolean {
    if (this.phase !== 'read' && this.phase !== 'snapReady') return false;
    if (!this.read) return false;
    const counter = audibleToCounter(this.read);
    this.playcallIdx = PLAYBOOK.findIndex((p) => p.id === counter.id);
    return true;
  }

  /** Motion a receiver across the formation; returns the defense tell. */
  motion(spotId: string, toX: number): MotionResult | null {
    if (this.phase === 'snapped') return null;
    const spot = this.offense.spots.find((s) => s.id === spotId);
    if (!spot) return null;
    const res = motionPlayer(this.defense, spot.pos.x, toX);
    spot.pos = res.movedTo;
    // motion REVEALS: refresh the read with the new alignment
    if (this.phase === 'read' || this.phase === 'snapReady') {
      this.read = readDefense(this.defense);
      if (res.revealedShell) this.read.shell = res.revealedShell;
      this.read.confidence01 = Math.min(1, this.read.confidence01 + 0.2);
    }
    return res;
  }

  advance(): void {
    if (this.phase === 'formation') this.phase = 'playcall';
    else if (this.phase === 'playcall') this.phase = 'read';
    else if (this.phase === 'read') { this.read = readDefense(this.defense); this.phase = 'snapReady'; }
  }

  cyclePlaycall(dir: 1 | -1): void {
    this.playcallIdx = (this.playcallIdx + dir + PLAYBOOK.length) % PLAYBOOK.length;
  }

  snap(): boolean {
    if (this.phase !== 'snapReady') return false;
    this.phase = 'snapped';
    return true;
  }
}
