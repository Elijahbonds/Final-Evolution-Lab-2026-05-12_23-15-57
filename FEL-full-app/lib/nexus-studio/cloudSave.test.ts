import { describe, expect, it } from 'vitest';
import {
  CLOUD_LIMITS, LOOK_CODES_IN_ACCOUNT, STUDIO_SAVE_AUDIENCE, canonicalJson, cloudSavePolicy, jsonBytes, keepBoth, mergeProjects,
  prepareUpload, projectFingerprint, quotaCheck, restoreLookCodes, stripLookCodes, syncAction, type SyncRecord,
} from './cloudSave';
import { LIMITS, STUDIO_DOC_VERSION, type StudioProject } from './doc';
import { everyKindProject, everyKindVenue, placed } from '@/tests/helpers/nexusStudio';

const NOW = new Date('2026-10-17T12:00:00Z');
const CODE = 'FEL2.' + 'Ab9_-'.repeat(20) + '.abc1234';
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** The test project with two characters (each with a look code) and a cast. */
function withCast(): StudioProject {
  const p = everyKindProject();
  p.characters = [{ id: 'char_a', name: 'Nova', lookCode: CODE }, { id: 'char_b', name: 'Rook', lookCode: CODE }];
  p.venues[0].cast = { player: 'char_a', crowd: ['char_b'] };
  return p;
}
const year = (age: number) => NOW.getFullYear() - age;

describe('who may save to the account', () => {
  it('ships the recommended defaults: verified adults only, look codes stay on the device', () => {
    expect(STUDIO_SAVE_AUDIENCE).toBe('adults');
    expect(LOOK_CODES_IN_ACCOUNT).toBe(false);
  });

  it('a guest, an unknown age and an under-13 are never allowed', () => {
    expect(cloudSavePolicy({ signedIn: false, dobYear: year(40), now: NOW })).toEqual({ allowed: false, reason: 'guest' });
    for (const dobYear of [null, undefined, 1850, year(-1), 2000.5]) {
      expect(cloudSavePolicy({ signedIn: true, dobYear, now: NOW, audience: 'teens-and-adults' }).allowed).toBe(false);
    }
    expect(cloudSavePolicy({ signedIn: true, dobYear: year(12), now: NOW, audience: 'teens-and-adults' })).toEqual({ allowed: false, reason: 'age' });
    expect(cloudSavePolicy({ signedIn: true, dobYear: year(13), now: NOW, audience: 'teens-and-adults' }).allowed).toBe(false);
  });

  it('a verified adult may; a teen only when the audience includes teens', () => {
    expect(cloudSavePolicy({ signedIn: true, dobYear: year(19), now: NOW })).toEqual({ allowed: true, reason: 'ok' });
    expect(cloudSavePolicy({ signedIn: true, dobYear: year(16), now: NOW })).toEqual({ allowed: false, reason: 'age' });
    // a year gap of exactly 18 may still be 17: not verified 18+
    expect(cloudSavePolicy({ signedIn: true, dobYear: year(18), now: NOW }).allowed).toBe(false);
    expect(cloudSavePolicy({ signedIn: true, dobYear: year(16), now: NOW, audience: 'teens-and-adults' }).allowed).toBe(true);
  });
});

describe('what an account copy holds', () => {
  it('passes the import gate, keeps the id, strips every look code and counts them', () => {
    const p = withCast();
    const r = prepareUpload(clone(p), { projectId: p.id, now: NOW });
    if (!r.ok) throw new Error(r.error);
    expect(r.stripped).toBe(2);
    expect(r.project.characters).toEqual([{ id: 'char_a', name: 'Nova' }, { id: 'char_b', name: 'Rook' }]);
    expect(JSON.stringify(r.project)).not.toContain('FEL2.');
    // the cast still names its characters, so a pull and restoreLookCodes bring the venue back whole
    expect(r.project.venues[0].cast).toEqual({ player: 'char_a', crowd: ['char_b'] });
    expect(r.bytes).toBe(jsonBytes(r.project));
  });

  it('keeps look codes only when told to (owner decision Q2, the other answer)', () => {
    const p = withCast();
    const r = prepareUpload(clone(p), { projectId: p.id, keepLookCodes: true, now: NOW });
    expect(r.ok && r.stripped === 0 && r.project.characters.every((c) => c.lookCode === CODE)).toBe(true);
  });

  it('stores only what the sanitiser keeps: unknown keys and kinds never reach a row', () => {
    const p = clone(everyKindProject()) as StudioProject & Record<string, unknown>;
    p.email = 'someone@example.com';
    (p.venues[0].objects as unknown[]).push({ id: 'x1', type: 'script-tag', name: '<script>', t: { p: [0, 0, 0], ry: 0, s: 1 } });
    const r = prepareUpload(p, { projectId: p.id, now: NOW });
    if (!r.ok) throw new Error(r.error);
    expect(r.dropped).toBe(1);
    expect(JSON.stringify(r.project)).not.toMatch(/someone@|script-tag/);
  });

  it('refuses what is not a project, a newer version, and a body for another id', () => {
    expect(prepareUpload('nope', { projectId: 'p1' })).toMatchObject({ ok: false, status: 422, error: 'invalid_project' });
    const newer = { ...clone(everyKindProject()), version: STUDIO_DOC_VERSION + 1 };
    expect(prepareUpload(newer, { projectId: newer.id })).toMatchObject({ ok: false, status: 422, error: 'invalid_project' });
    const p = everyKindProject();
    expect(prepareUpload(clone(p), { projectId: 'proj_other' })).toEqual({ ok: false, status: 400, error: 'id_mismatch' });
  });

  it('measures the cap after sanitising, in UTF-8 bytes', () => {
    expect(jsonBytes({ n: 'é' })).toBe(JSON.stringify({ n: 'e' }).length + 1);
    const p = everyKindProject();
    p.venues = Array.from({ length: 14 }, (_, i) => {
      const v = everyKindVenue();
      v.id = `venue_${i}`;
      v.objects = Array.from({ length: LIMITS.objects }, (_, k) => placed('kit:nature/tree_palmTall', [k % 300 - 150, 0, i], k * 0.01));
      return v;
    });
    p.activeVenueId = 'venue_0';
    expect(jsonBytes(p)).toBeGreaterThan(CLOUD_LIMITS.projectBytes);
    expect(prepareUpload(clone(p), { projectId: p.id, now: NOW })).toEqual({ ok: false, status: 413, error: 'project_too_large' });
    p.venues = p.venues.slice(0, 4);
    expect(prepareUpload(clone(p), { projectId: p.id, now: NOW }).ok).toBe(true);
  });

  it('restoreLookCodes puts this device\'s codes back by character id, and never over a code the copy has', () => {
    const device = withCast();
    const { project: server } = stripLookCodes(device);
    expect(restoreLookCodes(server, device).characters).toEqual(device.characters);
    expect(restoreLookCodes(server, null)).toBe(server);
    const other = { ...server, characters: [{ id: 'char_a', name: 'Nova', lookCode: 'FEL1.zz.abc1234' }, { id: 'char_c', name: 'New' }] };
    expect(restoreLookCodes(other, device).characters).toEqual([{ id: 'char_a', name: 'Nova', lookCode: 'FEL1.zz.abc1234' }, { id: 'char_c', name: 'New' }]);
    expect(stripLookCodes(everyKindProject()).stripped).toBe(0);
  });
});

describe('quota', () => {
  const L = { projects: 3, accountBytes: 1000 };
  it('a new project counts once; the count and the bytes are each a ceiling', () => {
    expect(quotaCheck([], { projectId: 'a', bytes: 400 }, L)).toEqual({ ok: true, countAfter: 1, bytesAfter: 400 });
    const three = [{ projectId: 'a', bytes: 100 }, { projectId: 'b', bytes: 100 }, { projectId: 'c', bytes: 100 }];
    expect(quotaCheck(three, { projectId: 'd', bytes: 1 }, L)).toMatchObject({ ok: false, error: 'quota_projects', countAfter: 4 });
    expect(quotaCheck(three.slice(0, 2), { projectId: 'd', bytes: 801 }, L)).toMatchObject({ ok: false, error: 'quota_bytes', bytesAfter: 1001 });
    expect(quotaCheck(three.slice(0, 2), { projectId: 'd', bytes: 800 }, L).ok).toBe(true);
  });
  it('replacing a project counts only the change, and a smaller save always goes through', () => {
    const over = [{ projectId: 'a', bytes: 900 }, { projectId: 'b', bytes: 300 }];
    expect(quotaCheck(over, { projectId: 'a', bytes: 950 }, L)).toMatchObject({ ok: false, error: 'quota_bytes', bytesAfter: 1250 });
    expect(quotaCheck(over, { projectId: 'a', bytes: 850 }, L)).toEqual({ ok: true, countAfter: 2, bytesAfter: 1150 });
    expect(quotaCheck([{ projectId: 'a', bytes: 500 }], { projectId: 'a', bytes: 600 }, L)).toEqual({ ok: true, countAfter: 1, bytesAfter: 600 });
  });
  it('the shipped caps hold a typical project many times over', () => {
    expect(CLOUD_LIMITS.accountBytes / CLOUD_LIMITS.projects).toBeGreaterThanOrEqual(400_000);
    expect(CLOUD_LIMITS.bodyBytes).toBeGreaterThan(CLOUD_LIMITS.projectBytes);
  });
});

describe('two devices', () => {
  it('the fingerprint ignores updatedAt and key order, and moves on a real edit', () => {
    const p = everyKindProject();
    const f = projectFingerprint(p);
    expect(projectFingerprint({ ...p, updatedAt: '2030-01-01T00:00:00.000Z' })).toBe(f);
    const reordered = JSON.parse(canonicalJson(p)) as StudioProject;
    expect(Object.keys(reordered)).not.toEqual(Object.keys(p));
    expect(projectFingerprint(reordered)).toBe(f);
    const edited = clone(p); edited.venues[0].objects[0].t.p[0] += 0.5;
    expect(projectFingerprint(edited)).not.toBe(f);
  });

  it('syncAction covers every case', () => {
    const p = everyKindProject();
    const rec: SyncRecord = { projectId: p.id, rev: 4, fingerprint: projectFingerprint(p) };
    const edited = clone(p); edited.name = 'Renamed';
    expect(syncAction(null, null, null)).toEqual({ kind: 'none' });
    expect(syncAction(null, rec, { rev: 4 })).toEqual({ kind: 'pull' });
    expect(syncAction(p, null, null)).toEqual({ kind: 'create' });
    expect(syncAction(p, null, { rev: 1 })).toEqual({ kind: 'conflict', base: 'unknown' });
    expect(syncAction(p, rec, null)).toEqual({ kind: 'deleted-elsewhere' });
    expect(syncAction(p, rec, { rev: 4 })).toEqual({ kind: 'none' });
    expect(syncAction(edited, rec, { rev: 4 })).toEqual({ kind: 'push', baseRev: 4 });
    expect(syncAction(p, rec, { rev: 5 })).toEqual({ kind: 'pull' });
    expect(syncAction(edited, rec, { rev: 5 })).toEqual({ kind: 'conflict', base: 'known' });
    // only updatedAt moved: not an edit
    expect(syncAction({ ...p, updatedAt: NOW.toISOString() }, rec, { rev: 4 })).toEqual({ kind: 'none' });
  });

  it('keepBoth makes a new project with this device\'s work, its name inside the limit', () => {
    const p = everyKindProject();
    p.name = 'x'.repeat(LIMITS.name);
    const k = keepBoth(p, NOW);
    expect(k.id).not.toBe(p.id);
    expect(k.name.length).toBeLessThanOrEqual(LIMITS.name);
    expect(k.name.endsWith(' (this device)')).toBe(true);
    expect(k.venues).toEqual(p.venues);
    expect(k.createdAt).toBe(NOW.toISOString());
  });
});

describe('three-way merge', () => {
  const base = () => withCast();

  it('edits to different things merge, from both sides', () => {
    const b = base();
    const mine = clone(b); mine.venues[0].objects[0].t.p = [3, 0, 3];
    const theirs = clone(b); theirs.venues[0].mood = 'dusk'; theirs.characters.push({ id: 'char_c', name: 'Vale' });
    theirs.venues[0].objects.push(placed('fixture:lamp', [5, 0, 5]));
    const r = mergeProjects(b, mine, theirs, NOW);
    if (!r.ok) throw new Error(r.conflicts.join());
    expect(r.project.venues[0].objects[0].t.p).toEqual([3, 0, 3]);
    expect(r.project.venues[0].mood).toBe('dusk');
    expect(r.project.characters.map((c) => c.id)).toEqual(['char_a', 'char_b', 'char_c']);
    expect(r.project.venues[0].objects).toHaveLength(b.venues[0].objects.length + 1);
    expect(r.fromTheirs).toBe(3);
    expect(r.project.updatedAt).toBe(NOW.toISOString());
  });

  it('the same edit on both sides, and the same delete, are not conflicts', () => {
    const b = base();
    const mine = clone(b); mine.venues[0].weather = 'snow'; mine.venues[0].objects.splice(1, 1);
    const theirs = clone(mine);
    const r = mergeProjects(b, mine, theirs, NOW);
    expect(r.ok && r.project.venues[0].weather === 'snow' && r.project.venues[0].objects.length === b.venues[0].objects.length - 1).toBe(true);
  });

  it('a delete on one side and nothing on the other is a delete', () => {
    const b = base();
    const theirs = clone(b); theirs.scripts = []; const gone = theirs.venues[0].objects.shift()!;
    const r = mergeProjects(b, clone(b), theirs, NOW);
    expect(r.ok && !r.project.venues[0].objects.some((o) => o.id === gone.id)).toBe(true);
  });

  it('the same thing changed differently is a conflict, named, and never decided for the creator', () => {
    const b = base();
    const id = b.venues[0].objects[2].id;
    const mine = clone(b); mine.venues[0].objects[2].t.ry = 1;
    const theirs = clone(b); theirs.venues[0].objects[2].t.ry = 2; theirs.name = 'Theirs';
    expect(mergeProjects(b, mine, theirs, NOW)).toEqual({ ok: false, conflicts: [`obj/${b.venues[0].id}/${id}`] });
    const both = clone(mine); both.name = 'Mine';
    expect(mergeProjects(b, both, theirs, NOW)).toEqual({ ok: false, conflicts: ['meta', `obj/${b.venues[0].id}/${id}`] });
  });

  it('an edit against a delete is a conflict', () => {
    const b = base();
    const mine = clone(b); mine.venues[0].objects[0].name = 'Kept and renamed';
    const theirs = clone(b); theirs.venues[0].objects.shift();
    expect(mergeProjects(b, mine, theirs, NOW)).toEqual({ ok: false, conflicts: [`obj/${b.venues[0].id}/${b.venues[0].objects[0].id}`] });
  });

  it('an object added to a venue the other side deleted is a conflict', () => {
    const b = base();
    const second = everyKindVenue(); second.objects = [];
    b.venues.push(second);
    const mine = clone(b); mine.venues[1].objects.push(placed('fixture:lamp', [1, 0, 1]));
    const theirs = clone(b); theirs.venues.pop();
    expect(mergeProjects(b, mine, theirs, NOW)).toEqual({ ok: false, conflicts: [`venue/${second.id}`] });
  });

  it('a cast that names a character the other side deleted is a conflict, not a silent drop', () => {
    const b = base();
    b.venues[0].cast = { player: 'char_a' };
    const mine = clone(b); mine.venues[0].cast = { player: 'char_a', crowd: ['char_b'] };
    const theirs = clone(b); theirs.characters = theirs.characters.filter((c) => c.id !== 'char_b');
    expect(mergeProjects(b, mine, theirs, NOW)).toEqual({ ok: false, conflicts: [`cast/${b.venues[0].id}`] });
  });

  it('a merge past the doc LIMITS is a conflict, because the sanitiser would drop the overflow', () => {
    const b = everyKindProject();
    const v = b.venues[0];
    while (v.objects.length < LIMITS.objects - 1) v.objects.push(placed('decal:scuff', [v.objects.length % 100, 0, 1]));
    const mine = clone(b); mine.venues[0].objects.push(placed('decal:scuff', [1, 0, 2]));
    const theirs = clone(b); theirs.venues[0].objects.push(placed('decal:scuff', [2, 0, 2]));
    expect(mergeProjects(b, mine, theirs, NOW)).toEqual({ ok: false, conflicts: ['limits'] });
  });

  it('key order is not an edit, a reorder is kept, and a project without stamps stays without', () => {
    const b = base();
    const second = everyKindVenue(); b.venues.push(second);
    const mine = JSON.parse(canonicalJson(b)) as StudioProject;
    mine.venues.reverse();
    const theirs = clone(b); theirs.venues[0].objects.push(placed('fixture:lamp', [1, 0, 1]));
    const r = mergeProjects(b, mine, theirs, NOW);
    if (!r.ok) throw new Error(r.conflicts.join());
    expect(r.project.venues.map((x) => x.id)).toEqual(mine.venues.map((x) => x.id));
    expect(r.fromTheirs).toBe(1);
    expect('stamps' in r.project).toBe(false);
  });

  it('two different projects never merge', () => {
    const b = base();
    expect(mergeProjects(b, b, keepBoth(b, NOW), NOW)).toEqual({ ok: false, conflicts: ['project'] });
  });
});
