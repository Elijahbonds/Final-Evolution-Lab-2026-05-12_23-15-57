// floatStick — THE PHONE STICK, redesigned (lane/move-feel-2; owner 2026-11-17: "it appears under the thumb, about 1.5× today's size, a 10 %
// dead zone, the same push always the same speed"). Pure: the numbers and the thumb → stick mapping; TouchOverlay's FloatStick draws it.
//
// Today's MOVE stick (TouchOverlay AnalogStick) is a fixed 96 px circle (82 px on a sideways phone): full speed 48 px from its centre (41 px
// sideways — about 6–7 mm of thumb), no dead zone, and a thumb that lands off its centre starts moving at once, a thumb that lands outside it
// does nothing (MOVE-FEEL-DIAGNOSIS cause #4). The floating stick: a touch anywhere in its zone puts the stick's centre UNDER the thumb, so
// the first contact is always a standstill; full speed is FLOAT_RADIUS_PX from there (1.5× today's travel); the first FLOAT_DEAD of the
// travel is still, and the rest is rescaled to 0..1 so the walk / jog line and full tilt sit where they always do on the stick's own scale.
// "The same push always the same speed" is the stick's scale with no turbo hidden in it: hoops.stickSprintFallback 0 (a full push never
// sprints until TURBO is touched) and hoops.gearBlendBand 0.2 (no walk / jog step).
// Knob `touch.floatStick`: 1 = this stick on the hoops modes (shipped ON: the owner's choice); 0 = today's fixed stick.

/** (new, lane/move-feel-2) 1 = the floating stick on the 1v1 / 3v3 touch deck; 0 = the fixed 96 px stick (before 2026-11-17).
 *  assumption: shipped ON — the owner chose it; the knob restores today's stick. */
export const TOUCH_FLOAT_STICK = 1;
/** Today's stick: 96 px across (h-24 w-24), full speed at its rim. */
export const FIXED_STICK_PX = 96;
/** The floating stick's base: 1.5× today's (owner: "about 1.5×"). Full speed at its rim. */
export const FLOAT_BASE_PX = Math.round(FIXED_STICK_PX * 1.5);   // 144
export const FLOAT_RADIUS_PX = FLOAT_BASE_PX / 2;                // 72
/** The share of the travel that is still (owner: "10 % dead zone"), radial; the rest is rescaled to 0..1. */
export const FLOAT_DEAD = 0.1;
/** The zone a thumb may land in (CSS px, before the deck's own fit / compact scale): wider than the base so it can float. */
export const FLOAT_ZONE_W = 172, FLOAT_ZONE_H = 136;   // (136: the upright deck keeps its fit — a taller zone shrank the whole left column, d-pad and all; 172: clear of the upright TURBO pad, measured by phone-stick.mjs)

/** The stick vector for a thumb `dx, dy` (px, screen; +y down) from where it landed, at full speed `radius` px out: a radial dead zone of
 *  `dead` (rescaled, so 0..1 past it), clamped to the unit circle. Same sign convention as the bus (+y down). */
export function floatStickVector(dx: number, dy: number, radius = FLOAT_RADIUS_PX, dead = FLOAT_DEAD): { x: number; y: number } {
  const d = Math.hypot(dx, dy) / Math.max(1e-6, radius);
  if (!(d > dead)) return { x: 0, y: 0 };
  const m = Math.min(1, (d - dead) / (1 - dead)), k = m / d;
  return { x: (dx / radius) * k, y: (dy / radius) * k };
}

/** The knob's drawn offset (px): the thumb's own offset, held to the base's rim. */
export function floatKnobOffset(dx: number, dy: number, radius = FLOAT_RADIUS_PX): { x: number; y: number } {
  const d = Math.hypot(dx, dy); const k = d > radius ? radius / d : 1;
  return { x: dx * k, y: dy * k };
}
