'use client';

// TRACK 3, CHARACTERS (docs/NEXUS-STUDIO.md §3): a project character is a Closet share code. Bring one in from the creator's
// own Closet (each saved look, encoded the way the Closet's Share button encodes it) or paste a code someone shared; cast it
// as a venue's player and the viewport stands it on the hero's spot on the real rig; Play-test dresses the mode's hero in it.
// The Closet Studio stays the editor of the look itself ("Edit in the Closet").
//
// PRIVACY: a minor's look lives on the device only (LOOK PRIVACY, PR #98): for a lookLocal account the looks are read from the
// device copy, as every mode reads them. A project is kept on this device too; nothing here is sent anywhere (the AI builder's
// prompt never carries a character — lib/nexus-studio/aiEdits.ts venueBrief).

import { useState } from 'react';
import { UserRound, ClipboardPaste, Shirt, Trash2, Loader2 } from 'lucide-react';
import { encodeSlotCode } from '@/lib/creator/look/shareCode';
import { readSlots } from '@/lib/creator/look/slots';
import { readLocalLook } from '@/lib/creator/localLook';
import { decodeCharacter } from '@/lib/nexus-studio/cast';
import { addCharacter, castCharacter, removeCharacter, renameCharacter } from '@/lib/nexus-studio/edits';
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

/** The inspector's character slot: who plays this venue. */
export function CastSlotField({ project, venue, run }: { project: StudioProject; venue: StudioVenue; run(cmd: Command): void }) {
  const current = venue.cast?.player ?? '';
  return (
    <div data-testid="cast-slot">
      <Row label="Player" hint="Who the mode's hero is in this venue: a Closet look (its share code), worn through playerIdentity. Plays on the standard frame.">
        <Select label="Player" value={current} options={[{ value: '', label: 'The player’s own look' }, ...project.characters.map((c) => ({ value: c.id, label: c.name }))]} onChange={(id) => run(castCharacter(venue, 'player', id || null))} />
      </Row>
      <AddCharacter compact onAdd={(c) => run(addCharacter(project, c, { venue, slot: 'player' }).cmd)} />
    </div>
  );
}

/** The Characters track: the project's cast list. */
export function CharactersTrack({ studio, onPreview }: { studio: StudioApi; onPreview?(): void }) {
  const { doc, venue, run, seal } = studio;
  return (
    <div className="flex min-h-0 flex-1 justify-center overflow-y-auto p-6" data-testid="characters-track">
      <div className="w-full max-w-2xl rounded-xl border" style={{ borderColor: C.line, background: C.surface }}>
        <PanelTitle right={<span className="text-[11px]" style={{ color: C.dim }}>Closet share codes · {doc.characters.length}</span>}>Characters</PanelTitle>
        <p className="px-3 text-[12px]" style={{ color: C.dim }}>A character is a Closet look. Cast one as a venue’s player: the viewport stands it on the hero’s spot on the real rig, and Play-test dresses the mode’s hero in it. Edit the look itself in the Closet.</p>
        <AddCharacter onAdd={(c) => run(addCharacter(doc, c).cmd)} />
        <ul className="divide-y" style={{ borderColor: C.line }}>
          {doc.characters.map((c: StudioCharacter) => {
            const cast = venue?.cast?.player === c.id;
            return (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2" data-testid="character-row">
                <UserRound className="h-4 w-4 shrink-0" style={{ color: cast ? C.gold : C.dim }} aria-hidden />
                <span className="w-44"><TextField label={`Name of ${c.name}`} value={c.name} onChange={(n) => run(renameCharacter(c.id, n))} onDone={seal} /></span>
                <span className="truncate font-mono text-[10px]" style={{ color: C.dim }} title={c.lookCode}>{c.lookCode?.slice(0, 18)}…</span>
                {venue && (
                  <button type="button" onClick={() => { run(castCharacter(venue, 'player', cast ? null : c.id)); if (!cast) onPreview?.(); }} className="ml-auto rounded-md border px-2 py-0.5 text-[11px]" style={{ borderColor: cast ? C.gold : C.line, color: cast ? C.gold : C.text }}>
                    {cast ? `Player in ${venue.name}` : `Cast in ${venue.name}`}
                  </button>
                )}
                <button type="button" aria-label={`Delete ${c.name}`} onClick={() => { const cmd = removeCharacter(doc, c.id); if (cmd) run(cmd); }} className="rounded p-1 hover:bg-white/5"><Trash2 className="h-3.5 w-3.5" style={{ color: C.dim }} /></button>
              </li>
            );
          })}
          {!doc.characters.length && <li className="px-3 py-3 text-[12px]" style={{ color: C.dim }}>No characters yet.</li>}
        </ul>
      </div>
    </div>
  );
}
