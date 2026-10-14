// THE COMMAND STACK (docs/NEXUS-STUDIO.md §2.2). Every edit to a Studio project is a command: a label and a list of ops.
// Executing one records each op's INVERSE from the document as it was — the old value of a patch, the removed object and
// the index it stood at — so undo is exact and no command needs a hand-written inverse.
//
// Pure and immutable: execute / undo / redo return a new stack and never touch the old one, so it drops into React state.
//
// COALESCING. A gizmo drag, a slider or a colour drag fires many changes; undo should step back over the whole gesture.
// A command with the same `group` as the step before it MERGES into that step (its ops run after, its inverses run first).
//
// DIRTY. Every step has an id; the stack remembers the id of the step that was saved. "Dirty" is "the present step is
// not the saved one" — so undoing back to the save is clean again, and a merge (which changes a step's content) mints a
// new id, so a save followed by more of the same drag is dirty.

import {
  findObject, venueSettings,
  type StudioObject, type StudioProject, type StudioVenue, type VenueSettings,
} from './doc';

export type ObjectPatch = { [K in keyof StudioObject]?: StudioObject[K] } & Record<string, unknown>;

export type Op =
  | { op: 'addObject'; venueId: string; object: StudioObject; index?: number }
  | { op: 'removeObject'; venueId: string; id: string }
  | { op: 'patchObject'; venueId: string; id: string; patch: ObjectPatch }
  | { op: 'patchVenue'; venueId: string; patch: Partial<VenueSettings> }
  | { op: 'addVenue'; venue: StudioVenue; index?: number }
  | { op: 'removeVenue'; id: string }
  | { op: 'setActiveVenue'; id: string }
  | { op: 'setName'; name: string }
  | { op: 'replaceProject'; project: StudioProject };

export interface Command { label: string; ops: Op[]; group?: string }

export interface Step { id: number; label: string; group: string | null; redo: Op[]; undo: Op[] }

export interface CommandStack {
  doc: StudioProject;
  past: Step[];
  future: Step[];
  limit: number;
  /** id of the step whose result was last saved; 0 = the document the stack was opened on */
  savedId: number;
  nextId: number;
}

export const STACK_LIMIT = 200;

export function createStack(doc: StudioProject, limit = STACK_LIMIT): CommandStack {
  return { doc, past: [], future: [], limit: Math.max(1, Math.floor(limit)), savedId: 0, nextId: 1 };
}

export class CommandError extends Error {}

/** A deep copy that KEEPS `undefined` values: in a patch, `key: undefined` means "remove the key", and a JSON copy would drop
 *  the instruction (a redo of "no own sky" then left the sky in). */
const clone = <T>(x: T): T => (x === undefined ? x : structuredClone(x));

function mapVenue(doc: StudioProject, venueId: string, f: (v: StudioVenue) => StudioVenue): StudioProject {
  const i = doc.venues.findIndex((v) => v.id === venueId);
  if (i < 0) throw new CommandError(`no venue ${venueId}`);
  const venues = doc.venues.slice();
  venues[i] = f(venues[i]);
  return { ...doc, venues };
}

/** The keys a patch may not change: an object's id and type are its identity. */
const FROZEN_OBJECT_KEYS = new Set(['id', 'type']);

/** Apply one op; return the new document and the op that undoes it. Throws CommandError on an op that cannot apply. */
export function applyOp(doc: StudioProject, op: Op): { doc: StudioProject; inverse: Op } {
  switch (op.op) {
    case 'addObject': {
      let at = 0;
      const next = mapVenue(doc, op.venueId, (v) => {
        if (v.objects.some((o) => o.id === op.object.id)) throw new CommandError(`object ${op.object.id} already exists`);
        const objects = v.objects.slice();
        at = op.index === undefined ? objects.length : Math.max(0, Math.min(objects.length, op.index));
        objects.splice(at, 0, clone(op.object));
        return { ...v, objects };
      });
      return { doc: next, inverse: { op: 'removeObject', venueId: op.venueId, id: op.object.id } };
    }
    case 'removeObject': {
      let removed: StudioObject | null = null; let index = -1;
      const next = mapVenue(doc, op.venueId, (v) => {
        index = v.objects.findIndex((o) => o.id === op.id);
        if (index < 0) throw new CommandError(`no object ${op.id}`);
        removed = v.objects[index];
        return { ...v, objects: v.objects.filter((o) => o.id !== op.id) };
      });
      return { doc: next, inverse: { op: 'addObject', venueId: op.venueId, object: removed!, index } };
    }
    case 'patchObject': {
      const before: Record<string, unknown> = {};
      const next = mapVenue(doc, op.venueId, (v) => {
        const o = findObject(v, op.id);
        if (!o) throw new CommandError(`no object ${op.id}`);
        const merged: Record<string, unknown> = { ...o };
        for (const [k, val] of Object.entries(op.patch)) {
          if (FROZEN_OBJECT_KEYS.has(k)) throw new CommandError(`an object's ${k} cannot change`);
          before[k] = k in o ? clone((o as unknown as Record<string, unknown>)[k]) : undefined;
          if (val === undefined) delete merged[k]; else merged[k] = clone(val);
        }
        return { ...v, objects: v.objects.map((x) => (x.id === op.id ? (merged as unknown as StudioObject) : x)) };
      });
      return { doc: next, inverse: { op: 'patchObject', venueId: op.venueId, id: op.id, patch: before as ObjectPatch } };
    }
    case 'patchVenue': {
      const before: Record<string, unknown> = {};
      const next = mapVenue(doc, op.venueId, (v) => {
        const settings = venueSettings(v) as unknown as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...v };
        for (const [k, val] of Object.entries(op.patch)) {
          if (k === 'id' || k === 'objects') throw new CommandError(`a venue patch cannot change ${k}`);
          before[k] = k in settings ? clone(settings[k]) : undefined;
          if (val === undefined) delete merged[k]; else merged[k] = clone(val);
        }
        return merged as unknown as StudioVenue;
      });
      return { doc: next, inverse: { op: 'patchVenue', venueId: op.venueId, patch: before as Partial<VenueSettings> } };
    }
    case 'addVenue': {
      if (doc.venues.some((v) => v.id === op.venue.id)) throw new CommandError(`venue ${op.venue.id} already exists`);
      const venues = doc.venues.slice();
      const at = op.index === undefined ? venues.length : Math.max(0, Math.min(venues.length, op.index));
      venues.splice(at, 0, clone(op.venue));
      return { doc: { ...doc, venues }, inverse: { op: 'removeVenue', id: op.venue.id } };
    }
    case 'removeVenue': {
      const index = doc.venues.findIndex((v) => v.id === op.id);
      if (index < 0) throw new CommandError(`no venue ${op.id}`);
      if (doc.venues.length === 1) throw new CommandError('a project keeps at least one venue');
      const venue = doc.venues[index];
      const venues = doc.venues.filter((v) => v.id !== op.id);
      const activeVenueId = doc.activeVenueId === op.id ? venues[Math.min(index, venues.length - 1)].id : doc.activeVenueId;
      // undoing restores the venue AND which venue was active
      return { doc: { ...doc, venues, activeVenueId }, inverse: { op: 'addVenue', venue, index } };
    }
    case 'setActiveVenue': {
      if (!doc.venues.some((v) => v.id === op.id)) throw new CommandError(`no venue ${op.id}`);
      return { doc: { ...doc, activeVenueId: op.id }, inverse: { op: 'setActiveVenue', id: doc.activeVenueId } };
    }
    case 'setName':
      return { doc: { ...doc, name: op.name }, inverse: { op: 'setName', name: doc.name } };
    case 'replaceProject':
      return { doc: clone(op.project), inverse: { op: 'replaceProject', project: doc } };
  }
}

/** Run ops in order; return the result and the inverses in the order that undoes them. All-or-nothing. */
export function applyOps(doc: StudioProject, ops: readonly Op[]): { doc: StudioProject; inverses: Op[] } {
  let d = doc;
  const inverses: Op[] = [];
  for (const op of ops) {
    const r = applyOp(d, op);
    d = r.doc;
    inverses.unshift(r.inverse);
  }
  // removeVenue's inverse puts the venue back but not which one was active: restore it explicitly
  if (ops.some((o) => o.op === 'removeVenue') && d.activeVenueId !== doc.activeVenueId) inverses.push({ op: 'setActiveVenue', id: doc.activeVenueId });
  return { doc: d, inverses };
}

function touch(doc: StudioProject, now: Date): StudioProject { return { ...doc, updatedAt: now.toISOString() }; }

/** Execute a command. A command whose ops change nothing records nothing. */
export function execute(stack: CommandStack, cmd: Command, now = new Date()): CommandStack {
  if (!cmd.ops.length) return stack;
  const { doc, inverses } = applyOps(stack.doc, cmd.ops);
  if (JSON.stringify(doc) === JSON.stringify(stack.doc)) return stack;
  const group = cmd.group ?? null;
  const prev = stack.past[stack.past.length - 1];
  if (group && prev && prev.group === group && !stack.future.length) {
    const merged: Step = { id: stack.nextId, label: cmd.label, group, redo: [...prev.redo, ...cmd.ops], undo: [...inverses, ...prev.undo] };
    return { ...stack, doc: touch(doc, now), past: [...stack.past.slice(0, -1), merged], future: [], nextId: stack.nextId + 1 };
  }
  const step: Step = { id: stack.nextId, label: cmd.label, group, redo: cmd.ops.map(clone), undo: inverses };
  const past = [...stack.past, step];
  return { ...stack, doc: touch(doc, now), past: past.length > stack.limit ? past.slice(past.length - stack.limit) : past, future: [], nextId: stack.nextId + 1 };
}

/** End a coalescing gesture: the next command with the same group starts a new step. */
export function seal(stack: CommandStack): CommandStack {
  const prev = stack.past[stack.past.length - 1];
  if (!prev || prev.group === null) return stack;
  return { ...stack, past: [...stack.past.slice(0, -1), { ...prev, group: null }] };
}

export const canUndo = (s: CommandStack): boolean => s.past.length > 0;
export const canRedo = (s: CommandStack): boolean => s.future.length > 0;

export function undo(stack: CommandStack, now = new Date()): CommandStack {
  const step = stack.past[stack.past.length - 1];
  if (!step) return stack;
  const { doc } = applyOps(stack.doc, step.undo);
  return { ...stack, doc: touch(doc, now), past: stack.past.slice(0, -1), future: [{ ...step, group: null }, ...stack.future] };
}

export function redo(stack: CommandStack, now = new Date()): CommandStack {
  const step = stack.future[0];
  if (!step) return stack;
  const { doc } = applyOps(stack.doc, step.redo);
  return { ...stack, doc: touch(doc, now), past: [...stack.past, step], future: stack.future.slice(1) };
}

/** The id of the step the present document is the result of (0 = as opened). */
export const presentId = (s: CommandStack): number => s.past[s.past.length - 1]?.id ?? 0;
export const isDirty = (s: CommandStack): boolean => presentId(s) !== s.savedId;
export const markSaved = (s: CommandStack): CommandStack => ({ ...s, savedId: presentId(s) });

/** What Undo and Redo would do, for the menu and the tooltips. */
export const undoLabel = (s: CommandStack): string | null => s.past[s.past.length - 1]?.label ?? null;
export const redoLabel = (s: CommandStack): string | null => s.future[0]?.label ?? null;
