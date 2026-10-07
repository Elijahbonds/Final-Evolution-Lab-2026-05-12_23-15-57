// The real party and the real save (Phase B): the first-run pick (a creature or a character, the player's choice) is
// written to the DEVICE save under A3's policy — a teen's (or an unknown age's, or a guest's) save never leaves the
// device. The yard's `yard:` copy is never read or written here.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyAdventureSave } from '../contracts';
import { ADVENTURE_SAVE_KEY, ADVENTURE_SERVER_SAVE_ENABLED, type SaveStorage } from '../save';
/** The yard's own save prefix (modes/AdventureMode YARD_SAVE_PREFIX; not imported: the mode pulls in Babylon's scene code). */
const YARD_SAVE_PREFIX = 'yard:';
import {
  CHARACTER_ELEMENTS, creatureChoices, loadStorySave, partnerFromPick, policyFor, savePartnerPick, storeStorySave, STORY_PARTNER_ID,
} from './party';

const memStore = () => {
  const m = new Map<string, string>();
  const s: SaveStorage & { m: Map<string, string> } = { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); } };
  return s;
};

afterEach(() => vi.unstubAllGlobals());

describe('the first-run partner pick', () => {
  it('offers both kinds: the creature species (each with its element) and a character from a Creator slot', () => {
    expect(creatureChoices().map((c) => c.speciesId).sort()).toEqual(['cinderpup', 'gardenite', 'strideraptor']);
    expect(CHARACTER_ELEMENTS.length).toBe(8);
    const c = partnerFromPick({ kind: 'creature', speciesId: 'cinderpup', name: 'Ember' })!;
    expect(c).toMatchObject({ id: STORY_PARTNER_ID, kind: 'creature', element: 'fire', creature: { speciesId: 'cinderpup', stage: 0 }, bond: 0 });
    const h = partnerFromPick({ kind: 'character', creatorSlotId: 'slot-2', element: 'ice' })!;
    expect(h).toMatchObject({ kind: 'character', element: 'ice', character: { creatorSlotId: 'slot-2' } });
  });

  it('refuses a pick that names nothing real (an unknown species, a bad slot id, a bad element)', () => {
    expect(partnerFromPick({ kind: 'creature', speciesId: 'nope' })).toBeNull();
    expect(partnerFromPick({ kind: 'character', creatorSlotId: '../../etc', element: 'fire' })).toBeNull();
    expect(partnerFromPick({ kind: 'character', creatorSlotId: 'slot-1', element: 'plasma' as never })).toBeNull();
  });

  it('is stored in the real device save (never under the yard\'s prefix) and reads back sanitised', () => {
    const store = memStore();
    const r = savePartnerPick(emptyAdventureSave(1), { kind: 'creature', speciesId: 'gardenite' }, { now: 5, who: { signedIn: false }, storage: store })!;
    expect(r.result.status).toBe('stored');
    expect([...store.m.keys()]).toEqual([ADVENTURE_SAVE_KEY]);
    expect([...store.m.keys()].some((k) => k.startsWith(YARD_SAVE_PREFIX))).toBe(false);
    const back = loadStorySave(9, store);
    expect(back.status).toBe('loaded');
    expect(back.save.partner).toMatchObject({ kind: 'creature', creature: { speciesId: 'gardenite' } });
  });
});

describe('the save policy (A3\'s teen rule)', () => {
  it('a teen (the closet says lookLocal) and an unknown age are device-only; a guest too', () => {
    expect(policyFor({ signedIn: true, closet: { lookLocal: true } })).toEqual({ device: true, server: false, reason: 'teen-or-unknown' });
    expect(policyFor({ signedIn: true, closet: null })).toEqual({ device: true, server: false, reason: 'teen-or-unknown' });
    expect(policyFor({ signedIn: false })).toEqual({ device: true, server: false, reason: 'guest' });
  });

  it('a verified adult is device-only too until the owner applies the table (the server save is not enabled)', () => {
    expect(ADVENTURE_SERVER_SAVE_ENABLED).toBe(false);
    expect(policyFor({ signedIn: true, closet: { lookLocal: false } })).toMatchObject({ server: false, reason: 'server-not-enabled' });
  });

  it('a teen\'s pick and progress make no network call: the uploader is never called, fetch / beacon never touched', () => {
    const fetchSpy = vi.fn(), beacon = vi.fn(), remote = vi.fn(async () => undefined);
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('navigator', { sendBeacon: beacon });
    const store = memStore();
    const teen = { signedIn: true, closet: { lookLocal: true } };
    const r = savePartnerPick(emptyAdventureSave(1), { kind: 'character', creatorSlotId: 'slot-1', element: 'wind' }, { now: 2, who: teen, storage: store, remote })!;
    expect(r.result).toMatchObject({ status: 'stored', remote: 'device-only' });
    const s = storeStorySave({ ...r.result.save!, story: { ...r.result.save!.story, flags: { flightUnlocked: true } } }, { now: 3, who: teen, storage: store, remote });
    expect(s).toMatchObject({ status: 'stored', remote: 'device-only' });
    expect(remote).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(beacon).not.toHaveBeenCalled();
  });
});
