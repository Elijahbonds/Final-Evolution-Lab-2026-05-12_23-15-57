'use client';

// TEAMS-SQUADS: the coach's roster, grouped by team (on /coach). Each team links to its page, where the week's roll-up,
// the assigned daily drill, assigning a program to everyone and the invite live. Nothing shows before the pending SQL.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import type { GroupSummary } from '@/lib/groups/view';
import { GROUP_COLORS } from '@/lib/groups/types';
import { SQUADS_PATH } from '@/lib/groups/copy';

export function TeamsPanel() {
  const [teams, setTeams] = useState<GroupSummary[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/groups').then((r) => r.json()).then((j) => {
      if (!live || !j?.available) return;
      setTeams(((j.groups ?? []) as GroupSummary[]).filter((g) => g.kind === 'team' && g.role !== 'member'));
    }).catch(() => {});
    return () => { live = false; };
  }, []);
  if (teams === null) return null;
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5" data-teams-panel>
      <header className="flex items-center gap-2">
        <Users className="h-4 w-4 text-fel-violet" />
        <h2 className="fel-heading text-sm font-bold uppercase tracking-wide text-white">Teams</h2>
      </header>
      <p className="mt-2 text-xs leading-relaxed text-white/50">Your roster by team: each team’s week, its invite code, and one tap to assign a program or the daily drill to everyone.</p>
      <ul className="mt-3 space-y-2">
        {teams.map((t) => (
          <li key={t.id}>
            <Link href={`/squads/${t.id}`} className="flex min-h-[48px] items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-3 text-sm text-white">
              <span aria-hidden className="h-6 w-6 rounded-md" style={{ background: GROUP_COLORS[t.color] }} />
              <span className="min-w-0 flex-1 truncate font-bold">{t.name}</span>
              <span className="text-xs text-fel-dim">{t.members} members ›</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href={SQUADS_PATH} className="mt-3 inline-flex min-h-[44px] items-center text-xs font-bold text-fel-violet">{teams.length ? 'Start another team' : 'Start a team'} →</Link>
    </section>
  );
}
