// NEX-02 + NEX-04 in the editor: Publish runs the gate and, only when it passes, produces the file the repo takes — one that the
// load path reads back unchanged. The panel says what publishing does and lists every refusal.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PublishPanel, publishVenue } from './publish-panel';
import { readPublished } from '@/lib/nexus-studio/published';
import { worstPhone } from '@/lib/nexus-studio/publishGate';
import { everyKindProject, placed } from '@/tests/helpers/nexusStudio';

const PHONE = { drawCalls: 65, activeMeshes: 58, textureMb: 53, skinnedBodies: 4 };
const project = () => {
  const p = everyKindProject();
  const v = p.venues[0];
  v.objects = v.objects.filter((o) => o.type !== 'decal');
  v.objects.push(placed('decal:scuff', [-12, 0, 12]));
  return p;
};

describe('Publish', () => {
  it('refuses an unmeasured venue, and a venue with a mark on the court, listing why; produces no file', () => {
    const p = project();
    const r = publishVenue(p.venues[0], p, 'tiebreak', null);
    expect(r.ok).toBe(false);
    expect(r.text).toBeUndefined();
    expect(r.problems.map((x) => x.kind)).toEqual(['budgetMissing']);
    p.venues[0].objects.push(placed('decal:tyre', [0, 0, 0]));
    expect(publishVenue(p.venues[0], p, 'tiebreak', PHONE).problems.map((x) => x.kind)).toEqual(['keepOut']);
  });
  it('a passing venue becomes the file at its repo path, which the load path reads back as itself', () => {
    const p = project();
    const r = publishVenue(p.venues[0], p, 'tiebreak', PHONE, new Date('2026-10-25T12:00:00Z'));
    expect(r.ok).toBe(true);
    expect(r.path).toBe(`lib/nexus-studio/published/tiebreak/${p.venues[0].id}.venue.json`);
    const back = readPublished(JSON.parse(r.text!));
    expect(back.ok).toBe(true);
    if (back.ok) { expect(back.pub.venue).not.toHaveProperty('cast'); expect(back.pub.mode).toBe('tiebreak'); }
    // the same venue as Tennis's look
    expect(publishVenue(p.venues[0], p, 'tennis', PHONE).path).toBe(`lib/nexus-studio/published/tennis/${p.venues[0].id}.venue.json`);
  });
  it('the phone column is the worst phone-tier sample; desktop samples do not count', () => {
    let s = worstPhone(null, { tier: 'desktop', drawCalls: 900, activeMeshes: 1, textureMb: 1, skinnedBodies: 1 });
    expect(s).toBeNull();
    s = worstPhone(s, { tier: 'mobile', drawCalls: 60, activeMeshes: 50, textureMb: 40, skinnedBodies: 2 });
    s = worstPhone(s, { tier: 'mobile', drawCalls: 70, activeMeshes: 45, textureMb: 41, skinnedBodies: 1 });
    expect(s).toEqual({ drawCalls: 70, activeMeshes: 50, textureMb: 41, skinnedBodies: 2 });
  });
  it('the panel names the destinations, the phone state and what publishing means', () => {
    const p = project();
    const html = renderToStaticMarkup(createElement(PublishPanel, { venue: p.venues[0], project: p, phoneSample: null, onMeasurePhone: () => undefined, onClose: () => undefined }));
    expect(html).toContain('Tiebreak · the whole venue');
    expect(html).toContain('Tennis · its look');
    expect(html).toContain('not measured on Phone');
    expect(html).toContain('Measure on Phone');
    expect(html).toContain('default place for every player');
    expect(html).toContain('Characters are never published');
  });
});
