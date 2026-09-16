// _scorecard — score every game on the 10-point rubric (docs/SCORECARD.md) from the evidence on disk.
//
//   TAG=rc9 GAUNTLET=gauntlet-rc9-merged MECH=mechanics-rc9 npx tsx scripts/probes/_scorecard.mts
//
// Reads, under ~/Claude/outbox/finish-release/:
//   scorecard/<TAG>/<slug>.json      the capture (_scorecard-capture.mts)
//   gauntlet/<GAUNTLET>.json         the release gauntlet (end card reached)
//   mechanics/<MECH>.json            idle / deliberate / masher
//   phone/phone-controls.json        the phone check
//   scorecard/scorecard-visual.json  the frame review: { [slug]: { checks: [hero, venue, light, defects, hud] (0..2 each), notes } }
// Writes scorecard/SCORECARD-<TAG>.md and scorecard/scorecard-<TAG>.json.
import fs from 'node:fs';
// tsx loads the .ts module as CJS from an .mts script, so its named exports arrive on `default`
const RC: any = await import('../../lib/babylon/anim/recognisable'); const wrongMoves = (RC.wrongMoves ?? RC.default.wrongMoves) as typeof import('../../lib/babylon/anim/recognisable').wrongMoves;
import { SCORE_ROUTES } from './_scorecard-routes.mts';

const H = `${process.env.HOME}/Claude/outbox/finish-release`;
const TAG = process.env.TAG ?? 'run';
const read = (p: string): any => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const bySlug = (rows: any[] | null) => new Map<string, any>((rows ?? []).map((r) => [r.slug, r]));
const gauntlet = bySlug(read(`${H}/gauntlet/${process.env.GAUNTLET ?? `gauntlet-${TAG}`}.json`));
const mech = bySlug(read(`${H}/mechanics/${process.env.MECH ?? `mechanics-${TAG}`}.json`));
const phone = bySlug(read(`${H}/phone/phone-controls.json`));
const visual: Record<string, { checks: number[]; notes?: string }> = read(`${H}/scorecard/scorecard-visual.json`) ?? {};

type Cat = { score: number | null; why: string[] };
const clamp = (v: number) => Math.max(0, Math.min(10, v));
const r1 = (v: number) => Math.round(v * 10) / 10;
const na = (why: string): Cat => ({ score: null, why: [why] });
/** Slugs the phone check / mechanics probe name differently. */
const alias = (slug: string) => (slug === 'try' ? 'dunk' : slug);

/**
 * PROVE IT IS NOT A PAD GAME (2026-09-15). /play/dunkduel is a real-camera contest judged by on-device pose tracking:
 * Controls measures pad latency, Logic measures a masher against intent, and Body measures a rig's clips, and it has
 * none of the three. Scoring it N/A on all six is neither a pass nor a judgement, so its flow is measured instead
 * (_proveit-flow.mts: does the page come up, does consent reach the camera, does the tracker start, any errors) and
 * that stands in for Controls and Logic. Visuals, Feel and Performance are read from the same frames and the same
 * fps as every other game. Body stays N/A and says why — a camera contest has no rig on screen.
 */
function proveItFlow(slug: string): Record<string, Cat> | null {
  if (slug !== 'dunkduel') return null;
  const fl = read(`${H}/scorecard/${TAG}/dunkduel-flow.json`);
  if (!fl) return null;
  const why: string[] = [];
  let s = 10;
  if (!fl.readyState) { s -= 5; why.push('the page never published #fel-ready (−5)'); } else why.push(`ready in ${(fl.readyMs / 1000).toFixed(1)} s`);
  if (!fl.sawConsent) { s -= 2; why.push('no consent control found (−2)'); }
  if (!fl.hasVideo) { s -= 3; why.push('no video element after consent (−3)'); }
  if (!fl.streaming) { s -= 2; why.push('the camera track never went live (−2)'); } else why.push(`camera live ${fl.w}×${fl.h}`);
  if (fl.errorCount) { s -= Math.min(4, fl.errorCount * 2); why.push(`${fl.errorCount} console errors (−${Math.min(4, fl.errorCount * 2)}): ${(fl.errors ?? [])[0] ?? ''}`); }
  why.push(fl.note ?? '');
  return {
    controls: { score: clamp(s), why: ['camera flow (no pad on this game)', ...why] },
    logic: { score: clamp(s), why: ['camera flow (no masher on this game)', ...why] },
    body: na('a camera contest has no rig on screen'),
  };
}

export function scoreGame(slug: string) {
  const cap = read(`${H}/scorecard/${TAG}/${slug}.json`);
  const g = gauntlet.get(slug);
  const m = mech.get(slug) ?? mech.get(alias(slug));
  const ph = phone.get(slug) ?? phone.get(alias(slug));
  const out: Record<string, Cat> = {};

  // 1 CONTROLS
  if (!cap?.qa || !cap.qa.presses) out.controls = na(cap?.note ?? 'no capture presses');
  else {
    const why: string[] = []; let s = 10;
    const silent = cap.qa.silentPct / 4; s -= silent; why.push(`${cap.qa.silentPct}% silent (−${r1(silent)})`);
    if (cap.qa.latMedian != null) { const lat = Math.min(2, Math.max(0, (cap.qa.latMedian - 150) / 100)); s -= lat; why.push(`median ${Math.round(cap.qa.latMedian)} ms (−${r1(lat)})`); }
    if (ph && !ph.pass) { s -= 2; why.push('phone check FAIL (−2)'); } else if (!ph) why.push('phone: not in check');
    out.controls = { score: clamp(s), why };
  }

  // 2 LOGIC
  {
    const why: string[] = []; let s = 10;
    if (!g) why.push('no gauntlet row');
    else if (!g.pass) { s = Math.min(s, 5); why.push('gauntlet did not reach the end card (cap 5)'); }
    if (m) {
      if ((m.idle?.score ?? 0) > 0) { s -= 1.5; why.push(`idle scored ${m.idle.score} (−1.5)`); }
      const best = Math.max(m.deliberate?.score ?? 0, m.intent?.score ?? 0);
      const mash = m.masher?.score ?? 0;
      const ratio = best > 0 ? mash / best : mash > 0 ? 99 : 0;
      if (ratio > 1.2) { const pen = Math.min(4, (ratio - 1.2) * 1.5); s -= pen; why.push(`mash ${mash} vs best ${best} = ${ratio === 99 ? '∞' : r1(ratio)}× (−${r1(pen)})`); }
      else why.push(`mash ${mash} vs best ${best}`);
      const unexp = Math.min(3, (m.deliberate?.unexplainedScores ?? 0) + (m.masher?.unexplainedScores ?? 0));
      if (unexp) { s -= unexp; why.push(`${unexp} unexplained score changes (−${unexp})`); }
    } else why.push('no mechanics row');
    if (cap?.qa?.unexplainedScores) { const u = Math.min(3, cap.qa.unexplainedScores); s -= u; why.push(`capture: ${u} unexplained scores (−${u})`); }
    out.logic = g || m ? { score: clamp(s), why } : na('no gauntlet or mechanics evidence');
  }

  // 3 BODY
  const b = cap?.body;
  if (!b || !b.n) out.body = na('no body samples');
  else if (b.noHero / b.n > 0.8) out.body = na(`no hero body in ${Math.round((100 * b.noHero) / b.n)}% of samples (quiz / vehicle)`);
  else {
    const n = b.n - b.noHero; const why: string[] = []; let s = 10;
    const pc = (v: number) => (100 * v) / n;
    const bind = 0.5 * pc(b.noClip); s -= bind; why.push(`${r1(pc(b.noClip))}% no clip (−${r1(bind)})`);
    const tee = pc(b.tee); s -= tee; why.push(`${r1(tee)}% T-arms (−${r1(tee)})`);
    const awk = 0.08 * pc(b.awkward); s -= awk; why.push(`${r1(pc(b.awkward))}% awkward arms (−${r1(awk)})`);
    const perSec = b.clipChanges / Math.max(1, n / 10); const jit = Math.max(0, perSec - 2); s -= jit; why.push(`${r1(perSec)} clip changes/s (−${r1(jit)})`);
    // RECOGNISABLE (owner 2026-09-15): a move played by another sport's motion (a throw by the jab, a dive by a roundhouse)
    if (cap?.stoodIn) {
      const wrong = wrongMoves(cap.stoodIn);
      const pen = Math.min(4, 1.5 * wrong.length); s -= pen;
      why.push(wrong.length ? `wrong moves: ${wrong.map((w) => `${w.requested}→${w.played}`).join(', ')} (−${r1(pen)})` : 'every move plays its own motion');
    } else why.push('no stood-in ledger (capture predates the recognisable check)');
    out.body = { score: clamp(s), why };
  }

  // 4 VISUALS
  const v = visual[slug];
  if (!v) out.visuals = na('frame review pending');
  else {
    let s = v.checks.reduce((a, c) => a + c, 0); const why = [`review ${v.checks.join('/')}${v.notes ? ' — ' + v.notes : ''}`];
    const off = Math.min(3, cap?.feltFrame ?? 0); if (off) { s -= off; why.push(`${off} hero off-screen (−${off})`); }
    out.visuals = { score: clamp(s), why };
  }

  // 5 FEEL
  if (!cap?.qa) out.feel = na('no capture');
  else {
    const rich = cap.qa.rich ?? 0; const jpm = cap.qa.juicePerMin ?? 0;
    out.feel = { score: clamp(5 * rich + 5 * Math.min(1, jpm / 8)), why: [`${Math.round(rich * 100)}% rich answers`, `${r1(jpm)} juice/min`] };
  }

  // 6 PERFORMANCE
  if (cap?.fpsP10 == null) out.performance = na(cap?.note ?? 'no fps');
  else {
    const f = cap.fpsP10; let s = f >= 55 ? 10 : f >= 30 ? 5 + ((f - 30) / 25) * 5 : f / 6; const why = [`fps p10 ${f} / p50 ${cap.fpsP50}`];
    const e = Math.min(9, 3 * (cap.errorCount ?? 0)); if (e) { s -= e; why.push(`${cap.errorCount} errors (−${e}): ${(cap.errors ?? [])[0] ?? ''}`); }
    if ((cap.loadMs ?? 0) > 8000) { s -= 1; why.push(`load ${(cap.loadMs / 1000).toFixed(1)} s (−1)`); }
    out.performance = { score: clamp(s), why };
  }

  // the camera contest's own three categories replace the pad-shaped ones
  const flow = proveItFlow(slug);
  if (flow) for (const [k, v] of Object.entries(flow)) out[k] = v;

  const scored = Object.values(out).filter((c) => c.score != null).map((c) => c.score!);
  const min = scored.length ? Math.min(...scored) : 0;
  const mean = scored.length ? scored.reduce((a, c) => a + c, 0) / scored.length : 0;
  const pending = Object.values(out).some((c) => c.score == null && /pending|no capture|no body samples|no fps/.test(c.why[0]));   // a category N/A for a REASON (a quiz has no body; a camera game has no rig) is not pending
  return { slug, cats: out, min: r1(min), mean: r1(mean), pass: !pending && min >= 7.5 };
}

const rows = SCORE_ROUTES.map(([s]) => scoreGame(s));
const CATS = ['controls', 'logic', 'body', 'visuals', 'feel', 'performance'];
const cell = (c: Cat) => (c.score == null ? 'N/A' : c.score >= 7.5 ? `${r1(c.score)}` : `**${r1(c.score)}**`);
let md = `# FEL scorecard — ${TAG}\n\nRubric: docs/SCORECARD.md. A game passes when EVERY category is ≥ 7.5 (bold = below the bar).\n\n`;
md += `**${rows.filter((r) => r.pass).length}/${rows.length} games pass.**\n\n| game | ${CATS.join(' | ')} | min | mean | pass |\n|---|${CATS.map(() => '---').join('|')}|---|---|---|\n`;
for (const r of rows) md += `| ${r.slug} | ${CATS.map((c) => cell(r.cats[c])).join(' | ')} | ${r.min} | ${r.mean} | ${r.pass ? 'PASS' : '—'} |\n`;
md += `\n## Why\n`;
for (const r of rows) {
  md += `\n### ${r.slug}\n`;
  for (const c of CATS) md += `- **${c}** ${cell(r.cats[c])}: ${r.cats[c].why.join('; ')}\n`;
}
fs.mkdirSync(`${H}/scorecard`, { recursive: true });
fs.writeFileSync(`${H}/scorecard/SCORECARD-${TAG}.md`, md);
fs.writeFileSync(`${H}/scorecard/scorecard-${TAG}.json`, JSON.stringify(rows, null, 1));
console.log(md.split('\n## Why')[0]);
