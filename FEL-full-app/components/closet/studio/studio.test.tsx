// The Studio's UI (CREATOR-PLAN phase 4d, 2026-10-06): the history strip, the walkthrough card and photo mode as a server
// render (no DOM in this runner), and how the Closet and its preview wire the Studio — read from source, like 4a/4b.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HistoryStrip } from './history-strip';
import { WalkthroughCard } from './walkthrough-card';
import { PhotoMode } from './photo-mode';
import { WALK_START, walkReduce } from '@/lib/creator/look/studio/walkthrough';

const noop = () => {};

describe('the history strip', () => {
  it('a chip per step, the present marked, redo steps after it; undo / redo off at the ends', () => {
    const html = renderToStaticMarkup(createElement(HistoryStrip, {
      entries: [{ offset: -2, label: 'Start', current: false }, { offset: -1, label: 'Added a horn', current: false }, { offset: 0, label: 'Skin colour', current: true }, { offset: 1, label: 'Paint: new stamp', current: false }],
      canUndo: true, canRedo: false, onUndo: noop, onRedo: noop, onJump: noop,
    }));
    for (const l of ['Start', 'Added a horn', 'Skin colour', 'Paint: new stamp']) expect(html).toContain(`>${l}</button>`);
    expect((html.match(/aria-current="step"/g) ?? []).length).toBe(1);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="Redo"/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="Undo"/);
    expect(html).toContain('1 step forward (redo)');
  });
});

describe('the walkthrough card', () => {
  it('shows the current step with Next and Skip, and nothing once over', () => {
    const html = renderToStaticMarkup(createElement(WalkthroughCard, { state: WALK_START, onNext: noop, onSkip: noop }));
    expect(html).toContain('Place a part');
    expect(html).toContain('1 / 3');
    expect(html).toContain('>Skip<');
    expect(renderToStaticMarkup(createElement(WalkthroughCard, { state: walkReduce(WALK_START, 'skip'), onNext: noop, onSkip: noop }))).toBe('');
  });
});

describe('photo mode', () => {
  const pm = (adult: boolean) => renderToStaticMarkup(createElement(PhotoMode, { label: 'HERO', accent: '#00E5FF', adult, makeCode: async () => 'FEL2.x', capture: async () => null, onClose: noop }));
  it('poses from the modes, backdrops, frames, and the shot button', () => {
    const html = pm(true);
    for (const l of ['Dunk hang', 'Fight stance', 'Board grab', 'Sprint start', 'Victory', 'Night game', 'Neon', 'Take the photo']) expect(html).toContain(l);
  });
  it('the sculpt numbers are an adult\'s choice only, off by default; a teen never sees the option', () => {
    expect(pm(true)).toContain('Print my face sculpt numbers');
    expect(pm(true)).not.toMatch(/type="checkbox" checked/);
    expect(pm(false)).not.toContain('sculpt numbers');
  });
});

describe('the wiring (source)', () => {
  const closet = readFileSync('components/closet-view.tsx', 'utf8');
  const preview = readFileSync('components/closet/avatar-preview.tsx', 'utf8');
  it('the Closet IS the Studio: one editor, the stage around the same preview, its tabs unchanged', () => {
    expect(closet).toContain('aria-label="Studio stage"');
    expect(closet).toMatch(/studio=\{\{ tab, focus, selectedPart, sticker,/);
    expect(closet).toContain('before={beforeLook}');
    expect(closet).toContain('<HistoryStrip entries={strip}');
    expect(closet).toMatch(/onJump=\{\(o\) => \{ setHist\(\(h\) => jumpHistory\(h, o\)\)/);
    expect(closet).toContain('selectedId={partSel}');
    expect(closet).toContain('selectedId={layerSel}');
    expect(closet).toContain('openPaste={openPaste}');
    for (const t of ['Face', 'Shape', 'Parts', 'Paint', 'Wearables', 'Card Skins']) expect(closet).toContain(`<Chip label="${t}"`);
    expect(existsNoSecondEditor()).toBe(true);
  });
  it('the tabs never hide the editor (4e polish, 2026-10-06): flush to the top, one sideways row on a phone, and what is scrolled into view lands below them', () => {
    const bar = closet.match(/<div className="(sticky [^"]*)">\s*<Chip label="Face"/);
    expect(bar, 'the sticky tab bar').toBeTruthy();
    const cls = bar![1].split(/\s+/);
    // flush: the editor's own padding (py-4) taken back, so no list row shows above the bar
    expect(closet).toMatch(/<aside aria-label="Editor" className="[^"]*\bpy-4\b/);
    expect(cls).toContain('-top-4');
    // a phone: one row that scrolls sideways (two rows of chips hid the Clothing list's rows at 390 × 844), opaque
    for (const c of ['max-md:flex-nowrap', 'max-md:overflow-x-auto', '[&>*]:shrink-0', 'bg-[#0a0a0f]']) expect(cls).toContain(c);
    expect(cls).not.toContain('flex-wrap');
    // a picked row or a focused field is scrolled to below the bar, not behind it
    expect(closet).toMatch(/<aside aria-label="Editor" className="[^"]*\bscroll-pt-16\b[^"]*\bmd:scroll-pt-28\b/);
  });
  it('every key goes through input.keyAction, never inside a text box', () => {
    expect(closet).toMatch(/const f = isFieldTarget\(e\.target as HTMLInputElement \| null\);\s*const a = keyAction\(e, f\.field, f\.text\);/);
  });
  it('a big change offers to keep a copy (5-slot cap in keepCopy); duplicate before, not a confirm in front', () => {
    expect(closet).toMatch(/if \(pushed && isBigChange\(prev\.present, hist\.present\)\) setOffer/);
    expect(closet).toMatch(/const r = keepCopy\(allSlots, offer\.before\);/);
  });
  it('photo mode: the shot stamps the scene\'s felPresentation context \'photo\', and the code is the slot\'s own', () => {
    expect(preview).toContain("stampPresentation(scene, photoing ? 'photo' : 'studio', p.presentation ?? null);");
    expect(preview).toMatch(/photoing = true;[\s\S]*applyRef\.current\?\.\(lastProps\);   \/\/ stamps the scene's felPresentation context 'photo'/);
    expect(preview).toMatch(/finally \{\s*photoing = false;\s*applyRef\.current\?\.\(lastProps\);   \/\/ back to 'studio'/);
    expect(closet).toContain('makeCode={(numbers) => encodeSlotCode(slot, { numbers })}');
  });
  it('the stage renders on demand and says its tier; the pad comes through the input layer, not the input bus', () => {
    expect(preview).toMatch(/if \(!stage\.gate\.due\(\)\) return;\s*scene\.render\(\);/);
    expect(preview).toContain('(scene.metadata ??= {}).felTier = tier;');
    expect(preview).toContain("await import('@/lib/input/profiles')");
    expect(preview).not.toMatch(/InputBus/);
    expect(preview).not.toMatch(/attachControl/);   // the Studio owns its gestures (tap vs spin vs drag)
  });
});

/** No second appearance editor: the Studio components never import a tab or the identity pipe themselves. */
function existsNoSecondEditor(): boolean {
  for (const f of ['history-strip.tsx', 'walkthrough-card.tsx', 'photo-mode.tsx']) {
    const src = readFileSync(`components/closet/studio/${f}`, 'utf8');
    if (/parts-tab|paint-tab|shape-tab|applyIdentity/.test(src)) return false;
  }
  return true;
}
