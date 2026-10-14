// Track 3: a project character is a Closet share code; a venue casts it as its player; the export carries the decoded look;
// the mode wears it through playerIdentity — on the standard frame, presentation only.
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../babylon/scene/EnvironmentIBL', () => ({ mountEnvironmentIBL: () => () => {} }));

import { FreeCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { castIdentity, decodeCharacter, looksLikeCode, resolveCast, sanitizeCast, sanitizeCastMember, CODE_ERRORS } from './cast';
import { createStack, execute, undo } from './commands';
import { addCharacter, castCharacter, removeCharacter, renameCharacter } from './edits';
import { exportVenue, parseVenueExport, sanitizeVenueExport } from './exportVenue';
import { sanitizeProject } from './doc';
import { encodeInline } from './storage';
import { mountStudioFor, resetStudioVenueCache } from './runtime';
import { cachedIdentity, invalidateIdentity } from '../babylon/core/playerIdentity';
import { everyKindProject } from '@/tests/helpers/nexusStudio';
import { CAST_SLOT, castCode } from '@/tests/helpers/studioCast';
import { loadClosetLooks } from '@/components/nexus-studio/characters';

afterEach(() => { vi.unstubAllGlobals(); resetStudioVenueCache(); invalidateIdentity(); });

describe('a character is a share code', () => {
  it('decodes the Closet\'s own code: body, face, the Creator doc', async () => {
    const code = await castCode();
    expect(looksLikeCode(code)).toBe(true);
    const r = await decodeCharacter({ name: 'Nova', lookCode: code });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.member.body).toBe('female');
    expect(r.member.base).toMatchObject({ skinTone: '#33AA77', hairStyle: 'Ponytail' });
    expect(r.member.doc.parts).toHaveLength(1);
  });
  it('a damaged, foreign or empty code says why, and casts nothing', async () => {
    const code = await castCode();
    expect(await decodeCharacter({ name: 'x', lookCode: code.slice(0, -1) + (code.endsWith('a') ? 'b' : 'a') })).toEqual({ ok: false, error: CODE_ERRORS.corrupt });
    expect(await decodeCharacter({ name: 'x', lookCode: 'hello' })).toEqual({ ok: false, error: CODE_ERRORS.not_a_code });
    expect(await decodeCharacter({ name: 'x' })).toEqual({ ok: false, error: CODE_ERRORS.empty });
  });
});

describe('the identity a cast player wears (playerIdentity)', () => {
  it('the look and the kit colours; the standard frame (never the code\'s height or build); no worn items', async () => {
    const r = await decodeCharacter({ name: 'Nova', lookCode: await castCode() });
    if (!r.ok) throw new Error('decode');
    const id = castIdentity(r.member);
    expect(id.proportions).toBeNull();   // the code carries 1.06 / 1.1: a cast never changes the play frame
    expect(id.body).toBe('kit-female');
    expect(id.custom).toBe(true);
    expect(id.face.skinTone).toBe('#33AA77');
    expect(id.palette.jersey.toUpperCase()).toBe('#FF3366');
    expect(id.creator?.parts[0].shape).toBe('visor');
    expect(id.wardrobe).toEqual({ tops: null, shorts: null, shoes: null });
  });
});

describe('the project: characters and the venue\'s cast are commands', () => {
  it('add + cast is one step; rename coalesces; delete un-casts in the same step; undo restores each exactly', async () => {
    const p = everyKindProject();
    const v = p.venues[0];
    const code = await castCode();
    const add = addCharacter(p, { name: 'Nova\u0007', lookCode: code }, { venue: v, slot: 'player' });
    let s = execute(createStack(p), add.cmd);
    expect(s.past).toHaveLength(1);
    expect(s.doc.characters).toEqual([{ id: add.id, name: 'Nova', lookCode: code }]);
    expect(s.doc.venues[0].cast).toEqual({ player: add.id });
    s = execute(s, renameCharacter(add.id, 'N')); s = execute(s, renameCharacter(add.id, 'No'));
    expect(s.past).toHaveLength(2);
    const before = s.doc;
    s = execute(s, removeCharacter(s.doc, add.id)!);
    expect(s.doc.characters).toEqual([]);
    expect(s.doc.venues[0].cast).toBeUndefined();
    s = undo(s);
    expect(s.doc.characters).toEqual(before.characters);
    expect(s.doc.venues[0].cast).toEqual({ player: add.id });
    s = execute(s, castCharacter(s.doc.venues[0], 'player', null));
    expect(s.doc.venues[0].cast).toBeUndefined();
  });
  it('an imported project: a bad or truncated code is dropped whole; a cast naming a missing character is dropped', async () => {
    const p = everyKindProject();
    const code = await castCode();
    const raw = JSON.parse(JSON.stringify({ ...p, characters: [{ id: 'c1', name: 'ok', lookCode: code }, { id: 'c2', name: 'bad', lookCode: '<script>' }, { id: 'c3', name: 'long', lookCode: `FEL2.${'a'.repeat(60_000)}.abcdefg` }], venues: [{ ...p.venues[0], cast: { player: 'ghost' } }] }));
    const r = sanitizeProject(raw);
    if (!r.ok) throw new Error(r.error);
    expect(r.project.characters.map((c) => [c.id, !!c.lookCode])).toEqual([['c1', true], ['c2', false], ['c3', false]]);
    expect(r.project.venues[0].cast).toBeUndefined();
    const kept = sanitizeProject({ ...raw, venues: [{ ...p.venues[0], cast: { player: 'c1' } }] });
    expect(kept.ok && kept.project.venues[0].cast).toEqual({ player: 'c1' });
  });
});

describe('the export carries the decoded look; the mode re-sanitises it', () => {
  it('round-trips through JSON and the mode\'s sanitiser', async () => {
    const p = everyKindProject();
    const add = addCharacter(p, { name: 'Nova', lookCode: await castCode() }, { venue: p.venues[0], slot: 'player' });
    const doc = execute(createStack(p), add.cmd).doc;
    const cast = await resolveCast(doc, doc.venues[0]);
    expect(cast?.player?.name).toBe('Nova');
    const exp = exportVenue(doc.venues[0], cast);
    expect(parseVenueExport(JSON.stringify(exp))?.cast).toEqual(cast);
    expect(exportVenue(doc.venues[0]).cast).toBeUndefined();
  });
  it('a hostile cast is dropped (no doc, a doc that is not a doc), a good one keeps only the Closet\'s fields', async () => {
    expect(sanitizeCastMember({ name: 'x', body: 'female', base: {} })).toBeNull();
    expect(sanitizeCastMember({ doc: 'rm -rf', name: 'x' })).toBeNull();
    expect(sanitizeCast({ player: null, rival: {} })).toBeNull();
    const r = await decodeCharacter({ name: 'Nova', lookCode: await castCode() });
    if (!r.ok) throw new Error('decode');
    const m = sanitizeCastMember({ ...r.member, body: 'dragon', name: 'N\u0000ova', evil: () => 1, base: { ...r.member.base, skinTone: 'javascript:1' } })!;
    expect(m.body).toBe('male');
    expect(m.name).toBe('Nova');
    expect(m).not.toHaveProperty('evil');
    expect(m.base.skinTone).toBeUndefined();
    const exp = sanitizeVenueExport({ ...exportVenue(everyKindProject().venues[0]), cast: { player: { doc: 42 } } });
    expect(exp?.cast).toBeUndefined();
  });
});

describe('the mode\'s side: mountStudioFor seats the cast as the session identity before the mode spawns its hero', () => {
  it('primes castIdentity; dispose forgets it (the next mount resolves the player\'s own look)', async () => {
    const p = everyKindProject();
    p.venues[0].objects = [];   // a light venue: it rides the inline link
    const r = await decodeCharacter({ name: 'Nova', lookCode: await castCode() });
    if (!r.ok) throw new Error('decode');
    const exp = exportVenue(p.venues[0], { player: r.member });
    const inline = encodeInline(exp);
    expect(inline).not.toBeNull();
    vi.stubGlobal('window', { location: { search: `?venue=${inline}` } });
    const scene = new Scene(new NullEngine()); new FreeCamera('c', new Vector3(0, 2, -5), scene);
    expect(cachedIdentity()).toBeNull();
    const extras = mountStudioFor('tiebreak', { scene })!;
    expect(extras).not.toBeNull();
    expect(cachedIdentity()).toEqual(castIdentity(r.member));
    extras.dispose();
    expect(cachedIdentity()).toBeNull();
    scene.dispose();
  });
});

describe('the Closet\'s looks', () => {
  const face = { skinTone: '#000000', creatorSlots: [{ ...CAST_SLOT, id: 's1' }, { ...CAST_SLOT, id: 's2', label: 'ALT', body: 'male' }], activeSlot: 's1' };
  it('each saved look as a share code that decodes back to it', async () => {
    const looks = await loadClosetLooks(async () => ({ lookLocal: false, look: { face } }), () => null);
    expect(looks.map((l) => [l.label, l.body])).toEqual([['NOVA', 'female'], ['ALT', 'male']]);
    const r = await decodeCharacter({ name: 'x', lookCode: looks[0].code });
    expect(r.ok && r.member.base.skinTone).toBe('#33AA77');
  });
  it('a minor\'s look comes from the device copy, never the server row; a guest or a failure is an empty list', async () => {
    const device = vi.fn(() => ({ face }));
    const looks = await loadClosetLooks(async () => ({ lookLocal: true, look: { face: { creatorSlots: [] } } }), device);
    expect(device).toHaveBeenCalled();
    expect(looks).toHaveLength(2);
    expect(await loadClosetLooks(async () => null, () => null)).toEqual([]);
    expect(await loadClosetLooks(async () => { throw new Error('offline'); }, () => null)).toEqual([]);
  });
});
