// BODY-PLAY-WORKS: under 18, or an age we do not have, gets the Mirror's grown-up step before the camera.
// The camera is not requested until that step's tick. The Mirror's own flow is not this file's to change.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GrownUpStep } from '@/app/play/mirror/assess/_components/gate-steps';
import { GROWN_UP_BODY, GROWN_UP_CHECKBOX, GROWN_UP_TITLE } from '@/lib/screen/copy';
import { createBodyPlay, type BodyPlayDeps } from './bodyPlay';
import { bodyPlayNeedsGrownUp, readBodyPlayAge, setBodyPlayDob, setBodyPlayDobYear, type BodyPlayAge } from './bodyPlayGrownUp';
import { sessionStore } from '@/lib/babylon/core/sessionStore';
import { bodySeamFor } from '@/lib/babylon/core/bodySeam';
import { lockAge, forgetAgeForTests, type StorageLike } from '@/lib/screen/store';

const NOW = new Date('2026-10-01T00:00:00Z');

describe('the Mirror age rule, before a game camera', () => {
  it('under 18, rather-not-say, and an unknown age all wait; a known adult does not', () => {
    expect(bodyPlayNeedsGrownUp({ dobYear: 2012 }, NOW)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ dobYear: 2008 }, NOW)).toBe(true);   // gap of 18 is not yet verified 18+
    expect(bodyPlayNeedsGrownUp({ dobYear: null }, NOW)).toBe(true);
    expect(bodyPlayNeedsGrownUp({}, NOW)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ band: 'under-13' }, NOW)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ band: '13-17' }, NOW)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ band: 'unknown' }, NOW)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ band: '18+', dobYear: 2012 }, NOW)).toBe(true);   // the stricter year wins
    expect(bodyPlayNeedsGrownUp({ band: '18+' }, NOW)).toBe(false);
    expect(bodyPlayNeedsGrownUp({ dobYear: 1990 }, NOW)).toBe(false);
    expect(bodyPlayNeedsGrownUp({ band: '18+', dobYear: 1990 }, NOW)).toBe(false);
  });

  it('reads this tab\'s screen answer, and a held birth year, without writing the screen\'s record', () => {
    forgetAgeForTests();
    const mem = new Map<string, string>();
    const store: StorageLike = {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => { mem.set(k, v); },
      removeItem: (k) => { mem.delete(k); },
      key: (i) => [...mem.keys()][i] ?? null,
      get length() { return mem.size; },
    };
    try {
      expect(readBodyPlayAge(store).band).toBeNull();
      expect(bodyPlayNeedsGrownUp(readBodyPlayAge(store), NOW)).toBe(true);
      lockAge(store, '18+');
      setBodyPlayDobYear(1990);
      expect(bodyPlayNeedsGrownUp(readBodyPlayAge(store), NOW)).toBe(false);
      setBodyPlayDobYear(2012);
      expect(bodyPlayNeedsGrownUp(readBodyPlayAge(store), NOW)).toBe(true);
    } finally {
      setBodyPlayDobYear(undefined);
      forgetAgeForTests();
    }
  });
});

describe('the camera is never requested before the tick', () => {
  const ages: BodyPlayAge[] = [{}, { dobYear: null }, { dobYear: 2012 }, { band: '13-17' }, { band: 'unknown' }];

  function camera(age: BodyPlayAge, phase: 'ready' | 'playing' = 'ready') {
    const calls: string[] = [];
    const writer = sessionStore.mount(bodySeamFor({ modeId: 'skateboard' }).card);
    writer.setPhase(phase);
    const deps: BodyPlayDeps = {
      source: {
        snapshot: { state: 'idle', detail: '', body: false },
        start: async () => { calls.push('start'); return true; },
        stop: () => { calls.push('stop'); },
        listen: () => () => {},
        setCalibration: () => {},
        recalibrate: () => {},
      },
      service: {
        status: { state: 'idle', why: null, source: null, model: null, modelWhy: null, camera: null },
        onFrame: () => () => {},
        onStatus: () => () => {},
      },
      session: sessionStore,
      storage: { getItem: () => null, setItem: () => {} },
      unlockAudio: () => { calls.push('unlock'); },
      voice: { load: () => {}, play: () => {}, bank: () => new Set() },
      sampleLuma: () => null,
      pauseGame: () => { calls.push('pause'); writer.setPhase('paused'); },
      onPageHidden: () => {},
      now: () => 0,
      needsGrownUp: () => bodyPlayNeedsGrownUp(age, NOW),
    };
    return { bp: createBodyPlay(deps), calls, close: () => writer.unmount() };
  }

  it.each(ages)('no start, no pause, until Continue — %j', async (age) => {
    const r = camera(age);
    try {
      expect(await r.bp.begin('skateboard')).toBe(false);
      expect(r.calls).toEqual([]);
      expect(r.bp.view().grownUp).toBe('ask');
      expect(r.bp.view().camera.state).toBe('idle');
      expect(await r.bp.button()).toBe('begin');
      expect(r.calls).toEqual([]);
      expect(await r.bp.confirmGrownUp()).toBe(true);
      expect(r.calls).toContain('start');
      expect(r.calls).not.toContain('pause');
      expect(r.bp.view().grownUp).toBe('clear');
    } finally { r.close(); }
  });

  it('mid-play does not pause the game until the tick', async () => {
    const r = camera({ dobYear: null }, 'playing');
    try {
      expect(await r.bp.button()).toBe('begin-paused');
      expect(r.calls).toEqual([]);
      expect(sessionStore.view().phase).toBe('playing');
      expect(r.bp.view().grownUp).toBe('ask');
      expect(await r.bp.confirmGrownUp()).toBe(true);
      expect(r.calls[0]).toBe('pause');
      expect(r.calls).toContain('start');
      expect(sessionStore.view().phase).toBe('paused');
    } finally { r.close(); }
  });

  it('an adult tap requests the camera with no tick', async () => {
    const r = camera({ band: '18+', dobYear: 1990 });
    try {
      expect(await r.bp.begin('skateboard')).toBe(true);
      expect(r.calls).toContain('start');
      expect(r.bp.view().grownUp).toBe('clear');
    } finally { r.close(); }
  });
});

describe('the step on screen is the Mirror\'s, and the Mirror\'s flow is unchanged', () => {
  it('Get a grown-up, the tick, and Continue disabled until it is ticked', () => {
    const html = renderToStaticMarkup(createElement(GrownUpStep, { onContinue: () => {} }));
    expect(html).toContain(GROWN_UP_TITLE);
    expect(html).toContain(GROWN_UP_BODY);
    expect(html).toContain(GROWN_UP_CHECKBOX);
    expect(html).toContain('data-grown-up-box');
    expect(html).toContain('disabled=""');
    expect(html).toContain('Continue');
    expect(GROWN_UP_TITLE).toBe('Get a grown-up');
    expect(GROWN_UP_CHECKBOX).toBe('A grown-up is with me');
  });

  it('body play draws that step and does not ask for the camera itself', () => {
    const src = readFileSync(join(__dirname, '../../components/games/body-play.tsx'), 'utf8');
    expect(src).toContain("import { GrownUpStep } from '@/app/play/mirror/assess/_components/gate-steps'");
    expect(src).toContain("view.grownUp === 'ask'");
    expect(src).toContain('bodyPlay.confirmGrownUp()');
    expect(src).not.toMatch(/getUserMedia/);
    const mirror = readFileSync(join(__dirname, '../../app/play/mirror/assess/_components/assess-app.tsx'), 'utf8');
    expect(mirror).toContain("{phase === 'grownUp' ? <GrownUpStep onContinue={grownUp} /> : null}");
  });
});

// FN-BOX-1b-2: a full birth date makes the year half exact (from the 18th birthday); without one, the year rule as before.
describe('a full birth date, before a game camera', () => {
  const TODAY = new Date(2026, 9, 19, 12, 0, 0);   // 2026-10-19, local calendar (isAdult18 reads `now` locally)

  it('born 2008 with the birthday already past this year needs no grown-up step', () => {
    expect(bodyPlayNeedsGrownUp({ dobYear: 2008, dob: '2008-03-05' }, TODAY)).toBe(false);
    expect(bodyPlayNeedsGrownUp({ dob: '2008-03-05' }, TODAY)).toBe(false);
    expect(bodyPlayNeedsGrownUp({ band: '18+', dobYear: 2008, dob: '2008-10-19' }, TODAY)).toBe(false);   // the birthday itself
  });

  it('born 2008 with the birthday still to come this year still waits', () => {
    expect(bodyPlayNeedsGrownUp({ dobYear: 2008, dob: '2008-10-20' }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ dobYear: 2008, dob: '2008-12-25' }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ band: '18+', dobYear: 2008, dob: '2008-12-25' }, TODAY)).toBe(true);
  });

  it('no full date and born 2008 still waits (the strict year rule, fail closed)', () => {
    expect(bodyPlayNeedsGrownUp({ dobYear: 2008 }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ dobYear: 2008, dob: null }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ dobYear: 2008, dob: undefined }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ band: '18+', dobYear: 2008 }, TODAY)).toBe(true);
  });

  it('a date never opens what the screen band closes, and a bad or mismatched date waits', () => {
    expect(bodyPlayNeedsGrownUp({ band: '13-17', dob: '1990-01-01' }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ band: 'under-13', dob: '1990-01-01' }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ band: 'unknown', dob: '1990-01-01' }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ dobYear: 1990, dob: '2008-03-05' }, TODAY)).toBe(true);   // year on file disagrees
    expect(bodyPlayNeedsGrownUp({ dobYear: 2008, dob: '2007-03-05' }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ dob: '2008-02-30' }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ dob: 'not a date' }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ dob: '2027-01-01' }, TODAY)).toBe(true);
    expect(bodyPlayNeedsGrownUp({ dob: '2012-03-05' }, TODAY)).toBe(true);
  });

  it('reads the page\'s held full date beside the held year', () => {
    forgetAgeForTests();
    try {
      setBodyPlayDobYear(2008);
      expect(bodyPlayNeedsGrownUp(readBodyPlayAge(null), TODAY)).toBe(true);
      setBodyPlayDob('2008-03-05');
      expect(readBodyPlayAge(null).dob).toBe('2008-03-05');
      expect(bodyPlayNeedsGrownUp(readBodyPlayAge(null), TODAY)).toBe(false);
      setBodyPlayDob('2008-12-25');
      expect(bodyPlayNeedsGrownUp(readBodyPlayAge(null), TODAY)).toBe(true);
      setBodyPlayDob(null);
      expect(bodyPlayNeedsGrownUp(readBodyPlayAge(null), TODAY)).toBe(true);
    } finally {
      setBodyPlayDob(undefined);
      setBodyPlayDobYear(undefined);
      forgetAgeForTests();
    }
  });
});
