// THE BOARDS' FACES (vis-hoops-dunk, 2026-10-14): what the 3D scoreboards and the judges' cards say, as pure painters over a 2-D
// context (a test passes a recording one) and pure number formatting. Display only: every number a painter prints is one the HUD
// already shows, read by the mode and passed in. Nothing here decides a score.

export const BOARD_FONT = '"JetBrains Mono", "DM Sans", ui-monospace, sans-serif';

/** Pure: a clock's seconds as the board shows them — whole seconds, never negative, '--' for no clock (a practice rack). */
export function clockText(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '--';
  return String(Math.max(0, Math.ceil(sec)));
}

/** Pure: the clock's colour — calm cyan, amber under 20 seconds, red under 10. */
export function clockHex(sec: number | null | undefined): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec)) return '#7b8794';
  return sec <= 10 ? '#ff5d5d' : sec <= 20 ? '#ffb454' : '#7ee7ff';
}

/** Pure: a score as the board shows it — an integer, never negative, '-' when there is none. */
export function scoreText(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  return String(Math.max(0, Math.round(n)));
}

/** Pure: a judge's card, 0..10 (one decimal) or a 30..50 raw card — the colour a score reads in: gold, cyan, amber, red. */
export function cardHex(frac01: number): string {
  const f = Number.isFinite(frac01) ? Math.max(0, Math.min(1, frac01)) : 0;
  return f >= 0.85 ? '#ffd75e' : f >= 0.6 ? '#22d3ee' : f >= 0.3 ? '#ff9d5c' : '#ef4444';
}

type G = CanvasRenderingContext2D;

function frame(g: G, w: number, h: number, accent: string): void {
  g.fillStyle = '#05080f'; g.fillRect(0, 0, w, h);
  g.fillStyle = accent; g.fillRect(0, 0, w, Math.round(h * 0.035)); g.fillRect(0, h - Math.round(h * 0.035), w, Math.round(h * 0.035));
}
function text(g: G, s: string, x: number, y: number, px: number, color: string, align: CanvasTextAlign = 'center'): void {
  g.fillStyle = color; g.font = `bold ${px}px ${BOARD_FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillText(s, x, y);
}
/** The LED matrix: a dark dot grid laid over the lit paint, so a board reads as a board at ten feet and not as a flat poster. */
function matrix(g: G, w: number, h: number): void {
  g.fillStyle = 'rgba(0,0,0,0.42)';
  for (let y = 0; y < h; y += 6) g.fillRect(0, y, w, 2);
}

export interface ShootoutBoard {
  score: number; rack: number; racks: number; clock: number | null; streak: number; fireAt: number; moneyRack: boolean;
}
/** The 3-Point Contest's board: the score, the rack with its pips, the clock, and a flame under a streak. */
export function paintShootout(g: G, w: number, h: number, s: ShootoutBoard): void {
  frame(g, w, h, s.streak >= s.fireAt ? '#ff8a3d' : '#22d3ee');
  text(g, '3-POINT CONTEST', w * 0.5, h * 0.13, h * 0.11, '#9fb3c8');
  text(g, 'SCORE', w * 0.17, h * 0.3, h * 0.09, '#9fb3c8');
  text(g, scoreText(s.score), w * 0.17, h * 0.62, h * 0.4, '#ffd75e');
  text(g, `RACK ${Math.min(s.racks, s.rack + 1)}/${s.racks}`, w * 0.5, h * 0.3, h * 0.11, '#ffffff');
  for (let i = 0; i < s.racks; i++) {
    const x = w * 0.5 + (i - (s.racks - 1) / 2) * h * 0.2, lit = i <= s.rack;
    g.fillStyle = lit ? (s.moneyRack && i === s.rack ? '#ffd23f' : '#22d3ee') : '#243244';
    g.beginPath(); g.arc(x, h * 0.55, h * 0.065, 0, Math.PI * 2); g.fill();
  }
  text(g, s.streak >= s.fireAt ? 'ON FIRE' : s.streak > 1 ? `${s.streak} IN A ROW` : 'FEL', w * 0.5, h * 0.8, h * 0.1, s.streak >= s.fireAt ? '#ff8a3d' : '#5b6b7e');
  text(g, 'TIME', w * 0.83, h * 0.3, h * 0.09, '#9fb3c8');
  text(g, clockText(s.clock), w * 0.83, h * 0.62, h * 0.4, clockHex(s.clock));
  matrix(g, w, h);
}

export interface DuelBoard { p1: number; p2: number; up: 0 | 1; dunk: string; names: [string, string]; colors: [string, string] }
/** The duel's tower: both totals, who has the floor, which dunk of the match. */
export function paintDuel(g: G, w: number, h: number, s: DuelBoard): void {
  frame(g, w, h, s.colors[s.up]);
  text(g, 'DUNK DUEL', w * 0.5, h * 0.12, h * 0.1, '#9fb3c8');
  for (const i of [0, 1] as const) {
    const x = w * (i === 0 ? 0.25 : 0.75), on = s.up === i, c = s.colors[i];
    if (on) { g.fillStyle = `${c}33`; g.fillRect(x - w * 0.22, h * 0.2, w * 0.44, h * 0.7); }
    text(g, s.names[i], x, h * 0.27, h * 0.1, on ? '#ffffff' : '#7b8794');
    text(g, scoreText(i === 0 ? s.p1 : s.p2), x, h * 0.6, h * 0.36, on ? c : '#9fb3c8');
    g.fillStyle = c; g.fillRect(x - w * 0.18, h * 0.84, w * 0.36, h * (on ? 0.035 : 0.015));
  }
  text(g, s.dunk, w * 0.5, h * 0.62, h * 0.075, '#5b6b7e');
  matrix(g, w, h);
}

/** One judge's card on the table: a label over a big number. `read` is the card's fraction of its best (the colour), `shown` the text. */
export function paintCard(g: G, w: number, h: number, label: string, shown: string, read01: number): void {
  const c = cardHex(read01);
  g.fillStyle = '#070b14'; g.fillRect(0, 0, w, h);
  g.strokeStyle = c; g.lineWidth = Math.round(h * 0.045); g.strokeRect(h * 0.03, h * 0.03, w - h * 0.06, h - h * 0.06);
  text(g, label, w / 2, h * 0.18, h * 0.14, '#9fb3c8');
  text(g, shown, w / 2, h * 0.6, h * 0.5, c);
}
export function paintCardBlank(g: G, w: number, h: number): void {
  g.fillStyle = '#0b111c'; g.fillRect(0, 0, w, h);
}
