// REDUCED MOTION — one answer for every flash, shake, hit-stop and slow-mo in the game.
//
// HOTFIX (2026-09-24): the juice never asked. JuiceKit's hitStop, slowMo and flash, the harness's camera shake, the
// rig's exposure flash and the impact pulse all fired the same way for everybody, and none of them read
// `prefers-reduced-motion` — in movement play the player is moving their whole body while the screen flashes. The
// page's own CSS already honoured the OS setting (fel-rise, fel-breath, the CTA); the games were the part that didn't.
//
// THE RULE: the OS setting is the default, and the app can override it either way (a player who wants calm without
// changing their phone, or one whose phone says "reduce" but wants the full show). Stored like the app's other client
// prefs (`fel-difficulty`, `fel-weather`): one localStorage key, every read and write wrapped, a private window keeps
// the choice for the session.
//
// WHAT REDUCED MEANS (owner, 2026-09-24): no screen flashes, no camera shake, hit-stop and slow-mo cut to a minimal
// cue. PRESENTATION ONLY — gameplay timing is identical. JuiceKit's time effects only move the scene's animation clock
// (the bodies), never the mode's dt, so shortening them changes what you see and nothing you are timed on. The
// exception is a slow-mo a mode has made PART OF ITS CLOCK (the dunk's hang, where the slam window rides the scene's
// animation time; skate's spectacle beat, where the mode slows its own dt to match): those are passed as `gameplay`
// and keep their full length, because shortening them would move the window the player is aiming at. The same flag on a
// hit-stop marks one paired with an equal freeze of the mode's own clock (the dunk's contact punch): shortening only the
// bodies' half would not make the screen any stiller, it would just let the limbs move while the root and ball hold.

export type MotionPref = 'system' | 'reduce' | 'full';

export const MOTION_PREFS: readonly MotionPref[] = ['system', 'reduce', 'full'];

/** The localStorage key, beside `fel-difficulty` / `fel-weather`. */
export const MOTION_KEY = 'fel-motion';

/** The OS setting, as the browser exposes it. */
export const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/** JuiceKit's own caps (unchanged): a hit-stop never freezes the bodies longer than this… */
export const HITSTOP_MAX_MS = 90;
/** …and a slow-mo never holds longer than this. */
export const SLOWMO_MAX_MS = 500;

/** Under reduced motion a hit-stop is still a beat — about two frames — not a freeze. */
export const CALM_HITSTOP_MS = 30;
/** Under reduced motion a presentation slow-mo is a dip, not a hold. */
export const CALM_SLOWMO_MS = 120;

export function isMotionPref(v: unknown): v is MotionPref {
  return typeof v === 'string' && (MOTION_PREFS as readonly string[]).includes(v);
}

/** THE POLICY'S FIRST HALF (pure): the override wins; 'system' follows the OS. */
export function resolveReducedMotion(pref: MotionPref, osReduces: boolean): boolean {
  if (pref === 'reduce') return true;
  if (pref === 'full') return false;
  return osReduces === true;
}

export interface JuicePolicy {
  /** Reduced motion is on. */
  reduced: boolean;
  /** Screen flashes may fire (JuiceKit.flash, the rig's exposure flash, the impact frame pulse, the stands' flashes). */
  flash: boolean;
  /** The camera may shake (JuiceKit.shake, the harness Shaker, the replay's handheld wobble, the 2-D canvas shake). */
  shake: boolean;
  /** Score pops and banners may fly and scale; off, they fade where they are. */
  travel: boolean;
  /** How long a hit-stop requested at `ms` freezes the bodies. Full motion: exactly JuiceKit's old `Math.min(ms, 90)`.
   *  `gameplay` = it is paired with a freeze of the mode's own clock of the same length (the dunk's contact punch):
   *  never shortened, so the limbs never start moving while the root and the ball are still held. */
  hitStopMs(ms: number, gameplay?: boolean): number;
  /** How long a slow-mo requested at `ms` holds. `gameplay` = the mode's clock rides it: never shortened. */
  slowMoMs(ms: number, gameplay?: boolean): number;
}

/** THE POLICY'S SECOND HALF (pure): what each effect does, given the answer. */
export function juicePolicy(reduced: boolean): JuicePolicy {
  return {
    reduced,
    flash: !reduced,
    shake: !reduced,
    travel: !reduced,
    hitStopMs: (ms, gameplay = false) =>
      (reduced && !gameplay ? Math.min(ms, HITSTOP_MAX_MS, CALM_HITSTOP_MS) : Math.min(ms, HITSTOP_MAX_MS)),
    slowMoMs: (ms, gameplay = false) =>
      (reduced && !gameplay ? Math.min(ms, SLOWMO_MAX_MS, CALM_SLOWMO_MS) : Math.min(ms, SLOWMO_MAX_MS)),
  };
}

// ── the runtime ─────────────────────────────────────────────────────────────────────────────────────────────

/** Set only when the storage write failed (a private window): the choice still holds for this session. */
let sessionOnly: MotionPref | null = null;
const listeners = new Set<() => void>();

/**
 * `?motion=` on the page's URL — a QA run's override, never stored — or null.
 *
 * HOTFIX (2026-09-24): in a production build it only ever CALMS. It used to be honoured both ways everywhere, so a shared
 * `/try?motion=full` link turned the flashes back on for a player whose device, or whose own stored choice, asked for
 * reduced motion. `reduce` still works everywhere (a link can only make the screen quieter); `full` and `system` are
 * dev/test only.
 */
export function motionUrlOverride(): MotionPref | null {
  try {
    if (typeof window === 'undefined') return null;
    const q = new URLSearchParams(window.location?.search ?? '').get('motion');
    if (!isMotionPref(q)) return null;
    return q === 'reduce' || process.env.NODE_ENV !== 'production' ? q : null;
  } catch { return null; }
}

/** The player's own choice: this session's (a private window that refused the write), then the stored one, then 'system'. */
export function storedMotionPref(): MotionPref {
  if (sessionOnly) return sessionOnly;
  try {
    if (typeof window !== 'undefined') {
      const s = window.localStorage?.getItem(MOTION_KEY);
      if (isMotionPref(s)) return s;
    }
  } catch { /* storage blocked: the OS decides */ }
  return 'system';
}

/** The choice in force: the URL override when there is one, else the player's own. */
export function readMotionPref(): MotionPref {
  return motionUrlOverride() ?? storedMotionPref();
}

export function writeMotionPref(pref: MotionPref): void {
  try { window.localStorage.setItem(MOTION_KEY, pref); sessionOnly = null; }
  catch { sessionOnly = pref; }
  for (const fn of [...listeners]) { try { fn(); } catch { /* one bad listener never blocks the rest */ } }
}

/** What the device asks for. No window (SSR, a headless check) = no preference. */
export function osPrefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCE_QUERY).matches === true;
  } catch { return false; }
}

/** The answer, now. Read at the moment an effect fires, so a change applies to the very next flash. */
export function reducedMotion(): boolean {
  return resolveReducedMotion(readMotionPref(), osPrefersReducedMotion());
}

/** The policy, now — what JuiceKit and the other effect sites consult. */
export function motionPolicy(): JuicePolicy {
  return juicePolicy(reducedMotion());
}

/** Called when the app's choice changes (writeMotionPref) or the OS setting flips. Returns the unsubscribe. */
export function onMotionChange(fn: () => void): () => void {
  listeners.add(fn);
  let mql: MediaQueryList | null = null;
  try {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      mql = window.matchMedia(REDUCE_QUERY);
      if (typeof mql.addEventListener === 'function') mql.addEventListener('change', fn);
      else mql.addListener?.(fn);   // Safari < 14
    }
  } catch { mql = null; }
  return () => {
    listeners.delete(fn);
    try {
      if (mql && typeof mql.removeEventListener === 'function') mql.removeEventListener('change', fn);
      else mql?.removeListener?.(fn);
    } catch { /* gone with the page */ }
  };
}
