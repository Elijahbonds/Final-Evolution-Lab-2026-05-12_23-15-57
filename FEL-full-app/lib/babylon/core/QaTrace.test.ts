import { describe, it, expect } from 'vitest';
import { QaTrace } from './QaTrace';

const clock = () => { let t = 0; return { now: () => t, at: (v: number) => { t = v; } }; };

describe('QaTrace — every press gets an answer you can perceive', () => {
  it('a press answered inside the window counts; one with nothing after it is silent', () => {
    const c = clock(); const q = new QaTrace(c.now);
    c.at(0); q.press('A'); c.at(120); q.juice('scorePop');
    c.at(1000); q.press('A');
    c.at(3000); q.press('B'); c.at(3200); q.anim('kick');
    const s = q.summary(450);
    expect(s.presses).toBe(3); expect(s.answered).toBe(2); expect(s.silentPct).toBe(33);
    expect(s.byBtn.A).toMatchObject({ presses: 2, answered: 1 });
    expect(s.byBtn.B.answers['anim:kick']).toBe(1);
  });

  it('continuous HUD keys are not answers; banners, phases and discrete counts are', () => {
    const c = clock(); const q = new QaTrace(c.now);
    q.hud({ time: 30, speed: 4.2, hint: 'x', banner: '', combo: 0 });
    c.at(10); q.press('A'); c.at(50); q.hud({ time: 29, speed: 5.1 });
    expect(q.summary().answered).toBe(0);
    c.at(1000); q.press('A'); c.at(1100); q.hud({ banner: 'KICKFLIP' });
    c.at(2000); q.press('X'); c.at(2100); q.hud({ combo: 2 });
    c.at(3000); q.press('Y'); c.at(3100); q.hud({ banner: '' });           // a banner clearing does not answer
    const s = q.summary();
    expect(s.byBtn.A.answered).toBe(1); expect(s.byBtn.X.answered).toBe(1); expect(s.byBtn.Y.answered).toBe(0);
  });

  it('a score with no cue around it is unexplained; a score beside a pop is not', () => {
    const c = clock(); const q = new QaTrace(c.now);
    q.hud({ score: 0 });
    c.at(100); q.hud({ score: 50 });                                         // nothing around it
    c.at(5000); q.juice('scorePop'); c.at(5100); q.hud({ score: 120 });
    const s = q.summary();
    expect(s.scores).toBe(2); expect(s.unexplainedScores).toBe(1);
  });
});
