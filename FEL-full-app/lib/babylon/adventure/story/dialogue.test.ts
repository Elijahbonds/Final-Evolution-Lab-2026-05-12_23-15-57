// The dialogue player (Phase B, plan "The dialogue and cutscene player"): the reading pace, tap to finish a line, hold
// to skip a scene, choices. Pure: driven like a film with fixed dt.
import { describe, expect, it } from 'vitest';
import { DialoguePlayer, MIN_LINE_SEC, SKIP_HOLD_SEC, WORDS_PER_SEC, lineSec, type DialogueEnd, type DialogueLine } from './dialogue';

const L = (id: string, text: string, extra: Partial<DialogueLine> = {}): DialogueLine =>
  ({ id, speaker: 'guide', speakerName: 'Guide', text, placeholder: true, ...extra });

function run(p: DialoguePlayer, sec: number, dt = 1 / 60): void { for (let t = 0; t < sec - 1e-9; t += dt) p.update(dt); }

describe('the reading pace', () => {
  it('about 2.8 words a second, never under 1.2 s', () => {
    expect(WORDS_PER_SEC).toBe(2.8);
    expect(MIN_LINE_SEC).toBe(1.2);
    expect(lineSec('Go.')).toBe(1.2);
    const words = Array.from({ length: 28 }, () => 'word').join(' ');
    expect(lineSec(words)).toBeCloseTo(10, 5);
    expect(lineSec('one two three four five six seven')).toBeGreaterThanOrEqual(7 / 2.8);
  });
});

describe('the line queue', () => {
  it('shows each line with its speaker, auto-advances at the pace, reports each line once and the end once', () => {
    const seen: string[] = [];
    const ends: DialogueEnd[] = [];
    const p = new DialoguePlayer({ onLine: (l) => seen.push(l.id), onEnd: (e) => ends.push(e) });
    p.play('s1', [L('a', 'Hello there.'), L('b', 'This line has a few more words in it to read.')]);
    expect(p.view()).toMatchObject({ active: true, lineId: 'a', speaker: 'Guide', placeholder: true, queued: 1 });
    run(p, lineSec('Hello there.') - 0.05);
    expect(p.view().lineId).toBe('a');
    run(p, 0.1);
    expect(p.view().lineId).toBe('b');
    run(p, lineSec('This line has a few more words in it to read.') + 0.1);
    expect(p.active).toBe(false);
    expect(seen).toEqual(['a', 'b']);
    expect(ends).toEqual([{ sceneId: 's1', skipped: false, choice: null }]);
  });

  it('reveals the text over time (a typewriter), then holds it whole', () => {
    const p = new DialoguePlayer();
    p.play('s', [L('a', 'A fairly long line of text to reveal.')]);
    expect(p.view().shown).toBe(0);
    run(p, 0.2);
    const mid = p.view().shown;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(p.view().text.length);
    run(p, 1);
    expect(p.view().shown).toBe(p.view().text.length);
  });
});

describe('tap to finish a line, hold to skip the scene', () => {
  it('a tap while revealing shows the line whole; a second tap moves on', () => {
    const p = new DialoguePlayer();
    p.play('s', [L('a', 'A fairly long line of text to reveal.'), L('b', 'Next.')]);
    run(p, 0.1);
    p.press(); p.update(1 / 60); p.release();
    expect(p.view().lineId).toBe('a');
    expect(p.view().shown).toBe(p.view().text.length);
    p.press(); p.release();
    expect(p.view().lineId).toBe('b');
  });

  it(`a press held ${SKIP_HOLD_SEC} s skips every line left and reports a skipped end`, () => {
    const ends: DialogueEnd[] = [];
    const lines: string[] = [];
    const p = new DialoguePlayer({ onEnd: (e) => ends.push(e), onLine: (l) => lines.push(l.id) });
    p.play('s', [L('a', 'One.'), L('b', 'Two.'), L('c', 'Three.')]);
    p.press();
    run(p, SKIP_HOLD_SEC - 0.1);
    expect(p.active).toBe(true);
    expect(p.view().hold01).toBeGreaterThan(0.8);
    run(p, 0.2);
    expect(p.active).toBe(false);
    expect(ends).toEqual([{ sceneId: 's', skipped: true, choice: null }]);
    expect(lines).toEqual(['a']);   // the skipped lines never started (no voice, no caption for them)
    p.release();                    // the release after a skip is not a tap
    expect(ends.length).toBe(1);
  });
});

describe('choices', () => {
  const choices = [{ id: 'together', text: 'Side by side' }, { id: 'lead', text: 'I go first' }];

  it('a line with choices waits (no auto-advance) until one is chosen; up / down move the highlight', () => {
    const ends: DialogueEnd[] = [];
    const p = new DialoguePlayer({ onEnd: (e) => ends.push(e) });
    p.play('c', [L('q', 'How do we face it?', { choices, defaultChoice: 'together' })]);
    run(p, 30);
    expect(p.active).toBe(true);
    expect(p.view().choices?.map((c) => c.id)).toEqual(['together', 'lead']);
    p.move(1);
    expect(p.view().choiceIndex).toBe(1);
    p.move(1);
    expect(p.view().choiceIndex).toBe(0);
    p.move(-1);
    p.tap();
    expect(ends).toEqual([{ sceneId: 'c', skipped: false, choice: choices[1] }]);
  });

  it('a skip takes the default choice', () => {
    const ends: DialogueEnd[] = [];
    const p = new DialoguePlayer({ onEnd: (e) => ends.push(e) });
    p.play('c', [L('pre', 'Before.'), L('q', 'How?', { choices, defaultChoice: 'lead' })]);
    p.skip();
    expect(ends[0].choice?.id).toBe('lead');
  });
});
