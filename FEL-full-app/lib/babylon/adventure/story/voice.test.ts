// Story lines heard and captioned (Phase B, plan: "Captions go through core/captions.ts as critical, always. Voice goes
// through audio/voice/voiceQueue: TTS for placeholders").
import { describe, expect, it } from 'vitest';
import type { CueImportance } from '@/lib/babylon/core/captions';
import { lineSec, type DialogueLine } from './dialogue';
import { StoryVoice } from './voice';

const L = (id: string, text: string): DialogueLine => ({ id, speaker: 'guide', speakerName: 'Guide', text, placeholder: true });

function rig() {
  const cues: [string, CueImportance][] = [];
  const said: string[] = [];
  let cancels = 0;
  const v = new StoryVoice({ speak: (t) => said.push(t), cancel: () => { cancels++; } }, (t, i) => cues.push([t, i]));
  return { v, cues, said, cancels: () => cancels };
}

describe('StoryVoice', () => {
  it('every line is a CRITICAL caption with its speaker, and is said (the lane is free)', () => {
    const r = rig();
    expect(r.v.line(L('a', 'Hello there.'), 0).kind).toBe('start');
    expect(r.cues).toEqual([['Guide: Hello there.', 'critical']]);
    expect(r.said).toEqual(['Hello there.']);
  });

  it('a tapped-on line cuts the one still being said (one voice lane: never two at once)', () => {
    const r = rig();
    r.v.line(L('a', 'A long line that is still being said aloud.'), 0);
    const d = r.v.line(L('b', 'Next.'), 0.5);
    expect(d.kind).toBe('start');
    expect(r.cancels()).toBeGreaterThanOrEqual(1);
    expect(r.said).toEqual(['A long line that is still being said aloud.', 'Next.']);
  });

  it('a line asked for in the last moment of the previous one waits for it, then is said (not dropped, not late)', () => {
    const r = rig();
    const first = 'Short one.';
    r.v.line(L('a', first), 0);
    const nearEnd = lineSec(first) - 0.2;
    expect(r.v.line(L('b', 'Second.'), nearEnd).kind).toBe('queued');
    expect(r.said).toEqual([first]);
    r.v.update(lineSec(first) + 0.2);
    expect(r.said).toEqual([first, 'Second.']);
  });

  it('a scene that ends hushes the lane; headless (no speaker) only the captions and the decisions remain', () => {
    const r = rig();
    r.v.line(L('a', 'Hello.'), 0);
    r.v.stop(0.3);
    expect(r.cancels()).toBe(1);
    const quiet = new StoryVoice(null, () => {});
    expect(quiet.line(L('x', 'Hi.'), 0).kind).toBe('start');
    expect(quiet.log.map((x) => x.decision)).toEqual(['start']);
  });
});
