// The first-court guide's pure half (STUDIO-EASY): when it is offered, which step it is on, and that every step is an ordinary
// Studio command on the one undo stack — undo takes it back exactly — with nothing new in the project format.
import { describe, expect, it } from 'vitest';
import { createStack, execute, undo } from './commands';
import { STUDIO_DOC_VERSION, activeVenue, parseProject } from './doc';
import {
  GUIDE_ADDS, GUIDE_DONE, GUIDE_KEY, GUIDE_LIGHTS, GUIDE_STEPS, addCommand, guideStep, hasLightsOrFans, introCommand, lightCommand,
  offerGuide, quickCourtCommand, readGuideMark, writeGuideMark,
} from './firstCourt';
import { starterProject } from '@/components/nexus-studio/use-studio';
import { memoryKV } from '@/tests/helpers/nexusStudio';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe('when the guide is offered', () => {
  it('an untouched first project, until the guide is finished or skipped', () => {
    const p = starterProject();
    expect(offerGuide(p, null)).toBe(true);
    expect(offerGuide(p, 'done')).toBe(false);
    expect(offerGuide(p, 'skipped')).toBe(false);
  });
  it('never over work: a placed object, a second venue, a character or a script', () => {
    const p = starterProject();
    const v = activeVenue(p)!;
    const withLight = execute(createStack(p), addCommand(v, 'floods')!.cmd).doc;
    expect(offerGuide(withLight, null)).toBe(false);
    expect(offerGuide({ ...p, venues: [...p.venues, { ...v, id: 'v2' }] }, null)).toBe(false);
    expect(offerGuide({ ...p, characters: [{ id: 'c', name: 'Nova', lookCode: 'x' }] }, null)).toBe(false);
    expect(offerGuide({ ...p, scripts: [{ id: 's', name: 's', enabled: true, nodes: [], edges: [] }] }, null)).toBe(false);
  });
  it('keeps its mark under its own device key, and a failing store only means it shows again', () => {
    const kv = memoryKV();
    expect(readGuideMark(kv)).toBeNull();
    writeGuideMark(kv, 'done');
    expect(kv.data.get(GUIDE_KEY)).toBe('done');
    expect(readGuideMark(kv)).toBe('done');
    writeGuideMark(kv, null);
    expect(readGuideMark(kv)).toBeNull();
    kv.failWrites = 'quota';
    expect(() => writeGuideMark(kv, 'skipped')).not.toThrow();
    kv.failReads = true;
    expect(readGuideMark(kv)).toBeNull();
    expect(readGuideMark(null)).toBeNull();
  });
});

describe('the three steps', () => {
  it('step 1 → 2 → 3 → done follows the taps and the venue (a light placed by hand completes step 2)', () => {
    const v = activeVenue(starterProject())!;
    expect(guideStep(v, { picked: false, watched: false })).toBe(0);
    expect(guideStep(v, { picked: true, watched: false })).toBe(1);
    const lit = { objects: [{ type: 'fixture' }] } as unknown as typeof v;
    expect(hasLightsOrFans(lit)).toBe(true);
    expect(guideStep(lit, { picked: true, watched: false })).toBe(2);
    expect(guideStep(lit, { picked: true, watched: true })).toBe(3);
  });

  it('each step is one undo step, and undo takes it back exactly', () => {
    const p = starterProject();
    let st = createStack(p);
    const v0 = activeVenue(st.doc)!;
    st = execute(st, lightCommand(v0, 'nightGame'));
    expect(activeVenue(st.doc)!.mood).toBe('nightGame');
    const floods = addCommand(activeVenue(st.doc)!, 'floods')!;
    st = execute(st, floods.cmd);
    const fans = addCommand(activeVenue(st.doc)!, 'fans')!;
    st = execute(st, fans.cmd);
    st = execute(st, introCommand(activeVenue(st.doc)!)!);
    const v = activeVenue(st.doc)!;
    expect(v.objects.filter((o) => o.type === 'fixture')).toHaveLength(4);
    expect(v.objects.filter((o) => o.type === 'crowdStand')).toHaveLength(2);
    expect(v.intro).toBe('walkIn');
    expect(introCommand(v)).toBeNull();
    for (let i = 0; i < 4; i++) st = undo(st);
    expect(st.doc.venues).toEqual(p.venues);
  });

  it('"Make it for me": the whole court in ONE undo step, and the guide is then on its last step', () => {
    const p = starterProject();
    let st = createStack(p);
    const q = quickCourtCommand(activeVenue(st.doc)!)!;
    st = execute(st, q.cmd);
    const v = activeVenue(st.doc)!;
    expect(v.mood).toBe('nightGame');
    expect(v.intro).toBe('walkIn');
    expect(v.objects.filter((o) => o.type === 'fixture')).toHaveLength(4);
    expect(v.objects.filter((o) => o.type === 'crowdStand')).toHaveLength(2);
    expect(new Set(v.objects.map((o) => o.id)).size).toBe(v.objects.length);
    expect(q.ids).toHaveLength(6);
    expect(guideStep(v, { picked: true, watched: true })).toBe(3);
    st = undo(st);
    expect(st.doc.venues).toEqual(p.venues);
  });

  it('the fans sit on the sidelines, facing the court, clear of the play camera behind the near baseline', () => {
    const p = starterProject();
    const stands = addCommand(activeVenue(p)!, 'fans')!;
    const st = execute(createStack(p), stands.cmd);
    const placed = activeVenue(st.doc)!.objects;
    for (const o of placed) {
      expect(Math.abs(Math.abs(o.t.p[0]) - 12)).toBeLessThan(1e-9);
      expect(Math.abs(o.t.p[2])).toBeLessThan(1e-9);
    }
    // each stand's front (local +z) points at the court's middle
    for (const o of placed) {
      const front = [Math.sin(o.t.ry), Math.cos(o.t.ry)];
      expect(front[0] * -o.t.p[0]).toBeGreaterThan(0);
    }
  });

  it('a full venue gets no stamp (null), never a half one', () => {
    const v = activeVenue(starterProject())!;
    const full = { ...v, objects: Array.from({ length: 599 }, (_, i) => ({ id: `o${i}` })) as unknown as typeof v.objects };
    expect(addCommand(full, 'floods')).toBeNull();
  });

  it('the project format is unchanged: a guided project exports and parses as a v1 project with no guide field', () => {
    let st = createStack(starterProject());
    st = execute(st, lightCommand(activeVenue(st.doc)!, 'daylight'));
    st = execute(st, addCommand(activeVenue(st.doc)!, 'floods')!.cmd);
    const text = JSON.stringify(st.doc);
    expect(text).not.toMatch(/guide/i);
    const r = parseProject(text);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.project.version).toBe(STUDIO_DOC_VERSION); expect(r.dropped).toBe(0); }
  });
});

describe('the words (docs/CUE-STYLE.md §1: a title is a label, a hint is a prompt)', () => {
  it('titles ≤ 5 words, hints ≤ 12, choices ≤ 4', () => {
    for (const s of [...GUIDE_STEPS, GUIDE_DONE]) { expect(words(s.title)).toBeLessThanOrEqual(5); expect(words(s.hint)).toBeLessThanOrEqual(12); }
    for (const c of [...GUIDE_LIGHTS, ...GUIDE_ADDS]) expect(words(c.label)).toBeLessThanOrEqual(4);
  });
});
