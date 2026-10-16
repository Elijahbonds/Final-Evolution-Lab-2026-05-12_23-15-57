// The editor's commands, built in one place (pure): the shell, the inspector, the keyboard and the viewport all say what
// they want through these, so every edit has a label the Undo menu can show and a group where a gesture should be one step.

import type { Command, ObjectPatch } from './commands';
import {
  LIMITS, duplicateObject, newId, newVenue,
  type StudioCharacter, type StudioObject, type StudioProject, type StudioScript, type StudioTransform, type StudioVenue, type VenueSettings,
} from './doc';
import {
  NODE_SPECS, edgeAllowed, newEdge, newNode, pointWonGraph, sanitizeParams, wouldCycle,
  type NodeKind, type ParamValue, type ScriptGraph,
} from './scripts';
import type { CastSlot } from './cast';
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

// ── track 3: characters (Closet share codes) and the venue's cast ───────────────────────────────────────────────────

/** Add a character; with `cast`, also cast it in venue `v` — one undo step either way. */
export function addCharacter(p: StudioProject, c: { name: string; lookCode: string }, cast?: { venue: StudioVenue; slot: CastSlot }): { cmd: Command; id: string } {
  const character: StudioCharacter = { id: newId('char'), name: c.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIMITS.name) || `Character ${p.characters.length + 1}`, lookCode: c.lookCode };
  const ops: Command['ops'] = [{ op: 'addCharacter', character }];
  if (cast) ops.push({ op: 'patchVenue', venueId: cast.venue.id, patch: { cast: { ...cast.venue.cast, [cast.slot]: character.id } } });
  return { id: character.id, cmd: { label: cast ? `Cast ${character.name}` : `Add ${character.name}`, ops } };
}

/** Remove a character, and take it out of every venue that casts it (in the same step, so Undo puts both back). */
export function removeCharacter(p: StudioProject, id: string): Command | null {
  const c = p.characters.find((x) => x.id === id);
  if (!c) return null;
  const ops: Command['ops'] = [];
  for (const v of p.venues) {
    if (v.cast?.player !== id && !v.cast?.crowd?.includes(id)) continue;
    ops.push({ op: 'patchVenue', venueId: v.id, patch: { cast: castWithout(v.cast!, id) } });
  }
  ops.push({ op: 'removeCharacter', id });
  return { label: `Delete ${c.name}`, ops };
}

/** A venue's cast with a character taken out of every slot (undefined when nothing is left). */
function castWithout(cast: NonNullable<StudioVenue['cast']>, id: string): StudioVenue['cast'] {
  const player = cast.player === id ? undefined : cast.player;
  const crowd = (cast.crowd ?? []).filter((x) => x !== id);
  const out = { ...(player ? { player } : {}), ...(crowd.length ? { crowd } : {}) };
  return Object.keys(out).length ? out : undefined;
}

/** studio-4b: seat a character among the venue's fans, or take it out (null when the crowd already has LIMITS.crowdCast). */
export function toggleCrowdCast(v: StudioVenue, id: string): Command | null {
  const crowd = v.cast?.crowd ?? [];
  const on = !crowd.includes(id);
  if (on && crowd.length >= LIMITS.crowdCast) return null;
  const next = on ? [...crowd, id] : crowd.filter((x) => x !== id);
  const cast = { ...(v.cast?.player ? { player: v.cast.player } : {}), ...(next.length ? { crowd: next } : {}) };
  return { label: on ? 'Seat character in the crowd' : 'Take character out of the crowd', ops: [{ op: 'patchVenue', venueId: v.id, patch: { cast: Object.keys(cast).length ? cast : undefined } }] };
}

/** studio-4b ("Edit in the Closet"): a character's look replaced by the code the Closet brought back — one undo step. */
export function setCharacterLook(id: string, lookCode: string, name?: string): Command {
  const clean = name?.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIMITS.name);
  return { label: 'Edit look in the Closet', ops: [{ op: 'patchCharacter', id, patch: { lookCode, ...(clean ? { name: clean } : {}) } }] };
}

export function renameCharacter(id: string, name: string): Command {
  return { label: 'Rename character', group: `char:${id}:name`, ops: [{ op: 'patchCharacter', id, patch: { name: name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, LIMITS.name) || 'Character' } }] };
}

/** Fill (or empty, with null) a venue's cast slot. */
export function castCharacter(v: StudioVenue, slot: CastSlot, id: string | null): Command {
  const cast: NonNullable<StudioVenue['cast']> = { ...v.cast };
  if (id) cast[slot] = id; else delete cast[slot];
  return { label: id ? 'Cast character' : 'Uncast character', ops: [{ op: 'patchVenue', venueId: v.id, patch: { cast: Object.keys(cast).length ? cast : undefined } }] };
}

// ── track 4: scripts (event → condition → action graphs) ────────────────────────────────────────────────────────────

/** A new script: blank, or the brief's example (on a point won → crowd cheer + banner). */
export function addScript(p: StudioProject, template: 'blank' | 'pointWon' = 'pointWon'): { cmd: Command; id: string } {
  const graph: ScriptGraph = template === 'pointWon' ? pointWonGraph() : { enabled: true, nodes: [], edges: [] };
  const script: StudioScript = { id: newId('script'), name: template === 'pointWon' ? 'Point won → cheer + banner' : `Script ${p.scripts.length + 1}`, ...graph };
  return { id: script.id, cmd: { label: 'New script', ops: [{ op: 'addScript', script }] } };
}

export function removeScript(p: StudioProject, id: string): Command | null {
  const s = p.scripts.find((x) => x.id === id);
  return s ? { label: `Delete ${s.name}`, ops: [{ op: 'removeScript', id }] } : null;
}

export function editScript(id: string, patch: Partial<Omit<StudioScript, 'id'>>, label: string, group?: string): Command {
  const clean = patch.name !== undefined ? { ...patch, name: patch.name.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, LIMITS.name) || 'Script' } : patch;
  return { label, ...(group ? { group } : {}), ops: [{ op: 'patchScript', id, patch: clean }] };
}

/** Per-venue scope (studio-4b): `null` runs the script in every venue; a list runs it only in those (an empty list: none). */
export function setScriptScope(s: StudioScript, venues: readonly string[] | null): Command {
  const list = venues ? [...new Set(venues)] : undefined;
  const label = !list ? 'Script: every venue' : list.length === 1 ? 'Script: one venue' : `Script: ${list.length} venues`;
  return editScript(s.id, { venues: list }, label);
}

/** Add a node to a script. */
export function addScriptNode(s: StudioScript, kind: NodeKind, x: number, y: number): { cmd: Command; id: string } {
  const node = newNode(kind, x, y);
  return { id: node.id, cmd: editScript(s.id, { nodes: [...s.nodes, node] }, `Add ${NODE_SPECS[kind].label}`) };
}

/** Connect two nodes, if the edge is allowed and closes no loop (else null). */
export function connectNodes(s: StudioScript, from: string, to: string): Command | null {
  const a = s.nodes.find((n) => n.id === from), b = s.nodes.find((n) => n.id === to);
  if (!a || !b || !edgeAllowed(a.kind, b.kind) || s.edges.some((e) => e.from === from && e.to === to) || wouldCycle(s.edges, from, to)) return null;
  return editScript(s.id, { edges: [...s.edges, newEdge(from, to)] }, 'Connect');
}

/** Delete nodes and edges (a deleted node takes its edges with it). */
export function deleteFromScript(s: StudioScript, ids: readonly string[]): Command | null {
  const nodes = s.nodes.filter((n) => !ids.includes(n.id));
  const edges = s.edges.filter((e) => !ids.includes(e.id) && nodes.some((n) => n.id === e.from) && nodes.some((n) => n.id === e.to));
  if (nodes.length === s.nodes.length && edges.length === s.edges.length) return null;
  return editScript(s.id, { nodes, edges }, nodes.length === s.nodes.length ? 'Disconnect' : 'Delete node');
}

/** Move a node (one undo step per drag: the caller seals on release). */
export function moveScriptNode(s: StudioScript, id: string, x: number, y: number): Command {
  return editScript(s.id, { nodes: s.nodes.map((n) => (n.id === id ? { ...n, x: Math.round(x), y: Math.round(y) } : n)) }, 'Move node', `script:${s.id}:move:${id}`);
}

/** A node's parameter, through its spec's sanitiser (typing coalesces per field). */
export function setNodeParam(s: StudioScript, id: string, key: string, value: ParamValue): Command {
  return editScript(s.id, { nodes: s.nodes.map((n) => (n.id === id ? { ...n, params: sanitizeParams(n.kind, { ...n.params, [key]: value }) } : n)) }, `Edit ${key}`, `script:${s.id}:param:${id}:${key}`);
}
