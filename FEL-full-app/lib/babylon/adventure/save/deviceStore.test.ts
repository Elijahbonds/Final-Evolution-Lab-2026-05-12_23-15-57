// A3 device store and the teen rule (docs/ADVENTURE-PLAN.md "Data and saves"): the device copy round-trips, a corrupt
// document is backed up and refused, storage that throws never breaks the game, and a teen's save makes no network call.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyAdventureSave } from '../contracts';
import { createCreaturePartner, createCharacterPartner } from '../partner/defs';
import {
  ADVENTURE_SAVE_BACKUP_KEY, ADVENTURE_SAVE_KEY, ADVENTURE_SERVER_SAVE_ENABLED, adventureSavePolicy, deviceStorage,
  loadAdventureSave, storeAdventureSave, verifiedAdultFromCloset, verifiedAdultFromDob, type SaveStorage,
} from './index';

function memStorage(): SaveStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); } };
}
const throwing: SaveStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('the policy (the Creator\'s teen rule)', () => {
  it('a guest, a teen and an unknown age are device-only; an adult would sync once Phase B enables it', () => {
    expect(adventureSavePolicy({ signedIn: false })).toEqual({ device: true, server: false, reason: 'guest' });
    expect(adventureSavePolicy({ signedIn: true, verifiedAdult: false })).toMatchObject({ server: false, reason: 'teen-or-unknown' });
    expect(adventureSavePolicy({ signedIn: true, verifiedAdult: null })).toMatchObject({ server: false, reason: 'teen-or-unknown' });
    expect(adventureSavePolicy({ signedIn: true })).toMatchObject({ server: false, reason: 'teen-or-unknown' });
    expect(ADVENTURE_SERVER_SAVE_ENABLED).toBe(false);
    expect(adventureSavePolicy({ signedIn: true, verifiedAdult: true })).toMatchObject({ server: false, reason: 'server-not-enabled' });
  });

  it('reads verified adulthood the way the closet answers it (lookLocal), and the strict birth-year rule', () => {
    expect(verifiedAdultFromCloset({ lookLocal: false })).toBe(true);
    expect(verifiedAdultFromCloset({ lookLocal: true })).toBe(false);
    expect(verifiedAdultFromCloset({})).toBeNull();
    expect(verifiedAdultFromCloset(null)).toBeNull();
    const now = new Date('2026-10-06T00:00:00Z');
    expect(verifiedAdultFromDob(2010, now)).toBe(false);
    expect(verifiedAdultFromDob(2008, now)).toBe(false);   // an 18-year gap may still be 17: not verified
    expect(verifiedAdultFromDob(1990, now)).toBe(true);
    expect(verifiedAdultFromDob(null, now)).toBe(false);
  });
});

describe('the device store', () => {
  it('both partner kinds are created, stored and loaded back unchanged', () => {
    for (const partner of [
      createCreaturePartner({ id: 'pt', speciesId: 'strideraptor', name: 'Gale' })!,
      createCharacterPartner({ id: 'pt', creatorSlotId: 's3', element: 'ice', name: 'Rook' }),
    ]) {
      const storage = memStorage();
      const save = emptyAdventureSave(1);
      save.partner = partner;
      const stored = storeAdventureSave(save, { now: 1000, storage, policy: adventureSavePolicy({ signedIn: false }) });
      expect(stored.status).toBe('stored');
      expect(storage.map.has(ADVENTURE_SAVE_KEY)).toBe(true);
      const loaded = loadAdventureSave({ now: 2000, storage });
      expect(loaded.status).toBe('loaded');
      expect(loaded.save.partner).toEqual(partner);
      expect(loaded.save.updatedAt).toBe(1000);
    }
  });

  it('an empty device loads a fresh save', () => {
    expect(loadAdventureSave({ now: 9, storage: memStorage() })).toEqual({ save: emptyAdventureSave(9), status: 'empty' });
  });

  it('a corrupt document is refused, backed up, and replaced by a fresh save in memory (not on disk)', () => {
    const storage = memStorage();
    storage.setItem(ADVENTURE_SAVE_KEY, '{"version":1,"player":');
    const r = loadAdventureSave({ now: 5, storage });
    expect(r).toMatchObject({ status: 'corrupt', reason: 'junk' });
    expect(r.save).toEqual(emptyAdventureSave(5));
    expect(storage.map.get(ADVENTURE_SAVE_BACKUP_KEY)).toBe('{"version":1,"player":');
    expect(storage.map.get(ADVENTURE_SAVE_KEY)).toBe('{"version":1,"player":');   // untouched until the next store
    storage.setItem(ADVENTURE_SAVE_KEY, JSON.stringify({ ...emptyAdventureSave(1), version: 9 }));
    expect(loadAdventureSave({ now: 5, storage })).toMatchObject({ status: 'corrupt', reason: 'version' });
  });

  it('storage that throws (private mode, a full quota) or is missing never breaks the game', () => {
    expect(loadAdventureSave({ now: 1, storage: throwing }).status).toBe('unavailable');
    expect(loadAdventureSave({ now: 1, storage: null }).status).toBe('unavailable');
    const policy = adventureSavePolicy({ signedIn: false });
    expect(storeAdventureSave(emptyAdventureSave(1), { now: 1, storage: throwing, policy }).status).toBe('failed');
    expect(storeAdventureSave(emptyAdventureSave(1), { now: 1, storage: null, policy }).status).toBe('unavailable');
    vi.stubGlobal('localStorage', undefined);
    expect(deviceStorage()).toBeNull();
    vi.stubGlobal('localStorage', { get getItem() { throw new Error('SecurityError'); } });
    expect(deviceStorage()).toBeNull();
  });

  it('a save that is not a save is refused and nothing is written', () => {
    const storage = memStorage();
    const r = storeAdventureSave({ nope: true } as never, { now: 1, storage, policy: adventureSavePolicy({ signedIn: false }) });
    expect(r.status).toBe('refused');
    expect(storage.map.size).toBe(0);
  });
});

describe('a teen\'s save stays on the device', () => {
  it('makes no network call: neither fetch nor the uploader, even with an uploader passed in', () => {
    const fetchSpy = vi.fn(async () => new Response('{}'));
    vi.stubGlobal('fetch', fetchSpy);
    const xhr = vi.fn();
    vi.stubGlobal('XMLHttpRequest', xhr);
    const beacon = vi.fn();
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const remote = vi.fn(async () => undefined);
    const storage = memStorage();
    const save = emptyAdventureSave(1);
    save.partner = createCharacterPartner({ id: 'pt', creatorSlotId: 's2', element: 'light' });
    for (const policy of [
      adventureSavePolicy({ signedIn: true, verifiedAdult: false }),
      adventureSavePolicy({ signedIn: true, verifiedAdult: null }),
      adventureSavePolicy({ signedIn: false }),
    ]) {
      const r = storeAdventureSave(save, { now: 2, storage, policy, remote });
      expect(r).toMatchObject({ status: 'stored', remote: 'device-only' });
      loadAdventureSave({ now: 3, storage });
    }
    expect(remote).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(xhr).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });

  it('the uploader is reached only by a policy that allows the server (the Phase B path), and its failure keeps the device copy', async () => {
    const storage = memStorage();
    const remote = vi.fn(async () => { throw new Error('offline'); });
    const r = storeAdventureSave(emptyAdventureSave(1), { now: 2, storage, remote, policy: { device: true, server: true, reason: 'adult' } });
    expect(r).toMatchObject({ status: 'stored', remote: 'sent' });
    expect(remote).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(loadAdventureSave({ now: 3, storage }).status).toBe('loaded');
  });
});
