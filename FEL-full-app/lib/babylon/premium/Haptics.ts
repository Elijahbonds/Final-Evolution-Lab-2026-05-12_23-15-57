// Haptics — one adapter, everywhere. navigator.vibrate where available (Android
// Chrome); safely no-ops elsewhere. Gamepad actuators when a pad is connected.

let lastAt = 0;
const MIN_GAP_MS = 40;                 // don't buzz-spam on rapid inputs

export function vibrate(pattern: number | number[]): void {
  const now = performance.now();
  if (now - lastAt < MIN_GAP_MS) return;
  lastAt = now;
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

export const HAPTIC = {
  tap: () => vibrate(10),                       // button-down acknowledgment
  impact: () => vibrate([12, 20, 12]),          // hit-stop moments
  perfect: () => vibrate([10, 30, 10]),         // perfect timing / signature
  fail: () => vibrate([60]),                    // bail / tackled / KO'd
};

/** Rumble a connected standard gamepad if it exposes actuators. */
export function padRumble(intensity = 0.6, ms = 120): void {
  const pad = navigator.getGamepads?.()[0];
  const act = (pad as unknown as { vibrationActuator?: { playEffect(t: string, o: object): void } })
    ?.vibrationActuator;
  act?.playEffect('dual-rumble', {
    duration: ms, strongMagnitude: intensity, weakMagnitude: intensity * 0.6,
  });
}
