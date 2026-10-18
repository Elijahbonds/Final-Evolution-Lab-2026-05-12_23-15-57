import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

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
  // NP-1 pass 2
  'components/wallet/coin-store.tsx',
  'components/wallet/shard-store.tsx',
  'lib/wallet/purchases.ts',
  'components/season-pass-track.tsx',
  'components/shell/venue-shelf.tsx',
  'app/coach/_components/coach-chat.tsx',
  'components/studio/studio-shell.tsx',
];

describe('NP-1 placeholder language', () => {
  for (const f of FIXED) {
    it(`${f} carries none of the placeholder phrases`, () => {
      expect(readFileSync(f, 'utf8')).not.toMatch(PHRASES);
    });
  }

  it('the creator hub renders all nine disciplines and sends authoring tiles to their guided flows', () => {
    const src = readFileSync('app/creator/_components/hub.tsx', 'utf8');
    expect(src).toContain('DISCIPLINES.map((d) =>');
    for (const id of ['dance', 'acting', 'music', 'sport', 'art', 'scene', 'cooking', 'fashion', 'writing']) {
      expect(src).toContain(`id: '${id}'`);
    }
    for (const href of ['/create/art', '/create/scene', '/create/cooking', '/create/fashion', '/create/writing']) {
      expect(src).toContain(`href: '${href}'`);
    }
    expect(src).not.toContain("'Coming soon'");
  });

  it('an unbuilt program lane is a 404, not a "coming soon" page', () => {
    expect(readFileSync('app/coach/[slug]/programs/[lane]/page.tsx', 'utf8')).toContain('if (coming) notFound();');
  });

  it('the AI coming-soon panel is gone and nothing imports it', () => {
    expect(existsSync('components/ai-coming-soon.tsx')).toBe(false);
    expect(readFileSync('app/coach/_components/coach-chat.tsx', 'utf8')).not.toMatch(/AiComingSoon|ai-coming-soon/);
    expect(readFileSync('components/studio/studio-shell.tsx', 'utf8')).not.toMatch(/AiComingSoon|ai-coming-soon/);
  });

  it('coin and shard packs are hidden, not labelled, while purchases are off', () => {
    expect(readFileSync('components/wallet/coin-store.tsx', 'utf8')).toContain('{purchasesEnabled !== false && (');
    expect(readFileSync('components/wallet/shard-store.tsx', 'utf8')).toContain('{purchasesEnabled !== false && (');
  });

  it('season pass shows no buy control unless Pro is purchasable', () => {
    expect(readFileSync('components/season-pass-track.tsx', 'utf8')).toContain('!state.hasPro && state.proPurchasable && (');
  });

  it('the venue shelf only lists playable venues', () => {
    expect(readFileSync('components/shell/venue-shelf.tsx', 'utf8')).toContain('VENUES.filter((v) => v.playable).map(');
  });

  it('the Nova announcer line no longer says "opens soon"', () => {
    const raw = readFileSync('public/audio/voice/v1/nova/shared.json', 'utf8');
    expect(raw).not.toMatch(/opens soon/i);
    expect(raw).toContain('Brave flight. Next launch window: stay ready.');
  });
});
