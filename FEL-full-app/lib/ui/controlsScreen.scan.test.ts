// CONTROLS SCREEN GUARD (controls-screen, console-view lane, 2026-10-06). Owner: "take off that wall of text when the game
// starts, maybe have that show as a beginning screen for the controls" — during play NOTHING static, every mode.
//
// What it holds, by reading the sources (nothing type-checks a hint's wording):
//   1. every `hint` literal any mode file can write is SORTED — a static button map (lib/babylon/ui/staticControls.ts,
//      kept off the play screen) or a live prompt (the allow-list below, left on it). A new hint fails here until it is
//      sorted, so a new wall of text cannot reach the play screen by default;
//   2. every static entry still matches its mode's source word for word (a reworded line would silently come back);
//   3. the harness is the one door a hint reaches a host through, and it strips there; no host draws a hint any other
//      way, and the board / timing hosts' own control line goes to the CONTROLS panel only.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STATIC_CONTROLS, isStaticControlsHint } from '../babylon/ui/staticControls';
import { hintLiterals } from './hintLiterals';

const ROOT = path.resolve(__dirname, '../..');
const MODES = path.join(ROOT, 'lib/babylon/modes');
const GAMES = path.join(ROOT, 'components/games');
const read = (p: string) => readFileSync(p, 'utf8');

/** LIVE prompts: what to do NOW, a picker's lobby line, a phase's own call, a reaction to play. Stay on screen. */
const LIVE: readonly string[] = [
  // dunk + dunk duel — the run, the beat, the judges (runwayTeachLine / takeoffTell come from core and are live too)
  'RUNNING THE ${} — the jump is at its front end', 'HOLD to run — come in FASTER: the run-up buys your air', 'HOLD to run — then tap jump',
  'CATCH IT!', 'SLAM — OR WAIT FOR THE BEAT', 'WINDOW OPEN', 'NOW!', 'THE JUDGES CONFER…', "PRIME'S CARD…",
  'HOLD to run — then tap jump · LOOK stick orbits the camera',   // the watchdog's reset, once it has put you back on the line
  '${} — ON THE RUN', 'HOLD — running to the rim · GATHER (L2) to go up off two feet · steer with the stick · release early to jump from here',
  'WAIT FOR IT…', 'RUN! HOLD to run — then tap jump', "${} — THE RIVAL'S DUNK", '${} — HE NEEDS ${} TO TAKE IT',
  '${} — take the device${}', 'HOLD — running to the rim · steer with the stick · release early to jump from here', 'SLAM!',
  // (integration-2) the cut's skip, the replay's skip, what FLASHY asks for once it is picked, the duel's match-length picker
  'HIGHLIGHTS — A / B GOES TO THE CUT', 'REPLAY ${}/${} · ${} — A skips', 'FLASHY — throw a trick in the air (${}) or the judges see a POWER dunk',
  'B — MATCH LENGTH: ${} DUNKS EACH (2 / 3 / 5) · any other button starts',
  // hoops — the ref, and (integration-2) the hoops lane's ONE LINE FOR THE STATE YOU ARE IN (onevoneRules / threevthreeRules
  // hintFor, owner picks 1v1 #1 and 3v3 #7): each line is keyed to what is happening now — the ball loose, a shot up, a
  // gather, a flight, a post-up, the rim in reach, standing set, dribbling, defending — and changes as play does
  'GET OUT OF THE PAINT',
  'LOOSE BALL — GO GET IT · L1 BOXES OUT', 'SHOT UP — L1 BOX OUT · TRIANGLE (I) TO CONTEST', 'HE IS GATHERING — TRIANGLE (I) TO BLOCK',
  'STAY IN FRONT · SQUARE (L) STEAL ON THE CROSSOVER · HOLD CIRCLE (K) TAKE THE CHARGE', 'SQUARE AT THE RIM — TIME THE FLUSH',
  'FLICK THE RIGHT STICK FOR A TRICK', 'LET GO OF SQUARE (L) IN THE GREEN · EARLY = PUMP FAKE', 'GO GET THE BOARD · L1 BOXES OUT',
  'POST: SQUARE HOOK · STICK OFF THE RIM + SQUARE FADE · SWING THE STICK = SPIN', 'R2 + SQUARE (SHIFT + L) = DUNK · SQUARE (L) ALONE = LAY IT IN',
  'TAP THE STICK TO JAB · SQUARE (L) SHOOT · L2 (F) POST UP', 'RIGHT STICK = DRIBBLE MOVES · R2 (SHIFT) SPRINT · SQUARE (L) SHOOT',
  'LOOSE BALL — GO GET IT · L1 (Q) BOXES OUT', 'SHOT UP — HOLD L1 (Q) TO BOX OUT YOUR MAN', 'THEY SWUNG IT — CLOSE OUT ON THE CATCH',
  'STAY IN FRONT OF THE RING · SQUARE (L) POKE · HOLD CIRCLE (K) TAKE THE CHARGE', 'GO GET THE BOARD · L1 (Q) BOXES OUT',
  'CRASH THE GLASS · HOLD L1 (Q) TO BOX OUT', 'GET OPEN · BOTTOM BUTTON (J) CALLS FOR THE BALL',
  'TAP THE STICK TO JAB · BOTTOM BUTTON (J) PASS · CIRCLE (K) SCREEN', 'LEAN THE STICK AT A MATE + J TO PASS · CIRCLE (K) SCREEN · SQUARE (L) SHOOT',
  // combat — the pick screen
  'D-PAD or STICK up/down — pick FISTS or STAFF (rival takes the other) · any attack button to lock in',
  // football — the snap, the kick, the blitz
  'THE KICK IS UP — get under the ring, press A as it LANDS', 'READ THE FRONT — push ▲/W to SNAP', 'SHOWING BLITZ — snap into it, or wait him out',
  // the lobbies: a picker that says what pressing does to it right now
  '${} gaps · par ${}s · high line +${}${}  ·  ◀ ▶ tier · ▲ ▼ track · any face button starts',
  'one event, solo vs the rival · ▲ ▼ picks the event · ◀ back · any face button starts',
  'two on one screen · you take turns on every event · ▶ PRACTICE · any face button starts',
  'solo vs the rival · ◀ ▶ adds a player or PRACTICE · any face button starts',
  'two on one screen · P1 faces, P2 arrows · any face button starts', 'solo · ◀ ▶ adds a player · any face button starts',
  'A starts ${} · ◀ ▶ choose', 'held by ${} — take it', 'memorise…', '${} · A next', 'P1: A B X Y · P2: ▲ ▶ ◀ ▼', 'A B X Y answer',
  // brain brawl (integration-2): the review round's lobby and its loading / empty notes, the spin's call, a seat's ready, overtime
  'A starts · ${} questions from what you learned · best ${}', 'finding what you learned…',
  'No learned quiz cards yet — answer a few in the Learn feed. Here is a standard brawl.',
  '${}${} spins · hold for a bigger spin', '${} ready · memorise…', '${} OVERTIME · +${} s',
  // the carnival: each event's one line, at that event (the hub changes event under you)
  'HOLD CHARGE, release in the gold band for a make', 'Mash GO / TRICK / POWER on the bag — mix all three for a bonus',
  'POP, flip in the air — stick sideways + TRICK spins — chain combos before you land', 'Aim for the corners, GO to power, GO to shoot — beat the keeper',
  'Sprint the pattern — clear it and a fresh one drops', 'Watch the wind-up — ONE tap of GO at the last instant to counter',
  // dance — the GO line (its host draws no hint)
  'Your song is the band — hit on the beat and each of your own parts joins it', 'Every move family is an instrument — hit on the beat and the band builds',
  // kart / plane — the rocket start's timing before GO, a jump's call; (integration-2) the plane's course flyover and its skip
  'THROTTLE DOWN ON "2" AND HOLD IT FOR A ROCKET START — ON "3" IT BOGS', 'GRIP THE WHEEL ON "2" AND HOLD IT FOR A ROCKET START — ON "3" IT BOGS',
  'GAS DOWN ON "2" AND HOLD IT FOR A ROCKET START — ON "3" THE ENGINE BOGS', 'ARMS SPREAD ON "2" AND HOLD THEM FOR A ROCKET START — ON "3" THE ENGINE BOGS',
  'TRICK!', 'AIR', 'COURSE FLYOVER — A TO SKIP',
  // sprint (integration-2): the line follows the race — before GO the false-start warning, in the last 20 m the dip at the tape
  'Do NOT tap before GO — then alternate D-PAD ←/→ in rhythm.', 'Alternate ←/→ · D-PAD ▲ inside the last ${} m dips at the tape.',
  // golf / derby / penalty — the shot in hand, the clutch, the keeper
  'FINAL SHOT — study the green', 'HOLE ${} · PAR ${} — ${}m out', 'SWING at the top for POWER', 'NOW — strike in the accuracy band!',
  'FINAL PITCH — STRIKE as it crosses the plate', 'KICK at the top of the wave', "HE'S READING THAT SIDE — vary it",
  'THEIR KICK — read the run-up · dive ◀ / ▶ as he strikes · a straight run-up goes down the middle: ▼ stay big, ▲ spring for the chip${}',
  'Snap the stick side-to-side to FEINT (max 2) · aim · KICK twice', 'OVERDRIVE — A on the loose ball', 'A — hit it again',
  '${} · ${}',   // the classic pens' line under the round's pressure call (PenaltyLoop CLASSIC_HINT), the kick in hand like its line above
  // not hints at all: a boost gauge's caption (boost-hud.tsx), and the strings a hint's condition compares against
  'HOLD RB · SHIFT', 'LANDINGS FILL IT · RB ON PAD / TOUCH', 'DRIFTS FILL IT · RB ON PAD / TOUCH', 'CLOSE PASSES FILL IT · RB ON PAD / TOUCH',
  'rival', 'mine', 'defense', 'gather', 'shot', 'Ready', 'Set',
  'LET GO OF SQUARE', 'SQUARE AT THE RIM', 'FLICK THE RIGHT STICK', 'HE IS GATHERING', 'SHOT UP',   // onevoneRules hintUrgent's prefixes
];

/** Code no route runs (each file says so, or nothing registered imports it). Checked below to stay unreachable. */
const DEAD_FILES = ['GolfMode.ts', 'SoccerMode.ts', 'BaseballMode.ts', 'TimingSportMode.ts', 'modeConfigs.ts'];
/** The old precision TennisMode's lines. precisionModes.ts kept it as a reference ("⚠️ DEAD CODE — NOT THE TENNIS THE GAME
 *  RUNS") until the golf lane deleted it (IMPROVE 2026-10-06, Golf #20); the dead-files check below holds it deleted. */
const DEAD_LITERALS = ['MATCH POINT — build the rally, then put it away', 'SWING as the ball reaches you · stick UP = topspin · stick DOWN = lob'];

const modeFiles = readdirSync(MODES).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
const literalsOf = (f: string) => hintLiterals(read(path.join(MODES, f)));

describe('controls screen — every hint a mode can write is sorted, static or live', () => {
  it('the scan reads the shapes modes write (a scan that finds nothing proves nothing)', () => {
    const all = modeFiles.flatMap((f) => literalsOf(f));
    expect(all.length).toBeGreaterThan(100);
    // the shapes: `hint: '…'`, a ternary across lines, a const, a function, a template
    const texts = new Set(all.map((h) => h.text));
    for (const t of ['NOW!', 'HOLD to run — come in FASTER: the run-up buys your air', 'A B X Y answer',
      'A · B · X · Y pick the answer — faster is worth more', 'HOLE ${} · PAR ${} — ${}m out']) expect(texts.has(t), t).toBe(true);
    // and not a type annotation or a boostHint
    expect(hintLiterals("interface X { hint: string; boostHint: 'no' }")).toEqual([]);
  });

  it('every literal is a listed static map or a listed live prompt — a new one must be sorted before it ships', () => {
    const live = new Set(LIVE);
    const unsorted: string[] = [];
    for (const f of modeFiles) {
      if (DEAD_FILES.includes(f)) continue;
      for (const h of literalsOf(f)) {
        if (isStaticControlsHint(h.text) || live.has(h.text) || DEAD_LITERALS.includes(h.text)) continue;
        unsorted.push(`${f}:${h.line} ${JSON.stringify(h.text)}`);
      }
    }
    expect(unsorted).toEqual([]);
  });

  it('no line is both: a live prompt is never stripped', () => {
    for (const l of LIVE) expect(isStaticControlsHint(l), l).toBe(false);
    for (const l of DEAD_LITERALS) expect(isStaticControlsHint(l), l).toBe(false);
  });

  it('every static entry is still its mode\'s words, letter for letter (a rewording would come back on screen)', () => {
    const missing: string[] = [];
    for (const s of STATIC_CONTROLS) {
      const texts = new Set(literalsOf(s.file).map((h) => h.text));
      if (!texts.has(s.text)) missing.push(`${s.mode} (${s.file}): ${s.text.slice(0, 60)}…`);
    }
    expect(missing).toEqual([]);
    // and each names a registered mode the card slot knows
    const registry = read(path.join(MODES, 'registry.ts'));
    for (const s of STATIC_CONTROLS) expect(registry, s.mode).toMatch(new RegExp(`\\n\\s*${s.mode}: \\w+Mode,`));
  });

  it('the dead files stay dead: nothing registered imports them', () => {
    const registry = read(path.join(MODES, 'registry.ts'));
    for (const f of DEAD_FILES.filter((x) => x !== 'modeConfigs.ts')) expect(registry, f).not.toContain(`'./${f.replace(/\.ts$/, '')}'`);
    // modeConfigs' hint fields are read by TimingSportMode alone
    const readers = modeFiles.filter((f) => /\bcfg\.hint\b|_CONFIG\.hint\b/.test(read(path.join(MODES, f))));
    expect(readers).toEqual(['TimingSportMode.ts']);
    // the dead precision TennisMode is deleted (golf lane, Golf #20) and stays deleted, its lines with it; tennis is TennisMode.ts
    expect(read(path.join(MODES, 'precisionModes.ts'))).not.toMatch(/\bconst TennisMode\b/);
    const precision = new Set(literalsOf('precisionModes.ts').map((h) => h.text));
    for (const l of DEAD_LITERALS) expect(precision.has(l), l).toBe(false);
    expect(registry).toMatch(/import \{ TennisMode \} from '\.\/TennisMode';/);
  });
});

describe('controls screen — nothing static reaches the play screen', () => {
  const harness = read(path.join(ROOT, 'lib/babylon/core/ModeHarness.ts'));
  const hosts = readdirSync(GAMES).filter((f) => f.endsWith('.tsx'));

  it('the harness hands every HUD update to the host through the strip, and has no other door', () => {
    expect(harness).toMatch(/opts\.onHud\?\.\(stripStaticControls\(update\)\);/);
    expect([...harness.matchAll(/opts\.onHud\?\.\(/g)].length).toBe(1);
  });

  it('every host that draws `hud.hint` gets its HUD from runMode\'s onHud (the stripped stream)', () => {
    const drawers = hosts.filter((f) => /\bhud\.hint\b/.test(read(path.join(GAMES, f))));
    expect(drawers.length).toBeGreaterThanOrEqual(12);   // aero, brainbrawl, carnival, duel, dunk, dunkduel, football, freerun, mixed, 3v3, kart, who-scene-it
    const legacy = new Set(['dunk-game-3d.tsx']);   // the pre-Babylon dunk (its `hint` is a trick glyph, not the HUD's)
    const bad = drawers.filter((f) => !legacy.has(f)).filter((f) => {
      const src = read(path.join(GAMES, f));
      return !/\brunMode\(/.test(src) || !/onHud:\s*\(u\)\s*=>[^\n]*\bsetHud\(/.test(src);
    });
    expect(bad).toEqual([]);
  });

  it('no host types a static map into its markup', () => {
    const typed: string[] = [];
    for (const f of hosts) {
      const src = read(path.join(GAMES, f));
      for (const s of STATIC_CONTROLS) if (src.includes(s.text.slice(0, 40))) typed.push(`${f}: ${s.text.slice(0, 40)}`);
    }
    expect(typed).toEqual([]);
  });

  it('the board and timing hosts\' control line goes to the CONTROLS panel, never onto the play screen', () => {
    for (const f of ['board-babylon.tsx', 'timing-babylon.tsx']) {
      const src = read(path.join(GAMES, f));
      const uses = [...src.matchAll(/opts\.hint\b/g)].length;
      expect(uses, f).toBe(1);
      expect(src, f).toMatch(/controls=\{opts\.hint\}/);
    }
  });

  it('the READY card and the pause both carry the panel, and the old collapsed BUTTONS line is gone', () => {
    const splash = read(path.join(GAMES, 'boot-splash.tsx'));
    expect(splash).toMatch(/<ControlsPanel modeId=\{props\.modeId\} hint=\{props\.controls\}/);
    expect(splash).toMatch(/<PausedLayer onResume=\{props\.onStart\} modeId=\{props\.modeId\} hint=\{props\.controls\} \/>/);
    expect(read(path.join(GAMES, 'paused-layer.tsx'))).toMatch(/\{modeId && <ControlsPanel modeId=\{modeId\} hint=\{hint\} chooser=\{false\}/);
    expect(read(path.join(GAMES, 'card-slot.tsx'))).not.toMatch(/BUTTONS \{open/);
  });
});
