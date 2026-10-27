import { notFound } from 'next/navigation';
import { Dumbbell, Flame, Library, Timer } from 'lucide-react';
import { AvatarFigure } from '@/components/avatar-figure';
import { ROSTER } from '@/lib/game-data';
import { TYPE, TYPE_SIZES_PX, NUM } from '@/lib/design/type';
import {
  BigNumber, Chip, EmptyState, HeroHeader, ListRow, MediaCard, PageEnter, PrimaryCta, Skeleton, SkeletonGroup, StatCard, StatRing,
} from '@/components/ui/fel';
import { DevUiDemo } from './demo';

export const dynamic = 'force-dynamic';

/**
 * /dev/ui — THE LIVING STYLE PAGE (lane/premium-ui, docs/PLAN-UI-10PHASE.md P1). Every piece of the premium kit
 * (components/ui/fel) on the real tokens, so a change to the system is seen here before it reaches a screen.
 * Hard 404 outside `next dev`, like every other app/dev page (lib/dev/devPagesGate.test.ts holds it). Its words are
 * samples for a developer, not product copy.
 */
export default function DevUiPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const sw = (name: string, v: string) => (
    <div key={name} className="flex flex-col gap-2">
      <span className="h-14 rounded-[16px] border border-white/10" style={{ background: v }} />
      <span className={`${TYPE.label} text-fel-dim`}>{name}</span>
    </div>
  );
  return (
    <PageEnter className="min-h-screen bg-fel-bg pb-40 text-white">
      <HeroHeader image="/backdrops/dunk.jpg" imagePosition="50% 35%" eyebrow="Style page" title="Built to feel fast"
        line="The premium kit, on the real tokens.">
        <PrimaryCta href="#" docked icon={<Flame className="h-5 w-5" aria-hidden />}>Play now</PrimaryCta>
        <Chip href="#" tone="neutral">Couch</Chip>
      </HeroHeader>
      <main className="mx-auto flex max-w-[1080px] flex-col gap-12 px-5">
        <section className="flex flex-col gap-4">
          <h2 className={`${TYPE.heading}`}>Type</h2>
          {(Object.keys(TYPE_SIZES_PX) as (keyof typeof TYPE_SIZES_PX)[]).map((k) => (
            <p key={k} className={`${TYPE[k]} text-white`}>{k} · {TYPE_SIZES_PX[k].phone}/{TYPE_SIZES_PX[k].wide}</p>
          ))}
          <p className={`${NUM} text-[44px]`}>1,284.5</p>
        </section>
        <section className="flex flex-col gap-4">
          <h2 className={TYPE.heading}>Colour</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {[['ink', 'var(--fel-bg)'], ['raised', 'var(--fel-elev-1)'], ['overlay', 'var(--fel-elev-2)'], ['lit', 'var(--fel-elev-3)'],
              ['accent', 'var(--fel-accent)'], ['success', 'var(--fel-emerald)'], ['warning', 'var(--fel-gold)'], ['danger', 'var(--fel-crimson)']]
              .map(([n, v]) => sw(n, v))}
          </div>
        </section>
        <section className="flex flex-col gap-4">
          <h2 className={TYPE.heading}>Rings and numbers</h2>
          <div className="flex flex-wrap items-center gap-6">
            <StatRing value={72} label="PRQ" sub="Rising" />
            <StatRing value={null} label="Form" sub="Not yet" />
            <StatRing value={4} max={7} label="Streak" display="4" sub="Days" size={88} stroke={8} color="#FF7A2F" />
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <BigNumber label="Jump" value="61.2" unit="cm" delta="+2.1 cm" trend="up" />
            <BigNumber label="Sprint" value="4.82" unit="s" delta="+0.04 s" trend="up" good="down" />
            <BigNumber label="Reaction" value={null} />
            <BigNumber label="Streak" value={4} unit="days" trend="flat" />
          </div>
        </section>
        <section className="flex flex-col gap-4">
          <h2 className={TYPE.heading}>Cards</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <MediaCard href="#" image="/venues/venicebeach.jpg" title="Venice Beach" line="The court. Five games." badge={<Chip tone="accent">Live</Chip>} />
            <MediaCard href="#" image="/venues/musclebeachgym.jpg" title="Muscle Beach" line="Lift, jump, measure." />
            <MediaCard href="#" image="/venues/dojo.jpg" title="The Dojo" line="Strike and block." />
          </div>
          <StatCard label="This week" value={5} max={7} display="5/7" sub="Days trained" href="#" />
          <div className="fel-surface p-2">
            <ListRow href="#" icon={Timer} title="Quick Screen" line="A movement check. One minute." />
            <ListRow href="#" icon={Library} title="Exercise library" line="Every exercise, with cues." />
            <ListRow href="#" thumb="/venues/musclebeachgym.jpg" title="Iron Paradise" line="The gym floor." />
            <ListRow href="#" icon={Dumbbell} accent="#00FF9D" title="Drills" />
          </div>
        </section>
        <section className="flex flex-col gap-4">
          <h2 className={TYPE.heading}>Controls</h2>
          <DevUiDemo />
          <div className="flex flex-wrap gap-2">
            <Chip>Neutral</Chip><Chip tone="accent">Accent</Chip><Chip tone="success">Ready</Chip><Chip tone="warning">Normal</Chip><Chip tone="danger">Low</Chip>
          </div>
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          <EmptyState title="No highlights yet" line="Your best plays land here." action={<Chip href="#" tone="accent">Play a game</Chip>} />
          <EmptyState art={<AvatarFigure avatar={ROSTER[0]} size={88} />} title="Your athlete" line="Dress them in the Closet." />
        </section>
        <section className="flex flex-col gap-4">
          <h2 className={TYPE.heading}>Loading</h2>
          <SkeletonGroup className="grid gap-3 md:grid-cols-3">
            <Skeleton shape="card" />
            <div className="flex flex-col gap-3"><Skeleton shape="title" /><Skeleton /><Skeleton className="w-1/2" /></div>
            <div className="flex items-center gap-4"><Skeleton shape="ring" /><Skeleton shape="row" /></div>
          </SkeletonGroup>
        </section>
      </main>
    </PageEnter>
  );
}
