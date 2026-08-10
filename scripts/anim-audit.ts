#!/usr/bin/env -S yarn tsx
/**
 * scripts/anim-audit.ts — Phase 1 deliverable A: Animation Binding Audit.
 *
 * For every character GLB the app ships, emit:
 *   - skeleton name proxy (file) + bone count + full bone list
 *   - every animation: channel count, target node paths, per-target
 *     resolves-against-skeleton boolean, frame count, fps, duration
 *   - skeleton vs morphTargets flag
 *   - per-clip motion fingerprint for a probe bone (proves distinct motion,
 *     not bind-pose duplicates)
 *
 * Output:
 *   1. human-readable console table
 *   2. JSON artifact at public/anim-audit/report.json (inside project, isolated
 *      from app code; served statically so /dev/anim can fetch it)
 *
 * Run:  yarn tsx scripts/anim-audit.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { inspectGlb, boneMotionRange, type GlbReport } from '../lib/anim/glb-inspect';

const ROOT = path.resolve(__dirname, '..');
const MODELS = path.join(ROOT, 'public', 'models');

// Character rigs the app loads. Primary hero first.
const CHARACTER_GLBS: { file: string; label: string; primary?: boolean }[] = [
  { file: path.join(MODELS, 'elijah-hero.glb'), label: 'elijah-hero.glb', primary: true },
  { file: path.join(MODELS, 'elijah.glb'), label: 'elijah.glb' },
];

// Probe bone used for the motion fingerprint (right arm moves in most strikes).
const PROBE_BONE = 'RightForeArm';

function line(char = '=', n = 72) {
  return char.repeat(n);
}

function printReport(r: GlbReport, motion: Record<string, number>) {
  console.log(`\n${line()}`);
  console.log(`FILE: ${r.file}`);
  console.log(line('-'));
  console.log(`  nodes=${r.nodeCount}  skins=${r.skinCount}  skeletonJoints=${r.skeletonJointCount}  morphTargets=${r.hasMorphTargets}`);
  console.log(`  bones (${r.boneList.length}): ${r.boneList.join(', ')}`);
  console.log(`  animations: ${r.animationCount}`);
  console.log(
    `  ${'clip'.padEnd(16)}${'chan'.padStart(5)}${'targets'.padStart(9)}${'unbound'.padStart(9)}${'frames'.padStart(8)}${'fps'.padStart(5)}${'dur(s)'.padStart(9)}${'probeMove'.padStart(11)}`,
  );
  for (const a of r.animations) {
    const mv = motion[a.name];
    const mvLabel = mv === undefined ? '-' : mv < 0 ? 'no-chan' : mv.toFixed(3);
    console.log(
      `  ${a.name.padEnd(16)}${String(a.channelCount).padStart(5)}${String(a.targetNodes.length).padStart(9)}${String(a.unresolvedTargets.length).padStart(9)}${String(a.frameCount).padStart(8)}${String(a.fps).padStart(5)}${String(a.duration).padStart(9)}${mvLabel.padStart(11)}`,
    );
    if (a.unresolvedTargets.length) {
      console.log(`      ⚠ UNBOUND targets: ${a.unresolvedTargets.join(', ')}`);
    }
  }
}

function main() {
  const reports: (GlbReport & { probeBone: string; probeMotion: Record<string, number> })[] = [];
  let totalUnbound = 0;

  for (const c of CHARACTER_GLBS) {
    if (!fs.existsSync(c.file)) {
      console.warn(`⚠ missing: ${c.label}`);
      continue;
    }
    const r = inspectGlb(c.file, c.label);
    const motion = boneMotionRange(c.file, PROBE_BONE);
    printReport(r, motion);
    for (const a of r.animations) totalUnbound += a.unresolvedTargets.length;
    reports.push({ ...r, probeBone: PROBE_BONE, probeMotion: motion });
  }

  const outDir = path.join(ROOT, 'public', 'anim-audit');
  fs.mkdirSync(outDir, { recursive: true });
  const artifact = {
    generatedAt: new Date().toISOString(),
    probeBone: PROBE_BONE,
    totalUnboundTargets: totalUnbound,
    characters: reports,
  };
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(artifact, null, 2));

  console.log(`\n${line()}`);
  console.log(`AUDIT COMPLETE — ${reports.length} character rig(s), total unbound targets: ${totalUnbound}`);
  console.log(`Artifact: public/anim-audit/report.json`);
  console.log(line());

  // Acceptance signal: primary character must have zero unbound targets.
  const primary = reports.find((r) => CHARACTER_GLBS.find((c) => c.label === r.file)?.primary);
  if (primary) {
    const primUnbound = primary.animations.reduce((s, a) => s + a.unresolvedTargets.length, 0);
    if (primUnbound > 0) {
      console.error(`❌ primary rig ${primary.file} has ${primUnbound} unbound targets`);
      process.exit(1);
    }
  }
}

main();
