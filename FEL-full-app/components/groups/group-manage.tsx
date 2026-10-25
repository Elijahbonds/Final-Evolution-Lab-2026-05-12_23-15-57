'use client';

// TEAMS-SQUADS: members and settings. The owner picks the colour and the home court from lists (nothing typed),
// removes members and makes a certified coach a coach; a coach removes members; everyone but the owner can leave.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { GroupView } from '@/lib/groups/view';
import { GROUP_COLORS, type GroupColor } from '@/lib/groups/types';
import { homeCourtOptions } from '@/lib/groups/rules';
import { SQUADS_PATH } from '@/lib/groups/copy';

const ROLE_LABEL = { owner: 'Owner', coach: 'Coach', member: 'Member' } as const;

export function GroupManage({ view: g, onChanged }: { view: GroupView; onChanged: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const call = async (method: 'PATCH' | 'POST' | 'DELETE', path: string, body?: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/groups/${encodeURIComponent(g.id)}${path}`, { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.message ?? 'That did not go through.'); return false; }
      return true;
    } catch { toast.error('No connection.'); return false; } finally { setBusy(false); }
  };
  const member = (body: Record<string, unknown>) => call('POST', '/members', body).then((ok) => ok && onChanged());

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5" data-group-manage>
      <h2 className="fel-heading text-[13px] font-bold uppercase tracking-wide text-white">Members</h2>
      <ul className="mt-2 divide-y divide-white/5">
        {g.members.map((m) => (
          <li key={m.userId} className="flex min-h-[48px] flex-wrap items-center gap-2 py-1 text-[13.5px]" data-member={m.userId}>
            <span className="min-w-0 flex-1 truncate text-white">{m.name}{m.you ? ' (you)' : ''}</span>
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-white/45">{ROLE_LABEL[m.role]}</span>
            {!m.you && g.can.setRole && m.role !== 'owner' && (
              <button disabled={busy} onClick={() => member({ action: 'role', userId: m.userId, role: m.role === 'coach' ? 'member' : 'coach' })}
                className="min-h-[40px] rounded-lg border border-white/15 px-2.5 text-[11.5px] text-white/75">{m.role === 'coach' ? 'Make member' : 'Make coach'}</button>
            )}
            {!m.you && g.can.remove && m.role !== 'owner' && (g.me.role === 'owner' || m.role === 'member') && (
              <button disabled={busy} onClick={() => member({ action: 'remove', userId: m.userId })}
                className="min-h-[40px] rounded-lg border border-white/15 px-2.5 text-[11.5px] text-white/60">Remove</button>
            )}
          </li>
        ))}
      </ul>

      {g.can.edit && (
        <div className="mt-4 space-y-3" data-group-settings>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">Colour</p>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(Object.keys(GROUP_COLORS) as GroupColor[]).map((c) => (
                <button key={c} aria-label={c} aria-pressed={g.color === c} disabled={busy} onClick={() => call('PATCH', '', { color: c }).then((ok) => ok && onChanged())}
                  className={`h-10 w-10 rounded-full border-2 ${g.color === c ? 'border-white' : 'border-transparent'}`} style={{ background: GROUP_COLORS[c] }} />
              ))}
            </div>
          </div>
          <label className="block">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">Home court</span>
            <select value={g.homeCourt?.ref ?? ''} disabled={busy} onChange={(e) => call('PATCH', '', { homeCourt: e.target.value || null }).then((ok) => ok && onChanged())}
              className="mt-1.5 block min-h-[44px] w-full rounded-lg border border-white/15 bg-black/40 px-2 text-[13px] text-white">
              <option value="">None</option>
              {homeCourtOptions().map((o) => <option key={o.ref} value={o.ref}>{o.name}</option>)}
            </select>
          </label>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {g.can.leave && (
          <button disabled={busy} onClick={() => member({ action: 'leave' }).then(() => router.push(SQUADS_PATH))}
            className="min-h-[44px] rounded-lg border border-white/15 px-3 text-[12.5px] font-bold text-white/70">Leave</button>
        )}
        {g.can.delete && (confirmDelete ? (
          <button disabled={busy} onClick={() => call('DELETE', '').then((ok) => ok && router.push(SQUADS_PATH))}
            className="min-h-[44px] rounded-lg bg-[#FF3366] px-3 text-[12.5px] font-bold text-white">Delete for everyone</button>
        ) : (
          <button onClick={() => setConfirmDelete(true)} className="min-h-[44px] rounded-lg border border-[#FF3366]/40 px-3 text-[12.5px] font-bold text-[#FF6688]">Delete…</button>
        ))}
      </div>
    </section>
  );
}
