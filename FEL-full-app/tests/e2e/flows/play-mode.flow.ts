// KEY FLOW 2 — play a mode to the end screen. A signed-in player starts Spot the Scene, answers all fifteen questions and
// gets the end screen with the server's reward.
//
// The rig cannot run WebGL fast enough on a CI runner to PLAY a 3D mode to its end inside a test budget, so this runs the
// mode under production's own kill switch, NEXT_PUBLIC_DISABLE_3D=1 (components/three/flags.ts), which serves the 2D
// game through the same GameShell. The 3D mount of every mode is the visual gate's (one frame per mode) and the perf
// gate's. What this holds is the shell's end-of-run contract, the part every mode shares:
//   * the server run is asked for (POST /api/sessions/start) and the finish carries ITS runId;
//   * the finish (POST /api/sessions) carries the mode, a whole-number score >= 0 and played: true for a played run;
//   * the end screen appears and shows the server's figures (XP from the answer, not from the client).
import { assert, until } from '../../../scripts/e2e/rig';
import { prqGrade } from '../../../lib/prq';
import type { Flow } from '../../../scripts/e2e/flow';
import { FakeAuth } from '../fakes/auth';

const PLAYER = { id: 'player-1', email: 'player@example.com', password: 'x', name: 'Rig Player' };

export const playModeFlow: Flow = {
  name: 'play-mode',
  title: 'A signed-in player plays Spot the Scene through all fifteen questions to the end screen',
  timeoutMs: 180_000,
  async run(ctx) {
    const auth = new FakeAuth([PLAYER], PLAYER.email);
    const s = ctx.session({
      pages: { '/play/who-scene-it': { entry: 'tests/e2e/entries/play-mode.tsx', env: { NEXT_PUBLIC_DISABLE_3D: '1' } } },
      api: (req) => {
        const a = auth.handle(req);
        if (a) return a;
        if (req.path === '/api/profile') return { json: { profile: { userId: PLAYER.id, name: PLAYER.name }, prq: 64, grade: prqGrade(64) } };
        if (req.path === '/api/sessions/start' && req.method === 'POST') return { json: { runId: 'run-e2e-1', agentRun: false } };
        if (req.path === '/api/sessions' && req.method === 'POST') {
          return { json: { ok: true, paid: true, sessionId: 'sess-e2e-1', xp: 120, shards: 2, credits: 0, prqDelta: 0.4, prqAfter: 64.4, coins: 40 } };
        }
        if (req.path.startsWith('/api/wallet') || req.path.startsWith('/api/v1/wallet')) return { json: { ok: true, granted: 0 } };
        return { json: {} };
      },
    });
    const page = await s.open('/play/who-scene-it');
    await page.getByRole('button', { name: 'ROLL THE SCENE' }).click({ timeout: 60_000 });
    await until('POST /api/sessions/start', () => s.called('/api/sessions/start', 'POST')[0]);
    await ctx.shot(page, '1-playing');
    // answer every question: press 1 whenever the options are live (keys 1–4 pick an answer)
    const t0 = Date.now();
    while (!(await page.locator('[data-end-screen]').count())) {
      if (Date.now() - t0 > 150_000) throw new Error('the run did not reach the end screen in 150 s');
      await page.keyboard.press('1');
      await page.waitForTimeout(250);
    }
    await page.locator('[data-end-screen]').waitFor();
    const fin = await until('POST /api/sessions', () => s.called('/api/sessions', 'POST')[0]);
    const b = fin.body as { mode?: string; runId?: string; score?: number; played?: boolean };
    assert(b.mode === 'whoSceneIt', `the finish was sent for mode ${JSON.stringify(b.mode)}`);
    assert(b.runId === 'run-e2e-1', `the finish carried runId ${JSON.stringify(b.runId)}, not the server run's`);
    assert(Number.isInteger(b.score) && (b.score as number) >= 0, `the finish carried score ${JSON.stringify(b.score)}`);
    assert(b.played === true, 'a fully played run was sent as played: false');
    await page.locator('[data-end-screen]').getByText('+120', { exact: true }).waitFor({ timeout: 15_000 });
    await ctx.shot(page, '2-end-screen');
    ctx.log(`15 questions answered; finish sent score ${b.score}; end screen shows the server's +120 XP`);
  },
};
