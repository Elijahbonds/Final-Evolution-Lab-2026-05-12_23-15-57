// Save / load (docs/NEXUS-STUDIO.md §2.1): the device keeps the project, a full or blocked storage says so instead of
// throwing, a corrupt blob opens nothing rather than a broken project, and the play-test hand-off round-trips.
import { describe, expect, it } from 'vitest';
import {
  PLAYTEST_PREFIX, PROJECT_KEY, INLINE_MAX, decodeInline, encodeInline, exportFile, loadProject, readPlaytest, saveProject, writePlaytest,
} from './storage';
import { parseProject } from './doc';
import { exportVenue } from './exportVenue';
import { everyKindProject, everyKindVenue, memoryKV, placed } from '@/tests/helpers/nexusStudio';

describe('the project on this device', () => {
  it('saves and loads back the same project', () => {
    const kv = memoryKV();
    const p = everyKindProject();
    const r = saveProject(kv, p);
    expect(r.ok).toBe(true);
    expect(kv.data.has(PROJECT_KEY)).toBe(true);
    expect(loadProject(kv)).toEqual(p);
  });

  it('a full storage is a quota message, a blocked one another message — never a throw', () => {
    const kv = memoryKV();
    kv.failWrites = 'quota';
    const q = saveProject(kv, everyKindProject());
    expect(q.ok).toBe(false);
    expect(!q.ok && q.error).toMatch(/out of room/);
    kv.failWrites = 'other';
    const o = saveProject(kv, everyKindProject());
    expect(!o.ok && o.error).toMatch(/could not be saved/);
    expect(saveProject(null, everyKindProject()).ok).toBe(false);
  });

  it('a read that throws, a missing key and a corrupt blob all open nothing', () => {
    const kv = memoryKV();
    expect(loadProject(kv)).toBeNull();
    kv.data.set(PROJECT_KEY, '{"kind":"nexus-studio-project","version":1,"venues":"oops"}');
    expect(loadProject(kv)).toBeNull();
    kv.data.set(PROJECT_KEY, '{not json');
    expect(loadProject(kv)).toBeNull();
    saveProject(kv, everyKindProject());
    kv.failReads = true;
    expect(loadProject(kv)).toBeNull();
    expect(loadProject(null)).toBeNull();
  });

  it('the export file is the project, named after it, and imports back to itself', () => {
    const p = { ...everyKindProject(), name: 'Night Court: Remix!' };
    const f = exportFile(p);
    expect(f.name).toBe('night-court-remix.nexus.json');
    const r = parseProject(f.text);
    expect(r.ok && r.project).toEqual(p);
  });
});

describe('the play-test hand-off', () => {
  it('writes the export under the venue id and the mode reads the same export back', () => {
    const kv = memoryKV();
    const exp = exportVenue(everyKindVenue());
    expect(writePlaytest(kv, exp).ok).toBe(true);
    expect(kv.data.has(PLAYTEST_PREFIX + exp.venueId)).toBe(true);
    expect(readPlaytest(kv, exp.venueId)).toEqual(exp);
  });

  it('a venue id that is not a plain id reads nothing (no key built from a crafted URL)', () => {
    const kv = memoryKV();
    expect(readPlaytest(kv, '../x')).toBeNull();
    expect(readPlaytest(kv, 'a'.repeat(65))).toBeNull();
  });

  it('a small venue rides a link inline and decodes to the same export', () => {
    const v = everyKindVenue();
    const exp = exportVenue(v);
    const code = encodeInline(exp);
    expect(code).not.toBeNull();
    expect(code!.startsWith('b64:')).toBe(true);
    expect(/^b64:[A-Za-z0-9_-]+$/.test(code!)).toBe(true);
    expect(decodeInline(code!)).toEqual(exp);
  });

  it('a big venue does not (the link would be cut), and a tampered link decodes to nothing or to a sanitised export', () => {
    const v = everyKindVenue();
    v.objects = Array.from({ length: 200 }, (_, i) => placed('kit:nature/tree_palmTall', [i, 0, i]));
    expect(encodeInline(exportVenue(v))).toBeNull();
    expect(decodeInline('b64:!!!')).toBeNull();
    expect(decodeInline('b64:' + 'A'.repeat(INLINE_MAX))).toBeNull();
    expect(decodeInline('nope')).toBeNull();
  });
});
