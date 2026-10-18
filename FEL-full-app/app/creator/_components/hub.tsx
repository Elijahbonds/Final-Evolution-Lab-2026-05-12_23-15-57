import Link from 'next/link';
import { Music, Mic, Zap, Palette, Dumbbell, ArrowRight, Clapperboard, ChefHat, Shirt, PenLine, UserRound } from 'lucide-react';

// Creator Hub — every card below opens a shipped play or guided Create flow.

const BG = '#050505';

type Discipline = {
  id: string;
  name: string;
  tagline: string;
  href: string;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
};

const DISCIPLINES: Discipline[] = [
  { id: 'dance', name: 'Dance', tagline: 'Nail the count-in, then chain the combo. Tap on the beat.', href: '/play/dance', color: '#FF2D95', icon: Zap },
  { id: 'acting', name: 'Acting', tagline: 'Hit the cue, match the intensity. Delivery, scored locally.', href: '/play/acting', color: '#FF3366', icon: Mic },
  { id: 'music', name: 'Music', tagline: 'The FEL Academy — sequence, flip a sample, master and publish your own tracks.', href: '/play/music', color: '#00E5FF', icon: Music },   // the Academy mounts at /play/music (/studio is the code studio, on hold)
  { id: 'sport', name: 'Sport', tagline: 'Time the rise, throw it down. The dunk arena.', href: '/play/dunk', color: '#FFD700', icon: Dumbbell },
  { id: 'art', name: 'Art', tagline: 'Paint boards and court skins in the guided creator flow.', href: '/create/art', color: '#A855F7', icon: Palette },
  // lane 4 (2026-09-06): the new disciplines author in /create and publish as Creator Cards
  { id: 'scene', name: 'Scene', tagline: 'Author a Spot the Scene pack from FEL\'s own venues — friends play it as a round.', href: '/create/scene', color: '#8B5CF6', icon: Clapperboard },
  { id: 'cooking', name: 'Cooking', tagline: 'A recipe card the Fuel floor can serve and a coach can assign.', href: '/create/cooking', color: '#F43F5E', icon: ChefHat },
  { id: 'fashion', name: 'Fashion', tagline: 'A look from your closet — equippable, shareable, sellable.', href: '/create/fashion', color: '#EC4899', icon: Shirt },
  { id: 'writing', name: 'Writing', tagline: 'A story beat, a caption, a verse — reviewed, then read in Story.', href: '/create/writing', color: '#84CC16', icon: PenLine },
];

export function CreatorHub() {
  return (
    <div className="min-h-screen w-full" style={{ background: BG, color: '#fff' }}>
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-2 text-xs font-semibold tracking-[0.4em] text-white/40">FEL · CREATOR</div>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Creator Hub</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/55">
          Nine creator disciplines, one arena. Pick a craft and perform or publish — each one scores or showcases
          what you actually do, not a menu you tap through.
        </p>

        <Link
          href="/creator/athlete"
          className="mt-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/[0.04] p-6 transition hover:border-white/25 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-center gap-4">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-2xl"
              style={{ background: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255,255,255,0.14)' }}
            >
              <UserRound className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.32em] text-white/35">Character Creator</div>
              <h2 className="mt-1 text-2xl font-black">Build your athlete</h2>
              <p className="mt-2 max-w-2xl text-sm text-white/55">
                Shape the hero every shipped mode wears — face, body, palette, nameplate, and active look.
              </p>
            </div>
          </div>
          <div className="inline-flex items-center gap-1 text-sm font-semibold text-white">
            Open Athlete Creator <ArrowRight className="h-4 w-4" />
          </div>
        </Link>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DISCIPLINES.map((d) => {
            const Icon = d.icon;
            const inner = (
              <div
                data-creator-discipline={d.id}
                className="group relative flex h-full flex-col rounded-2xl border p-6 transition"
                style={{
                  borderColor: 'rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.03)',
                }}
              >
                <div
                  className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ background: `${d.color}1a`, border: `1px solid ${d.color}55` }}
                >
                  <Icon className="h-6 w-6" style={{ color: d.color }} />
                </div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold">{d.name}</h2>
                </div>
                <p className="mt-2 flex-1 text-sm text-white/50">{d.tagline}</p>
                <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: d.color }}>
                  Enter <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
                </div>
              </div>
            );
            return <Link key={d.id} href={d.href} className="block">{inner}</Link>;
          })}
        </div>
      </div>
    </div>
  );
}
