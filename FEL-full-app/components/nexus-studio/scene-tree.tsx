'use client';

// The scene tree: the project's venues (switch, add), then the active venue's objects grouped by kind — select, hide,
// lock, rename by double-click in the inspector. The venue's own spec (its court, nets and stands) is a locked root: it
// is the game, and a Studio venue lays a look over it rather than moving it.
//
// §11: a click selects one; Ctrl/⌘-click toggles one in or out; Shift-click takes the range from the last click in the tree's
// own order. A row's hide / lock button acts on the WHOLE selection when that row is part of it.

import { useRef } from 'react';
import { Eye, EyeOff, Lock, Unlock, Plus, MapPinned } from 'lucide-react';
import type { StudioObject, StudioVenue } from '@/lib/nexus-studio/doc';
import { C, PanelTitle } from './ui';

const KIND_LABEL: Record<StudioObject['type'], string> = {
  fixture: 'Lights', crowdStand: 'Crowd', decal: 'Ground marks', cameraMark: 'Camera', specProp: 'Dressing', kitProp: 'Kit props', meshyProp: 'Scans',
};
const KIND_ORDER: StudioObject['type'][] = ['cameraMark', 'fixture', 'crowdStand', 'specProp', 'kitProp', 'meshyProp', 'decal'];

/** Pure: the tree's rows in the order they are drawn (the order a Shift-click range runs in). */
export function treeOrder(objects: readonly StudioObject[]): string[] {
  return treeGroups(objects).flatMap((g) => g.items.map((o) => o.id));
}

/** Pure: the objects in the tree's groups and order. */
export function treeGroups(objects: readonly StudioObject[]): Array<{ type: StudioObject['type']; label: string; items: StudioObject[] }> {
  return KIND_ORDER.map((type) => ({ type, label: KIND_LABEL[type], items: objects.filter((o) => o.type === type) })).filter((g) => g.items.length);
}

export function SceneTree({ venues, activeId, venue, selection, onSelectRow, onClear, onToggle, onSwitchVenue, onAddVenue }: {
  venues: readonly StudioVenue[]; activeId: string; venue: StudioVenue;
  /** §11: the selection, in order. */
  selection: readonly string[];
  /** A row's click with its modifiers and the anchor (the last row clicked) for a Shift range. */
  onSelectRow(id: string, mods: { shift: boolean; toggle: boolean }, anchor: string | null): void;
  onClear(): void;
  /** Hide / lock: `ids` is the whole selection when the row is in it, else that one row. */
  onToggle(ids: string[], key: 'hidden' | 'locked'): void;
  onSwitchVenue(id: string): void;
  onAddVenue(): void;
}) {
  const anchor = useRef<string | null>(null);
  const many = selection.length > 1;
  const idsFor = (id: string) => (selection.includes(id) ? [...selection] : [id]);
  return (
    <div className="flex min-h-0 flex-col">
      <PanelTitle right={<button type="button" onClick={onAddVenue} title="New venue" aria-label="New venue" className="inline-flex h-7 w-7 items-center justify-center rounded hover:bg-white/5"><Plus className="h-3.5 w-3.5" style={{ color: C.dim }} /></button>}>Venues</PanelTitle>
      <ul className="px-2 pb-1">
        {venues.map((v) => (
          <li key={v.id}>
            <button type="button" onClick={() => onSwitchVenue(v.id)} aria-current={v.id === activeId ? 'true' : undefined}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[12px]"
              style={{ background: v.id === activeId ? 'rgba(0,229,255,0.10)' : 'transparent', color: v.id === activeId ? C.cyan : C.text }}>
              <MapPinned className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{v.name}</span>
            </button>
          </li>
        ))}
      </ul>
      <PanelTitle>Scene</PanelTitle>
      <div className="min-h-0 overflow-y-auto pb-2" role="tree" aria-label="Scene">
        <button type="button" onClick={() => { anchor.current = null; onClear(); }} className="flex w-full items-center gap-2 px-3 py-1 text-left text-[12px]"
          style={{ color: selection.length === 0 ? C.cyan : C.text }} title="The venue's settings: sky, mood, ground, weather, the broadcast camera">
          <Lock className="h-3 w-3" style={{ color: C.dim }} aria-hidden /> Court settings <span style={{ color: C.dim }}>· sky, light, ground</span>
        </button>
        {treeGroups(venue.objects).map((g) => (
          <div key={g.type} role="group" aria-label={g.label}>
            <div className="px-3 pt-2 text-[12px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.dim }}>{g.label} · {g.items.length}</div>
            {g.items.map((o) => {
              const sel = selection.includes(o.id);
              const group = many && sel ? ` (all ${selection.length} selected)` : '';
              return (
                <div key={o.id} role="treeitem" aria-selected={sel} className="group flex items-center gap-1 pl-5 pr-2" style={{ background: sel ? 'rgba(0,229,255,0.10)' : 'transparent' }}>
                  <button type="button" onClick={(e) => { const mods = { shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey }; onSelectRow(o.id, mods, anchor.current); if (!mods.shift) anchor.current = o.id; }} className="min-w-0 flex-1 truncate py-1 text-left text-[12px]" style={{ color: sel ? C.cyan : o.hidden ? C.dim : C.text }}>{o.name}</button>
                  <button type="button" onClick={() => onToggle(idsFor(o.id), 'hidden')} title={(o.hidden ? 'Show' : 'Hide (not drawn, not exported)') + group} aria-label={o.hidden ? `Show ${o.name}` : `Hide ${o.name}`} className="inline-flex h-6 w-6 items-center justify-center rounded opacity-70 hover:opacity-100 focus-visible:opacity-100">
                    {o.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                  <button type="button" onClick={() => onToggle(idsFor(o.id), 'locked')} title={(o.locked ? 'Unlock' : 'Lock (no moving or deleting)') + group} aria-label={o.locked ? `Unlock ${o.name}` : `Lock ${o.name}`} className="inline-flex h-6 w-6 items-center justify-center rounded opacity-70 hover:opacity-100 focus-visible:opacity-100">
                    {o.locked ? <Lock className="h-3 w-3" style={{ color: C.gold }} /> : <Unlock className="h-3 w-3" />}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        {many && <p className="px-3 pt-2 text-[12px]" style={{ color: C.dim }}>{selection.length} selected · Ctrl-click to toggle, Shift-click for a range</p>}
        {!venue.objects.length && <p className="px-3 pt-2 text-[12px]" style={{ color: C.dim }}>Nothing placed yet. Tap something in Assets, or try a stamp.</p>}
      </div>
    </div>
  );
}
