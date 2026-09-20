#!/usr/bin/env -S npx tsx
// Seed the coaching loop on the DEV database (SPEC-PASSION-PIPELINES lane 1): a CERTIFIED coach, a client, three program
// exercises, and an active GoalPlan whose CoachingProgram has 2 blocks × 2 sessions × 2 prescribed exercises. Idempotent —
// re-running re-asserts the passwords and leaves existing rows alone. Refuses to run in production. No deletes.
//
//   npx tsx scripts/coach/seed-loop.ts
//
// Accounts (override with COACH_EMAIL / CLIENT_EMAIL / COACH_PASSWORD / CLIENT_PASSWORD):
//   coach@fel.local  / coach-local-only      client@fel.local / client-local-only
import { readFileSync, existsSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@/public/_prisma/client';
import { requiredModules, CURRICULUM_VERSION } from '../../lib/curriculum/blueprint';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m || process.env[m[1]]) continue;
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}
if (process.env.NODE_ENV === 'production') { console.error('refusing to seed the coaching loop in production'); process.exit(1); }

const COACH_EMAIL = process.env.COACH_EMAIL ?? 'coach@fel.local', COACH_PASSWORD = process.env.COACH_PASSWORD ?? 'coach-local-only';
const CLIENT_EMAIL = process.env.CLIENT_EMAIL ?? 'client@fel.local', CLIENT_PASSWORD = process.env.CLIENT_PASSWORD ?? 'client-local-only';
const prisma = new PrismaClient();

async function ensureUser(email: string, password: string, name: string) {
  const hash = await bcrypt.hash(password, 10);
  const u = await prisma.user.upsert({ where: { email }, update: { password: hash }, create: { email, password: hash, name } });
  return u;
}

async function main(): Promise<void> {
  const coach = await ensureUser(COACH_EMAIL, COACH_PASSWORD, 'Coach Seed');
  const client = await ensureUser(CLIENT_EMAIL, CLIENT_PASSWORD, 'Client Seed');

  // the coach passes every required module of the current curriculum → certified (the Facilitator Card flips in the app's recompute)
  for (const ref of requiredModules()) {
    const [trackKey, moduleKey] = ref.split('/');
    const existing = await prisma.credential.findFirst({ where: { userId: coach.id, trackKey, moduleKey, curriculumVersion: CURRICULUM_VERSION } });
    if (!existing) await prisma.credential.create({ data: { userId: coach.id, trackKey, moduleKey, curriculumVersion: CURRICULUM_VERSION, score: 100, passMark: 80, passed: true, answers: [] } });
  }
  const fac = await prisma.facilitatorProfile.upsert({
    where: { userId: coach.id },
    update: { certificationStatus: 'certified', certifiedAt: new Date(), curriculumVersion: CURRICULUM_VERSION, revokedAt: null },
    create: { userId: coach.id, certificationStatus: 'certified', certifiedAt: new Date(), curriculumVersion: CURRICULUM_VERSION, bio: 'Seeded coach for the loop.' },
  });

  const EXERCISES = [
    { name: 'Goblet Squat', category: 'lower-body', primaryCues: ['chest tall', 'knees track toes', 'drive the floor away'], defaultTempo: '3-1-1-0' },
    { name: 'Single-Leg Pogo Hops', category: 'plyometric', primaryCues: ['stiff ankle', 'quick ground contact', 'quiet landing'], defaultTempo: '1-0-1-0' },
    { name: 'Free Throws (ones)', category: 'skill', primaryCues: ['same routine every rep', 'eyes on the back of the rim', 'hold the follow-through'], defaultTempo: '0-0-0-0' },
  ];
  const ex: { id: string }[] = [];
  for (const e of EXERCISES) ex.push(await prisma.programExercise.upsert({ where: { name: e.name }, update: {}, create: { coachId: coach.id, ...e } }));

  let program = await prisma.coachingProgram.findFirst({ where: { coachId: coach.id, clientId: client.id, name: 'Seed: Vertical block' } });
  if (!program) {
    program = await prisma.coachingProgram.create({
      data: {
        coachId: coach.id, clientId: client.id, name: 'Seed: Vertical block', startDate: new Date(), durationWeeks: 2,
        blocks: { create: [1, 2].map((w) => ({
          order: w, label: `Week ${w}`, targetDate: new Date(Date.now() + w * 7 * 86400000),
          sessions: { create: [1, 2].map((d) => ({
            order: d, label: d === 1 ? 'Day 1 — Lower + hops' : 'Day 2 — Skill reps',
            exercises: { create: d === 1
              ? [{ order: 1, exerciseId: ex[0].id, sets: 3, reps: '8', load: 'RPE7', tempo: '3-1-1-0', restSeconds: 90, coachNote: 'Own the bottom position.' }, { order: 2, exerciseId: ex[1].id, sets: 3, reps: '10', load: 'body', tempo: '1-0-1-0', restSeconds: 60 }]
              : [{ order: 1, exerciseId: ex[2].id, sets: 5, reps: '10', load: 'game ball', tempo: '0-0-0-0', restSeconds: 45, coachNote: 'Log makes out of 10 as reps.' }, { order: 2, exerciseId: ex[0].id, sets: 2, reps: '6', load: 'RPE6', tempo: '3-1-1-0', restSeconds: 90 }] },
          })) },
        })) },
      },
    });
    await prisma.goalPlan.create({ data: { menteeId: client.id, facilitatorUserId: coach.id, facilitatorId: fac.id, goalText: 'Dunk on a 10-foot rim by winter — and know how to run a plan through a stall.', tags: ['vertical', 'basketball'], status: 'active', programId: program.id, linkedModuleKeys: [], curriculumVersion: CURRICULUM_VERSION, lockedAt: new Date() } });
  }
  const tree = await prisma.coachingProgram.findUnique({ where: { id: program.id }, include: { blocks: { include: { sessions: { include: { exercises: true } } } } } });
  console.log(JSON.stringify({ coach: coach.email, client: client.email, certified: fac.certificationStatus, programId: program.id, blocks: tree?.blocks.length, sessions: tree?.blocks.reduce((n, b) => n + b.sessions.length, 0), prescribed: tree?.blocks.reduce((n, b) => n + b.sessions.reduce((m, s) => m + s.exercises.length, 0), 0) }));
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
