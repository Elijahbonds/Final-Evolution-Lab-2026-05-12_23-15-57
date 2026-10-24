// TW-DEAD-CLASSES (2026-10-16): a class that compiles to nothing fails here, instead of shipping silently.
//
// Tailwind emits no CSS and no warning for a class it cannot read. Measured on lane/finish-release 1b22e59c (every class in
// a className / cn() / clsx() / cva() string, compiled with the app's own config), 42 classes in 131 places compiled to
// nothing. Some needed Tailwind 3.4 (min-h-12 ×57, min-w-12 ×8, min-h-14 ×6 …), some the typography plugin, which is not
// installed (every prose-* on /terms, /privacy, /store-terms), and some were colours Tailwind cannot give an alpha to
// (`bg-[var(--x)]/10`). The rest were an easing two plugins both claim, and five classes in components nothing imports.
// The fixes: tailwind.config.ts min sizes, lib/legal/legalProse.ts, and color-mix() in place of the var colours.
//
// This walks the same strings, compiles every class-shaped token once, and fails on any that neither Tailwind emits nor a
// CSS file (or a component's own <style>) defines. Bare words ('default', 'danger', a cva variant name, a stage compared
// inside cn()) are not classes and are skipped. The off-scale opacity steps (text-white/45 …) are PR #280's, with its own
// guard; they are compiled here with the 0–100 scale #280 adds, so this test reports only the other causes. Once #280 has
// landed, that line changes nothing.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig';
import ts from 'typescript';
import type { Config } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

const APP = path.resolve(__dirname, '../..');
const config = loadConfig(path.join(APP, 'tailwind.config.ts')) as Config;
const withOpacityScale = (cfg: Config): Config => ({
  ...cfg,
  theme: { ...cfg.theme, extend: { ...cfg.theme?.extend, opacity: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i), String(i / 100)])) } },
});

/** Known and inert: every one sits in a component nothing imports, checked below. Using the component means fixing these. */
const INERT: Record<string, string> = {
  'hero-gradient': 'components/layouts/auth-layout.tsx',
  '[&>svg]:size-3.5': 'components/ui/breadcrumb.tsx',
  'has-[:disabled]:opacity-50': 'components/ui/input-otp.tsx',
  'animate-caret-blink': 'components/ui/input-otp.tsx',
  'origin-top-center': 'components/ui/navigation-menu.tsx',
};

function contentFiles(): string[] {
  const out: string[] = [];
  for (const glob of config.content as string[]) {
    const m = glob.match(/^\.\/([\w-]+)\/\*\*\/\*\.\{([\w,]+)\}$/);
    if (!m) throw new Error(`tailwind content glob of an unexpected shape: ${glob}`);
    const exts = new Set(m[2].split(',').map((e) => `.${e}`));
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) { if (ent.name !== 'node_modules') walk(p); }
        else if (exts.has(path.extname(ent.name)) && !/\.test\.[jt]sx?$/.test(ent.name)) out.push(p);
      }
    };
    walk(path.join(APP, m[1]));
  }
  return out;
}

const CALLS = /^(cn|clsx|cx|twMerge|twJoin|cva|classNames)$/;
const CLASS_NAME = /(className|Class|Classes|cls)$/;

/** Every whitespace-separated token in a class string, with where it is. Tokens glued to a ${} are partial, so skipped. */
function classTokens(files: string[]): Map<string, string[]> {
  const tokens = new Map<string, string[]>();
  for (const abs of files) {
    const src = fs.readFileSync(abs, 'utf8');
    if (!/className|cn\(|clsx\(|cva\(|twMerge\(/.test(src)) continue;
    const rel = path.relative(APP, abs);
    const sf = ts.createSourceFile(abs, src, ts.ScriptTarget.Latest, true, /x$/.test(abs) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const inClassContext = (n: ts.Node): boolean => {
      if (n.parent && ts.isBinaryExpression(n.parent) && /^(===|!==|==|!=)$/.test(n.parent.operatorToken.getText(sf))) return false;
      if (n.parent && ts.isCaseClause(n.parent)) return false;
      for (let p: ts.Node | undefined = n.parent; p; p = p.parent) {
        if (ts.isJsxAttribute(p)) return /^class$/.test(p.name.getText(sf)) || CLASS_NAME.test(p.name.getText(sf));
        if (ts.isCallExpression(p) && CALLS.test(p.expression.getText(sf))) return true;
        if (ts.isVariableDeclaration(p) || ts.isPropertyAssignment(p)) return CLASS_NAME.test(p.name.getText(sf));
        if (ts.isFunctionLike(p) || ts.isSourceFile(p)) return false;
      }
      return false;
    };
    const visit = (n: ts.Node) => {
      let text: string | null = null; let openL = false; let openR = false;
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = n.text;
      else if (ts.isTemplateHead(n)) { text = n.text; openR = true; }
      else if (ts.isTemplateMiddle(n)) { text = n.text; openL = openR = true; }
      else if (ts.isTemplateTail(n)) { text = n.text; openL = true; }
      if (text != null && inClassContext(n)) {
        const parts = text.split(/\s+/);
        parts.forEach((t, i) => {
          if (!t || /[{}`$;]/.test(t) || t.length > 120) return;
          if ((i === 0 && openL && !/^\s/.test(text!)) || (i === parts.length - 1 && openR && !/\s$/.test(text!))) return;
          if (!/[-:[/]/.test(t)) return; // a bare word, not a class
          const where = `${rel}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
          tokens.set(t, [...(tokens.get(t) ?? []), where]);
        });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return tokens;
}

/** Class selectors the app defines itself: its CSS files, and the <style> blocks components carry. */
function definedClasses(files: string[]): Set<string> {
  const defined = new Set<string>();
  const harvest = (css: string) => { for (const m of css.matchAll(/\.(-?[A-Za-z_][\w-]*)\s*[{,:]/g)) defined.add(m[1]!); };
  for (const dir of ['app', 'components', 'lib', 'styles']) {
    const walk = (d: string) => {
      if (!fs.existsSync(d)) return;
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) { if (ent.name !== 'node_modules') walk(p); } else if (p.endsWith('.css')) harvest(fs.readFileSync(p, 'utf8'));
      }
    };
    walk(path.join(APP, dir));
  }
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/<style[^>]*>\{?`([^`]*)`/g)) harvest(m[1]!);
  return defined;
}

async function compile(cfg: Config, classes: string[]): Promise<string> {
  const res = await postcss([tailwind({ ...cfg, content: [{ raw: classes.join(' '), extension: 'html' }] })]).process('@tailwind utilities;', { from: undefined });
  return res.css;
}
const escapeClassName = (createRequire(path.join(APP, 'package.json'))('tailwindcss/lib/util/escapeClassName') as { default: (s: string) => string }).default;
const emits = (css: string, cls: string): boolean => {
  const esc = escapeClassName;
  return new RegExp(('.' + esc(cls)).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![A-Za-z0-9_\\\\-])').test(css);
};
const MARKER = /^(group|peer)(\/[\w-]+)?$|^dark$/;

describe('every Tailwind class in the app compiles to something', () => {
  const files = contentFiles();
  const tokens = classTokens(files);
  const defined = definedClasses(files);

  it('the scan sees the app (a broken walk must not pass by scanning nothing)', () => {
    expect(tokens.size).toBeGreaterThan(1000);
  });

  it('no class-shaped token compiles to no CSS, except the named inert ones', async () => {
    const all = [...tokens.keys()];
    const css = await compile(withOpacityScale(config), all);
    const dead = all.filter((t) => !emits(css, t) && !defined.has(t.replace(/^!/, '')) && !MARKER.test(t) && !(t in INERT));
    expect(dead.map((t) => `${t}  (${tokens.get(t)!.slice(0, 2).join(', ')})`), 'classes Tailwind emits nothing for').toEqual([]);
  });

  it('each inert class still sits only in a component nothing imports', () => {
    for (const [cls, file] of Object.entries(INERT)) {
      expect((tokens.get(cls) ?? []).every((w) => w.startsWith(file)), cls).toBe(true);
      const base = path.basename(file, '.tsx');
      const imports = new RegExp(`(from\\s+|import\\(\\s*)['"][^'"]*/${base}['"]`);
      const importers = files.filter((f) => !f.endsWith(file) && imports.test(fs.readFileSync(f, 'utf8')));
      expect(importers.map((f) => path.relative(APP, f)), `${file} is imported, so ${cls} must be fixed`).toEqual([]);
    }
  });

  it('min-height / min-width take the spacing scale, and the stock values are unchanged', async () => {
    const css = await compile(config, ['min-h-12', 'min-w-28', 'min-h-full', 'min-h-screen', 'min-w-0', 'min-w-fit']);
    for (const c of ['min-h-12', 'min-w-28', 'min-h-full', 'min-h-screen', 'min-w-0', 'min-w-fit']) expect(emits(css, c), c).toBe(true);
    expect(css).toMatch(/\.min-h-12\s*\{\s*min-height:\s*3rem/);
  });

  it('control: the check bites. Stock min sizes and the removed prose / var-alpha classes compile to nothing', async () => {
    const stock: Config = { ...config, theme: { ...config.theme, extend: { ...config.theme?.extend, minHeight: undefined, minWidth: undefined } } };
    const css = await compile(stock, ['min-h-12', 'prose-p:text-white/70', 'bg-[var(--fel-red)]/10', 'min-h-screen']);
    expect(['min-h-12', 'prose-p:text-white/70', 'bg-[var(--fel-red)]/10'].filter((c) => emits(css, c))).toEqual([]);
    expect(emits(css, 'min-h-screen')).toBe(true);
  });
});
