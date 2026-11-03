// BBS-03 (platform phase 9, 2026-11-03): the ball-skill drills. Held to the same chart rules as the Playbook's drills
// (drills.test.ts), the cue style (lib/cue-style/style.ts), and run END TO END through the real DrillRunner by a player
// who does every target on its beat — the camera side's reports delivered the way drill-live hands them over.
import { describe, it, expect } from 'vitest';
import { COACH_MOMENTS } from '../babylon/audio/mic/moments';
import { LIMBS, MOVE_LIMBS, MOVE_WINDOW_SCALE, lateGraceFor, limbSatisfies, type Limb } from '../babylon/core/bodyTargets';
import { bodyWindows, isBodyStep } from '../babylon/core/DanceCore';
import { lintStyle } from '../cue-style/style';
import { drillDemoLoop } from '../library/surfaceDemo';
import { COACH_WORDS_PER_SEC, FIRST_LEAD_IN_SEC, LEAD_IN_SEC, phaseSteps, type Drill, type DrillTarget } from './chart';
import { DrillRunner, type DrillBodyEvent, type DrillState, type LimbPositions } from './DrillRunner';
import { DRILLS, drillById } from './drills';
import { HOOPS_DRILLS } from './hoopsDrills';
import { HOOPS_SHELF, OFFERED_DRILLS, ROUTE_DRILLS, SHELF_DRILLS, drillShortSource, drillSourceLine, routeDrill, shelfHref, shelfOf } from './route';
import { drillsAccess } from './access';

const missAfter = (t: DrillTarget) => bodyWindows(MOVE_WINDOW_SCALE[t.move]).missAfter;
const words = new Map(COACH_MOMENTS.map((m) => [m.id, m.maxWords]));
const overlap = (a: Limb | undefined, b: Limb | undefined) => LIMBS.some((e) => limbSatisfies(a, e) && limbSatisfies(b, e)) || (!a && !b);

describe('the ball-skill shelf', () => {
  it('10–15 drills, unique ids, none shared with the Playbook\'s, each found by id and offered on the route', () => {
    expect(HOOPS_DRILLS.length).toBeGreaterThanOrEqual(10);
    expect(HOOPS_DRILLS.length).toBeLessThanOrEqual(15);
    const ids = HOOPS_DRILLS.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const d of HOOPS_DRILLS) {
      expect(DRILLS.some((x) => x.id === d.id)).toBe(false);
      expect(drillById(d.id)).toBe(d);
      expect(routeDrill(d.id)).toBe(d);
      expect(OFFERED_DRILLS).toContain(d);
    }
    // the Playbook's shelf is unchanged
    expect(SHELF_DRILLS.playbook).toBe(ROUTE_DRILLS);
    expect(SHELF_DRILLS.hoops).toBe(HOOPS_DRILLS);
    expect(shelfOf(HOOPS_SHELF)).toBe('hoops');
    expect(shelfOf('anything')).toBe('playbook');
    expect(shelfHref('hoops')).toBe('/play/drills?shelf=hoops');
  });

  it('every drill names FEL as its source, plainly, with what changed for a room', () => {
    for (const d of HOOPS_DRILLS) {
      expect(d.source.book).toBe('fel');
      expect(d.source.adapted?.length).toBeGreaterThan(0);
      expect(drillSourceLine(d)).toMatch(/^FEL ball skills · /);
      expect(drillShortSource(d)).toBe('Ball skills');
    }
  });

  it('no demo loop is borrowed: none is mapped yet (queued for demo-loops), so the page shows the still start pose', () => {
    for (const d of HOOPS_DRILLS) expect(drillDemoLoop(d.id)).toBeNull();
  });
});

for (const d of HOOPS_DRILLS) {
  describe(`${d.id}: the chart`, () => {
    it('phases: unique ids, a positive length, a rest has no targets', () => {
      expect(new Set(d.phases.map((p) => p.id)).size).toBe(d.phases.length);
      for (const p of d.phases) {
        expect(p.durationSec).toBeGreaterThan(0);
        if (p.presence === 'free') expect(p.targets).toHaveLength(0);
      }
    });

    it('targets: in order, after the lead-in, with a tail for the late event, legal limbs and zones', () => {
      d.phases.forEach((p, pi) => {
        const lead = pi === 0 ? FIRST_LEAD_IN_SEC : LEAD_IN_SEC;
        p.targets.forEach((t, i) => {
          if (i > 0) expect(t.t).toBeGreaterThanOrEqual(p.targets[i - 1].t);
          expect(t.t, `${p.id} #${i}`).toBeGreaterThanOrEqual(lead);
          expect(t.t + missAfter(t) + lateGraceFor(t.move, t.holdSec), `${p.id} #${i} tail`).toBeLessThanOrEqual(p.durationSec);
          if (t.holdSec) expect(t.t + t.holdSec).toBeLessThanOrEqual(p.durationSec);
          expect(MOVE_LIMBS[t.move], `${p.id} #${i} ${t.move}/${t.limb}`).toContain(t.limb ?? null);
          if (t.move === 'touch') expect(t.zone).toBeTruthy();
          if (t.zone) {
            expect(t.move).toBe('touch');
            for (const v of [t.zone.x, t.zone.y]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(1); }
          }
          if (t.holdSec) expect(['hold', 'land', 'squat']).toContain(t.move);
          if (t.move === 'hold') expect(t.holdSec).toBeGreaterThan(0);
        });
      });
    });

    it('no event can fall in two targets\' windows', () => {
      for (const p of d.phases) {
        for (let i = 0; i < p.targets.length; i++) {
          for (let j = i + 1; j < p.targets.length; j++) {
            const a = p.targets[i], b = p.targets[j];
            if (a.move !== b.move || !overlap(a.limb, b.limb)) continue;
            expect(b.t - a.t, `${p.id} #${i}/#${j} ${a.move}`).toBeGreaterThan(missAfter(a) + missAfter(b) - 1e-9);
          }
        }
      }
    });

    it('prompts: the coach\'s own lines, one at a time, intro first and done last', () => {
      const timeline: { t: number; id: string }[] = [];
      let off = 0;
      for (const p of d.phases) {
        p.prompts.forEach((x, i) => {
          expect(words.has(x.id), x.id).toBe(true);
          expect(x.t).toBeGreaterThanOrEqual(0);
          expect(x.t).toBeLessThan(p.durationSec);
          if (i > 0) expect(x.t).toBeGreaterThan(p.prompts[i - 1].t);
          timeline.push({ t: off + x.t, id: x.id });
        });
        off += p.durationSec;
      }
      expect(timeline[0]).toEqual({ t: 0, id: 'coach.drill.intro' });
      expect(timeline[timeline.length - 1].id).toBe('coach.drill.done');
      for (let i = 1; i < timeline.length; i++) {
        expect(timeline[i].t - timeline[i - 1].t).toBeGreaterThanOrEqual(words.get(timeline[i - 1].id)! / COACH_WORDS_PER_SEC - 1e-9);
      }
    });

    it('becomes judge steps that are all body targets', () => {
      for (const p of d.phases) {
        const steps = phaseSteps(p);
        expect(steps).toHaveLength(p.targets.length);
        for (const s of steps) expect(isBodyStep(s)).toBe(true);
      }
    });

    it('its words follow the cue style: labels, prompts and the card', () => {
      const found: string[] = [];
      const check = (t: string, tier: Parameters<typeof lintStyle>[1]) => { for (const f of lintStyle(t, tier)) found.push(`${tier} "${t}": ${f.rule} ${f.detail}`); };
      check(d.name, 'label');
      check(d.blurb, 'card');
      for (const p of d.phases) {
        check(p.cue, 'prompt');
        for (const t of p.targets) if (t.label) check(t.label.toLowerCase(), 'label');
      }
      expect(found).toEqual([]);
    });
  });
}

// ── end to end: the real DrillRunner, a player who does every target on its beat ─────────────────────────────────────

const TICK_MS = 1000 / 60;
const FRAME_MS = 1000 / 30;
const CAMERA_MS = 66;
interface Sent { ev: DrillBodyEvent; arrive: number }
interface Frame { t: number; pos: LimbPositions }

/** The camera side's reports for a perfect player (DrillRunner.test.ts perfectPlayer, the same delivery model). */
function perfectPlayer(d: Drill): { events: Sent[]; frames: Frame[] } {
  const events: Sent[] = [];
  const frames: Frame[] = [];
  let start = 0;
  for (const p of d.phases) {
    for (const t of p.targets) {
      const T = start + t.t * 1000;
      const ev = { kind: t.move, ...(t.limb ? { limb: t.limb } : {}), t: T } as DrillBodyEvent;
      switch (t.move) {
        case 'hold': events.push({ ev: { ...ev, t: T - 400 }, arrive: T + 400 }); break;
        case 'squat': events.push({ ev, arrive: T + 400 }); break;
        case 'touch': {
          const limb: Limb = t.limb === 'hands' ? 'handL' : t.limb!;
          for (let f = T - 150; f <= T + 100; f += FRAME_MS) frames.push({ t: f, pos: { [limb]: { ...t.zone! } } });
          break;
        }
        default: events.push({ ev, arrive: T + 150 });
      }
    }
    start += p.durationSec * 1000;
  }
  return { events, frames };
}

function run(d: Drill): { last: DrillState; hits: number; targets: number } {
  const runner = new DrillRunner(d, { latencyMs: 0 });
  const { events, frames } = perfectPlayer(d);
  events.sort((a, b) => a.arrive - b.arrive);
  frames.sort((a, b) => a.t - b.t);
  const end = 1000 * (d.phases.reduce((s, p) => s + p.durationSec, 0) + 5);
  let ei = 0, fi = 0, hits = 0;
  let last!: DrillState;
  for (let now = 0; now <= end; now += TICK_MS) {
    while (ei < events.length && events[ei].arrive <= now) runner.body(events[ei++].ev);
    while (fi < frames.length && frames[fi].t + CAMERA_MS <= now) { runner.limbs(frames[fi].t, frames[fi].pos); fi++; }
    last = runner.tick(now, true);
    hits += last.judged.filter((j) => j.label !== 'MISS').length;
    if (last.status === 'complete' || last.status === 'abandoned') break;
  }
  return { last, hits, targets: d.phases.reduce((s, p) => s + p.targets.length, 0) };
}

describe('every ball-skill drill runs end to end', () => {
  for (const d of HOOPS_DRILLS) {
    it(`${d.id}: completes, every target hit`, () => {
      const r = run(d);
      expect(r.last.status).toBe('complete');
      expect(r.hits).toBe(r.targets);
    });
  }
  it('control: a player who does nothing hits nothing', () => {
    const runner = new DrillRunner(HOOPS_DRILLS[0], { latencyMs: 0 });
    let hits = 0;
    for (let now = 0; now <= 30_000; now += TICK_MS) hits += runner.tick(now, true).judged.filter((j) => j.label !== 'MISS').length;
    expect(hits).toBe(0);
  });
});

describe('the same safety rules as the Playbook\'s jumps', () => {
  const jumps = HOOPS_DRILLS.filter((d) => d.phases.some((p) => p.targets.some((t) => t.move === 'jump' || t.move === 'land')));
  it('a teen: the drills with a jump wait, the rest are open', () => {
    const a = drillsAccess({ isYouth: true, painDecision: null, hardStopped: false, jumpGate: { closed: false, why: '', href: null } });
    expect(jumps.length).toBeGreaterThan(0);
    for (const d of HOOPS_DRILLS) {
      const g = a.drills.find((x) => x.id === d.id)!.gate;
      expect(g, d.id).toBe(jumps.includes(d) ? 'held' : 'open');
    }
  });
  it('an adult with the jump gate open: all open', () => {
    const a = drillsAccess({ isYouth: false, painDecision: null, hardStopped: false, jumpGate: { closed: false, why: '', href: null } });
    for (const d of HOOPS_DRILLS) expect(a.drills.find((x) => x.id === d.id)!.gate).toBe('open');
  });
});
