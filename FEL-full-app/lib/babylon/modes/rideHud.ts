// RIDE HUD — the HUD's words for whoever is riding (SKATE-SCORE, GC-13 for skate and kart, 2026-09-29).
//
// In body mode the skate and kart HUDs still said the pad's words ("hold RB / Shift", "RT throttle", "X drift") and the
// player ring's puck showed the player's icon — a gamepad for most players — at the rider's feet (eye 9096d7cf:
// skate/body/b1x-ride-*.png, kart/body/b1x-ride-*.png). A body carves, crouches, hops, grabs the board edge, turns its
// shoulders and kick-pushes (movement play phase 8's card); in the kart it grips the wheel, turns it and hops into a turn.
// The boost (RB) and the kart's items (A) stay on the pad and the touch deck by design, so a body is told that, not a key.
//
// Gate Crasher's own fix (GATE-CRASHER-POLISH-2, 3a0f4edf) lives inside SnowboardSlalomMode (its `hudFor`, and the ring's
// meshes switched off by name); this is the same pattern for the two ride modes that had none, built on the one shared
// piece Polish-2 added — the boost gauge's `boostHint` (components/games/boost-hud.tsx). A pad, the keys and touch keep
// exactly the words they had, and the ring keeps its arc (the boost tank) in both.

/** What the HUD says, per who is riding. `boostHint` is the boost gauge's line (boost-hud.tsx). */
export interface RideHudWords { hint: string; boostHint: string }

/** The boost gauge's own default line (boost-hud.tsx) — what a pad, the keys and touch are told. */
export const PAD_BOOST_HINT = 'HOLD RB · SHIFT';

/** Venice Lines: the pad's words exactly as SkateRunMode had them. */
export const SKATE_PAD_HINT = 'HOLD FORWARD to push · POP to ollie · B to MANUAL · GRIND the rails · hold RB / Shift to BOOST';
export const SKATE_BODY_HINT = 'Carve to STEER · crouch to PUMP · hop to POP · a hand to the board edge GRABS · a shoulder quarter-turn SPINS · kick-push to PUSH · BOOST on pad / touch (RB)';
export const SKATE_BODY_BOOST_HINT = 'LANDINGS FILL IT · RB ON PAD / TOUCH';

/** Velocity Kart: the pad's words exactly as VelocityKartMode has them, before and after GO. */
export const KART_PAD_HINT = 'RT throttle · X drift to fill BOOST · hold RB / Shift to burn it · A fires your item';
export const KART_PAD_START_HINT = 'THROTTLE DOWN ON "2" AND HOLD IT FOR A ROCKET START — ON "3" IT BOGS';
export const KART_BODY_HINT = 'Grip the wheel for GAS · turn it to STEER · hop into the turn to DRIFT · BOOST (RB) and ITEMS (A) on pad / touch';
export const KART_BODY_START_HINT = 'GRIP THE WHEEL ON "2" AND HOLD IT FOR A ROCKET START — ON "3" IT BOGS';
export const KART_BODY_BOOST_HINT = 'DRIFTS FILL IT · RB ON PAD / TOUCH';

export function skateHudWords(body: boolean): RideHudWords {
  return body ? { hint: SKATE_BODY_HINT, boostHint: SKATE_BODY_BOOST_HINT } : { hint: SKATE_PAD_HINT, boostHint: PAD_BOOST_HINT };
}

/** `started`: the race is past GO (before it the hint is the rocket start's). */
export function kartHudWords(body: boolean, started: boolean): RideHudWords {
  if (body) return { hint: started ? KART_BODY_HINT : KART_BODY_START_HINT, boostHint: KART_BODY_BOOST_HINT };
  return { hint: started ? KART_PAD_HINT : KART_PAD_START_HINT, boostHint: PAD_BOOST_HINT };
}

/** The player ring's glyph puck (visual/PlayerRing: the 'player_tag' plane the harness mounts beside the ring). */
export const RING_GLYPH_MESH = 'player_tag';
/** The little of a Babylon mesh this needs — so a test can hand it plain objects. */
export interface GlyphMesh { name: string; isEnabled(): boolean; setEnabled(on: boolean): void }

/** Show or hide the ring's glyph puck; returns how many meshes changed. The ring itself (the boost arc) is left alone. */
export function setRingGlyph(meshes: readonly GlyphMesh[], on: boolean): number {
  let n = 0;
  for (const m of meshes) if (m.name === RING_GLYPH_MESH && m.isEnabled() !== on) { m.setEnabled(on); n++; }
  return n;
}

/**
 * Whose words are on screen. `next(bodyNow)` answers the words to publish when that changes (the first call always
 * answers), else null — so the mode writes the HUD once per switch rather than every frame. `glyphDue(dt)` says when to
 * re-assert the glyph while a body plays (the harness can mount a ring after the switch): once a second after the switch.
 */
export class RideHudSwitch {
  private body: boolean | null = null;
  private since = 0;
  next(bodyNow: boolean): boolean | null {
    if (bodyNow === this.body) return null;
    this.body = bodyNow; this.since = 0;
    return bodyNow;
  }
  glyphDue(dt: number): boolean {
    this.since += dt;
    if (this.since < 1) return false;
    this.since = 0;
    return true;
  }
  get isBody(): boolean { return this.body === true; }
  reset(): void { this.body = null; this.since = 0; }
}
