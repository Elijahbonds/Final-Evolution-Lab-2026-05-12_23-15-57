// LIBRARY-ANATOMY-2 (2026-10-25): which library entry a row from elsewhere is, by name — exactly one, or none.
import { describe, expect, it } from 'vitest';
import { loadLibraryFiles } from './files';
import { matchLibraryByName } from './match';
import type { LibraryExercise } from './types';

const docs = loadLibraryFiles();
const entry = (id: string, name: string, aliases: string[] = [], status: LibraryExercise['review']['status'] = 'draft') =>
  ({ ...docs[0], id, slug: id, name, aliases, review: { ...docs[0].review, status } }) as LibraryExercise;

describe('matchLibraryByName', () => {
  it('the same words as an entry name, in any order or case, are that entry', () => {
    expect(matchLibraryByName(docs, ['Crocodile Breathing'])?.id).toBe('crocodile-breathing');
    expect(matchLibraryByName(docs, ['breathing  CROCODILE'])?.id).toBe('crocodile-breathing');
  });
  it('a near name is not a match (no guess): the caller shows the cue card', () => {
    expect(matchLibraryByName(docs, ['Single-Leg Pogo Hops'])).toBeNull();
    expect(matchLibraryByName(docs, ['Aston Postural Audit'])).toBeNull();
    expect(matchLibraryByName(docs, ['', null, undefined])).toBeNull();
  });
  it('an alias names its entry; two entries answering is no answer; a rejected entry never answers', () => {
    const set = [entry('a', 'Wall Slide', ['Wall Angel']), entry('b', 'Floor Slide'), entry('c', 'Floor Slide Two', ['Floor Slide']), entry('d', 'Old Thing', [], 'rejected')];
    expect(matchLibraryByName(set, ['wall angel'])?.id).toBe('a');
    expect(matchLibraryByName(set, ['Floor Slide'])).toBeNull();
    expect(matchLibraryByName(set, ['Wall Slide', 'Floor Slide Two'])).toBeNull();
    expect(matchLibraryByName(set, ['Old Thing'])).toBeNull();
    expect(matchLibraryByName(set, ['Wall Slide', 'Wall Angel'])?.id).toBe('a');
  });
});
