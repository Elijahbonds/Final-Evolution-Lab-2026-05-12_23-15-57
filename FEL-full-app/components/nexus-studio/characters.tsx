'use client';

// TRACK 3, CHARACTERS (docs/NEXUS-STUDIO.md §3): a project character is a Closet share code. Bring one in from the creator's
// own Closet (each saved look, encoded the way the Closet's Share button encodes it) or paste a code someone shared; cast it
// as a venue's player and the viewport stands it on the hero's spot on the real rig; Play-test dresses the mode's hero in it.
// The Closet Studio stays the editor of the look itself ("Edit in the Closet").
//
// PRIVACY: a minor's look lives on the device only (LOOK PRIVACY, PR #98): for a lookLocal account the looks are read from the
// device copy, as every mode reads them. A project is kept on this device too; nothing here is sent anywhere (the AI builder's
// prompt never carries a character — lib/nexus-studio/aiEdits.ts venueBrief).
//
// studio-4b: THE CROWD — a character can be seated among a venue's fans (visual only; castLayer.ts), and EDIT IN THE CLOSET — a
// character's code handed to the Closet Studio in another tab and the edited code brought back as one undo step, on this device
// (lib/nexus-studio/castCloset.ts; the Closet's half is in components/closet-view.tsx). The same panel also offers the manual
// path: copy the code, paste the edited one back.

import { useCallback, useEffect, useRef, useState } from 'react';
import { UserRound, ClipboardPaste, Shirt, Trash2, Loader2, Users, PenLine, Copy, X } from 'lucide-react';
import { encodeSlotCode } from '@/lib/creator/look/shareCode';
import { readSlots } from '@/lib/creator/look/slots';
import { readLocalLook } from '@/lib/creator/localLook';
import { CROWD_CAST_MAX, decodeCharacter } from '@/lib/nexus-studio/cast';
import { CLOSET_RETURN_KEY, cancelClosetEdit, startClosetEdit, takeClosetReturn } from '@/lib/nexus-studio/castCloset';
import { browserKV } from '@/lib/nexus-studio/storage';
import { addCharacter, castCharacter, removeCharacter, renameCharacter, setCharacterLook, toggleCrowdCast } from '@/lib/nexus-studio/edits';
import type { Command } from '@/lib/nexus-studio/commands';
import type { StudioCharacter, StudioProject, StudioVenue } from '@/lib/nexus-studio/doc';
import type { StudioApi } from './use-studio';
import { C, PanelTitle, Row, Select, TextField } from './ui';

export interface ClosetLook { label: string; code: string; body: string }

/**
 * The creator's saved Closet looks as share codes. `fetchJson` and `local` are injected for tests. A guest (401), a failed
 * read or a closet with no saved look answers [] — never throws.
 */
export async function loadClosetLooks(
  fetchJson: () => Promise<unknown> = () => fetch('/api/v1/closet').then((r) => (r.ok ? r.json() : null)),
  local: () => { face?: unknown } | null = readLocalLook,
): Promise<ClosetLook[]> {
  try {
    const data = (await fetchJson()) as { lookLocal?: boolean; look?: { face?: unknown } } | null;
    if (!data) return [];
    const face = data.lookLocal === true ? local()?.face : data.look?.face;
    if (!face) return [];
    const out: ClosetLook[] = [];
    for (const slot of readSlots(face)) out.push({ label: slot.label, code: await encodeSlotCode(slot), body: slot.body });
    return out;
  } catch { return []; }
}

/** The add controls: a look from the Closet, or a pasted code. `onAdd` gets a validated code. */
function AddCharacter({ onAdd, compact }: { onAdd(c: { name: string; lookCode: string }): void; compact?: boolean }) {
  const [mode, setMode] = useState<'idle' | 'closet' | 'paste'>('idle');
  const [looks, setLooks] = useState<ClosetLook[] | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const openCloset = async () => { setMode('closet'); setError(null); setLooks(null); const l = await loadClosetLooks(); setLooks(l); if (!l.length) setError('No saved looks in your Closet on this account — make one in the Closet, or paste a code.'); };
  const paste = async () => {
    setBusy(true); setError(null);
    const r = await decodeCharacter({ name: 'Pasted look', lookCode: code.trim() });
    setBusy(false);
    if (!r.ok) { setError(r.error); return; }
    onAdd({ name: 'Pasted look', lookCode: code.replace(/\s+/g, '') }); setCode(''); setMode('idle');
  };
  return (
    <div className={compact ? 'px-3 py-1' : 'px-3 py-2'}>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => void openCloset()} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: C.line, color: C.text }}><Shirt className="h-3.5 w-3.5" aria-hidden /> From my Closet</button>
        <button type="button" onClick={() => { setMode('paste'); setError(null); }} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: C.line, color: C.text }}><ClipboardPaste className="h-3.5 w-3.5" aria-hidden /> Paste a share code</button>
      </div>
      {mode === 'closet' && (
        <ul className="mt-1.5 space-y-1" data-testid="closet-looks">
          {looks === null && <li className="flex items-center gap-1 text-[12px]" style={{ color: C.dim }}><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Reading your Closet…</li>}
          {looks?.map((l) => (
            <li key={l.code}><button type="button" onClick={() => { onAdd({ name: l.label, lookCode: l.code }); setMode('idle'); }} className="w-full rounded-md border px-2 py-1 text-left text-[12px]" style={{ borderColor: C.line, color: C.text }}>{l.label} <span style={{ color: C.dim }}>· {l.body}</span></button></li>
          ))}
        </ul>
      )}
      {mode === 'paste' && (
        <div className="mt-1.5 flex gap-1">
          <input aria-label="Share code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="FEL2.…" className="min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 font-mono text-[11px] outline-none" style={{ borderColor: C.line, color: C.text }} />
          <button type="button" disabled={busy || !code.trim()} onClick={() => void paste()} className="rounded-md px-2 py-1 text-[12px] font-semibold disabled:opacity-40" style={{ background: C.cyan, color: '#050505' }}>Add</button>
        </div>
      )}
      {error && <p className="mt-1 text-[11px]" style={{ color: C.ember }} role="alert">{error}</p>}
    </div>
  );
}

/** Pure: who sits in a venue's crowd, in words. */
export function crowdSummary(project: Pick<StudioProject, 'characters'>, venue: Pick<StudioVenue, 'cast'>): string {
  const names = (venue.cast?.crowd ?? []).map((id) => project.characters.find((c) => c.id === id)?.name).filter(Boolean) as string[];
  return names.length ? names.join(', ') : 'Only the crowd’s own fans';
}

/** The inspector's character slots: who plays this venue, and who sits among its fans. */
export function CastSlotField({ project, venue, run }: { project: StudioProject; venue: StudioVenue; run(cmd: Command): void }) {
  const current = venue.cast?.player ?? '';
  const crowd = venue.cast?.crowd ?? [];
  return (
    <div data-testid="cast-slot">
      <Row label="Player" hint="Who the mode's hero is in this venue: a Closet look (its share code), worn through playerIdentity, with its own height and build (visual only: the score never reads the body).">
        <Select label="Player" value={current} options={[{ value: '', label: 'The player’s own look' }, ...project.characters.map((c) => ({ value: c.id, label: c.name }))]} onChange={(id) => run(castCharacter(venue, 'player', id || null))} />
      </Row>
      <Row label="In the crowd" hint={`Characters seated among the fans, in the stands' empty seats (up to ${CROWD_CAST_MAX}). Visual only; a phone keeps its card crowd.`}>
        <span className="text-[11px]" style={{ color: crowd.length ? C.text : C.dim }} data-testid="crowd-cast-summary">{crowdSummary(project, venue)}</span>
      </Row>
      {project.characters.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-1">
          {project.characters.map((c) => {
            const on = crowd.includes(c.id);
            const full = !on && crowd.length >= CROWD_CAST_MAX;
            return (
              <button key={c.id} type="button" disabled={full} aria-pressed={on} onClick={() => { const cmd = toggleCrowdCast(venue, c.id); if (cmd) run(cmd); }}
                className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] disabled:opacity-40" style={{ borderColor: on ? C.gold : C.line, color: on ? C.gold : C.dim }}>
                <Users className="h-3 w-3" aria-hidden /> {c.name}
              </button>
            );
          })}
        </div>
      )}
      <AddCharacter compact onAdd={(c) => run(addCharacter(project, c, { venue, slot: 'player' }).cmd)} />
    </div>
  );
}

/**
 * "Edit in the Closet": the hand-off to the Closet Studio in another tab, and the way back. Listens for the Closet's return (a
 * `storage` event, and on focus — a tab that was in the background may have missed it); a returned code is decoded before it is
 * applied (one undo step). The manual path (copy the code, paste the edited one) works without the Closet's half.
 */
export function useClosetEdit(studio: Pick<StudioApi, 'doc' | 'run'>) {
  const [editing, setEditing] = useState<{ session: string; characterId: string; name: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const runRef = useRef(studio.run); runRef.current = studio.run;
  const docRef = useRef(studio.doc); docRef.current = studio.doc;
  const apply = useCallback(async (characterId: string, code: string, name?: string): Promise<string | null> => {
    const r = await decodeCharacter({ name: name ?? 'Character', lookCode: code });
    if (!r.ok) return r.error;
    runRef.current(setCharacterLook(characterId, code.replace(/\s+/g, ''), name));
    setEditing(null);
    setNote('The look came back from the Closet — Undo puts the old one back.');
    return null;
  }, []);
  useEffect(() => {
    if (!editing) return;
    const check = () => {
      const r = takeClosetReturn(browserKV(), editing.session);
      if (!r || r.characterId !== editing.characterId) return;
      // the Closet shows a slot's label in capitals: a name that only changed case is not a rename
      const now = docRef.current.characters.find((c) => c.id === r.characterId)?.name ?? '';
      void apply(r.characterId, r.code, r.name && r.name.toLowerCase() !== now.toLowerCase() ? r.name : undefined);
    };
    const onStorage = (e: StorageEvent) => { if (e.key === CLOSET_RETURN_KEY) check(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', check);
    check();
    return () => { window.removeEventListener('storage', onStorage); window.removeEventListener('focus', check); };
  }, [editing, apply]);
  const start = (c: StudioCharacter) => {
    setNote(null);
    const h = startClosetEdit(browserKV(), c);
    // no device storage: the manual path still works (copy, edit, paste back)
    setEditing({ session: h?.session ?? 'manual', characterId: c.id, name: c.name });
    if (h) window.open(h.url, '_blank', 'noopener');
  };
  const cancel = () => { cancelClosetEdit(browserKV()); setEditing(null); };
  return { editing, note, start, cancel, apply, dismiss: () => setNote(null) };
}

/** The waiting panel while a look is in the Closet: what to do there, and the manual way back. */
function ClosetEditPanel({ character, onApply, onCancel }: { character: StudioCharacter; onApply(code: string): Promise<string | null>; onCancel(): void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="mx-3 my-2 rounded-lg border p-2" style={{ borderColor: C.gold, background: C.surface2 }} data-testid="closet-edit-panel" role="status">
      <p className="text-[12px]" style={{ color: C.text }}>Editing <b>{character.name}</b> in the Closet (another tab). Press <b>Back to Nexus Studio</b> there and the new look lands here as one step.</p>
      <p className="mt-1 text-[11px]" style={{ color: C.dim }}>Or by hand: copy the code, paste it into the Closet (Code), edit, Share → copy, and paste the new code here.</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => { void navigator.clipboard?.writeText(character.lookCode ?? '').then(() => setCopied(true), () => setCopied(false)); }} className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]" style={{ borderColor: C.line, color: C.text }}><Copy className="h-3 w-3" aria-hidden /> {copied ? 'Copied' : 'Copy the code'}</button>
        <input aria-label="Edited share code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="FEL2.…" className="min-w-0 flex-1 rounded-md border bg-transparent px-2 py-0.5 font-mono text-[11px] outline-none" style={{ borderColor: C.line, color: C.text }} />
        <button type="button" disabled={!code.trim()} onClick={() => { void onApply(code.trim()).then(setError); }} className="rounded-md px-2 py-0.5 text-[11px] font-semibold disabled:opacity-40" style={{ background: C.cyan, color: '#050505' }}>Use this look</button>
        <button type="button" aria-label="Stop editing in the Closet" onClick={onCancel} className="rounded p-1 hover:bg-white/5"><X className="h-3.5 w-3.5" style={{ color: C.dim }} /></button>
      </div>
      {error && <p className="mt-1 text-[11px]" style={{ color: C.ember }} role="alert">{error}</p>}
    </div>
  );
}

/** The Characters track: the project's cast list. */
export function CharactersTrack({ studio, onPreview }: { studio: StudioApi; onPreview?(): void }) {
  const { doc, venue, run, seal } = studio;
  const closet = useClosetEdit(studio);
  const crowd = venue?.cast?.crowd ?? [];
  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto p-6" data-testid="characters-track">
      <div className="w-full max-w-3xl rounded-xl border" style={{ borderColor: C.line, background: C.surface }}>
        <PanelTitle right={<span className="text-[11px]" style={{ color: C.dim }}>Closet share codes · {doc.characters.length}</span>}>Characters</PanelTitle>
        <p className="px-3 text-[12px]" style={{ color: C.dim }}>A character is a Closet look. Cast one as a venue’s player: the viewport stands it on the hero’s spot on the real rig, and Play-test dresses the mode’s hero in it. Seat up to {CROWD_CAST_MAX} among the fans (visual only). Edit the look itself in the Closet.</p>
        <AddCharacter onAdd={(c) => run(addCharacter(doc, c).cmd)} />
        {closet.note && (
          <p className="mx-3 my-1 flex items-center justify-between rounded-md border px-2 py-1 text-[12px]" style={{ borderColor: C.line, color: C.emerald }} role="status" data-testid="closet-edit-note">
            {closet.note}<button type="button" onClick={closet.dismiss} className="text-[11px]" style={{ color: C.dim }}>Dismiss</button>
          </p>
        )}
        <ul className="divide-y" style={{ borderColor: C.line }}>
          {doc.characters.map((c: StudioCharacter) => {
            const cast = venue?.cast?.player === c.id;
            const inCrowd = crowd.includes(c.id);
            const crowdFull = !inCrowd && crowd.length >= CROWD_CAST_MAX;
            return (
              <li key={c.id} data-testid="character-row">
              <div className="flex items-center gap-2 px-3 py-2">
                <UserRound className="h-4 w-4 shrink-0" style={{ color: cast ? C.gold : C.dim }} aria-hidden />
                <span className="w-44"><TextField label={`Name of ${c.name}`} value={c.name} onChange={(n) => run(renameCharacter(c.id, n))} onDone={seal} /></span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px]" style={{ color: C.dim }} title={c.lookCode}>{c.lookCode?.slice(0, 18)}…</span>
                {venue && (
                  <button type="button" onClick={() => { run(castCharacter(venue, 'player', cast ? null : c.id)); if (!cast) onPreview?.(); }} className="shrink-0 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px]" style={{ borderColor: cast ? C.gold : C.line, color: cast ? C.gold : C.text }}>
                    {cast ? `Player in ${venue.name}` : `Cast in ${venue.name}`}
                  </button>
                )}
                {venue && (
                  <button type="button" disabled={crowdFull} aria-pressed={inCrowd} title={crowdFull ? `The crowd seats ${CROWD_CAST_MAX} characters at most` : 'Seat among the fans (visual only)'}
                    onClick={() => { const cmd = toggleCrowdCast(venue, c.id); if (cmd) run(cmd); }} className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] disabled:opacity-40" style={{ borderColor: inCrowd ? C.gold : C.line, color: inCrowd ? C.gold : C.text }}>
                    <Users className="h-3 w-3" aria-hidden /> {inCrowd ? 'In the crowd' : 'Seat in the crowd'}
                  </button>
                )}
                <button type="button" disabled={!c.lookCode} onClick={() => closet.start(c)} title="Open this look in the Closet Studio and bring the edit back" className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] disabled:opacity-40" style={{ borderColor: closet.editing?.characterId === c.id ? C.gold : C.line, color: C.text }}>
                  <PenLine className="h-3 w-3" aria-hidden /> Edit in the Closet
                </button>
                <button type="button" aria-label={`Delete ${c.name}`} onClick={() => { const cmd = removeCharacter(doc, c.id); if (cmd) run(cmd); }} className="rounded p-1 hover:bg-white/5"><Trash2 className="h-3.5 w-3.5" style={{ color: C.dim }} /></button>
              </div>
              {closet.editing?.characterId === c.id && <ClosetEditPanel character={c} onApply={(code) => closet.apply(c.id, code)} onCancel={closet.cancel} />}
              </li>
            );
          })}
          {!doc.characters.length && <li className="px-3 py-3 text-[12px]" style={{ color: C.dim }}>No characters yet.</li>}
        </ul>
      </div>
    </div>
  );
}
