// FDB-2 (PM, 2026-10-17): on /try the soundtrack's first song waits for the guest's first dunk.
//
// The song is a 0.43–0.51 MB preview (`/audio/songs/<id>/preview.mp3`), and it was the biggest download left before dunk 1 on a
// phone. `resolveSrc` is the player's one way to a song's bytes (cache.ts fetches it there), so "never called" = "never
// downloaded". Same songs, same files, same playback once it starts; nothing changes on any other page.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SoundtrackPlayer, type AudioLike } from './player';
import { decideStage, FIRST_DUNK_PATH, holdsForFirstDunk, linkPath, type PlayConditions } from './policy';
import { houseTracks } from './house';

class FakeAudio implements AudioLike {
  src = ''; currentTime = 0; duration = NaN; paused = true; volume = 1; crossOrigin: string | null = null; preload = 'auto';
  private fns = new Map<string, (() => void)[]>();
  play() { this.paused = false; this.fire('playing'); return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.fire('pause'); } }
  addEventListener(t: string, fn: () => void) { this.fns.set(t, [...(this.fns.get(t) ?? []), fn]); }
  fire(t: string) { for (const f of this.fns.get(t) ?? []) f(); }
}

let fetched: string[] = [];
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0)); };
function makePlayer() {
  return new SoundtrackPlayer({
    createAudio: () => new FakeAudio(),
    graph: async () => null,
    now: () => 0,
    resolveSrc: async (url) => { fetched.push(url); return url; },
    rng: () => 0.42,
  });
}
beforeEach(() => { fetched = []; vi.useRealTimers(); });

const base: PlayConditions = { pathname: '/', unlocked: true, enabled: true, saveData: false, hidden: false, ageLocked: false, focusHeld: false, requested: null, hasTracks: true };

describe('policy: /try holds the soundtrack until the first dunk is in', () => {
  it('on /try: silent until firstDunkIn, then the stage it would always have had', () => {
    expect(FIRST_DUNK_PATH).toBe('/try');
    expect(decideStage({ ...base, pathname: '/try' })).toEqual({ silent: 'first-dunk' });
    expect(decideStage({ ...base, pathname: '/try', requested: 'bed' })).toEqual({ silent: 'first-dunk' });   // TAP TO START → playing
    expect(decideStage({ ...base, pathname: '/try', firstDunkIn: true })).toEqual({ stage: 'menu' });
    expect(decideStage({ ...base, pathname: '/try', firstDunkIn: true, requested: 'bed' })).toEqual({ stage: 'bed' });
  });
  it('on the way there too: the tap on /links\' "Play FEL" (headingTo) holds it before the page lands', () => {
    expect(decideStage({ ...base, pathname: '/links', headingTo: '/try' })).toEqual({ silent: 'first-dunk' });
    expect(decideStage({ ...base, pathname: '/links', headingTo: '/play/golf' })).toEqual({ stage: 'menu' });
    expect(decideStage({ ...base, pathname: '/links', headingTo: '/try', unlocked: false })).toEqual({ silent: 'first-dunk' });
  });
  it('nowhere else: /play/dunk (signed in), the menus and /try\'s neighbours play exactly as before', () => {
    for (const [pathname, stage] of [['/', 'menu'], ['/links', 'menu'], ['/play/dunk', 'bed'], ['/try-it', 'menu'], ['/try/x', 'menu']] as const) {
      expect(decideStage({ ...base, pathname }), pathname).toEqual({ stage });
      expect(holdsForFirstDunk({ pathname }), pathname).toBe(false);
    }
  });
  it('the privacy rules still come first on /try', () => {
    expect(decideStage({ ...base, pathname: '/try', ageLocked: true })).toEqual({ silent: 'age-locked' });
    expect(decideStage({ ...base, pathname: '/try', saveData: true })).toEqual({ silent: 'data-saver' });
    expect(decideStage({ ...base, pathname: '/try', enabled: false })).toEqual({ silent: 'off' });
  });
  it('linkPath: a same-site link\'s path; another site, mailto: or nothing is null', () => {
    const at = 'https://final-evolution-lab.web.app/links';
    expect(linkPath('/try', at)).toBe('/try');
    expect(linkPath('/try?c=AB12', at)).toBe('/try');
    expect(linkPath('try', at)).toBe('/try');
    expect(linkPath('https://final-evolution-lab.web.app/try', at)).toBe('/try');
    expect(linkPath('https://www.amazon.com/dp/B0H5J1M18H', at)).toBeNull();
    expect(linkPath('mailto:hi@example.com', at)).toBeNull();
    expect(linkPath(null, at)).toBeNull();
  });
});

describe('the player: no song is fetched on /try before dunk 1, and the same song plays after it', () => {
  it('the flyer: "Play FEL" is the first tap → /try loads → TAP TO START → no download until firstDunkIn, then one', async () => {
    const p = makePlayer();
    p.setCatalogue(houseTracks());
    p.setPathname('/links');
    p.headTo('/try');                 // the dock reads the tapped link before the unlock (client.unlockSoundtrackFromGesture)
    p.unlock();
    await flush();
    expect(fetched).toEqual([]);
    expect(p.snapshot().silent).toBe('first-dunk');
    p.setPathname('/try'); p.requestStage('loading'); await flush();
    p.requestStage('bed'); await flush();   // TAP TO START: the harness's first input → enterBed
    expect(fetched).toEqual([]);
    p.setFirstDunkIn(true);
    await flush();
    expect(fetched).toHaveLength(1);
    expect(fetched[0]).toMatch(/^\/audio\/songs\/[^/]+\/preview\.mp3$/);
    expect(p.snapshot()).toMatchObject({ stage: 'bed', playing: true });

    // the same song a player that was never held starts at the same moment (same catalogue, same shuffle)
    const ctl = makePlayer(); const before = fetched.slice(); fetched = [];
    ctl.setCatalogue(houseTracks()); ctl.setPathname('/play/dunk'); ctl.requestStage('bed'); ctl.unlock();
    await flush();
    expect(fetched).toEqual(before);
  });

  it('a link tap that never navigates lets go: headTo(null) (the client\'s 15 s timeout) starts the menu where the page is', async () => {
    const p = makePlayer();
    p.setCatalogue(houseTracks()); p.setPathname('/links');
    p.headTo('/try'); p.unlock(); await flush();
    expect(fetched).toEqual([]);
    p.headTo(null); await flush();
    expect(fetched).toHaveLength(1);
    expect(p.snapshot().stage).toBe('menu');
  });

  it('a navigation somewhere else clears the destination; /try never re-holds once the first dunk is in', async () => {
    const p = makePlayer();
    p.setCatalogue(houseTracks()); p.setPathname('/links');
    p.headTo('/try'); p.unlock(); await flush();
    p.setPathname('/train'); await flush();
    expect(p.conditions.headingTo).toBeNull();
    expect(fetched).toHaveLength(1);
    p.setFirstDunkIn(true); p.setPathname('/try'); await flush();
    expect(p.snapshot().silent).toBeNull();
  });

  it('a song already playing when /try opens goes quiet like any other silence and resumes on the same deck — no second download', async () => {
    vi.useFakeTimers();
    const p = makePlayer();
    p.setCatalogue(houseTracks()); p.setPathname('/links'); p.unlock();
    await vi.runAllTimersAsync();
    expect(fetched).toHaveLength(1);
    const playing = p.snapshot().track?.id;
    p.setPathname('/try'); await vi.runAllTimersAsync();
    expect(p.snapshot()).toMatchObject({ silent: 'first-dunk', playing: false });
    p.setFirstDunkIn(true); await vi.runAllTimersAsync();
    expect(p.snapshot()).toMatchObject({ playing: true });
    expect(p.snapshot().track?.id).toBe(playing);
    expect(fetched).toHaveLength(1);
  });
});
