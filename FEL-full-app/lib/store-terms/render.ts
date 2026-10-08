/**
 * lib/store-terms/render.ts — the SAFE renderer for the store terms (STORE-TERMS-3, T2).
 *
 * STORE-TERMS-2 ran an unescaped regex markdown converter (simpleMarkdown) through
 * dangerouslySetInnerHTML: any `<`, `>`, `&` or quote in the text went straight into the DOM, and a
 * `[label](https://…)` link could point anywhere. This renderer is the fix:
 *
 *  - every text cell is HTML-ESCAPED before any tag is built (escapeHtml), so the approved text can
 *    never inject markup;
 *  - the ONLY links emitted point at "/" paths (`[label](/terms)`); any other href renders as plain
 *    text (safeLink), so the terms page never sends a buyer off-site or to a javascript: URL;
 *  - each section is wrapped in `<section id="…">` so a section can be linked by a stable, word-based
 *    anchor (the ids come from the data, sanitized to lowercase word characters).
 *
 * Supported markdown (a superset of the old simpleMarkdown, extended for the Part B table):
 * headings (#/##/###), **bold**, _italics_, `code`, > blockquotes, - lists, tables (| … |), --- rules,
 * and "/" links. Pure and client-safe: no prisma, no next/*, no process.env, no server-only.
 */

import type { StoreTermsSection } from '../store-terms';

/** HTML-escape one run of text so it can never become markup. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** A section anchor id is lowercase word characters and dashes only; anything else is stripped. */
export function anchorId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Render the inline markup of one already-escaped run: **bold**, _italics_, `code` and "/" links.
 * Runs on escaped text, so a `**` or `[`…`](` in the source can never open a tag it shouldn't.
 */
function inline(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\((\/[^)]*)\)/g, '<a href="$2">$1</a>') // only "/" links survive
    .replace(/\[([^\]]+)\]\(([^)]*)\)/g, '$1') // a non-"/" href degrades to its plain text
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

/** One block-level line to HTML (heading, quote, list item, table row, rule or paragraph text). */
function blockLine(rawLine: string): string {
  const esc = escapeHtml(rawLine);
  const h = /^(#{1,3})\s+(.*)$/.exec(rawLine);
  if (h) {
    const level = h[1].length;
    return `<h${level}>${inline(escapeHtml(h[2]))}</h${level}>`;
  }
  if (/^---+\s*$/.test(rawLine)) return '<hr />';
  if (/^>\s?/.test(rawLine)) return `<blockquote><p>${inline(esc.replace(/^&gt;\s?/, ''))}</p></blockquote>`;
  if (/^-\s+/.test(rawLine)) return `<li>${inline(esc.replace(/^- /, ''))}</li>`;
  if (/^\|.*\|$/.test(rawLine.trim())) return tableRow(rawLine);
  return `<p>${inline(esc)}</p>`;
}

/** One `| a | b |` line to a table row; a `|---|---|` separator line yields '' (dropped). */
function tableRow(rawLine: string): string {
  const cells = rawLine.trim().slice(1, -1).split('|').map((c) => c.trim());
  if (cells.every((c) => /^:?-{2,}:?$/.test(c))) return ''; // the |---|---| separator
  return `<tr>${cells.map((c) => `<td>${inline(escapeHtml(c))}</td>`).join('')}</tr>`;
}

/** Render one section's markdown to a `<section id="…">…</section>` block with a stable anchor. */
export function renderSection(section: StoreTermsSection): string {
  const id = anchorId(section.id);
  const blocks: string[] = [];
  let listOpen = false;
  let tableOpen = false;
  for (const rawLine of section.markdown.split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    const isList = /^-\s+/.test(line);
    const isTable = /^\|.*\|$/.test(line.trim());
    if (!isList && listOpen) { blocks.push('</ul>'); listOpen = false; }
    if (!isTable && tableOpen) { blocks.push('</tbody></table>'); tableOpen = false; }
    if (line === '') continue;
    if (isList && !listOpen) { blocks.push('<ul>'); listOpen = true; }
    if (isTable && !tableOpen) { blocks.push('<table><tbody>'); tableOpen = true; }
    const html = blockLine(line);
    if (html) blocks.push(html);
  }
  if (listOpen) blocks.push('</ul>');
  if (tableOpen) blocks.push('</tbody></table>');
  return `<section id="${id}">${blocks.join('')}</section>`;
}

/** Render the full terms (every section) to safe HTML, one anchored `<section>` per section. */
export function renderStoreTerms(sections: readonly StoreTermsSection[]): string {
  return sections.map(renderSection).join('\n');
}
