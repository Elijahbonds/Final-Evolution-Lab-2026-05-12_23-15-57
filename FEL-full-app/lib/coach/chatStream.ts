// lib/coach/chatStream.ts — COACH-AI Phase 8 (2026-10-07): the AI coach's streamed reply, read line by line.
//
// PLAN ITEM #11, VERIFIED AND FIXED. coach-chat.tsx decoded each chunk with { stream: true } (so a multi-byte character
// split across chunks was safe) but then split EACH CHUNK on '\n' on its own. A network chunk ends wherever it ends,
// so one SSE line often arrives in two pieces:
//   chunk 1: `data: {"choices":[{"delta":{"content":"Hel`      chunk 2: `lo"}}]}\n\n`
// The first piece failed JSON.parse and fell into the "raw text passthrough" branch, so the reply showed the JSON
// itself; the second piece did not start with `data: ` and was dropped. The parser below keeps the unfinished tail of
// each chunk and only reads complete lines; flush() reads a last line that had no newline.
//
// PURE and browser-safe. The server half of the fix is in app/api/coach/chat/route.ts: it now passes the provider's
// bytes through untouched instead of decode()-ing each chunk without { stream: true } (which broke characters split
// across chunks before the browser ever saw them).

/** A line longer than this without a newline is not an SSE line we can use; it is dropped rather than held forever. */
export const SSE_MAX_LINE = 64_000;

/** One complete line → the text it adds to the reply ([] for anything that adds none). */
export function deltaFromLine(rawLine: string): string[] {
  const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
  if (!line.startsWith('data:')) return [];
  const data = line.slice(line.startsWith('data: ') ? 6 : 5);
  if (data === '[DONE]' || !data.trim()) return [];
  try {
    const parsed = JSON.parse(data);
    const delta = parsed?.choices?.[0]?.delta?.content;
    return typeof delta === 'string' && delta ? [delta] : [];
  } catch {
    // A COMPLETE line that is not JSON is plain text the provider sent (the old passthrough, kept). A partial line
    // never reaches here any more.
    return [data];
  }
}

export interface SseDeltaParser {
  /** Feed decoded text; returns the reply text completed by it. */
  push(text: string): string[];
  /** End of stream: read whatever is left. */
  flush(): string[];
}

export function createSseDeltaParser(): SseDeltaParser {
  let tail = '';
  return {
    push(text) {
      tail += text;
      const lines = tail.split('\n');
      tail = lines.pop() ?? '';
      if (tail.length > SSE_MAX_LINE) tail = '';
      return lines.flatMap(deltaFromLine);
    },
    flush() {
      const rest = tail;
      tail = '';
      return rest ? deltaFromLine(rest) : [];
    },
  };
}

/** Read a whole streamed body through the parser, calling onText with the reply so far after each piece. */
export async function readReplyStream(body: ReadableStream<Uint8Array>, onText: (full: string) => void): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseDeltaParser();
  let full = '';
  const take = (parts: string[]) => {
    if (!parts.length) return;
    full += parts.join('');
    onText(full);
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    take(parser.push(decoder.decode(value, { stream: true })));
  }
  take(parser.push(decoder.decode()));
  take(parser.flush());
  return full;
}
