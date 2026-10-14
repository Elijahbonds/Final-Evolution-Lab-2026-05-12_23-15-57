// The editor's commands, built in one place (pure): the shell, the inspector, the keyboard and the viewport all say what
// they want through these, so every edit has a label the Undo menu can show and a group where a gesture should be one step.

import type { Command, ObjectPatch } from './commands';
import {
  duplicateObject, newVenue, type StudioObject, type StudioProject, type StudioTransform, type StudioVenue, type VenueSettings,
} from './doc';
import { instantiate, type CatalogItem } from './catalog';
import type { PlaytestTarget } from './targets';

export function placeItem(v: StudioVenue, item: CatalogItem, at: [number, number, number]): { cmd: Command; id: string } {
  const object = instantiate(item, at);
  return { id: object.id, cmd: { label: `Place ${item.label}`, ops: [{ op: 'addObject', venueId: v.id, object }] } };
}

export function moveObject(v: StudioVenue, id: string, t: StudioTransform, label = 'Move'): Command {
  return { label, ops: [{ op: 'patchObject', venueId: v.id, id, patch: { t } }] };
}

/** An inspector field: typing into it is one undo step per field until it loses focus (the caller seals). */
export function editObject(v: StudioVenue, id: string, patch: ObjectPatch, field: string): Command {
  return { label: `Edit ${field}`, group: `obj:${id}:${field}`, ops: [{ op: 'patchObject', venueId: v.id, id, patch }] };
}

export function editVenue(v: StudioVenue, patch: Partial<VenueSettings>, field: string): Command {
  return { label: `Venue: ${field}`, group: `venue:${v.id}:${field}`, ops: [{ op: 'patchVenue', venueId: v.id, patch }] };
}

/** Delete: locked objects stay (they are locked against exactly this). */
export function deleteObjects(v: StudioVenue, ids: readonly string[]): Command | null {
  const gone = v.objects.filter((o) => ids.includes(o.id) && !o.locked);
  if (!gone.length) return null;
  return { label: gone.length === 1 ? `Delete ${gone[0].name}` : `Delete ${gone.length} objects`, ops: gone.map((o) => ({ op: 'removeObject' as const, venueId: v.id, id: o.id })) };
}

export function duplicate(v: StudioVenue, id: string): { cmd: Command; id: string } | null {
  const o = v.objects.find((x) => x.id === id);
  if (!o) return null;
  const copy = duplicateObject(o);
  const index = v.objects.indexOf(o) + 1;
  return { id: copy.id, cmd: { label: `Duplicate ${o.name}`, ops: [{ op: 'addObject', venueId: v.id, object: copy, index }] } };
}

export function toggleFlag(v: StudioVenue, o: StudioObject, key: 'hidden' | 'locked'): Command {
  const on = !o[key];
  return { label: `${on ? (key === 'hidden' ? 'Hide' : 'Lock') : (key === 'hidden' ? 'Show' : 'Unlock')} ${o.name}`, ops: [{ op: 'patchObject', venueId: v.id, id: o.id, patch: { [key]: on ? true : undefined } as ObjectPatch }] };
}

export function addVenue(p: StudioProject, target: PlaytestTarget): { cmd: Command; id: string } {
  const v = newVenue(`Venue ${p.venues.length + 1}`, { spec: target.spec, target: target.key });
  return { id: v.id, cmd: { label: 'New venue', ops: [{ op: 'addVenue', venue: v }, { op: 'setActiveVenue', id: v.id }] } };
}

export function switchVenue(id: string): Command { return { label: 'Switch venue', ops: [{ op: 'setActiveVenue', id }] }; }

export function importProject(project: StudioProject): Command { return { label: `Import ${project.name}`, ops: [{ op: 'replaceProject', project }] }; }

export function renameProject(name: string): Command { return { label: 'Rename project', group: 'project:name', ops: [{ op: 'setName', name }] }; }
