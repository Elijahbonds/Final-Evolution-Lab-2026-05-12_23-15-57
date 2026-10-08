// PIPELINES (owner, 2026-10-06): community writing as Knowledge Feed fact cards — credited, never a URL.
import { describe, expect, it } from 'vitest';
import { feedCardOf, feedCardsOf, stripUrls } from './feedCommunity';

const read = (over = {}) => ({ cardId: 'w1', title: 'Dawn court', creator: { name: 'Ari', href: '/card/ari' }, excerpt: 'The court at dawn. See https://evil.test/x and www.spam.io', text: '', more: false, ...over });

describe('community feed cards', () => {
  it('a fact card with a creator source line, a stable id, the book motif', () => {
    expect(feedCardOf(read())).toEqual({
      id: 'community.w1', topic: 'community', type: 'fact', source: 'by Ari — FEL Creator Card',
      headline: 'Dawn court', text: 'The court at dawn. See and', visual: { kind: 'motif', motif: 'book' },
    });
  });
  it('never carries a URL anywhere, not even the creator link', () => {
    const c = feedCardOf(read({ title: 'Go to bit.ly/abc now', creator: { name: 'x.com', href: '/card/x' } }))!;
    expect(JSON.stringify(c)).not.toMatch(/https?:|www\.|bit\.ly|\/card\//);
    expect(stripUrls('a http://b.c d')).toBe('a d');
  });
  it('a read that is nothing but a link is dropped', () => {
    expect(feedCardsOf([read({ excerpt: 'https://x.test' }), read({ cardId: 'w2' })]).map((c) => c.id)).toEqual(['community.w2']);
  });
});
