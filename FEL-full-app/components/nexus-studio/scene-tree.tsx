'use client';

// The scene tree: the project's venues (switch, add), then the active venue's objects grouped by kind — select, hide,
// lock, rename by double-click in the inspector. The venue's own spec (its court, nets and stands) is a locked root: it
// is the game, and a Studio venue lays a look over it rather than moving it.

import { Eye, EyeOff, Lock, Unlock, Plus, MapPinned } from 'lucide-react';
import type { StudioObject, StudioVenue } from '@/lib/nexus-studio/doc';
import { C, PanelTitle } from './ui';

const KIND_LABEL: Record<StudioObject['type'], string> = {
  fixture: 'Lights', crowdStand: 'Crowd', decal: 'Ground marks', cameraMark: 'Camera', specProp: 'Dressing', kitProp: 'Kit props', meshyProp: 'Scans',
};
const KIND_ORDER: StudioObject['type'][] = ['cameraMark', 'fixture', 'crowdStand', 'specProp', 'kitProp', 'meshyProp', 'decal'];

/** Pure: the objects in the tree's groups and order. */
export function treeGroups(objects: readonly StudioObject[]): Array<{ type: StudioObject['type']; label: string; items: StudioObject[] }> {
  return KIND_ORDER.map((type) => ({ type, label: KIND_LABEL[type], items: objects.filter((o) => o.type === type) })).filter((g) => g.items.length);
}

export function SceneTree({ venues, activeId, venue, selected, onSelect, onToggle, onSwitchVenue, onAddVenue }: {
  venues: readonly StudioVenue[]; activeId: string; venue: StudioVenue; selected: string | null;
  onSelect(id: string | null): void;
  onToggle(id: string, key: 'hidden' | 'locked'): void;
  onSwitchVenue(id: string): void;
  onAddVenue(): void;
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <PanelTitle right={<button type="button" onClick={onAddVenue} title="New venue" aria-label="New venue" className="rounded p-1 hover:bg-white/5"><Plus className="h-3.5 w-3.5" style={{ color: C.dim }} /></button>}>Venues</PanelTitle>
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
        <button type="button" onClick={() => onSelect(null)} className="flex w-full items-center gap-2 px-3 py-1 text-left text-[12px]"
          style={{ color: selected === null ? C.cyan : C.text }} title="The venue's settings: sky, mood, ground, weather, the broadcast camera">
          <Lock className="h-3 w-3" style={{ color: C.dim }} aria-hidden /> {venue.base.spec} court <span style={{ color: C.dim }}>· venue settings</span>
        </button>
        {treeGroups(venue.objects).map((g) => (
          <div key={g.type} role="group" aria-label={g.label}>
            <div className="px-3 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: C.dim }}>{g.label} · {g.items.length}</div>
            {g.items.map((o) => {
              const sel = o.id === selected;
              return (
                <div key={o.id} role="treeitem" aria-selected={sel} className="group flex items-center gap-1 pl-5 pr-2" style={{ background: sel ? 'rgba(0,229,255,0.10)' : 'transparent' }}>
                  <button type="button" onClick={() => onSelect(o.id)} className="min-w-0 flex-1 truncate py-1 text-left text-[12px]" style={{ color: sel ? C.cyan : o.hidden ? C.dim : C.text }}>{o.name}</button>
                  <button type="button" onClick={() => onToggle(o.id, 'hidden')} title={o.hidden ? 'Show' : 'Hide (not drawn, not exported)'} aria-label={o.hidden ? `Show ${o.name}` : `Hide ${o.name}`} className="rounded p-0.5 opacity-60 hover:opacity-100">
                    {o.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                  <button type="button" onClick={() => onToggle(o.id, 'locked')} title={o.locked ? 'Unlock' : 'Lock (no moving or deleting)'} aria-label={o.locked ? `Unlock ${o.name}` : `Lock ${o.name}`} className="rounded p-0.5 opacity-60 hover:opacity-100">
                    {o.locked ? <Lock className="h-3 w-3" style={{ color: C.gold }} /> : <Unlock className="h-3 w-3" />}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
        {!venue.objects.length && <p className="px-3 pt-2 text-[12px]" style={{ color: C.dim }}>Nothing placed yet. Pick something from Assets.</p>}
      </div>
    </div>
  );
}
