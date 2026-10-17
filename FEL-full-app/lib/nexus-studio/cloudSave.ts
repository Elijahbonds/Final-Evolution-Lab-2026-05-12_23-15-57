// SAVE TO ACCOUNT: the pure half (docs/NEXUS-STUDIO-SAVE.md). DESIGN STAGE (owner, 2026-10-17: "Studio: save to account").
// No table exists and no route stores a project yet. The table is an owner decision, so this file is only the logic that
// needs no schema: who may save, what is stored, the size caps and quota maths, and how two devices agree.
//
// THE DEVICE STAYS FIRST. localStorage (storage.ts) is still the save the editor makes 1.5 s after an edit. The account
// copy is a second layer on top of it. When that layer fails, is refused or is offline, the device copy is unchanged.
//
// WHAT AN ACCOUNT COPY HOLDS. The project as sanitizeProject leaves it (the same untrusted-JSON gate an import goes
// through), minus every character's look code unless LOOK_CODES_IN_ACCOUNT says otherwise. A slot code always carries
// height and build, and face sliders when the player asked (lib/creator/look/shareCode.ts). The Creator keeps those
// numbers on the device for anyone who is not a verified adult who opted in (lib/creator/lookPrivacy.ts), so the
// account copy must not become a second way round that rule. The device keeps the codes, and restoreLookCodes puts them
// back on a pull.
//
// TWO DEVICES. Every stored row has a revision. A write names the revision it was based on, and a stale one is a conflict,
// never a silent overwrite. syncAction decides what a device does. mergeProjects is a three-way merge at the level of
// whole entities (a venue's settings, one object, one character, one script, one stamp): edits to different things merge,
// and edits to the same thing are conflicts. keepBoth is the fallback that cannot lose work.
//
// Pure: no prisma, no next/*, no storage. The browser and the route can both import it.

import { LIMITS, newId, sanitizeProject, venueSettings, type StudioObject, type StudioProject, type StudioVenue } from './doc';
import { aiBuilderAge } from './aiAccess';

// ── caps ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Measured 2026-10-17 (docs/NEXUS-STUDIO-SAVE.md §3): a starter project is ~1.9 kB, a typical one (2 venues, 140 objects,
 *  3 characters, 2 scripts) is ~28 kB, six full 600-object venues are ~620 kB, and the doc LIMITS' worst case is ~6.6 MB.
 *  OWNER DECISION Q4 sets these numbers. */
export const CLOUD_LIMITS = {
  /** UTF-8 bytes of one stored project's JSON. */
  projectBytes: 1_048_576,
  /** Projects per account. */
  projects: 20,
  /** All of one account's stored projects together. */
  accountBytes: 8 * 1_048_576,
  /** A PUT body is `{ baseRev, project }`: the project cap plus room for the envelope. */
  bodyBytes: 1_048_576 + 4_096,
} as const;

/** UTF-8 bytes of a value's JSON: what the quota counts. */
export function jsonBytes(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v)).length;
}

// ── who may save (OWNER DECISIONS Q1 and Q2) ─────────────────────────────────────────────────────────────────────────

export type StudioSaveAudience = 'adults' | 'teens-and-adults';
/** Q1. Recommended: verified adults only, the rule AdventureSave and Mirror progress already use. Teens keep the device save. */
export const STUDIO_SAVE_AUDIENCE: StudioSaveAudience = 'adults';
/** Q2. Recommended: a character's look code is never stored in the account copy; it stays on the device that has it. */
export const LOOK_CODES_IN_ACCOUNT = false;

export type CloudSaveReason = 'ok' | 'guest' | 'age';
export interface CloudSavePolicy { allowed: boolean; reason: CloudSaveReason }

/**
 * May this account WRITE a project to the server? The age comes from User.dobYear, read from the database by the route
 * (never the session or the body). It uses the same bands as the Studio's AI builder (aiAccess.ts, ageScreen's lines). An
 * unknown age and under 13 are never allowed. Reading, exporting and deleting what is already stored are not gated by this.
 */
export function cloudSavePolicy(o: { signedIn: boolean; dobYear: number | null | undefined; now?: Date; audience?: StudioSaveAudience }): CloudSavePolicy {
  if (!o.signedIn) return { allowed: false, reason: 'guest' };
  const band = aiBuilderAge(o.dobYear, o.now ?? new Date());
  const audience = o.audience ?? STUDIO_SAVE_AUDIENCE;
  if (band === 'adult' || (band === 'teen' && audience === 'teens-and-adults')) return { allowed: true, reason: 'ok' };
  return { allowed: false, reason: 'age' };
}

// ── what is stored ───────────────────────────────────────────────────────────────────────────────────────────────────

/** Every character without its look code. The character's id and name stay, so a cast still names it. */
export function stripLookCodes(p: StudioProject): { project: StudioProject; stripped: number } {
  let stripped = 0;
  const characters = p.characters.map((c) => {
    if (c.lookCode === undefined) return c;
    stripped++;
    return { id: c.id, name: c.name };
  });
  return { project: stripped ? { ...p, characters } : p, stripped };
}

/** On a pull: give each character back the look code this device holds for the same character id. */
export function restoreLookCodes(fromServer: StudioProject, onDevice: StudioProject | null): StudioProject {
  if (!onDevice) return fromServer;
  const codes = new Map(onDevice.characters.filter((c) => c.lookCode).map((c) => [c.id, c.lookCode!]));
  if (!codes.size) return fromServer;
  return { ...fromServer, characters: fromServer.characters.map((c) => (c.lookCode || !codes.has(c.id) ? c : { ...c, lookCode: codes.get(c.id) })) };
}

export type UploadError = 'invalid_project' | 'id_mismatch' | 'project_too_large';
export type PreparedUpload =
  | { ok: true; project: StudioProject; bytes: number; dropped: number; stripped: number }
  | { ok: false; status: 400 | 413 | 422; error: UploadError; detail?: string };

/**
 * Untrusted JSON → the exact document a row would hold, or why not. It goes through the import gate (sanitizeProject:
 * parse → migrate → sanitize), must be the project the URL names, has its look codes removed unless kept, and must fit
 * the cap AFTER sanitising (what is stored is what is counted).
 */
export function prepareUpload(raw: unknown, o: { projectId: string; keepLookCodes?: boolean; now?: Date }): PreparedUpload {
  const r = sanitizeProject(raw, o.now ?? new Date());
  if (!r.ok) return { ok: false, status: 422, error: 'invalid_project', detail: r.error };
  if (r.project.id !== o.projectId) return { ok: false, status: 400, error: 'id_mismatch' };
  const { project, stripped } = (o.keepLookCodes ?? LOOK_CODES_IN_ACCOUNT) ? { project: r.project, stripped: 0 } : stripLookCodes(r.project);
  const bytes = jsonBytes(project);
  if (bytes > CLOUD_LIMITS.projectBytes) return { ok: false, status: 413, error: 'project_too_large' };
  return { ok: true, project, bytes, dropped: r.dropped, stripped };
}

// ── quota ────────────────────────────────────────────────────────────────────────────────────────────────────────────

export type QuotaResult =
  | { ok: true; countAfter: number; bytesAfter: number }
  | { ok: false; error: 'quota_projects' | 'quota_bytes'; countAfter: number; bytesAfter: number };

/**
 * Would this write keep the account inside its quota? Replacing a project counts only the change in size. A write that
 * makes a project smaller is always allowed, so an account that is over a lowered cap can still save smaller work.
 */
export function quotaCheck(
  existing: readonly { projectId: string; bytes: number }[],
  incoming: { projectId: string; bytes: number },
  limits: { projects: number; accountBytes: number } = CLOUD_LIMITS,
): QuotaResult {
  const prior = existing.find((e) => e.projectId === incoming.projectId);
  const used = existing.reduce((n, e) => n + e.bytes, 0);
  const countAfter = existing.length + (prior ? 0 : 1);
  const bytesAfter = used - (prior?.bytes ?? 0) + incoming.bytes;
  if (prior && incoming.bytes <= prior.bytes) return { ok: true, countAfter, bytesAfter };
  if (countAfter > limits.projects) return { ok: false, error: 'quota_projects', countAfter, bytesAfter };
  if (bytesAfter > limits.accountBytes) return { ok: false, error: 'quota_bytes', countAfter, bytesAfter };
  return { ok: true, countAfter, bytesAfter };
}

// ── two devices ──────────────────────────────────────────────────────────────────────────────────────────────────────

/** A 53-bit hash of the project's content (cyrb53). `updatedAt` is left out, so only a real edit changes it. */
export function projectFingerprint(p: StudioProject): string {
  const { updatedAt: _ignored, ...rest } = p;
  void _ignored;
  const s = canonicalJson(rest);
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** What this device last agreed with the server about one project: the server revision and the content at that point. */
export interface SyncRecord { projectId: string; rev: number; fingerprint: string }

export type SyncAction =
  | { kind: 'none' }
  /** Never saved to the account: create it (baseRev 0). */
  | { kind: 'create' }
  /** Only this device changed it: send it, based on the revision both last agreed. */
  | { kind: 'push'; baseRev: number }
  /** Only the account copy changed: take it (restoreLookCodes first). */
  | { kind: 'pull' }
  /** Both changed, or the same id turned up on both sides with no shared history: merge, or keep both. */
  | { kind: 'conflict'; base: 'known' | 'unknown' }
  /** It was in the account, and now it is not: deleted from another device. Ask, never re-upload by itself. */
  | { kind: 'deleted-elsewhere' };

export function syncAction(local: StudioProject | null, record: SyncRecord | null, server: { rev: number } | null): SyncAction {
  if (!local) return server ? { kind: 'pull' } : { kind: 'none' };
  if (!record) return server ? { kind: 'conflict', base: 'unknown' } : { kind: 'create' };
  if (!server) return { kind: 'deleted-elsewhere' };
  const localChanged = projectFingerprint(local) !== record.fingerprint;
  const serverChanged = server.rev !== record.rev;
  if (localChanged && serverChanged) return { kind: 'conflict', base: 'known' };
  if (localChanged) return { kind: 'push', baseRev: record.rev };
  if (serverChanged) return { kind: 'pull' };
  return { kind: 'none' };
}

/** The non-lossy way out of a conflict: this device's work becomes a new project beside the account's. */
export function keepBoth(mine: StudioProject, now = new Date()): StudioProject {
  const at = now.toISOString();
  const suffix = ' (this device)';
  return { ...mine, id: newId('proj'), name: mine.name.slice(0, LIMITS.name - suffix.length) + suffix, createdAt: at, updatedAt: at };
}

// ── three-way merge ──────────────────────────────────────────────────────────────────────────────────────────────────

type Entities = Map<string, string>;

/** JSON with every object's keys sorted, so the same content compares equal however an edit happened to order its keys. */
export function canonicalJson(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, (x as Record<string, unknown>)[k]]))
    : x));
}

/** A project as a flat map of entity key → its canonical JSON. Keys join with '/', which no id may contain (doc.ts ID). Order is kept apart (orderOf), so moving a list item is not an edit. */
function entities(p: StudioProject): Entities {
  const m: Entities = new Map();
  m.set('meta', canonicalJson({ name: p.name }));
  for (const v of p.venues) {
    m.set(`venue/${v.id}`, canonicalJson(venueSettings(v)));
    for (const o of v.objects) m.set(`obj/${v.id}/${o.id}`, canonicalJson(o));
  }
  for (const c of p.characters) m.set(`char/${c.id}`, canonicalJson(c));
  for (const s of p.scripts) m.set(`script/${s.id}`, canonicalJson(s));
  for (const s of p.stamps ?? []) m.set(`stamp/${s.id}`, canonicalJson(s));
  return m;
}

/** The merged order: whichever side reordered wins; items only the other side has go after, in that side's order. */
function mergeOrder(base: readonly string[], mine: readonly string[], theirs: readonly string[], keep: (id: string) => boolean): string[] {
  const f = (xs: readonly string[]) => xs.filter(keep);
  const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  const mineMoved = !same(f(mine).filter((x) => base.includes(x)), f(base).filter((x) => mine.includes(x)));
  const [first, second] = mineMoved ? [mine, theirs] : [theirs, mine];
  const out = f(first);
  for (const id of f(second)) if (!out.includes(id)) out.push(id);
  return out;
}

export type MergeResult = { ok: true; project: StudioProject; fromTheirs: number } | { ok: false; conflicts: string[] };

/**
 * Three-way merge of whole entities. For each entity: both sides the same → it; one side unchanged from the base → the
 * other side (an edit, an add or a delete); both changed differently → a conflict (an edit against a delete included).
 * Never resolves a conflict by picking a side; the caller offers keepBoth, or "use this device's" / "use the account's".
 * A merge that would leave a venue's object in a deleted venue, a cast naming a deleted character, or more than the doc
 * LIMITS allow is a conflict too, because sanitizeProject would silently drop it.
 */
export function mergeProjects(base: StudioProject, mine: StudioProject, theirs: StudioProject, now = new Date()): MergeResult {
  if (mine.id !== theirs.id) return { ok: false, conflicts: ['project'] };
  const [b, m, t] = [entities(base), entities(mine), entities(theirs)];
  const merged: Entities = new Map();
  const conflicts: string[] = [];
  let fromTheirs = 0;
  for (const k of new Set([...b.keys(), ...m.keys(), ...t.keys()])) {
    const [bv, mv, tv] = [b.get(k), m.get(k), t.get(k)];
    let out: string | undefined;
    if (mv === tv) out = mv;
    else if (mv === bv) { out = tv; fromTheirs++; }
    else if (tv === bv) out = mv;
    else { conflicts.push(k); continue; }
    if (out !== undefined) merged.set(k, out);
  }
  if (conflicts.length) return { ok: false, conflicts };

  const has = (k: string) => merged.has(k);
  const venueIds = mergeOrder(base.venues.map((v) => v.id), mine.venues.map((v) => v.id), theirs.venues.map((v) => v.id), (id) => has(`venue/${id}`));
  for (const k of merged.keys()) {
    const vid = k.startsWith('obj/') ? k.split('/')[1] : null;
    if (vid && !has(`venue/${vid}`)) conflicts.push(`venue/${vid}`);
  }
  const objOrder = (p: StudioProject, vid: string) => p.venues.find((v) => v.id === vid)?.objects.map((o) => o.id) ?? [];
  const venues: StudioVenue[] = venueIds.map((vid) => {
    const ids = mergeOrder(objOrder(base, vid), objOrder(mine, vid), objOrder(theirs, vid), (oid) => has(`obj/${vid}/${oid}`));
    const objects = ids.map((oid) => JSON.parse(merged.get(`obj/${vid}/${oid}`)!) as StudioObject);
    return { ...JSON.parse(merged.get(`venue/${vid}`)!), id: vid, objects } as StudioVenue;
  });
  const list = <T extends { id: string }>(prefix: string, pick: (p: StudioProject) => readonly T[]): T[] =>
    mergeOrder(pick(base).map((x) => x.id), pick(mine).map((x) => x.id), pick(theirs).map((x) => x.id), (id) => has(`${prefix}/${id}`))
      .map((id) => JSON.parse(merged.get(`${prefix}/${id}`)!) as T);
  const characters = list('char', (p) => p.characters);
  const scripts = list('script', (p) => p.scripts);
  const stamps = list('stamp', (p) => p.stamps ?? []);
  const charIds = new Set(characters.map((c) => c.id));
  for (const v of venues) {
    const named = [v.cast?.player, ...(v.cast?.crowd ?? [])].filter((x): x is string => !!x);
    if (named.some((id) => !charIds.has(id))) conflicts.push(`cast/${v.id}`);
  }
  if (conflicts.length) return { ok: false, conflicts: [...new Set(conflicts)] };

  const name = (JSON.parse(merged.get('meta') ?? '{}') as { name?: string }).name ?? mine.name;
  const activeVenueId = venueIds.includes(mine.activeVenueId) ? mine.activeVenueId : venueIds[0] ?? '';
  const candidate: StudioProject = {
    ...mine, name, venues, activeVenueId, characters, scripts, updatedAt: now.toISOString(),
    ...(stamps.length ? { stamps } : {}),
  };
  if (!stamps.length) delete candidate.stamps;
  const checked = sanitizeProject(JSON.parse(JSON.stringify(candidate)), now);
  if (!checked.ok) return { ok: false, conflicts: ['project'] };
  const count = (p: StudioProject) => [p.venues.length, p.venues.reduce((n, v) => n + v.objects.length, 0), p.characters.length, p.scripts.length, p.stamps?.length ?? 0].join();
  if (checked.dropped || count(checked.project) !== count(candidate)) return { ok: false, conflicts: ['limits'] };
  return { ok: true, project: checked.project, fromTheirs };
}
