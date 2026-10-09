// MIRROR-COACH P9 (2026-09-30) — the written correctives and further reading, rendered the way the server renders them,
// because the :3131 dev server was down for this step (no live page). Every surface this step mounted, from the real
// components over fixture data: the correctives page (adult mid-program, after a retest, sets not kept, intake due,
// minor, no birth year), what a press/row set earns (adult, youth), the screen card's written corrective, the coach's
// draft with the corrective line (the real coachDraft over the dev fixture's stored screens), and Education's further
// reading. Writes <out>/<name>.html and a plain-text <out>/<name>.txt for each, and <out>/index.json.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const out = process.argv[2];
mkdirSync(out, { recursive: true });
const React = await import('react');
// tsx compiles JSX with the classic runtime (React.createElement); the app's components use the automatic one
(globalThis as any).React = React;
const { createElement } = React;
const { renderToStaticMarkup } = await import('react-dom/server');
const { CorrectivesView } = await import('@/components/mirror/correctives-view');
const { SessionCorrectives, CorrectivesPicker } = await import('@/components/mirror/session-correctives');
const { ScreenNextSteps } = await import('@/components/mirror/screen-next-steps');
const { DraftView } = await import('@/components/coach/screen-prescriptions');
const { FurtherReading } = await import('@/components/education/further-reading');
const C = await import('@/lib/mirror/correctives');
const { coachDraft } = await import('@/lib/coach/mirrorToProgram');
const F = await import('@/app/dev/coach-prescribe/fixture');

const DAY = 86_400_000, T0 = Date.UTC(2026, 8, 20);
const set = (i: number, faultCounts: Record<string, number>) => ({ patternId: C.PRESS_ROW_PATTERN_ID, startedAt: new Date(T0 + i * DAY), reps: 12, faultCounts });
const DRIFT = { upper_traps: 4, posterior_chain: 3, lat_rhomboid: 3 };
const SUMMARY = {
  durationMs: 120_000, reps: 12, avgTempo: { pullSec: 1.6, pressSec: 1.4 },
  faultCounts: { rib_thoracic: 8, lumbo_pelvic: 8, posterior_chain: 6, lat_rhomboid: 6, upper_traps: 5 },
  timeInStableMs: { rib_thoracic: 20_000, lumbo_pelvic: 20_000, posterior_chain: 30_000, lat_rhomboid: 30_000, upper_traps: 40_000 },
};
const page = (youth: any, rows: any[], keeping: boolean, hold: string | null = null) =>
  createElement(CorrectivesView, { youth, hold, program: C.programView(rows, youth, { keeping }) });
const flags = F.fixtureScreens('flags');
const draft = coachDraft(flags.rows, F.FIXTURE_CATALOGUE as any, { youth: null });
const draftYouth = coachDraft(flags.rows, F.FIXTURE_CATALOGUE as any, { youth: 'minor' });
const dv = (d: any) => createElement(DraftView, { clientId: 'dev-client', draft: d, sessions: [{ id: 's1', label: 'Day 1' }], into: 's1', onInto: () => {}, added: {}, onAddOne: () => {}, onAddBlock: () => {} });

const surfaces: Record<string, any> = {
  'page-adult-mid-program': page(null, [set(0, DRIFT), set(1, DRIFT), set(2, { upper_traps: 2 })], true),
  'page-adult-after-retest': page(null, [set(0, DRIFT), set(1, DRIFT), set(2, { upper_traps: 2 }), set(3, {}), set(4, { upper_traps: 1 }), set(5, {})], true),
  'page-adult-sets-not-kept': page(null, [], false),
  'page-adult-intake-due': page(null, [], true, C.CORRECTIVES_INTAKE_FIRST),
  'page-minor': page('minor', [], false),
  'page-no-birth-year': page('unknownAge', [], false),
  'mirror-picker-adult': createElement(CorrectivesPicker, { youth: null }),
  'mirror-picker-minor': createElement(CorrectivesPicker, { youth: 'minor' }),
  'mirror-set-adult': createElement(SessionCorrectives, { summary: SUMMARY, youth: null }),
  'mirror-set-minor': createElement(SessionCorrectives, { summary: SUMMARY, youth: 'minor' }),
  'screen-card-adult': createElement(ScreenNextSteps, { screen: flags.screen, grades: flags.grades, youth: null }),
  'screen-card-no-birth-year': createElement(ScreenNextSteps, { screen: flags.screen, grades: flags.grades }),
  'coach-draft-adult-client': dv(draft),
  'coach-draft-minor-client': dv(draftYouth),
  'education-further-reading': createElement(FurtherReading),
};
const text = (html: string) => html.replace(/<(p|li|h\d|nav|section|div|ol|ul|br)[^>]*>/g, '\n').replace(/<[^>]+>/g, ' ')
  .replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
const index: Record<string, { bytes: number; lines: number; writtenCorrectives: number; bandDrills: number; releases: number }> = {};
for (const [name, el] of Object.entries(surfaces)) {
  const html = renderToStaticMarkup(el);
  writeFileSync(join(out, `${name}.html`), `<!doctype html><meta charset="utf-8"><title>${name}</title><body style="background:#050505;color:#ddd;font:14px system-ui">${html}</body>`);
  const t = text(html);
  writeFileSync(join(out, `${name}.txt`), t + '\n');
  index[name] = {
    bytes: html.length, lines: t.split('\n').length,
    writtenCorrectives: (html.match(/data-written-corrective=/g) ?? []).length,
    bandDrills: (html.match(/data-band=/g) ?? []).length,
    releases: (html.match(/data-release-zone=/g) ?? []).length,
  };
}
writeFileSync(join(out, 'index.json'), JSON.stringify(index, null, 2));
console.log(JSON.stringify(index, null, 1));
