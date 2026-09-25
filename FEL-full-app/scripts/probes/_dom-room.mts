// _dom-room — the scorecard's way into a room that is a React page, not a Babylon mode (MUSIC-SUITE P1, 2026-09-25).
//
// Every probe here waits for #fel-ready (lib/babylon/core/readyMarker.ts), plays through the fake pad, and reads the
// session off window.__FEL_QA__ (lib/babylon/core/QaTrace.ts, published by ModeHarness under ?agent=1). The Groove
// Academy has none of the three: StudioMode (lib/babylon/music/StudioMode.tsx) is plain DOM, its only scored verb is
// PERFORM's TAP, a React onClick (StudioMode.tsx:510), and its score lives in React state, printed in one status line
// (performStatusLine, lib/babylon/music/performSet.ts:46). Measured before this file: a capture of /play/music would wait
// 150 s for a marker that never comes, write "not ready ()", and score the room N/A on every category.
//
// So a DOM room gets the same three things by other means:
//   · READY is the shared BootSplash's TAP TO START pill (components/games/boot-splash.tsx:298), then whatever the room
//     needs pressed before it can score. The Academy offers PERFORM notes only while the groovebox runs (StudioMode.tsx:
//     208, onStepAudible fires from AudioEngine.drainPlayhead, AudioEngine.ts:154), so its start ritual is READY + PLAY.
//   · A PRESS is a click on one of the room's verb buttons (TAP).
//   · A RESPONSE is the room's readout changing (the status line: score / combo / judgement), or a sound STARTED inside
//     the click's own dispatch (a wrapped AudioScheduledSourceNode.start). The groovebox's own steps are scheduled from a
//     25 ms timer, never inside a click, so the song itself can never pass for an answer.
// All of it is published as a __FEL_QA__ SHIM with the harness's interface (now / summary / events / hud / rawHud /
// result / scene / hero), so _scorecard-capture and _mechanics-probe read a DOM room with the code they already have.
//
// What the shim cannot see, said here rather than guessed at: JuiceKit beats (a DOM room has no JuiceKit — a CSS
// flourish is not counted), and the hero body (there is none; the scorer marks Body N/A for a DOM room, with that reason).
import type { Page } from 'playwright-core';

export interface DomRoom {
  /** The start ritual's button (the shared BootSplash pill). */
  start: RegExp;
  /** Buttons clicked, by exact label and in order, once the room is up. */
  then: string[];
  /** The room's scored verbs: buttons whose clicks are PRESSES (the first one on screen = the room is up). */
  verbs: string[];
  /** Page JS expression → the element whose text is the room's readout (or null). */
  statusEl: string;
  /** Page JS function expression: (text) => the readout's fields, or null when the text is not the readout. */
  parse: string;
  /** Page JS expression → the room's end-of-run result ({ score, ... }) when it has one, else null. */
  result: string;
}

export const DOM_ROOMS: Record<string, DomRoom> = {
  // THE GROOVE ACADEMY, PERFORM (/play/music?stage=perform; /dev/music?stage=perform under DEV=1).
  music: {
    start: /^TAP TO START$/,
    then: ['PLAY'],
    verbs: ['TAP'],
    // performStatusLine: 'score N · combo xN · J' (free play) or 'bar B/N · score N · combo xN · J' (an Arena set).
    // A future `data-qa="perform-status"` (not in the room today) wins, so a PERFORM rebuild (P6) can keep this readable.
    statusEl: `document.querySelector('[data-qa="perform-status"]') || Array.from(document.querySelectorAll('span')).find((s) => /score -?\\d+ · combo x\\d+/.test(s.textContent || '')) || null`,
    parse: `(t) => { const m = /(?:bar (\\d+)\\/(\\d+) · )?score (-?\\d+) · combo x(\\d+) · ?([A-Z]*)/.exec(t); return m ? { score: Number(m[3]), combo: Number(m[4]), judgement: m[5] || '', bar: m[1] ? Number(m[1]) : null } : null; }`,
    // /dev/music's stand-in shell records what StudioMode reported (app/dev/music/loader.tsx, window.__FEL_STUDIO__.ended)
    result: `(window.__FEL_STUDIO__ && window.__FEL_STUDIO__.ended) || null`,
  },
};

export const isDomRoom = (slug: string): boolean => Object.prototype.hasOwnProperty.call(DOM_ROOMS, slug);

/**
 * Init script for a DOM room's page, installed before its code runs: every AudioContext the page creates, so a driver can
 * read the room's own audio clock (the Academy judges TAP against engine.context.currentTime, StudioMode.tsx:270, and
 * the note times the dev readout publishes are on that clock). A subclass, so `instanceof` and the static members hold.
 */
export const AUDIO_CLOCK_INIT = `(() => {
  const O = window.AudioContext; if (!O || O.__felWrapped) return;
  window.__ACS = [];
  const W = class extends O { constructor(...a) { super(...a); window.__ACS.push(this); } };
  W.__felWrapped = true; window.AudioContext = W;
})()`;

/** The __FEL_QA__ shim for one DOM room (page JS). Also publishes window.__DOM_CLICK(label) for the drivers. */
export function domQaShim(slug: string): string {
  const r = DOM_ROOMS[slug];
  return `(() => {
  if (window.__FEL_QA__ && window.__FEL_QA__.domRoom) return;
  const VERBS = ${JSON.stringify(r.verbs)};
  const statusEl = () => { try { return ${r.statusEl}; } catch { return null; } };
  const parse = ${r.parse};
  const events = [], last = {}, raw = {};
  const now = () => performance.now();
  const push = (kind, key) => { if (events.length >= 20000) events.splice(0, 2000); events.push({ t: now(), kind, key }); };
  // a click's dispatch: the capture listener opens it, the window's bubble listener (or the next task) closes it
  let inClick = false;
  document.addEventListener('click', (e) => {
    const b = e.target && e.target.closest ? e.target.closest('button') : null;
    const label = b ? (b.textContent || '').trim() : '';
    inClick = true; setTimeout(() => { inClick = false; }, 0);
    if (VERBS.includes(label)) push('press', label);
  }, true);
  window.addEventListener('click', () => { inClick = false; }, false);
  const AS = window.AudioScheduledSourceNode && window.AudioScheduledSourceNode.prototype;
  if (AS && !AS.__felQa) { const o = AS.start; AS.start = function (...a) { if (inClick) push('sfx', this.constructor.name); return o.apply(this, a); }; AS.__felQa = true; }
  // the readout: the QaTrace.hud rules (a first empty publish is not news, a clearing is not an answer, the score is
  // 'score'), with the bar count treated as the clock it is
  const read = () => {
    const el = statusEl(); if (!el) return;
    const v = parse(el.textContent || ''); if (!v) return;
    for (const [k, val] of Object.entries(v)) {
      raw[k] = val;
      if (k === 'bar') continue;
      const s = val == null ? '' : String(val);
      if (last[k] === s) continue;
      const had = k in last; last[k] = s;
      if (!had && (s === '' || s === '0')) continue;
      if (s === '') continue;
      push(k === 'score' ? 'score' : 'hud', k);
    }
  };
  new MutationObserver(read).observe(document.body, { subtree: true, childList: true, characterData: true });
  read();
  const summary = (windowMs = 450, from = 0) => {
    const ev = events.filter((e) => e.t >= from);
    const responses = ev.filter((e) => e.kind !== 'press');
    const byBtn = {}; let ri = 0;
    for (const p of ev) {
      if (p.kind !== 'press') continue;
      const row = (byBtn[p.key] = byBtn[p.key] || { presses: 0, answered: 0, answers: {} });
      row.presses++;
      while (ri < responses.length && responses[ri].t < p.t) ri++;
      let hit = null;
      for (let j = ri; j < responses.length && responses[j].t <= p.t + windowMs; j++) { if (responses[j].kind !== 'score') { hit = responses[j]; break; } hit = hit || responses[j]; }
      if (hit) { row.answered++; const tag = hit.kind + ':' + hit.key; row.answers[tag] = (row.answers[tag] || 0) + 1; }
    }
    const cues = ev.filter((e) => e.kind === 'hud' || e.kind === 'juice' || e.kind === 'sfx' || e.kind === 'impact');
    let unexplained = 0, scores = 0;
    for (const s of ev) { if (s.kind !== 'score') continue; scores++; if (!cues.some((c) => Math.abs(c.t - s.t) <= 500)) unexplained++; }
    const presses = Object.values(byBtn).reduce((a, r) => a + r.presses, 0);
    const answered = Object.values(byBtn).reduce((a, r) => a + r.answered, 0);
    return { presses, answered, silentPct: presses ? Math.round((1 - answered / presses) * 100) : 0, byBtn, scores, unexplainedScores: unexplained, responses: responses.length };
  };
  // THE JUDGE'S VERDICT PER PRESS. A click is a discrete event: React 18 (a concurrent root) flushes its state updates in
  // a microtask queued DURING the dispatch — not before click() returns (measured: read synchronously, every tally was
  // the previous press's word). A microtask queued after click() runs after React's, so it reads THIS press's
  // judgement (PERFECT / GOOD / EARLY …). The status line alone cannot count them: a second PERFECT in a row changes the
  // score but not the word.
  const tally = { presses: 0, byJudgement: {}, notes: null };
  window.__DOM_CLICK = (label) => {
    const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === label);
    if (!b || b.disabled) return false; b.click();
    if (VERBS.includes(label)) {
      tally.presses++;
      queueMicrotask(() => {
        const el = statusEl(); const v = el ? parse(el.textContent || '') : null;
        const j = v && v.judgement ? v.judgement : '(none)';
        tally.byJudgement[j] = (tally.byJudgement[j] || 0) + 1;
      });
    }
    return true;
  };
  // notes offered so far, when the room publishes its schedule (/dev/music's __FEL_STUDIO__.steps, on the engine clock):
  // every scheduled step whose time has passed is a note PerformSet has been (or is about to be) offered
  const seen = new Set();
  setInterval(() => {
    const S = window.__FEL_STUDIO__; const c = (window.__ACS || []).filter((x) => x.state === 'running').slice(-1)[0];
    if (!S || !c || !S.steps) return;
    for (const st of S.steps) if (st.time <= c.currentTime) seen.add(st.time.toFixed(4));
    tally.notes = seen.size;
  }, 50);
  window.__FEL_QA__ = {
    domRoom: ${JSON.stringify(slug)}, modeId: ${JSON.stringify(slug)},
    now, summary, events: (n = 400) => events.slice(-n),
    hud: () => ({ ...last }), rawHud: () => ({ ...raw }),
    result: () => { try { return ${r.result}; } catch { return null; } },
    reset: () => { events.length = 0; for (const k of Object.keys(last)) delete last[k]; },
    tally: () => JSON.parse(JSON.stringify(tally)),
    scene: () => null, hero: () => null,
  };
})()`;
}

const clickLabel = (p: Page, label: string) => p.evaluate((l) => {
  const b = Array.from(document.querySelectorAll('button')).find((x) => (x.textContent || '').trim() === l) as HTMLButtonElement | undefined;
  if (!b) return false; b.click(); return true;
}, label);

/**
 * The DOM room's start ritual, in place of the #fel-ready wait. `loadMs` is page-open → READY on screen (the Academy's
 * splash turns ready once its kit is synthesised, StudioMode.tsx:205), the same span the marker measures for a Babylon
 * mode. Installs the __FEL_QA__ shim before the first press.
 */
export async function startDomRoom(p: Page, slug: string, budgetMs = 150000): Promise<{ ok: boolean; loadMs: number; note?: string }> {
  const r = DOM_ROOMS[slug];
  const t0 = Date.now();
  const start = p.getByRole('button', { name: r.start }).first();
  try { await start.waitFor({ state: 'visible', timeout: budgetMs }); }
  catch { return { ok: false, loadMs: Date.now() - t0, note: `no start button (${r.start}) in ${Math.round(budgetMs / 1000)} s` }; }
  const loadMs = Date.now() - t0;
  await start.click().catch(() => {});
  try {
    await p.waitForFunction((v) => Array.from(document.querySelectorAll('button')).some((b) => (b.textContent || '').trim() === v), r.verbs[0], { timeout: 20000 });
  } catch { return { ok: false, loadMs, note: `the room never showed ${r.verbs[0]}` }; }
  await p.evaluate(domQaShim(slug));
  for (const label of r.then) { if (!(await clickLabel(p, label))) return { ok: false, loadMs, note: `no ${label} button` }; await p.waitForTimeout(150); }
  return { ok: true, loadMs };
}

/** One press of a DOM verb (the deliberate drivers' press): false when the button is not on screen. */
export const domPress = (p: Page, label: string) => p.evaluate((l) => (window as unknown as { __DOM_CLICK?: (x: string) => boolean }).__DOM_CLICK?.(l) ?? false, label).catch(() => false);
