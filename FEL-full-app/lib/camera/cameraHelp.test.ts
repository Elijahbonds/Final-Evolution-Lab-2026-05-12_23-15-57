// QA P1-23 (2026-09-27): a camera that did not start was one red line ("Camera unavailable in this browser/environment.")
// on the Mirror, Prove It and body play. The browser names the failure; each name gets its own fix.
import { describe, expect, it } from 'vitest';
import { cameraFailure, cameraHelp, cameraHelpText, isCameraError } from './cameraHelp';

const err = (name: string) => Object.assign(new Error(name), { name });

describe('cameraHelp: every failure the browser names', () => {
  const TABLE: [string, string, RegExp][] = [
    ['NotAllowedError', 'Camera access is blocked', /allow the camera for this site/],
    ['SecurityError', 'Camera access is blocked', /Settings → your browser → Camera/],
    ['NotFoundError', 'No camera found', /Plug in a camera/],
    ['OverconstrainedError', 'No camera found', /pick another/],
    ['NotReadableError', 'The camera is in use', /Close other apps and tabs using the camera/],
    ['AbortError', 'The camera is in use', /Unplug and plug back in/],
    ['TypeError', 'The camera did not start', /allowed to use the camera/],
  ];
  it.each(TABLE)('%s → %s, with steps', (name, title, step) => {
    const h = cameraHelp(err(name));
    expect(h.title).toBe(title);
    expect(h.steps.length).toBeGreaterThanOrEqual(2);
    expect(h.steps.length).toBeLessThanOrEqual(3);
    expect(h.steps.join(' ')).toMatch(step);
  });

  it('a page that is not a secure context cannot open a camera: it says https', () => {
    const h = cameraHelp(new TypeError("Cannot read properties of undefined (reading 'getUserMedia')"), { secure: false });
    expect(h.failure).toBe('insecure');
    expect(h.steps.join(' ')).toMatch(/https:\/\//);
  });

  it('"Play with buttons instead" only where the mode has buttons', () => {
    expect(cameraHelp(err('NotAllowedError'), { buttons: true }).alternative).toBe('Play with buttons instead');
    expect(cameraHelp(err('NotAllowedError')).alternative).toBeNull();
  });

  it('names a string too, and knows a camera error from a renderer failure', () => {
    expect(cameraFailure('NotReadableError')).toBe('busy');
    expect(isCameraError(err('NotFoundError'))).toBe(true);
    expect(isCameraError(new Error('WebGL context lost'))).toBe(false);
  });

  it('one paragraph for a single-line surface', () => {
    expect(cameraHelpText(cameraHelp(err('NotAllowedError')))).toMatch(/^Camera access is blocked\. 1\) .+ 2\) .+ 3\) Then try again\.$/);
  });
});
