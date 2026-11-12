import { describe, expect, it } from 'vitest';
import { INSTALL_PROMPT_PATHS, installRoute, isInstallPage, isIosSafari, type InstallContext } from './installPrompt';
import { chromeHiddenFor } from '@/components/shell/tab-bar';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
const IOS_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const GOOGLE_TV = 'Mozilla/5.0 (Linux; Android 12; Chromecast) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 CrKey/1.56.500000';
const TIZEN = 'Mozilla/5.0 (SMART-TV; LINUX; Tizen 7.0) AppleWebKit/537.36 (KHTML, like Gecko) 94.0.4606.31/7.0 TV Safari/537.36';

const base: InstallContext = {
  pathname: '/', userAgent: ANDROID, maxTouchPoints: 5, standalone: false, seen: false, hasPromptEvent: true, engaged: false,
};
const at = (c: Partial<InstallContext>) => installRoute({ ...base, ...c });

describe('"Install FEL": where and when it may show', () => {
  it('Chrome\'s own install event shows the Install button on a hub page', () => {
    for (const p of INSTALL_PROMPT_PATHS) expect(at({ pathname: p })).toBe('prompt');
    expect(at({ pathname: '/play/' })).toBe('prompt');   // a trailing slash is the same page
  });

  it('never in a game, on a TV surface, in the camera screen, a controller, sign-in or the dev views', () => {
    for (const p of ['/play/dunk', '/play/hoops-1v1', '/play/mirror', '/play/mirror/assess', '/try', '/host', '/join',
      '/controller/ABCD', '/screen', '/screen/privacy', '/arena', '/party', '/live', '/story/boss', '/story/rail', '/dev/x',
      '/login', '/signup', '/coach/combine', '/train/session', '/u/someone']) {
      expect(at({ pathname: p }), p).toBeNull();
    }
  });

  it('no hub page is one the app shell hides itself on (a game owns the screen there)', () => {
    for (const p of INSTALL_PROMPT_PATHS) expect(chromeHiddenFor(p), p).toBe(false);
  });

  it('never on a TV browser, even on a hub page with the event', () => {
    expect(at({ userAgent: GOOGLE_TV })).toBeNull();
    expect(at({ userAgent: TIZEN })).toBeNull();
  });

  it('never once installed, and never again once seen', () => {
    expect(at({ standalone: true })).toBeNull();
    expect(at({ seen: true })).toBeNull();
  });

  it('iPhone Safari gets the Share hint, but only after moving around the app once', () => {
    const ios = { userAgent: IPHONE, hasPromptEvent: false };
    expect(at({ ...ios, engaged: false })).toBeNull();
    expect(at({ ...ios, engaged: true })).toBe('ios-share');
    expect(at({ ...ios, engaged: true, pathname: '/play/dunk' })).toBeNull();
    expect(at({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5, hasPromptEvent: false, engaged: true })).toBe('ios-share');
  });

  it('no hint where the Share menu is not Safari\'s, or where nothing can install', () => {
    expect(at({ userAgent: IOS_CHROME, hasPromptEvent: false, engaged: true })).toBeNull();
    expect(at({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0, hasPromptEvent: false, engaged: true })).toBeNull();   // a real Mac
    expect(at({ userAgent: ANDROID, hasPromptEvent: false, engaged: true })).toBeNull();
  });

  it('the iOS test reads the user agent, not the screen', () => {
    expect(isIosSafari(IPHONE, 5)).toBe(true);
    expect(isIosSafari(IOS_CHROME, 5)).toBe(false);
    expect(isIosSafari(ANDROID, 5)).toBe(false);
    expect(isInstallPage('/')).toBe(true);
    expect(isInstallPage('/modes/')).toBe(true);
    expect(isInstallPage('/modes/x')).toBe(false);
  });
});
