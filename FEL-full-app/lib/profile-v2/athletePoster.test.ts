import { describe, it, expect } from 'vitest';
import {
  DEVICE_LOOK_KEY, POSTER_MAX_H, POSTER_MAX_W, hash64, identityHash, ownerKey, posterCrop, posterHash, posterStale,
  posterUsable, serverLookStamp, snapshotScaling,
} from './athletePoster';
import { LOCAL_LOOK_KEY } from '@/lib/creator/localLook';
import { dropPoster, readPoster, writePoster } from './posterStore';

// PROFILE-CHARACTER: the kept picture of the player's athlete is this account's and this look's, and never anything else.
describe('the athlete poster key', () => {
  it('is per account, short, and not the raw id', () => {
    const a = ownerKey('cku1abc'), b = ownerKey('cku1abd');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(a).not.toBe(b);
    expect(a).not.toContain('cku1abc');
    expect(ownerKey('cku1abc')).toBe(a);   // stable across visits
  });

  it('changes with every look save the server sees (the look row, the build row)', () => {
    const t0 = new Date('2026-10-20T10:00:00Z');
    const base = serverLookStamp(t0, null);
    expect(serverLookStamp(new Date(t0.getTime() + 1), null)).not.toBe(base);   // a Closet save one millisecond later
    expect(serverLookStamp(t0, t0)).not.toBe(base);                            // an Athlete Creator save
    expect(serverLookStamp(t0.toISOString(), null)).toBe(base);                // a date that crossed the wire as a string
    expect(serverLookStamp(null, null)).toBe(serverLookStamp(undefined, 'not a date'));   // no rows: one stable stamp
  });

  it('changes with the device copy of the look (a teen saves on this phone only)', () => {
    const s = serverLookStamp(null, null);
    const none = posterHash(s, null);
    const one = posterHash(s, JSON.stringify({ face: { hairStyle: 'Locs' } }));
    const two = posterHash(s, JSON.stringify({ face: { hairStyle: 'Afro' } }));
    expect(new Set([none, one, two]).size).toBe(3);
  });

  it('reads the same device key the Creator writes', () => {
    expect(DEVICE_LOOK_KEY).toBe(LOCAL_LOOK_KEY);
  });

  it('hashes an identity by value, not by key order', () => {
    const a = { body: 'kit-male', palette: { jersey: '#FFD700', shorts: '#FF3366' }, face: { hairStyle: 'Locs' }, fn: () => 1, gone: undefined };
    const b = { face: { hairStyle: 'Locs' }, palette: { shorts: '#FF3366', jersey: '#FFD700' }, body: 'kit-male' };
    expect(identityHash(a)).toBe(identityHash(b));
    expect(identityHash({ ...b, body: 'kit-female' })).not.toBe(identityHash(b));
    expect(identityHash(null)).toBe(hash64('null'));
  });
});

describe('when a kept picture is shown, and when it is re-taken', () => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
  it('shows only the same look, with a picture in it', () => {
    expect(posterUsable({ hash: 'h1', blob }, 'h1')).toBe(true);
    expect(posterUsable({ hash: 'h0', blob }, 'h1')).toBe(false);   // the look changed: never yesterday's clothes
    expect(posterUsable({ hash: 'h1', blob: new Blob([]) }, 'h1')).toBe(false);
    expect(posterUsable(null, 'h1')).toBe(false);
  });
  it('re-takes it when nothing is kept, the look moved, or the 3D wore a different identity', () => {
    expect(posterStale(null, 'h1', 'i1')).toBe(true);
    expect(posterStale({ hash: 'h0', idHash: 'i1' }, 'h1', 'i1')).toBe(true);
    expect(posterStale({ hash: 'h1', idHash: 'i0' }, 'h1', 'i1')).toBe(true);
    expect(posterStale({ hash: 'h1', idHash: 'i1' }, 'h1', 'i1')).toBe(false);   // a repeat visit writes nothing
  });
});

describe('the picture is the athlete, at most 400 × 600', () => {
  it('a phone stage (196 × 208 css at DPR 2, rendered for the snapshot at 600 px tall): a full-height 2:3 column, centred', () => {
    const scale = snapshotScaling(208, 0.5);
    expect(scale).toBeCloseTo(208 / 600, 5);
    const c = posterCrop(196 / scale, 208 / scale);
    expect(c.sh).toBe(600); expect(c.sy).toBe(0);
    expect(c.sw).toBe(400); expect(c.sx).toBe(Math.round((196 / scale - 400) / 2));
    expect([c.w, c.h]).toEqual([400, 600]);
  });
  it('a desktop stage at DPR 1: scaled down to 400 × 600, never up', () => {
    const c = posterCrop(1100, 900);
    expect(c.sh).toBe(900); expect(c.sw).toBe(600);
    expect([c.w, c.h]).toEqual([POSTER_MAX_W, POSTER_MAX_H]);
    const small = posterCrop(300, 150);
    expect([small.w, small.h]).toEqual([100, 150]);
  });
  it('a canvas narrower than 2:3 keeps its width and a centred 2:3 band', () => {
    const c = posterCrop(100, 400);
    expect(c.sw).toBe(100); expect(c.sh).toBe(150); expect(c.sy).toBe(125);
  });
  it('never renders the snapshot coarser than the live view', () => {
    expect(snapshotScaling(900, 0.5)).toBe(0.5);   // a 900 px stage already has more than 600 px at DPR 2
    expect(snapshotScaling(0, 0.5)).toBe(0.5);
  });
});

describe('the device store, where there is no IndexedDB (a server, a locked-down browser)', () => {
  it('answers "nothing kept" and never throws', async () => {
    expect(typeof indexedDB).toBe('undefined');
    await expect(readPoster('k')).resolves.toBeNull();
    await expect(writePoster('k', { hash: 'h', idHash: 'i', blob: new Blob(['x']), w: 1, h: 1, at: 0 })).resolves.toBe(false);
    await expect(dropPoster('k')).resolves.toBeUndefined();
  });
});
