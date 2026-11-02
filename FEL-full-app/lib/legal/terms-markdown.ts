// terms-markdown — the small markdown renderer behind /terms (moved out of app/terms/page.tsx so it can be tested; a
// Next page file may only export its page). Layout only: it never changes the words, only the tags around them.
// TERMS-RENDER (FE PM 9:39 PM PT Oct 12) fixed two bugs from the old inline version:
//  1. List wrap: one greedy <ul> ran from the first list item to the last one on the whole page, swallowing every
//     heading and paragraph between them. Now each run of consecutive items gets its own <ul>.
//  2. Stray italics: any two underscores anywhere (snake_case, URLs, e-mail local parts) turned the text between them
//     into <em>. Now _text_ is italic only when the underscores stand at word edges.

// PUBLIC-POLISH (2026-11-02, live sweep J9) added two more, still layout only (tests/legal/terms-render.test.tsx holds
// that the words are unchanged):
//  3. Soft wraps: TERMS_CONTENT (lib/policies.ts) is hard-wrapped mid-sentence in §1, §4 and §5 ("…you agree to" /
//     "these Terms of Service…"), and every line became its own <p>, so the sentence broke into two paragraphs. A line
//     that starts lower-case continues the line before it, so the two are joined with a space. The policy text is not
//     edited: a whitespace change there moves its fingerprint and needs a new CURRENT_POLICY_VERSION, which is the
//     owner's. Lines that start upper-case keep their own line (the §9 contact block is name / email / mail on purpose).
//  4. Links: the bare paths the text names (/purchase-terms, /coach-terms, /store-terms …) become links to themselves.
//     The link text is the path exactly as written.
const LINKED_PATHS = ['/purchase-terms', '/coach-terms', '/store-terms', '/screen/privacy', '/privacy', '/terms', '/support', '/credits'];
const PATH_RE = new RegExp(`(^|[\\s(])(${LINKED_PATHS.map((p) => p.replace(/[/-]/g, '\\$&')).join('|')})(?=$|[\\s.,;:!?)])`, 'gm');

export function termsMarkdown(md: string): string {
  return md
    .replace(/([^\n])\n[ \t]*(?=[a-z])/g, '$1 ')
    .replace(PATH_RE, '$1<a href="$2">$2</a>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^> (.+)$/gm, '<blockquote><p>$1</p></blockquote>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(>])_([^_\n]+?)_(?=$|[\s.,;:!?)<])/gm, '$1<em>$2</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/^<li>.*<\/li>(?:\n<li>.*<\/li>)*$/gm, (run) => `<ul>${run}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<)(.+)$/gm, '<p>$1</p>')
    .replace(/<p><\/p>/g, '')
    .replace(/<p>(<h[123]>)/g, '$1')
    .replace(/(<\/h[123]>)<\/p>/g, '$1')
    .replace(/<p>(<blockquote>)/g, '$1')
    .replace(/(<\/blockquote>)<\/p>/g, '$1')
    .replace(/<p>(<ul>)/g, '$1')
    .replace(/(<\/ul>)<\/p>/g, '$1');
}
