// FDB-2 (PM, 2026-10-17): the dock reads where the first tap is going, so a tap into /try holds the soundtrack before the page lands.
import { describe, expect, it } from 'vitest';
import { tappedLinkPath } from './soundtrack-dock';

const AT = 'https://final-evolution-lab.web.app/links';
/** A tap target inside an <a>: what Element.closest('a[href]') hands back, with the attributes the dock reads. */
const tapOn = (attrs: Record<string, string> | null) => ({
  closest: (sel: string) => (sel === 'a[href]' && attrs ? {
    target: attrs.target ?? '',
    hasAttribute: (k: string) => k in attrs,
    getAttribute: (k: string) => attrs[k] ?? null,
  } : null),
}) as unknown as EventTarget;

describe('tappedLinkPath', () => {
  it('the same-site path of the tapped link — /links\' "Play FEL" is /try', () => {
    expect(tappedLinkPath(tapOn({ href: '/try' }), AT)).toBe('/try');
    expect(tappedLinkPath(tapOn({ href: '/try?c=AB12' }), AT)).toBe('/try');
    expect(tappedLinkPath(tapOn({ href: '/screen', target: '_self' }), AT)).toBe('/screen');
  });
  it('null when the tap opens nothing here: no link, another site, a new tab, a download, or a target with no closest()', () => {
    expect(tappedLinkPath(tapOn(null), AT)).toBeNull();
    expect(tappedLinkPath(tapOn({ href: 'https://www.amazon.com/dp/B0H5J1M18H' }), AT)).toBeNull();
    expect(tappedLinkPath(tapOn({ href: '/try', target: '_blank' }), AT)).toBeNull();
    expect(tappedLinkPath(tapOn({ href: '/try', download: '' }), AT)).toBeNull();
    expect(tappedLinkPath({} as EventTarget, AT)).toBeNull();
    expect(tappedLinkPath(null, AT)).toBeNull();
  });
});
