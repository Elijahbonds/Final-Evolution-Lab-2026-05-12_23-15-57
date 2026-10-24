// NB-3, rebuilt (lane/hoops-overtime, owner 2026-10-23): the old PR #268 on the current ThreeVThreeMode. The rule itself is tested
// where it lives (threevthreeOvertime.test.ts); this pins that the mode, its host and the hub copy run it. Built on the ELITE shot
// clock (#391): the overtime's fresh check bumps the possession token, and the player's shot clock starts again on a new token.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MODE_MENU_META } from '../../mode-menu';
import { PlayerShotClock } from '../core/ShotClock';

const SRC = readFileSync(join(__dirname, 'ThreeVThreeMode.ts'), 'utf8');
const CODE = SRC.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');
const HOST = readFileSync(join(__dirname, '../../../components/games/three-v-three-babylon.tsx'), 'utf8');
const fn = (name: string): string => {
  const at = SRC.indexOf(`function ${name}(`); expect(at, name).toBeGreaterThan(0);
  const rest = SRC.slice(at + 1); const end = rest.search(/\n {2}(async )?function |\n {2}return \{|\n {2}\/\*\*/);
  return end < 0 ? rest : rest.slice(0, end);
};

describe('NB-3 in the mode: the buzzer site asks hornCall, and a tie starts an overtime', () => {
  it('the one buzzer ending reads hornCall with the live ball, the horn, the period and the score — no DRAW verdict left', () => {
    expect(CODE).toMatch(/const horn = ended \? 'play' : hornCall\(\{ buzzer, overtime: overtimes > 0, live: liveAtBuzzer, my: myScore, foe: foeScore \}\);/);
    expect(CODE).toMatch(/if \(horn === 'overtime'\) startOvertime\(ctx\);\n\s*else if \(horn !== 'play'\) \{/);
    expect(CODE).toMatch(/micEnd\(horn\);[^\n]*\n\s*return ctx\.end\(horn, myScore, endStats\(\)\);/);
    expect(CODE).not.toMatch(/'DRAW' : 'LOSS'/);
  });
  it('the horn is checked after the clock ticks and before the HUD clock is written', () => {
    const tick = SRC.indexOf('if (timeLeft > 0) timeLeft -= dt;'), horn = SRC.indexOf('const horn = ended ?'), hud = SRC.indexOf("putHud(ctx, { time: Math.ceil(timeLeft) });");
    expect(tick).toBeGreaterThan(0); expect(horn).toBeGreaterThan(tick); expect(hud).toBeGreaterThan(horn);
  });
  it('startOvertime: the period counted, the horn re-armed on the knob\'s clock, the banner, the period on the HUD, a fresh check', () => {
    const ot = fn('startOvertime');
    expect(ot).toMatch(/overtimes\+\+; buzzer = false; timeLeft = overtimeSec\(\);/);
    expect(fn('bannerFlash')).toMatch(/if \(modeClock < otBannerHold\) return;/);   // rig run 2: THEY SWITCHED wiped the banner at the check
    expect(ot).toMatch(/otBannerHold = modeClock \+ OVERTIME_BANNER_MS \/ 1000;/);
    expect(ot).toMatch(/bannerFlash\(ctx, overtimes > 1 \? `\$\{periodLabel\(overtimes\)\} — NEXT BUCKET WINS` : OVERTIME_BANNER, OVERTIME_BANNER_MS\);/);
    expect(ot).toMatch(/putHud\(ctx, \{ time: Math\.ceil\(timeLeft\), period: periodLabel\(overtimes\) \}\);/);
    expect(ot).toMatch(/if \(OVERTIME_BALL === 'me'\) resetPossession\(true\); else void opponentPossession\(ctx\);/);
    expect(ot).toMatch(/console\.info\(`\[3V3-RULES\] overtime /);
    expect(ot.replace(/\/\/.*$/gm, '')).not.toMatch(/momentum|mbus|report\(/);   // the overtime moves no shot odds (the momentum bus feeds the make multiplier)
  });
  it('both fresh possessions bump the token the shot clock reads', () => {
    expect(fn('resetPossession')).toMatch(/possessionToken\+\+;/);
    expect(fn('opponentPossession')).toMatch(/possessionToken\+\+;/);
    expect(CODE).toMatch(/shotClock\.tick\(dt, \{ token: possessionToken,/);
  });
  it('a new run starts in regulation, and an overtime game says so in its stats', () => {
    expect(CODE).toMatch(/ended = false; buzzer = false; overtimes = 0; otBannerHold = 0;/);
    expect(CODE).toMatch(/time: timeLeft, ast: assists, period: '',/);
    expect(fn('endStats')).toMatch(/\.\.\.\(overtimes \? \{ overtimes \} : \{\}\)/);
  });
  it('the broadcast hears the overtime as the game\'s last stretch, and "final" is still the end or the horn', () => {
    expect(CODE).toMatch(/final: \(\) => ended \|\| buzzer, progress: \(\) => overtimes \? 1 : /);
  });
});

describe('NB-3 + ELITE (#391): the overtime\'s fresh check is a fresh shot clock', () => {
  it('a new possession token resets the player\'s clock to full', () => {
    const shown: string[] = [];
    const c = new PlayerShotClock(() => 14, (v) => shown.push(v));
    for (let i = 0; i < 130; i++) c.tick(0.1, { token: 7, ours: true, live: true });   // 13 s of the last regulation possession
    expect(c.remaining).toBeCloseTo(1, 5);
    c.tick(0.1, { token: 8, ours: true, live: true });                                  // the overtime's check: the token moved
    expect(c.remaining).toBeCloseTo(13.9, 5);
  });
});

describe('NB-3: the copy matches the clock', () => {
  const regulation = Number(/const POSSESSION_SEC = (\d+);/.exec(SRC)?.[1]);
  it('the hub says first to 21, the mode\'s own regulation clock, and overtime on a tie', () => {
    const d = MODE_MENU_META.hoops3v3.desc;
    expect(regulation).toBe(90);
    expect(d).toMatch(/First to 21/);
    expect(d).toContain(`${regulation}-second clock`);
    expect(d).toMatch(/tie goes to overtime: next bucket wins/);
    expect(SRC).toMatch(/const TARGET_SCORE = 21;/);
  });
  it('the scorebug\'s clock chip names the period in overtime; the card\'s headline says it was decided there', () => {
    expect(HOST).toMatch(/hud\.period === 'string' && hud\.period \? `\$\{hud\.period\} ` : ''\}\$\{hud\.time\}s`/);
    expect(HOST).toMatch(/headline: overtimeHeadline\(won, Number\(r\.stats\?\.overtimes \?\? 0\)\) \?\? /);
  });
});
