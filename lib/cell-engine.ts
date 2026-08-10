/**
 * CELL — the AI engine for NEXUS Studio.
 *
 * Role-based LLM router:
 *   architect  → deep planning, long-horizon design (frontier model)
 *   builder    → parallel lane work (fast model)
 *   critic     → evaluation & quality gate (frontier model)
 *   summarizer → cheap summarization (small model)
 *
 * Roles map to models by config so providers can be swapped.
 */

// ── Model role mapping ────────────────────────────────────────────

export type CellRole = 'architect' | 'builder' | 'critic' | 'summarizer';

const ROLE_MODELS: Record<CellRole, string> = {
  architect: 'claude-fable-5',
  builder: 'gpt-5.4-mini',
  critic: 'claude-sonnet-5',
  summarizer: 'gpt-5.4-mini',
};

export function getModelForRole(role: CellRole): string {
  return ROLE_MODELS[role] ?? ROLE_MODELS.builder;
}

// ── BuildPlan schema ──────────────────────────────────────────────

export interface BuildPlanLane {
  id: string;
  title: string;
  description: string;
  role: CellRole; // which agent handles this lane
  dependencies: string[]; // ids of lanes that must complete first
  status: 'pending' | 'running' | 'done' | 'failed';
  output?: string; // result artifact or summary
}

/**
 * Machine-checkable acceptance criterion emitted by the architect (Phase 3).
 * Each check is a concrete, deterministic assertion the assembled bundle must
 * satisfy. The self-verifying loop evaluates them after the build; a build is
 * "complete" only when ALL pass.
 */
export interface AcceptanceCheck {
  /** Unique id (kebab-case, e.g. 'has-canvas-element'). */
  id: string;
  /** Human-readable description of what is checked. */
  description: string;
  /**
   * The check type. Currently supported:
   *   - 'html_contains': bundle HTML contains a literal substring.
   *   - 'html_regex': bundle HTML matches a regex pattern.
   *   - 'no_console_error_pattern': bundle JS must not contain patterns
   *     known to cause console errors (undefined vars, missing refs).
   *   - 'file_exists': a named file exists in the project tree.
   */
  type: 'html_contains' | 'html_regex' | 'no_console_error_pattern' | 'file_exists';
  /** The value to check against (substring, regex pattern, or file path). */
  value: string;
}

export interface BuildPlan {
  projectTitle: string;
  genre: string;
  summary: string;
  lanes: BuildPlanLane[];
  estimatedComplexity: 'low' | 'medium' | 'high';
  /**
   * 3–8 machine-checkable acceptance criteria the build must satisfy (Phase 3).
   * Emitted by the architect. A build is "complete" only when every check passes;
   * otherwise the build status is "needs-attention" with the failure list.
   */
  acceptanceChecks?: AcceptanceCheck[];
}

// ── System prompts ────────────────────────────────────────────────

export const ARCHITECT_SYSTEM = `You are CELL — the AI architect of NEXUS Studio, a game/app creation platform.

Your job: take the user's creative intent and decompose it into a structured BuildPlan.

A BuildPlan is a JSON object with:
- projectTitle: concise name for the project
- genre: the genre/category (e.g. "sports roguelike", "puzzle platformer")
- summary: 2-3 sentence overview of what will be built
- lanes: array of parallel work lanes, each with:
  - id: short kebab-case identifier
  - title: human-readable lane title
  - description: what this lane produces (be specific and actionable)
  - role: "architect" | "builder" | "critic" (who handles this lane)
  - dependencies: array of lane ids that must complete first (empty for root lanes)
  - status: always "pending" initially
- estimatedComplexity: "low" | "medium" | "high"

Rules:
1. Decompose into 3-8 lanes. Maximize parallelism — minimize dependencies.
2. Each lane should be independently executable.
3. Always include a "quality-gate" lane with role "critic" that depends on all builder lanes.
4. Think in terms of: game mechanics, visual assets, audio, UI, testing.
5. Be specific — "Create 3D basketball court with hoop geometry" not "Make environment".
6. Consider the FEL engine capabilities: Three.js/R3F for 3D, Canvas for 2D, PRQ system, economy.
7. ALWAYS include an "acceptanceChecks" array (3-8 items). Each check is a concrete, machine-verifiable assertion the assembled HTML must pass. Types:
   - "html_contains": the bundled HTML must contain this exact substring (e.g. "<canvas" or a specific id).
   - "html_regex": the bundled HTML must match this regex pattern.
   - "file_exists": a named file must exist in the project tree.
   - "no_console_error_pattern": the bundled JS must NOT contain a known error-prone pattern.
   Example: { "id": "has-canvas", "description": "A canvas element exists", "type": "html_contains", "value": "<canvas" }
   These checks gate build completion — a build is only "complete" when all pass.

Respond ONLY with the BuildPlan JSON. No commentary.`;

export const CRITIC_SYSTEM = `You are CELL's quality critic. You evaluate build outputs against the original intent.

Score each lane output 0-10 and provide specific, actionable feedback.
If any lane scores below 6, mark it for revision with clear instructions.

Respond as JSON: { scores: Record<laneId, {score: number, feedback: string, needsRevision: boolean}>, overallScore: number, verdict: "pass" | "revise" }`;

export const BUILDER_SYSTEM = `You are CELL's builder agent. You execute specific build lanes for game/app creation.

You receive a lane specification and produce concrete output: code, configuration, asset descriptions, or game logic.
Be specific and implementation-ready. Write actual code when the lane calls for it.
Target: Three.js/React Three Fiber for 3D, HTML5 Canvas for 2D, TypeScript throughout.`;

// ── Chat completion helper ────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function callLLM(opts: {
  role: CellRole;
  messages: ChatMessage[];
  stream?: boolean;
  jsonMode?: boolean;
  maxTokens?: number;
}): Promise<Response> {
  const model = getModelForRole(opts.role);
  const body: Record<string, any> = {
    model,
    messages: opts.messages,
    stream: opts.stream ?? true,
    max_tokens: opts.maxTokens ?? 4000,
  };
  if (opts.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'Unknown error');
    throw new Error(`LLM API ${response.status}: ${err}`);
  }

  return response;
}

// ── Wisdom store helpers ──────────────────────────────────────────

export function extractWisdom(
  buildOutcome: { plan: BuildPlan; success: boolean; feedback?: string }
): Array<{ category: string; insight: string }> {
  const wisdoms: Array<{ category: string; insight: string }> = [];

  if (buildOutcome.success) {
    wisdoms.push({
      category: 'architecture',
      insight: `Successful plan for "${buildOutcome.plan.genre}": ${buildOutcome.plan.lanes.length} lanes, complexity ${buildOutcome.plan.estimatedComplexity}. Pattern works.`,
    });
  } else if (buildOutcome.feedback) {
    wisdoms.push({
      category: 'prompt_quality',
      insight: `Failed build for "${buildOutcome.plan.genre}": ${buildOutcome.feedback}. Avoid this pattern.`,
    });
  }

  return wisdoms;
}

// ── Build execution prompts ──────────────────────────────────

export const LANE_BUILDER_SYSTEM = `You are CELL's builder agent working on ONE lane of a larger build.
Produce concrete, implementation-ready output for your assigned lane only.
Write REAL code/logic/content — no placeholders, no "TODO", no ellipses.
The final product will be a SINGLE self-contained HTML file (inline CSS + inline JS, NO external dependencies, NO CDNs, NO frameworks, NO build step).
Write your lane's contribution (HTML structure, CSS, and/or vanilla JS) so it can be merged into that single file.
Be concise but complete. Output only the code/content for your lane.`;

export const ASSEMBLER_SYSTEM = `You are CELL's assembler. You merge all lane outputs into ONE complete, self-contained, production-ready HTML file.
Hard requirements:
- A single valid .html document: <!DOCTYPE html> ... </html>
- ALL CSS inside one <style> tag; ALL JS inside <script> tags at the end of body. NO external URLs, NO CDNs, NO imports, NO frameworks.
- Must run by simply opening the file in a browser. It must be FULLY FUNCTIONAL, not a static mockup — every button/input works.
- Modern, polished, responsive UI. Sensible default (dark) theme.
- Persist meaningful state with localStorage where appropriate.
- No console errors. All event handlers wired. No undefined references.
Respond with ONLY the HTML document inside a single \`\`\`html code block. Do not add commentary.`;

export const CRITIC_FIX_SYSTEM = `You are CELL's quality critic AND fixer. You receive a single-file HTML app.
Find and FIX every defect: JS runtime errors, undefined variables, missing/broken event handlers, non-functional buttons, layout/overflow bugs, broken localStorage, and accessibility issues.
Keep it a SINGLE self-contained HTML file (inline CSS + JS, no external deps). Preserve all working functionality; do not remove features.
Return the COMPLETE corrected HTML document in full.
Respond with ONLY the HTML inside a single \`\`\`html code block. No commentary.`;

// ── Multi-file build prompts (Phase 1 workspace) ─────────────

export const FILE_BUILDER_SYSTEM = `You are CELL's builder agent working on ONE lane of a multi-file web project.
The project is a tree of files (index.html is the entry point, plus .css / .js / .json files).
You emit FILE OPERATIONS that create or update files — never prose, never a whole app in one string.

Hard rules:
- Respond with ONLY a JSON object: { "ops": [ { "action": "create"|"update"|"delete", "path": "js/game.js", "content": "..." } ] }
- Use RELATIVE paths (no leading slash). index.html must reference css/js via <link href="..."> and <script src="..."> using those same relative paths.
- Write REAL, complete, runnable code — no placeholders, no TODO, no ellipses.
- NO external CDNs, NO frameworks, NO build step, NO imports of remote URLs. Vanilla HTML/CSS/JS only (ES modules are fine only if referenced as local files).
- When MODIFYING an existing file, emit a full targeted rewrite of ONLY that file (action "update"). Never regenerate files you were not asked to touch.
- Keep each file focused and small. Prefer several small files over one giant file.
- Persist meaningful state with localStorage where it makes sense. Every control must work.

Only emit ops for the files your lane owns. Respond with the JSON object and nothing else.`;

export const FILE_CRITIC_SYSTEM = `You are CELL's quality critic for a multi-file web project.
You receive the current file manifest and the runnable bundle. Find real defects: JS runtime errors,
undefined references, broken/mis-wired event handlers, non-functional controls, layout/overflow bugs,
broken localStorage, and broken local asset/script/style references.

Emit TARGETED FIXES as file operations — rewrite ONLY the files that need changes. Do not rewrite healthy files.
Respond with ONLY a JSON object: { "ops": [ { "action": "update", "path": "...", "content": "...full corrected file..." } ], "notes": "one line" }
If nothing needs fixing, respond { "ops": [], "notes": "ok" }. No other text.`;

export const SUMMARIZER_SYSTEM = `You summarize source files for a code index. For each file you are given, output ONE terse line
(<= 140 chars) describing its role and key exports/symbols. Respond as JSON: { "summaries": { "path": "one line", ... } }. No other text.`;

// ── Non-streaming completion helper ──────────────────────

export async function completeText(opts: {
  role: CellRole;
  messages: ChatMessage[];
  jsonMode?: boolean;
  maxTokens?: number;
}): Promise<string> {
  const model = getModelForRole(opts.role);
  const body: Record<string, any> = {
    model,
    messages: opts.messages,
    stream: false,
    max_tokens: opts.maxTokens ?? 4000,
  };
  if (opts.jsonMode) body.response_format = { type: 'json_object' };

  const response = await fetch('https://apps.abacus.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => 'Unknown error');
    throw new Error(`LLM API ${response.status}: ${err}`);
  }

  const data = await response.json().catch(() => null);
  return data?.choices?.[0]?.message?.content ?? '';
}

// ── HTML extraction ─────────────────────────────────

export function extractHtml(text: string): string {
  if (!text) return '';
  const htmlBlock = text.match(/```html\s*([\s\S]*?)```/i);
  if (htmlBlock) return htmlBlock[1].trim();
  const anyBlock = text.match(/```\s*([\s\S]*?)```/);
  if (anyBlock && /<[a-z!]/i.test(anyBlock[1])) return anyBlock[1].trim();
  const idx = text.search(/<!doctype html|<html/i);
  if (idx >= 0) return text.slice(idx).trim();
  return text.trim();
}
