// NB-3 (hoops grade 0d16f5dd): a 3v3 level at the buzzer (ROOKIE-r1, 10–10) posted won:false with no overtime; and the hub
// said "First to 21" for a game on a 90-second clock. A tie now goes to sudden-death overtime; the hub says the clock.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODE_MENU_META } from '../../mode-menu';

const SRC = readFileSync(join(__dirname, 'ThreeVThreeMode.ts'), 'utf8');

describe('NB-3: a tie at the buzzer goes to overtime', () => {
  it('overtime is sudden death on its own clock, and a new run starts without it', () => {
    expect(SRC).toMatch(/const OVERTIME_SEC = 30;/);
    expect(SRC).toMatch(/const OVERTIME_BANNER = 'OVERTIME — NEXT BUCKET WINS';/);
    expect(SRC).toMatch(/ended = false; buzzer = false; overtime = false;/);
  });
  it('level at the horn (nothing in the air): overtime, the horn re-armed, the clock reset — not a result', () => {
    expect(SRC).toMatch(/if \(buzzer && !ended && !liveAtBuzzer && myScore === foeScore\) \{\s*\/\/[^\n]*\n\s*overtime = true; buzzer = false; timeLeft = OVERTIME_SEC;/);
  });
  it('in overtime the first bucket ends it as a WIN or a LOSS, once nothing is still in the air', () => {
    expect(SRC).toMatch(/if \(overtime && !ended && myScore !== foeScore && !liveAtBuzzer\) \{/);
    expect(SRC).toMatch(/const ot = myScore > foeScore \? 'WIN' : 'LOSS';/);
  });
  it('the overtime check runs before the buzzer result, so a level horn can never post', () => {
    const ot = SRC.indexOf('if (buzzer && !ended && !liveAtBuzzer && myScore === foeScore)');
    const result = SRC.indexOf("const verdict = myScore > foeScore ? 'WIN' : myScore === foeScore ? 'DRAW' : 'LOSS';");
    expect(ot).toBeGreaterThan(-1);
    expect(result).toBeGreaterThan(ot);
  });
});

describe('NB-3: the hub copy matches the clock', () => {
  it('says first to 21, the 90-second clock, and overtime on a tie', () => {
    const d = (MODE_MENU_META as Record<string, { desc: string }>).hoops3v3.desc;
    expect(d).toMatch(/First to 21/);
    expect(d).toMatch(/90-second clock/);
    expect(d).toMatch(/tie goes to overtime/);
  });
});
