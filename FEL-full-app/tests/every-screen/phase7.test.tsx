// EVERY-SCREEN P7 (2026-11-11): "Around the games" — what phase 7 changed on the screens around play (never play itself,
// never a feel number), as tests that fail on the code before it.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameLoading, GAME_LOADING } from '@/components/games/game-loading';
import { FIT_MIN, fitScale } from '@/lib/ui/controlsScreen';

const src = (p: string) => readFileSync(p, 'utf8');

describe('a game says what it is loading', () => {
  it('the shared loader is a status with words', () => {
    const html = renderToStaticMarkup(h(GameLoading));
    expect(html).toContain('role="status"');
    expect(html).toContain(GAME_LOADING);
  });
  it('no bare spinner is left in the games\' loaders (there were 35 copies)', () => {
    let files: string[] = [];
    try { files = execFileSync('grep', ['-rl', 'flex h-\\[60vh\\] items-center justify-center', 'app', 'components'], { encoding: 'utf8' }).split('\n').filter(Boolean); }
    catch { files = []; }                                       // grep finds nothing: exit 1
    const out = files.filter((f) => /<div className="flex h-\[60vh\] items-center justify-center">\s*<Loader2 className="h-8 w-8 animate-spin/.test(src(f)));
    expect(out).toEqual([]);
  });
});

describe('the start card: readable controls, 44 px buttons', () => {
  it('the fit never takes the controls under 12 px (14 px rows, floor 0.86)', () => {
    expect(FIT_MIN).toBe(0.86);
    expect(14 * fitScale(() => true)).toBeGreaterThanOrEqual(12);
    const p = src('components/games/controls-panel.tsx');
    expect(p).toContain('font-mono text-[14px] font-black text-[#22d3ee]">{r.input}');
    expect(p).toContain('<span data-controls-lines className="[zoom:var(--fel-controls-fit,1)] block shrink-0');   // lines fit with the rows on a pad (14 px, never under 12); P10: the panel scrolls as a whole
    // P10: a line is 14 px, or 16 px when it runs past 12 words (lineSize), except on a pad, where the fit still steps it down
    expect(p).toContain("font-mono ${device === 'pad' ? 'text-[14px]' : lineSize(l, 'text-[14px]')} leading-snug text-white/75`}>· {l}");
  });
  it('the device tabs, the motion chip and "Next card" are 44 px', () => {
    expect(src('components/games/controls-panel.tsx')).toContain('inline-flex min-h-11 items-center rounded-full border px-3 text-[12px] font-black');
    expect(src('components/settings/motion-setting.tsx')).toContain('inline-flex min-h-11 items-center rounded-full border px-3 text-[12px] font-black');
    expect(src('components/learn/learn-while-you-wait.tsx')).toContain('inline-flex min-h-11 items-center rounded-full bg-white/10 px-3');
  });
});

describe('around the games: 44 px targets', () => {
  it('party room, party hub, multiplayer, calibrate, venues, host, the creator games', () => {
    expect(src('components/party/party-room.tsx')).toContain('aria-label="Back to Play" className="grid h-11 w-11');
    expect(src('components/party/social/party-hub.tsx')).toContain('inline-flex min-h-11 items-center font-semibold text-[#00E5FF] underline underline-offset-2">Got a code? Join a game');
    expect(src('components/mp/multiplayer-lobby.tsx')).toContain('inline-flex min-h-11 items-center gap-2 rounded-xl px-3 py-2');
    expect(src('app/play/calibrate/_components/calibrate-client.tsx')).toContain('inline-flex min-h-11 shrink-0 items-center text-[#00E5FF]');
    expect(src('app/venues/page.tsx')).toContain('inline-flex min-h-11 items-center gap-2 rounded-xl border');
    expect(src('components/controller-link/host-stage.tsx')).toContain('minHeight: 44');
    for (const f of ['components/games/acting-game.tsx', 'components/games/irl-game.tsx']) expect(src(f)).toContain('<Link href="/creator" className="inline-flex min-h-11 items-center');
  });
});

describe('the movement check\'s header (a training screen, from phase 6\'s picture)', () => {
  it('wraps on a phone: the title keeps 12rem, the camera buttons take their own row', () => {
    const u = src('app/play/mirror/assess/_components/screen-ui.tsx');
    expect(u).toContain('<header className="mb-3 flex flex-wrap items-center gap-3">');
    expect(u).toContain('<div className="min-w-[12rem] flex-1">');
  });
});
