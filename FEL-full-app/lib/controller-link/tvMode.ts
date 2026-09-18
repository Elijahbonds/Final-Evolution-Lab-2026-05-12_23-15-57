// TV MODE — compensating for a picture that arrives late (2026-09-13).
//
// Mission Phase C, verbatim: "When the HOST detects it is being screen-mirrored, or the user selects mirror
// mode manually, widen shot timing windows by a configurable factor (start at 1.35x) to compensate for
// display lag. Rationale: mirroring delays the picture, not the input, so the player reacts late through no
// fault of their own. Native/host-on-TV mode uses 1.0x."
//
// The rationale is the design. AirPlay and Chromecast add somewhere between 60 ms and 300 ms between the
// frame being drawn and the frame being seen, and the player's thumb is on a controller that reaches the
// host immediately. So they see the meter at the perfect moment, press, and the press lands 150 ms late —
// every time, consistently, through no error of their own. Widening the window gives that back. It is not a
// difficulty setting and must never be sold as one.
//
// WHY IT IS NOT AUTOMATIC-ONLY. There is no reliable browser API for "am I being mirrored" — the signals
// below are hints, not facts, and a wrong guess in either direction is worse than asking. So detection
// SUGGESTS and the player decides, and the manual choice always wins.
//
// Pure: the detection takes its inputs as arguments so every branch is testable.

export type DisplayMode = 'direct' | 'mirrored';

/** The factor timing windows are multiplied by. 1.0 is "the picture is honest". */
export const DIRECT_FACTOR = 1;
/**
 * 1.35× on a mirrored display.
 *
 * The mission's starting number, and it is the right shape: a typical wireless mirror adds ~150 ms, and 3PT's
 * perfect band is ~0.09 s either side of the beat (RallyCore/ThreePoint share the same order of magnitude),
 * so a third wider roughly restores the share of presses that land clean. Configurable because the real
 * number depends on the living room.
 */
export const MIRROR_FACTOR = 1.35;
/** Sane bounds for a player-set factor — past 2× the mechanic stops being a timing mechanic. */
export const FACTOR_MIN = 1;
export const FACTOR_MAX = 2;

export function factorFor(mode: DisplayMode, custom?: number): number {
  if (mode === 'direct') return DIRECT_FACTOR;
  const f = Number.isFinite(custom) ? (custom as number) : MIRROR_FACTOR;
  return Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, f));
}

/** Widen a timing window by the display factor. */
export function widen(windowSec: number, factor: number): number {
  return windowSec * Math.max(FACTOR_MIN, Math.min(FACTOR_MAX, factor));
}

// ── Detection ──────────────────────────────────────────────────────────────
export interface DisplayHints {
  /** A TV-shaped user agent: Tizen, webOS, Google TV, Fire TV. */
  userAgent: string;
  /** Is the page on a display the browser considers external/extended? */
  screenIsExternal?: boolean;
  /** Does the device report itself as a phone or tablet? */
  touchPoints?: number;
  /** Viewport, for the phone-in-your-hand vs TV-across-the-room distinction. */
  width?: number;
  height?: number;
}

export interface DisplayGuess {
  /** What we think, and it is only a guess. */
  suggested: DisplayMode;
  /** Why — shown to the player so the suggestion is legible rather than magic. */
  because: string;
  /** How sure: a guess the UI should act on, or one it should only offer. */
  confident: boolean;
}

const TV_UA = /tizen|web0s|webos|netcast|googletv|android tv|bravia|aft[a-z]|crkey|hbbtv|smart-?tv/i;

/**
 * Guess how this host is being displayed.
 *
 * The one thing it can be nearly sure of is a TV BROWSER: a page running on a Tizen or webOS set is on the
 * screen it is drawing to, so there is no mirror and no added latency. Everything else is softer — a phone
 * or laptop MIGHT be casting, and the honest output is a suggestion with its reason attached.
 */
export function guessDisplay(h: DisplayHints): DisplayGuess {
  const ua = h.userAgent ?? '';
  if (TV_UA.test(ua)) {
    return { suggested: 'direct', because: 'Running on the TV itself — the picture is not delayed.', confident: true };
  }
  if (h.screenIsExternal) {
    return { suggested: 'mirrored', because: 'Playing on a second screen, which usually adds a little delay.', confident: false };
  }
  const phone = (h.touchPoints ?? 0) > 0 && (h.width ?? 0) > 0 && (h.width ?? 0) < 900;
  if (phone) {
    return { suggested: 'direct', because: 'Playing on the phone’s own screen.', confident: false };
  }
  return { suggested: 'direct', because: 'Playing on this screen. Turn on TV mode if you are casting.', confident: false };
}

// ── The player's choice ────────────────────────────────────────────────────
export const TV_MODE_KEY = 'fel-display-mode';
export const TV_FACTOR_KEY = 'fel-display-factor';

export interface DisplaySetting {
  mode: DisplayMode;
  factor: number;
  /** Did the player choose this, or did we guess? A guess may be overridden silently; a choice may not. */
  chosen: boolean;
}

export function readDisplaySetting(hints?: DisplayHints): DisplaySetting {
  try {
    if (typeof window !== 'undefined') {
      const m = window.localStorage.getItem(TV_MODE_KEY);
      if (m === 'direct' || m === 'mirrored') {
        const raw = Number(window.localStorage.getItem(TV_FACTOR_KEY));
        return { mode: m, factor: factorFor(m, Number.isFinite(raw) ? raw : undefined), chosen: true };
      }
    }
  } catch { /* private mode: fall through to the guess */ }
  const guess = hints ? guessDisplay(hints) : { suggested: 'direct' as DisplayMode, because: '', confident: false };
  return { mode: guess.suggested, factor: factorFor(guess.suggested), chosen: false };
}

export function writeDisplaySetting(mode: DisplayMode, factor?: number): void {
  try {
    window.localStorage.setItem(TV_MODE_KEY, mode);
    if (factor !== undefined) window.localStorage.setItem(TV_FACTOR_KEY, String(factorFor(mode, factor)));
  } catch { /* the setting just does not persist */ }
}

/** What to tell the player, in one line, without ever framing it as an easier difficulty. */
export function displayBanner(s: DisplaySetting): string {
  return s.mode === 'mirrored'
    ? `TV MODE — timing widened ${s.factor.toFixed(2)}× for screen delay`
    : 'DIRECT — standard timing';
}
