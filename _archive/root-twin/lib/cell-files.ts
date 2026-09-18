/**
 * CELL virtual file system helpers.
 *
 * A CELL project is a tree of files (ProjectFile rows), not a single HTML blob.
 * Builder lanes emit FILE OPERATIONS; the bundler assembles the tree into one
 * runnable, self-contained HTML document for the sandboxed preview.
 */
import { createHash } from 'crypto';

export type FileAction = 'create' | 'update' | 'delete';

export interface FileOp {
  action: FileAction;
  path: string;
  content?: string;
}

export interface ProjectFileLite {
  path: string;
  content: string;
  kind?: string;
}

export function sha256(s: string): string {
  return createHash('sha256').update(s ?? '').digest('hex');
}

/** Normalize a referenced path (strip query/hash, leading ./ and /). */
export function normalizePath(p: string): string {
  if (!p) return '';
  let out = p.split('?')[0].split('#')[0].trim();
  out = out.replace(/^\.\//, '').replace(/^\/+/, '');
  return out;
}

function isExternal(url: string): boolean {
  return /^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:');
}

/**
 * Tolerant parser for a builder's FILE OPERATIONS response.
 * Accepts a JSON object { ops: [...] } optionally wrapped in a ```json fence,
 * or a bare array of ops.
 */
export function parseFileOps(text: string): FileOp[] {
  if (!text) return [];
  const candidates: string[] = [];
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) candidates.push(fence[1]);
  candidates.push(text);
  // also try to slice from first { or [ to last } or ]
  const firstObj = text.indexOf('{');
  const lastObj = text.lastIndexOf('}');
  if (firstObj >= 0 && lastObj > firstObj) candidates.push(text.slice(firstObj, lastObj + 1));
  const firstArr = text.indexOf('[');
  const lastArr = text.lastIndexOf(']');
  if (firstArr >= 0 && lastArr > firstArr) candidates.push(text.slice(firstArr, lastArr + 1));

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c.trim());
      const arr: any[] = Array.isArray(parsed) ? parsed : parsed?.ops;
      if (Array.isArray(arr)) {
        const ops: FileOp[] = [];
        for (const o of arr) {
          if (!o || typeof o.path !== 'string') continue;
          const action: FileAction =
            o.action === 'delete' ? 'delete' : o.action === 'update' ? 'update' : 'create';
          ops.push({
            action,
            path: normalizePath(o.path),
            content: typeof o.content === 'string' ? o.content : '',
          });
        }
        if (ops.length) return ops;
      }
    } catch {
      // try next candidate
    }
  }
  return [];
}

/**
 * Assemble the file tree into a single self-contained HTML document.
 * Inlines local <link rel=stylesheet> and <script src> references so the
 * result runs inside an iframe srcDoc with no external fetches.
 */
export function bundleFiles(files: ProjectFileLite[]): string {
  const map = new Map<string, string>();
  for (const f of files) map.set(normalizePath(f.path), f.content ?? '');

  // pick an entry point
  const entryPath =
    [...map.keys()].find((p) => p === 'index.html') ||
    [...map.keys()].find((p) => p.endsWith('index.html')) ||
    [...map.keys()].find((p) => p.endsWith('.html'));

  if (!entryPath) {
    // no HTML entry — surface whatever we have
    const first = files[0];
    return `<!DOCTYPE html><html><body><pre>${escapeHtml(
      first?.content || 'No index.html produced.'
    )}</pre></body></html>`;
  }

  let html = map.get(entryPath) || '';

  const resolve = (ref: string): string | null => {
    if (isExternal(ref)) return null;
    const norm = normalizePath(ref);
    if (map.has(norm)) return map.get(norm)!;
    // fallback: basename match
    const base = norm.split('/').pop();
    const hit = [...map.entries()].find(([k]) => k.split('/').pop() === base);
    return hit ? hit[1] : null;
  };

  // Inline stylesheets
  html = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const hrefM = tag.match(/href=["']([^"']+)["']/i);
    const relM = tag.match(/rel=["']([^"']+)["']/i);
    if (!hrefM) return tag;
    if (relM && !/stylesheet/i.test(relM[1])) return tag;
    const css = resolve(hrefM[1]);
    if (css == null) return tag;
    return `<style>\n${css}\n</style>`;
  });

  // Inline scripts
  html = html.replace(
    /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi,
    (tag, pre, src, post) => {
      const js = resolve(src);
      if (js == null) return tag;
      const attrs = `${pre || ''}${post || ''}`
        .replace(/\s*\bsrc=["'][^"']*["']/i, '')
        .replace(/\s*\b(defer|async)\b/gi, '')
        .trim();
      const typeAttr = /type=/.test(attrs) ? '' : '';
      return `<script ${attrs} ${typeAttr}>\n${js}\n</script>`;
    }
  );

  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Phase 3: Machine-checkable bundle validation
 *
 * Runs acceptance checks + structural heuristics against the assembled
 * bundle HTML. Pure string analysis — no browser, no LLM, no credits.
 * ═══════════════════════════════════════════════════════════════════════════ */
import type { AcceptanceCheck } from '@/lib/cell-engine';

export interface CheckResult {
  checkId: string;
  passed: boolean;
  description: string;
  detail: string;
}

/**
 * Run a single acceptance check against the bundle HTML and the file tree.
 */
export function runAcceptanceCheck(
  check: AcceptanceCheck,
  bundleHtml: string,
  filePaths: string[],
): CheckResult {
  const base = { checkId: check.id, description: check.description };
  switch (check.type) {
    case 'html_contains': {
      const found = bundleHtml.includes(check.value);
      return { ...base, passed: found, detail: found ? 'substring found' : `substring "${check.value}" not found in bundle` };
    }
    case 'html_regex': {
      try {
        const re = new RegExp(check.value, 'is');
        const found = re.test(bundleHtml);
        return { ...base, passed: found, detail: found ? 'regex matched' : `regex /${check.value}/ did not match` };
      } catch (e: any) {
        return { ...base, passed: false, detail: `invalid regex: ${e?.message}` };
      }
    }
    case 'no_console_error_pattern': {
      try {
        const re = new RegExp(check.value, 'i');
        const found = re.test(bundleHtml);
        return { ...base, passed: !found, detail: found ? `error pattern /${check.value}/ found` : 'no error pattern detected' };
      } catch (e: any) {
        return { ...base, passed: false, detail: `invalid regex: ${e?.message}` };
      }
    }
    case 'file_exists': {
      const norm = normalizePath(check.value);
      const found = filePaths.some((p) => normalizePath(p) === norm);
      return { ...base, passed: found, detail: found ? 'file exists' : `file "${check.value}" not found in project tree` };
    }
    default:
      return { ...base, passed: false, detail: `unknown check type: ${(check as any).type}` };
  }
}

/** Built-in structural checks (always run, supplement architect checks). */
function builtinChecks(bundleHtml: string): CheckResult[] {
  const results: CheckResult[] = [];
  // Must have basic HTML structure
  results.push({
    checkId: '_html-doctype',
    description: 'Bundle has a DOCTYPE or <html> tag',
    passed: /<!doctype html|<html/i.test(bundleHtml),
    detail: '',
  });
  // Should have at least one <script> block (functional app)
  results.push({
    checkId: '_has-script',
    description: 'Bundle contains a <script> block',
    passed: /<script[\s>]/i.test(bundleHtml),
    detail: '',
  });
  // Warn on common JS error patterns
  const undefinedRef = /\bundefined\b\s*\.\s*\w/;
  results.push({
    checkId: '_no-undefined-deref',
    description: 'No obvious undefined dereference in inline JS',
    passed: !undefinedRef.test(bundleHtml),
    detail: undefinedRef.test(bundleHtml) ? 'found "undefined.xxx" pattern in JS' : '',
  });
  return results;
}

export interface ValidationReport {
  passed: boolean;
  total: number;
  failures: CheckResult[];
  all: CheckResult[];
}

/**
 * Validate a bundle against its acceptance checks + structural builtins.
 * Returns a structured report; `passed` is true only when EVERY check passes.
 */
export function validateBundle(
  bundleHtml: string,
  filePaths: string[],
  acceptanceChecks?: AcceptanceCheck[],
): ValidationReport {
  const results: CheckResult[] = [];
  // Built-in structural checks
  results.push(...builtinChecks(bundleHtml));
  // Architect-emitted acceptance checks
  if (acceptanceChecks?.length) {
    for (const check of acceptanceChecks) {
      results.push(runAcceptanceCheck(check, bundleHtml, filePaths));
    }
  }
  const failures = results.filter((r) => !r.passed);
  return {
    passed: failures.length === 0,
    total: results.length,
    failures,
    all: results,
  };
}

/** Language hint for the code viewer by extension. */
export function langForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const m: Record<string, string> = {
    html: 'xml',
    htm: 'xml',
    js: 'javascript',
    mjs: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    jsx: 'javascript',
    css: 'css',
    json: 'json',
    md: 'markdown',
  };
  return m[ext] || 'plaintext';
}
