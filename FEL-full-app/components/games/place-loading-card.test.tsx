// look-screens phase A3 (docs/LOOK-PASS-AUDIT.md; lib/ui/placeLoading.ts, lib/ui/firstRun.ts): loading and first-run screens in one
// finish. vitest runs in node (no layout engine), so this pins what decides it: the four knobs' two ends, the words (not one is new:
// each card line is the place's own), where the veil draws (and where it never does), and the wiring in the files that draw it.
// The pictures and the layout shift are measured in a browser: scripts/probes/look-audit/look-walk.mts and scripts/probes/look-screens.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { resetFeelForTests } from '@/lib/feel-panel/feel';
import { FEEL_KNOB_BY_ID } from '@/lib/feel-panel/knobs';
import { PLACE_CARDS, PLACE_LOADING_CARD, placeLoadingCard, veiledPlace } from '@/lib/ui/placeLoading';
import { CARD_OVERLAP_FIXES, COMPACT_APP_HEADER, FIRST_RUN_CARD, RAIL_GLOW_CLASS } from '@/lib/ui/firstRun';
import { PlaceLoadingCard, STAGE_ALERT } from './place-loading-card';
import { AgeCard } from '@/components/age-step';
import { CompactDoors } from '@/components/shell/compact-doors';

beforeEach(() => { resetFeelForTests(); });
afterEach(() => { resetFeelForTests(); });
const read = (f: string) => readFileSync(f, 'utf8');

describe('the knobs: each ships at 1, its catalogue row says so, 0 is the screen as before', () => {
  for (const [id, def] of [['ui.placeLoadingCard', PLACE_LOADING_CARD], ['ui.firstRunCard', FIRST_RUN_CARD], ['ui.compactAppHeader', COMPACT_APP_HEADER], ['ui.cardOverlapFixes', CARD_OVERLAP_FIXES]] as const) {
    it(id, () => {
      expect(def).toBe(1);
      const k = FEEL_KNOB_BY_ID.get(id)!;
      expect(k.def).toBe(def);
      expect([k.min, k.max, k.step]).toEqual([0, 1, 1]);
    });
  }
  it('placeLoadingCard reads its knob', () => { expect(placeLoadingCard()).toBe(true); });
});

describe('the place card: no new words', () => {
  it('each line is the stage\'s own loading line, word for word, and each title the page\'s own title', () => {
    for (const p of ['venice', 'coast', 'arena'] as const) {
      expect(read(`app/play/${p}/stage.tsx`)).toContain(`>${PLACE_CARDS[p].line}</p>`);
      expect(read(`app/play/${p}/page.tsx`)).toContain(`title: '${PLACE_CARDS[p].title}'`);
    }
    expect(read('app/play/adventure/page.tsx')).toContain(`title: '${PLACE_CARDS.story.title}'`);
    expect(read('app/play/adventure/stage.tsx')).toContain(`'${PLACE_CARDS.story.line}'`);
  });
  it('the brand line is BootSplash\'s own for a place with no venue; the art is a procedural thumb that ships', () => {
    const splash = read('components/games/boot-splash.tsx');
    const thumbs = read('lib/babylon/ui/venueThumbs.ts');
    for (const c of Object.values(PLACE_CARDS)) {
      expect(splash).toContain(`sub: '${c.sub}'`);
      expect(c.venue === 'default' || thumbs.includes(`'${c.venue}':`)).toBe(true);
    }
  });
  it('renders the title, the brand line, the line and a bar, as a status', () => {
    const html = renderToStaticMarkup(<PlaceLoadingCard place="venice" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('Venice Beach');
    expect(html).toContain('FINAL EVOLUTION');
    expect(html).toContain('Heading to the courts…');
    expect(html).toContain('fel-place-bar');
  });
});

describe('the veil', () => {
  it('draws only on the three places that load on black — never the story (its READY card), a game or a page', () => {
    expect(veiledPlace('/play/venice')).toBe('venice');
    expect(veiledPlace('/play/coast/')).toBe('coast');
    expect(veiledPlace('/play/arena')).toBe('arena');
    for (const p of ['/play/adventure', '/play/onevone', '/play', '/', null]) expect(veiledPlace(p)).toBeNull();
  });
  it('steps aside for a stage\'s error line, not for the layout\'s always-there caption region', () => {
    expect(STAGE_ALERT).toBe('[role="alert"]:not([data-fel-captions])');
    expect(read('lib/babylon/ui/CaptionRegion.tsx')).toMatch(/role="alert"\s+className="sr-only"\s+data-fel-captions="assertive"/);
  });
  it('is mounted by the shared /play layout (no place\'s own file changes)', () => {
    expect(read('app/play/layout.tsx')).toContain('<PlaceLoadingVeil />');
    for (const p of ['venice', 'coast', 'arena', 'adventure']) expect(read(`app/play/${p}/stage.tsx`)).not.toContain('place-loading-card');
  });
});

describe('first run', () => {
  it('AgeCard off: the children exactly, nothing added; on: the sign-up card\'s glow, panel and crest', () => {
    expect(renderToStaticMarkup(<AgeCard on={false}><b>q</b></AgeCard>)).toBe('<b>q</b>');
    const on = renderToStaticMarkup(<AgeCard on><b>q</b></AgeCard>);
    expect(on).toContain('fel-panel');
    expect(on).toContain('crest-light.png');
    expect(on).toContain('<b>q</b>');
    // the same glow and panel the sign-up card draws
    const auth = read('components/auth-form.tsx');
    for (const c of ['bg-[#00E5FF]/10 blur-[120px]', 'bg-[#A855F7]/10 blur-[120px]', '/brand/crest-light.png']) { expect(auth).toContain(c); expect(read('components/age-step.tsx')).toContain(c); }
  });
  it('/try wraps its age step, and the step and its words are untouched', () => {
    const g = read('components/games/guest-dunk-shell.tsx');
    expect(g).toMatch(/<AgeCard on=\{firstRunCard\(\)\}>\s*<AgeStep mode="signup" onLocked=\{onAgeLocked\} onBlocked=\{onAgeBlocked\} ready=\{hydrated\} \/>/);
    expect(g).toContain('Play without saving');
  });
  it('the home hero fits a sideways phone only through its new prop (false: the hero as before)', () => {
    expect(read('components/guest-landing-hero.tsx')).toContain('fitShortLandscape={firstRunCard()}');
    expect(read('components/ui/fel/hero-header.tsx')).toContain("${fitShortLandscape ? ` ${HERO_SHORT_LANDSCAPE_CLASS.title}` : ''}");
  });
  it('the sign-in rail gives the glow room and takes it back (pb-2 before)', () => {
    expect(RAIL_GLOW_CLASS).toBe('pb-10 -mb-8');
    expect(read('components/onboarding/mode-carousel.tsx')).toContain("${firstRunCard() ? RAIL_GLOW_CLASS : 'pb-2'}");
  });
});

describe('the app header and /play', () => {
  it('CompactDoors off: the doors exactly; on: a two-column grid on a phone that steps aside wider', () => {
    expect(renderToStaticMarkup(<CompactDoors on={false}><a>x</a></CompactDoors>)).toBe('<a>x</a>');
    const on = renderToStaticMarkup(<CompactDoors on><a>x</a></CompactDoors>);
    expect(on).toContain('grid w-full grid-cols-2');
    expect(on).toContain('sm:contents');
  });
  it('the rail: the cluster joins the wordmark\'s row and the ring shows only with a number while on', () => {
    const r = read('components/shell/status-rail.tsx');
    expect(r).toContain("${compact ? '' : 'basis-full '}flex-wrap");
    expect(r).toContain('{(!compact || (data && data.prq.score !== null)) && <Link');
  });
});

describe('the overlap fixes', () => {
  it('the USB line goes to the menu only before play; the end card title wraps balanced', () => {
    expect(read('components/controller-link/host-lobby.tsx')).toContain('cardOverlapFixes() && !collapsed');
    expect(read('components/games/end-screen/end-screen.tsx')).toContain("...(cardOverlapFixes() ? { textWrap: 'balance' } : {}),");
  });
});
