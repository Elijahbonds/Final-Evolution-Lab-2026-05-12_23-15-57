// TW-OPACITY-SCALE (2026-10-14): Tailwind 3.3 compiles a colour opacity modifier only when its step is a key of
// theme.opacity, and the stock scale is 0, 5, 10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, 95, 100. Any other step
// compiles to NOTHING — no rule and no warning. Measured on lane/finish-release ab9139b8 with the app's own config:
// 70 class names, 912 uses (`text-white/45` ×169, `text-white/35` ×131, `text-white/55` ×120, `border-white/15` ×109,
// `border-white/8` ×61 …) produced zero CSS, while `text-white/40` beside them compiled. So that text rendered in its
// inherited full colour, and those tints, borders, scrims and disabled fades were simply absent.
//
// tailwind.config.ts now extends the scale to every whole percent (Tailwind 3.4 adds only the 15/35/… steps, and
// Tailwind 4 takes any integer). This holds the fix in place:
//   1. the scale is every whole percent 0–100, and the stock steps keep their values;
//   2. every opacity step the app's content uses is on the resolved scale;
//   3. the real compiler emits a rule for each step in use. As the control, it emits none for an off-scale step once
//      the extension is taken away, which shows the check bites.
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import loadConfig from 'tailwindcss/loadConfig';
import resolveConfig from 'tailwindcss/resolveConfig';
import type { Config } from 'tailwindcss';
import { describe, expect, it } from 'vitest';

const APP = path.resolve(__dirname, '../..');
const config = loadConfig(path.join(APP, 'tailwind.config.ts')) as Config;

// The files tailwind.config.ts scans, walked from its `content` globs. A glob of any other shape fails the test, so
// a changed content list cannot leave this scanning nothing.
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
        else if (exts.has(path.extname(ent.name))) out.push(p);
      }
    };
    walk(path.join(APP, m[1]));
  }
  return out;
}

// `text-white/45`, `hover:bg-[#00E5FF]/85`, `border-t-white/8`, `disabled:opacity-35`, `bg-opacity-15` → the step.
const COLOR_UTILITY = String.raw`(?:text|bg|border(?:-[trblxyse])?|ring|ring-offset|divide|placeholder|from|via|to|fill|stroke|outline|decoration|caret|accent|shadow)`;
const STEP = new RegExp(
  String.raw`(?<![\w-])${COLOR_UTILITY}-(?:\[#[0-9a-fA-F]{3,8}\]|[a-z]+(?:-[a-z0-9]+)*)\/(\d+)(?![\w./%-])` +
    String.raw`|(?<![\w-])(?:[a-z]+-)?opacity-(\d+)(?![\w./%-])`,
  'g',
);

function stepsInUse(): { steps: Map<number, string>; uses: number } {
  const steps = new Map<number, string>();
  let uses = 0;
  for (const file of contentFiles()) {
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(STEP)) {
      uses++;
      const step = Number(m[1] ?? m[2]);
      if (!steps.has(step)) steps.set(step, `${path.relative(APP, file)}: ${m[0]}`);
    }
  }
  return { steps, uses };
}

async function compile(cfg: Config, classes: string[]): Promise<string> {
  const res = await postcss([tailwind({ ...cfg, content: [{ raw: classes.join(' '), extension: 'html' }] })])
    .process('@tailwind utilities;', { from: undefined });
  return res.css;
}
const resolvedScale = () => (resolveConfig(config).theme as unknown as { opacity: Record<string, string> }).opacity;
const emits = (css: string, cls: string) => css.includes(`.${cls.replace(/\//g, '\\/')} `) || css.includes(`.${cls.replace(/\//g, '\\/')}{`);

describe('Tailwind opacity scale', () => {
  it('is every whole percent 0–100, and the stock steps keep their values', () => {
    const opacity = resolvedScale();
    for (let i = 0; i <= 100; i++) expect(opacity[String(i)], `step ${i}`).toBe(String(i / 100));
    // node_modules/tailwindcss/stubs/config.full.js (3.3)
    expect(opacity).toMatchObject({ 0: '0', 5: '0.05', 10: '0.1', 20: '0.2', 25: '0.25', 75: '0.75', 95: '0.95', 100: '1' });
  });

  it('holds every opacity step the content uses', () => {
    const { steps, uses } = stepsInUse();
    expect(uses, 'the scan found the app’s opacity modifiers').toBeGreaterThan(1000);
    const opacity = resolvedScale();
    const off = [...steps].filter(([step]) => !(String(step) in opacity)).map(([step, where]) => `/${step} (${where})`);
    expect(off, 'opacity steps used in content but missing from theme.opacity compile to no CSS').toEqual([]);
  });

  it('compiles a rule for each step in use, and none off the stock scale without the extension (control)', async () => {
    const steps = [...stepsInUse().steps.keys()].sort((a, b) => a - b);
    const classes = steps.flatMap((s) => [`text-white/${s}`, `bg-black/${s}`, `border-white/${s}`, `opacity-${s}`]);
    const css = await compile(config, classes);
    expect(classes.filter((c) => !emits(css, c)), 'classes that compiled to nothing').toEqual([]);

    // The control: the same config without the extension is stock 3.3. /8 is off both the 3.3 and 3.4 scales.
    const stock: Config = { ...config, theme: { ...config.theme, extend: { ...config.theme?.extend, opacity: undefined } } };
    const stockCss = await compile(stock, ['text-white/40', 'text-white/8']);
    expect(emits(stockCss, 'text-white/40')).toBe(true);
    expect(emits(stockCss, 'text-white/8')).toBe(false);
  });
});
