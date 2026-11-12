// #337 (cursor-bundle-2): the athlete status card renders from a real AthleteStatus, links only where the status points,
// and its loader turns a missing user or a failed read into "no card" rather than a 500.
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AthleteStatusCard, AthleteStatusSection } from './athlete-status-card';
import { loadAthleteStatus } from '@/lib/profile/athleteStatusServer';
import { buildStatus } from '@/lib/profile/dashboard';
import { PLATFORM_PROTOCOLS } from '@/lib/profile/protocol';
import { emptyProfile } from '@/lib/profile/sharedProfile';

const NOW = Date.UTC(2026, 9, 24);

describe('AthleteStatusCard', () => {
  it('a never-scanned athlete: "Scan needed", "No scan yet", and the first-scan lead action links to the Mirror', () => {
    const status = buildStatus(emptyProfile('u1', 'Ath'), PLATFORM_PROTOCOLS, NOW);
    expect(status.next.kind).toBe('first-scan');
    const html = renderToStaticMarkup(createElement(AthleteStatusCard, { status }));
    expect(html).toContain('Athlete status');
    expect(html).toContain('What to do next');
    expect(html).toContain('Scan needed');
    expect(html).toContain('No scan yet');
    expect(html).toContain(`href="${status.next.href}"`);
    expect(html).toContain(`${status.openProtocols}/${status.totalProtocols} open`);
  });

  it('a lead action with no href renders as text, not a link', () => {
    const status = buildStatus(emptyProfile('u1'), PLATFORM_PROTOCOLS, NOW);
    const html = renderToStaticMarkup(createElement(AthleteStatusCard, { status: { ...status, next: { kind: 'on-track', text: 'All good.' } } }));
    expect(html).toContain('All good.');
    expect(html).not.toMatch(/<a [^>]*>[^<]*<span>All good\./);
  });
});

describe('loadAthleteStatus / AthleteStatusSection', () => {
  it('no user id → null, and the database is not touched', async () => {
    const db = new Proxy({}, { get: () => { throw new Error('touched'); } });
    expect(await loadAthleteStatus(db as never, undefined)).toBeNull();
    expect(await loadAthleteStatus(db as never, '')).toBeNull();
  });

  it('a failed read → null (no card), never a throw', async () => {
    const db = new Proxy({}, { get: () => new Proxy({}, { get: () => async () => { throw new Error('db down'); } }) });
    await expect(loadAthleteStatus(db as never, 'u1')).resolves.toBeNull();
  });

  it('the section renders nothing for a signed-out/blank user', async () => {
    expect(await AthleteStatusSection({ userId: undefined })).toBeNull();
  });
});
