'use client';

// The verdicts other servers send back after the session: the Triumph Arena duel, a friend's async challenge, a challenge
// link's attempt, the Court Carnival's running total and the story node. Same words and the same rules as the inline card
// they came from (GameShell before 2026-10-06): a refused Arena score says so in the server's words and is never a
// verdict; a refused story node says why where STORY NODE COMPLETE would be (end-card-refusal.tsx).

import { PartyPopper, BookOpen } from 'lucide-react';
import { ArenaRefusedLine } from '../end-card-refusal';
import { carnivalRunTotalScore, type CarnivalRunState } from '@/lib/carnival-run';
import type { EndArenaResult, EndChallengeResult, EndMpResult, EndStoryReward } from './types';

const n = (v: number) => v.toLocaleString('en-US');

export function NavLink({ href, id, onNavigate, className, children }: {
  href: string; id: string; onNavigate: (href: string) => void; className?: string; children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      data-end-focus={id}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onNavigate(href); }}
      className={className ?? 'mt-[0.4em] inline-block rounded px-1 text-[0.85em] text-[#00E5FF] underline outline-none data-[focused=true]:ring-4 data-[focused=true]:ring-[#00E5FF]'}
    >
      {children}
    </a>
  );
}

export function MpCard({ r }: { r: EndMpResult }) {
  return (
    <div data-recap="mp" className={`rounded-2xl border p-[0.7em] text-center ${r.tie ? 'border-white/25 bg-white/[0.05]' : r.iWon ? 'border-[#00FF9D]/40 bg-[#00FF9D]/10' : 'border-[#FF3366]/40 bg-[#FF3366]/10'}`}>
      <p className="text-[0.8em] font-bold tracking-wide text-white/80">FRIEND CHALLENGE</p>
      <p className="mt-[0.2em] text-white/85">{r.tie ? 'Dead heat' : r.iWon ? 'You took it' : `${r.hostName ?? 'They'} held it`} — your best {n(r.guestScore)} vs their {n(r.hostScore)}</p>
    </div>
  );
}

export function ChallengeCard({ r, onNavigate }: { r: EndChallengeResult; onNavigate: (href: string) => void }) {
  return (
    <div data-recap="challenge" className={`rounded-2xl border p-[0.7em] text-center ${r.beat ? 'border-[#00FF9D]/40 bg-[#00FF9D]/10' : 'border-[#FF3366]/40 bg-[#FF3366]/10'}`}>
      <p className="text-[0.8em] font-bold tracking-wide text-white/80">FRIEND CHALLENGE</p>
      <p className="mt-[0.2em] text-white/85">
        {r.beat ? 'You beat' : 'Target held'} {r.vs ?? 'the rival'} — target {n(r.targetScore)}, margin {r.margin >= 0 ? '+' : ''}{n(r.margin)}
      </p>
      {r.rematchPath && <NavLink href={r.rematchPath} id="rematch" onNavigate={onNavigate}>Send the rematch</NavLink>}
    </div>
  );
}

export function ArenaCard({ r, onNavigate }: { r: EndArenaResult; onNavigate: (href: string) => void }) {
  return (
    <div
      data-recap="arena"
      className={`rounded-2xl border p-[0.7em] text-center [&_[data-arena=refused]]:!text-[0.85em] ${
        !r.settled ? 'border-white/20 bg-white/[0.04]'
          : r.result === 'tie' ? 'border-white/25 bg-white/[0.05]'
          : r.iWon ? 'border-[#00FF9D]/40 bg-[#00FF9D]/10'
          : 'border-[#FF3366]/40 bg-[#FF3366]/10'
      }`}
    >
      <p className="text-[0.8em] font-bold tracking-wide text-white/80">TRIUMPH ARENA</p>
      {r.refused ? (
        <ArenaRefusedLine refusal={r.refused} />
      ) : !r.settled ? (
        <p className="mt-[0.2em] text-white/75">Score locked in — waiting for your opponent to finish.</p>
      ) : r.result === 'tie' ? (
        <p className="mt-[0.2em] text-white/85">Tie — both entries refunded ({r.feeLc} LC each).</p>
      ) : r.iWon ? (
        <p className="mt-[0.2em] font-mono font-bold text-[#00FF9D]">You won the duel — +{r.payout} LC</p>
      ) : (
        <p className="mt-[0.2em] text-[#FF3366]">You lost this duel. Better luck next time.</p>
      )}
      {r.settled && typeof r.myScore === 'number' && typeof r.oppScore === 'number' && (
        <p className="mt-[0.2em] font-mono text-[0.8em] text-white/65">Your {n(r.myScore)} vs the house rival&apos;s {n(r.oppScore)}</p>
      )}
      <NavLink href="/arena" id="arena" onNavigate={onNavigate}>Back to the Arena</NavLink>
    </div>
  );
}

export function CarnivalCard({ run }: { run: CarnivalRunState }) {
  return (
    <div data-recap="carnival" className="rounded-2xl border border-[#FFD700]/30 bg-[#FFD700]/10 p-[0.6em] text-center">
      <p className="flex items-center justify-center gap-2 text-[0.85em] font-bold text-[#FFD700]">
        <PartyPopper className="h-[1em] w-[1em]" /> CARNIVAL NIGHT — STOP {run.index} OF {run.lineup.length}
      </p>
      <p className="mt-[0.2em] font-mono text-white/75">Running total: {n(carnivalRunTotalScore(run))}</p>
    </div>
  );
}

export function StoryRewardCard({ r, lc }: { r: EndStoryReward; lc: number }) {
  return (
    <div data-recap="story" className="rounded-2xl border border-[#A855F7]/35 bg-[#A855F7]/10 px-[0.7em] py-[0.45em] text-center">
      <p className="flex items-center justify-center gap-2 text-[0.85em] font-bold text-[#A855F7]"><BookOpen className="h-[1em] w-[1em]" /> STORY NODE COMPLETE</p>
      <p className="mt-[0.2em] font-mono text-[1.2em] font-bold text-[#FFD700]">+{Math.round(lc).toLocaleString('en-US')} LC</p>
      {r.badge && <p className="mt-[0.2em] font-bold text-amber-400">BADGE EARNED · {r.badge.name}</p>}
    </div>
  );
}
