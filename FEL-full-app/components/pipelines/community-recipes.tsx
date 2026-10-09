// PIPELINES (owner, 2026-10-06): the Fuel floor's "Community recipes" shelf. A server component, mounted with one line
// on /kitchens/fuel. Approved, public recipe cards by adult creators (lib/pipelines/community.ts), credited, with the
// chef's own allergen list shown as the chef's declaration, and never part of the MealRx plan above it. Teens see it too
// (owner decision). Renders nothing when there are none or the database is away.

import Link from 'next/link';
import { prisma } from '@/lib/db';
import { loadCommunity } from '@/lib/pipelines/community-server';
import type { RecipeEntry } from '@/lib/pipelines/community';
import { CHEF_DECLARED_NOTE, NOT_IN_PLAN_NOTE, shelfItems } from '@/lib/pipelines/recipeShelf';

export async function CommunityRecipes() {
  let entries: RecipeEntry[] = [];
  try { entries = (await loadCommunity(prisma, 'recipes')) as RecipeEntry[]; } catch { return null; }
  const items = shelfItems(entries);
  if (!items.length) return null;
  return (
    <section className="mx-auto mt-8 max-w-3xl px-4" aria-labelledby="community-recipes" data-testid="community-recipes">
      <div className="flex items-baseline justify-between">
        <h2 id="community-recipes" className="fel-heading text-lg font-bold text-white">Community recipes</h2>
        <Link href="/create/cooking" className="text-xs font-bold text-[#00E5FF] hover:underline">Share one →</Link>
      </div>
      <p className="mt-1 text-xs text-white/50">{NOT_IN_PLAN_NOTE}</p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map((r) => (
          <li key={r.id} className="fel-panel rounded-xl p-3" data-recipe-card={r.id}>
            <h3 className="text-sm font-bold text-white">{r.title}</h3>
            <p className="mt-0.5 text-[11px] text-white/50">by {r.href ? <Link href={r.href} className="underline decoration-white/30 hover:text-white">{r.by}</Link> : r.by}</p>
            <p className="mt-2 rounded-md border border-[#FFB020]/30 bg-[#FFB020]/10 px-2 py-1 text-[11px] text-[#FFB020]" data-testid="chef-allergens">
              {r.allergenLine}
            </p>
            <details className="mt-2 text-xs text-white/75">
              <summary className="cursor-pointer text-white/60">Ingredients and steps</summary>
              <ul className="mt-1 list-disc pl-4">{r.ingredients.map((i, k) => <li key={k}>{i}</li>)}</ul>
              <ol className="mt-2 list-decimal pl-4">{r.steps.map((s, k) => <li key={k}>{s}</li>)}</ol>
              {r.moreSteps > 0 && <p className="mt-1 text-white/40">+{r.moreSteps} more steps</p>}
            </details>
            {r.tags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">{r.tags.map((t) => <span key={t} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white/60">{t}</span>)}</div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-white/40">{CHEF_DECLARED_NOTE}</p>
    </section>
  );
}
