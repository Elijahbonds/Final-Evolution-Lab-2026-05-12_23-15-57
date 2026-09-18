import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { modeMenuMetaFor, visibleModeEntries } from '@/lib/mode-menu';
import { ChevronRight, Swords, Timer } from 'lucide-react';

export const dynamic = 'force-dynamic';

// Quick, single-mechanic mini-games live only inside Court Carnival's
// rotating party lineup now, not as their own top-level tiles — same games,
// same rewards, just reached from the carnival hub instead of this grid.
// Non-session support surfaces stay reachable from their own product nav,
// but do not belong in the game-mode count.

export default async function ModesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  const visibleModes = visibleModeEntries();
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <main className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="fel-heading text-3xl font-bold text-white">GAME MODES</h1>
            <p className="mt-1 text-sm text-white/50">{visibleModes.length} live modes. Every session feeds your PRQ.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/multiplayer"
              className="fel-card flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all hover:border-[#FF3366]/50 hover:shadow-[0_0_20px_rgba(255,51,102,0.15)]"
            >
              <Swords className="h-4 w-4" style={{ color: '#FF3366' }} />
              <span className="hidden sm:inline">Versus Arena</span>
            </Link>
            <Link
              href="/play/calibrate"
              className="fel-card flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all hover:border-[#00E5FF]/50 hover:shadow-[0_0_20px_rgba(0,229,255,0.15)]"
            >
              <Timer className="h-4 w-4" style={{ color: '#00E5FF' }} />
              <span className="hidden sm:inline">Calibrate Audio</span>
            </Link>
          </div>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {visibleModes.map(([key, info]) => {
            const meta = modeMenuMetaFor(key);
            const Icon = meta.icon;
            return (
              <Link
                key={key}
                href={info?.href ?? '/'}
                className="fel-card group flex items-center gap-4 rounded-xl p-5 transition-all hover:border-white/25 hover:shadow-[0_0_24px_rgba(0,229,255,0.12)]"
              >
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}55` }}
                >
                  <Icon className="h-7 w-7" style={{ color: meta.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="fel-heading text-xl font-bold text-white">{info?.name}</h2>
                  <p className="text-xs text-white/45">{info?.venue}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-white/55">{meta.desc}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-white/30 transition-transform group-hover:translate-x-1 group-hover:text-[#00E5FF]" />
              </Link>
            );
          })}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
