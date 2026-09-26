'use client';
// MY PROJECTS — the Academy's project bar (MUSIC-SUITE P3, "Keep my work", 2026-09-25).
//
// One line under the header: the open project's name, how it is kept (the save status — every failure is said here, in
// words: out of space, private mode, a recording that did not store), and a toggle for the list. The list is newest
// first: NEW, and per project OPEN / RENAME / DUPLICATE / DELETE, where DELETE asks inline first (never window.confirm,
// which a phone browser can suppress and which stops the music clock's thread — the shop confirm's rule, P2).
// A project the room can't read (damaged, or from a newer FEL) is listed and can only be deleted.
//
// MUSIC-SUITE P3 FIX PASS (2026-09-25): three things this bar now says and offers —
//   * a save the store REFUSED on purpose (another tab saved or deleted this project, a newer FEL, another player's):
//     RELOAD (the stored version) and SAVE AS A COPY (what is on screen), never a silent overwrite;
//   * a switch refused because the open project is NOT saved (a full device): the reason, and SWITCH ANYWAY / STAY;
//   * a quiet hint when the browser keeps FEL's storage only best-effort (navigator.storage.persisted() false).
import React, { useState } from 'react';
import type { ConflictKind, ProjectListing } from './studioStore';

export interface MyProjectsProps {
  current: { id: string; title: string };
  status: { tone: 'ok' | 'warn' | 'error'; line: string };
  notice: string | null;
  projects: ProjectListing[];
  /** Why the list can't be used right now (a PERFORM set running, a recording in progress), or null. */
  locked: string | null;
  onOpenList: () => void;
  onNew: () => void;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  S: Record<string, React.CSSProperties>;
  /** MUSIC-SUITE P3 FIX PASS: the open project's save was refused on purpose — RELOAD / SAVE AS A COPY. */
  conflict?: ConflictKind | null;
  onReload?: () => void;
  onSaveCopy?: () => void;
  /** MUSIC-SUITE P3 FIX PASS: a switch refused because the open project is not saved. */
  blocked?: { line: string; discard: () => void; stay: () => void } | null;
  /** MUSIC-SUITE P3 FIX PASS: false = the browser may clear FEL's storage under pressure (said quietly in the list). */
  persisted?: boolean | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "edited 17:42" today, "edited Sep 24" before. */
export function editedLabel(at: number, now: number): string {
  if (!at) return 'not saved yet';
  const d = new Date(at), n = new Date(now);
  const sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay
    ? `edited ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    : `edited ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const TONE: Record<'ok' | 'warn' | 'error', string> = { ok: '#b8e6c1', warn: '#ffd75e', error: '#ffb4a2' };

export default function MyProjects({ current, status, notice, projects, locked, onOpenList, onNew, onOpen, onRename, onDuplicate, onDelete, S, conflict, onReload, onSaveCopy, blocked, persisted }: MyProjectsProps) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const small: React.CSSProperties = { ...S.btnAlt, padding: '4px 10px', fontSize: 11 };
  const listed = projects.some((p) => p.id === current.id);
  const now = Date.now();

  return (
    <div data-qa="my-projects" style={{ marginBottom: 6 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button data-qa="projects-toggle" style={{ ...small, fontWeight: 700 }} aria-expanded={open}
          onClick={() => { const next = !open; setOpen(next); if (next) onOpenList(); }}>
          MY PROJECTS {open ? '▴' : '▾'}
        </button>
        <span data-qa="project-title" style={{ fontWeight: 700, fontSize: 13 }}>{current.title}</span>
        <span data-qa="save-status" role="status" style={{ fontSize: 11, color: TONE[status.tone] }}>{status.line}</span>
      </div>
      {notice && <div data-qa="project-notice" role="status" style={{ fontSize: 12, color: '#ffd75e', marginTop: 4 }}>{notice}</div>}
      {conflict && (
        <div data-qa="project-conflict" role="group" aria-label="This project changed elsewhere" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          {conflict === 'changed-elsewhere' && onReload && <button data-qa="project-reload" style={small} onClick={onReload}>RELOAD THE SAVED VERSION</button>}
          {onSaveCopy && <button data-qa="project-save-copy" style={{ ...small, fontWeight: 700 }} onClick={onSaveCopy}>SAVE AS A COPY</button>}
        </div>
      )}
      {blocked && (
        <div data-qa="switch-blocked" role="alertdialog" aria-label="Switch projects without saving?" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          <span style={{ fontSize: 12, color: '#ffb4a2', fontWeight: 700 }}>{blocked.line}</span>
          <button data-qa="switch-stay" style={{ ...small, fontWeight: 700 }} onClick={blocked.stay}>STAY</button>
          {onSaveCopy && <button style={small} onClick={() => { blocked.stay(); onSaveCopy(); }}>SAVE AS A COPY</button>}
          <button data-qa="switch-anyway" style={{ ...small, borderColor: '#ff6b6b', color: '#ff6b6b' }} onClick={blocked.discard}>SWITCH ANYWAY (lose them)</button>
        </div>
      )}
      {open && (
        <div data-qa="projects-list" style={{ ...S.card, flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button data-qa="project-new" style={small} disabled={!!locked} onClick={onNew}>+ NEW PROJECT</button>
            {locked && <span style={{ fontSize: 11, color: '#ffd75e' }}>{locked}</span>}
            <span style={{ fontSize: 11, opacity: 0.65 }}>kept on this device · newest first</span>
          </div>
          {persisted === false && (
            <div data-qa="projects-best-effort" style={{ fontSize: 11, opacity: 0.6 }}>
              This browser keeps FEL&apos;s saved projects best-effort — it may clear them if the device runs low on space.
            </div>
          )}
          {!listed && (
            <div data-qa="project-row" data-current="true" style={{ fontSize: 12, opacity: 0.85 }}>
              <b>{current.title}</b> · open now · not saved yet (it saves on your first change)
            </div>
          )}
          {projects.map((p) => {
            const isCurrent = p.id === current.id;
            return (
              <div key={p.id} data-qa="project-row" data-id={p.id} data-current={isCurrent ? 'true' : undefined}
                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '4px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                {renaming?.id === p.id ? (
                  <>
                    <input data-qa="project-rename-input" value={renaming.title} maxLength={48} autoFocus
                      onChange={(e) => setRenaming({ id: p.id, title: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') { onRename(p.id, renaming.title); setRenaming(null); } if (e.key === 'Escape') setRenaming(null); }}
                      style={{ padding: 6, borderRadius: 8, border: '1px solid #7a5c9e', background: '#241736', color: '#f5ead9' }} />
                    <button data-qa="project-rename-save" style={small} onClick={() => { onRename(p.id, renaming.title); setRenaming(null); }}>SAVE NAME</button>
                    <button style={small} onClick={() => setRenaming(null)}>CANCEL</button>
                  </>
                ) : (
                  <span style={{ minWidth: 160, fontSize: 12 }}>
                    <b>{isCurrent ? current.title : p.title}</b>
                    <span style={{ opacity: 0.65 }}>{' · '}{p.readable ? editedLabel(p.updatedAt, now) : "can't be opened (damaged, or from a newer FEL)"}{isCurrent ? ' · open now' : ''}</span>
                  </span>
                )}
                {deleting === p.id ? (
                  <span data-qa="project-delete-confirm" role="group" aria-label={`Delete ${p.title}?`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>Delete &quot;{p.title}&quot;? Its takes and chops go too.</span>
                    <button data-qa="project-delete-yes" style={{ ...small, background: '#ff5c5c', color: '#fff', borderColor: '#ff5c5c' }}
                      onClick={() => { setDeleting(null); onDelete(p.id); }}>DELETE</button>
                    <button data-qa="project-delete-no" style={small} onClick={() => setDeleting(null)}>KEEP</button>
                  </span>
                ) : renaming?.id !== p.id && (
                  <>
                    {p.readable && !isCurrent && <button data-qa="project-open" style={small} disabled={!!locked} onClick={() => onOpen(p.id)}>OPEN</button>}
                    {p.readable && <button data-qa="project-rename" style={small} onClick={() => setRenaming({ id: p.id, title: isCurrent ? current.title : p.title })}>RENAME</button>}
                    {p.readable && <button data-qa="project-dup" style={small} disabled={!!locked} onClick={() => onDuplicate(p.id)}>DUPLICATE</button>}
                    <button data-qa="project-delete" style={small} disabled={!!locked && isCurrent} onClick={() => setDeleting(p.id)}>DELETE</button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
