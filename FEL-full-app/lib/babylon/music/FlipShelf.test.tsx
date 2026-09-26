// MUSIC-SUITE P5 (2026-09-25): YOUR FILE behind "I made this or I own the rights" (owner decision #15), and what the
// shelf offers. Driven with the repo's no-DOM helpers (tests/helpers/driveRender.ts): the real component, its handlers.
import { describe, expect, it } from 'vitest';
import { drive, findAll } from '@/tests/helpers/driveRender';
import { FEL_SOURCES } from './Flip';
import { OWN_RIGHTS_TICK, UPLOAD_HINT, UploadPicker, shelfSources, uploadSourceMeta } from './FlipShelf';
import { migrateProject, newProject } from './StudioProject';
import type { PdEntry } from './pdShelf';
import { pdSources } from './pdShelf';

const byQa = (tree: unknown, qa: string) => findAll(tree as never, (el) => el.props['data-qa'] === qa);
const fakeFile = (name: string) => ({ name }) as unknown as File;

describe('YOUR FILE needs the tick first', () => {
  it('the picker is disabled until "I made this or I own the rights" is ticked, and says why before the pick', () => {
    const { html, tree } = drive(() => UploadPicker({ onFile: () => undefined }));
    expect(html).toContain(OWN_RIGHTS_TICK);
    expect(html).toContain(UPLOAD_HINT);
    expect(byQa(tree, 'own-rights')[0].props.checked).toBe(false);
    expect(byQa(tree, 'upload-file')[0].props.disabled).toBe(true);
    expect(byQa(tree, 'upload-label')[0].props['aria-disabled']).toBe(true);
  });

  it('an untick picker ignores a file that gets through anyway (nothing loads)', () => {
    const got: string[] = [];
    const { tree } = drive(() => UploadPicker({ onFile: (f) => got.push(f.name) }));
    byQa(tree, 'upload-file')[0].props.onChange({ target: { files: [fakeFile('beat.wav')], value: 'C:\\beat.wav' } });
    expect(got).toEqual([]);
  });

  it('ticked: the file loads, and the tick clears — every upload is its own statement', () => {
    const got: string[] = [];
    const { tree } = drive(() => UploadPicker({ onFile: (f) => got.push(f.name) }), [
      (t) => byQa(t, 'own-rights')[0].props.onChange({ target: { checked: true } }),
      (t) => { expect(byQa(t, 'upload-file')[0].props.disabled).toBe(false); byQa(t, 'upload-file')[0].props.onChange({ target: { files: [fakeFile('beat.wav')], value: 'x' } }); },
    ]);
    expect(got).toEqual(['beat.wav']);
    expect(byQa(tree, 'own-rights')[0].props.checked).toBe(false);
    expect(byQa(tree, 'upload-file')[0].props.disabled).toBe(true);
  });

  it('the upload keeps the statement in its note and decision #15\'s mark, through the project\'s door', () => {
    const meta = uploadSourceMeta('my very long file name that goes on and on.wav', Date.UTC(2026, 8, 26, 9));
    expect(meta).toMatchObject({ id: `own_${Date.UTC(2026, 8, 26, 9)}`, label: 'my very long file name that goes', upload: true });
    expect(meta.note).toBe(`Uploaded by the player, who ticked "${OWN_RIGHTS_TICK}" (2026-09-26).`);
    const p = newProject({ now: 1 });
    const src = { ...meta, kind: 'own' as const, audio: { key: 'aud_mfz1upl00001', mime: 'audio/wav', bytes: 9 } };
    const m = migrateProject(JSON.parse(JSON.stringify({ ...p, flip: { ...p.flip, source: src } })), { now: 2 });
    expect(m.ok && m.project.flip.source).toMatchObject({ upload: true, note: meta.note });
    expect(uploadSourceMeta('', 5).label).toBe('your file');
  });
});

describe('what the shelf offers', () => {
  it('FEL\'s pack, and public-domain entries only once the owner signs them (none today)', () => {
    expect(shelfSources()).toEqual(FEL_SOURCES);
    const signed: PdEntry = {
      id: 'x_1917', title: 'A 1917 record', performer: 'A band', year: 1917, sourceUrl: 'https://www.loc.gov/item/jukebox-example/',
      whyFree: 'A US recording published in 1917, public domain since 2022; the tune is traditional.', ownerSignedAt: '2026-09-27T10:00:00Z',
    };
    const all = shelfSources(pdSources([signed, { ...signed, id: 'y_1918', ownerSignedAt: null }]));
    expect(all.length).toBe(FEL_SOURCES.length + 1);
    expect(all[all.length - 1]).toMatchObject({ id: 'pd_x_1917', kind: 'public-domain', group: 'public-domain' });
  });
});
