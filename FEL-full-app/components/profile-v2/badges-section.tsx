// BADGES AND MILESTONES (PROFILE V2): what you have earned — the streak and its next goal, your level, mode mastery,
// Academy modules, ghost beats. Coach-verified milestones (the skill passport's seed) do not exist yet: a labelled
// "Coming" block says so instead of a sample badge.
import { Flame, Ghost, GraduationCap, Sparkles } from 'lucide-react';
import { MasteryBadge } from '@/components/mastery-badge';
import type { ProfileV2Data } from '@/lib/profile-v2/assemble';
import { Section, Card, Coming } from './section';

export function BadgesSection({ data, viewer = false }: { data: ProfileV2Data; viewer?: boolean }) {
  const b = data.badges;
  const streakPct = Math.min(100, (b.streakDays / b.nextStreakGoal) * 100);
  const lv = b.level;
  return (
    <Section id="badges" title="Badges & milestones" purpose="What you’ve earned so far, and the next one in reach." accent="#FF7A2F">
      <div className="grid gap-3 md:grid-cols-2">
        <Card>
          <div className="flex items-center gap-3">
            <Flame className="h-5 w-5 text-fel-ember" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-bold text-white">{b.streakDays > 0 ? `${b.streakDays}-day streak` : 'No streak running'}</p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`Streak toward ${b.nextStreakGoal} days`} aria-valuemin={0} aria-valuemax={b.nextStreakGoal} aria-valuenow={b.streakDays}>
                <span className="block h-full rounded-full bg-fel-ember" style={{ width: `${streakPct}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-fel-dim">Next: {b.nextStreakGoal} days</p>
            </div>
          </div>
          {lv && (
            <div className="mt-4 flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-fel-emerald" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold text-white">Level {lv.level}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={lv.need} aria-valuenow={lv.into}>
                  <span className="block h-full rounded-full bg-fel-emerald" style={{ width: `${Math.min(100, (lv.into / Math.max(1, lv.need)) * 100)}%` }} />
                </div>
                <p className="mt-1 font-sans text-[12px] text-fel-dim">{lv.into.toLocaleString('en-US')} / {lv.need.toLocaleString('en-US')} XP</p>
              </div>
            </div>
          )}
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-white/60">
            <span className="inline-flex items-center gap-1.5"><GraduationCap className="h-4 w-4 text-fel-indigo" aria-hidden />{b.academyPassed} Academy module{b.academyPassed === 1 ? '' : 's'} passed</span>
            <span className="inline-flex items-center gap-1.5"><Ghost className="h-4 w-4 text-fel-violet" aria-hidden />{b.ghostBeats} ghost{b.ghostBeats === 1 ? '' : 's'} beaten{b.ghostBestRun > 1 ? ` · best run ${b.ghostBestRun}` : ''}</span>
          </div>
        </Card>
        <Card>
          <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.14em] text-fel-gold">Mode mastery</p>
          {b.mastery.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {b.mastery.map((m) => (
                <li key={m.mode} className="inline-flex items-center gap-2 rounded-xl bg-white/[0.03] px-2.5 py-1.5">
                  <span className="text-[12px] font-semibold text-white/80">{m.name}</span>
                  <MasteryBadge tierIndex={m.tier} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12.5px] text-white/50">No tiers yet. Play any mode a few times to climb from Bronze.</p>
          )}
        </Card>
      </div>
      {!viewer && (
        <div className="mt-3">
          <Coming
            title="Coach-verified milestones"
            text={b.hasCoach ? 'Milestones your coach signs off will show here: the start of your skill passport.' : 'Milestones a coach signs off will show here: the start of your skill passport.'}
          />
        </div>
      )}
    </Section>
  );
}
