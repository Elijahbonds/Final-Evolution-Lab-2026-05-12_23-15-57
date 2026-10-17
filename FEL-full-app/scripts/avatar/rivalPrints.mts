/**
 * rivalPrints — the graphics the casual wardrobe prints on a rival's tee, jersey or short (owner 2026-10-16, style pass S2:
 * "printed tees and jerseys … our own generic designs, no real brands").
 *
 * Each print is a black-ink PNG on transparent (an SVG rendered by sharp): style.py projects it onto the garment in 3D and
 * DARKENS the tonal cloth with it, so the garment's colour (its colourway, a dealt fit, the 3v3 team colour) stays the
 * cloth's and the print reads as a darker tone of it. Words are invented, numbers are numbers, shapes are drawn here.
 */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type Emblem = 'star' | 'bolt' | 'crown' | 'flame' | 'wave' | 'sun' | 'diamond' | 'palm';
export type FrontPrint =
  | { kind: 'word'; text: string; sub?: string }
  | { kind: 'number'; n: number; word?: string }
  | { kind: 'emblem'; shape: Emblem; word?: string }
  | { kind: 'stripes'; count?: number }
  | { kind: 'none' };
export interface BackPrint { n?: number; name?: string }

const S = 1024;
const FONT = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif" font-weight="900"`;
const INK = '#000';
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const SHAPES: Record<Emblem, string> = {
  star: 'M512 250 L575 445 L780 445 L615 565 L678 760 L512 640 L346 760 L409 565 L244 445 L449 445 Z',
  bolt: 'M560 230 L380 540 L500 540 L450 800 L660 460 L535 460 L610 230 Z',
  crown: 'M300 700 L300 420 L410 560 L512 360 L614 560 L724 420 L724 700 Z',
  flame: 'M512 800 C380 800 330 690 360 590 C380 520 430 500 440 420 C500 470 500 530 490 570 C540 540 560 470 540 380 C640 450 700 560 680 650 C665 740 600 800 512 800 Z',
  wave: 'M250 600 C330 480 420 480 500 560 C580 640 670 640 774 520 L774 640 C670 760 580 760 500 680 C420 600 330 600 250 720 Z',
  sun: 'M512 380 A132 132 0 1 1 511.9 380 Z M512 230 L540 330 L484 330 Z M512 794 L484 694 L540 694 Z M230 512 L330 484 L330 540 Z M794 512 L694 540 L694 484 Z',
  diamond: 'M512 260 L720 512 L512 764 L304 512 Z M512 360 L630 512 L512 664 L394 512 Z',
  palm: 'M500 800 C505 690 505 600 520 500 C470 460 400 450 330 470 C390 420 470 420 520 450 C500 390 450 340 380 320 C460 320 520 370 540 430 C560 360 620 320 700 330 C630 350 580 400 560 450 C620 430 700 450 740 500 C670 480 600 480 550 500 C540 600 540 700 545 800 Z',
};

function frontSvg(p: FrontPrint): string | null {
  if (p.kind === 'none') return null;
  let body = '';
  if (p.kind === 'word') {
    const size = Math.min(200, Math.floor(1350 / Math.max(4, p.text.length)));   // a phrase fits the chest box (OPEN RUN ran off it at 1700)
    body += `<text x="512" y="${p.sub ? 520 : 580}" text-anchor="middle" ${FONT} font-size="${size}" fill="${INK}" letter-spacing="6">${esc(p.text)}</text>`;
    body += `<rect x="232" y="${p.sub ? 560 : 620}" width="560" height="14" fill="${INK}"/>`;
    if (p.sub) body += `<text x="512" y="660" text-anchor="middle" ${FONT} font-size="84" fill="${INK}" letter-spacing="14">${esc(p.sub)}</text>`;
  } else if (p.kind === 'number') {
    if (p.word) body += `<text x="512" y="330" text-anchor="middle" ${FONT} font-size="${Math.min(120, Math.floor(1000 / Math.max(4, p.word.length)))}" fill="${INK}" letter-spacing="8">${esc(p.word)}</text>`;
    body += `<text x="512" y="800" text-anchor="middle" ${FONT} font-size="460" fill="none" stroke="${INK}" stroke-width="26">${p.n}</text>`;
    body += `<text x="512" y="800" text-anchor="middle" ${FONT} font-size="460" fill="${INK}" fill-opacity="0.55">${p.n}</text>`;
  } else if (p.kind === 'emblem') {
    body += `<circle cx="512" cy="512" r="300" fill="none" stroke="${INK}" stroke-width="30"/>`;
    body += `<path d="${SHAPES[p.shape]}" fill="${INK}" transform="translate(512 512) scale(0.62) translate(-512 -512)"/>`;
    if (p.word) body += `<text x="512" y="930" text-anchor="middle" ${FONT} font-size="${Math.min(110, Math.floor(1000 / Math.max(4, p.word.length)))}" fill="${INK}" letter-spacing="8">${esc(p.word)}</text>`;
  } else if (p.kind === 'stripes') {
    const n = p.count ?? 3;
    for (let i = 0; i < n; i++) body += `<rect x="0" y="${300 + i * 150}" width="${S}" height="80" fill="${INK}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${body}</svg>`;
}

function backSvg(b: BackPrint): string | null {
  if (b.n == null && !b.name) return null;
  let body = '';
  if (b.name) body += `<text x="512" y="250" text-anchor="middle" ${FONT} font-size="130" fill="${INK}" letter-spacing="12">${esc(b.name)}</text>`;
  if (b.n != null) {
    body += `<text x="512" y="800" text-anchor="middle" ${FONT} font-size="500" fill="none" stroke="${INK}" stroke-width="26">${b.n}</text>`;
    body += `<text x="512" y="800" text-anchor="middle" ${FONT} font-size="500" fill="${INK}" fill-opacity="0.55">${b.n}</text>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">${body}</svg>`;
}

/** Render a rival's front and back prints to PNGs in `dir`; returns the paths (absent = no print there). */
export async function writePrints(dir: string, tag: string, front: FrontPrint, back: BackPrint): Promise<{ front?: string; back?: string }> {
  const out: { front?: string; back?: string } = {};
  const f = frontSvg(front), b = backSvg(back);
  if (f) { out.front = join(dir, `${tag}-front.png`); writeFileSync(out.front, await sharp(Buffer.from(f)).png().toBuffer()); }
  if (b) { out.back = join(dir, `${tag}-back.png`); writeFileSync(out.back, await sharp(Buffer.from(b)).png().toBuffer()); }
  return out;
}
