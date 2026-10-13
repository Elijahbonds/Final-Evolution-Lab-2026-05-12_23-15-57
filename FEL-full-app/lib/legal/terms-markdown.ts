// terms-markdown — the small markdown renderer behind /terms (moved out of app/terms/page.tsx so it can be tested; a
// Next page file may only export its page). Layout only: it never changes the words, only the tags around them.
// TERMS-RENDER (FE PM 9:39 PM PT Oct 12) fixed two bugs from the old inline version:
//  1. List wrap: one greedy <ul> ran from the first list item to the last one on the whole page, swallowing every
//     heading and paragraph between them. Now each run of consecutive items gets its own <ul>.
//  2. Stray italics: any two underscores anywhere (snake_case, URLs, e-mail local parts) turned the text between them
//     into <em>. Now _text_ is italic only when the underscores stand at word edges.

export function termsMarkdown(md: string): string {
  return md
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
