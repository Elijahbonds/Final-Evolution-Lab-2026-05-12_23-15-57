import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { postLc } from '../lib/ledger';
import { GOLDEN_HOUR_REWARDS } from '../lib/season/golden-hour';

const prisma = new PrismaClient();

function randAttr() {
  return Math.round((40 + Math.random() * 30) * 10) / 10;
}

async function main() {
  const password = await bcrypt.hash('johndoe123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'john@doe.com' },
    update: {},
    create: {
      email: 'john@doe.com',
      name: 'John Doe',
      password,
      role: 'admin',
    },
  });

  const existing = await prisma.playerProfile.findUnique({ where: { userId: user.id } });
  if (!existing) {
    await prisma.playerProfile.create({
      data: {
        userId: user.id,
        strength: randAttr(),
        speed: randAttr(),
        endurance: randAttr(),
        agility: randAttr(),
        power: randAttr(),
        flexibility: randAttr(),
        recovery: randAttr(),
        mental: randAttr(),
        labCredits: 500,
      },
    });
    await postLc(prisma, { userId: user.id, amount: 500, reason: 'Welcome grant', balanceAfter: 500, dedupeKey: `welcome:${user.id}` });
  }
  // ─── Seed Exercise Knowledge Base ───
  const categories = [
    { name: 'Breath & Pressure', description: 'Diaphragmatic breathing, IAP, cavity coupling', sortOrder: 1 },
    { name: 'Postural Audit', description: 'Aston assessment, system scan protocols', sortOrder: 2 },
    { name: 'Foot & Ankle', description: 'Tripod, Windlass, ankle mobility, spring mechanics', sortOrder: 3 },
    { name: 'Hip Mobility', description: 'Active range conditioning, CARs, PAILs/RAILs', sortOrder: 4 },
    { name: 'Fascial Shearing', description: 'Fascial gliding, densification treatment, integration', sortOrder: 5 },
    { name: 'Oscillatory Drills', description: 'Pogos, bounce mechanics, SSC training', sortOrder: 6 },
    { name: 'Isometric Lockdowns', description: 'Overcoming isometrics, positional encoding', sortOrder: 7 },
    { name: 'Integrated Sets', description: 'Oscillate → Lock → Release → Reset', sortOrder: 8 },
    { name: 'Movement Snacks', description: 'Neural micro-dosing between sessions', sortOrder: 9 },
    { name: 'Neural Flush', description: 'Parasympathetic reset, recovery protocols', sortOrder: 10 },
    { name: 'Basketball Application', description: 'Court-specific power, rebounding, shooting', sortOrder: 11 },
    { name: 'Periodization', description: 'Annual plan, deload, ACWR management', sortOrder: 12 },
  ];

  const catMap: Record<string, string> = {};
  for (const c of categories) {
    const cat = await prisma.exerciseCategory.upsert({
      where: { name: c.name },
      update: { description: c.description, sortOrder: c.sortOrder },
      create: c,
    });
    catMap[c.name] = cat.id;
  }

  const exercises = [
    // Phase 1: System Scan
    { name: 'Standing Oscillatory Breath Reset', slug: 'breath-reset', cat: 'Breath & Pressure', phase: 1, chapter: 1, level: 'foundation', stat: 'recovery', dosage: '3 rounds × 4 steps (~4 min)', cues: 'Audit breath (3 cycles) → Lateral expansion lock (5 cycles) → Oscillatory micro-bounce (20s) → Isometric ground lock (5s) → Release (3 breaths). Feel ribs expand laterally, not chest rising.', mistakes: 'Chest breathing instead of lateral rib expansion. Bouncing too high — should be a vibration, not a jump. Holding tension during release phase.', video: 'https://youtu.be/hrlGbS0r-hM' },
    { name: 'Aston Postural Audit', slug: 'aston-audit', cat: 'Postural Audit', phase: 1, chapter: 2, level: 'foundation', stat: 'mental', dosage: 'Full assessment (~15 min)', cues: 'Evaluate 3 volumes: cranial, thoracic, pelvic. Check head position relative to thorax. Assess rib cage position (flared/compressed). Note pelvic tilt direction and asymmetry. Always assess in 3D — not just sagittal plane.', mistakes: 'Evaluating in 2D only. Treating findings as primary dysfunction without tracing the chain. Skipping barefoot assessment.' },
    { name: 'Diaphragmatic Breath: 360° Expansion', slug: 'diaphragm-360', cat: 'Breath & Pressure', phase: 1, chapter: 3, level: 'foundation', stat: 'recovery', dosage: '5 min, 10 cycles', cues: 'Hands on lower ribs. Inhale through nose → push ribs INTO hands (lateral + posterior). Shoulders stay still. Exhale pursed lips, longer than inhale (4s in, 6s out). Feel rib cage compress on exhale.', mistakes: 'Belly-only breathing (anterior only, missing lateral/posterior). Shoulders elevating on inhale. Forcing the breath instead of letting it expand.' },
    { name: 'Crocodile Breathing', slug: 'crocodile-breathing', cat: 'Breath & Pressure', phase: 1, chapter: 3, level: 'foundation', stat: 'recovery', dosage: '3 min prone position', cues: 'Lie face-down, forehead on stacked hands. Floor blocks chest breathing — forces posterior expansion. 4s inhale, 6s exhale. Feel back rise toward ceiling. Add pelvic floor coupling after 10 cycles.', mistakes: 'Lifting head to breathe. Not relaxing between cycles. Skipping pelvic floor integration.' },

    // Phase 2: Hardware Calibration
    { name: 'Tripod Foot Activation', slug: 'tripod-foot', cat: 'Foot & Ankle', phase: 2, chapter: 5, level: 'foundation', stat: 'agility', dosage: '3 × 30s per foot', cues: 'Three points of contact: center heel, base of big toe, base of pinky toe. "Claw the floor" — actively press all three points. Screw feet outward (external rotation torque without moving). Feel arches lift.', mistakes: 'Gripping with toes instead of pressing tripod. Letting medial arch collapse. Forgetting to maintain during movement.', video: 'https://youtu.be/dAoLYThf1bc' },
    { name: 'Ankle Dorsiflexion CARs', slug: 'ankle-cars', cat: 'Foot & Ankle', phase: 2, chapter: 7, level: 'foundation', stat: 'agility', dosage: '3 × 5 per ankle', cues: 'Controlled Articular Rotations through full ankle ROM. Slow, deliberate circles at end range. Maximum neural drive into the rotation without compensation from the knee or hip.', mistakes: 'Moving too fast. Compensating with knee flexion. Not exploring full end range.' },
    { name: 'Hip CARs (90/90)', slug: 'hip-cars', cat: 'Hip Mobility', phase: 2, chapter: 6, level: 'foundation', stat: 'flexibility', dosage: '3 × 5 per hip', cues: 'Seated 90/90 position. Controlled rotation through full hip ROM. Keep pelvis stable — only the femur rotates. Maximum intent at end range.', mistakes: 'Allowing pelvis to shift or rotate. Rushing through the movement. Not maintaining core pressure.' },
    { name: 'Hip PAILs/RAILs', slug: 'hip-pails-rails', cat: 'Hip Mobility', phase: 2, chapter: 6, level: 'intermediate', stat: 'flexibility', dosage: '2 × 20s isometric per direction', cues: 'Progressive Angular Isometric Loading / Regressive Angular Isometric Loading. Hold stretch position 2 min. PAIL: push INTO stretch (20s ramp to max). RAIL: pull OUT of stretch (20s ramp to max). Expand usable range.', mistakes: 'Not holding long enough in passive stretch before isometrics. Less than maximal effort during isometric phases. Holding breath.' },
    { name: 'Fascial Shearing — IT Band', slug: 'fascial-it-band', cat: 'Fascial Shearing', phase: 2, chapter: 8, level: 'intermediate', stat: 'speed', dosage: '2 min per side', cues: 'Active shearing, NOT foam rolling. Target gliding between fascial layers. Restore mechanoreceptor function. Use cross-fiber technique at densification points. The goal is communication restoration, not pain.', mistakes: 'Using foam roller passively (insufficient depth). Bruising superficial tissue while missing deep adhesions. Treating it like stretching.' },

    // Phase 3: Physics of Flight
    { name: 'Single-Leg Pogo Hops', slug: 'single-leg-pogos', cat: 'Oscillatory Drills', phase: 3, chapter: 9, level: 'intermediate', stat: 'power', dosage: '4 × 8-12s per leg', cues: 'Rapid single-leg hops, MINIMAL ground contact time. Focus on STIFFNESS — ankle-foot complex = rigid lever. Heels barely leave ground. Think vibration, not jumping. Train the "pop" and "bounce".', mistakes: 'Spending too long on the ground (losing elastic energy). Soft ankle at contact. Letting heel sink.', video: 'https://youtu.be/q1HLjLbhS2s' },
    { name: 'Unilateral Hip Thrust Pogos', slug: 'hip-thrust-pogos', cat: 'Oscillatory Drills', phase: 3, chapter: 9, level: 'intermediate', stat: 'power', dosage: '4 × 8-12s per leg', cues: 'Single-leg hip thrust position (back on bench). Rapid small-amplitude bouncing of hips. Focus on speed and rhythm, NOT height. Train glute + hamstring oscillatory capacity.', mistakes: 'Bouncing too high (amplitude over frequency). Losing pelvic stability. Using bilateral when should be unilateral.' },
    { name: 'Two-Level Leg Press Oscillations', slug: 'leg-press-osc', cat: 'Oscillatory Drills', phase: 3, chapter: 9, level: 'advanced', stat: 'power', dosage: '3 × 10-15s', cues: 'Oscillate between 90° and 120° knee flexion at maximum speed. Drive platform away (throw) and absorb on return (catch). Two positions force CNS to regulate across joint angles.', mistakes: 'Not fully committing to speed. Pausing at either level. Letting knees cave inward.' },
    { name: '5-Second Overcoming Isometric', slug: 'overcoming-iso-5s', cat: 'Isometric Lockdowns', phase: 3, chapter: 9, level: 'intermediate', stat: 'strength', dosage: 'Immediately after oscillatory phase, 0s rest', cues: 'Push MAXIMALLY against immovable resistance for 5 seconds. This is not a hold — it is a LOCKDOWN. Every muscle irradiated with tension. Specific joint angle. Captures post-activation potentiation from oscillatory phase.', mistakes: 'Sub-maximal effort. Resting between oscillatory and isometric phases (must be immediate). Holding breath instead of bracing.' },
    { name: 'Integrated Set: Oscillate → Lock → Release', slug: 'integrated-set', cat: 'Integrated Sets', phase: 3, chapter: 9, level: 'intermediate', stat: 'power', dosage: '1 set = Osc 8-12s → Iso 5s → Release 10-15s', cues: 'Phase 1: Oscillatory pogos (max frequency, minimal amplitude). Phase 2: Immediate transition to overcoming isometric (5s max intent). Phase 3: Diaphragmatic breath cycle, parasympathetic reset. This is the ATOMIC UNIT of the Bonds Bounce Blueprint.', mistakes: 'Resting between phases. Low intensity on isometric. Skipping the release/reset phase.', video: 'https://youtu.be/pqyxTY85x4U' },

    // Movement Snacks
    { name: 'AM Pogo + Doorframe Push', slug: 'am-pogo-snack', cat: 'Movement Snacks', phase: 3, chapter: 10, level: 'foundation', stat: 'power', dosage: '10 pogos per leg + 3s doorframe push (90s total)', cues: 'Morning neural prime. 10 single-leg oscillatory pogos per leg, then 3-second doorframe isometric push. Maintains explosive motor pathways between sessions. This is not training — it is neural maintenance.', mistakes: 'Skipping it. Doing it with shoes on (barefoot preferred). Making it a workout instead of a micro-dose.' },
    { name: 'Noon Upper-Body Oscillation', slug: 'noon-osc-snack', cat: 'Movement Snacks', phase: 3, chapter: 10, level: 'foundation', stat: 'strength', dosage: '8 per arm + 5s overhead iso (2 min total)', cues: 'Before lunch. 8 unilateral overhead dumbbell oscillations per arm (10lb) + 5 seconds of isometric overhead hold. Maintains upper body neural pathways.', mistakes: 'Using too heavy a weight (this is neural, not strength). Rushing the isometric. Skipping because "it is too easy".' },

    // Neural Flush
    { name: 'Neural Flush — Supine Reset', slug: 'neural-flush-supine', cat: 'Neural Flush', phase: 5, chapter: 19, level: 'foundation', stat: 'recovery', dosage: '5 min', cues: 'Legs up wall (90-90). Phase 1: Gravitational decompression 90s. Phase 2: Extended exhale breathing 2 min (4s in, 8s out). Phase 3: Body scan audit 90s — note residual tension without trying to fix it.', mistakes: 'Checking phone during the protocol. Sitting up directly from supine (roll to side first). Rushing the body scan.' },
    { name: 'Neural Flush — Crocodile Full Reset', slug: 'neural-flush-croc', cat: 'Neural Flush', phase: 5, chapter: 19, level: 'intermediate', stat: 'recovery', dosage: '8 min', cues: 'Prone position. Phase 1: Settling 90s. Phase 2: Posterior expansion breathing 3 min with pelvic floor coupling. Phase 3: Prone body scan 2 min (feet to head). Phase 4: Final integration breath 90s (6s in, 10s out).', mistakes: 'Lifting head during prone position. Not adding pelvic floor coupling after initial cycles. Skipping the final integration breaths.' },

    // Phase 4: Basketball Application
    { name: 'Medicine Ball Vertical Toss', slug: 'med-ball-vert-toss', cat: 'Basketball Application', phase: 4, chapter: 17, level: 'intermediate', stat: 'power', dosage: '4 × 6 throws, 8-10lb ball', cues: 'Athletic Load Position stance, ball at chin height. Explosive vertical jump while throwing ball straight up at maximum height. "The ball is the rebound. Launch it higher than anyone can reach."', mistakes: 'Not using legs (arm-only throw). Landing off-balance. Not resetting Athletic Load Position between throws.', video: 'https://youtu.be/J037GG99GT0' },
    { name: 'Box-Out Positioning Drill', slug: 'box-out-drill', cat: 'Basketball Application', phase: 4, chapter: 17, level: 'intermediate', stat: 'strength', dosage: '10 possessions each role', cues: 'Locate → Contact → Establish base → Hold → Pursue → Secure. "Hit first. Widen fast. Hold the fort. Then go hunting." Maximize moment of inertia with wide base.', mistakes: 'Not making initial contact. Narrow base (easily displaced). Watching the ball instead of feeling the opponent.' },
  ];

  for (const ex of exercises) {
    const catId = catMap[ex.cat];
    if (!catId) { console.warn(`Category not found: ${ex.cat}`); continue; }
    await prisma.exercise.upsert({
      where: { slug: ex.slug },
      update: {
        name: ex.name, categoryId: catId, phase: ex.phase, chapter: ex.chapter,
        bounceLevel: ex.level, targetPrqStat: ex.stat, dosage: ex.dosage,
        coachingCues: ex.cues, commonMistakes: ex.mistakes || '',
        videoUrl: ex.video || '', published: true,
      },
      create: {
        name: ex.name, slug: ex.slug, categoryId: catId, phase: ex.phase, chapter: ex.chapter,
        bounceLevel: ex.level, targetPrqStat: ex.stat, dosage: ex.dosage,
        coachingCues: ex.cues, commonMistakes: ex.mistakes || '',
        videoUrl: ex.video || '', published: true,
      },
    });
  }
  console.log(`Seeded ${categories.length} categories, ${exercises.length} exercises`);

  // --- M13 Season 1: "Golden Hour" (Venice sunset) -------------------------
  // 8-week season, 50 tiers, FREE + PRO lanes. Rewards are DATA (cosmetics +
  // Lab Credits only — never stat items). The PRO lane stays purchase-flag
  // gated; seeding a season NEVER flips pricing or grants PRO for free.
  const now = new Date();
  const eightWeeks = new Date(now.getTime() + 56 * 24 * 60 * 60 * 1000);
  const season = await prisma.season.upsert({
    where: { key: 'S1' },
    update: {
      name: 'Golden Hour',
      theme: 'venice-sunset',
      tiers: 50,
      active: true,
      rewards: {
        note: 'Cosmetics + Lab Credits only. No stat items (M13/M14 firewall).',
        lanes: ['free', 'pro'],
        tiers: GOLDEN_HOUR_REWARDS,
      } as any,
    },
    create: {
      key: 'S1',
      name: 'Golden Hour',
      theme: 'venice-sunset',
      tiers: 50,
      active: true,
      startsAt: now,
      endsAt: eightWeeks,
      rewards: {
        note: 'Cosmetics + Lab Credits only. No stat items (M13/M14 firewall).',
        lanes: ['free', 'pro'],
        tiers: GOLDEN_HOUR_REWARDS,
      } as any,
    },
  });
  console.log(`Seeded Season: ${season.name} (${season.key}), active=${season.active}`);

  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
