// R-HEALTH-CLIENT (2026-09-30; FE PM 19:38 and 19:46 PT), test e: the Mirror sends no save request — and nothing at all
// to /api/mirror/* — unless the server said this user can save (app/play/mirror/_components/mirror-save.ts), and the
// harness routes every one of its /api/mirror/* calls through that guard. Plus the intake screen's static rules.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MIRROR_SAVE_URLS, NOT_SAVED_ON_DEVICE, mirrorSave } from '@/app/play/mirror/_components/mirror-save';
import { LEGACY_GUARDIAN_NEEDED } from '@/app/play/mirror/_components/intake-refusal';
import { planSave } from '@/components/mirror/screen-self-report';
import { RED_FLAG_QUESTION_IDS } from '@/lib/health/intake';

function recorder() {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const response = new Response('{}');
  const fn = ((url: string, init?: RequestInit) => { calls.push({ url, init }); return Promise.resolve(response); }) as unknown as typeof fetch;
  return { fn, calls, response };
}
const INIT: RequestInit = { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"reps":3}' };
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

describe('mirrorSave', () => {
  it('lists the three /api/mirror/* URLs the harness calls', () => {
    expect([...MIRROR_SAVE_URLS].sort()).toEqual(['/api/mirror/dunks', '/api/mirror/screen', '/api/mirror/sessions']);
  });

  it.each(MIRROR_SAVE_URLS.map((u) => [u]))('canSave false → %s is never called (null, zero calls)', (url) => {
    const r = recorder();
    expect(mirrorSave(false, r.fn, url, INIT)).toBeNull();
    expect(mirrorSave(false, r.fn, url)).toBeNull();
    expect(r.calls).toEqual([]);
  });

  it.each([[undefined], [null], ['true'], [1], [{}]])('a canSave that is not exactly true (%s) never sends', (v) => {
    const r = recorder();
    expect(mirrorSave(v as unknown as boolean, r.fn, '/api/mirror/sessions', INIT)).toBeNull();
    expect(r.calls).toEqual([]);
  });

  it.each(MIRROR_SAVE_URLS.map((u) => [u]))('canSave true → exactly one call to %s, URL and init passed through unchanged', async (url) => {
    const r = recorder();
    const pending = mirrorSave(true, r.fn, url, INIT);
    expect(pending).not.toBeNull();
    expect(await pending).toBe(r.response);
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0].url).toBe(url);
    expect(r.calls[0].init).toBe(INIT);
  });

  it('the history read (no init) passes through as a plain GET for a saver', () => {
    const r = recorder();
    void mirrorSave(true, r.fn, '/api/mirror/dunks');
    expect(r.calls).toEqual([{ url: '/api/mirror/dunks', init: undefined }]);
  });

  it('the not-saved line names who is saved for, and does not say "could not"', () => {
    expect(NOT_SAVED_ON_DEVICE).toBe('Saved on this device only: we save Mirror results just for verified adults who opt in.');
    expect(NOT_SAVED_ON_DEVICE).not.toMatch(/could not|failed|error/i);
  });

  it("the answers card sends no PATCH for a screen that is 'unsaved' (components/mirror/screen-self-report.tsx, unchanged)", () => {
    expect(planSave('unsaved', { lowerRibsWiden: 'yes' } as never)).toEqual({ send: null, state: 'noScreen' });
  });
});

describe('STATIC: mirror-harness.tsx', () => {
  const src = read('../../app/play/mirror/_components/mirror-harness.tsx');
  const code = stripComments(src);

  it('makes no direct fetch at all: every /api/mirror/* call goes through mirrorSave(canSaveScan, fetch, …)', () => {
    expect(code.match(/\bfetch\(/g)).toBeNull();
    const urls = code.match(/'\/api\/mirror\/[a-z]+'/g) ?? [];
    const guarded = code.match(/mirrorSave\(canSaveScan, fetch, '\/api\/mirror\/[a-z]+'/g) ?? [];
    expect(urls.length).toBe(4);                 // sessions POST, dunks POST, the dunk-history read, screen POST
    expect(guarded.length).toBe(urls.length);
  });

  it('sends nothing to /api/v1/workout/scan and no PATCH of its own', () => {
    expect(code).not.toContain('/api/v1/workout/scan');
    expect(code).not.toMatch(/method:\s*'PATCH'/);
  });

  it('canSaveScan defaults to false (a missing prop never saves)', () => {
    // MIRROR-MOVES P2 (2026-10-07): a third prop (initialPattern, the `?pattern=` tab) follows — the default under test is unchanged
    expect(code).toMatch(/export function MirrorHarness\(\{ youth = 'unknownAge', canSaveScan = false[,}]/);
  });

  it('writes nothing to browser storage', () => {
    expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });

  it('a screen that was not sent keeps its local score, is marked unsaved, and says NOT_SAVED_ON_DEVICE', () => {
    const at = code.indexOf("mirrorSave(canSaveScan, fetch, '/api/mirror/screen'");
    const tail = code.slice(at, at + 1400);
    expect(tail).toMatch(/if \(!pending\) \{\s*setScreenMessage\(NOT_SAVED_ON_DEVICE\);\s*setSavedScreenId\('unsaved'\);\s*return;\s*\}/);
    expect(code.indexOf('setScreenSummary(scoreScreen(')).toBeLessThan(at);
    expect(code).toContain('SCREEN_NOT_SAVED');                  // still the line for a real failure
  });

  it('a jump that was not sent shows the offline path\'s on-device line', () => {
    const at = code.indexOf("mirrorSave(canSaveScan, fetch, '/api/mirror/dunks', {");
    expect(code.slice(at, at + 600)).toContain('if (!pending) { setDunkSaid(progressLine(readProgress([attempt]), attempt)); return; }');
  });

  it('the dunk-history read is skipped before anything is set up when mirrorSave says no', () => {
    const at = code.indexOf("const pending = mirrorSave(canSaveScan, fetch, '/api/mirror/dunks');");
    expect(at).toBeGreaterThan(-1);
    expect(code.slice(at, at + 200)).toMatch(/if \(!pending\) return;\s*let live = true;/);
  });

  it('the guard\'s import sits on its own line right after lucide-react (PR #19 owns the import block further down)', () => {
    const lines = src.split('\n');
    const lucide = lines.findIndex((l) => l.includes("from 'lucide-react'"));
    expect(lines[lucide + 1]).toMatch(/^import \{ NOT_SAVED_ON_DEVICE, mirrorSave \} from '\.\/mirror-save';/);
  });
});

describe('STATIC: health-intake-gate.tsx', () => {
  const src = read('../../app/play/mirror/_components/health-intake-gate.tsx');
  const code = stripComments(src);
  const view = (stage: string) => { const i = code.indexOf(`if (stage === '${stage}'`); expect(i).toBeGreaterThan(-1); return code.slice(i, code.indexOf('\n  }\n', i)); };

  it('imports ./intake-refusal and lib/health/intake, and defines no red-flag rule of its own', () => {
    expect(code).toContain("from './intake-refusal'");
    expect(code).toContain("from '@/lib/health/intake'");
    expect(code).not.toMatch(/isRedFlag|redFlagsFor|validateIntakeAnswers|yesIsRedFlag/);
    for (const id of RED_FLAG_QUESTION_IDS) expect(code).not.toContain(id);
  });

  it("'ready_unsaved' renders children (the Mirror); 'stopped_local' does not", () => {
    expect(view('ready_unsaved')).toContain('{children}');
    expect(view('stopped_local')).not.toContain('children');
    expect(view('stopped_local')).toContain('{RED_FLAG_COPY}');
  });

  it('the legacy guardian stage is left in place, unreachable, with the same code string', () => {
    expect(src).toContain(`const GUARDIAN_NEEDED = '${LEGACY_GUARDIAN_NEEDED}';`);
    expect(code).toContain("if (stage === 'guardian_needed')");
  });

  it('writes nothing to browser storage', () => {
    expect(code).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
  });
});
