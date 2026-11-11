// EVERY-SCREEN phase 1: the scorer's control pages. A check nobody has seen fail is not a check, so before the scorer is
// believed it must (a) pass a clean page on all four checks and (b) flag every planted fault below, on the page that
// plants it, and nothing else on that page. `score.mts --plant` runs them and exits 1 on any miss.
//
// Each page is plain HTML served by the scorer on the app's own origin (so a planted link to a missing route gets the
// app's real 404). The dark ink and the fonts are the app's own numbers, written out, so the pages need none of its CSS.
import type { CheckId } from '../../lib/every-screen/judge.ts';

const SHELL = (body: string, head = '') => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Control</title>
<style>html{background:#050505;color:#f2f5f9;font:16px/1.5 system-ui,sans-serif}body{margin:0;padding:16px}h1{font-size:28px;margin:0 0 12px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border-radius:12px;background:#22d3ee;color:#050505;font-weight:700;font-size:16px;border:0;text-decoration:none}
.link{display:inline-flex;align-items:center;min-height:44px;padding:0 8px;color:#7dd3fc;font-size:16px}</style>${head}</head><body><main>${body}</main></body></html>`;

export interface Control {
  name: string;
  html: string;
  /** the kind the scorer is told the page is (the 40-word rule applies to 'do') */
  kind: 'do';
  /** the checks that must fail, and the fault ids that must be among the faults found */
  expectFail: CheckId[];
  expectFaults: string[];
}

const words = (n: number) => Array.from({ length: n }, (_, i) => ['jump', 'land', 'reach', 'drive', 'hold', 'press'][i % 6]).join(' ');

export const CONTROLS: Control[] = [
  {
    name: 'clean',
    kind: 'do',
    expectFail: [],
    expectFaults: [],
    // EVERY-SCREEN P6 (owner, 2026-11-11): a 60-word approved notice, marked, must not count toward the 40 words: this page
    // stays clean only if it is left out. fault-clear's 120 unmarked words must still fail (the other direction).
    html: SHELL(`<h1>Test your jump</h1><p>Stand side-on, hands on hips. Three jumps.</p>
      <p data-notice="medical">${words(60)}</p>
      <p><a class="btn" href="/">Start the test</a></p><p><a class="link" href="/">Back to home</a></p>
      <section><p>No jumps saved yet.</p><a class="link" href="/">Do your first jump</a></section>
      <p style="display:flex;align-items:center;gap:8px"><span class="animate-spin" style="display:inline-block;width:16px;height:16px;border:2px solid #22d3ee;border-top-color:transparent;border-radius:50%"></span>Checking the camera…</p>
      <div style="min-height:160px"><div role="progressbar" aria-valuenow="40" aria-valuemin="0" aria-valuemax="100" style="height:6px;width:200px;background:#22d3ee;border-radius:3px"></div><p style="margin:8px 0 0">Loading the court…</p></div>
      <p id="out" aria-live="polite"></p>
      <script>document.querySelector('.btn').addEventListener('click', function (e) { e.preventDefault(); document.getElementById('out').textContent = 'Starting'; });</script>`),
  },
  {
    // check 1: three bright buttons, 120 words before scrolling, a 30 px target
    name: 'fault-clear',
    kind: 'do',
    expectFail: ['clear'],
    expectFaults: ['many-primary', 'too-many-words', 'small-targets'],
    html: SHELL(`<h1>Test your jump</h1><p>${words(120)}</p>
      <p><a class="btn" href="/">Start the test</a> <a class="btn" href="/">Start another</a> <a class="btn" href="/">Start a third</a></p>
      <p><a href="/" style="display:inline-block;width:30px;height:30px;background:#333;color:#fff;text-align:center;line-height:30px;font-size:16px" aria-label="Small one">x</a></p>`),
  },
  {
    // check 1: a dead end (nothing leads on or back)
    name: 'fault-dead-end',
    kind: 'do',
    expectFail: ['clear'],
    expectFaults: ['dead-end'],
    html: SHELL(`<h1>Saved</h1><p>Your result is saved.</p>`),
  },
  {
    // check 2: coming soon, an owner placeholder, an empty state with no next step, a spinner with no words, sideways
    // scroll, a clipped number, six text sizes, five button looks, 10 px text
    name: 'fault-finished',
    kind: 'do',
    expectFail: ['finished'],
    expectFaults: ['unfinished:coming soon', 'unfinished:placeholder text', 'empty-no-next', 'spinner-no-words', 'hscroll:phone', 'hscroll:zoom200', 'hscroll:font150', 'clipped:phone', 'tiny-text', 'text-sizes', 'button-looks'],
    html: SHELL(`<h1>Groups</h1><p>Coming soon</p><p>[OWNER: write this line]</p>
      <section><p>No sessions yet</p></section>
      <div style="width:28px;height:28px;border:3px solid #22d3ee;border-top-color:transparent;border-radius:50%" class="animate-spin"></div>
      <div style="width:700px;height:20px;background:#123"></div>
      <div style="width:70px;overflow:hidden;white-space:nowrap;font-size:16px">Score 12,345 points</div>
      <p style="font-size:10px">ten pixel text here</p><p style="font-size:13px">thirteen</p><p style="font-size:15px">fifteen</p><p style="font-size:19px">nineteen</p><p style="font-size:22px">twenty two</p>
      <p><a class="btn" href="/">Go on</a></p>
      <p><a href="/" style="display:inline-flex;align-items:center;min-height:48px;padding:0 20px;border:2px solid #fff;border-radius:0;color:#fff;font-size:18px;font-weight:400">Square</a></p>
      <p><a href="/" style="display:inline-flex;align-items:center;min-height:56px;padding:0 20px;background:rgba(255,255,255,.1);border-radius:999px;color:#fff;font-size:14px;font-weight:800;text-transform:uppercase">Pill</a></p>
      <p><a href="/" style="display:inline-flex;align-items:center;min-height:44px;padding:0 20px;background:linear-gradient(90deg,#444,#555);border-radius:6px;color:#fff;font-size:20px;font-weight:600">Slab</a></p>
      <p><a href="/" style="display:inline-flex;align-items:center;min-height:64px;padding:0 20px;border:1px solid #888;border-radius:24px;color:#fff;font-size:12px;font-weight:300">Thin</a></p>`),
  },
  {
    // check 3: first content after a long script, a banner that pushes the page down, a handler that blocks the tap
    name: 'fault-fast',
    kind: 'do',
    expectFail: ['fast'],
    expectFaults: ['slow-first-content', 'layout-shift', 'slow-tap'],
    html: SHELL(`<div id="late"></div><h1>Test your jump</h1><p>Stand side-on, hands on hips. Three jumps.</p>
      <p><a class="btn" href="/">Start the test</a></p><p id="out" aria-live="polite"></p>
      <script>
        document.querySelector('.btn').addEventListener('click', function (e) { e.preventDefault(); var t = performance.now(); while (performance.now() - t < 400) {} document.getElementById('out').textContent = 'Starting'; });
        // the banner arrives after the first frame is on screen, as a late-loading card does
        setTimeout(function () { var d = document.getElementById('late'); d.style.height = '160px'; d.style.background = '#123'; }, 900);
      </script>`, `<script>var t0 = performance.now(); while (performance.now() - t0 < 3200) {}</script>`),
  },
  {
    // check 4: a link to a page that is not there, a link to nowhere, a button with no name, a button that does nothing;
    // and a measured number with no method line (a review flag, not a fail)
    name: 'fault-right',
    kind: 'do',
    expectFail: ['right'],
    expectFaults: ['broken-link', 'link-nowhere', 'button-does-nothing', 'a11y-critical', 'review:number-no-method'],
    html: SHELL(`<h1>Your jump</h1><p style="font-size:28px">61.2 cm</p>
      <p><button class="btn" type="button">Save it</button></p>
      <p><a class="link" href="/this-page-is-not-here-es">See all jumps</a></p><p><a class="link" href="#">Share</a></p>
      <p><button type="button" style="width:48px;height:48px;background:#222;border:1px solid #555;border-radius:8px"></button></p>`),
  },
];
