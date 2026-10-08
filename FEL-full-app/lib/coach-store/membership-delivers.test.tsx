// P3 (membership delivers): an ACTIVE paid membership opens a REAL program at /program/[accessId], a parent
// opening a teen membership sees a parent view (never drill names), and the coming-soon lanes are noindex.
//
// The money files (bundlePolicy.ts, entitlement.ts) are byte-identical to lane/finish-release; membershipIncludesCourses
// is false, so a membership opens the released program (dunking 8-week) only — never the course/series libraries.
//
// The page is an async server component rendered here with prisma + next-auth mocked (vitest collects lib/ per
// vitest.config.ts; app/ is outside vitest's lib includes, the same pattern as program-access-open.test.tsx).
// Nothing here mocks or overrides bundlePolicy: the (f) truth table passes the EntitlementPolicy argument
// explicitly, so the real membershipIncludesCourses default (false) is never flipped.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DUNK_WEEKS } from '@/lib/coach-store/dunkProgram';
import { RELEASED_PROGRAM_KEYS, programsForAccess } from '@/lib/coach-store/programsForAccess';

const h = vi.hoisted(() => ({
  userId: 'buyer-1' as string | null,
  access: null as Record<string, unknown> | null,
  notFound: false,
}));

vi.mock('next-auth', () => ({ getServerSession: async () => (h.userId ? { user: { id: h.userId } } : null) }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => ({
  prisma: {
    programAccess: { findUnique: async () => h.access },
  },
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    h.notFound = true;
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const ALL_WEEK_TITLES = DUNK_WEEKS.map((w) => `Week ${w.week}: ${w.title}`);
const ALL_DRILLS = DUNK_WEEKS.flatMap((w) => w.days.flatMap((d) => d.drills));
const ADULT_ONLY_DRILL_NAMES = [...new Set(ALL_DRILLS.filter((d) => d.adultOnly).map((d) => d.name))];
const ALL_DRILL_NAMES = [...new Set(ALL_DRILLS.map((d) => d.name))];

async function renderPage(access: Record<string, unknown>, userId: string | null = 'buyer-1') {
  h.userId = userId;
  h.access = access;
  h.notFound = false;
  const { default: ProgramPlayerPage } = await import('@/app/program/[accessId]/page');
  try {
    const el = await ProgramPlayerPage({ params: { accessId: 'pa-mem' } } as never);
    return { html: renderToStaticMarkup(createElement(el.type as never, { ...(el.props as object) } as never)), notFound: h.notFound };
  } catch (err) {
    if (h.notFound) return { html: '', notFound: true };
    throw err;
  }
}

const membership = {
  id: 'pa-mem', userId: 'buyer-1', instructorId: 'ins-1', listingId: 'l', beneficiary: 'self',
  billing: 'month', priceCents: 2999, reviewCredits: 0, status: 'ACTIVE', accessUntil: null,
};

beforeEach(() => {
  process.env.COACH_STORE_ENABLED = '1';
});
afterEach(() => {
  delete process.env.COACH_STORE_ENABLED;
  h.access = null;
  h.userId = 'buyer-1';
  h.notFound = false;
});

describe('P3 M1 programsForAccess (f) — the pure truth table', () => {
  const off = { membershipIncludesCourses: false };
  const on = { membershipIncludesCourses: true };

  it('RELEASED_PROGRAM_KEYS is exactly the released program and contains no coming-soon lane', () => {
    expect(RELEASED_PROGRAM_KEYS).toEqual(['dunking-plyometrics-8wk']);
    expect(RELEASED_PROGRAM_KEYS).not.toContain('correctives');
    expect(RELEASED_PROGRAM_KEYS).not.toContain('posture');
  });

  it("'lane' + dunking -> the 8-week program; any other lane -> []", () => {
    expect(programsForAccess({ scope: 'lane', lane: 'dunking' }, off)).toEqual(['dunking-plyometrics-8wk']);
    expect(programsForAccess({ scope: 'lane', lane: 'correctives' }, off)).toEqual([]);
    expect(programsForAccess({ scope: 'lane', lane: 'posture' }, off)).toEqual([]);
  });

  it("'product' -> [lane] for the course/series keys, else []", () => {
    expect(programsForAccess({ scope: 'product', lane: 'signature-dunk-course' }, off)).toEqual(['signature-dunk-course']);
    expect(programsForAccess({ scope: 'product', lane: 'blueprint-series' }, off)).toEqual(['blueprint-series']);
    expect(programsForAccess({ scope: 'product', lane: 'something-else' }, off)).toEqual([]);
  });

  it("'bundle' -> the program, course and series keys", () => {
    expect(programsForAccess({ scope: 'bundle', lane: 'bundle-all-three' }, off)).toEqual([
      'dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series',
    ]);
  });

  it("'all' and 'teen_all' -> RELEASED_PROGRAM_KEYS, plus course/series ONLY when membershipIncludesCourses is true", () => {
    for (const scope of ['all', 'teen_all']) {
      expect(programsForAccess({ scope, lane: null }, off)).toEqual(['dunking-plyometrics-8wk']);
      expect(programsForAccess({ scope, lane: null }, on)).toEqual([
        'dunking-plyometrics-8wk', 'signature-dunk-course', 'blueprint-series',
      ]);
    }
  });

  it('anything else -> []', () => {
    expect(programsForAccess({ scope: 'nope', lane: null }, off)).toEqual([]);
    expect(programsForAccess({ scope: '', lane: null }, off)).toEqual([]);
  });
});

describe('P3 M2 the player renders that list', () => {
  it('(a) an ACTIVE adult membership (scope all) renders all 8 dunk weeks with drill names', async () => {
    const { html } = await renderPage({ ...membership, scope: 'all', lane: 'adult' });
    for (const t of ALL_WEEK_TITLES) expect(html).toContain(t);
    expect(html).toContain('Stick the landing');
    expect(html).toContain('One-foot takeoff');
    expect(html).not.toContain("isn&#x27;t active");
  });

  it('adult membership does NOT open the course/series libraries (membershipIncludesCourses false)', async () => {
    const { html } = await renderPage({ ...membership, scope: 'all', lane: 'adult' });
    expect(html).not.toContain('Signature Dunk Course');
    expect(html).not.toContain('Blueprint series');
    expect(html).not.toContain('youtu.be');
  });

  it("(h) an ACTIVE 'all' row shows the coming-soon line; a 'lane' row does not", async () => {
    const all = await renderPage({ ...membership, scope: 'all', lane: 'adult' });
    expect(all.html).toContain('Re-screen trend board and plans that adjust: coming soon.');
    expect(all.html).toContain('Re-screens sit on days 14, 28, 42 and 56.');
    const lane = await renderPage({ ...membership, scope: 'lane', lane: 'dunking', billing: 'one_time' });
    expect(lane.html).not.toContain('Re-screen trend board and plans that adjust: coming soon.');
    expect(lane.html).toContain('Re-screens sit on days 14, 28, 42 and 56.');
  });

  it('an open row with empty keys renders "Nothing to show yet."', async () => {
    const { html } = await renderPage({ ...membership, scope: 'lane', lane: 'correctives', billing: 'one_time' });
    expect(html).toContain('Nothing to show yet.');
  });

  it('(g) lane/product/bundle rows render the same content as before (parity)', async () => {
    const laneDunk = await renderPage({ ...membership, scope: 'lane', lane: 'dunking', billing: 'one_time' });
    for (const t of ALL_WEEK_TITLES) expect(laneDunk.html).toContain(t);
    expect(laneDunk.html).toContain('Stick the landing');
    expect(laneDunk.html).not.toContain('Signature Dunk Course');
    expect(laneDunk.html).not.toContain('Blueprint series');

    const course = await renderPage({ ...membership, scope: 'product', lane: 'signature-dunk-course', billing: 'one_time' });
    expect(course.html).toContain('Signature Dunk Course');
    expect(course.html).toContain('Honey Dip');
    expect(course.html).not.toContain('Blueprint series');
    expect(course.html).not.toContain('Week 1:');

    const series = await renderPage({ ...membership, scope: 'product', lane: 'blueprint-series', billing: 'one_time' });
    expect(series.html).toContain('Blueprint series');
    expect(series.html).toContain('Bonds Bounce BluePrint');
    expect(series.html).not.toContain('Signature Dunk Course');
    expect(series.html).not.toContain('Week 1:');

    const bundle = await renderPage({ ...membership, scope: 'bundle', lane: 'bundle-all-three', billing: 'one_time' });
    for (const t of ALL_WEEK_TITLES) expect(bundle.html).toContain(t);
    expect(bundle.html).toContain('Signature Dunk Course');
    expect(bundle.html).toContain('Honey Dip');
    expect(bundle.html).toContain('Blueprint series');
    expect(bundle.html).toContain('Bonds Bounce BluePrint');
  });

  it('(g) teen beneficiary on lane/product/bundle keeps drillsForTeen (adult-only drills filtered)', async () => {
    const teenLane = await renderPage({
      ...membership, scope: 'lane', lane: 'dunking', billing: 'one_time', beneficiary: 'teen',
    });
    for (const name of ADULT_ONLY_DRILL_NAMES) expect(teenLane.html).not.toContain(name);
    expect(teenLane.html).toContain('One-foot takeoff');
    const teenBundle = await renderPage({
      ...membership, scope: 'bundle', lane: 'bundle-all-three', billing: 'one_time', beneficiary: 'teen',
    });
    for (const name of ADULT_ONLY_DRILL_NAMES) expect(teenBundle.html).not.toContain(name);
    expect(teenBundle.html).toContain('One-foot takeoff');
  });
});

describe('P3 M3 a parent opening a teen membership (teen_all) sees a parent view, never drill names', () => {
  const teenMembership = { ...membership, scope: 'teen_all', lane: 'teen', beneficiary: 'teen' };

  it('(c) shows program titles + week titles, no drill names, and the unlock steps with /program/unlock', async () => {
    const { html } = await renderPage(teenMembership);
    expect(html).toContain('Dunking &amp; Plyometrics 8-week');
    for (const t of ALL_WEEK_TITLES) expect(html).toContain(t);
    for (const name of ADULT_ONLY_DRILL_NAMES) expect(html).not.toContain(name);
    for (const name of ALL_DRILL_NAMES) expect(html).not.toContain(name);
    expect(html).toContain('/program/unlock');
    expect(html).toContain('unlock code from checkout');
    expect(html).toContain('progress stays on their phone');
    expect(html).not.toContain('youtu.be');
  });
});

describe('P3 M4 coming-soon lanes are noindex (d)', () => {
  it('correctives and posture are noindex; dunking stays index', async () => {
    const { generateMetadata } = await import('@/app/coach/[slug]/programs/[lane]/page');
    const params = (lane: string) => ({ params: { slug: 'coach', lane } });
    expect(generateMetadata(params('correctives') as never).robots).toMatchObject({ index: false, follow: true });
    expect(generateMetadata(params('posture') as never).robots).toMatchObject({ index: false, follow: true });
    expect(generateMetadata(params('dunking') as never).robots).toMatchObject({ index: true, follow: true });
  });
});

describe('P3 membership delivers — acceptance', () => {
  it('(b) PAUSED, CANCELED, past-accessUntil, REFUNDED and PENDING membership rows render nothing', async () => {
    const closed = [
      { status: 'PAUSED', accessUntil: null },
      { status: 'CANCELED', accessUntil: null },
      { status: 'REFUNDED', accessUntil: null },
      { status: 'PENDING', accessUntil: null },
      { status: 'ACTIVE', accessUntil: new Date('2026-10-01T00:00:00Z') },
    ];
    for (const row of closed) {
      const { html } = await renderPage({ ...membership, scope: 'all', lane: 'adult', ...row });
      expect(html, row.status).toContain("This program isn&#x27;t active.");
      expect(html, row.status).not.toContain('Week 1');
      expect(html, row.status).not.toContain('Stick the landing');
    }
  });

  it("(i) another user's 'all' row -> notFound (owner check unchanged)", async () => {
    const res = await renderPage({ ...membership, scope: 'all', lane: 'adult' }, 'intruder-9');
    expect(res.notFound).toBe(true);
    expect(res.html).toBe('');
  });
});
