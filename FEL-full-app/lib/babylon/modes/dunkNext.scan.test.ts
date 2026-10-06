// dunk-next (docs/DUNK-NEXT.md) — DunkMode wiring scan. The rules are tested where they live (core/DunkBeats, core/DunkCard,
// core/RivalPlay); this pins that the mode actually plays them: the bar is heard and drawn, every trick press is graded, the card
// reads the beats, and the rival hits his beats on a clean attempt.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DUNK = readFileSync(path.join(__dirname, 'DunkMode.ts'), 'utf8');
const HOST = readFileSync(path.join(__dirname, '../../../components/games/dunk-babylon.tsx'), 'utf8');
const SIM = readFileSync(path.join(__dirname, '../core/DunkRivalSim.ts'), 'utf8');
const fn = (name: string): string => { const i = DUNK.indexOf(`function ${name}(`); expect(i, name).toBeGreaterThan(0); return DUNK.slice(i, DUNK.indexOf('\n  }\n', i)); };

describe('phase 1 — the flight is a four-beat bar', () => {
  it('each beat crossed in the flight ticks (the slam keeps its own NOW!) and lights the strip', () => {
    expect(DUNK).toMatch(/for \(const b of beatsCrossed\(prevClip, clipTime\)\) \{\n\s*beatAt = BEAT_ORDER\.indexOf\(b\);\n\s*if \(b !== 'slam'\) SoundKit\.play\('uiTick', \{ pitch: BEAT_TICK_PITCH\[b\], volume: BEAT_TICK_VOLUME \}\);\n\s*pushBeats\(ctx\);/);
  });
  it('the strip is sent on change only, and cleared with the attempt', () => {
    expect(fn('pushBeats')).toMatch(/if \(s !== beatStripSent\) \{ beatStripSent = s; ctx\.setHud\(\{ beats: s \}\); \}/);
    expect(fn('resetForNextAttempt')).toMatch(/clearBeats\(ctx\)/);
    expect(fn('launchDunk')).toMatch(/beatAt = -1; beatMarks = \[\]; armedGrade = null; beatSlam = null; pushBeats\(ctx\);/);
  });
  it('every trick press is graded: an armed one keeps its grade for the beat it fires on, a fired one is graded on the press', () => {
    const air = fn('airButton');
    expect(air).toMatch(/armedAir = trick;\n\s*armedGrade = gradeTrickPress\(trick, clipTime, beatTol\(\)\);/);
    expect(air).toMatch(/armedAir = SPIN_720; armedGrade = gradeTrickPress\(SPIN_720, clipTime, beatTol\(\)\);/);
    expect(air).toMatch(/fireTrick\(ctx, trick, 'window', gradeTrickPress\(trick, clipTime, beatTol\(\)\)\)/);
    expect(air).toMatch(/upgradeTo720\(ctx, gradeTrickPress\(SPIN_720, clipTime, beatTol\(\)\)\)/);
    const fire = fn('fireTrick');
    expect(fire).toMatch(/const g = how === 'armed' \? armedGrade : grade;/);
    // the mark goes on only once the flight has taken the trick
    expect(fire.indexOf('beatMarks = [...beatMarks')).toBeGreaterThan(fire.indexOf('const got = flight.take(trick);'));
    expect(fire.indexOf('beatMarks = [...beatMarks')).toBeGreaterThan(fire.indexOf('if (!got) {'));
  });
  it('the tolerance widens with the TV factor, like the slam window', () => {
    expect(DUNK).toMatch(/const beatTol = \(\): number => BEAT_TOL_SEC \* tvFactor;/);
  });
  it('the slam is the fourth beat; a flight with no slam says so', () => {
    expect(fn('slamNow')).toMatch(/beatSlam = slamTiming\.zone; pushBeats\(ctx\);/);
    expect(fn('resolveDunk')).toMatch(/if \(!beatSlam\) \{ beatSlam = 'miss'; pushBeats\(ctx\); \}/);
  });
  it('the card reads the beats: execution for each on the beat, style for a perfect flight, and the judges are told', () => {
    const fin = fn('finishAttempt');
    expect(fin).toMatch(/const flow = flightFlow\(beatMarks, beatSlam\);/);
    expect(fin).toMatch(/beatExec: flow\.beatExec, flowStyle: flow\.flowStyle[ +a-z.]*,/);   // (phase 2 adds the freshness on top)
    expect(fin.indexOf('const flow = flightFlow(')).toBeLessThan(fin.indexOf('} = dunkCard({'));
    expect(fin).toMatch(/if \(flow\.perfect\) verdictParts\.push\('PERFECT FLIGHT'\);/);
    expect(fin).toMatch(/const airBits = \[[^\]]*flow\.label/);
  });
  it('the practice runway says how the beats went', () => {
    expect(fn('finishPractice')).toMatch(/flightFlow\(beatMarks, beatSlam\)\.label/);
  });
  it('the rival hits his beats on a clean attempt, and is the old pad otherwise', () => {
    // test changed (dunk-next phase 4): the roll moved, line for line, into core/DunkRivalSim.rollRivalAttempt so a skipped dunk is judged
    // from the same plan; DunkRivalSim.test holds the move against the old body
    expect(fn('planRivalAttempt')).toMatch(/const P = rollRivalAttempt\(sit, foe\);\n\s*rivalPlan = P;/);
    expect(SIM).toMatch(/onBeat: rivalHitsBeats\(acc, blew\)/);
    expect(fn('rivalDrive')).toMatch(/clipTime >= rivalPressAt\(next, after, P\.onBeat\)/);
    expect(fn('rivalDrive')).toMatch(/const after = F\.trickIdx === 0 \? 0\.06 : \(airTrick \? airTrick\.t0 \+ 0\.12 : Infinity\);/);
  });
  it('the host draws the strip above the hint, and stands it aside for the cut and the judges', () => {
    expect(HOST).toMatch(/import \{ DunkBeatStrip \} from '\.\/dunk-beat-strip';/);
    expect(HOST).toMatch(/hud\.beats && phase === 'playing' && !judging && !\(typeof hud\.cut === 'string' && hud\.cut\)/);
    expect(HOST).toMatch(/<DunkBeatStrip value=\{hud\.beats\} \/>/);
  });
});

describe('phase 2 — originality, judged and cheered', () => {
  it('a made dunk is read against the night BEFORE the night remembers it, by whoever threw it', () => {
    const fin = fn('finishAttempt');
    // test changed (dunk-next phase 5): with four dunkers each is remembered by his own id (was 'rival' for whoever the rival was)
    expect(fin).toMatch(/const dunker: Dunker = turn === 'rival' \? foe\.id : 'player';/);
    const read = fin.indexOf('const fresh = nightMemory.read(elements, dunker);');
    const show = fin.indexOf('nightMemory.show(elements, dunker);');
    expect(read).toBeGreaterThan(0);
    expect(show).toBeGreaterThan(read);
    // …and only a MADE dunk: the miss path returns before the read
    expect(fin.indexOf('if (!made) {')).toBeLessThan(read);
    expect(fin.slice(fin.indexOf('if (!made) {'), read)).toMatch(/return;\n\s*\}\n/);
  });
  it('freshness pays style, a whole copy is SEEN IT, and the panel, the why-line, the announcer and the mic all hear it', () => {
    const fin = fn('finishAttempt');
    expect(fin).toMatch(/const seenIt = isRepeat \|\| fresh\.copiedWhole;/);
    expect(fin).toMatch(/repeat: seenIt, execution01: qteAccuracy,/);
    expect(fin).toMatch(/flowStyle: flow\.flowStyle \+ fresh\.style,/);
    expect(fin).toMatch(/FRESH \$\{Math\.round\(fresh\.freshness01 \* 100\)\}%\$\{seenIt \? ' · SEEN IT' : ''\}/);
    expect(fin).toMatch(/seen: seenIt, dunker:/);
    expect(fin).toMatch(/micMake\(theName, [^;]*, seenIt\)/);
    // test changed (dunk-next phase 5): a copy is named after whoever showed it first (with four dunkers, not always the man beside you)
    expect(fin).toMatch(/originalityLine\(fresh, copierName\(fresh, dunker\)\)/);
    expect(fn('copierName')).toMatch(/const by = key \? nightMemory\.firstBy\(key\) : null;/);
  });
  it('the dunk\'s elements: its tricks, the runway, the prop, a parkour launch, the foot, the range, the side, the hang', () => {
    const fin = fn('finishAttempt');
    expect(fin).toMatch(/tricks: flight\.attempt\.tricks\.map/);
    expect(fin).toMatch(/runway: \[\.\.\.runwayLabels/);
    expect(fin).toMatch(/prop: prop !== 'none' \?/);
    expect(fin).toMatch(/foot: launchFoot, range: rangeLabel\(launchRange\), side: launchSide, hang: hangBonus > 0,/);
    expect(fn('launchDunk')).toMatch(/launchRange = takeoffRange; launchSide = approach\.label\.split\(' · '\)\[0\];/);
  });
  it('a new night forgets, and the practice runway never shows the building anything', () => {
    expect(DUNK.match(/nightMemory\.reset\(\); refreshTips\(\);/g)).toHaveLength(2);
    expect(fn('goAgain')).toMatch(/nightMemory\.reset\(\)/);
    const fin = fn('finishAttempt');
    expect(fin.indexOf('finishPractice(ctx, made); return;')).toBeLessThan(fin.indexOf('nightMemory.show('));
    expect(fn('finishPractice')).not.toMatch(/nightMemory/);
  });
  it('the air says NEW, the runway tip counts what is fresh, the call says FRESH / SEEN TONIGHT', () => {
    expect(fn('fireTrick')).toMatch(/const firstTonight = !nightMemory\.shown\(`trick:\$\{trick\.id\}`\);/);
    expect(fn('fireTrick')).toMatch(/\(firstTonight \? ' · NEW' : ''\)/);
    expect(DUNK).toMatch(/const tip = idleTip\(idleSec, standingTips\);/);
    expect(fn('refreshTips')).toMatch(/standingTips = \[\.\.\.RUNWAY_TIPS, freshTip\(nightMemory, DUNK_TRICKS\)\];/);
    expect(DUNK).toMatch(/seenTonight \? 'SEEN TONIGHT' : 'FRESH TONIGHT'/);
  });
});

describe('phase 3 — the dunk-off', () => {
  it('a tied final goes to a dunk-off instead of the silent tie rule; a dunk-off is decided by its own two cards', () => {
    const adv = fn('advanceAfterRivalTurn');
    const tie = adv.indexOf("cardVerdict({ playerTotal, rivalTotal }) === 'tied') { startDunkOff(ctx, 1); return; }");
    expect(tie).toBeGreaterThan(0);
    // test changed (dunk-next phase 5): the night's end moved into endNight() (the cut ends a night too) — the tie still comes first
    expect(tie).toBeLessThan(adv.indexOf('endNight(ctx, won);'));
    expect(fn('endNight')).toMatch(/setPhase\('contestOver'\);/);
    // test changed (owner decision 2026-10-06, "Endless dunk-offs"): was `dunkOffVerdict(dunkOffPlayer, dunkOffRival, dunkOff)` with the
    // up-to-3-then-the-player rule; the verdict now reads both dunk-off CARDS (the judges' declared tiebreak) and the night's best (the cap)
    expect(adv).toMatch(/const d = dunkOffDecide\(dunkOffCards\.player \?\? dunkOffPlayer, dunkOffCards\.rival \?\? dunkOffRival, dunkOff, nightBest\);/);
    expect(adv).toMatch(/const v = d\.verdict;/);
    expect(adv).toMatch(/if \(v === 'again'\) \{ startDunkOff\(ctx, dunkOff \+ 1\); return; \}/);
    expect(adv.indexOf('if (round < TOTAL_ROUNDS) {')).toBeLessThan(tie);   // only after the final round
  });
  it('one dunk each, the player first and the rival answering', () => {
    expect(DUNK).toMatch(/const dunksThisRound = \(\): number => \(dunkOff > 0 \? 1 : DUNKS_PER_ROUND\);/);
    const adv = fn('advanceAfterJudging');
    expect(adv).toMatch(/if \(rivalDunkNum < dunksThisRound\(\)\)/);
    expect(adv).toMatch(/if \(dunkInRound < dunksThisRound\(\)\)/);
    expect(fn('startDunkOff')).toMatch(/dunkInRound = 0; stakes = freshStakes\(\);/);
  });
  it('a dunk-off NEVER touches the night\'s totals or the staked card (the arena checks the card against the score)', () => {
    const fin = fn('finishAttempt');
    expect(fin).toMatch(/if \(dunkOff > 0\) \{ if \(turn === 'rival'\) dunkOffRival = missTotal; else dunkOffPlayer = missTotal;/);
    // the make: the dunk-off's card, ELSE (the whole night's bookkeeping: the totals and the staked card, as before)
    const mk = fin.indexOf('if (dunkOff > 0) { if (rivalsDunk) dunkOffRival = dunkTotal; else dunkOffPlayer = dunkTotal; }');
    expect(mk).toBeGreaterThan(0);
    const night = fin.slice(mk, fin.indexOf('// Hype is fed by the QUALITY', mk));
    expect(night).toMatch(/\}[^\n]*\n\s*else \{\n\s*if \(rivalsDunk\) rivalTotal \+= dunkTotal;\n\s*else \{ playerTotal \+= dunkTotal;/);
    expect(night).toMatch(/if \(!rivalsDunk\) card = addAttempt\(card, \{[\s\S]*\}\);\n\s*\}\n\s*$/);
    // the miss's card entry is inside the non-dunk-off branch
    const miss = fin.slice(fin.indexOf('if (dunkOff > 0) { if (turn === \'rival\') dunkOffRival = missTotal'), fin.indexOf('lastScores = missScores;'));
    expect(miss).toMatch(/else if \(turn === 'rival'\) rivalTotal \+= missTotal;[^\n]*\n\s*else \{\n\s*playerTotal \+= missTotal;/);
  });
  it('the rival in a dunk-off chases the one card in front of him, with nothing left after it', () => {
    // test changed (dunk-next phase 4): the situation moved into rivalSituation(), which the live plan and a skip both read
    expect(fn('rivalSituation')).toMatch(/deficit: dunkOffRival - dunkOffPlayer, isFinalRound: true, attemptsLeft: 1/);
    expect(fn('planRivalAttempt')).toMatch(/const sit = rivalSituation\(\);/);
  });
  it('a new night (and a reload) has no dunk-off', () => {
    expect(DUNK.match(/dunkOff = 0; dunkOffPlayer = 0; dunkOffRival = 0;/g)).toHaveLength(2);
    expect(fn('goAgain')).toMatch(/dunkOff = 0;/);
  });
  it('the host shows the dunk-off\'s cards on the bezel and on the night card', () => {
    expect(HOST).toMatch(/hud\.dunkOff && \(/);
    expect(HOST).toMatch(/hud\.nightDunkOff/);
  });
});

describe('endless dunk-offs (owner decision 2026-10-06)', () => {
  it('each dunk-off card keeps the three numbers the tiebreak reads — made and missed — and never the night\'s totals', () => {
    const fin = fn('finishAttempt');
    expect(fin).toMatch(/if \(dunkOff > 0\) dunkOffCards\[turn === 'rival' \? 'rival' : 'player'\] = \{ total: missTotal, execution: 0, difficulty: missDiff, style: missStyle \};/);
    expect(fin).toMatch(/if \(dunkOff > 0\) dunkOffCards\[rivalsDunk \? 'rival' : 'player'\] = \{ total: dunkTotal, execution, difficulty, style: styleScore \};/);
    expect(fin.match(/noteBest\(/g)).toHaveLength(2);
  });
  it('a new dunk-off clears its cards and names the declared criterion; a new night clears the best and the by-line', () => {
    expect(fn('startDunkOff')).toMatch(/dunkOffCards = \{ player: null, rival: null \};/);
    expect(fn('startDunkOff')).toMatch(/const rule = dunkOffRuleLine\(n\);/);
    expect(DUNK.match(/dunkOffCards = \{ player: null, rival: null \}; nightBest = \{ player: 0, rival: 0 \}; dunkOffBy = '';/g)).toHaveLength(2);
    expect(fn('showNightCard')).toMatch(/dunkOffBy \? ` · \$\{dunkOffBy\}` : ''/);
  });
  it('the old "after 3, the player wins" limit is gone from the mode', () => {
    expect(DUNK).not.toMatch(/DUNK_OFF_MAX/);
    expect(DUNK).not.toMatch(/dunkOffVerdict\(/);
  });
});

describe('phase 4 — skip a rival\'s dunk straight to his card', () => {
  it('B on his turn skips (before the cut-skip and the refusal read it); the K key is B; the refusal says how', () => {
    const skipAt = DUNK.indexOf("if (!aiFeeding && turn === 'rival' && e.t === 'button' && e.btn === 'B' && e.pressed) { skipRivalDunk(ctx); return; }");
    expect(skipAt).toBeGreaterThan(0);
    expect(skipAt).toBeLessThan(DUNK.indexOf("if (e.pressed && cutting) { replay.stop();"));
    expect(skipAt).toBeLessThan(DUNK.indexOf(`refuse(ctx, "RIVAL'S TURN · B SKIPS TO HIS CARD")`));
  });
  it('a dunk not judged yet is judged by the sim from the plan he is ON — not re-rolled — and a retried miss\'s beat rolls the next', () => {
    const sk = fn('skipRivalDunk');
    expect(sk).toMatch(/const onPlan = phase === 'judging' \? null : rivalPlan;/);
    expect(sk).toMatch(/simRivalDunk\(onPlan, stakes, \(\) => rollRivalAttempt\(sit, foe\), rivalJudgeCtx\(\)\)/);
    // the live attempt's deferred beats die BEFORE he is parked, and the park does not roll a plan
    expect(sk.indexOf('modeGen++')).toBeLessThan(sk.indexOf('resetForNextAttempt(ctx)'));
    expect(sk).toMatch(/holdRivalPlan = true; try \{ resetForNextAttempt\(ctx\); \} finally \{ holdRivalPlan = false; \}/);
    expect(fn('resetForNextAttempt')).toMatch(/if \(!holdRivalPlan\) planRivalAttempt\(\);/);
  });
  it('a dunk already judged is never judged twice: the skip only ends the cut and hurries the reveal', () => {
    const sk = fn('skipRivalDunk');
    const scored = sk.indexOf('if (rivalScored) {');
    expect(scored).toBeGreaterThan(0);
    expect(scored).toBeLessThan(sk.indexOf('simRivalDunk('));
    expect(sk.slice(scored, sk.indexOf('return;', scored))).toMatch(/revealHold = true;/);
    const fin = fn('finishAttempt');
    expect(fin).toMatch(/if \(turn === 'rival'\) rivalScored = true;/);
    expect(fin).toMatch(/if \(rivalsDunk\) rivalScored = true;/);
    expect(fn('resetForNextAttempt')).toMatch(/rivalScored = false;/);
  });
  it('the sim judges under the room and rules the live rival is judged under', () => {
    const c = fn('rivalJudgeCtx');
    for (const k of ['styleId: style', 'styleTier: STYLE_TIER[style]', 'hype', 'crowd01: momentum.score01', 'slamHalf: slamWindowBase() / 2', 'runUp: rivalRunUp', 'memory: nightMemory', 'usedCombos']) expect(c).toContain(k);
    expect(fn('launchDunk')).toMatch(/if \(turn === 'rival'\) rivalRunUp = \{ charge, launchSpeed01, approachDifficulty: approach\.difficulty \+ prof\.difficulty,/);
  });
  it('the skipped card keeps the night\'s books as finishAttempt does — and a dunk-off\'s card stays off the totals', () => {
    const c = fn('commitRivalHighlight');
    expect(c).toMatch(/if \(dunkOff > 0\) \{ dunkOffRival = r\.total; dunkOffCards\.rival = \{[^}]*\}; \}\n\s*else rivalTotal \+= r\.total;/);
    expect(c).not.toMatch(/playerTotal|addAttempt|card = /);
    expect(c).toMatch(/noteBest\('rival', r\.total\);/);
    expect(c).toMatch(/reveal\.start\(r\.scores\); revealHold = true;/);
    expect(c).toMatch(/later\(\(\) => \{ clearBanner\(ctx\); void advanceAfterJudging\(ctx\); \}, MISS_BEAT_MS\);/);
  });
  it('the host shows a SKIP chip on his turn whose tap is a B; the mode raises and lowers it', () => {
    expect(HOST).toMatch(/hud\.rivalSkip === true && phase === 'playing' && !card && \(/);
    expect(HOST).toMatch(/const tapSkip = useCallback\(\(\) => \{\n\s*emit\(\{ t: 'button', btn: 'B', pressed: true \}\);\n\s*emit\(\{ t: 'button', btn: 'B', pressed: false \}\);/);
    expect(fn('rivalRound')).toMatch(/ctx\.setHud\(\{ rivalSkip: true \}\);/);
    expect(fn('endRivalTurn')).toMatch(/ctx\.setHud\(\{ rivalSkip: false \}\);/);
  });
});

describe('phase 5 — the four-dunker field, the cut, the final', () => {
  it('every judged dunk of the night is booked to the standings — and never a dunk-off', () => {
    const fin = fn('finishAttempt');
    expect(fin).toMatch(/if \(dunkOff === 0\) bookField\(ctx, turn === 'rival' \? foe\.id : PLAYER_ID, missTotal\);/);
    expect(fin).toMatch(/if \(dunkOff === 0\) bookField\(ctx, rivalsDunk \? foe\.id : PLAYER_ID, dunkTotal\);/);
    expect(fn('commitRivalHighlight')).toMatch(/if \(dunkOff === 0\) bookField\(ctx, foe\.id, r\.total\);/);
  });
  it('after the first round: the highlights, then the cut — once a night, before round 2', () => {
    const adv = fn('advanceAfterRivalTurn');
    const hl = adv.indexOf("if (field.length && fieldStage === 'round1') { runFieldHighlights(ctx); return; }");
    expect(hl).toBeGreaterThan(adv.indexOf('if (round < TOTAL_ROUNDS) {'));
    expect(hl).toBeLessThan(adv.indexOf('round++;'));
    const run = fn('runFieldHighlights');
    expect(run).toMatch(/setPhase\('fieldCut'\);/);
    expect(run).toMatch(/field = bookCard\(field, h\.id, r\.total\);/);
    expect(run).toMatch(/later\(\(\) => \{ if \(seq === cutSeq\) finishCut\(ctx\); \}, at\);/);
    expect(fn('finishCut')).toMatch(/fieldStage = 'cut';/);
  });
  it('a highlight dunker is judged by the phase-4 sim under his own temperament, id and repeat memory', () => {
    const fd = fn('fieldDunk');
    expect(fd).toMatch(/const temper = rivalById\(id\);/);
    expect(fd).toMatch(/simRivalDunk\(null, freshStakes\(\), \(\) => rollRivalAttempt\(sit, temper\), \{ \.\.\.rivalJudgeCtx\(\), dunker: id, usedCombos: combos \}\)/);
  });
  it('cut: the final is played as highlights and the night ends LOST; through: the other finalist walks out on his own total', () => {
    const fc = fn('finishCut');
    const out = fc.indexOf("if (!through.some((d) => d.id === PLAYER_ID)) {");
    expect(out).toBeGreaterThan(0);
    const outBlock = fc.slice(out, fc.indexOf('return;', out));
    expect(outBlock).toMatch(/simFinal\(field, \[a, b\], \(id, sit\) => fieldDunk\(id, sit\)\.total\)/);
    expect(outBlock).toMatch(/endNight\(ctx, false\);/);
    const thr = fc.slice(fc.indexOf('const opp = through.find'));
    expect(thr).toMatch(/if \(opp\.id !== foe\.id\) \{[\s\S]*foe = rivalById\(opp\.id\);[\s\S]*void swapRivalBody\(ctx, foe\);/);
    expect(thr).toMatch(/rivalTotal = fieldTotal\(opp\);/);
    expect(thr).toMatch(/round\+\+;/);
    expect(thr).toMatch(/resetForNextAttempt\(ctx\);/);
  });
  it('the staked card is untouched by the field: only the player\'s own dunks go on it, and the night sends playerTotal with it', () => {
    expect(fn('runFieldHighlights')).not.toMatch(/addAttempt|playerTotal|card =/);
    expect(fn('finishCut')).not.toMatch(/addAttempt|playerTotal \+?=|card =/);
    expect(fn('endNight')).toMatch(/ctx\.card\(won \? 'CONTEST_WON' : 'CONTEST_LOST', playerTotal, stats, detail\);/);
    expect(fn('endNight')).toMatch(/const detail = \{ card: forWire\(card\) \};/);
  });
  it('a new night (and a reload) draws a new field; the cut answers A / B and its watchdog', () => {
    expect(DUNK.match(/startField\(ctx\);/g)).toHaveLength(2);
    expect(fn('goAgain')).toMatch(/startField\(ctx\);/);
    expect(DUNK).toMatch(/if \(phase === 'fieldCut'\) \{ if \(e\.t === 'button' && e\.pressed && \(e\.btn === 'A' \|\| e\.btn === 'B'\)\) finishCut\(ctx\); return; \}/);
    expect(DUNK).toMatch(/case 'fieldCut': finishCut\(ctx\); break;/);
  });
  it('the host draws the field board in play and on the night card, and names a cut night', () => {
    expect(HOST).toMatch(/<DunkFieldBoard value=\{hud\.field\} compact \/>/);
    expect(HOST).toMatch(/<DunkFieldBoard value=\{hud\.field\} \/>/);
    expect(HOST).toMatch(/hud\.nightField\.startsWith\('CUT'\) \? 'CUT AT THE LINE'/);
  });
});

describe('owner decision 2026-10-06 — staked and ladder nights play the classic format', () => {
  it('the field is built per night from the run\'s URL (core/DunkField.nightFormat) — no global switch left', () => {
    const sf = fn('startField');
    expect(sf).toMatch(/nightFmt = nightFormat\(typeof location !== 'undefined' \? location\.search : ''\);/);
    expect(sf).toMatch(/field = nightFmt === 'field' \? newField\(foe\) : \[\];/);
    expect(DUNK).not.toMatch(/FIELD_ON/);
  });
  it('a classic night has no field, so it never reaches the highlights or the cut: round 2 follows round 1', () => {
    // every path into the cut is behind a field (the highlights are the only caller of finishCut's reel)
    expect(DUNK.match(/runFieldHighlights\(ctx\)/g)).toHaveLength(1);
    expect(fn('advanceAfterRivalTurn')).toMatch(/if \(field\.length && fieldStage === 'round1'\) \{ runFieldHighlights\(ctx\); return; \}/);
    expect(fn('bookField')).toMatch(/if \(!field\.length\) return;/);
    // the classic card is the integrity's own 2 × 2 (arena-score-integrity MIRRORED.dunkRounds × dunksPerRound)
    expect(DUNK).toMatch(/^const DUNKS_PER_ROUND = 2;$/m);
    expect(DUNK).toMatch(/^const TOTAL_ROUNDS = 2;$/m);
    expect(fn('endNight')).toMatch(/cardDunks\(nightFmt, round >= TOTAL_ROUNDS, TOTAL_ROUNDS, DUNKS_PER_ROUND\)/);
  });
});

describe('phase 7 — the live take-off read', () => {
  it('the run and the take-off read through ONE function with ONE set of inputs — the chip is what the card gets', () => {
    expect(fn('takeoffInputs')).toMatch(/return \{ x: p\.x, z: p\.z, rimX: rim\.x, rimZ: rim\.z, jOffsetX: curveOffset\(p\.z - gatherLine\(\)\), runUpPeak, gatherHeld, forceTwo: isDubble\(prop\) \};/);
    const ld = fn('launchDunk');
    expect(ld).toMatch(/const tread = takeoffRead\(takeoffInputs\(\)\);\n\s*const takeoffRange = tread\.rangeM;\n\s*const approach = tread\.read;/);
    expect(ld).not.toMatch(/approachBonus\(|approachAngle\(/);
    expect(fn('liveTakeoff')).toMatch(/const r = takeoffRead\(takeoffInputs\(\)\);/);
  });
  it('the player\'s run reads it every frame before the line can launch; the chip goes on change only, with a tick on a new zone', () => {
    const at = DUNK.indexOf("if (turn === 'player') liveTakeoff(ctx);");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(DUNK.indexOf('const line = gatherLine();', at));
    const lt = fn('liveTakeoff');
    expect(lt).toMatch(/if \(s === takeoffSent\) return;/);
    expect(lt).toMatch(/if \(takeoffSent && was && was !== r\.zone\) SoundKit\.play\('uiTick'/);
  });
  it('at the take-off the mark stays where he left the floor and the strip takes the HUD; the next attempt clears both', () => {
    expect(fn('launchDunk')).toMatch(/if \(turn === 'player'\) \{ placeTakeoffMark\(tread\); ctx\.setHud\(\{ takeoff: '' \}\); takeoffSent = ''; \}/);
    expect(fn('resetForNextAttempt')).toMatch(/clearTakeoff\(ctx\);/);
    expect(DUNK).toMatch(/takeoffMark\?\.dispose\(\); takeoffMark = null; takeoffMat\?\.dispose\(\);/);
  });
  it('the host draws the chip in the zone\'s colour, and gives the spot to the beat strip in the air', () => {
    expect(HOST).toMatch(/const t = decodeTakeoff\(hud\.takeoff\);/);
    expect(HOST).toMatch(/\(typeof hud\.beats === 'string' && hud\.beats\)\) return null;/);
    expect(HOST).toMatch(/style=\{\{ color: ZONE_HEX\[t\.zone\] \}\} data-fel-takeoff=\{t\.zone\}/);
  });
});

describe('phase 6 — challenges and unlocks', () => {
  it('practice without a challenge is never judged; with one, the card is computed off the night (no totals, card, stakes or memory)', () => {
    const fp = fn('finishPractice');
    expect(fp).toMatch(/const ch = challenge \? challengeRun\(ctx, made\) : '';/);
    const run = fn('challengeRun');
    for (const never of ['playerTotal', 'rivalTotal', 'addAttempt', 'card = ', 'spendAttempt', 'stakes', 'nightMemory', 'bookField', 'makes++', 'misses++']) expect(run, never).not.toContain(never);
  });
  it('the challenge card reads the same dunk facts the contest card reads', () => {
    const run = fn('challengeRun'), fin = fn('finishAttempt');
    for (const piece of [
      'runwayDifficulty + (signature?.nod ?? 0) + (doubleLaunched ? DOUBLE_LAUNCH.difficulty : 0)', 'propBonus: PROP_BONUS[prop]',
      'charge, launchSpeed01, styleTier: STYLE_TIER[style], styleTaps', 'execution01: qteAccuracy', 'beatExec: flow.beatExec',
    ]) { expect(run, piece).toContain(piece); expect(fin, piece).toContain(piece); }
    expect(fin).toMatch(/const trickDifficulty = flight\.attempt\.difficulty - STYLE_TIER\[style\];/);
    expect(run).toContain('trickDifficulty: flight.attempt.difficulty - STYLE_TIER[style]');
    expect(run).toMatch(/const flow = flightFlow\(beatMarks, beatSlam\);/);
  });
  it('L1 picks a challenge on the practice runway only; in the contest it is still the call', () => {
    const at = DUNK.indexOf("if (e.t === 'button' && e.btn === 'L1' && e.pressed && e.src !== 'key' && phase === 'approach' && practice && turn === 'player') cycleChallenge(ctx);");
    expect(at).toBeGreaterThan(0);
    expect(DUNK.slice(at, at + 400)).toMatch(/else if \(e\.t === 'button' && e\.btn === 'L1' && e\.pressed && phase === 'approach'\) \{\n\s*const i = stakes\.called/);
    expect(fn('togglePractice')).toMatch(/if \(!practice\) challenge = null;/);
  });
  it('the ladder gates the prop ring (named, never silent) and the d-pad celebrations', () => {
    expect(DUNK).toMatch(/const propAllowed = \(p: Prop\): boolean => [^\n]*&& refOpen\('prop', p, unlocks\);/);
    expect(DUNK).toMatch(/for \(let guard = 0; !propAllowed\(prop\) && guard < PROPS\.length; guard\+\+\) \{ refuse\(ctx, propLockLine\(prop\)\);/);
    expect(DUNK).toMatch(/if \(!refOpen\('celebration', CELEB_BY_DPAD\[e\.dir\], unlocks\)\) \{ refuse\(ctx, needLine\('celebration', CELEB_BY_DPAD\[e\.dir\], unlocks\)\); return; \}/);
  });
  it('only a WON night moves the ladder; the device is written, never with the dev override\'s all-open state', () => {
    expect(fn('endNight')).toMatch(/if \(won\) \{ const r = recordNightWon\(unlocks\); unlocks = r\.state; keepUnlocks\(\);/);
    expect(fn('keepUnlocks')).toMatch(/if \(!unlocksDev\) saveUnlocks\(deviceStore\(\), unlocks\);/);
    expect(fn('readUnlocks')).toMatch(/process\.env\.NODE_ENV === 'development'/);
    expect(DUNK).toMatch(/readUnlocks\(\); challenge = null;/);
  });
  it('the host: the challenge chip is a finger on L1, and the night card names what a win opened', () => {
    expect(HOST).toMatch(/const tapChallenge = useCallback\(\(\) => \{\n\s*emit\(\{ t: 'button', btn: 'L1', pressed: true \}\);/);
    expect(HOST).toMatch(/hud\.nightUnlock\.startsWith\('UNLOCKED'\)/);
  });
});
