import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { authOptions } from '@/lib/auth';
import { AppHeader } from '@/components/app-header';
import { BottomNav } from '@/components/bottom-nav';
import { MODE_INFO } from '@/lib/game-data';
import {
  Swords, CircleDot, Trophy, Brain, ChevronRight, Zap, Users, Target, Crosshair,
  Snowflake, Waves, Flag, Goal, CircleDollarSign, Sparkles, Dumbbell, Mountain,
  Timer, Footprints, Eye, Shield, BookOpen,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

const META: Record<string, { icon: any; color: string; desc: string }> = {
  karateEndless: { icon: Swords, color: '#FF3366', desc: 'Wave-survival fighter. Chain jabs, kicks and specials — survive escalating waves.' },
  dunkContest: { icon: Trophy, color: '#00E5FF', desc: 'Charge your jump, hit the apex QTE, pick your style. First to 21 style points.' },
  tennis: { icon: CircleDot, color: '#00FF9D', desc: 'Rally-based match play vs adaptive AI. First to 5 points takes the match.' },
  brainBrawl: { icon: Brain, color: '#A855F7', desc: 'Spin the category wheel and answer under pressure. 120 seconds on the clock.' },
  skateboarding: { icon: Zap, color: '#00E5FF', desc: 'Shred the Venice park. Time your ollies, chain grabs and grinds for a high score run.' },
  soccer: { icon: Goal, color: '#00FF9D', desc: 'Penalty shootout under stadium lights. Pick your corner, beat the keeper, five rounds.' },
  baseball: { icon: CircleDollarSign, color: '#FFD700', desc: 'Home Run Derby at Catalina Ballpark. Read the pitch, time the swing, clear the wall.' },
  snowboarding: { icon: Snowflake, color: '#00E5FF', desc: 'Slalom descent down the mountain. Carve every gate at speed without wiping out.' },
  surfing: { icon: Waves, color: '#00FF9D', desc: 'Ride the break. Balance the line, pump for speed, and stick tricks on the lip.' },
  golf: { icon: Flag, color: '#00FF9D', desc: 'Coastal links challenge. Dial in power and accuracy across three signature holes.' },
  gymnastics: { icon: Sparkles, color: '#A855F7', desc: 'Floor routine flow. Nail every prompt in rhythm to build your execution score.' },
  training: { icon: Dumbbell, color: '#FF3366', desc: 'Iron Paradise circuit at Muscle Beach. Rep timing drills that push every attribute.' },
  hoops1v1: { icon: Target, color: '#FF3366', desc: 'Ones at Venice. Break down your defender on offense, lock up on D. First to 11.' },
  hoops3v3: { icon: Users, color: '#00E5FF', desc: 'Streetball with your squad. Swing it to the open lane and knock down shots. First to 21.' },
  threePoint: { icon: Crosshair, color: '#FFD700', desc: 'Five racks, five balls, sixty seconds. Money balls count double — drain 18+ to win.' },
  karateVersus: { icon: Shield, color: '#FF3366', desc: 'Best of 3 vs the Rival Sensei. Strike, block the telegraph, unleash your chi special.' },
  whoSceneIt: { icon: Eye, color: '#A855F7', desc: 'Rapid-fire recall. 15 questions, 8 seconds each — speed and streaks multiply your score.' },
  bigAir: { icon: Mountain, color: '#00E5FF', desc: 'Five kickers, huge amplitude. Charge the jump, spin the trick prompts, stomp the landing.' },
  tiebreak: { icon: Timer, color: '#00FF9D', desc: 'Sudden-death tennis. Read the serve side and swing in the green window. First to 7.' },
  sprint: { icon: Footprints, color: '#FFD700', desc: '100m beach dash. Alternate steps in rhythm — stumble once and the rival pulls ahead.' },
  storyMode: { icon: BookOpen, color: '#A855F7', desc: 'The Nexus Initiative. Train in the Sanctum, grind the rails, face the Glitch Boss.' },
};

export default async function ModesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect('/login');
  return (
    <div className="min-h-screen bg-[#050505] pb-20">
      <AppHeader />
      <main className="mx-auto max-w-[1200px] px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="fel-heading text-3xl font-bold text-white">GAME MODES</h1>
            <p className="mt-1 text-sm text-white/50">{Object.keys(MODE_INFO).length} live modes. Every session feeds your PRQ.</p>
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
          {Object.entries(MODE_INFO).map(([key, info]) => {
            const meta = META?.[key];
            const Icon = meta?.icon ?? Trophy;
            return (
              <Link
                key={key}
                href={info?.href ?? '/'}
                className="fel-card group flex items-center gap-4 rounded-xl p-5 transition-all hover:border-white/25 hover:shadow-[0_0_24px_rgba(0,229,255,0.12)]"
              >
                <div
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${meta?.color}18`, border: `1px solid ${meta?.color}55` }}
                >
                  <Icon className="h-7 w-7" style={{ color: meta?.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="fel-heading text-xl font-bold text-white">{info?.name}</h2>
                  <p className="text-xs text-white/45">{info?.venue}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-white/55">{meta?.desc}</p>
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
