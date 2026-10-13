import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// NP-1 (Elijah rule): no "coming soon", "opens soon", "early version", "to be completed", "check back soon", "lorem" or
// "TBD" in user-facing text. These are the surfaces NP-1 fixed (unbuilt things hidden, not labelled); any of the
// phrases coming back in their source (comments included) fails here.
const PHRASES = /coming soon|opens soon|to be completed|check back soon|lorem ipsum|\bTBD\b/i;
const FIXED = [
  'app/coach/[slug]/page.tsx',
  'app/coach/[slug]/programs/[lane]/page.tsx',
  'app/program/[accessId]/page.tsx',
  'app/screen/program/[lane]/program-lane.tsx',
  'components/coach/exercise-demo.tsx',
  'components/camp/camp-view.tsx',
  'components/closet-view.tsx',
  'components/coach-store/book-form.tsx',
  'app/play/adventure/page.tsx',
  'app/play/adventure-br/page.tsx',
];

describe('NP-1 placeholder language', () => {
  for (const f of FIXED) {
    it(`${f} carries none of the placeholder phrases`, () => {
      expect(readFileSync(f, 'utf8')).not.toMatch(PHRASES);
    });
  }

  it('the creator hub hides unbuilt disciplines instead of labelling them', () => {
    const src = readFileSync('app/creator/_components/hub.tsx', 'utf8');
    expect(src).toContain('DISCIPLINES.filter((d) => d.href).map((d) =>');
    expect(src).not.toContain("'Coming soon'");
  });

  it('an unbuilt program lane is a 404, not a "coming soon" page', () => {
    expect(readFileSync('app/coach/[slug]/programs/[lane]/page.tsx', 'utf8')).toContain('if (coming) notFound();');
  });
});
