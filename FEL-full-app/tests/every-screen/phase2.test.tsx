// EVERY-SCREEN phase 2 (2026-11-10): from opening the app to finishing a workout. Each change here fails on the old code.
//   1. the player asks for a tap only when a set needs marking (a coached 18-set session was 37 taps following the screen)
//   2. Train's first card starts today's session (a coached client) or the program kept on this phone (an athlete alone)
//   3. the status rail and the game header: 44 px targets, and the rail's place held while the session loads
//   4. long lines (more than 12 words) are body size, wording unchanged
import { describe, expect, it } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SessionPlayer } from '@/components/session-player/session-player';
import type { Session } from '@/lib/session-player/model';
import type { PlayerState } from '@/lib/session-player/machine';
import { TODAY_HREF, TODAY_START_HREF, todayCardHref } from '@/lib/coach/todayCard';
import { RESUME_PROGRAM_HREF, ResumeProgramView, resumeView } from '@/components/every-screen/resume-program-card';
import { TYPE, lineSize } from '@/lib/design/type';
import { isSignedInOnly } from '@/lib/screen/config';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const SESSION: Session = { id: 's', title: 'Today', steps: [
  { exId: 'goblet', name: 'Goblet Squat', sets: 2, reps: '8', workSeconds: null, restSeconds: 60, setup: 'Hold the bell.', cue: null, clip: null },
  { exId: 'plank', name: 'Plank', sets: 1, reps: '30 s', workSeconds: 30, restSeconds: 0, setup: 'On the floor.', cue: null, clip: null },
] };
const at = (o: Partial<PlayerState>): PlayerState => ({ phase: 'work', step: 0, set: 1, leftMs: null, fullMs: null, paused: false, elapsedMs: 0, setsDone: 0, ...o });
const screen = (initial: PlayerState) => renderToStaticMarkup(h(SessionPlayer, { session: SESSION, initial, mode: 'device', onClose: () => {} } as never));
const asks = (html: string) => /data-player-asks="1"/.test(html);

describe('1. the session player asks for a tap only when the screen needs the person', () => {
  it('a counted set: the bright button, Set done', () => {
    const html = screen(at({ phase: 'work', step: 0 }));
    expect(asks(html)).toBe(true);
    expect(html).toMatch(/ data-fel-primary="/);
  });
  it('the ready count, a rest and a timed set run by themselves: a quiet skip, not the call to action', () => {
    for (const st of [at({ phase: 'ready', leftMs: 5000, fullMs: 5000 }), at({ phase: 'rest', set: 2, leftMs: 60000, fullMs: 60000 }), at({ phase: 'work', step: 1, leftMs: 30000, fullMs: 30000 })]) {
      const html = screen(st);
      expect(asks(html), st.phase).toBe(false);
      expect(html, st.phase).not.toMatch(/ data-fel-primary="/);   // the attribute, not the column's class that names it
      expect(html, st.phase).toContain('data-player-primary');      // still one tap to skip
    }
  });
  it('paused: the bright Resume', () => {
    expect(asks(screen(at({ phase: 'rest', set: 2, leftMs: 60000, fullMs: 60000, paused: true })))).toBe(true);
  });
});

describe('2. Train\'s first card starts today', () => {
  it('a coached client\'s session card starts the session; an off day or a plan-only card opens Today', () => {
    const base = { kind: 'session' as const, programName: 'B', coachName: 'C', blockLabel: 'W1', sessionLabel: 'D1', index: 0, total: 8 };
    expect(todayCardHref({ ...base, exercises: 5, offDay: false })).toBe(TODAY_START_HREF);
    expect(todayCardHref({ ...base, exercises: 0, offDay: true })).toBe(TODAY_HREF);
    expect(todayCardHref({ kind: 'open', programName: 'B', coachName: 'C' })).toBe(TODAY_HREF);
    expect(read('app/coach/_components/today-view.tsx')).toMatch(/get\('start'\) === 'today'/);
  });
  it('an athlete alone with a program on this phone: Train shows it first, one tap to its next session', () => {
    const program = { title: 'Band full body', weeks: [{ days: [{}, {}, {}] }, { days: [{}, {}, {}] }] };
    const v = resumeView({ question: 'band', edits: {}, program, programId: 'p', savedAt: '', startedAt: null, done: { 'w1:d1': 'x' }, decisions: [] } as never);
    expect(v).toEqual({ title: 'Band full body', done: 1, total: 6 });
    expect(resumeView(null)).toBeNull();
    const html = renderToStaticMarkup(h(ResumeProgramView, { view: v! }));
    expect(html).toContain(`href="${RESUME_PROGRAM_HREF.replace('&', '&amp;')}"`);
    expect(html).toContain('1 of 6 sessions done');
    const page = read('app/train/page.tsx');
    expect(page.indexOf('<TodayCard')).toBeLessThan(page.indexOf('<DailyDrillCard'));
    expect(page.indexOf('<ResumeProgramCard')).toBeLessThan(page.indexOf('<DailyDrillCard'));
    expect(read('components/program-ask/program-builder.tsx')).toMatch(/get\('start'\) === 'today'/);
  });
});

describe('3. the bars: 44 px targets, and the rail does not arrive late', () => {
  const rail = read('components/shell/status-rail.tsx');
  it('no rail target under 44 px (it had min-h-10, h-10 w-10, and a 26 px wallet link)', () => {
    expect(rail).not.toMatch(/\bmin-h-10\b|\bh-10 w-10\b/);
    expect(rail).toContain('className="inline-flex min-h-11 items-center transition-transform');
  });
  it('on a signed-in-only path the rail is drawn while the session loads, so nothing moves when it fills', () => {
    expect(rail).toMatch(/status === 'loading' && isSignedInOnly\(pathname\)/);
    expect(isSignedInOnly('/train')).toBe(true);
    expect(isSignedInOnly('/')).toBe(false);
  });
  it('the game header: Home, body play, the graphics menu, pause and full screen are 44 px; the late parts hold their place', () => {
    const shell = read('components/games/game-shell.tsx');
    expect(shell).toContain('flex min-h-11 shrink-0 items-center gap-1.5');
    expect(shell).toContain('grid h-11 w-11 place-items-center rounded-md');
    expect(shell).toContain('invisible whitespace-nowrap');
    expect(read('components/games/graphics-toggle.tsx')).toContain('h-11 rounded-md');
    expect(read('components/games/body-control.tsx')).toContain('inline-flex min-h-11 items-center');
    expect(read('components/games/pause-button.tsx')).toContain('grid h-11 w-11');
  });
});

describe('4. a long line is body size, a short one keeps its look', () => {
  it('more than 12 words: TYPE.body; 12 or fewer: TYPE.small', () => {
    expect(lineSize('Time a sprint with your camera. Every number is an estimate. 18 and over.')).toBe(TYPE.body);
    expect(lineSize('Your numbers over time.')).toBe(TYPE.small);
    expect(lineSize(null)).toBe(TYPE.small);
  });
  it('the shared parts use it: the TabPage lede and the ListRow line', () => {
    expect(read('components/shell/tab-page.tsx')).toContain('lineSize(lede)');
    expect(read('components/ui/fel/cards.tsx')).toContain('lineSize(line)');
  });
});
