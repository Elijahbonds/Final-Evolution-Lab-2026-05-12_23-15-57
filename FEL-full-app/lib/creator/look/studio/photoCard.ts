// PHOTO MODE'S CARD (CREATOR-PLAN phase 4d, 2026-10-06): a posed shot on a backdrop, in a frame, with the character's
// name and the look's SHARE CODE printed on the card as plain text — anyone can type or paste it into the Studio
// ("Paste a code" on the slot bar) to load the look as a new slot. No QR (no new dependency), no upload: the card is drawn
// on a canvas in the browser and offered as a normal download, so a teen's card never leaves their device either.
//
// Pure layout (cardLayout → a list of draw ops) and a tiny executor over the 2D context (drawCard), so the composition —
// the code string included, every character of it — is tested without a browser.
//
// THE CODE FITS. A typical look's v2 code is 565–1 024 characters (the archetypes, phase 4c), the cap 50 000. The code
// block picks the largest monospace size (22 px down to 7 px on a 1080 px card) whose wrapped lines fit; past that the
// card grows taller rather than ever dropping a character.

export const CARD_W = 1080;
export const CARD_H = 1350;
const PAD = 40;
const SHOT = { x: PAD, y: PAD, w: CARD_W - 2 * PAD, h: 880 };
const CODE_TOP = SHOT.y + SHOT.h + 150;
const CODE_BOTTOM_PAD = 70;
/** Monospace glyph advance as a fraction of the font size (JetBrains Mono / ui-monospace: 0.6). */
export const MONO_ADVANCE = 0.6;
export const CODE_SIZES = [22, 20, 18, 16, 14, 13, 12, 11, 10, 9, 8, 7] as const;
const LINE = 1.3;

export interface CardBackdrop { top: string; bottom: string; glow: string }

/** The card's backdrops: the Studio's own dark frame and the venue moods' skies (lib/babylon/scene/moods.ts colours). */
export const CARD_BACKDROPS: Record<string, CardBackdrop> = {
  studio: { top: '#0C0C11', bottom: '#050505', glow: '#00E5FF' },
  goldenHour: { top: '#2A1E33', bottom: '#0B0710', glow: '#FFB36B' },
  daylight: { top: '#87B7DD', bottom: '#1B2A3A', glow: '#FFFFFF' },
  dojoWarm: { top: '#3A1D14', bottom: '#120806', glow: '#FF9D5C' },
  nightGame: { top: '#0B0E16', bottom: '#020306', glow: '#9FB7FF' },
  alpine: { top: '#A9C7E8', bottom: '#2A3A4E', glow: '#FFF1DC' },
  overcast: { top: '#BCC6D1', bottom: '#3A4048', glow: '#E9EDF2' },
};
export type CardFrame = 'neon' | 'clean' | 'none';
export const CARD_FRAMES: readonly CardFrame[] = ['neon', 'clean', 'none'];

export type CardOp =
  | { op: 'gradient'; x: number; y: number; w: number; h: number; top: string; bottom: string }
  | { op: 'glow'; cx: number; cy: number; r: number; colour: string }
  | { op: 'image'; x: number; y: number; w: number; h: number }
  | { op: 'stroke'; x: number; y: number; w: number; h: number; colour: string; width: number }
  | { op: 'line'; x0: number; y0: number; x1: number; y1: number; colour: string; width: number }
  | { op: 'text'; text: string; x: number; y: number; font: string; colour: string; align: 'left' | 'center' | 'right' };

export interface CardInput {
  /** the character's name (already through the jersey name rule) */
  label: string;
  /** the look's share code, printed whole */
  code: string;
  backdrop?: keyof typeof CARD_BACKDROPS | string;
  frame?: CardFrame;
  accent?: string;
}

export interface CardLayout { w: number; h: number; ops: CardOp[]; codeLines: string[]; codeSize: number }

/** Wrap a code into lines of `perLine` characters (a code has no spaces; every character is kept, in order). */
export function wrapCode(code: string, perLine: number): string[] {
  const n = Math.max(1, Math.floor(perLine));
  const out: string[] = [];
  for (let i = 0; i < code.length; i += n) out.push(code.slice(i, i + n));
  return out.length ? out : [''];
}

/** The largest code size whose lines fit `boxH`, its lines, and the height they need. */
export function fitCode(code: string, boxW: number, boxH: number): { size: number; lines: string[]; height: number } {
  for (const size of CODE_SIZES) {
    const lines = wrapCode(code, boxW / (size * MONO_ADVANCE));
    const height = lines.length * size * LINE;
    if (height <= boxH) return { size, lines, height };
  }
  const size = CODE_SIZES[CODE_SIZES.length - 1];
  const lines = wrapCode(code, boxW / (size * MONO_ADVANCE));
  return { size, lines, height: lines.length * size * LINE };
}

const HEX = /^#[0-9A-Fa-f]{6}$/;

/** The card, as draw ops. */
export function cardLayout(i: CardInput): CardLayout {
  const bd = CARD_BACKDROPS[i.backdrop ?? 'studio'] ?? CARD_BACKDROPS.studio;
  const accent = i.accent && HEX.test(i.accent) ? i.accent : '#00E5FF';
  const frame = i.frame ?? 'neon';
  const boxW = CARD_W - 2 * PAD;
  const room = CARD_H - CODE_TOP - CODE_BOTTOM_PAD;
  const fit = fitCode(i.code, boxW, room);
  const h = Math.max(CARD_H, Math.ceil(CODE_TOP + fit.height + CODE_BOTTOM_PAD));
  const ops: CardOp[] = [
    { op: 'gradient', x: 0, y: 0, w: CARD_W, h, top: bd.top, bottom: bd.bottom },
    { op: 'glow', cx: CARD_W / 2, cy: SHOT.y + SHOT.h * 0.45, r: SHOT.w * 0.55, colour: bd.glow },
    { op: 'image', ...SHOT },
  ];
  if (frame !== 'none') {
    ops.push({ op: 'stroke', x: SHOT.x, y: SHOT.y, w: SHOT.w, h: SHOT.h, colour: frame === 'neon' ? accent : 'rgba(255,255,255,0.35)', width: frame === 'neon' ? 4 : 2 });
    if (frame === 'neon') {
      // corner ticks, the game's HUD language
      const t = 46, x0 = SHOT.x - 12, y0 = SHOT.y - 12, x1 = SHOT.x + SHOT.w + 12, y1 = SHOT.y + SHOT.h + 12;
      for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]] as const) {
        ops.push({ op: 'line', x0: x, y0: y, x1: x + dx * t, y1: y, colour: accent, width: 6 });
        ops.push({ op: 'line', x0: x, y0: y, x1: x, y1: y + dy * t, colour: accent, width: 6 });
      }
    }
  }
  const nameY = SHOT.y + SHOT.h + 78;
  ops.push({ op: 'text', text: (i.label || 'MY LOOK').toUpperCase(), x: PAD, y: nameY, font: '700 64px "Chakra Petch", ui-monospace, monospace', colour: '#F2F5F9', align: 'left' });
  ops.push({ op: 'text', text: 'FINAL EVOLUTION LAB · STUDIO', x: CARD_W - PAD, y: nameY - 6, font: '600 24px "Chakra Petch", ui-monospace, monospace', colour: accent, align: 'right' });
  ops.push({ op: 'text', text: 'SHARE CODE — paste it in the Studio to load this look', x: PAD, y: CODE_TOP - 22, font: '500 22px "Chakra Petch", ui-monospace, monospace', colour: '#8B97A5', align: 'left' });
  fit.lines.forEach((line, k) => {
    ops.push({ op: 'text', text: line, x: PAD, y: CODE_TOP + (k + 1) * fit.size * LINE - fit.size * 0.3, font: `500 ${fit.size}px "JetBrains Mono", ui-monospace, monospace`, colour: '#F2F5F9', align: 'left' });
  });
  return { w: CARD_W, h, ops, codeLines: fit.lines, codeSize: fit.size };
}

/** The 2D context calls drawCard makes (a CanvasRenderingContext2D satisfies it). */
export interface Card2D {
  fillStyle: unknown; strokeStyle: unknown; lineWidth: number; font: string; textAlign: string; textBaseline: string;
  fillRect(x: number, y: number, w: number, h: number): void;
  strokeRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; stroke(): void;
  fillText(t: string, x: number, y: number): void;
  drawImage(img: unknown, x: number, y: number, w: number, h: number): void;
  createLinearGradient(x0: number, y0: number, x1: number, y1: number): { addColorStop(o: number, c: string): void };
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): { addColorStop(o: number, c: string): void };
}

/** Fit an image of w×h inside a box, centred (contain). */
export function containRect(w: number, h: number, box: { x: number; y: number; w: number; h: number }): { x: number; y: number; w: number; h: number } {
  if (!(w > 0 && h > 0)) return { ...box };
  const k = Math.min(box.w / w, box.h / h);
  const W = w * k, H = h * k;
  return { x: box.x + (box.w - W) / 2, y: box.y + (box.h - H) / 2, w: W, h: H };
}

const withAlpha = (hex: string, a: number): string => {
  if (!HEX.test(hex)) return `rgba(0,229,255,${a})`;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Draw the card's ops; `shot` is the posed render (any drawable), `shotSize` its pixel size. */
export function drawCard(ctx: Card2D, layout: CardLayout, shot: unknown, shotSize: { w: number; h: number }): void {
  for (const o of layout.ops) {
    switch (o.op) {
      case 'gradient': {
        const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
        g.addColorStop(0, o.top); g.addColorStop(1, o.bottom);
        ctx.fillStyle = g; ctx.fillRect(o.x, o.y, o.w, o.h);
        break;
      }
      case 'glow': {
        const g = ctx.createRadialGradient(o.cx, o.cy, 0, o.cx, o.cy, o.r);
        g.addColorStop(0, withAlpha(o.colour, 0.35)); g.addColorStop(1, withAlpha(o.colour, 0));
        ctx.fillStyle = g; ctx.fillRect(o.cx - o.r, o.cy - o.r, o.r * 2, o.r * 2);
        break;
      }
      case 'image': { const r = containRect(shotSize.w, shotSize.h, o); if (shot) ctx.drawImage(shot, r.x, r.y, r.w, r.h); break; }
      case 'stroke': ctx.strokeStyle = o.colour; ctx.lineWidth = o.width; ctx.strokeRect(o.x, o.y, o.w, o.h); break;
      case 'line': ctx.strokeStyle = o.colour; ctx.lineWidth = o.width; ctx.beginPath(); ctx.moveTo(o.x0, o.y0); ctx.lineTo(o.x1, o.y1); ctx.stroke(); break;
      case 'text': ctx.font = o.font; ctx.fillStyle = o.colour; ctx.textAlign = o.align; ctx.textBaseline = 'alphabetic'; ctx.fillText(o.text, o.x, o.y); break;
    }
  }
}

/** The download's file name: the character's name, safe for any file system. */
export function photoFileName(label: string): string {
  const slug = (label || 'look').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'look';
  return `fel-look-${slug}.png`;
}

/** The posed shot's render size (px) for the card: the card's shot box, or three quarters of it on a phone (memory). */
export function shotRenderSize(tier: 'desktop' | 'mobile'): { width: number; height: number } {
  const k = tier === 'mobile' ? 0.75 : 1;
  return { width: Math.round(SHOT.w * k), height: Math.round(SHOT.h * k) };
}
