// The Studio shell as a server render (no DOM in this runner) and its pure helpers; the /studio gate read from source.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NexusStudioApp, TRACKS } from './studio-app';
import { groupCatalog } from './asset-browser';
import { treeGroups } from './scene-tree';
import { Inspector } from './inspector';
import { BudgetMeter } from './budget-meter';
import { typingTarget } from './venue-editor';
import { starterProject } from './use-studio';
import { catalog } from '@/lib/nexus-studio/catalog';
import { isNexusStudioEnabled } from '@/lib/flags';
import { everyKindVenue } from '@/tests/helpers/nexusStudio';

const ROOT = join(__dirname, '..', '..');
const noop = () => {};

describe('the shell', () => {
  const html = renderToStaticMarkup(createElement(NexusStudioApp));
  it('opens on the venue editor with the four tracks, the save state and the play-test', () => {
    for (const t of TRACKS) expect(html).toContain(`>${t.label}</button>`.replace(`>${t.label}`, ` ${t.label}`));
    expect(html).toMatch(/role="tab" aria-selected="true"[^>]*>.*Venues/);
    expect(html.replace(/<!-- -->/g, '')).toContain('Play-test in Tiebreak');
    expect(html).toContain('data-testid="save-state"');
    expect(html).toContain('data-testid="studio-canvas"');
    expect(html).toContain('data-testid="budget-meter"');
  });
  it('undo and redo start disabled', () => {
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Undo"/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Redo"/);
  });
  it('the first visit starts on a Tiebreak venue', () => {
    const p = starterProject();
    expect(p.venues[0].base).toEqual({ spec: 'tennis', target: 'tiebreak' });
  });
});

describe('the asset browser', () => {
  it('groups the catalog, systems first, and filters by name, group or source', () => {
    const all = groupCatalog(catalog(), '');
    expect(all[0].group).toBe('Lights');
    expect(all.reduce((n, g) => n + g.items.length, 0)).toBe(catalog().length);
    const palms = groupCatalog(catalog(), 'palm');
    expect(palms.every((g) => g.items.every((i) => /palm/i.test(i.label + i.group + i.source)))).toBe(true);
    expect(groupCatalog(catalog(), 'fixturelights').flatMap((g) => g.items.map((i) => i.id))).toEqual(['fixture:flood', 'fixture:lamp', 'fixture:bulb']);
    expect(groupCatalog(catalog(), 'zzzz')).toEqual([]);
  });
});

describe('the scene tree', () => {
  it('lists the camera mark first, then lights, crowd, dressing, kit, scans and marks', () => {
    expect(treeGroups(everyKindVenue().objects).map((g) => g.type)).toEqual(['cameraMark', 'fixture', 'crowdStand', 'specProp', 'kitProp', 'meshyProp', 'decal']);
  });
});

describe('the inspector', () => {
  const v = everyKindVenue();
  const props = { venue: v, run: noop, seal: noop, onDelete: noop, onDuplicate: noop, onPreviewIntro: noop, onPreviewReplay: noop };
  it('with nothing selected: the venue — mood, sky, ground, dressing, weather, the broadcast camera', () => {
    const html = renderToStaticMarkup(createElement(Inspector, { ...props, object: null }));
    for (const s of ['aria-label="Mood"', 'aria-label="Sky top"', 'aria-label="Court dressing"', 'aria-label="Weather"', 'aria-label="Intro"', 'aria-label="Preview the low angle"', 'aria-label="Glossy floor"']) expect(html).toContain(s);
    expect(html).toContain('value="nightGame" selected=""');
  });
  it('track 3: with the project, the venue has a character slot — the player\'s own look, the project\'s characters, Closet and paste', () => {
    const project = { ...starterProject(), characters: [{ id: 'c1', name: 'Nova', lookCode: 'FEL2.abc.0000000' }] };
    const html = renderToStaticMarkup(createElement(Inspector, { ...props, venue: { ...v, cast: { player: 'c1' } }, project, object: null }));
    expect(html).toContain('data-testid="cast-slot"');
    expect(html).toContain('<option value="c1" selected="">Nova</option>');
    expect(html).toContain('From my Closet');
    expect(html).toContain('Paste a share code');
    expect(renderToStaticMarkup(createElement(Inspector, { ...props, object: null }))).not.toContain('cast-slot');
  });
  it('a fixture shows its role, light and height; a locked object cannot be deleted', () => {
    const fixture = v.objects.find((o) => o.type === 'fixture')!;
    const html = renderToStaticMarkup(createElement(Inspector, { ...props, object: fixture }));
    for (const s of ['aria-label="Role"', 'aria-label="Light colour"', 'aria-label="Height"']) expect(html).toContain(s);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Delete"/);
    const locked = renderToStaticMarkup(createElement(Inspector, { ...props, object: { ...fixture, locked: true } }));
    expect(locked).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Delete"/);
  });
  it('a crowd stand has no scale (its width and rows are its size)', () => {
    const stand = v.objects.find((o) => o.type === 'crowdStand')!;
    const html = renderToStaticMarkup(createElement(Inspector, { ...props, object: stand }));
    expect(html).toContain('aria-label="Rows"');
    expect(html).not.toContain('aria-label="Scale"');
  });
});

describe('the budget meter', () => {
  it('draws each row against the sample\'s tier and names the reference row', () => {
    const html = renderToStaticMarkup(createElement(BudgetMeter, { sample: { drawCalls: 650, activeMeshes: 50, textureMb: 100, skinnedBodies: 3, tier: 'mobile' }, budgetKey: 'tennis', phone: true, onPhone: noop }));
    expect(html).toContain('650<span');
    expect(html).toContain('/600');
    expect(html).toContain('tennis on a phone');
    expect(html.replace(/<!-- -->/g, '')).toContain('Budget · phone');
  });
});

describe('keyboard shortcuts stay out of text fields', () => {
  it('typingTarget', () => {
    expect(typingTarget({ tagName: 'INPUT', type: 'text' } as unknown as EventTarget)).toBe(true);
    expect(typingTarget({ tagName: 'INPUT', type: 'number' } as unknown as EventTarget)).toBe(true);
    expect(typingTarget({ tagName: 'INPUT', type: 'checkbox' } as unknown as EventTarget)).toBe(false);
    expect(typingTarget({ tagName: 'SELECT' } as unknown as EventTarget)).toBe(true);
    expect(typingTarget({ tagName: 'CANVAS' } as unknown as EventTarget)).toBe(false);
    expect(typingTarget(null)).toBe(false);
  });
});

describe('/studio is held behind its flag', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('NEXUS_STUDIO_ENABLED: off unless 1/true/on/yes', () => {
    vi.stubEnv('NEXUS_STUDIO_ENABLED', '');
    expect(isNexusStudioEnabled()).toBe(false);
    vi.stubEnv('NEXUS_STUDIO_ENABLED', '0');
    expect(isNexusStudioEnabled()).toBe(false);
    vi.stubEnv('NEXUS_STUDIO_ENABLED', '1');
    expect(isNexusStudioEnabled()).toBe(true);
  });
  it('the layout 404s on the flag BEFORE the login check, and the page is the Nexus Studio', () => {
    const layout = readFileSync(join(ROOT, 'app/studio/layout.tsx'), 'utf8');
    const gate = layout.indexOf('if (!isNexusStudioEnabled()) notFound();');
    expect(gate).toBeGreaterThan(0);
    expect(gate).toBeLessThan(layout.indexOf('getServerSession(authOptions)'));
    expect(readFileSync(join(ROOT, 'app/studio/page.tsx'), 'utf8')).toContain('<NexusStudioApp />');
  });
  it('the paid Studio surface keeps its own flag (turning the editor on does not open it)', () => {
    vi.stubEnv('NEXUS_STUDIO_ENABLED', '1');
    vi.stubEnv('STUDIO_CREATOR_ENABLED', '');
    return import('@/lib/flags').then((f) => expect(f.isStudioCreatorEnabled()).toBe(false));
  });
});
