/**
 * CELL provider layer (Phase 2).
 *
 * Normalizes chat completions across providers. When the user supplies a direct
 * API key we call the provider's own endpoint (their cost, their rate limits);
 * otherwise we route through Abacus RouteLLM (the default) using the tier's
 * mapped model. Every call returns normalized token usage for cost accounting.
 */
import type { Provider } from '@/lib/cell-models';
import { assertProviderAllowed, type CompliancePolicy } from '@/lib/cell-compliance';

export interface PMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ModelCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

function estTokens(s: string): number {
  return Math.ceil((s || '').length / 4);
}

/**
 * Call a model. `provider` 'abacus' routes through Abacus (uses ABACUSAI_API_KEY);
 * otherwise `apiKey` (the user's decrypted key) is required.
 */
export async function callModel(opts: {
  provider: Provider;
  model: string;
  messages: PMessage[];
  jsonMode?: boolean;
  maxTokens?: number;
  apiKey?: string;
  /**
   * Optional compliance policy from the active studio spec. When present, the
   * provider is gated BEFORE any network call; a disallowed provider throws a
   * ComplianceError. Omitted policy = allow all (backward compatible).
   */
  compliance?: CompliancePolicy;
}): Promise<ModelCallResult> {
  // M6: jurisdiction/denylist gate runs before we touch the network.
  assertProviderAllowed(opts.provider, opts.compliance);
  const maxTokens = opts.maxTokens ?? 4000;
  switch (opts.provider) {
    case 'openai':
      return callOpenAI(opts.model, opts.messages, maxTokens, opts.apiKey!, opts.jsonMode);
    case 'anthropic':
      return callAnthropic(opts.model, opts.messages, maxTokens, opts.apiKey!, opts.jsonMode);
    case 'google':
      return callGoogle(opts.model, opts.messages, maxTokens, opts.apiKey!, opts.jsonMode);
    case 'abacus':
    default:
      return callAbacus(opts.model, opts.messages, maxTokens, opts.jsonMode);
  }
}

// ── Abacus RouteLLM (OpenAI-compatible) ──
async function callAbacus(
  model: string,
  messages: PMessage[],
  maxTokens: number,
  jsonMode?: boolean
): Promise<ModelCallResult> {
  const body: Record<string, any> = { model, messages, stream: false, max_tokens: maxTokens };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetch('https://apps.abacus.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.ABACUSAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Abacus ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content ?? '';
  const u = data?.usage || {};
  return {
    content,
    inputTokens: u.prompt_tokens ?? estTokens(messages.map((m) => m.content).join(' ')),
    outputTokens: u.completion_tokens ?? estTokens(content),
  };
}

// ── OpenAI ──
async function callOpenAI(
  model: string,
  messages: PMessage[],
  maxTokens: number,
  apiKey: string,
  jsonMode?: boolean
): Promise<ModelCallResult> {
  const body: Record<string, any> = { model, messages, max_tokens: maxTokens };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content ?? '';
  const u = data?.usage || {};
  return {
    content,
    inputTokens: u.prompt_tokens ?? estTokens(messages.map((m) => m.content).join(' ')),
    outputTokens: u.completion_tokens ?? estTokens(content),
  };
}

// ── Anthropic ──
async function callAnthropic(
  model: string,
  messages: PMessage[],
  maxTokens: number,
  apiKey: string,
  jsonMode?: boolean
): Promise<ModelCallResult> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const convo = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));
  const sys = jsonMode
    ? `${system}\n\nRespond with ONLY a single valid JSON object and nothing else.`
    : system;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system: sys, messages: convo }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json().catch(() => null);
  const content = Array.isArray(data?.content)
    ? data.content.map((b: any) => b?.text || '').join('')
    : '';
  const u = data?.usage || {};
  return {
    content,
    inputTokens: u.input_tokens ?? estTokens(messages.map((m) => m.content).join(' ')),
    outputTokens: u.output_tokens ?? estTokens(content),
  };
}

// ── Google Gemini ──
async function callGoogle(
  model: string,
  messages: PMessage[],
  maxTokens: number,
  apiKey: string,
  jsonMode?: boolean
): Promise<ModelCallResult> {
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  const generationConfig: Record<string, any> = { maxOutputTokens: maxTokens };
  if (jsonMode) generationConfig.responseMimeType = 'application/json';
  const body: Record<string, any> = { contents, generationConfig };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const data = await res.json().catch(() => null);
  const content =
    data?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('') ?? '';
  const u = data?.usageMetadata || {};
  return {
    content,
    inputTokens: u.promptTokenCount ?? estTokens(messages.map((m) => m.content).join(' ')),
    outputTokens: u.candidatesTokenCount ?? estTokens(content),
  };
}
