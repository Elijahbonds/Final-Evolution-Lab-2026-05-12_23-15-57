import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { termsMarkdown } from '@/lib/legal/terms-markdown';
import { TERMS_CONTENT } from '@/lib/policies';

vi.mock('next-auth', () => ({ getServerSession: vi.fn(async () => null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/components/public-chrome', () => ({ PublicTopBar: () => null, PublicLegalFooter: () => null }));

import TermsPage from '@/app/terms/page';

// Words only: tags and all whitespace stripped, so adjacent blocks compare the same as the source.
const text = (html: string) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, '');

// TERMS-RENDER (FE PM 9:39 PM PT Oct 12): layout-only fixes to the /terms renderer.
describe('/terms renderer', () => {
  it('wraps each run of list items in its own <ul>, never swallowing headings or paragraphs', () => {
    const html = termsMarkdown('## A\n\n- one\n- two\n\nMiddle para.\n\n## B\n\n- three\n');
    expect(html.match(/<ul>/g)).toHaveLength(2);
    expect(html).toContain('<ul><li>one</li>\n<li>two</li></ul>');
    expect(html).toContain('<ul><li>three</li></ul>');
    for (const ul of html.match(/<ul>[\s\S]*?<\/ul>/g) ?? []) {
      expect(ul).not.toMatch(/<h[123]>|<p>/);
    }
  });

  it('italicises only _word-edge_ text, never snake_case, URLs or e-mail addresses', () => {
    const html = termsMarkdown('Use my_var and a_b_c at https://x.com/a_b_c or first_last@x.com, but _this_ is italic.');
    expect(html.match(/<em>/g)).toHaveLength(1);
    expect(html).toContain('<em>this</em>');
    expect(html).toContain('my_var and a_b_c at https://x.com/a_b_c or first_last@x.com');
  });

  it('the live page: every <li> sits in a <ul> with no heading inside, and the words are unchanged', async () => {
    const html = renderToStaticMarkup(await (TermsPage as () => Promise<React.ReactElement>)());
    for (const ul of html.match(/<ul>[\s\S]*?<\/ul>/g) ?? []) expect(ul).not.toMatch(/<h[123]>/);
    const liCount = (html.match(/<li>/g) ?? []).length;
    const inUl = (html.match(/<ul>[\s\S]*?<\/ul>/g) ?? []).reduce((n, ul) => n + (ul.match(/<li>/g) ?? []).length, 0);
    expect(inUl).toBe(liCount);
    const sourceWords = text(TERMS_CONTENT.replace(/^#+ |^- |^> |\*\*/gm, '').replace(/\*\*/g, ''));
    expect(text(html)).toContain(sourceWords);
  });
});
