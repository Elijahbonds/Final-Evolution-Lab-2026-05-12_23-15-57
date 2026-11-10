// EVERY-SCREEN phase 1: contact sheets (JPG, phone width) for the owner.
//
//   npx tsx scripts/every-screen/sheet.mts worst [n=15]                         the n worst-scoring screens of the last crawl
//   npx tsx scripts/every-screen/sheet.mts pairs <out.jpg> <title> a.jpg:b.jpg:caption …   before / after pairs
//
// Reads the crawl's shots from <ES_OUT>; writes into <ES_OUT>. No browser, no server.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { STATE } from './rig.mts';
import { readResults } from './results.mts';
import * as judgeNs from '../../lib/every-screen/judge.ts';

const { judge } = ((judgeNs as { default?: unknown }).default ?? judgeNs) as typeof judgeNs;
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** break a caption into lines of about `n` characters */
const wrap = (s: string, n: number, max: number) => { const out: string[] = []; let line = ''; for (const w of s.split(/\s+/)) { if ((line + ' ' + w).trim().length > n) { out.push(line.trim()); line = w; } else line += ' ' + w; } if (line.trim()) out.push(line.trim()); return out.slice(0, max); };

interface Tile { file: string; title: string; lines: string[] }
const W = 300, H = Math.round(W * 844 / 390), CAP = 96, GAP = 14;

async function sheet(tiles: Tile[], cols: number, heading: string, out: string): Promise<void> {
  const rows = Math.ceil(tiles.length / cols);
  const width = GAP + cols * (W + GAP), height = 56 + rows * (H + CAP + GAP) + GAP;
  const parts: OverlayOptions[] = [];
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#0b0b10"/><text x="${GAP}" y="36" font-family="sans-serif" font-size="22" font-weight="700" fill="#ffffff">${xml(heading)}</text>`;
  for (let i = 0; i < tiles.length; i++) {
    const x = GAP + (i % cols) * (W + GAP), y = 56 + Math.floor(i / cols) * (H + CAP + GAP);
    const t = tiles[i];
    if (existsSync(t.file)) parts.push({ input: await sharp(t.file).resize({ width: W, height: H, fit: 'cover', position: 'top' }).jpeg().toBuffer(), left: x, top: y });
    svg += `<rect x="${x - 1}" y="${y - 1}" width="${W + 2}" height="${H + 2}" fill="none" stroke="#33343d"/>`;
    svg += `<text x="${x}" y="${y + H + 20}" font-family="sans-serif" font-size="15" font-weight="700" fill="#7dd3fc">${xml(t.title.slice(0, 38))}</text>`;
    t.lines.forEach((l, k) => { svg += `<text x="${x}" y="${y + H + 40 + k * 17}" font-family="sans-serif" font-size="13" fill="#d7dbe3">${xml(l)}</text>`; });
  }
  svg += '</svg>';
  await sharp(Buffer.from(svg)).composite(parts).jpeg({ quality: 82 }).toFile(out);
  console.log(out);
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'worst') {
  const n = Number(rest[0] ?? 15);
  const scored = readResults().filter((r) => r.state === 'scored' && r.facts && r.shot).map((r) => ({ r, v: judge(r.facts!) }));
  // worst = most checks failed, then the heaviest faults
  const rank = (v: ReturnType<typeof judge>) => Object.values(v.checks).filter((c) => c === 'fail').length * 1000 + v.faults.slice(0, 4).reduce((a, f) => a + f.weight, 0);
  const worst = scored.sort((a, b) => rank(b.v) - rank(a.v)).slice(0, n);
  await sheet(worst.map(({ r, v }) => ({ file: r.shot!, title: r.route, lines: [`fails ${Object.entries(v.checks).filter(([, c]) => c === 'fail').length} of 4 checks`, ...wrap(v.worst?.say ?? '', 44, 3)] })), 5, `The ${n} worst screens at the start (phone, 390 px)`, join(STATE, `worst-${n}.jpg`));
} else if (mode === 'pairs') {
  const [out, title, ...pairs] = rest;
  const tiles: Tile[] = [];
  for (const p of pairs) { const [a, b, ...cap] = p.split(':'); tiles.push({ file: a, title: 'before', lines: wrap(cap.join(':'), 44, 4) }, { file: b, title: 'after', lines: [] }); }
  await sheet(tiles, 4, title, out);
} else { console.error('usage: sheet.mts worst [n] | pairs <out.jpg> <title> before.jpg:after.jpg:caption …'); process.exit(2); }
