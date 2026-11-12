import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { assembleProfile, type ProfileRows } from '@/lib/profile-v2/assemble';
import { ProfileBody } from './profile-body';

// PROFILE V2: the page as the server renders it, for the three accounts that matter — new, adult, teen.
const now = new Date();
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
const empty: ProfileRows = {
  user: { name: 'New', dobYear: 1995, createdAt: day(0) }, profile: { xp: 0, streakDays: 0, avatarKey: null, cosmeticAssetId: null },
  optIn: null, prqEntries: [], mastery: [], jumpScans: [], mirrorSessions: [], bests: [], recentScores: [], playedAt: [], matches: [],
  links: { count: 0, opened: 0, attempted: 0, beaten: 0 }, card: null, coaches: [], credentials: [], triumphs: [],
};
const html = (rows: ProfileRows) => renderToStaticMarkup(createElement(ProfileBody, { data: assembleProfile('u1', rows, now) }));
const tilesOf = (h: string) => [...h.matchAll(/data-tile="(\w+)"([\s\S]*?)(?=data-tile=|<\/section>)/g)].map((m) => [m[1], m[2]] as const);

describe('the profile body', () => {
  it('a new account: every tile is a dash with a way to get its number, and no number is invented', () => {
    const h = html(empty);
    const tiles = tilesOf(h);
    expect(tiles.map(([k]) => k)).toEqual(['jump', 'form', 'reaction', 'streak']);
    for (const [, body] of tiles) {
      expect(body).toContain('aria-label="not measured"');
      expect(body).toMatch(/href="\//);
    }
    expect(h).toContain('Nothing measured yet');
    expect(h).toContain('Coming');           // coach-verified milestones, squads, auto-cut clips: labelled, not faked
  });

  it('a teen: private, no public switch, phone-only bests', () => {
    const h = html({ ...empty, user: { name: 'Sam', dobYear: now.getFullYear() - 15, createdAt: day(1) }, card: { slug: 'sam-1', published: true, displayName: 'Sam', highlights: [] } });
    expect(h).toContain('Accounts under 18 never get a public page');
    expect(h).not.toContain('Make my profile public');
    expect(h).toContain('Reading this phone’s records');
  });

  it('an adult with a card gets the public switch, off by default', () => {
    const h = html({ ...empty, card: { slug: 'jo-1', published: false, displayName: 'Jo', highlights: [] } });
    expect(h).toContain('aria-label="Make my profile public"');
    expect(h).toContain('Friends only');
    expect(h).toContain('href="/u/jo-1"');
  });

  it('keeps the phone cheap: no backdrop blur, no animation library in the profile components', () => {
    const dir = join(__dirname);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.tsx') && !x.endsWith('.test.tsx'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/backdrop-blur|backdrop-filter|framer-motion/);
    }
  });
});
