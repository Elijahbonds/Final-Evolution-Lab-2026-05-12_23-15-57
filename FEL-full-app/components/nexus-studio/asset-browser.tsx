'use client';

// The asset browser: FEL's own catalog (lib/nexus-studio/catalog.ts) — the kits, the scans, the dressing props and the
// shared systems as placeable components. Click to place at the viewport's focus; drag onto the viewport to place there.

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { catalog, type CatalogGroup, type CatalogItem } from '@/lib/nexus-studio/catalog';
import { C, PanelTitle } from './ui';

export const DRAG_MIME = 'application/x-nexus-studio-item';

const ORDER: CatalogGroup[] = ['Lights', 'Crowd', 'Ground marks', 'Camera', 'Dressing', 'Scans', 'Nature', 'Venice', 'Racing', 'Arena', 'City', 'Skate', 'Mini golf'];
const SWATCH: Partial<Record<CatalogGroup, string>> = { Lights: C.gold, Crowd: C.violet, 'Ground marks': C.ember, Camera: C.gold, Scans: C.emerald };

/** Pure: the catalog filtered by a query, grouped in the browser's order. */
export function groupCatalog(items: readonly CatalogItem[], query: string): Array<{ group: CatalogGroup; items: CatalogItem[] }> {
  const q = query.trim().toLowerCase();
  const hit = (c: CatalogItem) => !q || c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q) || c.source.toLowerCase().includes(q);
  return ORDER.map((group) => ({ group, items: items.filter((c) => c.group === group && hit(c)) })).filter((g) => g.items.length);
}

export function AssetBrowser({ onPlace }: { onPlace(item: CatalogItem): void }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => groupCatalog(catalog(), query), [query]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelTitle>Assets</PanelTitle>
      <div className="px-3 pb-2">
        <label className="flex items-center gap-2 rounded-md border px-2 py-1" style={{ borderColor: C.line }}>
          <Search className="h-3.5 w-3.5" style={{ color: C.dim }} aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Palm, flood, bleacher…" aria-label="Search assets"
            className="w-full bg-transparent text-[12px] outline-none" style={{ color: C.text }} />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-3" data-testid="asset-list">
        {groups.map(({ group, items }) => (
          <section key={group} className="pb-2">
            <h3 className="px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: SWATCH[group] ?? C.dim }}>{group} <span style={{ color: C.dim }}>· {items.length}</span></h3>
            <ul className="grid grid-cols-2 gap-1 px-2">
              {items.map((c) => (
                <li key={c.id}>
                  <button type="button" draggable onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, c.id); e.dataTransfer.effectAllowed = 'copy'; }}
                    onClick={() => onPlace(c)} title={`${c.label} — ${c.source}. Click to place at the view's centre, or drag into the view.`}
                    className="w-full rounded-md border px-2 py-1.5 text-left transition-colors hover:border-[color:var(--fel-cyan)]" style={{ borderColor: C.line, background: C.surface }}>
                    <span className="block truncate text-[12px]" style={{ color: C.text }}>{c.label}</span>
                    <span className="block truncate text-[10px]" style={{ color: C.dim }}>{c.source}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {!groups.length && <p className="px-3 text-[12px]" style={{ color: C.dim }}>Nothing matches “{query}”.</p>}
      </div>
    </div>
  );
}
