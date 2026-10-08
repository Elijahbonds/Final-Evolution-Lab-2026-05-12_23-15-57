// The Quick Screen's typeface, on its own so /screen can paint a frame without importing the skeleton
// helpers in lib/screen/ui.ts (those pull lib/pose, and the QR page must not).

/** The screen pages' font: the system stack (never Courier, never the --fel-font-display chain). Gate 1. */
export const SYSTEM_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
