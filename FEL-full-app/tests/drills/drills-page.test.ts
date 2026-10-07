// Mirror & coaching plan Phase 6 (2026-10-07): /play/drills as the server renders it, and the links into it from /train
// and from the Playbook's chapter reader. app/ is outside the vitest include, so the pages are rendered from here
// (tests/mirror-first/train-quick-screen.test.ts's way). The server page is rendered for an adult, a minor, a hard stop
// and a context that would not load; every database call it makes is recorded, and none may write.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { WarmupContext } from '@/lib/coach/warmup';

const h = vi.hoisted(() => ({
  ops: [] as string[],
  userId: 'u-adult' as string | null,
  dobYear: 1990 as number | null,
  ctx: null as unknown,
  ctxThrows: false,
}));
vi.mock('next-auth', () => ({ getServerSession: async () => (h.userId ? { user: { id: h.userId } } : null) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`NEXT_REDIRECT ${to}`); },
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: new Proxy({}, {
    get: (_t, table: string) => (table === 'then' ? undefined : new Proxy({}, {
      get: (_u, op: string) => async () => {
        h.ops.push(`${table}.${op}`);
        if (table === 'user' && op === 'findUnique') return { dobYear: h.dobYear };
        return op === 'count' ? 0 : op === 'findMany' ? [] : null;
      },
    })),
  }),
}));
vi.mock('@/lib/coach/warmupServer', () => ({
  loadWarmupContext: async () => {
    h.ops.push('loadWarmupContext');
    if (h.ctxThrows) throw new Error('db down');
    return h.ctx;
  },
}));
vi.mock('@/components/shell/tab-page', () => ({ TabPage: (p: { children?: ReactNode }) => createElement('div', null, p.children) }));
vi.mock('@/components/shell/doors-row', () => ({ DoorsRow: () => null }));

import DrillsPage from '@/app/play/drills/page';
import TrainPage from '@/app/train/page';
import { ChapterReader } from '@/components/education/chapter-reader';
import { chapterByNumber } from '@/lib/education/course';
import { NOTE_COPY } from '@/lib/coach/warmup';
import { LANDING_UNLOCK_LIVE, ROUTE_DRILLS } from '@/lib/drills/route';
import { drillsAccess } from '@/lib/drills/access';
import { LANDING_CHECK_HREF } from '@/lib/coach/protocolGate';
import { DrillsApp } from '@/app/play/drills/_components/drills-app';

const ADULT: WarmupContext = {
  isYouth: false, painDecision: null, zone: null, screen: 'none', screenAt: null, hardStopped: false,
  jumpGate: { closed: false, why: '', href: null },
};
const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
/** The href of the one <a> carrying `attr` (attribute order is React's business, not the test's). */
const hrefOf = (html: string, attr: string): string | null => {
  const tag = new RegExp(`<a [^>]*${attr.replace(/[[\]?]/g, '\\$&')}[^>]*>`).exec(html)?.[0];
  return tag ? /href="([^"]*)"/.exec(tag)?.[1] ?? null : null;
};
const render = async (drill?: string) => renderToStaticMarkup(await DrillsPage({ searchParams: drill ? { drill } : {} }));

beforeEach(() => {
  h.ops = []; h.userId = 'u-adult'; h.dobYear = 1990; h.ctx = ADULT; h.ctxThrows = false;
});

describe('/play/drills, signed in only', () => {
  it('signed out: the login page, coming back to the drill asked for', async () => {
    h.userId = null;
    await expect(render()).rejects.toThrow('NEXT_REDIRECT /login?next=%2Fplay%2Fdrills');
    await expect(render('safe-landing')).rejects.toThrow(`NEXT_REDIRECT /login?next=${encodeURIComponent('/play/drills?drill=safe-landing')}`);
  });
});

describe('the shelf', () => {
  it('an adult with every check open: the five Playbook drills, each linking its page; nothing held, nothing written', async () => {
    const html = await render();
    for (const d of ROUTE_DRILLS) expect(hrefOf(html, `data-drill-card="${d.id}"`)).toBe(`/play/drills?drill=${d.id}`);
    expect(html).not.toContain('data-drill-gate');
    expect(html).not.toContain('data-drill-note');
    expect(text(html)).toContain('Nothing from a drill is saved or sent');
    expect(html).toMatch(/href="\/train"/);
    expect(h.ops.every((o) => /\.(findUnique|findFirst|findMany|count)$|^loadWarmupContext$/.test(o)), h.ops.join()).toBe(true);
  });

  it('a minor\'s account: the youth line, the jumping drills wait, the Wake-Up runs its calm phases — and nothing is written', async () => {
    h.dobYear = 2012;
    h.ctx = { ...ADULT, isYouth: true };
    const html = await render();
    expect(text(html)).toContain(text(NOTE_COPY.youth_impact));
    expect(html).toMatch(/data-drill-card="pogo-bilateral"[\s\S]*?data-drill-gate="held"/);
    expect(html).toMatch(/data-drill-card="safe-landing"[\s\S]*?data-drill-gate="held"/);
    expect(html).toMatch(/data-drill-card="wake-up"[\s\S]*?data-drill-gate="trimmed"/);
    expect(h.ops.every((o) => /\.(findUnique|findFirst|findMany|count)$|^loadWarmupContext$/.test(o)), h.ops.join()).toBe(true);
  });

  it('a minor opening a jumping drill directly: its page, the reason, and no camera button', async () => {
    h.dobYear = 2012;
    h.ctx = { ...ADULT, isYouth: true };
    const html = await render('pogo-unilateral');
    expect(html).toContain('data-drill-page="pogo-unilateral"');
    expect(html).not.toContain('data-drill-start');
    expect(text(html)).toContain(text(NOTE_COPY.youth_impact));
  });

  it('a minor\'s Wake-Up: the camera button, and the phases left out named', async () => {
    h.dobYear = 2012;
    h.ctx = { ...ADULT, isYouth: true };
    const html = await render('wake-up');
    expect(html).toContain('data-drill-start');
    expect(text(html)).toContain('Left out today: Build the Rhythm, Prime the Launch.');
    expect(text(html)).not.toMatch(/Pogos: bounce on the balls/);      // the held phase's cue is not listed to run
  });

  it('a standing intake red flag: the pause card and no drill', async () => {
    h.ctx = { ...ADULT, hardStopped: true };
    const html = await render('safe-landing');
    expect(html).toContain('data-drill-hard-stop');
    expect(html).not.toContain('data-drill-card');
    expect(html).not.toContain('data-drill-start');
    expect(text(html)).toContain("This isn't a diagnosis");
  });

  it('the context would not load: the careful version, said as such (not "under 18")', async () => {
    h.ctxThrows = true;
    const html = await render();
    expect(text(html)).toContain(text(NOTE_COPY.context_unavailable));
    expect(html).toMatch(/data-drill-card="safe-landing"[\s\S]*?data-drill-gate="held"/);
  });
});

describe('a drill\'s page', () => {
  it('where it is written, how the camera adapts it, the book\'s own steps, the chapter, the 3D demo, the camera button', async () => {
    const html = await render('safe-landing');
    const t = text(html);
    expect(html).toContain('data-drill-page="safe-landing"');
    expect(t).toContain('Playbook ch. 6 · Drill 3: The Safe Landing Check');
    expect(t).toContain('On camera: The book steps off a 12-inch box.');
    expect(html).toContain('data-drill-book');
    expect(t).toContain('Step off a 12-inch box (or a stair step) — do not jump.');   // verbatim from the book
    expect(hrefOf(html, 'data-drill-chapter-link')).toBe('/education/playbook/6');
    expect(html).toContain('data-drill-demo-watch');
    expect(html).toContain('data-drill-start');
    // the camera is not asked for by the page: it waits for the tap
    expect(html).not.toContain('data-drill-live');
  });

  it('an unknown ?drill= is the shelf', async () => {
    const html = await render('wall-drive');
    expect(html).not.toContain('data-drill-page');
    expect(html).toContain('data-drill-card="wake-up"');
  });
});

describe('linked from /train and from the Playbook', () => {
  it('/train has a Drills card to /play/drills, and still reads no age to draw its cards', async () => {
    h.ops = [];
    const html = renderToStaticMarkup(await TrainPage());
    expect(html).toMatch(/<a [^>]*href="\/play\/drills"/);
    expect(text(html)).toContain('Drills');
    expect(h.ops.some((o) => o.startsWith('user.'))).toBe(false);
  });

  it('a chapter 6 drill lesson offers "Run it on camera" to its drill; a concept lesson does not', () => {
    const ch6 = chapterByNumber(6)!;
    const landing = ch6.lessons.find((l) => l.key === 'the-safe-landing-check')!;
    const html = renderToStaticMarkup(createElement(ChapterReader, { chapter: { ...ch6, lessons: [landing, ...ch6.lessons.filter((l) => l !== landing)] } }));
    expect(html).toMatch(/href="\/play\/drills\?drill=safe-landing"[^>]*data-drill-link="safe-landing"/);
    expect(text(html)).toContain('Run it on camera: Safe Landing Check');
    const concept = renderToStaticMarkup(createElement(ChapterReader, { chapter: ch6 }));   // opens on "How a Jump Actually Works"
    expect(concept).not.toContain('data-drill-link');
  });

  it('every chapter 5 phase lesson offers the Wake-Up', () => {
    const ch5 = chapterByNumber(5)!;
    for (const key of ['release-the-locks', 'pressurize-the-system', 'build-the-rhythm', 'prime-the-launch']) {
      const l = ch5.lessons.find((x) => x.key === key)!;
      const html = renderToStaticMarkup(createElement(ChapterReader, { chapter: { ...ch5, lessons: [l] } }));
      expect(html, key).toMatch(/href="\/play\/drills\?drill=wake-up"/);
    }
  });

  it('the reader mounts the link beside the camera link (one import, one line)', () => {
    const src = readFileSync('components/education/chapter-reader.tsx', 'utf8');
    expect(src).toMatch(/<DrillsLink lessonId=\{id\} \/>/);
  });
});

describe('"Do the 1-minute landing check to unlock" (owner, 2026-10-07: keep the jump gate, offer the way through it)', () => {
  const LANDING = { ...ADULT, jumpGate: { closed: true, why: 'Jumps and drops wait for a landing check: the jump test in the Quick Screen.', href: LANDING_CHECK_HREF } };
  const app = (ctx: WarmupContext, drillId: string | null, unlockLive?: boolean) => renderToStaticMarkup(createElement(DrillsApp, {
    access: drillsAccess(ctx), drillId, lessons: [], dobYear: 1990,
    ...(unlockLive === undefined ? {} : { unlockLive }),
  }));

  it('ON as shipped (round 3: the Quick Screen now stores the landing check where the gate reads it) — on the page itself', async () => {
    expect(LANDING_UNLOCK_LIVE).toBe(true);
    h.ctx = LANDING;
    expect(hrefOf(await render(), 'data-drill-landing-unlock')).toBe('/screen');
    expect(hrefOf(await render('pogo-bilateral'), 'data-drill-landing-unlock')).toBe('/screen');
    // the note's own link goes in at the Quick Screen's front page too, never past its age step
    expect(await render()).not.toMatch(/href="\/play\/mirror\/assess/);
  });

  it('switched off (the one constant): no button anywhere', () => {
    for (const id of [null, 'pogo-bilateral', 'wake-up']) expect(app(LANDING, id, false)).not.toContain('data-drill-landing-unlock');
  });

  it('switched on: on the shelf, on a held drill\'s page and on the Wake-Up\'s page with its jumps left out — each to /screen', () => {
    for (const [id, where] of [[null, 'shelf'], ['pogo-bilateral', 'held'], ['safe-landing', 'held'], ['wake-up', 'trimmed']] as const) {
      const html = app(LANDING, id, true);
      expect(hrefOf(html, 'data-drill-landing-unlock'), `${where} ${id}`).toBe('/screen');
      expect(text(html)).toContain('Do the 1-minute landing check to unlock');
    }
    // a drill the gate does not hold: no button on its page
    expect(app(LANDING, 'countermovement-geometry', true)).not.toContain('data-drill-landing-unlock');
  });

  it('switched on, it is still only for the landing check: not for youth, a health answer, or a gate that is open', () => {
    expect(app({ ...LANDING, isYouth: true }, null, true)).not.toContain('data-drill-landing-unlock');
    expect(app({ ...ADULT, jumpGate: { closed: true, why: 'x', href: '/play/mirror' } }, null, true)).not.toContain('data-drill-landing-unlock');
    expect(app(ADULT, null, true)).not.toContain('data-drill-landing-unlock');
  });

  it('coming back re-reads the gate: the page is rendered per request, and the client refreshes it on return', () => {
    const page = readFileSync('app/play/drills/page.tsx', 'utf8');
    expect(page).toMatch(/export const dynamic = 'force-dynamic'/);
    const client = readFileSync('app/play/drills/_components/drills-app.tsx', 'utf8');
    expect(client).toMatch(/if \(!access\.landingCheck\) return;/);
    expect(client).toMatch(/visibilitychange[\s\S]*router\.refresh\(\)|router\.refresh\(\)[\s\S]*visibilitychange/);
    expect(client).toMatch(/pageshow/);
  });
});
