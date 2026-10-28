'use client';

// The asset browser: FEL's own catalog (lib/nexus-studio/catalog.ts) — the kits, the scans, the dressing props and the
// shared systems as placeable components. Click to place at the viewport's focus; drag onto the viewport to place there.

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
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

/**
 * Pure (STUDIO-EASY): the roving focus of the asset grid — which item an arrow key, Home or End moves to from `i` in a list of `n`
 * laid out `cols` across. The grid is ONE Tab stop (it was ~150, so the viewport and the inspector sat 120+ Tabs away).
 */
export function gridMove(key: string, i: number, n: number, cols = 2): number | null {
  if (n <= 0) return null;
  const to = key === 'ArrowRight' ? i + 1 : key === 'ArrowLeft' ? i - 1 : key === 'ArrowDown' ? i + cols : key === 'ArrowUp' ? i - cols : key === 'Home' ? 0 : key === 'End' ? n - 1 : null;
  return to === null ? null : Math.max(0, Math.min(n - 1, to));
}

export function AssetBrowser({ onPlace }: { onPlace(item: CatalogItem): void }) {
  const [query, setQuery] = useState('');
  const groups = useMemo(() => groupCatalog(catalog(), query), [query]);
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const [current, setCurrent] = useState(0);
  const cur = Math.min(current, Math.max(0, flat.length - 1));
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = flat.findIndex((c) => refs.current.get(c.id) === e.target);
    if (i < 0) return;
    const to = gridMove(e.key, i, flat.length);
    if (to === null) return;
    e.preventDefault(); e.stopPropagation();   // the arrows walk the grid here; they do not nudge the selection
    setCurrent(to); refs.current.get(flat[to].id)?.focus();
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PanelTitle>Add to the court</PanelTitle>
      <div className="px-3 pb-2">
        <label className="flex items-center gap-2 rounded-md border px-2 py-1" style={{ borderColor: C.line }}>
          <Search className="h-3.5 w-3.5" style={{ color: C.dim }} aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Palm, flood, bleacher…" aria-label="Search assets"
            className="w-full bg-transparent text-[12px] outline-none" style={{ color: C.text }} />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-3" data-testid="asset-list" onKeyDown={onGridKey} aria-label="Things to add: arrow keys move, Enter adds" role="group">
        {groups.map(({ group, items }) => (
          <section key={group} className="pb-2">
            <h3 className="px-3 py-1 text-[12px] font-semibold uppercase tracking-[0.12em]" style={{ color: SWATCH[group] ?? C.dim }}>{group} <span style={{ color: C.dim }}>· {items.length}</span></h3>
            <ul className="grid grid-cols-2 gap-1 px-2">
              {items.map((c) => (
                <li key={c.id}>
                  <button type="button" draggable ref={(el) => { if (el) refs.current.set(c.id, el); else refs.current.delete(c.id); }}
                    tabIndex={flat[cur]?.id === c.id ? 0 : -1} onFocus={() => setCurrent(flat.indexOf(c))} onDragStart={(e) => { e.dataTransfer.setData(DRAG_MIME, c.id); e.dataTransfer.effectAllowed = 'copy'; }}
                    onClick={() => onPlace(c)} title={`${c.label}: tap to place it in the middle of the view, or drag it into the view (${c.source})`} aria-label={`Add ${c.label}`}
                    className="flex min-h-10 w-full items-center rounded-md border px-2 py-1.5 text-left transition-colors hover:border-[color:var(--fel-cyan)]" style={{ borderColor: C.line, background: C.surface }}>
                    {/* STUDIO-EASY: the engine source ("FixtureLights · flood") moved to the tooltip and the search; the card says what it is */}
                    <span className="block truncate text-[13px]" style={{ color: C.text }}>{c.label}</span>
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
