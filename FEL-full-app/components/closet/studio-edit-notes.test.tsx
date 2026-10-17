// studio-5 (docs/NEXUS-STUDIO.md §13.4): what the Body note, the Shape note and the walkthrough card SAY. Without `studioEdit` each
// renders exactly what it rendered before (the live /closet passes no such prop — closet-studio-edit.test.tsx); with it, the notes
// say where the look's numbers go instead of pointing at the look-numbers consent that Studio-edit mode hides, and the
// walkthrough's last step is the hand-back.
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BodyControls, STUDIO_EDIT_FRAME_NOTE } from './character-controls';
import { STUDIO_EDIT_SHAPE_NOTE, ShapeTab } from './shape-tab';
import { STUDIO_EDIT_SAVE_COPY, WalkthroughCard } from './studio/walkthrough-card';
import { WALK_COPY, WALK_START, walkReduce } from '@/lib/creator/look/studio/walkthrough';
import { emptyCreatorDoc } from '@/lib/creator/look/doc';

const noop = () => {};
const OLD_BODY = 'Height and build stay on this device unless you allow saving look numbers above.';
const OLD_SHAPE = 'Shape numbers stay on this device unless you allow saving look numbers.';
const body = (o: { numbersSaved: boolean; studioEdit?: boolean }) => renderToStaticMarkup(createElement(BodyControls, { body: 'female', frame: null, scanOwned: false, onBody: noop, onFrame: noop, ...o }));
const shape = (o: { numbersSaved: boolean; studioEdit?: boolean }) => renderToStaticMarkup(createElement(ShapeTab, {
  shape: emptyCreatorDoc().shape, presentation: null, onShape: noop, onPresentation: noop, locks: [], onLocks: noop, onRoll: noop,
  canUndo: false, canRedo: false, onUndo: noop, onRedo: noop, ...o,
}));
const card = (step: number, studioEdit?: boolean) => {
  let s = WALK_START;
  for (let i = 0; i < step; i++) s = walkReduce(s, 'next');
  return renderToStaticMarkup(createElement(WalkthroughCard, { state: s, onNext: noop, onSkip: noop, ...(studioEdit === undefined ? {} : { studioEdit }) }));
};

describe('the live Closet: unchanged', () => {
  it('the Body note points at the consent when numbers are not saved, and says nothing more when they are', () => {
    expect(body({ numbersSaved: false })).toContain(OLD_BODY);
    expect(body({ numbersSaved: true })).not.toContain('stay on this device');
    expect(body({ numbersSaved: false, studioEdit: false })).toBe(body({ numbersSaved: false }));
  });
  it('the Shape note likewise', () => {
    expect(shape({ numbersSaved: false })).toContain(OLD_SHAPE);
    expect(shape({ numbersSaved: true })).not.toContain(OLD_SHAPE);
    expect(shape({ numbersSaved: false, studioEdit: false })).toBe(shape({ numbersSaved: false }));
  });
  it('the walkthrough says Save it, and every step reads as it did', () => {
    expect(card(2)).toContain(WALK_COPY.save.title);
    expect(card(2)).not.toContain(STUDIO_EDIT_SAVE_COPY.title);
    for (const step of [0, 1, 2]) expect(card(step, false)).toBe(card(step));
  });
});

describe('Studio-edit mode: no word about the hidden consent', () => {
  it('the Body note says the height and build go back to the Studio, whatever the consent says', () => {
    for (const numbersSaved of [false, true]) {
      const h = body({ numbersSaved, studioEdit: true });
      expect(h).toContain(STUDIO_EDIT_FRAME_NOTE.trim());
      expect(h).not.toMatch(/allow saving|look numbers above/);
      expect(h).toContain('Looks only: ranked and fixed-frame modes play every body at 1.0.');   // the first sentence stays
    }
  });
  it('the Shape note likewise', () => {
    for (const numbersSaved of [false, true]) {
      const h = shape({ numbersSaved, studioEdit: true });
      expect(h).toContain(STUDIO_EDIT_SHAPE_NOTE);
      expect(h).not.toMatch(/allow saving/);
    }
  });
  it('the walkthrough\'s first two steps are the same; the last is the hand-back', () => {
    expect(card(0, true)).toBe(card(0));
    expect(card(1, true)).toBe(card(1));
    expect(card(2, true)).toContain(STUDIO_EDIT_SAVE_COPY.title);
    expect(card(2, true)).toContain('Back to Nexus Studio');
    expect(card(2, true)).not.toContain(WALK_COPY.save.body);
  });
});
