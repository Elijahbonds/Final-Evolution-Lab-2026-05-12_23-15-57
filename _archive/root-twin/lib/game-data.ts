export interface Venue {
  key: string;
  name: string;
  image: string;
  modes: string[];
  playable: boolean;
  href?: string;
}

export const VENUES: Venue[] = [
  { key: 'dojo', name: 'Shimogamo Dojo', image: '/venues/dojo-card.jpg', modes: ['Karate Endless', 'Karate VS'], playable: true, href: '/play/karate' },
  { key: 'venicebeach', name: 'Venice Beach Court', image: '/venues/venicebeach.jpg', modes: ['Dunk Contest', '1v1 Hoops', '3v3 Streetball', '3-Point Shootout'], playable: true, href: '/play/dunk' },
  { key: 'tenniscourt', name: 'Venice Tennis Court', image: '/venues/tenniscourt.jpg', modes: ['Match Play', 'Tiebreak Blitz'], playable: true, href: '/play/tennis' },
  { key: 'neuroarena', name: 'NeuroArena', image: '', modes: ['Brain Brawl', 'Who Scene It'], playable: true, href: '/play/brain-brawl' },
  { key: 'skatepark', name: 'Venice Skatepark', image: '/venues/skatepark.jpg', modes: ['Skate Run'], playable: true, href: '/play/skateboard' },
  { key: 'mountainslope', name: 'Mountain Slope', image: '/venues/mountainslope.jpg', modes: ['Slalom Descent', 'Big Air'], playable: true, href: '/play/snowboard' },
  { key: 'surfbreak', name: 'Surf Break', image: '/venues/surfbreak.jpg', modes: ['Surf Break'], playable: true, href: '/play/surf' },
  { key: 'links', name: 'Coastal Links', image: '/venues/links.jpg', modes: ['Links Challenge'], playable: true, href: '/play/golf' },
  { key: 'soccerstadium', name: 'Coastal FC Stadium', image: '/venues/soccerstadium.jpg', modes: ['Penalty Shootout'], playable: true, href: '/play/soccer' },
  { key: 'baseballpark', name: 'Catalina Ballpark', image: '/venues/baseballpark.jpg', modes: ['Home Run Derby'], playable: true, href: '/play/baseball' },
  { key: 'gridiron', name: 'The Gridiron', image: '', modes: ['Street Football'], playable: true, href: '/play/football' },
  { key: 'gymnasticsgym', name: 'Pacifica Gymnastics', image: '/venues/gymnasticsgym.jpg', modes: ['Vault'], playable: true, href: '/play/gymnastics' },
  { key: 'lumaveniceshop', name: 'Luma Venice Shop', image: '/venues/lumaveniceshop.jpg', modes: ['Market Browse'], playable: true, href: '/shop' },
  { key: 'musclebeachgym', name: 'Muscle Beach Gym', image: '/venues/musclebeachgym.jpg', modes: ['Iron Paradise', 'Beach Sprint'], playable: true, href: '/play/training' },
  { key: 'courtcarnival', name: 'Court Carnival', image: '/venues/courtcarnival.jpg', modes: ['Slam Rush', 'Strike Storm', 'Trick Gauntlet', 'Hot Shot', 'Coin Storm', 'Counter Strike'], playable: true, href: '/play/carnival' },
  { key: 'octagon', name: 'The Octagon', image: '', modes: ['Mixed Combat'], playable: true, href: '/play/mixedcombat' },
  { key: 'dunkduel', name: 'Dunk Duel Arena', image: '', modes: ['Pass & Play Duel'], playable: true, href: '/play/dunkduel' },
];

export interface RosterAvatar {
  key: string;
  name: string;
  build: 'skinny' | 'athletic' | 'strong' | 'tall' | 'obese';
  sex: 'male' | 'female';
  accent: string;
  tagline: string;
  bias: string[];
}

export const ROSTER: RosterAvatar[] = [
  { key: 'male-skinny', name: 'Wiry Prospect', build: 'skinny', sex: 'male', accent: '#00E5FF', tagline: 'Light frame, endless motor. Built for speed lines and quick tempo.', bias: ['Speed', 'Agility'] },
  { key: 'male-athletic', name: 'Court General', build: 'athletic', sex: 'male', accent: '#00FF9D', tagline: 'Balanced all-court athlete. No weak links in the chain.', bias: ['Balanced'] },
  { key: 'male-strong', name: 'Power Forward', build: 'strong', sex: 'male', accent: '#FF3366', tagline: 'Dense muscle, explosive first step. Lives above the rim.', bias: ['Strength', 'Power'] },
  { key: 'male-tall', name: 'Skyline', build: 'tall', sex: 'male', accent: '#A855F7', tagline: 'Length for days. Reach advantage in every contest.', bias: ['Power', 'Reach'] },
  { key: 'male-obese', name: 'Big Engine', build: 'obese', sex: 'male', accent: '#FFD700', tagline: 'Mass moves mass. Immovable in the paint, surprising burst.', bias: ['Strength', 'Endurance'] },
  { key: 'female-skinny', name: 'Blur', build: 'skinny', sex: 'female', accent: '#00E5FF', tagline: 'First to every loose ball. Change-of-direction specialist.', bias: ['Speed', 'Flexibility'] },
  { key: 'female-athletic', name: 'Prime Mover', build: 'athletic', sex: 'female', accent: '#00FF9D', tagline: 'Two-way engine with elite conditioning and court IQ.', bias: ['Balanced'] },
  { key: 'female-strong', name: 'Anchor', build: 'strong', sex: 'female', accent: '#FF3366', tagline: 'Sets the tone physically. Wins the contact battles.', bias: ['Strength', 'Power'] },
  { key: 'female-tall', name: 'High Point', build: 'tall', sex: 'female', accent: '#A855F7', tagline: 'Towers over the play. Untouchable release point.', bias: ['Power', 'Reach'] },
  { key: 'female-obese', name: 'Wrecking Crew', build: 'obese', sex: 'female', accent: '#FFD700', tagline: 'Heavy hitter with a soft touch. Deceptively agile.', bias: ['Strength', 'Mental'] },
];

export interface ShopCard {
  key: string;
  name: string;
  type: 'DRILL' | 'AVATAR' | 'COURSE';
  price: number;
  description: string;
  accent: string;
}

export const SHOP_CARDS: ShopCard[] = [
  { key: 'drill-jab-flow', name: 'Jab Flow Drill', type: 'DRILL', price: 80, description: 'Speed-chain jab timing drill. Sharpens combo windows in Karate Endless.', accent: '#00E5FF' },
  { key: 'drill-vert-charge', name: 'Vert Charge Drill', type: 'DRILL', price: 80, description: 'Perfect-charge repetition drill for max hang time in Dunk Contest.', accent: '#00FF9D' },
  { key: 'drill-baseline-grind', name: 'Baseline Grind Drill', type: 'DRILL', price: 80, description: 'Rally endurance drill. Improves return positioning in Match Play.', accent: '#FFD700' },
  { key: 'avatar-neon-gi', name: 'Neon Gi Avatar', type: 'AVATAR', price: 250, description: 'Cyan-trimmed dojo gi with reactive glow aura.', accent: '#00E5FF' },
  { key: 'avatar-golden-hour', name: 'Golden Hour Avatar', type: 'AVATAR', price: 250, description: 'Venice sunset colorway with gold accents.', accent: '#FFD700' },
  { key: 'avatar-neuro-pulse', name: 'Neuro Pulse Avatar', type: 'AVATAR', price: 250, description: 'Purple neural-circuit skin. ELITE grade energy.', accent: '#A855F7' },
  { key: 'course-dunk-adv', name: 'Advanced Dunk Theory', type: 'COURSE', price: 150, description: 'Deep-dive course: approach vectors, gather steps, contact windows.', accent: '#00FF9D' },
  { key: 'course-karate-adv', name: 'Advanced Strike Systems', type: 'COURSE', price: 150, description: 'Counter-window theory and multi-opponent spacing.', accent: '#FF3366' },
];

export interface Lesson {
  key: string;
  title: string;
  concept: string;
  drill: string;
}

export interface EduModule {
  key: string;
  title: string;
  lessons: Lesson[];
}

export interface Track {
  key: string;
  title: string;
  subtitle: string;
  accent: string;
  mode: string;
  href: string;
  modules: EduModule[];
}

export const TRACKS: Track[] = [
  {
    key: 'dunk-fundamentals',
    title: 'Dunk Fundamentals',
    subtitle: 'Vertical power · hang time · style scoring',
    accent: '#00E5FF',
    mode: 'dunkContest',
    href: '/play/dunk',
    modules: [
      {
        key: 'm1',
        title: 'Module 1 — The Vertical',
        lessons: [
          { key: 'l1', title: 'Charge Mechanics', concept: 'Jump power scales with charge time. A full charge bar maximizes launch velocity — but overcharging past the sweet spot costs control. Watch the bar: release inside the highlighted band.', drill: 'Play Dunk Contest and land 3 jumps with 80%+ charge.' },
          { key: 'l2', title: 'Hang Time Physics', concept: 'During hang time, gravity scales to 0.65 — the slow-mo window. Your PRQ grade adds hang bonus: ELITE +0.30s, PRIMED +0.15s. More hang = more time to execute tricks.', drill: 'Score at least 2 hang-time points in one dunk.' },
          { key: 'l3', title: 'The Gather Step', concept: 'Elite dunkers convert horizontal speed into vertical lift through the gather. In-game, your approach speed multiplies with your Speed attribute.', drill: 'Win a dunk round with a PERFECT timing bonus.' },
        ],
      },
      {
        key: 'm2',
        title: 'Module 2 — Style Systems',
        lessons: [
          { key: 'l1', title: 'Trick Complexity', concept: 'POWER (\u2191) dunks are safe: moderate complexity, high consistency. FLASHY (\u2190\u2192) raises complexity but tightens the QTE window. SIGNATURE (\u2193) is max complexity — reserve it for full-charge jumps.', drill: 'Execute one of each style in a single contest.' },
          { key: 'l2', title: 'Timing Windows', concept: 'The apex QTE grades your tap: PERFECT +1.0, GREAT +0.5, GOOD +0. A MISS costs a full point. The window shrinks as trick complexity rises.', drill: 'Chain two consecutive PERFECT dunks.' },
          { key: 'l3', title: 'Reading the Scoreboard', concept: 'First to 21 style points wins. Score = hang time (0-2) + complexity (0-2) + timing bonus. Bank safe POWER dunks when leading; go SIGNATURE when trailing.', drill: 'Beat the AI opponent in a full contest.' },
        ],
      },
    ],
  },
  {
    key: 'karate-fundamentals',
    title: 'Karate Fundamentals',
    subtitle: 'Strike chains · block cones · wave survival',
    accent: '#FF3366',
    mode: 'karateEndless',
    href: '/play/karate',
    modules: [
      {
        key: 'm1',
        title: 'Module 1 — Strike Vocabulary',
        lessons: [
          { key: 'l1', title: 'The Jab (\u25A1)', concept: 'Fastest strike, 1 point. The jab starts every chain — its short recovery keeps the 0.5s combo window alive. Speed beats power early in a chain.', drill: 'Land a 5-hit chain in Karate Endless.' },
          { key: 'l2', title: 'The Kick (\u25B3)', concept: 'Slower, 2 points, longer reach. Kicks are chain finishers — cash in the multiplier before the window closes.', drill: 'Finish a 3+ chain with a kick.' },
          { key: 'l3', title: 'The Special (\u25CB)', concept: '3 points, big commitment. Whiffing a special drops your chain and leaves you open. Land it only on staggered opponents.', drill: 'Land 3 specials in one session.' },
        ],
      },
      {
        key: 'm2',
        title: 'Module 2 — Defense & Waves',
        lessons: [
          { key: 'l1', title: 'Block Cone (\u2715)', concept: 'Holding block covers a 90\u00B0 frontal cone. Blocked hits deal zero damage and open a 0.15s counter window — strike inside it for bonus damage.', drill: 'Execute 3 counter-hits after blocks.' },
          { key: 'l2', title: 'Neural Burst', concept: 'NeuralDrive builds as you land clean hits. At 80+, burst activates: 1.5\u00D7 multiplier with purple aura. Spend it on dense waves.', drill: 'Trigger Neural Burst in a session.' },
          { key: 'l3', title: 'Wave Scaling', concept: 'Waves 1-3: single opponents, aggression 0.6-0.8. By wave 13+: 3 opponents, aggression 1.4, speed \u00D71.15. Survive by rotating — never let them flank.', drill: 'Reach wave 5 in Karate Endless.' },
        ],
      },
    ],
  },
];

export const MODE_INFO: Record<string, { name: string; venue: string; href: string }> = {
  karateEndless: { name: 'Karate Endless', venue: 'Shimogamo Dojo', href: '/play/karate' },
  dunkContest: { name: 'Dunk Contest', venue: 'Venice Beach Court', href: '/play/dunk' },
  tennis: { name: 'Match Play', venue: 'Venice Tennis Court', href: '/play/tennis' },
  brainBrawl: { name: 'Brain Brawl', venue: 'NeuroArena', href: '/play/brain-brawl' },
  skateboarding: { name: 'Skate Run', venue: 'Venice Skatepark', href: '/play/skateboard' },
  soccer: { name: 'Penalty Shootout', venue: 'Coastal FC Stadium', href: '/play/soccer' },
  baseball: { name: 'Home Run Derby', venue: 'Catalina Ballpark', href: '/play/baseball' },
  snowboarding: { name: 'Slalom Descent', venue: 'Mountain Slope', href: '/play/snowboard' },
  surfing: { name: 'Surf Break', venue: 'Surf Break', href: '/play/surf' },
  golf: { name: 'Links Challenge', venue: 'Coastal Links', href: '/play/golf' },
  gymnastics: { name: 'Vault', venue: 'Pacifica Gymnastics', href: '/play/gymnastics' },
  training: { name: 'Iron Paradise', venue: 'Muscle Beach Gym', href: '/play/training' },
  hoops1v1: { name: '1v1 Hoops', venue: 'Venice Beach Court', href: '/play/onevone' },
  hoops3v3: { name: '3v3 Streetball', venue: 'Venice Beach Court', href: '/play/threevthree' },
  carnival: { name: 'Court Carnival', venue: 'Venice Beach Court', href: '/play/carnival' },
  threePoint: { name: 'Three-Point Shootout', venue: 'Venice Beach Court', href: '/play/threepoint' },
  karateVersus: { name: 'Karate VS', venue: 'Shimogamo Dojo', href: '/play/karate-vs' },
  whoSceneIt: { name: 'Who Scene It', venue: 'NeuroArena', href: '/play/who-scene-it' },
  bigAir: { name: 'Big Air', venue: 'Mountain Slope', href: '/play/big-air' },
  tiebreak: { name: 'Tiebreak Blitz', venue: 'Venice Tennis Court', href: '/play/tiebreak' },
  sprint: { name: 'Beach Sprint', venue: 'Muscle Beach Gym', href: '/play/sprint' },
  storyMode: { name: 'The Nexus Initiative', venue: 'The Nexus', href: '/story' },
  football: { name: 'Street Football', venue: 'The Gridiron', href: '/play/football' },
  mixedcombat: { name: 'Mixed Combat', venue: 'The Octagon', href: '/play/mixedcombat' },
  dunkduel: { name: 'Dunk Duel', venue: 'Venice Beach Court', href: '/play/dunkduel' },
  musicAcademy: { name: 'Music Academy', venue: 'Studio', href: '/play/music' },
  dance: { name: 'The Cypher', venue: 'The Cypher', href: '/play/dance' },
  acting: { name: 'The Read', venue: 'Acting Stage', href: '/play/acting' },
  irl: { name: 'Hang Time', venue: 'Real World', href: '/play/irl' },
  marketplace: { name: 'Marketplace', venue: 'The Market', href: '/market' },
  kitchens: { name: 'FEL Kitchens', venue: 'The Kitchen', href: '/kitchens' },
};
