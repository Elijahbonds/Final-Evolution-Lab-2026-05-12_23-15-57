// RACE LOOK tests (PR #138, owner requirement): for under-18 and unknown-age players the race's hero wears
// ONLY what the phone holds, and NOTHING look-related leaves the device on the race path. The race-specific
// twin of PR #98's creator-side check (lib/creator/lookPrivacy.test.ts — 'a minor save request carries no
// look or equipped data at all'): that one pins what a minor's SAVE sends; this one pins what a minor's
// RACE reads and wears.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { invalidateIdentity, type PlayerIdentity } from '../core/playerIdentity';
import { defaultFace, defaultJersey } from '../../closet/wearable-catalog';
import { LOCAL_LOOK_KEY, type StoredLook } from '../../creator/localLook';
import { raceIdentityFromLocal, resolveRaceIdentity } from './raceLook';

const baseIdentity = (over: Partial<PlayerIdentity> = {}): PlayerIdentity => ({
  proportions: { heightScale: 1, buildScale: 1, reachScale: 1, palette: { skin: '#C68642', primary: '#00E5FF', accent: '#FFD700' }, stance: 'athletic' },
  face: defaultFace(),
  palette: { jersey: '#00E5FF', shorts: '#0b1220', shoes: '#A855F7', accent: '#FFD700' },
  jersey: null,
  wardrobe: { tops: null, shorts: null, shoes: null },
  custom: true,
  body: 'kit-male',
  card: null,
  lookLocal: true,
  ...over,
});

const localLook: StoredLook = {
  face: { ...defaultFace(), hairStyle: 'Braids', skinTone: '#8D5524' },
  heightScale: 96, buildScale: 108,
  equipped: { tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' },
  jersey: { number: 7, name: 'KID' },
};

describe('raceIdentityFromLocal: the device copy is the whole look', () => {
  it('face, frame numbers, worn items and the jersey plate come from the device, not the row', () => {
    const id = raceIdentityFromLocal(baseIdentity(), localLook);
    expect(id.face.hairStyle).toBe('Braids');
    expect(id.face.skinTone).toBe('#8D5524');
    expect(id.proportions?.heightScale).toBeCloseTo(0.96, 6);
    expect(id.proportions?.buildScale).toBeCloseTo(1.08, 6);
    expect(id.wardrobe).toEqual({ tops: 'top_lab', shorts: 'shorts_court', shoes: 'shoes_flight' });
    expect(id.jersey).toEqual({ number: 7, name: 'KID' });
  });
  it('the worn items re-derive the palette; the body kind and the card accent stay the server\'s', () => {
    const id = raceIdentityFromLocal(baseIdentity({ body: 'kit-female' }), localLook);
    expect(id.palette.jersey).not.toBe('#00E5FF');   // top_lab's own accent
    expect(id.palette.accent).toBe('#FFD700');        // unchanged — not look data the device overwrites
    expect(id.body).toBe('kit-female');
  });
  it('a sparse device copy falls back field by field', () => {
    const id = raceIdentityFromLocal(baseIdentity(), { heightScale: 104 });
    expect(id.face.hairStyle).toBe(defaultFace().hairStyle);   // no local face: the row's default stands
    expect(id.proportions?.heightScale).toBeCloseTo(1.04, 6);
    expect(id.proportions?.buildScale).toBe(1);
    expect(id.jersey).toBeNull();
  });
});

describe('resolveRaceIdentity: what the race reads, and what it never sends', () => {
  type Call = { url: string; method: string; hasBody: boolean };
  let calls: Call[] = [];
  let store: Map<string, string>;
  let realFetch: typeof globalThis.fetch;
  let hadWindow: boolean;

  const install = (closet: unknown, heroBody: unknown) => {
    calls = [];
    store = new Map();
    hadWindow = 'window' in globalThis;
    (globalThis as Record<string, unknown>).window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => { store.set(k, v); },
      },
    };
    realFetch = globalThis.fetch;
    (globalThis as Record<string, unknown>).fetch = async (url: unknown, init?: { method?: string; body?: unknown }) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', hasBody: init?.body != null });
      const u = String(url);
      const payload = u.includes('/api/v1/closet') ? closet : u.includes('/api/v1/hero-body') ? heroBody : null;
      return { ok: payload != null, json: async () => payload } as Response;
    };
    invalidateIdentity();
  };

  beforeEach(() => { /* per-test install */ });
  afterEach(() => {
    (globalThis as Record<string, unknown>).fetch = realFetch;
    if (hadWindow) delete (globalThis as Record<string, unknown>).window;
    invalidateIdentity();
  });

  it('a minor races in the phone\'s look — and the whole path is two GETs with no body', async () => {
    install(
      { look: { face: defaultFace(), equipped: {}, jersey: defaultJersey() }, lookLocal: true, owned: [], skins: [] },
      { body: 'kit-male', frame: { heightScale: 100, buildScale: 100 } },
    );
    store.set(LOCAL_LOOK_KEY, JSON.stringify(localLook));
    const id = await resolveRaceIdentity();
    expect(id.face.hairStyle).toBe('Braids');                  // the phone's face, not the row's default
    expect(id.proportions?.heightScale).toBeCloseTo(0.96, 6);  // the phone's frame numbers
    expect(id.jersey?.name).toBe('KID');                       // the phone's plate
    for (const c of calls) {
      expect(c.method).toBe('GET');
      expect(c.hasBody).toBe(false);
      expect(['/api/v1/closet', '/api/v1/hero-body']).toContain(c.url);
    }
    expect(calls.length).toBe(2);
  });

  it('an adult\'s identity is the server\'s — the device copy does not override it', async () => {
    install(
      { look: { face: { ...defaultFace(), hairStyle: 'Fade' }, equipped: {}, jersey: defaultJersey() }, lookLocal: false, owned: [], skins: [] },
      { body: 'kit-male', frame: null },
    );
    store.set(LOCAL_LOOK_KEY, JSON.stringify(localLook));
    const id = await resolveRaceIdentity();
    expect(id.face.hairStyle).toBe('Fade');
    expect(id.lookLocal).toBe(false);
    for (const c of calls) { expect(c.method).toBe('GET'); expect(c.hasBody).toBe(false); }
  });

  it('a minor with nothing saved locally races in the catalog defaults', async () => {
    install(
      { look: { face: defaultFace(), equipped: {} }, lookLocal: true, owned: [], skins: [] },
      { body: 'kit-male', frame: null },
    );
    const id = await resolveRaceIdentity();
    expect(id.face.hairStyle).toBe(defaultFace().hairStyle);
    for (const c of calls) { expect(c.method).toBe('GET'); expect(c.hasBody).toBe(false); }
  });

  it('an unknown-age player (closet unreachable) is treated as local-only and sends nothing', async () => {
    install(null, null);   // both GETs fail soft — the guest / offline path
    store.set(LOCAL_LOOK_KEY, JSON.stringify(localLook));
    const id = await resolveRaceIdentity();
    // guests were never uploading a look (custom stays false — defaults visually unchanged); the point
    // pinned here is the wire: read-only, no body, only the two known endpoints
    for (const c of calls) {
      expect(c.method).toBe('GET');
      expect(c.hasBody).toBe(false);
      expect(['/api/v1/closet', '/api/v1/hero-body']).toContain(c.url);
    }
    expect(id.custom).toBe(false);
  });
});

describe('the race modes wear the local look (source scan)', () => {
  const root = path.join(__dirname, '..', '..', '..');   // lib/babylon/racing → the app root
  for (const rel of ['lib/babylon/modes/VelocityKartMode.ts', 'lib/babylon/modes/AeroAcesMode.ts']) {
    it(`${rel} resolves the race identity before the hero spawns`, () => {
      const src = readFileSync(path.join(root, rel), 'utf8');
      expect(src, rel).toContain('resolveRaceIdentity');
      expect(src.indexOf('resolveRaceIdentity'), rel).toBeLessThan(src.indexOf('CharacterLibrary.spawn'));
    });
  }
  it('the race identity path carries no writes: no POST/PUT/PATCH/DELETE anywhere in it', () => {
    for (const rel of ['lib/babylon/racing/raceLook.ts', 'lib/babylon/core/playerIdentity.ts']) {
      const src = readFileSync(path.join(root, rel), 'utf8');
      expect(src, rel).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)/);
    }
  });
});
