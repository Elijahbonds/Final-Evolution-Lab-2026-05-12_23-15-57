'use client';
// TeacherQueue — PLAT-P10 (EDU-01, 2026-11-03): the owner's queue of teacher applications, on /admin/review. Each one:
// the discipline, the bio, the sample and the links (already through the safety text screen), then Approve or Reject
// with an optional note. An approval grants the teacher role (lib/teach/store.ts decideApplication). Empty until the
// teacher SQL is applied.
import { useCallback, useEffect, useState } from 'react';
import { DISCIPLINES, type TeacherApplication } from '@/lib/teach/apply';
import { TEACH_COPY as T } from './copy';
import { TEACH_LOOK as L } from './look';

export function TeacherQueue({ initial }: { initial?: { ready: boolean; applications: TeacherApplication[] } }) {
  const [state, setState] = useState(initial ?? null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const r = await fetch('/api/admin/teach').catch(() => null);
    if (r?.ok) setState(await r.json());
  }, []);
  useEffect(() => { if (!initial) void load(); }, [initial, load]);

  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    const r = await fetch('/api/admin/teach', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, decision, note: notes[id] ?? '' }) });
    if (r.ok) setState((s) => (s ? { ...s, applications: s.applications.filter((a) => a.id !== id) } : s));
  };

  return (
    <section className="mt-10 space-y-3" data-teacher-queue>
      <h2 className={L.title}>{T.queueTitle}</h2>
      {!state ? null : !state.ready ? <p className={L.text}>{T.opensSoon}</p> : state.applications.length === 0 ? <p className={L.text}>{T.queueEmpty}</p> : (
        <ul className="space-y-3">
          {state.applications.map((a) => (
            <li key={a.id} className={L.card} data-teacher-application={a.id}>
              <p className={L.label}>{DISCIPLINES.find((d) => d.id === a.discipline)?.label ?? a.discipline} · {a.createdAt.slice(0, 10)}</p>
              <p className={L.text}>{a.bio}</p>
              <p className={`${L.text} whitespace-pre-line text-white/70`}>{a.sample}</p>
              {a.links.length > 0 && <ul className="space-y-1">{a.links.map((l) => <li key={l} className={L.text}><a href={l} rel="noopener noreferrer nofollow" target="_blank" className="text-fel-cyan underline">{l}</a></li>)}</ul>}
              <input value={notes[a.id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))} placeholder="A note for them (optional)" aria-label="Note" className={L.input} />
              <div className="flex gap-2">
                <button type="button" className={`${L.chip} ${L.chipOn}`} onClick={() => void decide(a.id, 'approved')} data-teacher-approve>{T.approve}</button>
                <button type="button" className={L.chip} onClick={() => void decide(a.id, 'rejected')} data-teacher-reject>{T.reject}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
