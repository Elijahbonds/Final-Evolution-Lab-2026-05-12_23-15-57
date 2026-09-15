// BoostKit — ONE boost for every speed mode (FINISH-RELEASE, 2026-09-14).
//
// Owner: "The game needs a boost mechanic for the board sports and the karting and the aero aces." Decisions, one round:
//   · FILL — skill (each mode reports its own: tricks and landings on boards, a clean drift in the kart, rings and
//            near-misses in the air) PLUS boost pads on the course.
//   · USE  — one button everywhere, HOLD to burn: RB/R1 on a pad, Shift on a keyboard, a BOOST pill on touch.
//   · FEEL — big: ~+40% top speed, an FOV punch, speed lines, a trail, a whoosh, rumble, a meter that flashes full.
//   · MODES — velocitykart, aeroaces, skateboard, snowboard_slalom, surf, bigair.
//
// Before this every one of them had a different, mostly hidden boost: snowboard spent its meter by TUCKING, surf by
// burying a carve, the kart dumped the whole meter on a tap, aero held A with no meter at all, and skate / big air had
// none. A player who learned one learned nothing about the next.
//
// This file is the pure half — the meter, the burn, the ramp the effects follow, the events a mode reacts to. It knows
// nothing about Babylon. BoostFx (premium/) turns `k` into a lens, a trail and speed lines; BoostPads (visual/) owns the
// pads' meshes and calls `pad()`.
//
// THE RULES THAT MAKE IT FEEL RIGHT:
//   1. A burn needs a little in the tank to START (MIN_START) but runs to empty once going — otherwise a nearly empty
//      meter flickers on and off every frame the button is held.
//   2. The speed does not snap: `k` ramps in over RAMP_IN and out over RAMP_OUT, exponentially in dt (the SpeedFov
//      lesson — a per-frame lerp converges twice as fast at 144 fps as at 60). A mode multiplies its top speed by
//      `speedMult()`, and effects scale by `k`.
//   3. FULL is an event, once, and it stays "full" until the meter drops below FULL_EXIT — a meter hovering at 0.999
//      must not re-flash every frame.

export const BOOST_TOP_SPEED = 1.4;     // owner: "big" — ~+40% top speed at full burn
export const BOOST_BURN_SEC = 3.0;      // a full meter lasts this long held down
export const BOOST_MIN_START = 0.08;    // what it takes to light a burn
export const BOOST_RAMP_IN = 0.12;      // seconds (time constant) for the kick to arrive
export const BOOST_RAMP_OUT = 0.35;     // …and to bleed off after release
export const BOOST_PAD_FILL = 0.35;     // a pad is a third of a meter
export const BOOST_FULL_EXIT = 0.9;

/** What a mode can pay into the meter for. The amounts live here so every mode pays the same for the same thing. */
export const BOOST_EARN = {
  trickSmall: 0.08,     // a grab, a single spin, an ollie off a lip
  trickBig: 0.18,       // a 540+, a flip combo, a big-air rotation
  landingClean: 0.1,    // stomped it
  drift: 0.45,          // per second of clean slide (kart)
  ring: 0.12,           // aero gate / ring
  nearMiss: 0.06,       // aero low pass / close shave, kart overtake
  grindPerSec: 0.12,    // skate rail, snow box
  pocketPerSec: 0.1,    // surf: riding the pocket
} as const;
export type BoostEarn = keyof typeof BOOST_EARN;

export interface BoostEvents { started: boolean; ended: boolean; full: boolean; empty: boolean }

export class BoostKit {
  meter = 0;
  burning = false;
  /** 0..1 — how much of the boost is being felt right now (speed, lens, trail all follow it). */
  k = 0;
  private fullLatched = false;
  private events: BoostEvents = { started: false, ended: false, full: false, empty: false };

  constructor(start = 0) { this.meter = clamp01(start); }

  /** Pay into the meter for a skill event. `scale` multiplies the table amount (a 900 pays more than a 360). */
  earn(what: BoostEarn, scale = 1): number { return this.add(BOOST_EARN[what] * Math.max(0, scale)); }
  /** A per-second earn (drift, grind, pocket) for this frame. */
  earnOver(what: BoostEarn, dt: number, scale = 1): number { return this.add(BOOST_EARN[what] * Math.max(0, scale) * Math.max(0, dt)); }
  /** A boost pad. */
  pad(): number { return this.add(BOOST_PAD_FILL); }
  add(amount: number): number {
    const before = this.meter;
    this.meter = clamp01(this.meter + amount);
    if (!this.fullLatched && this.meter >= 1) { this.fullLatched = true; this.events.full = true; }
    return this.meter - before;
  }

  /** Call once per frame with whether the boost control is held (and whether the mode allows it — not mid-wipeout). */
  update(dt: number, held: boolean, allowed = true): BoostEvents {
    const ev = this.events;
    const want = held && allowed;
    if (!this.burning && want && this.meter >= BOOST_MIN_START) { this.burning = true; ev.started = true; }
    if (this.burning) {
      if (!want) { this.burning = false; ev.ended = true; }
      else {
        this.meter = Math.max(0, this.meter - dt / BOOST_BURN_SEC);
        if (this.meter <= 0) { this.burning = false; ev.ended = true; ev.empty = true; }
      }
    }
    if (this.fullLatched && this.meter < BOOST_FULL_EXIT) this.fullLatched = false;
    const target = this.burning ? 1 : 0;
    const tau = target > this.k ? BOOST_RAMP_IN : BOOST_RAMP_OUT;
    this.k += (target - this.k) * (1 - Math.exp(-Math.max(0, dt) / tau));
    if (Math.abs(target - this.k) < 0.005) this.k = target;   // half a percent of the kick: below anything a lens or a trail shows
    this.events = { started: false, ended: false, full: false, empty: false };
    return ev;
  }

  /** Multiply the mode's top speed (and its push) by this. 1 at rest, BOOST_TOP_SPEED at a full burn. */
  speedMult(top = BOOST_TOP_SPEED): number { return 1 + (top - 1) * this.k; }
  get full(): boolean { return this.fullLatched; }
  /** The HUD's numbers: meter 0..100, and the two flags a host styles on. */
  hud(): { boost: number; boosting: boolean; boostFull: boolean } {
    return { boost: Math.round(this.meter * 100), boosting: this.burning, boostFull: this.fullLatched };
  }
  private lastHudKey = '';
  /** The HUD fields only when they CHANGED since the last call (a whole-number meter, a flag) — for a mode that would
   *  otherwise push a React re-render every frame just to repeat the same three values. */
  hudIfChanged(): { boost: number; boosting: boolean; boostFull: boolean } | null {
    const h = this.hud(), key = `${h.boost}|${h.boosting}|${h.boostFull}`;
    if (key === this.lastHudKey) return null;
    this.lastHudKey = key; return h;
  }
  reset(meter = 0): void { this.meter = clamp01(meter); this.burning = false; this.k = 0; this.fullLatched = this.meter >= 1; }
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
