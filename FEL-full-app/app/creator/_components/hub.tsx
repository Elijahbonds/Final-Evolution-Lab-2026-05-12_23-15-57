import Link from 'next/link';
import { Music, Mic, Zap, Palette, Dumbbell, ArrowRight, Lock } from 'lucide-react';

// Creator Hub — the five disciplines. Each tile routes to a real, playable
// surface. Art has no painter yet (the M76 card/paint editor is deferred), so
// it is honestly marked "coming soon" rather than linking to a dead route.

const BG = '#050505';

type Discipline = {
  id: string;
  name: string;
  tagline: string;
  href: string | null;
  color: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
};

const DISCIPLINES: Discipline[] = [
  { id: 'dance', name: 'Dance', tagline: 'Nail the count-in, then chain the combo. Tap on the beat.', href: '/play/dance', color: '#FF2D95', icon: Zap },
  { id: 'acting', name: 'Acting', tagline: 'Hit the cue, match the intensity. Delivery, scored locally.', href: '/play/acting', color: '#FF3366', icon: Mic },
  { id: 'music', name: 'Music', tagline: 'The FEL Academy — sequence, master and publish your own tracks.', href: '/studio', color: '#00E5FF', icon: Music },
  { id: 'sport', name: 'Sport', tagline: 'Time the rise, throw it down. The dunk arena.', href: '/play/dunk', color: '#FFD700', icon: Dumbbell },
  { id: 'art', name: 'Art', tagline: 'The paint studio is in the workshop — arriving in a future drop.', href: null, color: '#A855F7', icon: Palette },
];

export function CreatorHub() {
  return (
    <div className="min-h-screen w-full" style={{ background: BG, color: '#fff' }}>
      <div className="mx-auto max-w-5xl px-5 py-10">
        <div className="mb-2 text-xs font-semibold tracking-[0.4em] text-white/40">FEL · CREATOR</div>
        <h1 className="text-4xl font-black tracking-tight sm:text-5xl">Creator Hub</h1>
        <p className="mt-3 max-w-2xl text-sm text-white/55">
          Five disciplines, one arena. Pick a craft and perform — each one scores what you actually do,
          not a menu you tap through.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {DISCIPLINES.map((d) => {
            const Icon = d.icon;
            const inner = (
              <div
                className="group relative flex h-full flex-col rounded-2xl border p-6 transition"
                style={{
                  borderColor: d.href ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.03)',
                  opacity: d.href ? 1 : 0.6,
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
                  {!d.href && <Lock className="h-3.5 w-3.5 text-white/40" />}
                </div>
                <p className="mt-2 flex-1 text-sm text-white/50">{d.tagline}</p>
                <div className="mt-4 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: d.href ? d.color : 'rgba(255,255,255,0.35)' }}>
                  {d.href ? <>Enter <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></> : 'Coming soon'}
                </div>
              </div>
            );
            return d.href ? (
              <Link key={d.id} href={d.href} className="block">{inner}</Link>
            ) : (
              <div key={d.id}>{inner}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
