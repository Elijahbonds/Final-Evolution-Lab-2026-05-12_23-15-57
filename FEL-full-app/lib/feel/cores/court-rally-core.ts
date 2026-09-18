/**
 * lib/feel/cores/court-rally-core.ts
 * ==================================
 * M9 Step 12 — Court-rally core (5th archetype family).
 *
 * The Court-rally family (Clay Rally, Penalty Shootout, Links Golf, Sand
 * Volleyball, Home Run Derby) is NOT free-3D locomotion like the Court core —
 * it is a sequence of TIMED CONTACTS: the play runs up to a contact moment, a
 * timing window (QTE) opens, and a press near the ideal instant scores by
 * accuracy. Some modes add a CHARGE/RELEASE contract (hold to build power,
 * release before contact) for shot power. This core generalises all of that.
 *
 * It is synthesised from the proven shared feel systems' behaviour (the
 * InputBuffer timing-window concept, the ArcDrive charge/handback idea) rather
 * than ported from a single reference mode, because the engineering line had
 * no single "rally" file — each rally sport was bespoke. Every mode is a thin
 * skin (constants + sensory + charge on/off). Adding a mode never edits this
 * core.
 *
 * Render-free and deterministic: advance with `tick(dtMs)`, hold power with
 * `charge(down)`, and hit the contact with `contact()`. All tunables live in
 * the injected skin/constants, every value // TUNE(elijah).
 */

import { SensoryBus } from '../index';
import type { SensoryEvent } from '../index';

export type RallyPhase = 'Ready' | 'Windup' | 'Window' | 'Result' | 'Done';

export type ContactQuality = 'perfect' | 'good' | 'early' | 'late' | 'miss';

export interface RallyTuning {
  /** Number of contacts (shots / swings / rallies) in a round. */
  contactsPerRound: number;
  /** Time from Ready to the contact window opening (ms). */
  windupMs: number;
  /** Half-width of the timing window around the ideal instant (ms). */
  windowMs: number;
  /** |error| <= perfectMs scores perfect. */
  perfectMs: number;
  /** |error| <= goodMs scores good. */
  goodMs: number;
  /** Brief hold on the Result phase before the next contact (ms). */
  resultMs: number;
  /** Whether this mode uses a charge/release power contract. */
  useCharge: boolean;
  /** Power gained per second of holding charge (0..1/s). */
  chargeRatePerSec: number;
  /** Floor on the power factor when useCharge (so 0 charge still does something). */
  minPower: number;
  /** Base points for a good contact. */
  basePoints: number;
  /** Extra fraction added for a perfect contact (e.g. 0.5 = +50%). */
  perfectBonus: number;
  /** Multiplier added to the combo per consecutive success. */
  comboStep: number;
  /** Combo multiplier cap. */
  maxCombo: number;
  /** Successes (perfect|good) needed to win the round. */
  winContacts: number;
}

export interface RallySensory {
  windowOpen?: SensoryEvent;
  perfect?: SensoryEvent;
  good?: SensoryEvent;
  weak?: SensoryEvent; // early / late
  miss?: SensoryEvent;
  win?: SensoryEvent;
}

export interface RallySkin {
  tuning: RallyTuning;
  sensory?: RallySensory;
  onSensory?: (e: SensoryEvent) => void;
  onPhase?: (phase: RallyPhase, prev: RallyPhase) => void;
  onContact?: (quality: ContactQuality, earned: number, index: number) => void;
  onDone?: (won: boolean, score: number, hits: number) => void;
}

export interface RallyContactResult {
  quality: ContactQuality;
  earned: number;
  errorMs: number;
  power: number;
}

export interface RallyState {
  phase: RallyPhase;
  contactIndex: number; // 0-based index of the current/last contact
  contactsDone: number;
  score: number;
  hits: number; // perfect|good count
  combo: number; // consecutive successes
  power: number; // current charge 0..1
  lastQuality: ContactQuality | '';
  won: boolean | null;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export class CourtRallyCore {
  private skin: RallySkin;
  private bus: SensoryBus | null;

  phase: RallyPhase = 'Ready';
  private _timeInPhaseMs = 0;
  private _contactIndex = -1;
  private _contactsDone = 0;
  private _score = 0;
  private _hits = 0;
  private _combo = 0;
  private _power = 0;
  private _charging = false;
  private _chargeReleasedBeforeContact = false;
  private _lastQuality: ContactQuality | '' = '';
  private _won: boolean | null = null;

  constructor(skin: RallySkin, bus?: SensoryBus) {
    this.skin = skin;
    this.bus = bus ?? null;
    // Prime the first contact's windup.
    this._beginContact();
  }

  private _emit(e?: SensoryEvent) {
    if (!e) return;
    this.bus?.emit(e);
    this.skin.onSensory?.(e);
  }

  private _setPhase(next: RallyPhase) {
    if (next === this.phase) return;
    const prev = this.phase;
    this.phase = next;
    this._timeInPhaseMs = 0;
    if (next === 'Window') this._emit(this.skin.sensory?.windowOpen);
    this.skin.onPhase?.(next, prev);
  }

  private _beginContact() {
    this._contactIndex += 1;
    this._power = 0;
    this._charging = false;
    this._chargeReleasedBeforeContact = false;
    this._setPhase('Ready');
    // Ready is a zero-length launchpad into Windup; step there immediately so
    // the very first tick starts the windup clock.
    this._setPhase('Windup');
  }

  /** Hold (true) or release (false) the charge control. */
  charge(down: boolean): void {
    if (!this.skin.tuning.useCharge) return;
    if (this.phase !== 'Windup' && this.phase !== 'Window') return;
    if (!down && this._charging) {
      // Released — this satisfies the charge/release contract.
      this._chargeReleasedBeforeContact = true;
    }
    this._charging = down;
  }

  private _powerFactor(): number {
    const k = this.skin.tuning;
    if (!k.useCharge) return 1;
    return k.minPower + (1 - k.minPower) * clamp(this._power, 0, 1);
  }

  private _comboMult(): number {
    const k = this.skin.tuning;
    return Math.min(k.maxCombo, 1 + this._combo * k.comboStep);
  }

  /**
   * Attempt the contact press. Only meaningful during the Window; a press
   * before the window is an early miss, and no press before the window closes
   * is a miss handled by tick().
   */
  contact(): RallyContactResult {
    const k = this.skin.tuning;
    if (this.phase === 'Done') {
      return { quality: 'miss', earned: 0, errorMs: Infinity, power: 0 };
    }
    if (this.phase === 'Windup') {
      // Pressed too early — jumped the gun. Counts as a miss for this contact.
      return this._resolve('miss', k.windowMs + 1);
    }
    if (this.phase !== 'Window') {
      return { quality: 'miss', earned: 0, errorMs: Infinity, power: 0 };
    }
    // Ideal instant is the CENTER of the window; error = distance from center.
    const center = k.windowMs;
    const errorMs = Math.abs(this._timeInPhaseMs - center);
    let quality: ContactQuality;
    if (errorMs <= k.perfectMs) quality = 'perfect';
    else if (errorMs <= k.goodMs) quality = 'good';
    else quality = this._timeInPhaseMs < center ? 'early' : 'late';
    return this._resolve(quality, errorMs);
  }

  private _resolve(quality: ContactQuality, errorMs: number): RallyContactResult {
    const k = this.skin.tuning;
    const power = this._power;
    const powerFactor = this._powerFactor();
    let earned = 0;
    if (quality === 'perfect') {
      earned = Math.round(k.basePoints * (1 + k.perfectBonus) * powerFactor * this._comboMult());
      this._hits += 1;
      this._combo += 1;
      this._emit(this.skin.sensory?.perfect);
    } else if (quality === 'good') {
      earned = Math.round(k.basePoints * powerFactor * this._comboMult());
      this._hits += 1;
      this._combo += 1;
      this._emit(this.skin.sensory?.good);
    } else if (quality === 'early' || quality === 'late') {
      earned = Math.round(k.basePoints * 0.5 * powerFactor);
      this._combo = 0;
      this._emit(this.skin.sensory?.weak);
    } else {
      earned = 0;
      this._combo = 0;
      this._emit(this.skin.sensory?.miss);
    }
    this._score += earned;
    this._lastQuality = quality;
    this.skin.onContact?.(quality, earned, this._contactIndex);
    this._enterResult();
    return { quality, earned, errorMs, power };
  }

  private _enterResult() {
    this._contactsDone += 1;
    this._setPhase('Result');
  }

  private _finish() {
    const k = this.skin.tuning;
    this._won = this._hits >= k.winContacts;
    this._setPhase('Done');
    if (this._won) this._emit(this.skin.sensory?.win);
    this.skin.onDone?.(this._won, this._score, this._hits);
  }

  /** Advance the fixed-step clock by dtMs. */
  tick(dtMs: number): void {
    const k = this.skin.tuning;
    this._timeInPhaseMs += dtMs;
    if (this.skin.tuning.useCharge && this._charging) {
      this._power = clamp(this._power + (k.chargeRatePerSec * dtMs) / 1000, 0, 1);
    }

    switch (this.phase) {
      case 'Windup':
        if (this._timeInPhaseMs >= k.windupMs) this._setPhase('Window');
        break;
      case 'Window':
        if (this._timeInPhaseMs >= k.windowMs * 2) {
          // Window closed with no press — a miss.
          this._resolve('miss', k.windowMs + 1);
        }
        break;
      case 'Result':
        if (this._timeInPhaseMs >= k.resultMs) {
          if (this._contactsDone >= k.contactsPerRound) this._finish();
          else this._beginContact();
        }
        break;
      default:
        break;
    }
  }

  get state(): RallyState {
    return {
      phase: this.phase,
      contactIndex: this._contactIndex,
      contactsDone: this._contactsDone,
      score: this._score,
      hits: this._hits,
      combo: this._combo,
      power: Math.round(this._power * 1000) / 1000,
      lastQuality: this._lastQuality,
      won: this._won,
    };
  }

  /** True once the charge was held then released this contact (contract met). */
  get chargeReleased(): boolean {
    return this._chargeReleasedBeforeContact;
  }
}
