import type { LucideIcon } from 'lucide-react';
import {
  BookOpen,
  Brain,
  CircleDot,
  CircleDollarSign,
  Crosshair,
  Dumbbell,
  Eye,
  Flag,
  Footprints,
  Goal,
  Mountain,
  Shield,
  Sparkles,
  Swords,
  Target,
  Timer,
  Trophy,
  Users,
  Waves,
  Snowflake,
  Zap,
} from 'lucide-react';
import { CARNIVAL_EXTERNAL_POOL } from './carnival-run';
import { MODE_INFO } from './game-data';

export interface ModeMenuMeta {
  icon: LucideIcon;
  color: string;
  desc: string;
}

export const MODE_MENU_META: Record<string, ModeMenuMeta> = {
  // Both of these shipped with a route and no menu row, so nothing in the app linked to them (2026-09-19).
  velocitykart: { icon: Timer, color: '#FFD700', desc: 'Kart racing on the Sovereign Circuit. Drift the corners, bank the boost, hold the line.' },
  aeroaces: { icon: Mountain, color: '#00E5FF', desc: 'Low-altitude air racing. Thread the pylons, roll through the gates, chase the leader.' },
  karateEndless: { icon: Swords, color: '#FF3366', desc: 'Wave-survival fighter. Chain jabs, kicks and specials - survive escalating waves.' },
  dunkContest: { icon: Trophy, color: '#00E5FF', desc: 'Charge your jump, hit the apex QTE, pick your style. First to 21 style points.' },
  tennis: { icon: CircleDot, color: '#00FF9D', desc: 'Rally-based match play vs adaptive AI. First to 5 points takes the match.' },
  brainBrawl: { icon: Brain, color: '#A855F7', desc: 'Spin the category wheel and answer under pressure. 120 seconds on the clock.' },
  skateboarding: { icon: Zap, color: '#00E5FF', desc: 'Shred the Venice park. Time your ollies, chain grabs and grinds for a high score run.' },
  soccer: { icon: Goal, color: '#00FF9D', desc: 'Twelve yards under stadium lights. Pick your corner, beat the keeper, five rounds.' },
  baseball: { icon: CircleDollarSign, color: '#FFD700', desc: 'Moonshot Derby at Catalina Ballpark. Read the pitch, time the swing, clear the wall.' },
  snowboarding: { icon: Snowflake, color: '#00E5FF', desc: 'Gate-crashing descent down the mountain. Carve every gate at speed without wiping out.' },
  surfing: { icon: Waves, color: '#00FF9D', desc: 'Ride the break. Balance the line, pump for speed, and stick tricks on the lip.' },
  golf: { icon: Flag, color: '#00FF9D', desc: 'Coastal links loop. Dial in power and accuracy across three signature holes.' },
  freerun: { icon: Sparkles, color: '#A855F7', desc: 'Free-running tricking. Momentum unlocks vaults, wall runs and cat leaps; flip off anything and land it clean to bank the line.' },
  training: { icon: Dumbbell, color: '#FF3366', desc: 'Iron Paradise circuit at Muscle Beach. Rep timing drills that push every attribute.' },
  hoops1v1: { icon: Target, color: '#FF3366', desc: 'Ones at Venice. Break down your defender on offense, lock up on D. First to 11.' },
  hoops3v3: { icon: Users, color: '#00E5FF', desc: 'Streetball with your squad. Swing it to the open lane and knock down shots. First to 21.' },
  carnival: { icon: Sparkles, color: '#FFD700', desc: 'A rotating party night: native carnival events plus quick-score stops, chained into one run.' },
  threePoint: { icon: Crosshair, color: '#FFD700', desc: 'Five racks, five balls, sixty seconds. Money balls count double - drain 18+ to win.' },
  karateVersus: { icon: Shield, color: '#FF3366', desc: 'Best of 3 vs the Rival Sensei. Strike, block the telegraph, unleash your chi special.' },
  whoSceneIt: { icon: Eye, color: '#A855F7', desc: 'Rapid-fire recall. 15 questions, 8 seconds each - speed and streaks multiply your score.' },
  bigAir: { icon: Mountain, color: '#00E5FF', desc: 'Five kickers, huge amplitude. Charge the jump, spin the trick prompts, stomp the landing.' },
  tiebreak: { icon: Timer, color: '#00FF9D', desc: 'Sudden-death tennis. Read the serve side and swing in the green window. First to 7.' },
  storyMode: { icon: BookOpen, color: '#A855F7', desc: 'The Nexus Initiative. Train in the Sanctum, grind the rails, face the Glitch Boss.' },
  football: { icon: Footprints, color: '#FFD700', desc: 'Breakaway football. Read the lane, chain cuts and trucks, then finish through contact.' },
  mixedcombat: { icon: Swords, color: '#FF3366', desc: "Ring's Edge combat. Manage guard, spacing, stamina and finishers in a scored fight." },
  dunkduel: { icon: Trophy, color: '#00E5FF', desc: 'Prove It with a camera-judged IRL dunk duel: measure jump metrics and settle the challenge.' },
  volleyball: { icon: CircleDot, color: '#00FF9D', desc: 'Beach Rally. Serve, dig and spike through rally windows against a reactive opponent.' },
  showdown: { icon: Shield, color: '#FF3366', desc: 'Storm-style showdown. Spend support assists and substitutions to swing a duel in your favor.' },
  duel: { icon: Swords, color: '#A855F7', desc: 'Weapon duel fundamentals: reach, footwork and clean-hit windows decide the score.' },
  sprint: { icon: Footprints, color: '#FFD700', desc: 'Beach Sprint. Alternate stride rhythm and hold form under pressure to beat the rival.' },
  musicAcademy: { icon: Timer, color: '#A855F7', desc: 'Groove Academy. Lock into the beat clock and translate rhythm timing into session progress.' },
  dance: { icon: Sparkles, color: '#FF3366', desc: 'The Cypher. Hit choreography cues, keep streak timing alive and cash out performance flow.' },
  acting: { icon: Eye, color: '#A855F7', desc: 'The Read. Practice delivery, timing and presence through a scored creative discipline.' },
  irl: { icon: Trophy, color: '#00E5FF', desc: 'Hang Time. Capture real-world jump evidence locally and turn measured effort into progress.' },
  mirror: { icon: Eye, color: '#00FF9D', desc: 'Neuro-Mechanic Mirror. Use the camera locally for form feedback and corrective coaching.' },
  marketplace: { icon: CircleDollarSign, color: '#FFD700', desc: 'Browse creator cards, style drops and market listings outside the game-mode loop.' },
  kitchens: { icon: Dumbbell, color: '#00FF9D', desc: 'FEL Kitchens converts training goals into fuel plans, groceries and meal-prep guidance.' },
};

export const SUPPORT_SURFACES = new Set<string>(['marketplace', 'kitchens']);
export const HIDDEN_FROM_MODE_MENU = new Set<string>([
  ...CARNIVAL_EXTERNAL_POOL,
  ...SUPPORT_SURFACES,
]);

export const DEFAULT_MODE_MENU_META: ModeMenuMeta = {
  icon: Trophy,
  color: '#00E5FF',
  desc: 'Live FEL session. Play the mode, post a score and feed your PRQ.',
};

export function modeMenuMetaFor(key: string): ModeMenuMeta {
  return MODE_MENU_META[key] ?? DEFAULT_MODE_MENU_META;
}

export function visibleModeEntries() {
  return Object.entries(MODE_INFO).filter(([key]) => !HIDDEN_FROM_MODE_MENU.has(key));
}

export function missingModeMenuMetaKeys(): string[] {
  return visibleModeEntries()
    .filter(([key]) => !MODE_MENU_META[key])
    .map(([key]) => key);
}
