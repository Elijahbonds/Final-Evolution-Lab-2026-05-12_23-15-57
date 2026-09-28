/**
 * lib/camera/cameraHelp.ts — what to tell a player whose camera did not start (QA P1-23, 2026-09-27).
 *
 * The Mirror, Prove It and body play each answered a failed getUserMedia with one red line ("Camera unavailable in this
 * browser/environment.") and nothing to do about it. The browser already says which failure it was — the DOMException's
 * name — and each has its own fix: a blocked permission is a site setting, a busy camera is another app, a missing one
 * is a cable. Pure: the error (or its name) in, a title and two or three steps out, plus "Play with buttons instead" for
 * a mode that has buttons.
 */

export type CameraFailure = 'blocked' | 'missing' | 'busy' | 'insecure' | 'unknown';

export interface CameraHelp {
  failure: CameraFailure;
  title: string;
  steps: string[];
  /** "Play with buttons instead", when the mode can be played without the camera; null when it cannot. */
  alternative: string | null;
}

const NAMES: Record<string, CameraFailure> = {
  NotAllowedError: 'blocked', PermissionDeniedError: 'blocked', SecurityError: 'blocked',
  NotFoundError: 'missing', DevicesNotFoundError: 'missing', OverconstrainedError: 'missing',
  NotReadableError: 'busy', TrackStartError: 'busy', AbortError: 'busy',
};

/** The failure a camera error names; a page that is not a secure context cannot open a camera at all. */
export function cameraFailure(err: unknown, secure = true): CameraFailure {
  if (!secure) return 'insecure';
  const name = typeof err === 'string' ? err : (err as { name?: unknown } | null)?.name;
  return (typeof name === 'string' && NAMES[name]) || 'unknown';
}

/** Is this error one of the camera's own (as opposed to a model or renderer that failed after the camera opened)? */
export function isCameraError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name in NAMES;
}

const COPY: Record<CameraFailure, { title: string; steps: string[] }> = {
  blocked: {
    title: 'Camera access is blocked',
    steps: [
      'Click the camera or lock icon in the address bar and allow the camera for this site.',
      'On a phone: Settings → your browser → Camera → Allow.',
      'Then try again.',
    ],
  },
  missing: {
    title: 'No camera found',
    steps: [
      'Plug in a camera, or switch on the built-in one (some laptops have a switch or a cover).',
      'If you have more than one, pick another in your browser\'s camera settings.',
      'Then try again.',
    ],
  },
  busy: {
    title: 'The camera is in use',
    steps: [
      'Close other apps and tabs using the camera (a video call, another FEL tab).',
      'Unplug and plug back in an external camera.',
      'Then try again.',
    ],
  },
  insecure: {
    title: 'The camera needs a secure page',
    steps: [
      'Open FEL at an address that starts with https://.',
      'Then try again.',
    ],
  },
  unknown: {
    title: 'The camera did not start',
    steps: [
      'Check that this site is allowed to use the camera (the icon in the address bar).',
      'Close other apps using the camera, then try again.',
    ],
  },
};

export function cameraHelp(err: unknown, opts: { buttons?: boolean; secure?: boolean } = {}): CameraHelp {
  const failure = cameraFailure(err, opts.secure ?? true);
  return { failure, ...COPY[failure], steps: [...COPY[failure].steps], alternative: opts.buttons ? 'Play with buttons instead' : null };
}

/** One paragraph, for a surface that shows a single line of text: "Title. 1) … 2) …". */
export function cameraHelpText(h: CameraHelp): string {
  return `${h.title}. ${h.steps.map((s, i) => `${i + 1}) ${s}`).join(' ')}`;
}
