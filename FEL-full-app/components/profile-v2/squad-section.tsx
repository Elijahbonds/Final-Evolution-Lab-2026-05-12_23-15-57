// SQUAD AND FRIENDS (PROFILE V2): who you've played and how it went. Head-to-head comes from settled challenge duels
// (MpMatch, online), the rival is the person you've played most, and your challenge links say how many tried to beat
// you. FEL has no friends list or Squads yet (a value-round lane): they are a labelled "Coming" block, not a fake roster.
import Link from 'next/link';
import { Swords, Link2 } from 'lucide-react';
import type { ProfileV2Data } from '@/lib/profile-v2/assemble';
import { Section, Card, Coming } from './section';

export function SquadSection({ data }: { data: ProfileV2Data }) {
  const { opponents, rival, matchesPlayed, links } = data.squad;
  return (
    <Section id="squad" title="Squad & friends" purpose="Your head-to-head record against the people you’ve played." accent="#A855F7"
      aside={<Link href="/multiplayer" className="shrink-0 rounded-full border border-fel-violet/40 px-3 py-1.5 text-[12px] font-bold text-[#C79BFF] hover:bg-fel-violet/10">Challenge someone</Link>}>
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          {rival ? (
            <>
              <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-[#C79BFF]">Your rival</p>
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <p className="fel-heading truncate text-[20px] font-black text-white">{rival.name}</p>
                <p className="fel-heading shrink-0 text-[20px] font-black tabular-nums"><span className="text-fel-emerald">{rival.wins}</span><span className="text-fel-quiet"> – </span><span className="text-fel-ember">{rival.losses}</span>{rival.draws > 0 && <span className="text-fel-dim"> – {rival.draws}</span>}</p>
              </div>
              <p className="text-[12px] text-fel-dim">Most played · last in {rival.mode}</p>
            </>
          ) : (
            <p className="flex items-start gap-2 text-[14px] text-white/50"><Swords className="mt-0.5 h-4 w-4 shrink-0 text-[#C79BFF]" aria-hidden />No duels yet. Send a challenge and your record starts here.</p>
          )}
          {opponents.length > 1 && (
            <ul className="mt-3 divide-y divide-white/[0.06]">
              {opponents.filter((o) => o !== rival).slice(0, 5).map((o) => (
                <li key={o.name + o.lastAt} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                  <span className="min-w-0 truncate text-white/75">{o.name}</span>
                  <span className="shrink-0 font-sans tabular-nums tabular-nums text-white/60">{o.wins}W {o.losses}L{o.draws ? ` ${o.draws}D` : ''}</span>
                </li>
              ))}
            </ul>
          )}
          {matchesPlayed > 0 && <p className="mt-2 text-[12px] text-fel-quiet">{matchesPlayed} duel{matchesPlayed === 1 ? '' : 's'} settled</p>}
        </Card>
        <Card>
          <p className="flex items-center gap-1.5 font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-fel-cyan"><Link2 className="h-3.5 w-3.5" aria-hidden />Your challenge links</p>
          {links.count > 0 ? (
            <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
              {[['Opened', links.opened], ['Tried', links.attempted], ['Beat you', links.beaten]].map(([k, v]) => (
                <div key={k as string} className="rounded-xl bg-white/[0.03] py-2">
                  <dt className="text-[12px] text-fel-dim">{k}</dt>
                  <dd className="fel-heading text-[20px] font-black text-white tabular-nums">{v}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-[14px] text-white/50">Share a score from any game’s finish card to dare a friend.</p>
          )}
        </Card>
      </div>
      <div className="mt-3">
        <Coming title="Friends & Squads" text="A friends list, and Squads with a name, a colour and a home court. Until then, duels and challenge links are how you play friends." />
      </div>
    </Section>
  );
}
