// PIPELINES (owner, 2026-10-06): the Fuel floor's Community recipes shelf — approved adults' recipes, credited, the
// chef's allergens as the chef's declaration, never in the MealRx maths; teens see the same shelf.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

const h = vi.hoisted(() => ({ rows: [] as any[], where: [] as any[] }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: { creativeCard: { findMany: async (a: any) => { h.where.push(a.where); return h.rows; } } } }));

import { CommunityRecipes } from './community-recipes';
import { invalidateCommunity } from '@/lib/pipelines/community-server';
import { publicCardWhere } from '@/lib/creator/creative-card-review';
import { allergenLine, shelfItems, CHEF_DECLARED_NOTE } from '@/lib/pipelines/recipeShelf';

const recipe = (over: Record<string, unknown> = {}) => ({
  id: 'r1', title: 'Green Oats', primary: 'cooking', reviewState: 'approved', isPublic: true, createdAt: new Date(), stats: {},
  art: { kind: 'cooking', ingredients: ['oats', 'milk'], steps: ['soak', 'stir'], fuelTags: ['recovery'], allergens: ['milk'] },
  owner: { name: 'Chef Ada', dobYear: 1988, creatorCards: [{ slug: 'ada', displayName: 'Chef Ada' }] }, ...over,
});

beforeEach(() => { h.rows = []; h.where = []; invalidateCommunity(); });

describe('Community recipes shelf', () => {
  it('reads approved public cooking cards by adults and credits the chef, allergens as declared', async () => {
    h.rows = [recipe()];
    const html = renderToStaticMarkup((await CommunityRecipes())!);
    expect(h.where[0]).toEqual({ primary: 'cooking', ...publicCardWhere() });
    expect(html).toContain('Community recipes');
    expect(html).toContain('Green Oats');
    expect(html).toContain('href="/card/ada"');
    expect(html).toContain('Chef lists: Milk');
    expect(html).toContain('declared by the chef');
    expect(html).toContain('not part of it');
  });
  it('a teen\'s, a private, or a pending recipe never reaches the shelf; none at all renders nothing', async () => {
    h.rows = [recipe({ owner: { name: 'Kid', dobYear: 2012 } }), recipe({ id: 'r2', isPublic: false }), recipe({ id: 'r3', reviewState: 'pending_review' })];
    expect(await CommunityRecipes()).toBe(null);
  });
  it('no allergens declared is said in words, never "allergen-free"', () => {
    expect(allergenLine([])).toBe('The chef listed no allergens');
    expect(allergenLine([])).not.toMatch(/free/i);
    expect(shelfItems([{ cardId: 'x', title: 't', creator: { name: 'A', href: null }, ingredients: ['a'], steps: ['b'], fuelTags: [], allergens: ['peanuts'], photoUrl: null }])[0].allergenLine).toBe('Chef lists: Peanuts');
    expect(CHEF_DECLARED_NOTE).toMatch(/not checked/);
  });
  it('never in the MealRx maths: the plan builder reads the seed catalogue only', () => {
    const src = readFileSync(join(process.cwd(), 'lib/kitchens/mealRxBuilder.ts'), 'utf8');
    expect(src).not.toMatch(/pipelines|creative-card|community/i);
  });
  it('the Fuel page mounts it for every signed-in player (teens included: no age gate on the mount)', () => {
    const page = readFileSync(join(process.cwd(), 'app/kitchens/fuel/page.tsx'), 'utf8');
    expect(page).toContain('<CommunityRecipes />');
    expect(page).not.toMatch(/dobYear|isPublicCreator|verifiedAdult/);
  });
});
