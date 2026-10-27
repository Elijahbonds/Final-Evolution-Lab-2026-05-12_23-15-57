'use client';

// TEAMS-SQUADS: /squads — your squads and teams, start a squad (a preset name and colour: nothing typed), a team if you
// are a certified coach, and join by the code a friend or a coach reads out. Before the pending SQL is applied the
// page says "coming soon" and offers nothing that would fail.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, RefreshCw, Users } from 'lucide-react';
import type { GroupSummary } from '@/lib/groups/view';
import { GROUP_COLORS, type GroupColor, type GroupKind } from '@/lib/groups/types';
import { squadNameChoices } from '@/lib/groups/rules';
import { COMING_SOON, KIND_LABEL, TEEN_SAFE_LINE } from '@/lib/groups/copy';

const card = 'rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5';

export interface GroupsHomeData { available: boolean; groups: GroupSummary[]; certifiedCoach?: boolean }

export function GroupsHome({ initial, initialNames }: { initial: GroupsHomeData; initialNames: string[] }) {
  const router = useRouter();
  const [names, setNames] = useState(initialNames);
  const [name, setName] = useState(initialNames[0] ?? '');
  const [teamName, setTeamName] = useState('');
  const [color, setColor] = useState<GroupColor>('cyan');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  if (!initial.available) {
    return <section className={card} data-groups-coming-soon><p className="text-[14px] leading-relaxed text-white/70">{COMING_SOON}</p></section>;
  }

  const post = async (url: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(j.message ?? (r.status === 404 ? 'No open squad or team has that code.' : 'That did not go through.'));
        if (j.href) router.push(j.href);
        return;
      }
      if (j.path) router.push(j.path);
    } catch { toast.error('No connection. Try again in a moment.'); } finally { setBusy(false); }
  };
  const create = (kind: GroupKind) => post('/api/groups', { kind, name: kind === 'squad' ? name : teamName, color });

  return (
    <div className="space-y-4">
      <section className={card} data-my-groups>
        <h2 className="fel-heading text-[13px] font-bold uppercase tracking-wide text-white">Yours</h2>
        {initial.groups.length === 0 && <p className="mt-2 text-[13px] text-white/55">None yet. Start a squad with friends, or type the code someone gave you.</p>}
        <ul className="mt-2 space-y-2">
          {initial.groups.map((g) => (
            <li key={g.id}>
              <Link href={`/squads/${g.id}`} className="flex min-h-[56px] items-center gap-3 rounded-xl border border-white/8 bg-black/20 px-3 py-2" data-group-link={g.kind}>
                <span aria-hidden className="h-8 w-8 shrink-0 rounded-lg" style={{ background: `${GROUP_COLORS[g.color]}33`, boxShadow: `inset 0 0 0 1px ${GROUP_COLORS[g.color]}88` }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-bold text-white">{g.name}</span>
                  <span className="block text-[11.5px] text-fel-dim">{KIND_LABEL[g.kind]} · {g.members} {g.members === 1 ? 'member' : 'members'} · you’re {g.role}</span>
                </span>
                <span className="text-fel-quiet">›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className={card} data-join-by-code>
        <h2 className="fel-heading text-[13px] font-bold uppercase tracking-wide text-white">Join with a code</h2>
        <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void post('/api/groups/join', { code }); }}>
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))} placeholder="ABCD-2345" aria-label="Invite code" autoCapitalize="characters" autoComplete="off" spellCheck={false}
            className="min-h-[48px] min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 font-mono text-[16px] tracking-[0.15em] text-white placeholder:text-white/25" />
          <button disabled={busy || !code.trim()} className="min-h-[48px] rounded-lg bg-fel-cyan px-4 text-[13px] font-bold text-fel-bg disabled:opacity-50">Join</button>
        </form>
      </section>

      <section className={card} data-start-squad>
        <h2 className="fel-heading text-[13px] font-bold uppercase tracking-wide text-white">Start a squad</h2>
        <p className="mt-1 text-[12.5px] text-white/50">Pick a name and a colour. Friends join with your code.</p>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Squad name">
          {names.map((n) => (
            <button key={n} role="radio" aria-checked={name === n} onClick={() => setName(n)}
              className={`min-h-[44px] rounded-full border px-3 text-[13px] font-bold ${name === n ? 'border-white bg-white/10 text-white' : 'border-white/15 text-white/60'}`}>{n}</button>
          ))}
          <button onClick={() => { const next = squadNameChoices(Math.random); setNames(next); setName(next[0]); }} aria-label="Other names"
            className="grid h-11 w-11 place-items-center rounded-full border border-white/15 text-white/60"><RefreshCw className="h-4 w-4" /></button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
          {(Object.keys(GROUP_COLORS) as GroupColor[]).map((c) => (
            <button key={c} role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)}
              className={`h-10 w-10 rounded-full border-2 ${color === c ? 'border-white' : 'border-transparent'}`} style={{ background: GROUP_COLORS[c] }} />
          ))}
        </div>
        <button onClick={() => create('squad')} disabled={busy || !name} className="mt-4 inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-fel-emerald px-4 text-[13.5px] font-bold text-fel-bg disabled:opacity-50">
          <Plus className="h-4 w-4" /> Start {name || 'a squad'}
        </button>
      </section>

      {initial.certifiedCoach && (
        <section className={card} data-start-team>
          <div className="flex items-center gap-2"><Users className="h-4 w-4 text-fel-violet" /><h2 className="fel-heading text-[13px] font-bold uppercase tracking-wide text-white">Start a team</h2></div>
          <p className="mt-1 text-[12.5px] text-white/50">For coaches: athletes who join a team join your roster. The colour above is the team’s too.</p>
          <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); void create('team'); }}>
            <input value={teamName} onChange={(e) => setTeamName(e.target.value.slice(0, 32))} placeholder="Team name" aria-label="Team name" maxLength={32}
              className="min-h-[48px] min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-3 text-[15px] text-white placeholder:text-white/25" />
            <button disabled={busy || teamName.trim().length < 2} className="min-h-[48px] rounded-lg bg-fel-violet px-4 text-[13px] font-bold text-white disabled:opacity-50">Create</button>
          </form>
        </section>
      )}
      <p className="px-1 text-[11.5px] text-fel-quiet">{TEEN_SAFE_LINE}</p>
    </div>
  );
}
