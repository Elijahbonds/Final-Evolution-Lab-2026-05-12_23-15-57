// The readability standard read from SOURCE (lane/readable, 2026-11-02; docs/READABLE.md). What the rig measures on a
// rendered page, this catches in the class names before anything renders, so the fast suite holds the floor:
//
//   font sizes   a Tailwind `text-[Npx]` / `text-[Nrem]`, or an inline `fontSize: N` / 'Npx', under READABLE.minPx (12)
//   text colour  a `text-<colour>[/<alpha>]` class whose colour, on the app's darkest text surfaces (lib/design/tokens.ts
//                TEXT_SURFACES: the ink, the card, the raised panel), is under WCAG AA's 4.5:1
//
// The app is dark-only (app/layout.tsx: <html class="dark">, the ink #050505), so a text colour is judged on those
// surfaces. Two kinds of class are not judged: a dark solid colour (luminance under 0.05: text-black, text-fel-bg — the
// ink on a lit chip or a light panel), and the `disabled:` variants (WCAG 1.4.3 exempts an inactive control).
// Pure: string in, findings out.
import tailwindColors from 'tailwindcss/colors';
import { contrastRatio, composite, luminance, parseColor, type Rgba } from '@/lib/a11y/wcag';
import { COLOR, TAILWIND_FEL, TEXT_SURFACES } from '@/lib/design/tokens';
import { READABLE } from './rules';

export interface SizeFinding { line: number; match: string; px: number }
export interface ColourFinding { line: number; match: string; ratio: number; minAlpha: number | null }

const lineAt = (src: string, i: number) => src.slice(0, i).split('\n').length;

/** Tailwind arbitrary sizes and inline font sizes under the floor. */
export function scanFontSizes(src: string, floor: number = READABLE.minPx): SizeFinding[] {
  const out: SizeFinding[] = [];
  for (const m of src.matchAll(/(?<![\w-])((?:[a-z0-9-]+:)*!?text-\[(\d+(?:\.\d+)?)(px|rem)\])/g)) {
    const px = m[3] === 'rem' ? Number(m[2]) * 16 : Number(m[2]);
    if (px < floor) out.push({ line: lineAt(src, m.index!), match: m[1], px });
  }
  // text-[clamp(MIN,…,MAX)] is at least MIN; text-[min(a,b)] is at most its px term; text-[max(a,b)] at least its px term
  for (const m of src.matchAll(/(?<![\w-])((?:[a-z0-9-]+:)*!?text-\[(min|clamp|max)\(([^\]]*)\)\])/g)) {
    const px = [...m[3].matchAll(/(\d+(?:\.\d+)?)(px|rem)/g)].map((x) => (x[2] === 'rem' ? Number(x[1]) * 16 : Number(x[1])));
    if (!px.length) continue;
    const bound = m[2] === 'clamp' ? px[0] : m[2] === 'min' ? Math.min(...px) : Math.max(...px);
    if (bound < floor) out.push({ line: lineAt(src, m.index!), match: m[1], px: bound });
  }
  for (const m of src.matchAll(/\bfontSize:\s*(?:(\d+(?:\.\d+)?)|['"`](\d+(?:\.\d+)?)(px|rem)['"`])(?=\s*[,}\n])/g)) {
    const px = m[1] != null ? Number(m[1]) : m[3] === 'rem' ? Number(m[2]) * 16 : Number(m[2]);
    if (px < floor) out.push({ line: lineAt(src, m.index!), match: m[0], px });
  }
  return out;
}

const PALETTE_HEX: Record<string, string> = {};
// the renamed v2 names are getters that warn on every read: never touch them
const RENAMED = new Set(['lightBlue', 'warmGray', 'trueGray', 'coolGray', 'blueGray']);
for (const name of Object.keys(tailwindColors).filter((k) => !RENAMED.has(k))) {
  const v = (tailwindColors as unknown as Record<string, unknown>)[name];
  if (typeof v === 'string') { if (v.startsWith('#')) PALETTE_HEX[name] = v; }
  else if (v && typeof v === 'object') for (const [step, hex] of Object.entries(v as Record<string, string>)) PALETTE_HEX[`${name}-${step}`] = hex;
}
for (const [k, hex] of Object.entries(TAILWIND_FEL)) PALETTE_HEX[`fel-${k}`] = hex;

/** The hex a Tailwind text colour name resolves to (`white`, `slate-400`, `fel-dim`), or null for anything else. */
export function textColourHex(name: string): string | null {
  return PALETTE_HEX[name] ?? null;
}

const SURFACES: Rgba[] = TEXT_SURFACES.map((k) => parseColor(COLOR[k])!);

/** The contrast of a colour at an alpha on the worst of the app's text surfaces. */
export function contrastOnSurfaces(hex: string, alpha = 1): number {
  const c = parseColor(hex)!;
  return Math.min(...SURFACES.map((s) => contrastRatio(composite({ ...c, a: alpha }, s), s)));
}

/** The smallest alpha, in whole 5 % steps from `from`, at which the colour clears 4.5:1 on every surface; null if none does. */
export function minPassingAlpha(hex: string, from = 0): number | null {
  for (let a = Math.ceil(from * 20) / 20; a <= 1.0001; a += 0.05) if (contrastOnSurfaces(hex, a) >= 4.5) return Math.round(a * 100) / 100;
  return null;
}

/** `text-<colour>[/<alpha>]` classes (any variant prefix but disabled:) that are under AA on the dark surfaces. */
export function scanTextColours(src: string): ColourFinding[] {
  const out: ColourFinding[] = [];
  for (const m of src.matchAll(/(?<![\w/-])((?:[a-z0-9-]+:)*)!?text-([a-z]+(?:-[a-z]+){0,2}(?:-\d{2,3})?)(?:\/(\d{1,3}))?(?![\w\-[/])/g)) {
    const variants = m[1];
    if (/(^|:)(group-|peer-)?disabled:/.test(variants) || /aria-disabled/.test(variants)) continue;
    const hex = textColourHex(m[2]);
    if (!hex) continue;
    const c = parseColor(hex)!;
    if (luminance(c) < 0.05) continue;
    const alpha = m[3] != null ? Number(m[3]) / 100 : 1;
    const ratio = contrastOnSurfaces(hex, alpha);
    if (ratio < 4.5) out.push({ line: lineAt(src, m.index!), match: m[0], ratio, minAlpha: minPassingAlpha(hex, alpha) });
  }
  return out;
}
