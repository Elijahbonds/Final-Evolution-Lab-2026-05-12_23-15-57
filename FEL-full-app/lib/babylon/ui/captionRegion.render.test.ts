import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaptionRegion } from './CaptionRegion';

/**
 * The gap this closes was a MEASUREMENT, on the deployed build, across four modes:
 *
 *   aria-live regions   0
 *   role="status"       0
 *   .sr-only            0
 *
 * So the test is the same measurement, made on the markup React actually produces. `/play/*` is auth-gated —
 * curling the deployed page anonymously returns the login screen and proves nothing either way — so this renders
 * the component rather than asserting it "should" be there.
 *
 * No JSX: vitest collects `lib/**` as *.test.ts only, and a .tsx beside its component is never run at all.
 */
const html = (visible = false) => renderToStaticMarkup(createElement(CaptionRegion, { visible }));

describe('the caption surface', () => {
  it('renders both live regions, which is what used to be zero', () => {
    const m = html();
    expect(m).toContain('aria-live="polite"');
    expect(m).toContain('aria-live="assertive"');
    expect((m.match(/aria-live=/g) ?? []).length).toBe(2);
  });

  it('keeps them in the accessibility tree — sr-only, never hidden', () => {
    const m = html();
    expect(m).toContain('sr-only');
    // display:none and visibility:hidden both REMOVE an element from the tree, and a hidden live region
    // announces nothing at all. Getting this wrong looks identical to getting it right.
    expect(m).not.toContain('display:none');
    expect(m).not.toContain('hidden=""');
  });

  it('mounts the regions EMPTY rather than waiting for something to say', () => {
    // A live region created in the same tick its text appears is not announced by most screen readers, so the
    // regions must exist before any cue arrives.
    const m = html();
    expect(m).toContain('data-fel-captions="polite"');
    expect(m).toContain('data-fel-captions="assertive"');
  });

  it('draws nothing on screen when it is only there to announce', () => {
    // visible={false} is what /play uses: the modes already paint their own banners on the canvas.
    expect(html(false)).not.toContain('pointer-events-none');
  });

  it('only the urgent region is a role=alert', () => {
    expect((html().match(/role="alert"/g) ?? []).length).toBe(1);
  });
});
