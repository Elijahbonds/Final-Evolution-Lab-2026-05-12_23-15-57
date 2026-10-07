// COACH-AI Phase 8 (2026-10-07): plan item #11 — the AI coach's reply survives SSE lines split across chunks.
import { describe, expect, it } from 'vitest';
import { createSseDeltaParser, deltaFromLine, readReplyStream } from './chatStream';

const line = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

/** The same text, cut at every possible point into two chunks. */
function everySplit(s: string): [string, string][] {
  return Array.from({ length: s.length + 1 }, (_, i) => [s.slice(0, i), s.slice(i)]);
}

function bodyOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream({ start(c) { for (const x of chunks) c.enqueue(x); c.close(); } });
}

describe('deltaFromLine', () => {
  it('reads a delta, skips [DONE], role-only chunks, comments and blank lines', () => {
    expect(deltaFromLine('data: {"choices":[{"delta":{"content":"Hi"}}]}')).toEqual(['Hi']);
    expect(deltaFromLine('data:{"choices":[{"delta":{"content":"Hi"}}]}')).toEqual(['Hi']);
    expect(deltaFromLine('data: {"choices":[{"delta":{"content":"Hi"}}]}\r')).toEqual(['Hi']);
    expect(deltaFromLine('data: [DONE]')).toEqual([]);
    expect(deltaFromLine('data: {"choices":[{"delta":{"role":"assistant"}}]}')).toEqual([]);
    expect(deltaFromLine(': keep-alive')).toEqual([]);
    expect(deltaFromLine('')).toEqual([]);
  });
});

describe('createSseDeltaParser: a line split across chunks', () => {
  const stream = line('Land ') + line('soft.') + 'data: [DONE]\n\n';

  it('CONTROL: the old per-chunk split shows JSON in the reply for a mid-line cut', () => {
    // the pre-fix client logic, verbatim in effect: each chunk split on its own, a failed parse appended as raw text
    const oldClient = (chunks: string[]) => {
      let full = '';
      for (const chunk of chunks) for (const l of chunk.split('\n')) {
        if (!l.startsWith('data: ')) continue;
        const data = l.slice(6);
        if (data === '[DONE]') continue;
        try { const d = JSON.parse(data)?.choices?.[0]?.delta?.content; if (d) full += d; } catch { if (data.trim()) full += data; }
      }
      return full;
    };
    expect(oldClient([stream])).toBe('Land soft.');
    const cut = stream.indexOf('soft');
    expect(oldClient([stream.slice(0, cut), stream.slice(cut)])).not.toBe('Land soft.');
  });

  it('every two-chunk cut of the stream reads exactly "Land soft."', () => {
    for (const [a, b] of everySplit(stream)) {
      const p = createSseDeltaParser();
      const got = [...p.push(a), ...p.push(b), ...p.flush()].join('');
      expect(got, JSON.stringify([a, b])).toBe('Land soft.');
    }
  });

  it('one character at a time reads the same', () => {
    const p = createSseDeltaParser();
    const got = [...stream].flatMap((ch) => p.push(ch)).concat(p.flush()).join('');
    expect(got).toBe('Land soft.');
  });

  it('a last line with no newline is read on flush()', () => {
    const p = createSseDeltaParser();
    expect(p.push('data: {"choices":[{"delta":{"content":"end"}}]}')).toEqual([]);
    expect(p.flush()).toEqual(['end']);
  });

  it('a complete non-JSON line is still passed through as text (the old behaviour for whole lines)', () => {
    const p = createSseDeltaParser();
    expect(p.push('data: plain words\n')).toEqual(['plain words']);
  });
});

describe('readReplyStream: bytes cut mid-character and mid-line', () => {
  it('every byte cut of a reply with multi-byte characters reads whole', async () => {
    const bytes = new TextEncoder().encode(line('Dunk ✓ — é 🏀') + 'data: [DONE]\n\n');
    for (let i = 0; i <= bytes.length; i++) {
      const seen: string[] = [];
      const full = await readReplyStream(bodyOf([bytes.slice(0, i), bytes.slice(i)]), (t) => seen.push(t));
      expect(full, `cut at ${i}`).toBe('Dunk ✓ — é 🏀');
      expect(full).not.toContain('�');
      expect(seen.at(-1)).toBe(full);
    }
  });
});
