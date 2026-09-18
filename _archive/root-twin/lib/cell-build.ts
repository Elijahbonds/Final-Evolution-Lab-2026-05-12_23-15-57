/**
 * CELL multi-file build orchestrator + cost engine (Phase 1 + Phase 2).
 *
 * Builder lanes emit FILE OPERATIONS against a virtual file system (ProjectFile
 * rows). Phase 2 adds: model registry routing (user keys → direct providers, else
 * Abacus), cheapest-capable model per job with an escalation ladder on failure,
 * a content-hash lane cache (unchanged completed lanes are never re-run), context
 * packing (builder declares needed files in a cheap micro-call, hard token cap),
 * per-lane token/$ usage logging, and a graceful per-build budget cap.
 */
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import {
  FILE_BUILDER_SYSTEM,
  FILE_CRITIC_SYSTEM,
  SUMMARIZER_SYSTEM,
  type BuildPlan,
  type BuildPlanLane,
} from '@/lib/cell-engine';
import {
  parseFileOps,
  bundleFiles,
  sha256,
  validateBundle,
  type FileOp,
  type ProjectFileLite,
  type ValidationReport,
} from '@/lib/cell-files';
import { callModel, type PMessage } from '@/lib/cell-providers';
import {
  resolveModel,
  maxEscalation,
  costOf,
  type Provider,
  type Role,
} from '@/lib/cell-models';
import {
  assertContentAllowed,
  type CompliancePolicy,
} from '@/lib/cell-compliance';
import { decryptSecret } from '@/lib/cell-crypto';

// ── Context packing caps ──
const MAX_CONTEXT_FILES = 3;
const MAX_FILE_CHARS = 4000;
const MAX_CONTEXT_CHARS = 12000;

export async function loadFiles(projectId: string): Promise<ProjectFileLite[]> {
  const rows = await prisma.projectFile.findMany({ where: { projectId }, orderBy: { path: 'asc' } });
  return rows.map((r) => ({ path: r.path, content: r.content, kind: r.kind }));
}

/** Apply a set of file operations to the DB. Returns the changed code paths. */
export async function applyOps(projectId: string, ops: FileOp[]): Promise<string[]> {
  const changed: string[] = [];
  for (const op of ops) {
    if (!op.path) continue;
    if (op.action === 'delete') {
      await prisma.projectFile.deleteMany({ where: { projectId, path: op.path } });
      continue;
    }
    const content = op.content ?? '';
    const hash = sha256(content);
    await prisma.projectFile.upsert({
      where: { projectId_path: { projectId, path: op.path } },
      create: { projectId, path: op.path, content, kind: 'code', contentHash: hash },
      update: { content, contentHash: hash },
    });
    changed.push(op.path);
  }
  return changed;
}

/** Cheap one-line summaries for changed files (single summarizer call). */
export async function summarizeFiles(
  projectId: string,
  files: ProjectFileLite[],
  changed: string[],
  ctx?: BuildCtx
) {
  const targets = files.filter((f) => changed.includes(f.path));
  if (!targets.length) return;
  try {
    const payload = targets
      .map((f) => `FILE: ${f.path}\n${(f.content || '').slice(0, 700)}`)
      .join('\n\n---\n\n')
      .slice(0, 12000);
    const messages: PMessage[] = [
      { role: 'system', content: SUMMARIZER_SYSTEM },
      { role: 'user', content: payload },
    ];
    let res: string;
    if (ctx) {
      res = (await runLLM(ctx, { role: 'summarizer', messages, jsonMode: true, maxTokens: 700 })).content;
    } else {
      // standalone (e.g. single-file regen without a cost context)
      const m = resolveModel('summarizer', { haveKeys: new Set() });
      res = (await callModel({ provider: m.provider, model: m.callId, messages, jsonMode: true, maxTokens: 700 })).content;
    }
    const parsed = JSON.parse(res || '{}');
    const summaries = parsed?.summaries || {};
    for (const path of Object.keys(summaries)) {
      const summary = String(summaries[path] || '').slice(0, 200);
      if (!summary) continue;
      await prisma.projectFile.updateMany({ where: { projectId, path }, data: { summary } });
    }
  } catch {
    // summaries are best-effort
  }
}

function manifestText(files: ProjectFileLite[], summaries: Record<string, string>): string {
  if (!files.length) return '(empty project)';
  return files.map((f) => `- ${f.path}${summaries[f.path] ? ` — ${summaries[f.path]}` : ''}`).join('\n');
}

// ── Cost engine context ─────────────────────────────────────

export interface BuildCtx {
  projectId: string;
  buildId: string;
  haveKeys: Set<Provider>;
  keys: Partial<Record<Provider, string>>;
  preferCheap: boolean;
  budgetUsd: number; // 0 = no cap
  spentUsd: number;
  escalations: number;
  /** Optional compliance policy forwarded to every callModel invocation. */
  compliance?: CompliancePolicy;
}

/** Load a cost context: user's decrypted keys, settings, fresh buildId. */
export async function loadBuildContext(projectId: string, userId: string | null): Promise<BuildCtx> {
  const ctx: BuildCtx = {
    projectId,
    buildId: crypto.randomUUID(),
    haveKeys: new Set<Provider>(),
    keys: {},
    preferCheap: true,
    budgetUsd: 0,
    spentUsd: 0,
    escalations: 0,
  };
  if (!userId) return ctx;
  try {
    const [keys, settings] = await Promise.all([
      prisma.cellApiKey.findMany({ where: { userId } }),
      prisma.cellSettings.findUnique({ where: { userId } }),
    ]);
    for (const k of keys) {
      const plain = decryptSecret(k.keyCipher);
      if (plain) {
        ctx.keys[k.provider as Provider] = plain;
        ctx.haveKeys.add(k.provider as Provider);
      }
    }
    if (settings) {
      ctx.budgetUsd = settings.budgetUsd || 0;
      ctx.preferCheap = settings.preferCheap;
    }
  } catch {
    // fall back to Abacus routing
  }
  return ctx;
}

export function overBudget(ctx: BuildCtx): boolean {
  return ctx.budgetUsd > 0 && ctx.spentUsd >= ctx.budgetUsd;
}

/**
 * Resolve + call a model for a role, log usage, and accumulate cost.
 * `escalation` climbs the role's ladder to a stronger (pricier) model.
 */
export async function runLLM(
  ctx: BuildCtx,
  opts: {
    role: Role;
    messages: PMessage[];
    jsonMode?: boolean;
    maxTokens?: number;
    escalation?: number;
    laneId?: string;
    laneTitle?: string;
  }
): Promise<{ content: string; costUsd: number; escalated: boolean; model: string; provider: Provider }> {
  const escalation = opts.escalation ?? 0;
  const m = resolveModel(opts.role, { haveKeys: ctx.haveKeys, escalation, preferCheap: ctx.preferCheap });
  const apiKey = m.viaAbacus ? undefined : ctx.keys[m.provider];
  // M6 Phase 3: content denylist check before calling the provider.
  const promptBody = opts.messages.map((msg) => msg.content).join('\n');
  assertContentAllowed(m.provider, promptBody);

  const result = await callModel({
    provider: m.provider,
    model: m.callId,
    messages: opts.messages,
    jsonMode: opts.jsonMode,
    maxTokens: opts.maxTokens,
    apiKey,
    compliance: ctx.compliance,
  });
  const costUsd = costOf(m, result.inputTokens, result.outputTokens);
  ctx.spentUsd += costUsd;
  const escalated = escalation > 0;
  if (escalated) ctx.escalations += 1;
  // log usage (best-effort)
  try {
    await prisma.cellUsage.create({
      data: {
        projectId: ctx.projectId,
        buildId: ctx.buildId,
        laneId: opts.laneId || '',
        laneTitle: opts.laneTitle || '',
        role: opts.role,
        provider: m.provider,
        model: m.label,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd,
        escalated,
      },
    });
  } catch {}
  return { content: result.content, costUsd, escalated, model: m.label, provider: m.provider };
}

// ── Lane spec hashing (content-hash lane cache) ──────────────

function laneSpecHash(lane: BuildPlanLane): string {
  return sha256(
    JSON.stringify({
      id: lane.id,
      title: lane.title,
      description: lane.description,
      role: lane.role,
      deps: [...(lane.dependencies || [])].sort(),
    })
  );
}

// ── Context packing ──────────────────────────────────────────

/**
 * Decide which existing files the builder needs to see in FULL. A cheap micro-call
 * asks the model to name paths from the manifest; falls back to a keyword heuristic.
 */
async function pickNeededPaths(
  ctx: BuildCtx,
  files: ProjectFileLite[],
  summaries: Record<string, string>,
  lane: BuildPlanLane
): Promise<string[]> {
  if (!files.length) return [];
  const manifest = manifestText(files, summaries);
  // heuristic baseline
  const words = `${lane.title} ${lane.description}`.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const heuristic = files
    .map((f) => {
      let score = 0;
      const hay = f.path.toLowerCase();
      for (const w of words) if (hay.includes(w)) score += 2;
      if (f.path === 'index.html') score += 1;
      return { p: f.path, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);

  try {
    const res = await runLLM(ctx, {
      role: 'summarizer',
      jsonMode: true,
      maxTokens: 200,
      laneId: lane.id,
      laneTitle: `${lane.title} (context)`,
      messages: [
        {
          role: 'system',
          content:
            'You pick which existing files a coding task needs to READ in full. Respond ONLY as JSON {"paths":["a","b"]}. Pick at most 3, fewest that suffice. Empty if none needed.',
        },
        {
          role: 'user',
          content: `FILE MANIFEST:\n${manifest}\n\nTASK: ${lane.title} — ${lane.description}\n\nWhich files must be read in full?`,
        },
      ],
    });
    const parsed = JSON.parse(res.content || '{}');
    const picked: string[] = Array.isArray(parsed?.paths) ? parsed.paths.map((p: any) => String(p)) : [];
    const valid = picked.filter((p) => files.some((f) => f.path === p));
    const merged = [...new Set([...valid, ...heuristic])];
    return merged.slice(0, MAX_CONTEXT_FILES);
  } catch {
    return heuristic.slice(0, MAX_CONTEXT_FILES);
  }
}

function packContext(files: ProjectFileLite[], paths: string[]): string {
  if (!paths.length) return '(no existing files needed — create what your lane requires)';
  let total = 0;
  const parts: string[] = [];
  for (const p of paths) {
    const f = files.find((x) => x.path === p);
    if (!f) continue;
    const slice = (f.content || '').slice(0, MAX_FILE_CHARS);
    if (total + slice.length > MAX_CONTEXT_CHARS) break;
    total += slice.length;
    parts.push(`=== ${f.path} ===\n${slice}`);
  }
  return parts.join('\n\n') || '(context omitted for token budget)';
}

export interface BuildResult {
  success: boolean;
  html: string;
  fileCount: number;
  buildId: string;
  spentUsd: number;
  escalations: number;
  budgetHit: boolean;
  ranLanes: number;
  cachedLanes: number;
  /** Phase 3: acceptance check validation report (undefined if no checks). */
  validation?: ValidationReport;
  /** Phase 3: number of repair iterations attempted (0 if passed first time). */
  repairAttempts: number;
}

/**
 * Run the full multi-file build for a project against its stored BuildPlan.
 * Persists lane statuses (buildPlan JSON) and project.status incrementally.
 */
export async function runBuild(
  projectId: string,
  opts?: { critic?: boolean; userId?: string | null; force?: boolean }
): Promise<BuildResult> {
  const project = await prisma.cellProject.findUnique({ where: { id: projectId } });
  const ctx = await loadBuildContext(projectId, opts?.userId ?? null);
  const empty: BuildResult = {
    success: false, html: '', fileCount: 0, buildId: ctx.buildId,
    spentUsd: 0, escalations: 0, budgetHit: false, ranLanes: 0, cachedLanes: 0,
    repairAttempts: 0,
  };
  if (!project) return empty;

  let plan: BuildPlan | null = null;
  try {
    plan = JSON.parse(project.buildPlan || '');
  } catch {
    plan = null;
  }
  if (!plan || !Array.isArray(plan.lanes) || !plan.lanes.length) return empty;

  const summary = `${plan.projectTitle || project.title} — ${plan.genre || ''}. ${plan.summary || ''}`.trim();
  const originalRequest = project.prompt || summary;

  // ── Content-hash lane cache: keep completed lanes whose spec is unchanged ──
  const done = new Set<string>();
  let cachedLanes = 0;
  for (const lane of plan.lanes) {
    const specHash = laneSpecHash(lane);
    const cacheable =
      !opts?.force && lane.role !== 'critic' && lane.status === 'done' && (lane as any).hash === specHash;
    (lane as any).hash = specHash;
    if (cacheable) {
      done.add(lane.id);
      cachedLanes += 1;
    } else if (lane.role !== 'critic') {
      lane.status = 'pending';
      lane.output = undefined;
    }
  }

  const persist = () =>
    prisma.cellProject.update({ where: { id: projectId }, data: { buildPlan: JSON.stringify(plan) } });
  await prisma.cellProject.update({
    where: { id: projectId },
    data: { status: 'building', buildPlan: JSON.stringify(plan) },
  });

  const builderLanes = plan.lanes.filter((l) => l.role !== 'critic');
  const criticLanes = plan.lanes.filter((l) => l.role === 'critic');
  const builderIds = new Set(builderLanes.map((l) => l.id));
  let ranLanes = 0;
  let budgetHit = false;

  const maxEsc = maxEscalation('builder');

  let safety = builderLanes.length + 3;
  while (done.size < builderLanes.length && safety-- > 0) {
    if (overBudget(ctx)) { budgetHit = true; break; }
    const ready = builderLanes.filter(
      (l) => !done.has(l.id) && (l.dependencies || []).every((d) => done.has(d) || !builderIds.has(d))
    );
    const batch = ready.length ? ready : builderLanes.filter((l) => !done.has(l.id));

    for (const lane of batch) {
      if (overBudget(ctx)) { budgetHit = true; break; }
      lane.status = 'running';
      await persist();

      let ok = false;
      let escalation = 0;
      while (!ok) {
        try {
          const files = await loadFiles(projectId);
          const summaries: Record<string, string> = {};
          const rows = await prisma.projectFile.findMany({ where: { projectId }, select: { path: true, summary: true } });
          for (const r of rows) summaries[r.path] = r.summary;

          const needed = await pickNeededPaths(ctx, files, summaries, lane);
          const relText = packContext(files, needed);

          const res = await runLLM(ctx, {
            role: 'builder',
            escalation,
            maxTokens: 4000,
            laneId: lane.id,
            laneTitle: lane.title,
            messages: [
              { role: 'system', content: FILE_BUILDER_SYSTEM },
              {
                role: 'user',
                content: `PROJECT: ${summary}\nORIGINAL REQUEST: ${originalRequest}\n\nCURRENT FILES:\n${manifestText(
                  files,
                  summaries
                )}\n\nRELEVANT FILE CONTENTS:\n${relText}\n\nYOUR LANE: ${lane.title}\n${
                  lane.description
                }\n\nEmit the file operations for your lane now (JSON only).`,
              },
            ],
          });
          const ops = parseFileOps(res.content);
          const changed = await applyOps(projectId, ops);
          if (changed.length) {
            const after = await loadFiles(projectId);
            await summarizeFiles(projectId, after, changed, ctx);
            lane.output = `Wrote: ${changed.join(', ')}${res.escalated ? ' [escalated]' : ''}`.slice(0, 500);
            lane.status = 'done';
            ok = true;
          } else if (escalation < maxEsc && !overBudget(ctx)) {
            escalation += 1; // no ops → climb the ladder
          } else {
            lane.status = 'failed';
            lane.output = 'No file operations emitted after escalation.';
            break;
          }
        } catch (e: any) {
          if (escalation < maxEsc && !overBudget(ctx)) {
            escalation += 1;
          } else {
            lane.status = 'failed';
            lane.output = `Lane failed: ${e?.message || 'unknown error'}`;
            break;
          }
        }
      }
      ranLanes += 1;
      done.add(lane.id);
      await persist();
    }
    if (budgetHit) break;
  }

  // Mark any lanes we never reached (budget) as failed-with-note, keep completed.
  if (budgetHit) {
    for (const lane of builderLanes) {
      if (!done.has(lane.id)) {
        lane.status = 'failed';
        lane.output = 'Skipped: build budget cap reached.';
      }
    }
    await persist();
  }

  // ── Critic pass over the running bundle (skipped if over budget) ──
  // Skip the critic entirely on a fully-cached rebuild (nothing changed → near-zero cost).
  const nothingRebuilt = ranLanes === 0 && cachedLanes > 0 && !opts?.force;
  if (opts?.critic !== false && !budgetHit && !overBudget(ctx) && !nothingRebuilt) {
    for (const c of criticLanes) c.status = 'running';
    await persist();
    try {
      const files = await loadFiles(projectId);
      const bundle = bundleFiles(files);
      if (bundle && bundle.length > 150) {
        const summaries: Record<string, string> = {};
        const rows = await prisma.projectFile.findMany({ where: { projectId }, select: { path: true, summary: true } });
        for (const r of rows) summaries[r.path] = r.summary;
        const res = await runLLM(ctx, {
          role: 'critic',
          maxTokens: 6000,
          laneId: criticLanes[0]?.id || 'critic',
          laneTitle: 'Quality Gate',
          messages: [
            { role: 'system', content: FILE_CRITIC_SYSTEM },
            {
              role: 'user',
              content: `PROJECT: ${summary}\n\nFILE MANIFEST:\n${manifestText(
                files,
                summaries
              )}\n\nRUNNABLE BUNDLE (assembled preview):\n${bundle.slice(
                0,
                24000
              )}\n\nEmit targeted fix operations (JSON only).`,
            },
          ],
        });
        const ops = parseFileOps(res.content);
        if (ops.length) {
          const changed = await applyOps(projectId, ops);
          const after = await loadFiles(projectId);
          await summarizeFiles(projectId, after, changed, ctx);
        }
      }
    } catch {
      // keep pre-critic files if critic fails
    }
    for (const c of criticLanes) c.status = 'done';
  } else if (budgetHit) {
    for (const c of criticLanes) {
      c.status = 'failed';
      c.output = 'Skipped: build budget cap reached.';
    }
  }

  let finalFiles = await loadFiles(projectId);
  let html = bundleFiles(finalFiles);
  const filePaths = finalFiles.map((f) => f.path);

  // ── Phase 3: self-verifying acceptance loop (≤2 repair iterations) ────
  const MAX_REPAIR = 2; // TUNE(elijah)
  let repairAttempts = 0;
  let validation: ValidationReport | undefined;

  if (!budgetHit && html && html.length > 150) {
    validation = validateBundle(html, filePaths, plan?.acceptanceChecks);

    while (!validation.passed && repairAttempts < MAX_REPAIR && !overBudget(ctx)) {
      repairAttempts += 1;
      const failureList = validation.failures
        .map((f) => `- [${f.checkId}] ${f.description}: ${f.detail}`)
        .join('\n');
      try {
        const summaries: Record<string, string> = {};
        const rows = await prisma.projectFile.findMany({ where: { projectId }, select: { path: true, summary: true } });
        for (const r of rows) summaries[r.path] = r.summary;

        const res = await runLLM(ctx, {
          role: 'critic',
          maxTokens: 6000,
          laneId: `repair-${repairAttempts}`,
          laneTitle: `Repair (attempt ${repairAttempts})`,
          messages: [
            { role: 'system', content: FILE_CRITIC_SYSTEM },
            {
              role: 'user',
              content: `The assembled build FAILED the following acceptance checks:\n${failureList}\n\nFILE MANIFEST:\n${manifestText(
                finalFiles,
                summaries
              )}\n\nRUNNABLE BUNDLE (first 24k chars):\n${html.slice(
                0,
                24000
              )}\n\nFix the failing checks. Emit ONLY the file operations needed.`,
            },
          ],
        });
        const ops = parseFileOps(res.content);
        if (ops.length) {
          const changed = await applyOps(projectId, ops);
          finalFiles = await loadFiles(projectId);
          await summarizeFiles(projectId, finalFiles, changed, ctx);
          html = bundleFiles(finalFiles);
          validation = validateBundle(html, finalFiles.map((f) => f.path), plan?.acceptanceChecks);
        } else {
          break; // critic emitted no ops — stop trying
        }
      } catch {
        break; // repair call failed — stop
      }
    }
  }

  const baseSuccess = !budgetHit && !!html && html.length > 150 && finalFiles.length > 0;
  const checksPass = !validation || validation.passed;
  const success = baseSuccess && checksPass;

  // Determine final status
  let finalStatus: string;
  if (success) finalStatus = 'ready';
  else if (budgetHit) finalStatus = 'needs-attention';
  else if (baseSuccess && !checksPass) finalStatus = 'needs-attention';
  else finalStatus = 'failed';

  await prisma.cellProject.update({
    where: { id: projectId },
    data: {
      buildPlan: JSON.stringify(plan),
      artifacts: JSON.stringify({
        html,
        fileCount: finalFiles.length,
        generatedAt: new Date().toISOString(),
        buildId: ctx.buildId,
        spentUsd: ctx.spentUsd,
        validation: validation ? { passed: validation.passed, total: validation.total, failures: validation.failures.length } : undefined,
      }),
      status: finalStatus,
    },
  });

  return {
    success,
    html,
    fileCount: finalFiles.length,
    buildId: ctx.buildId,
    spentUsd: ctx.spentUsd,
    escalations: ctx.escalations,
    budgetHit,
    ranLanes,
    cachedLanes,
    validation,
    repairAttempts,
  };
}
