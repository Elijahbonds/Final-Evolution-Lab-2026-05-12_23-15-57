// The dragon ride's state machine: Glide / Surf / Dunk Drop (DRAGON-RIDE-COMBO §0 verified base rules, §9 DR-1…DR-13, §10 picks).
// Pure and deterministic: a fixed step, no clock, no randomness — the same input log gives the same state hash on two peers (DR-12).
//
//   ground ─(L1 near a flight-capable partner, stamina > 5, Glide cd 0)→ mounting 0.4 s → GLIDE
//   GLIDE: no strike except the single dive attack (DR-2); stamina 0 → ground, Glide cd 3 s.
//   GLIDE/ground ─(hold L1+R1 0.5 s, Bond ≥ 50 story / match Bond 100 royale, partner ≤ 6 m, not in Final Form, Surf cd 0)→
//     channel (1.0 s story invulnerable / 0.8 s royale interruptible) → SURF (+15% strike).
//   SURF: entering Final Form ends it (X7-A). Surf cd 8 s story / 25 s royale starts when it ends.
//   SURF ─(L1+R1+RT, Form ≥ cost, not hoops / Dunk mode / judged contest)→ DUNK DROP: dive (hold-run; royale: interruptible, the
//     tell is visible) → jump tap = launch → air → A in the read = slam; no A = miss (never a slam). No jump tap by the dive's end =
//     pull-up, 0 damage, Form spent (P3). Final Form pressed mid-drop is ignored until it resolves (P4). No QTE prompts (DR-7).
// §1–7 were lost; values below cite §0/[SBR], the RE-SPEC (5:44 PM PT) or PM's 5:50 PM PT starting values, each TUNE.
export type RideMode = 'story' | 'royale';
export type RideVenue = 'open' | 'hoops' | 'dunkMode' | 'judgedContest';
export type RideState = 'ground' | 'mounting' | 'glide' | 'diveAttack' | 'surfChannel' | 'surf' | 'dropDive' | 'dropAir';

export const RIDE_MOUNT_SEC = 0.4;              // [SBR] L257-264
export const RIDE_MIN_STAMINA = 5;              // [SBR] stamina > 5
export const GLIDE_COOLDOWN_SEC = 3;            // [SBR] 3 s
export const RIDE_MOUNT_RANGE_M = 6;            // TUNE (PM 5:50 PM PT): [SBR] L257 says only "near"; 6 m = the Surf partner range, L259
export const EVOLVE_HOLD_SEC = 0.5;             // [SBR] L258
export const SURF_BOND_STORY = 50, SURF_BOND_ROYALE = 100;   // [SBR] L259
export const SURF_PARTNER_RANGE_M = 6;          // [SBR] L259
export const SURF_CHANNEL_SEC: Readonly<Record<RideMode, number>> = { story: 1.0, royale: 0.8 };   // [SBR] L260, [CFF] L172
export const SURF_COOLDOWN_SEC: Readonly<Record<RideMode, number>> = { story: 8, royale: 25 };     // [SBR] L263
export const SURF_STRIKE_MULT = 1.15;           // [SBR] L262: +15% strike
export const DUNK_DROP_FORM_COST = 100;         // TUNE, waiting on Elijah: open pick P2 (full Form 100 vs Charge 2 75)
export const DUNK_DROP_COOLDOWN_SEC: Readonly<Record<RideMode, number>> = { story: 8, royale: 25 };   // TUNE (PM 5:50 PM PT); ≥ the Surf cd (RE-SPEC rule)
export const DROP_DIVE_SEC = 0.833;             // TUNE (= the Dive clip)
export const DROP_AIR_SEC = 0.398 + 0.10;       // TUNE (PM 5:50 PM PT): the 0.398 s fall to the hang band (RE-SPEC) + the 0.10 s up-kick
export const DROP_SLAM_DAMAGE = 60;             // TUNE
export const DROP_SLAM_HITSTOP_MS = 110;        // TUNE (PM 5:50 PM PT), ≤ the 120 ms cap (core/gameFeel.ts:47)
export const DIVE_ATTACK_SEC = 0.5;             // TUNE
export const DIVE_ATTACK_DAMAGE = 20;           // TUNE
export const DIVE_ATTACK_HITSTOP_MS = 110;      // TUNE (PM 5:50 PM PT: hit-stop 110), ≤ the cap
export const HITSTOP_CAP_MS = 120;              // core/gameFeel.ts:47
export const RIDE_STEP_SEC = 1 / 60;            // the deterministic step

export interface RideInput {
  mount?: boolean;         // L1 near the partner (keyboard F, touch RIDE)
  evolve?: boolean;        // L1+R1 held (keyboard F+E, touch SURF held)
  ultimate?: boolean;      // L1+R1+RT (keyboard F+E+Shift, touch ULT)
  run?: boolean;           // RT held (keyboard Shift, touch RUN)
  jump?: boolean;          // tap (keyboard Space, touch JUMP)
  slam?: boolean;          // A (keyboard J, touch SLAM)
  strike?: boolean;        // X (keyboard K, touch HIT)
  dismount?: boolean;      // B (keyboard Q, touch OFF)
  finalForm?: boolean;     // L3+R3 ([CFF] L64)
  interrupt?: boolean;     // a hit landed on the rider this step
}
export interface RideEnv { partnerFlightCapable: boolean; partnerDistM: number; stamina: number; bond: number; form: number; finalFormActive: boolean }

export type RideEvent =
  | { kind: 'enter'; state: RideState } | { kind: 'strike'; mult: number; what: 'diveAttack' | 'surf' }
  | { kind: 'dropResult'; result: 'slam' | 'miss' | 'pullUp' | 'interrupted'; damage: number }
  | { kind: 'hitStop'; ms: number } | { kind: 'formSpent'; amount: number } | { kind: 'refused'; why: string };

export interface RideSnapshot {
  state: RideState; t: number; hold: number; cd: { glide: number; surf: number; drop: number };
  dropJumped: boolean; dropSlammed: boolean; diveUsed: boolean; formSpent: number; tellVisible: boolean; invulnerable: boolean;
}

export class DragonRideMachine {
  private s: RideSnapshot = { state: 'ground', t: 0, hold: 0, cd: { glide: 0, surf: 0, drop: 0 }, dropJumped: false, dropSlammed: false, diveUsed: false, formSpent: 0, tellVisible: false, invulnerable: false };
  private surfFrom: RideState = 'ground';
  readonly events: RideEvent[] = [];
  constructor(readonly mode: RideMode, readonly venue: RideVenue = 'open') {}

  get state(): RideState { return this.s.state; }
  get snapshot(): Readonly<RideSnapshot> { return this.s; }
  /** The strike multiplier in force (+15% only in Surf). */
  strikeMult(): number { return this.s.state === 'surf' ? SURF_STRIKE_MULT : 1; }
  /** What strikes the current state allows. */
  strikesAllowed(): readonly ('diveAttack' | 'any')[] {
    const st = this.s.state;
    if (st === 'glide') return this.s.diveUsed ? [] : ['diveAttack'];
    if (st === 'mounting' || st === 'diveAttack' || st === 'surfChannel' || st === 'dropDive' || st === 'dropAir') return [];
    return ['any'];
  }
  /** HUD prompts for the state (the dunk's own cues; never a QTE). */
  prompts(): readonly string[] {
    switch (this.s.state) {
      case 'dropDive': return ['HOLD RUN', 'JUMP'];
      case 'dropAir': return ['SLAM'];
      case 'surf': return ['DUNK DROP'];
      case 'glide': return ['DIVE'];
      default: return [];
    }
  }
  canDunkDrop(env: RideEnv): boolean {
    return this.s.state === 'surf' && this.venue === 'open' && !env.finalFormActive && env.form >= DUNK_DROP_FORM_COST && this.s.cd.drop <= 0;
  }

  private go(state: RideState): void { this.s.state = state; this.s.t = 0; this.s.hold = 0; this.events.push({ kind: 'enter', state }); }
  private hit(ms: number): void { this.events.push({ kind: 'hitStop', ms: Math.min(ms, HITSTOP_CAP_MS) }); }
  private endSurf(): void { this.s.cd.surf = SURF_COOLDOWN_SEC[this.mode]; this.s.invulnerable = false; this.go('ground'); }
  private surfGate(env: RideEnv): string | null {
    if (env.finalFormActive) return 'finalForm';
    if (env.bond < (this.mode === 'story' ? SURF_BOND_STORY : SURF_BOND_ROYALE)) return 'bond';
    if (!(env.partnerDistM <= SURF_PARTNER_RANGE_M)) return 'partnerFar';
    if (this.s.cd.surf > 0) return 'cooldown';
    return null;
  }

  /** One deterministic step. */
  step(inp: RideInput, env: RideEnv, dt = RIDE_STEP_SEC): void {
    const s = this.s;
    s.cd.glide = Math.max(0, s.cd.glide - dt); s.cd.surf = Math.max(0, s.cd.surf - dt); s.cd.drop = Math.max(0, s.cd.drop - dt);
    s.t += dt;
    switch (s.state) {
      case 'ground': {
        if (inp.evolve) { this.evolveHold(inp, env, dt); break; }
        s.hold = 0;
        if (inp.mount) {
          if (!env.partnerFlightCapable) { this.events.push({ kind: 'refused', why: 'partnerCantFly' }); break; }
          if (!(env.stamina > RIDE_MIN_STAMINA)) { this.events.push({ kind: 'refused', why: 'stamina' }); break; }
          if (!(env.partnerDistM <= RIDE_MOUNT_RANGE_M)) { this.events.push({ kind: 'refused', why: 'partnerFar' }); break; }
          if (s.cd.glide > 0) { this.events.push({ kind: 'refused', why: 'cooldown' }); break; }
          this.go('mounting');
        }
        break;
      }
      case 'mounting': if (s.t >= RIDE_MOUNT_SEC - 1e-9) { s.diveUsed = false; this.go('glide'); } break;
      case 'glide': {
        if (env.stamina <= 0 || inp.dismount) { s.cd.glide = GLIDE_COOLDOWN_SEC; this.go('ground'); break; }
        if (inp.evolve) { this.evolveHold(inp, env, dt); break; }
        s.hold = 0;
        if (inp.strike && !s.diveUsed) { s.diveUsed = true; this.go('diveAttack'); }
        break;
      }
      case 'diveAttack': {
        if (s.t >= DIVE_ATTACK_SEC - 1e-9) {
          this.events.push({ kind: 'strike', mult: 1, what: 'diveAttack' }); this.hit(DIVE_ATTACK_HITSTOP_MS);
          this.go('glide'); s.diveUsed = true;
        }
        break;
      }
      case 'surfChannel': {
        if (inp.finalForm || env.finalFormActive) { s.invulnerable = false; this.go(this.surfFrom); break; }
        if (this.mode === 'royale' && inp.interrupt) { s.invulnerable = false; this.events.push({ kind: 'refused', why: 'interrupted' }); this.go(this.surfFrom); break; }
        if (s.t >= SURF_CHANNEL_SEC[this.mode] - 1e-9) { s.invulnerable = false; this.go('surf'); }
        break;
      }
      case 'surf': {
        if (inp.finalForm || env.finalFormActive) { this.endSurf(); break; }
        if (inp.dismount) { this.endSurf(); break; }
        if (inp.ultimate) {
          if (this.canDunkDrop(env)) {
            s.formSpent += DUNK_DROP_FORM_COST; this.events.push({ kind: 'formSpent', amount: DUNK_DROP_FORM_COST });
            s.dropJumped = false; s.dropSlammed = false; s.tellVisible = this.mode === 'royale'; this.go('dropDive');
          } else this.events.push({ kind: 'refused', why: this.venue !== 'open' ? 'venue' : env.finalFormActive ? 'finalForm' : env.form < DUNK_DROP_FORM_COST ? 'form' : 'cooldown' });
          break;
        }
        if (inp.strike) this.events.push({ kind: 'strike', mult: SURF_STRIKE_MULT, what: 'surf' });
        break;
      }
      case 'dropDive': {
        if (this.mode === 'royale' && inp.interrupt) { this.resolveDrop('interrupted'); break; }
        if (inp.jump && inp.run) { s.dropJumped = true; s.tellVisible = false; this.go('dropAir'); break; }
        if (s.t >= DROP_DIVE_SEC - 1e-9) this.resolveDrop('pullUp');
        break;
      }
      case 'dropAir': {
        if (inp.slam && !s.dropSlammed) { s.dropSlammed = true; this.resolveDrop('slam'); break; }
        if (s.t >= DROP_AIR_SEC - 1e-9) this.resolveDrop('miss');
        break;
      }
    }
  }

  private evolveHold(inp: RideInput, env: RideEnv, dt: number): void {
    const s = this.s;
    s.hold += dt;
    if (s.hold < EVOLVE_HOLD_SEC - 1e-9) return;
    const why = this.surfGate(env);
    if (why) { this.events.push({ kind: 'refused', why }); s.hold = 0; return; }
    this.surfFrom = s.state === 'glide' ? 'glide' : 'ground';
    s.invulnerable = this.mode === 'story';
    this.go('surfChannel');
    void inp;
  }

  private resolveDrop(result: 'slam' | 'miss' | 'pullUp' | 'interrupted'): void {
    const damage = result === 'slam' ? DROP_SLAM_DAMAGE : 0;
    if (result === 'slam') this.hit(DROP_SLAM_HITSTOP_MS);
    this.events.push({ kind: 'dropResult', result, damage });
    this.s.cd.drop = DUNK_DROP_COOLDOWN_SEC[this.mode]; this.s.tellVisible = false;
    this.endSurf();
  }

  /** FNV-1a over the canonical snapshot + the event log: the cross-peer check (DR-12). */
  stateHash(): string {
    const s = this.s, r = (v: number) => Math.round(v * 1e6);
    const txt = [s.state, r(s.t), r(s.hold), r(s.cd.glide), r(s.cd.surf), r(s.cd.drop), +s.dropJumped, +s.dropSlammed, +s.diveUsed, s.formSpent, +s.tellVisible, +s.invulnerable, JSON.stringify(this.events)].join('|');
    let h = 0x811c9dc5;
    for (let i = 0; i < txt.length; i++) { h ^= txt.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
}

// ── bindings (DR-13; P5 recommendation: L1+R1+RT; keyboard F+E+Shift and a touch ULT button) ─────────────────────────────────
export type RideAction = keyof RideInput;
export type RideDevice = 'pad' | 'keyboard' | 'touch';
export const RIDE_BINDINGS: Readonly<Record<RideDevice, Readonly<Record<Exclude<RideAction, 'interrupt'>, readonly string[]>>>> = {
  pad: { mount: ['L1'], evolve: ['L1', 'R1'], ultimate: ['L1', 'R1', 'RT'], run: ['RT'], jump: ['A'], slam: ['A'], strike: ['X'], dismount: ['B'], finalForm: ['L3', 'R3'] },
  keyboard: { mount: ['KeyF'], evolve: ['KeyF', 'KeyE'], ultimate: ['KeyF', 'KeyE', 'ShiftLeft'], run: ['ShiftLeft'], jump: ['Space'], slam: ['KeyJ'], strike: ['KeyK'], dismount: ['KeyQ'], finalForm: ['KeyG'] },
  touch: { mount: ['RIDE'], evolve: ['SURF'], ultimate: ['ULT'], run: ['RUN'], jump: ['JUMP'], slam: ['SLAM'], strike: ['HIT'], dismount: ['OFF'], finalForm: ['FORM'] },
};
/** Resolve the held keys/buttons on one device into a RideInput (a chord needs all of its keys). */
export function inputFrom(device: RideDevice, held: ReadonlySet<string>): RideInput {
  const b = RIDE_BINDINGS[device], out: RideInput = {};
  for (const k of Object.keys(b) as (keyof typeof b)[]) out[k] = b[k].every((key) => held.has(key));
  // a chord swallows its sub-chords: L1+R1+RT is not also a mount / evolve; L1+R1 is not also a mount
  if (out.ultimate) { out.evolve = false; out.mount = false; }
  if (out.evolve) out.mount = false;
  return out;
}

/** Held actions stay held; every other action is a PRESS (its first step only) — so the pad's A that jumped is not also the slam. */
const HELD_ACTIONS: ReadonlySet<RideAction> = new Set<RideAction>(['run', 'evolve']);
export function pressEdges(prev: RideInput, cur: RideInput): RideInput {
  const out: RideInput = {};
  for (const k of Object.keys(cur) as RideAction[]) out[k] = HELD_ACTIONS.has(k) ? !!cur[k] : !!cur[k] && !prev[k];
  return out;
}
