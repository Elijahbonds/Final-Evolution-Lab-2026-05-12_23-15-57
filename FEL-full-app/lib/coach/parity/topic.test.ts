// COACH-PARITY (2026-10-26): what a coach's words are about — pain is refused (one pain path), health is raised and never
// lowered, body weight and diet are marked on top.
import { describe, expect, it } from 'vitest';
import { readTopic, settleTopic } from './topic';

describe('readTopic', () => {
  it.each([
    'Any pain this week?', 'Rate your knee pain 1-10', 'Did anything hurt?', 'Any injuries?', 'Tweaked your back?', 'Ankle ache after runs?',
  ])('pain: %s', (t) => expect(readTopic(t).topic).toBe('pain'));

  it.each([
    ['How did you sleep?', false], ['Hours slept', false], ['Stress level', false], ['Mood this week', false], ['Energy before training', false],
    ['How sore are you?', false], ['Were you sick?', false], ['Any medication changes?', false], ['Morning body weight', true],
    ['Calories yesterday', true], ['Protein with every meal', true], ['Did you eat before training?', true], ['Waist measurement', true],
  ])('health: %s (body/diet %s)', (t, body) => expect(readTopic(t)).toEqual({ topic: 'health', bodyOrDiet: body }));

  it.each([
    'Sessions completed', 'Hardest lift this week?', 'Rate your effort 1-10', 'How many free throws did you make?', 'Steps per day',
    'Minutes of skill practice', 'How long was your rest period between sets?', 'Fast feet drill done?', 'Drink 2 litres of water', 'Recovery walk done?',
    'Did you hit your squat depth?', 'What do you want to work on next?',
  ])('training: %s', (t) => expect(readTopic(t)).toEqual({ topic: 'training', bodyOrDiet: false }));
});

describe('settleTopic', () => {
  it('a coach may mark a training-sounding question health', () => expect(settleTopic('How was your week?', 'health')).toEqual({ topic: 'health', bodyOrDiet: false }));
  it('a health question cannot be marked training', () => expect(settleTopic('How did you sleep?', 'training')).toEqual({ topic: 'health', bodyOrDiet: false }));
  it('pain is refused whatever the mark', () => { expect(settleTopic('Pain score', 'training')).toBeNull(); expect(settleTopic('Pain score', 'health')).toBeNull(); });
  it('anything else marked is training', () => expect(settleTopic('Sessions done', 'nonsense')).toEqual({ topic: 'training', bodyOrDiet: false }));
});
