// COACH-VIDEO-REVIEW (2026-10-24): the coach's preset cues and the thread message.
import { describe, expect, it } from 'vitest';
import { cleanNote, presetText, REPLY_NOTE_MAX, replyMessage, replyPresets } from './reply';
import { cueFor } from './movements';
import type { RepFlag } from './score';

const flag: RepFlag = { rep: 4, score: 65, fault: 'kneeValgus', reason: 'Left knee caves on rep 4', cue: null, worst: true };

describe('the presets', () => {
  it('the flagged fault\'s cue card first (cue, escalate, regress), then the set-up cues for the pattern', () => {
    const p = replyPresets('squat', [flag]);
    expect(p.slice(0, 3).map((x) => x.id)).toEqual(['fault:kneeValgus:cue', 'fault:kneeValgus:escalate', 'fault:kneeValgus:regress']);
    expect(p[0].text).toBe(cueFor('squat', 'kneeValgus')!.cue);
    expect(p.some((x) => x.id === 'setup:knees-over-laces')).toBe(true);
    expect(p.some((x) => x.id === 'setup:wall-behind')).toBe(false);   // a hinge cue is not offered for a squat
    expect(replyPresets('hinge', []).some((x) => x.id === 'setup:wall-behind')).toBe(true);
    expect(replyPresets('pushup', []).some((x) => x.id === 'setup:floor-away')).toBe(true);
  });

  it('a preset is looked up by id for THIS set; anything else is null (the client never sends the words)', () => {
    expect(presetText('squat', [flag], 'fault:kneeValgus:cue')).toBe(cueFor('squat', 'kneeValgus')!.cue);
    expect(presetText('squat', [flag], 'fault:heelRise:cue')).toBeNull();   // not flagged on this set
    expect(presetText('squat', [flag], 'Do 100 burpees')).toBeNull();
    expect(presetText('squat', [flag], 42)).toBeNull();
  });
});

describe('the message', () => {
  it('names the exercise, the rep and what was seen, then the cue, then the note', () => {
    expect(replyMessage({ movement: 'squat', exerciseName: 'Goblet squat', flag, cue: 'Knees out over the laces.', note: 'Lighter bell next time.' }))
      .toBe('Form review · Goblet squat, rep 4 (Left knee caves)\nCue: Knees out over the laces.\nLighter bell next time.');
    expect(replyMessage({ movement: 'hinge', exerciseName: '', flag: null, cue: null, note: 'Looked great.' })).toBe('Form review · Hip hinge\nLooked great.');
  });

  it('the note is trimmed and capped', () => {
    expect(cleanNote('  hi \r\n there ')).toBe('hi \n there');
    expect(cleanNote('   ')).toBeNull();
    expect(cleanNote(5)).toBeNull();
    expect(cleanNote('x'.repeat(REPLY_NOTE_MAX + 50))!.length).toBe(REPLY_NOTE_MAX);
  });
});
