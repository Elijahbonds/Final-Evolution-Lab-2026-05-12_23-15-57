'use client';

// TEAMS-SQUADS (2026-10-25): one group's page — a squad (friends) or a team (a coach's). Everything shown arrives in
// the GroupView the server built with every gate applied (lib/groups/server.ts); this file only draws it and sends
// preset acts. There is no text box anywhere on it, by design (reactions only, owner 2026-10-22).

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Check, Flame, Loader2, Trophy, Users } from 'lucide-react';
import type { GroupView } from '@/lib/groups/view';
import { GROUP_COLORS, NUDGES, DUO_TARGETS, type NudgeKey, type ReactionKey } from '@/lib/groups/types';
import {
  ASSIGNED_DRILL_LINE, BOARD_NOTES, KIND_LABEL, LEAGUE_RULE, SHARE_LINE, TEEN_SAFE_LINE, hiddenLine, streakLine,
} from '@/lib/groups/copy';
import { DAILY_DRILL_PATH } from '@/lib/daily-drill/copy';
import { GroupInvite } from './group-invite';
import { GroupManage } from './group-manage';
import { TeamRollup } from './team-rollup';

const card = 'rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5';
const h2 = 'fel-heading text-[13px] font-bold uppercase tracking-wide text-white';

export function GroupScreen({ initial }: { initial: GroupView }) {
  const [g, setG] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [board, setBoard] = useState<'drill' | 'reps' | 'jump'>('drill');
  const accent = GROUP_COLORS[g.color];

  const reload = useCallback(async () => {
    const r = await fetch(`/api/groups/${encodeURIComponent(g.id)}`).catch(() => null);
    const j = r?.ok ? await r.json().catch(() => null) : null;
    if (j?.group) setG(j.group);
  }, [g.id]);

  const send = useCallback(async (path: 'act' | 'members', body: Record<string, unknown>, tag: string) => {
    setBusy(tag);
    try {
      const r = await fetch(`/api/groups/${encodeURIComponent(g.id)}/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(j.message ?? (r.status === 503 ? 'Squads and teams are coming soon.' : 'That did not go through.')); return false; }
      await reload();
      return true;
    } catch { toast.error('No connection. Try again in a moment.'); return false; } finally { setBusy(null); }
  }, [g.id, reload]);

  const react = (item: string, key: ReactionKey, mine: boolean) => send('act', { kind: mine ? 'unreact' : 'react', item, reaction: key }, `r:${item}:${key}`);
  const nudge = (to: string, key: NudgeKey) => send('act', { kind: 'nudge', to, nudge: key }, `n:${to}`).then((ok) => ok && toast.success('Nudge sent.'));
  const waiting = g.buddies.filter((b) => !b.doneToday).length;
  const rows = g.boards[board];
  const others = g.members.filter((m) => !m.you);

  return (
    <div className="space-y-4" data-group-screen data-group-kind={g.kind}>
      <section className={card} style={{ borderColor: `${accent}55`, background: `${accent}0d` }} data-group-header>
        <div className="flex items-start gap-3">
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-xl" style={{ background: `${accent}22`, boxShadow: `inset 0 0 0 1px ${accent}55` }}>
            <Users className="h-5 w-5" style={{ color: accent }} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: accent }}>{KIND_LABEL[g.kind]} · {g.members.length} {g.members.length === 1 ? 'member' : 'members'}</p>
            <h2 className="fel-heading mt-0.5 break-words text-[24px] font-black leading-tight text-white">{g.name}</h2>
            {g.homeCourt && <p className="mt-0.5 text-[12.5px] text-white/55">Home court: {g.homeCourt.name}</p>}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2" data-trophy-shelf>
          <Trophy className="h-4 w-4 text-fel-gold" aria-hidden />
          {g.trophies.length === 0
            ? <span className="text-[12px] text-fel-dim">Trophy shelf: empty. Win a week to put one here.</span>
            : g.trophies.slice(0, 8).map((t) => (
              <span key={t.weekKey} className="rounded-full border border-fel-gold/30 bg-fel-gold/10 px-2.5 py-1 text-[11.5px] text-[#FFE680]" title={`Week of ${t.weekKey}`}>
                {t.name} · wk {t.weekKey.slice(5)}
              </span>
            ))}
        </div>
      </section>

      {g.nudges.length > 0 && (
        <section className={`${card} border-fel-emerald/30`} data-nudges>
          {g.nudges.map((n, i) => (
            <p key={i} className="text-[13px] text-white/80">{NUDGES[n.key].glyph} <b>{n.fromName}</b>: {NUDGES[n.key].line}</p>
          ))}
          <Link href={DAILY_DRILL_PATH} className="mt-2 inline-flex min-h-[44px] items-center text-[13px] font-bold text-fel-emerald">Do today’s drill →</Link>
        </section>
      )}

      {g.dailyDrillAssigned && (
        <section className={card} data-assigned-drill>
          <p className="text-[13px] text-white/75">{ASSIGNED_DRILL_LINE}</p>
          <Link href={DAILY_DRILL_PATH} className="mt-1 inline-flex min-h-[44px] items-center text-[13px] font-bold text-fel-emerald">Today’s drill →</Link>
        </section>
      )}

      <section className={card} data-buddies>
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-fel-ember" aria-hidden />
          <h2 className={h2}>Training buddies</h2>
        </div>
        <p className="mt-1.5 text-[13px] text-white/70" data-streak>{streakLine(g.streak.days, g.streak.todayAll, waiting)}</p>
        <ul className="mt-3 divide-y divide-white/5">
          {g.buddies.map((b) => (
            <li key={b.userId} className="flex min-h-[48px] items-center gap-3 py-1.5" data-buddy={b.userId}>
              <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${b.doneToday ? 'bg-fel-emerald/20 text-fel-emerald' : 'bg-white/5 text-fel-quiet'}`} aria-label={b.doneToday ? 'done today' : 'not yet today'}>
                {b.doneToday ? <Check className="h-4 w-4" /> : '·'}
              </span>
              <span className="min-w-0 flex-1 truncate text-[14px] text-white">{b.name}{g.members.find((m) => m.userId === b.userId)?.you ? ' (you)' : ''}</span>
              <span className="text-[11.5px] text-fel-dim">{b.doneToday ? 'Drill done' : 'Not yet'}</span>
              {b.canNudge && (
                <span className="flex gap-1">
                  {(Object.keys(NUDGES) as NudgeKey[]).map((k) => (
                    <button key={k} onClick={() => nudge(b.userId, k)} disabled={busy !== null} title={NUDGES[k].line} aria-label={`Nudge ${b.name}: ${NUDGES[k].line}`}
                      className="grid h-10 w-10 place-items-center rounded-lg border border-white/10 text-[16px] disabled:opacity-50">{NUDGES[k].glyph}</button>
                  ))}
                </span>
              )}
              {b.nudgedByMe && <span className="text-[11px] text-fel-quiet">nudged</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className={card} data-duos>
        <h2 className={h2}>Duo goals</h2>
        <p className="mt-1 text-[12.5px] text-white/50">Pick a buddy and a number of days. You both do the daily drill on those days this week.</p>
        {g.duos.length > 0 && (
          <ul className="mt-3 space-y-2">
            {g.duos.map((d) => (
              <li key={`${d.a}:${d.b}`} className="rounded-xl border border-white/10 bg-black/20 p-3" data-duo>
                <div className="flex items-center justify-between gap-2 text-[13.5px] text-white">
                  <span className="min-w-0 truncate">{d.aName} + {d.bName}</span>
                  <span className={d.met ? 'font-bold text-fel-emerald' : 'text-white/60'}>{d.together}/{d.target} days{d.met ? ' ✓' : ''}</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-fel-emerald" style={{ width: `${Math.min(100, (d.together / d.target) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        )}
        {others.length > 0 && <DuoPicker members={others} busy={busy !== null} onPick={(withId, target) => send('act', { kind: 'duo', with: withId, target }, 'duo')} />}
      </section>

      <section className={card} data-league>
        <h2 className={h2}>Weekly league</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-fel-dim">{LEAGUE_RULE}</p>
        <ol className="mt-3 space-y-1">
          {g.league.standings.map((s) => (
            <li key={s.userId} className="flex min-h-[40px] items-center gap-3 rounded-lg px-2 text-[13.5px] odd:bg-white/[0.02]" data-standing={s.userId}>
              <span className="w-5 text-right font-mono text-fel-dim">{s.place}</span>
              <span className="min-w-0 flex-1 truncate text-white">{s.name}</span>
              <span className="hidden text-[11px] text-fel-dim sm:inline">{s.drillDays} drills · {s.runs} games · {s.wins} wins</span>
              <span className="font-mono font-bold" style={{ color: accent }}>{s.points}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className={card} data-boards>
        <h2 className={h2}>Leaderboard</h2>
        <div className="mt-2 flex gap-1" role="tablist">
          {(['drill', 'reps', 'jump'] as const).map((k) => (
            <button key={k} role="tab" aria-selected={board === k} onClick={() => setBoard(k)}
              className={`min-h-[40px] flex-1 rounded-lg px-2 text-[12.5px] font-bold ${board === k ? 'bg-white/10 text-white' : 'text-fel-dim'}`}>
              {k === 'drill' ? 'Drill days' : k === 'reps' ? 'Reps' : 'Verified jump'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-fel-dim">{BOARD_NOTES[board]}</p>
        {rows.length === 0
          ? <p className="mt-3 text-[13px] text-white/50" data-board-empty>Nothing on this board yet.</p>
          : (
            <ol className="mt-2 space-y-1">
              {rows.map((r, i) => (
                <li key={r.userId} className="flex min-h-[40px] items-center gap-3 px-2 text-[13.5px]">
                  <span className="w-5 text-right font-mono text-fel-dim">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-white">{r.name}</span>
                  <span className="font-mono text-white/80">{r.display}</span>
                </li>
              ))}
            </ol>
          )}
        {board !== 'drill' && hiddenLine(g.boards.measuredHidden) && <p className="mt-2 text-[11.5px] text-fel-quiet">{hiddenLine(g.boards.measuredHidden)}</p>}
        {g.me.canShareMeasured && (
          <label className="mt-3 flex min-h-[44px] items-center gap-3 text-[13px] text-white/75">
            <input type="checkbox" className="h-5 w-5 accent-fel-emerald" checked={g.me.shareMeasured} disabled={busy !== null}
              onChange={(e) => send('members', { action: 'share', on: e.target.checked }, 'share')} />
            {SHARE_LINE}
          </label>
        )}
      </section>

      <section className={card} data-feed>
        <h2 className={h2}>{KIND_LABEL[g.kind]} feed</h2>
        <p className="mt-1 text-[11.5px] text-fel-dim">{TEEN_SAFE_LINE}</p>
        {g.feed.length === 0 && <p className="mt-3 text-[13px] text-white/50">Quiet so far this week. A daily drill shows up here.</p>}
        <ul className="mt-3 space-y-2">
          {g.feed.map((f) => (
            <li key={f.key} className="rounded-xl border border-white/8 bg-black/20 p-3" data-feed-item={f.kind}>
              <p className="text-[13.5px] text-white/85">
                {f.href ? <Link href={f.href} className="underline-offset-2 hover:underline">{f.line}</Link> : f.line}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {f.reactions.map((r) => (
                  <button key={r.key} onClick={() => react(f.key, r.key, r.mine)} disabled={busy !== null} aria-pressed={r.mine} aria-label={`${r.key}${r.count ? `, ${r.count}` : ''}`}
                    className={`inline-flex h-9 min-w-[44px] items-center justify-center gap-1 rounded-full border px-2 text-[14px] disabled:opacity-50 ${r.mine ? 'border-fel-cyan/50 bg-fel-cyan/10' : 'border-white/10'}`}>
                    <span aria-hidden>{r.glyph}</span>{r.count > 0 && <span className="text-[11.5px] text-white/70">{r.count}</span>}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </section>

      {g.myChallenges.some((c) => !c.posted) && (
        <section className={card} data-post-challenge>
          <h2 className={h2}>Challenge the {KIND_LABEL[g.kind].toLowerCase()}</h2>
          <p className="mt-1 text-[12.5px] text-white/50">Post one of your open challenges here. It closes 48 hours after you made it.</p>
          <ul className="mt-2 space-y-1">
            {g.myChallenges.filter((c) => !c.posted).map((c) => (
              <li key={c.code} className="flex min-h-[44px] items-center gap-2 text-[13px] text-white/80">
                <span className="min-w-0 flex-1 truncate">{c.modeName} · {c.score}</span>
                <button onClick={() => send('act', { kind: 'challenge', code: c.code }, `c:${c.code}`)} disabled={busy !== null}
                  className="rounded-lg border border-white/15 px-3 py-2 text-[12px] font-bold text-white/85 disabled:opacity-50">Post</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {g.rollup && <TeamRollup groupId={g.id} rollup={g.rollup} onChanged={reload} />}
      {g.invite && <GroupInvite groupId={g.id} invite={g.invite} canEdit={g.can.edit} onChanged={reload} />}
      <GroupManage view={g} onChanged={reload} />
      {busy && <Loader2 className="fixed bottom-24 right-5 h-5 w-5 animate-spin text-white/50" aria-label="Saving" />}
    </div>
  );
}

function DuoPicker({ members, busy, onPick }: { members: GroupView['members']; busy: boolean; onPick: (withId: string, target: number) => void }) {
  const [withId, setWith] = useState(members[0]?.userId ?? '');
  const [target, setTarget] = useState<number>(DUO_TARGETS[0]);
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2" data-duo-picker>
      <select value={withId} onChange={(e) => setWith(e.target.value)} aria-label="Buddy" className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 text-[13px] text-white">
        {members.map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}
      </select>
      <span className="flex gap-1">
        {DUO_TARGETS.map((t) => (
          <button key={t} onClick={() => setTarget(t)} aria-pressed={target === t}
            className={`h-11 w-11 rounded-lg border text-[13px] font-bold ${target === t ? 'border-fel-emerald/60 bg-fel-emerald/15 text-fel-emerald' : 'border-white/15 text-white/60'}`}>{t}</button>
        ))}
      </span>
      <button onClick={() => onPick(withId, target)} disabled={busy || !withId} className="min-h-[44px] rounded-lg bg-fel-emerald px-4 text-[13px] font-bold text-fel-bg disabled:opacity-50">Duo up</button>
    </div>
  );
}
