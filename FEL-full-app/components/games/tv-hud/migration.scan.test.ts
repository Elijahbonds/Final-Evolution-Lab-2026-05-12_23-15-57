// THE HOST MIGRATION GUARD (A9.13, lane/tv-hud). A host moved onto the shared TV HUD must keep its information,
// controls and behaviour — presentation only — and must actually be on the system, not half on it.
//
//   - INFORMATION: every HUD key the host read before the migration (frozen below from the base, 8ee1b5be) is still
//     read. A key that stops being read is a readout that silently left the screen.
//   - CONTROLS: the READY / pause card and the one touch overlay are still the host's, for the same mode.
//   - THE SYSTEM: the HUD sits in <HudFrame>, and the host draws no sub-floor text (text-[9px]/[10px]/[11px]), no raw
//     hex colour and no mono face of its own — those are what the 10-foot scale and the one palette replaced.
//
// Add a host here when it migrates; the list below is also the report of which hosts have.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (f: string) => readFileSync(path.resolve(__dirname, '..', f), 'utf8');

/** host file → the HUD keys it read at the base, and the modeId attribute its splash and touch overlay are bound with. */
export const MIGRATED: Record<string, {
  keys: string[];
  modeId: string;
  /** The host's own start / pause layers (default: BootSplash + TouchOverlay). A host with no BootSplash draws its own. */
  controls?: string[];
  /** Where the HUD ends and the host's own READY / error gates begin (those are a splash, not HUD, and are not migrated). */
  hudEnd?: string;
  /** Named exceptions, each with its reason in the host: a character's identity colour; the mono face where columns
   *  must line up (a memory grid, a shape row, a sequence of tiles). Mono is allowed only on lines matching `monoLines`. */
  allowHex?: string[];
  monoLines?: RegExp;
}> = {
  'brainbrawl-babylon.tsx': {
    modeId: '"brainbrawl"',
    allowHex: ['#b9b2ff'],   // HOST_COLOR: the host character's own colour, like the categories' CATEGORY_COLOR
    monoLines: /whitespace-pre|tracking-\[0\.2em\]|min-w-\[1\.6em\]/,
    keys: 'anchor1 anchor2 anchorHost anchorPop1 anchorPop2 answeredP1 answeredP2 banner board boardTitle category categoryColor claims clock clockFrac cpu display fastBest handicap hint hostBubble hostN hostName hostSay howTo howToTitle optA p2score phase pickP1 pickP2 players pop1 pop2 popN1 popN2 popSub1 popSub2 popTone1 popTone2 prompt reveal reviewOf reviewRight roundKind say1 say2 sayN1 sayN2 score streak strikes tier why'.split(' '),
  },
  'who-scene-it-babylon.tsx': {
    modeId: '"who_scene_it"',
    controls: ['<PausedLayer'],
    hudEnd: '{/* ready / countdown / error gates */}',
    keys: 'answerIdx banner board boardTitle category categoryColor clock hint humans lockedP1 lockedP2 p2name p2score pack pickP1 pickP2 players prompt question recap recapTitle reveal roundLabel score streak'.split(' '),
  },
  'air-session-babylon.tsx': {
    modeId: '{modeKey}',
    keys: 'attempt bandHiK bandLoK banner best coach combo dialTol dialTurns hint judge nextFoot note phase score sheet speedK stomp'.split(' '),
  },
  'freerun-babylon.tsx': {
    modeId: '"freerun"',
    keys: 'banked banner checkpoint combo delta draft flow flowFrac gateReady gateReq hint kinetic lane pbSplit place pot route speed speedMax tier time track trickAround trickPct verbs'.split(' '),
  },
  'board-babylon.tsx': {
    modeId: '{modeKey}',
    keys: 'airLeft airMax balance balanceKind banner chainLink coach coins combo comboLine flow gates goal goalList goals heat hint momentum par pocket pocketHi pocketLo pot score speed split swell target time tube tubeMark tubeOk wallCue waves'.split(' '),
  },
  'karate-babylon.tsx': {
    modeId: '"karate"',
    keys: 'banner chi coins flowDrop flowMeter flowMult flowReady focus focusOn hits hp kos partnerHp perks revive timeLeft wave'.split(' '),
  },
  'karate-vs-babylon.tsx': {
    modeId: '"karate_vs"',
    keys: 'banner chi focus focusOn foeChi foeGuard foeHp foeWins guard hp round timeLeft wins'.split(' '),
  },
  'showdown-babylon.tsx': {
    modeId: '"showdown"',
    keys: 'assist banner chi foeChi foeGuard foeHp foeWins guard hp loadout round wins'.split(' '),
  },
  'duel-babylon.tsx': {
    modeId: '"duel"',
    keys: 'banner edge foeChi foeGuard foeHp foeWins guard hint hp round timeLeft wins'.split(' '),
  },
  'mixedcombat-babylon.tsx': {
    modeId: '"mixedcombat"',
    keys: 'banner chi dragonReady edge focus focusOn foeChi foeGuard foeHp foeWins guard hint hp loadout round wins'.split(' '),
  },
  'football-babylon.tsx': {
    modeId: '"football"',
    keys: 'ballOn banner board boardTitle breakaway breakawayFill breakawayTicks down drive evades fieldLen firstDown hint lane los par prompts score slingshot target toGo truckCool truckReady weather yards'.split(' '),
  },
  'timing-babylon.tsx': {
    modeId: '{modeKey}',
    keys: 'aerial aimCarry banner beatPulse blockReady board boardTitle call card clock club combo cues distance dive energy energyLabel feints flicks flow foeRackets foeScore goals hole holes homers instruments kickPower kickShape kickZones kicksThem kicksYou kinetic longest meterCarry meterT meterTicks mic micWho mult outs outsCap pad par pin pitch powerLock rackets rings rivalHomers round score shotMeterBands shotMeterT streak strokes style swingPhase targets them themGoals weather wind windDeg windWord you'.split(' '),
  },
  // lane/vis-race phase 2: the racing hosts (keys frozen from the same base, 8ee1b5be; modeId as each host binds its splash and touch deck)
  'sprint-babylon.tsx': {
    modeId: '{modeKey}',
    keys: 'banner beat beatCall beatFoot beatGrade beatMs clock distance falseStartRule falseStarts gap hint phase rival speed split sub13 top'.split(' '),
  },
  'aero-aces-babylon.tsx': {
    modeId: '"aeroaces"',
    keys: 'bananas banner draft gap hint item itemKind lap pb pos shield speed threat threatRoll threatSide time toGate'.split(' '),
  },
  'velocity-kart-babylon.tsx': {
    modeId: '"velocitykart"',
    keys: 'banner chasing cup delta draft drift gap hint item itemKind lap mini pos shield speed threat threatHop threatSide time trackCue'.split(' '),
  },
};

/** Shared HUD pieces a migrated host draws through, held to the same rules. (boost-hud: the racing hosts' and the boards' boost meter.) */
const PIECES = ['timing-prompt.tsx', 'combat-hud-band.tsx', 'boost-hud.tsx'];

const keyRead = (src: string, k: string) => new RegExp(`hud\\.${k}\\b|hud\\[['"]${k}['"]\\]`).test(src);

describe.each(Object.entries(MIGRATED))('%s on the TV HUD', (file, spec) => {
  const src = read(file);

  it('still reads every HUD key it read before (no readout left the screen)', () => {
    const lost = spec.keys.filter((k) => !keyRead(src, k));
    expect(lost).toEqual([]);
  });

  const controls = spec.controls ?? ['<BootSplash', '<TouchOverlay'];
  const hud = spec.hudEnd ? src.slice(0, src.indexOf(spec.hudEnd)) : src;

  it('keeps its READY / pause card and its touch overlay, for the same mode', () => {
    for (const c of controls) expect(src).toContain(c);
    const binds = [...src.matchAll(/<(?:BootSplash|TouchOverlay|PausedLayer)\b[^>]*?\bmodeId=(\{[\w.]+\}|"[\w-]+")/g)].map((m) => m[1]);
    expect(binds.length).toBeGreaterThanOrEqual(controls.length);
    for (const b of binds) expect(b).toBe(spec.modeId);
    if (spec.hudEnd) expect(src.indexOf(spec.hudEnd)).toBeGreaterThan(-1);
  });

  it('draws its HUD inside the frame, and the splash, pause and touch deck outside it', () => {
    expect(src).toMatch(/from '\.\/tv-hud'/);
    const open = src.indexOf('<HudFrame>'), close = src.indexOf('</HudFrame>');
    expect(open).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(open);
    for (const tag of controls) {
      const at = src.indexOf(tag);
      expect(at < open || at > close, `${tag} must stay the host's direct child`).toBe(true);
    }
  });

  it('no sub-floor text, no raw hex colour, no mono face: the scale and the palette replaced them', () => {
    expect(hud).not.toMatch(/text-\[(9|10|11)px\]/);
    const hexes = [...hud.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]).filter((h) => !(spec.allowHex ?? []).includes(h));
    expect(hexes).toEqual([]);
    for (const h of spec.allowHex ?? []) expect((hud.match(new RegExp(h, 'g')) ?? []).length, `${h} is named once`).toBe(1);
    const mono = hud.split('\n').filter((l) => /\bfont-mono\b/.test(l) && !(spec.monoLines && spec.monoLines.test(l)));
    expect(mono).toEqual([]);
  });
});

describe.each(PIECES)('%s (a piece a migrated host draws through)', (file) => {
  it('is on the system too', () => {
    const src = read(file);
    expect(src).toMatch(/from '\.\/tv-hud'/);
    expect(src).not.toMatch(/text-\[(9|10|11)px\]/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(src).not.toMatch(/\bfont-mono\b/);
  });
});
