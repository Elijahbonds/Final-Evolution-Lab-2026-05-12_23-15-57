// PIPELINES (owner, 2026-10-06): the Closet's "publish this look" and the end screen's "Make a card" open the guided
// fashion / sport setups, saying where the player came from.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublishLookAsCard } from './publish-look';
import { MakeSportCard } from './make-sport-card';
import { readEntry, SOURCE_LABEL } from '@/lib/create/flow';

describe('publish links', () => {
  it('Closet → /create/fashion?from=closet', () => {
    const html = renderToStaticMarkup(<PublishLookAsCard />);
    expect(html).toContain('href="/create/fashion?from=closet"');
    expect(html).toContain('Publish this look as a card');
    expect(readEntry(new URLSearchParams('from=closet')).from).toBe('closet');
    expect(SOURCE_LABEL.closet).toBe('your Closet');
  });
  it('End screen → /create/sport?from=end-screen', () => {
    const html = renderToStaticMarkup(<MakeSportCard title="Dunk 900" />);
    expect(html).toContain('href="/create/sport?from=end-screen&amp;title=Dunk+900"');
    expect(readEntry(new URLSearchParams('from=end-screen')).from).toBe('end-screen');
  });
  it('the Closet mounts it under Save Look', () => {
    const src = readFileSync(join(process.cwd(), 'components/closet-view.tsx'), 'utf8');
    expect(src.indexOf('<PublishLookAsCard />')).toBeGreaterThan(src.indexOf('Save Look'));
  });
});
