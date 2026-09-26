// ONE PAUSED SCREEN (movement play P3, step 4a, 2026-09-24).
//
// Twenty hosts drew their own "PAUSED — TAP TO RESUME" (BACKLOG B16), and one (who-scene-it) drew none. Step 4a draws
// it once — PausedLayer, rendered by BootSplash on 'paused' and mounted by the one host without a splash — and this
// pins that it STAYS once:
//   the headline is drawn in one file, and the layer is rendered by two (BootSplash, who-scene-it). Brain Brawl keeps
//   its copy until step 5 (the Brain Brawl session owns that file), and BootSplash draws nothing for it on 'paused'
//   until then: two layers stacked doubled the headline (the step-4a review), so the two go together;
//   every host that runs a mode shows the layer, and the layer's tap is that host's own START (the harness's paused
//   branch resumes on it) — the splash rendered ALWAYS, with the host's own phase: a splash behind a condition, or
//   handed a phase that is never 'paused', loses the pause with it (the review's M2 and M7);
//   BootSplash returns the layer on 'paused', handing it the host's START, with every hook above its early returns;
//   the layer's tap is its onResume — the only way a touch player leaves a pause (the review's M1: the markup drops
//   every handler, so this reads the element React is given, not the HTML);
//   the layer keeps the old copy's exact classes — no z-index (Z8), so it stacks where every copy stacked, under the
//   shell's z-30 corner (the compact Body toggle, Leave) — and it sits where each copy sat (three-point's came after
//   its turn banner, plan R11);
//   the line under the headline follows the body (plan step 4a): nothing with the camera off, "Step back into frame"
//   while it cannot see you, "or raise both hands" and the hold's ring once it can (or while a hold is running);
//   READY says the hands-up START once the camera sees you, and holds the line's room while the camera is on, so the
//   card never jumps on a missed detection (the review).
// The markup is React's own (renderToStaticMarkup), not a reading of the JSX: vitest runs in node, with no DOM. The
// hosts' JSX is read from the TypeScript syntax tree, so a condition around the splash is found wherever it sits.
//
// MOVEMENT PLAY P4 (2026-09-25): BootSplash is the card (SplashCard) plus body play beside it (BodyPlayLayer). The pins
// on what the splash RETURNS — the pause layer on 'paused', nothing while playing — are the card's now; and with body
// play off the layer adds nothing, so BootSplash draws exactly the card in every phase (Z-P4-1).
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { sourceFiles, stripComments } from '@/lib/testing/sourceScan';
import { sessionStore, type BodyPresence, type PauseReason, type SessionWriter } from '@/lib/babylon/core/sessionStore';
import {
  PausedLayer, BodyReadyLine, pausedLine, readyLine, PAUSED_HEADLINE, RAISE_HANDS_LINE, STEP_BACK_LINE, CALIBRATING_LINE,
} from './paused-layer';
import { BootSplash, SplashCard } from './boot-splash';
import { BodyPlayLayer, BodyPlayReady, SpaceCheckPanel, PLAY_WITH_BODY, CAMERA_NOTE } from './body-play';
import { COMING_COPY } from '@/lib/input/bodyProfiles';
import { bodySeamFor } from '@/lib/babylon/core/bodySeam';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string): string => stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
/** The old copy's classes, verbatim: the layer must stack exactly where the twenty copies did. */
const OLD_COPY_CLASSES = 'absolute inset-0 flex items-center justify-center bg-black/60';
const GAMES = path.join('components', 'games');
/** Until step 5 (after the Brain Brawl session commits): the one host allowed to keep its own copy. */
const ALLOWED_COPY = path.join(GAMES, 'brainbrawl-babylon.tsx');

/** The game hosts: every components/games file that runs a mode (the dev runner under app/ prints its phase instead). */
const hosts = (): string[] =>
  sourceFiles(ROOT, [GAMES], fs, path).filter((f) => /\brunMode\(/.test(read(f))).sort();

/**
 * Every <BootSplash> in a file, from the TSX syntax tree: its attributes' source text, and the expression it sits
 * inside short of the component's return, if any. Only JSX elements, fragments and the return's parentheses may hold
 * it: a `{…}`, an `&&` or a `? :` anywhere above it — around the splash or around a wrapper — is a splash that is not
 * always rendered, and its pause goes with it.
 */
function splashesIn(tsx: string): { attrs: Record<string, string>; inside: string | null }[] {
  const sf = ts.createSourceFile('host.tsx', tsx, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { attrs: Record<string, string>; inside: string | null }[] = [];
  const visit = (n: ts.Node): void => {
    if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(sf) === 'BootSplash') {
      const attrs: Record<string, string> = {};
      for (const a of n.attributes.properties) if (ts.isJsxAttribute(a)) attrs[a.name.getText(sf)] = a.initializer?.getText(sf) ?? 'true';
      let inside: string | null = null;
      for (let p = (ts.isJsxOpeningElement(n) ? n.parent : n).parent; p && !ts.isReturnStatement(p) && !ts.isFunctionLike(p); p = p.parent) {
        if (!ts.isJsxElement(p) && !ts.isJsxFragment(p) && !ts.isParenthesizedExpression(p)) { inside = p.getText(sf).slice(0, 80); break; }
      }
      out.push({ attrs, inside });
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}
const splashes = (rel: string) => splashesIn(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/**
 * What a component RETURNS — its element, event handlers and all — run inside a real render so its hooks work. The
 * markup drops every handler: a layer that lost its onClick rendered the same HTML (the review's M1).
 */
function returned<P>(C: (p: P) => ReactNode, props: P): ReactElement | null {
  const box: { el?: ReactNode } = {};
  const Probe = (): null => { box.el = C(props); return null; };
  renderToStaticMarkup(createElement(Probe));
  return isValidElement(box.el) ? box.el : null;
}

// the store is a module singleton: each render test mounts its own writer and lets go of it after
let writer: SessionWriter | null = null;
function session(body: BodyPresence, pause: PauseReason | null = null, handsUp01 = 0): void {
  writer?.unmount();
  writer = sessionStore.mount({ modeId: 'skateboard', key: 'skateboard', lines: [], drives: true, later: 'P8' });
  writer.setBody(body, handsUp01);
  writer.setPause(pause);
}
afterEach(() => { writer?.unmount(); writer = null; });
const layer = (): string => renderToStaticMarkup(createElement(PausedLayer, { onResume: () => {} }));
type SplashProps = Parameters<typeof BootSplash>[0];
const splashProps = (phase: SplashProps['phase'], modeId = 'dunk', onStart = () => {}): SplashProps =>
  ({ modeId, title: 'FLIGHT NIGHT', phase, onStart, onRetry: () => {} });
const splash = (phase: SplashProps['phase']): string => renderToStaticMarkup(createElement(BootSplash, splashProps(phase)));
const card = (phase: SplashProps['phase'], modeId = 'dunk'): string => renderToStaticMarkup(createElement(SplashCard, splashProps(phase, modeId)));

describe('one paused layer (plan step 4a)', () => {
  it('"TAP TO RESUME" is drawn in one file, and the layer rendered by two (brainbrawl allow-listed until step 5)', () => {
    expect(PAUSED_HEADLINE).toBe('PAUSED — TAP TO RESUME');   // the pinned text (Z8; scripts/probes/_miss-retry.mts reads it)
    const files = sourceFiles(ROOT, ['components', 'app', 'lib'], fs, path);
    const drawers = files.filter((f) => read(f).includes('TAP TO RESUME')).sort();
    // exact, so the allow-list cannot go stale: step 5 deletes brainbrawl's copy and this entry with it
    expect(drawers).toEqual([ALLOWED_COPY, path.join(GAMES, 'paused-layer.tsx')]);
    // nor a copy that borrows the headline (the review: `{PAUSED_HEADLINE}` in a host passed the text scan)…
    expect(files.filter((f) => /\bPAUSED_HEADLINE\b/.test(read(f)))).toEqual([path.join(GAMES, 'paused-layer.tsx')]);
    // …nor a second layer beside the splash's own (a double dim): BootSplash renders it, and the host without a splash
    expect(files.filter((f) => /<PausedLayer\b/.test(read(f))).sort()).toEqual([path.join(GAMES, 'boot-splash.tsx'), path.join(GAMES, 'who-scene-it-babylon.tsx')]);
    // Brain Brawl: BootSplash draws nothing on its pause exactly while it draws its own copy. Step 5 deletes both
    // together — one without the other is a Brain Brawl with two pauses stacked, or with none
    const ownCopy = read(ALLOWED_COPY).includes('TAP TO RESUME');
    expect(returned(SplashCard, splashProps('paused', 'brainbrawl')) === null, 'BootSplash skips brainbrawl\'s pause').toBe(ownCopy);
  });

  it('every host that runs a mode shows the layer — its splash always rendered, with its own phase — and its tap is the host\'s START', () => {
    const all = hosts();
    expect(all.length).toBeGreaterThanOrEqual(21);                // 20 splash hosts + who-scene-it: a scan that found none proves nothing
    const missing: string[] = [];
    for (const f of all) {
      const src = read(f);
      // the resume tap: the harness resumes a paused game on a real START press (ModeHarness's paused branch)
      if (!/const tapStart = useCallback\(\(\) => \{?\s*(busRef\.current\?\.)?emit\(\{ t: 'button', btn: 'START', pressed: true \}\)/.test(src)) missing.push(`${f}: tapStart is not a START press`);
      const found = splashes(f);
      if (found.length > 1) missing.push(`${f}: ${found.length} BootSplashes`);
      for (const s of found) {
        if (s.attrs.onStart !== '{tapStart}') missing.push(`${f}: BootSplash's onStart (the pause's tap) is ${s.attrs.onStart}, not tapStart`);
        // the review's M7: a phase that never reaches 'paused' (`phase === 'paused' ? 'playing' : phase`) hides the pause
        if (s.attrs.phase !== '{phase}') missing.push(`${f}: BootSplash is handed phase=${s.attrs.phase}, not the host's phase`);
        // the review's M2: `{phase !== 'paused' && <BootSplash …/>}`, or the same around a wrapper
        if (s.inside !== null) missing.push(`${f}: BootSplash is rendered only sometimes, inside ${JSON.stringify(s.inside)}`);
      }
      if (!found.length && !/\{phase === 'paused' && <PausedLayer onResume=\{tapStart\} \/>\}/.test(src)) {
        missing.push(`${f}: runs a mode with no BootSplash and no PausedLayer — a pause would freeze it with no word`);
      }
    }
    expect(missing).toEqual([]);
    expect(read(path.join(GAMES, 'who-scene-it-babylon.tsx'))).toContain('<PausedLayer onResume={tapStart} />');
    // the reader itself, on the review's mutations: it sees a condition wherever it sits, and every attribute as written
    const host = (jsx: string) => splashesIn(`export default function H() { return (\n<div className="relative">\n${jsx}\n</div>\n); }`);
    const SPLASH = '<BootSplash modeId="dunk" phase={phase} onStart={tapStart} onRetry={tapStart} />';
    expect(host(`<canvas />\n${SPLASH}`)).toEqual([{ attrs: { modeId: '"dunk"', phase: '{phase}', onStart: '{tapStart}', onRetry: '{tapStart}' }, inside: null }]);
    expect(host(`<div className="absolute">\n<>${SPLASH}</>\n</div>`)[0].inside).toBeNull();
    for (const hidden of [`{phase !== 'paused' && ${SPLASH}}`, `{phase === 'paused' ? null : ${SPLASH}}`,
      `{phase !== 'paused' && (\n<div>\n${SPLASH}\n</div>\n)}`, `{ok ? (<div>${SPLASH}</div>) : null}`, `{[${SPLASH}]}`]) {
      expect(host(hidden)[0].inside, hidden).not.toBeNull();
    }
    expect(host(SPLASH.replace('phase={phase}', "phase={phase === 'paused' ? 'playing' : phase}"))[0].attrs.phase)
      .toBe("{phase === 'paused' ? 'playing' : phase}");
  });

  it('BootSplash returns the layer on paused (the host\'s START its tap, every hook above the early returns), and nothing while playing or ended', () => {
    // MOVEMENT PLAY P4: the card's own returns (BootSplash = SplashCard + BodyPlayLayer, which draws nothing here)
    const src = read(path.join(GAMES, 'boot-splash.tsx'));
    const body = src.slice(src.indexOf('export function SplashCard('), src.indexOf('export function ejectTransition('));
    const firstReturn = body.search(/\n\s*if \(props\.phase === 'paused'\) return /);
    expect(firstReturn).toBeGreaterThan(0);
    // every hook call sits above the first early return (a hook under it changes the hook count between phases)
    expect(body.slice(firstReturn)).not.toMatch(/\buse(State|Effect|SyncExternalStore|Memo|Callback|Ref)\(/);
    // the READY card still starts on a press anywhere (StartWake.test pins the same text)
    expect(src).toMatch(/onPointerDown=\{props\.phase === 'ready'/);

    // the element React is given: the layer, and its tap is the host's START itself (not RETRY, not a wrapper)
    const onStart = (): void => {};
    const el = returned(SplashCard, splashProps('paused', 'dunk', onStart));
    expect(el?.type).toBe(PausedLayer);
    expect((el?.props as { onResume?: unknown }).onResume).toBe(onStart);

    session('off');
    const paused = splash('paused');
    expect(paused.startsWith(`<button type="button" class="${OLD_COPY_CLASSES}">`)).toBe(true);
    expect(paused).toContain(PAUSED_HEADLINE);
    expect(paused).not.toContain('z-40');                         // not the splash's own card
    expect(splash('playing')).toBe('');
    expect(splash('ended')).toBe('');
  });

  it('the layer is the old copy\'s button: its tap resumes, and no z-index anywhere in it (Z8)', () => {
    // the review's M1: the tap is the only way a touch player leaves a pause, and the HTML never shows it
    const onResume = (): void => {};
    const el = returned(PausedLayer, { onResume });
    expect(el?.type).toBe('button');
    expect((el?.props as { onClick?: unknown }).onClick).toBe(onResume);

    session('present', 'body-lost', 0.5);
    const html = layer();
    expect(html.startsWith(`<button type="button" class="${OLD_COPY_CLASSES}">`)).toBe(true);
    const classes = [...html.matchAll(/class="([^"]*)"/g)].map((m) => m[1]);
    expect(classes.length).toBeGreaterThan(2);
    for (const c of classes) expect(c, c).not.toMatch(/(^|\s)-?z-/);
    // and in the source, whatever it renders
    const src = read(path.join(GAMES, 'paused-layer.tsx'));
    for (const m of src.matchAll(/className="([^"]*)"/g)) expect(m[1], m[1]).not.toMatch(/(^|\s)-?z-/);
  });

  it('it sits where each host\'s copy sat: three-point\'s after its turn banner (plan R11)', () => {
    // the other nineteen drew their copy straight after BootSplash, in the same parent, so the splash's place is theirs;
    // three-point drew its turn banner between the two, and the pause's dim covered it
    const src = read(path.join(GAMES, 'three-point-babylon.tsx'));
    expect(src.indexOf('{turnLine && (')).toBeGreaterThan(0);
    expect(src.indexOf('<BootSplash')).toBeGreaterThan(src.indexOf('{turnLine && ('));
  });

  it('the line under the headline follows the body: none off camera, step back while unseen, the ring once seen', () => {
    // the pure choice, every case — whatever paused the game: a stalled camera is 'absent' in the store now (the
    // session says so, the step-4a review), and a camera that is back shows the ring even under a 'stall' pause
    const shown = (text: string, ring: boolean) => ({ text, ring, shown: true });
    expect(pausedLine({ body: 'off', handsUp01: 0 })).toBeNull();                 // Body switched off during the pause
    expect(pausedLine({ body: 'absent', handsUp01: 0 })).toEqual(shown(STEP_BACK_LINE, false));
    expect(pausedLine({ body: 'present', handsUp01: 0 })).toEqual(shown(RAISE_HANDS_LINE, true));
    expect(pausedLine({ body: 'calibrating', handsUp01: 0 })).toEqual(shown(CALIBRATING_LINE, false));
    // a hold in progress is a body the camera sees (the review: one missed frame read 'absent' mid-hold)
    expect(pausedLine({ body: 'absent', handsUp01: 0.25 })).toEqual(shown(RAISE_HANDS_LINE, true));

    // and what React draws: a pad or touch player sees the old screen — the same headline, no line
    session('off', 'input');
    expect(layer()).toBe(`<button type="button" class="${OLD_COPY_CLASSES}"><span class="flex flex-col items-center gap-3 text-center">`
      + `<span class="fel-heading text-3xl font-bold text-white">${PAUSED_HEADLINE}</span></span></button>`);
    session('absent', 'body-lost');
    expect(layer()).toContain(STEP_BACK_LINE);
    expect(layer()).not.toContain('data-fel-hands-up');
    session('present', 'body-lost', 0.4);
    expect(layer()).toContain(RAISE_HANDS_LINE);
    expect(layer()).toContain('data-fel-hands-up="0.40"');
    session('absent', 'stall');                                    // the stalled camera, as the session writes it
    expect(layer()).toContain(STEP_BACK_LINE);
    expect(layer()).not.toContain('data-fel-hands-up');
    session('present', 'stall', 0.4);                              // frames back, the hold filling: the ring (the review)
    expect(layer()).toContain(RAISE_HANDS_LINE);
    expect(layer()).toContain('data-fel-hands-up="0.40"');
    expect(layer()).not.toContain('invisible');                    // the pause's line is always shown
  });

  it('READY says the hands-up START once the camera sees you, and holds its room while the camera is on (no jump)', () => {
    session('present', null, 0.25);
    const seen = splash('ready');
    expect(seen).toContain('TAP TO START');
    expect(seen.indexOf(RAISE_HANDS_LINE)).toBeGreaterThan(seen.indexOf('TAP TO START'));
    expect(seen).toContain('data-fel-hands-up="0.25"');
    expect(seen).not.toContain('invisible');

    // the review: a missed detection flipped the line in and out of the card's centred column, and the title, TAP TO
    // START and the pickers jumped ~17 px each time. Unseen, the same line keeps its place, only hidden
    session('present');
    const visible = splash('ready');
    session('absent');
    const held = splash('ready');
    expect(held).toContain('invisible');
    expect(held.replace(' aria-hidden="true"', '').replace(' invisible', '')).toBe(visible);
    expect(readyLine({ body: 'absent', handsUp01: 0 })).toEqual({ text: RAISE_HANDS_LINE, ring: true, shown: false });
    expect(readyLine({ body: 'absent', handsUp01: 0.1 })!.shown).toBe(true);        // a hold running is seen

    // calibrating (where READY mostly is when the Body goes on) says what to do; camera off is the old card exactly
    session('calibrating');
    expect(splash('ready')).toContain(CALIBRATING_LINE);
    session('off');
    const off = splash('ready');
    expect(off).not.toContain(RAISE_HANDS_LINE);
    expect(off).not.toContain(CALIBRATING_LINE);
    expect(off).not.toContain('min-h-[18px]');
    session('present');
    expect(splash('loading')).not.toContain(RAISE_HANDS_LINE);

    // who-scene-it's own READY card says it too (the hands-up START works there: the session runs in every mode)
    expect(read(path.join(GAMES, 'who-scene-it-babylon.tsx'))).toMatch(/TAP TO START<\/span>[\s{}]*<BodyReadyLine className="mt-3" \/>\s*<\/button>/);   // ({} = a stripped comment)
    session('present');
    expect(renderToStaticMarkup(createElement(BodyReadyLine, { className: 'mt-3' }))).toContain(' mt-3');
  });
});

// ── movement play P4: body play beside the card ──────────────────────────────────────────────────────────────────

describe('body play beside the splash (movement play P4)', () => {
  const PHASES: SplashProps['phase'][] = ['loading', 'ready', 'countdown', 'playing', 'paused', 'ended', 'error'];

  it('with body play off, BootSplash draws exactly the card, in every phase, for every host (Z-P4-1)', () => {
    const modeIds = new Set<string>(['dunk', 'brainbrawl']);
    for (const f of hosts()) for (const sp of splashes(f)) if (/^"[\w-]+"$/.test(sp.attrs.modeId ?? '')) modeIds.add(sp.attrs.modeId.slice(1, -1));
    expect(modeIds.size).toBeGreaterThan(8);
    for (const game of ['skateboard', 'dunk', 'football']) {
      session('off');
      writer?.unmount();
      writer = sessionStore.mount(bodySeamFor({ modeId: game }).card);
      for (const modeId of modeIds) for (const phase of PHASES) {
        const props = splashProps(phase, modeId);
        expect(renderToStaticMarkup(createElement(BootSplash, props)), `${game} card, ${modeId} ${phase}`)
          .toBe(renderToStaticMarkup(createElement(SplashCard, props)));
      }
    }
    // and the layer itself: nothing with the camera off, in any phase
    for (const phase of PHASES) expect(renderToStaticMarkup(createElement(BodyPlayLayer, { phase, onStart: () => {} }))).toBe('');
  });

  it('READY says what the running game offers: the choice, "coming", or nothing at all (P3\'s card)', () => {
    const readyFor = (modeId: string) => {
      writer?.unmount();
      writer = sessionStore.mount(bodySeamFor({ modeId }).card);
      return card('ready', modeId);
    };
    const skate = readyFor('skateboard');
    expect(skate).toContain(PLAY_WITH_BODY);
    expect(skate).toContain(CAMERA_NOTE);
    expect(skate.indexOf(PLAY_WITH_BODY)).toBeGreaterThan(skate.indexOf('TAP TO START'));
    const dunk = readyFor('dunk');
    expect(dunk).toContain(COMING_COPY);
    expect(dunk).not.toContain(PLAY_WITH_BODY);
    for (const none of ['football', 'brainbrawl']) {
      const html = readyFor(none);
      expect(html, none).not.toContain(PLAY_WITH_BODY);
      expect(html, none).not.toContain(COMING_COPY);
      expect(renderToStaticMarkup(createElement(BodyPlayReady, { tint: '#fff', onStart: () => {} })), none).toBe('');
    }
    // the choice is a button, so the card's start-anywhere skips it (a tap on it chooses body play, it does not start)
    expect(skate).toMatch(new RegExp(`<button[^>]*>${PLAY_WITH_BODY}</button>`));
  });

  it('the layer comes after the card, and nothing in it carries a z-index (it sits where the pause does: under the shell\'s corner)', () => {
    const src = read(path.join(GAMES, 'boot-splash.tsx'));
    const boot = src.slice(src.indexOf('export function BootSplash('), src.indexOf('export function SplashCard('));
    expect(boot).toMatch(/<SplashCard \{\.\.\.props\} \/>\s*<BodyPlayLayer phase=\{props\.phase\} onStart=\{props\.onStart\} \/>/);
    const bp = read(path.join(GAMES, 'body-play.tsx'));
    const layer = bp.slice(bp.indexOf('export function BodyPlayLayer('));
    for (const m of layer.matchAll(/className=\{?[`"]([^`"]*)[`"]/g)) expect(m[1], m[1]).not.toMatch(/(^|\s)-?z-/);
    for (const m of Object.values(CORNER_CLASSES(bp))) expect(m).not.toMatch(/(^|\s)-?z-/);
    // the panel over a pause takes no z-index either (only the READY one does, inside the card's own z-40)
    expect(bp).toMatch(/\$\{variant === 'ready' \? 'z-20' : ''\}/);
  });

  it('the READY panel keeps its taps to itself: the card behind it does not start on them', () => {
    const el = returned(SpaceCheckPanel, { onStart: () => {}, variant: 'ready' });
    const onPointerDown = (el?.props as { onPointerDown?: (e: { stopPropagation(): void }) => void }).onPointerDown;
    expect(onPointerDown).toBeInstanceOf(Function);
    let stopped = false;
    onPointerDown!({ stopPropagation: () => { stopped = true; } });
    expect(stopped).toBe(true);
  });
});

/** body-play.tsx's CORNER_CLASS table, read from the source. */
function CORNER_CLASSES(src: string): Record<string, string> {
  const m = /const CORNER_CLASS[^{]*\{([^}]*)\}/.exec(src);
  expect(m, 'CORNER_CLASS').not.toBeNull();
  return Object.fromEntries([...m![1].matchAll(/(\w+): '([^']*)'/g)].map((x) => [x[1], x[2]]));
}
