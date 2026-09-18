// Motion schema — phone tilt as an analog charge, release to fire.
//
// iOS REALITY CHECK (the thing that quietly kills motion controls):
//   • DeviceOrientationEvent.requestPermission() exists on iOS 13+ and MUST be
//     called from inside a real user gesture (a tap handler). Calling it on
//     mount is rejected silently.
//   • It also requires a SECURE CONTEXT. A phone opening http://192.168.x.x
//     over the LAN gets no motion at all, no prompt, no error.
// The practical consequence: serve the controller page over HTTPS (deployed
// origin), even when the phone and TV are on the same WiFi. The WebRTC data
// channel still connects peer-to-peer over the LAN, so you keep the low latency
// while satisfying the secure-context requirement.
//
// needsPermission() lets the UI show a "tap to enable motion" button instead of
// a dead tilt meter.

export interface MotionReading {
  /** Nose-up/down in degrees. Positive = tilted back toward the player. */
  pitch: number;
  /** Left/right roll in degrees. */
  roll: number;
}

type PermissionCapableCtor = {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
};

export function motionNeedsPermission(): boolean {
  if (typeof window === 'undefined') return false;
  const ctor = window.DeviceOrientationEvent as unknown as PermissionCapableCtor | undefined;
  return typeof ctor?.requestPermission === 'function';
}

/** Must be called from a user gesture on iOS. Resolves true if usable. */
export async function requestMotionPermission(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const ctor = window.DeviceOrientationEvent as unknown as PermissionCapableCtor | undefined;
  if (typeof ctor?.requestPermission !== 'function') {
    // Android/desktop: no prompt, but a non-secure origin still yields no events.
    return typeof window.isSecureContext === 'boolean' ? window.isSecureContext : true;
  }
  try {
    return (await ctor.requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Subscribe to orientation. Returns an unsubscribe.
 * beta/gamma are already degrees; we only normalise the pitch so that "tilted
 * back toward you" is positive regardless of how the phone is held.
 */
export function subscribeMotion(onReading: (r: MotionReading) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (e: DeviceOrientationEvent): void => {
    const beta = e.beta ?? 0;    // front-back tilt, -180..180
    const gamma = e.gamma ?? 0;  // left-right tilt, -90..90
    // Holding a phone upright to play reads ~90; treat that as zero so the
    // charge starts from a natural grip rather than from flat-on-a-table.
    onReading({ pitch: beta - 90, roll: gamma });
  };
  window.addEventListener('deviceorientation', handler, true);
  return () => window.removeEventListener('deviceorientation', handler, true);
}

/**
 * Turns a tilt stream into a 0..1 charge.
 * Tracks the PEAK of the pull-back rather than the instantaneous angle, so the
 * power is decided by how far you wound up, not by wherever the phone happened
 * to be at the exact millisecond of release — which is what makes a flick feel
 * like a flick instead of a coin toss.
 */
export class TiltCharge {
  private peak = 0;
  private engaged = false;

  constructor(private fullChargeDeg = 45) {}

  /** Feed a reading; returns the current charge 0..1. */
  update(deg: number): number {
    const norm = Math.min(1, Math.max(0, deg / this.fullChargeDeg));
    if (norm > 0.08) this.engaged = true;
    if (this.engaged) this.peak = Math.max(this.peak, norm);
    return this.peak;
  }

  /** True once the phone has been pulled back far enough to count as a wind-up. */
  get armed(): boolean { return this.engaged && this.peak > 0.15; }

  /** Consume the charge and reset for the next shot. */
  release(): number {
    const v = this.peak;
    this.peak = 0;
    this.engaged = false;
    return v;
  }
}
