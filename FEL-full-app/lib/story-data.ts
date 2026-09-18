/**
 * lib/story-data.ts
 *
 * "The Nexus Initiative" — Story mode META campaign data.
 *
 * Authored, first-party, fixed at build time ([SHIP] scope only).
 * Pure data + types. No I/O, no client/server coupling — safe to import
 * from route handlers, server components, and client components alike.
 *
 * Progression shape: 13 zones matching the story hub map (story-hub.glb).
 * Each zone carries a narrative beat, an unlock requirement (previous zone
 * cleared + optional PRQ / lesson gates), a "rail" of 3 challenge nodes,
 * and a boss node that awards a badge. Zone clearing = boss node complete.
 *
 * All numeric targets/rewards are design-tunable. Reward values follow the
 * v1 economy pacing from EDUCATION_CREATORCARD_SPEC (session win ≈ +15 LC):
 * rail nodes pay 15/20/25 LC, bosses pay 50 LC. Full campaign ≈ 1,430 LC.
 */

// ---------------------------------------------------------------------------
// Zone + node types
// ---------------------------------------------------------------------------

export const ZONE_IDS = [
  'blacktop',
  'dojo',
  'sandPit',
  'skateBowl',
  'surfPier',
  'snowSlope',
  'golfGreen',
  'diamond',
  'gridiron',
  'pitch',
  'tennis',
  'gymDome',
  'labHub',
] as const;

export type ZoneId = (typeof ZONE_IDS)[number];

export type StoryNodeKind = 'rail' | 'boss';

export interface StoryBadge {
  id: string;
  name: string;
  /** One-line flavor shown on the badge card. */
  description: string;
}

export interface StoryNode {
  /** Stable id, `${zoneId}.r1|r2|r3|boss`. Persisted in StoryNodeProgress. */
  id: string;
  zoneId: ZoneId;
  kind: StoryNodeKind;
  /** 1..3 for rail nodes (in-zone order), 4 for the boss. */
  order: number;
  title: string;
  /** One sentence challenge framing. */
  description: string;
  /** Game mode id — must match the app's `app/play/<mode>` route segment. */
  mode: string;
  /** Score the linked GameSession must meet or beat. */
  targetScore: number;
  /** Lab Credits awarded exactly once on completion (server-authoritative). */
  rewardLC: number;
  /** Boss nodes only. */
  badge?: StoryBadge;
}

export interface ZoneUnlockRequirement {
  /** Zone whose boss must be cleared first. `null` = always open (act 1 start). */
  requiresZone: ZoneId | null;
  /** Optional gate: overall PRQ (0–100) must be >= this value. */
  prqGate?: number;
  /** Optional gate: number of completed lessons (LessonProgress) must be >= this. */
  lessonGate?: number;
}

export interface StoryZone {
  id: ZoneId;
  title: string;
  /** Game mode id used by every node in this zone. */
  mode: string;
  act: 1 | 2 | 3;
  /** 2–3 sentence narrative beat, shown in the zone panel. */
  narrative: string;
  unlock: ZoneUnlockRequirement;
  rail: readonly [StoryNode, StoryNode, StoryNode];
  boss: StoryNode;
  /** 2D board placement, percentages of the map canvas (0–100). */
  position: { x: number; y: number };
  /** Accent color used by the map for this zone's glow/trail terminus. */
  accent: string;
}

export interface StoryCampaign {
  id: string;
  title: string;
  tagline: string;
  zones: readonly StoryZone[];
}

// ---------------------------------------------------------------------------
// Authoring helper (keeps the 52-node campaign compact and consistent)
// ---------------------------------------------------------------------------

interface RailSpec {
  title: string;
  description: string;
  targetScore: number;
}

interface BossSpec {
  title: string;
  description: string;
  targetScore: number;
  badgeName: string;
  badgeDescription: string;
}

const RAIL_REWARDS: readonly [number, number, number] = [15, 20, 25];
const BOSS_REWARD = 50;

interface ZoneSpec {
  id: ZoneId;
  title: string;
  mode: string;
  act: 1 | 2 | 3;
  narrative: string;
  unlock: ZoneUnlockRequirement;
  rail: [RailSpec, RailSpec, RailSpec];
  boss: BossSpec;
  position: { x: number; y: number };
  accent: string;
}

function defineZone(spec: ZoneSpec): StoryZone {
  const rail = spec.rail.map((r, i): StoryNode => ({
    id: `${spec.id}.r${i + 1}`,
    zoneId: spec.id,
    kind: 'rail',
    order: i + 1,
    title: r.title,
    description: r.description,
    mode: spec.mode,
    targetScore: r.targetScore,
    rewardLC: RAIL_REWARDS[i] as number,
  })) as unknown as [StoryNode, StoryNode, StoryNode];

  const boss: StoryNode = {
    id: `${spec.id}.boss`,
    zoneId: spec.id,
    kind: 'boss',
    order: 4,
    title: spec.boss.title,
    description: spec.boss.description,
    mode: spec.mode,
    targetScore: spec.boss.targetScore,
    rewardLC: BOSS_REWARD,
    badge: {
      id: `badge.${spec.id}`,
      name: spec.boss.badgeName,
      description: spec.boss.badgeDescription,
    },
  };

  return {
    id: spec.id,
    title: spec.title,
    mode: spec.mode,
    act: spec.act,
    narrative: spec.narrative,
    unlock: spec.unlock,
    rail,
    boss,
    position: spec.position,
    accent: spec.accent,
  };
}

// ---------------------------------------------------------------------------
// THE NEXUS INITIATIVE — campaign content
// ---------------------------------------------------------------------------
//
// Arc: after the verdict that ended your first career, recruiter Mara Vane
// signs you into the Nexus Initiative — thirteen trial grounds that rebuild
// an athlete from the asphalt up. At the Lab you face the Benchmark: the
// data-ghost of who you used to be.

const ZONES: readonly StoryZone[] = [
  defineZone({
    id: 'blacktop',
    title: 'The Blacktop',
    mode: 'basketball',
    act: 1,
    narrative:
      'Cracked asphalt, chain nets, and the court where it all started — before the draft boards, before the injury, before the verdict. Mara Vane leans on the fence with a tablet full of your old numbers and one question: do you want them back? The Initiative starts where you did.',
    unlock: { requiresZone: null },
    position: { x: 12, y: 88 },
    accent: '#22d3ee',
    rail: [
      {
        title: 'First Touch',
        description: 'Shake the rust off. Put up a clean scoring run on the old court.',
        targetScore: 400,
      },
      {
        title: 'Chain Net Music',
        description: 'String buckets together — Mara is charting your rhythm, not your total.',
        targetScore: 560,
      },
      {
        title: 'Streetlight Session',
        description: 'Last light, tired legs. Hold your form when the easy energy is gone.',
        targetScore: 720,
      },
    ],
    boss: {
      title: 'Run It Back',
      description: 'One full game at your old standard. Prove the foundation still holds.',
      targetScore: 1000,
      badgeName: 'Asphalt Proof',
      badgeDescription: 'Cleared the Blacktop — the foundation holds.',
    },
  }),

  defineZone({
    id: 'dojo',
    title: 'The Dojo',
    mode: 'karate',
    act: 1,
    narrative:
      'The Initiative sends every athlete to the dojo second, no exceptions. Sensei Ito doesn’t care who you were — he cares whether your hands do what your mind decides, exactly when it decides it. Here you strip the ego off the mechanics and start over.',
    unlock: { requiresZone: 'blacktop' },
    position: { x: 26, y: 74 },
    accent: '#f87171',
    rail: [
      {
        title: 'Empty Hands',
        description: 'Fundamentals only. Land clean strikes with zero wasted motion.',
        targetScore: 450,
      },
      {
        title: 'The Count',
        description: 'Ito calls the tempo. Match it — precision under someone else’s clock.',
        targetScore: 630,
      },
      {
        title: 'No Second Strike',
        description: 'Every technique must land the first time. Hesitation resets the drill.',
        targetScore: 810,
      },
    ],
    boss: {
      title: 'Ito’s Gauntlet',
      description: 'A full-contact grading in front of the class. Earn the nod.',
      targetScore: 1120,
      badgeName: 'Empty-Hand Discipline',
      badgeDescription: 'Graded out of the Dojo with Ito’s nod.',
    },
  }),

  defineZone({
    id: 'sandPit',
    title: 'The Sand Pit',
    mode: 'volleyball',
    act: 1,
    narrative:
      'Sand punishes everything the hardwood forgave. Every step sinks, every jump costs double, and the Initiative’s sensors log exactly how much of your explosiveness survives unstable ground. Rebuild your footwork where the floor fights back.',
    unlock: { requiresZone: 'dojo' },
    position: { x: 42, y: 82 },
    accent: '#fbbf24',
    rail: [
      {
        title: 'Sink or Step',
        description: 'Rally in deep sand. Keep the ball alive while your base rebuilds.',
        targetScore: 480,
      },
      {
        title: 'Double Cost',
        description: 'Attack from the sand — every takeoff pays twice, so make each one count.',
        targetScore: 670,
      },
      {
        title: 'Wind Reads',
        description: 'Crosswind session. Adjust mid-point or lose the point.',
        targetScore: 860,
      },
    ],
    boss: {
      title: 'King of the Pit',
      description: 'Beat the pit’s resident duo at their own tempo, on their own sand.',
      targetScore: 1200,
      badgeName: 'Unstable Ground',
      badgeDescription: 'Explosiveness certified on sand.',
    },
  }),

  defineZone({
    id: 'skateBowl',
    title: 'The Skate Bowl',
    mode: 'skate',
    act: 1,
    narrative:
      'The bowl teaches the one thing no coach can say out loud: commitment is binary. Half-sent tricks end in concrete, and the Initiative wants your relationship with fear on record. Falling is the curriculum — getting up on tempo is the grade.',
    unlock: { requiresZone: 'sandPit' },
    position: { x: 58, y: 72 },
    accent: '#a78bfa',
    rail: [
      {
        title: 'Drop In',
        description: 'Commit to the drop and hold a clean line through the bowl.',
        targetScore: 500,
      },
      {
        title: 'Coping Tax',
        description: 'Work the lip — grinds and stalls, no bailing mid-trick.',
        targetScore: 700,
      },
      {
        title: 'Link the Line',
        description: 'Chain a full run. One hesitation breaks the combo, and Mara will know.',
        targetScore: 900,
      },
    ],
    boss: {
      title: 'The Deep End',
      description: 'Full run in the 12-foot bowl. Fear is data; send it anyway.',
      targetScore: 1250,
      badgeName: 'Committed',
      badgeDescription: 'Sent the deep end with the cameras on.',
    },
  }),

  defineZone({
    id: 'surfPier',
    title: 'The Surf Pier',
    mode: 'surf',
    act: 2,
    narrative:
      'Act two begins where control ends. The ocean doesn’t run drills — it deals conditions, and the Initiative grades how you read forces you can’t negotiate with. Out past the pier, the only opponent is your own impatience.',
    unlock: { requiresZone: 'skateBowl' },
    position: { x: 74, y: 80 },
    accent: '#34d399',
    rail: [
      {
        title: 'Read the Set',
        description: 'Pick the right waves and ride them clean. Patience is scored.',
        targetScore: 520,
      },
      {
        title: 'Down the Line',
        description: 'Hold speed through sections — flow, not force.',
        targetScore: 730,
      },
      {
        title: 'Heavy Water',
        description: 'Overhead session. Stay composed when the ocean raises the stakes.',
        targetScore: 940,
      },
    ],
    boss: {
      title: 'The Long Set',
      description: 'A full heat in shifting conditions. Adapt or get graded by the whitewater.',
      targetScore: 1300,
      badgeName: 'Force Reader',
      badgeDescription: 'Graded composed in heavy water.',
    },
  }),

  defineZone({
    id: 'snowSlope',
    title: 'The Snow Slope',
    mode: 'snowboard',
    act: 2,
    narrative:
      'Altitude thins the air and the excuses. At speed, on ice, every micro-adjustment you rebuilt in the first five grounds gets stress-tested at once — and the Initiative won’t clear you for the mountain until your profile says you’re ready. Cold is honest.',
    unlock: { requiresZone: 'surfPier', prqGate: 55 },
    position: { x: 86, y: 62 },
    accent: '#93c5fd',
    rail: [
      {
        title: 'Edge Control',
        description: 'Carve the groomed line — clean edges, no washouts.',
        targetScore: 550,
      },
      {
        title: 'Through the Trees',
        description: 'Tight-line the glades. Decisions at speed, one after another.',
        targetScore: 770,
      },
      {
        title: 'Park Laps',
        description: 'Hit the park features and land everything you start.',
        targetScore: 990,
      },
    ],
    boss: {
      title: 'Summit Run',
      description: 'Top to bottom, one run, everything on the line and ice underneath.',
      targetScore: 1350,
      badgeName: 'Cold Honest',
      badgeDescription: 'Summit run cleared above the PRQ line.',
    },
  }),

  defineZone({
    id: 'golfGreen',
    title: 'The Golf Green',
    mode: 'golf',
    act: 2,
    narrative:
      'After the mountain, the Initiative slows your heart rate on purpose. The green measures the opposite athlete: stillness, breath, and a swing that repeats when nothing external forces it to. Mara calls this ground the lie detector.',
    unlock: { requiresZone: 'snowSlope' },
    position: { x: 76, y: 44 },
    accent: '#4ade80',
    rail: [
      {
        title: 'Tempo Work',
        description: 'Range session — same swing, every time, on camera.',
        targetScore: 560,
      },
      {
        title: 'Short Game',
        description: 'Chips and putts. Precision when there’s nothing to muscle through.',
        targetScore: 780,
      },
      {
        title: 'Pressure Putts',
        description: 'Every putt streak-scored. Miss one and the meter resets.',
        targetScore: 1000,
      },
    ],
    boss: {
      title: 'The Lie Detector',
      description: 'A full scored round with Mara walking every hole beside you.',
      targetScore: 1380,
      badgeName: 'Still Hands',
      badgeDescription: 'Passed the lie detector at full stillness.',
    },
  }),

  defineZone({
    id: 'diamond',
    title: 'The Diamond',
    mode: 'baseball',
    act: 2,
    narrative:
      'The diamond deals in milliseconds. A swing decision lives and dies inside a window thinner than a heartbeat, and the Initiative’s high-speed rigs will time yours to the frame. This is where rebuilt mechanics either become reflex or get exposed.',
    unlock: { requiresZone: 'golfGreen' },
    position: { x: 60, y: 32 },
    accent: '#fb923c',
    rail: [
      {
        title: 'Cage Work',
        description: 'Batting cage ladder — rising speeds, shrinking windows.',
        targetScore: 580,
      },
      {
        title: 'Reading Spin',
        description: 'Mixed pitches. Decide late, swing on time.',
        targetScore: 800,
      },
      {
        title: 'Two-Strike Life',
        description: 'Every at-bat starts 0-2. Survive the disadvantage.',
        targetScore: 1020,
      },
    ],
    boss: {
      title: 'The Frame Test',
      description: 'Face the rig at full velocity. Reflex or exposure — the film decides.',
      targetScore: 1420,
      badgeName: 'Millisecond Window',
      badgeDescription: 'Timed to the frame and cleared.',
    },
  }),

  defineZone({
    id: 'gridiron',
    title: 'The Gridiron',
    mode: 'football',
    act: 2,
    narrative:
      'Everything before this was solo. The gridiron adds contact, chaos, and ten other bodies moving at once — reads under pressure, with consequences that hit back. The Initiative gates this ground hard; broken athletes don’t get rebuilt twice.',
    unlock: { requiresZone: 'diamond', prqGate: 60 },
    position: { x: 44, y: 40 },
    accent: '#e879f9',
    rail: [
      {
        title: 'Route Tree',
        description: 'Run the full tree — crisp cuts, exact depths, catchable separation.',
        targetScore: 600,
      },
      {
        title: 'Traffic Reads',
        description: 'Make the catch in coverage. Eyes through the chaos.',
        targetScore: 830,
      },
      {
        title: 'Fourth and Inches',
        description: 'Short-yardage gauntlet. Win the collision math.',
        targetScore: 1060,
      },
    ],
    boss: {
      title: 'Two-Minute Drill',
      description: 'Down late with no timeouts. Execute the whole rebuild at once, under the clock.',
      targetScore: 1450,
      badgeName: 'Pressure Reads',
      badgeDescription: 'Drove the field with the clock dying.',
    },
  }),

  defineZone({
    id: 'pitch',
    title: 'The Pitch',
    mode: 'soccer',
    act: 3,
    narrative:
      'Act three opens on the biggest field in the program. Ninety minutes of decisions, most of them off the ball — the pitch grades your engine and your vision in the same breath. Mara stops taking notes here; the numbers speak for themselves now.',
    unlock: { requiresZone: 'gridiron' },
    position: { x: 28, y: 30 },
    accent: '#2dd4bf',
    rail: [
      {
        title: 'First Touch, Again',
        description: 'Possession work — receive, turn, release, repeat under pressure.',
        targetScore: 620,
      },
      {
        title: 'Final Third',
        description: 'Create and finish. Chances are scored on quality, not volume.',
        targetScore: 850,
      },
      {
        title: 'Full Ninety',
        description: 'Hold your standard for the whole match. The last ten minutes are the exam.',
        targetScore: 1080,
      },
    ],
    boss: {
      title: 'The Decider',
      description: 'Knockout match. One game, one result, everything you’ve rebuilt on the line.',
      targetScore: 1480,
      badgeName: 'Ninety-Minute Engine',
      badgeDescription: 'Held the standard for the full ninety.',
    },
  }),

  defineZone({
    id: 'tennis',
    title: 'The Tennis Court',
    mode: 'tennis',
    act: 3,
    narrative:
      'The loneliest ground in the Initiative. No teammates, no substitutions, no clock to save you — just you, an opponent, and a scoreboard that resets to zero every game. The court finds out what you say to yourself between points.',
    unlock: { requiresZone: 'pitch' },
    position: { x: 16, y: 44 },
    accent: '#facc15',
    rail: [
      {
        title: 'Serve Ritual',
        description: 'Hold serve behind a repeatable ritual. Same toss, same breath, same result.',
        targetScore: 640,
      },
      {
        title: 'Grind Rally',
        description: 'Win the long points. Outlast, then strike.',
        targetScore: 870,
      },
      {
        title: 'Break Point Nerve',
        description: 'Every scored point is a break point. Play the big moments only.',
        targetScore: 1100,
      },
    ],
    boss: {
      title: 'The Fifth Set',
      description: 'Deep in the decider against the Initiative’s best. Between points is the match.',
      targetScore: 1500,
      badgeName: 'Solitary Duel',
      badgeDescription: 'Won the conversation between points.',
    },
  }),

  defineZone({
    id: 'gymDome',
    title: 'The Gym Dome',
    mode: 'fitness',
    act: 3,
    narrative:
      'The engine room. Before the Lab will take you, the Dome audits everything — output, recovery, mechanics, and whether you actually did the classroom work or just the sweating. Twelve grounds built the athlete; the Dome certifies one.',
    unlock: { requiresZone: 'tennis', prqGate: 70, lessonGate: 6 },
    position: { x: 30, y: 58 },
    accent: '#f472b6',
    rail: [
      {
        title: 'Output Audit',
        description: 'Max-effort circuit. The sensors log everything; leave nothing unlogged.',
        targetScore: 660,
      },
      {
        title: 'Recovery Protocol',
        description: 'Repeat efforts on short rest — the Dome scores the second effort, not the first.',
        targetScore: 890,
      },
      {
        title: 'Mechanics Under Fatigue',
        description: 'Technique holds or it doesn’t. Prove it on tired legs.',
        targetScore: 1120,
      },
    ],
    boss: {
      title: 'Certification Day',
      description: 'The full battery, back to back, one session. Pass and the Lab doors open.',
      targetScore: 1550,
      badgeName: 'Certified Engine',
      badgeDescription: 'Full-battery certification, one session.',
    },
  }),

  defineZone({
    id: 'labHub',
    title: 'The Lab',
    mode: 'skilllab',
    act: 3,
    narrative:
      'The Nexus trials, and the reason Mara found you on that blacktop. Inside the Lab waits the Benchmark — a data-ghost built from your own peak numbers, every stat from before the fall, running your old game back at you. You don’t beat your past by matching it. You beat it by being someone it never met.',
    unlock: { requiresZone: 'gymDome', prqGate: 75 },
    position: { x: 48, y: 54 },
    accent: '#22d3ee',
    rail: [
      {
        title: 'Calibration Trial',
        description: 'The Lab syncs to your profile. Post a baseline worth measuring against.',
        targetScore: 700,
      },
      {
        title: 'Ghost Data',
        description: 'Race your old splits. The Benchmark is watching from behind the glass.',
        targetScore: 950,
      },
      {
        title: 'Threshold Trial',
        description: 'The final gate before the trial floor. No retries logged below the line.',
        targetScore: 1180,
      },
    ],
    boss: {
      title: 'The Benchmark',
      description: 'Your peak self, in data form, on the trial floor. Surpass the athlete you were.',
      targetScore: 1650,
      badgeName: 'Final Evolution',
      badgeDescription: 'Surpassed the Benchmark. The Initiative is complete.',
    },
  }),
];

export const CAMPAIGN: StoryCampaign = {
  id: 'nexus-initiative',
  title: 'The Nexus Initiative',
  tagline: 'Thirteen grounds. One athlete, rebuilt.',
  zones: ZONES,
};

// ---------------------------------------------------------------------------
// Lookups (precomputed, O(1) at request time)
// ---------------------------------------------------------------------------

const ZONE_BY_ID: ReadonlyMap<ZoneId, StoryZone> = new Map(
  ZONES.map((z) => [z.id, z]),
);

const ALL_NODES: readonly StoryNode[] = ZONES.flatMap((z) => [...z.rail, z.boss]);

const NODE_BY_ID: ReadonlyMap<string, StoryNode> = new Map(
  ALL_NODES.map((n) => [n.id, n]),
);

export function getZoneById(id: ZoneId): StoryZone {
  const zone = ZONE_BY_ID.get(id);
  if (!zone) {
    // Unreachable given the ZoneId union, but keeps strict narrowing honest.
    throw new Error(`Unknown story zone: ${id}`);
  }
  return zone;
}

export function getNodeById(id: string): StoryNode | null {
  return NODE_BY_ID.get(id) ?? null;
}

export function getAllNodes(): readonly StoryNode[] {
  return ALL_NODES;
}

export const TOTAL_NODE_COUNT = ALL_NODES.length; // 52
