// The TV HUD system (A9.13, lane/tv-hud): one import for a host. See tokens.ts for the rules (palette, 10-foot scale,
// safe frame, motion) and each component's header for what it draws.
export * from './tokens';
export { HudFrame, END_CARD_HANDOFF_CLASS, CONSOLE_FLUSH_CLASS } from './hud-frame';
export { HudPlate, HudText, HudChip, ScoreValue, ScoreCell, ScoreDivider, Scorebug } from './scorebug';
export { HudBanner, HudLine, LINE_CLAMP_STYLE, PHONE_THUMB_GAP_CLASS } from './banner';
export { HudMeter, HudPips, METER_HEIGHT, type MeterSegment, type MeterTick, type MeterMarker, type MeterHeight } from './meter';
export { HudLowerThird, LOWER_THIRD_MS, lowerThirdFires } from './lower-third';
export { useHudReducedMotion } from './use-hud-motion';
