import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CaptureHudView, StreamGuides } from './capture-hud-view';
import { DunkReelView } from './dunk-reel-view';
import { buildReel } from '@/lib/dunk-film/reel';
import type { JumpRead } from '@/lib/dunk-film/jumpDetect';

const noop = () => {};

const jump: JumpRead = {
  takeoffMs: 2000, landingMs: 2500, flightMs: 500,
  airTimeCm: 31, hipCm: 28, confidence: 'medium',
  steps: 2, approachMps: 1.2, approachImagePerSec: 0.4,
  takeoffAngleDeg: 70, kneeLoadDeg: 110, hipLoadDeg: 140, landing: 'steady',
};

describe('capture HUD and review reel render', () => {
  it('the HUD shows only the overflow button and the dots until it is opened', () => {
    const html = renderToStaticMarkup(
      <CaptureHudView
        phase="idle" aspect="16:9" streamOn={false} controlsHidden={false}
        note={null} codecNote={null} dunkFilm canShareTake={false} canShareReplay={false}
        busy={false}
        onRecord={noop} onReplay={noop} onAspect={noop} onShare={noop} onDiscard={noop}
        onStream={noop} onHide={noop} onShow={noop} onFilm={noop}
      />,
    );
    expect(html).toContain('data-testid="capture-overflow"');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Capture and stream menu"');
    // The gameplay screen stays clean: no controls, no menu, until the ⋯ is pressed.
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain('data-testid="capture-record"');
    expect(html).not.toContain('data-testid="rec-live"');
  });

  it('the open menu lists every control as a labelled menuitem', () => {
    const html = renderToStaticMarkup(
      <CaptureHudView
        phase="idle" aspect="16:9" streamOn={false} controlsHidden={false}
        note={null} codecNote={null} dunkFilm canShareTake={false} canShareReplay={false}
        onRecord={noop} onReplay={noop} onAspect={noop} onShare={noop}
        onStream={noop} onHide={noop} onShow={noop} onFilm={noop}
        defaultMenuOpen
      />,
    );
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('role="menu"');
    expect(html).toContain('aria-label="Capture and stream controls"');
    expect(html).toContain('data-testid="capture-record"');
    expect(html).toContain('Record');
    expect(html).toContain('Last 30s');
    expect(html).toContain('Share');
    expect(html).toContain('Film dunk');
    expect((html.match(/role="menuitem"/g)?.length ?? 0) + (html.match(/role="menuitemcheckbox"/g)?.length ?? 0)).toBe(7);
    for (const label of [
      'Start recording', 'Keep the last 30 seconds', 'Portrait 9:16 export shape',
      'Landscape 16:9 export shape', 'Share the clip', 'Turn stream mode on', 'Film a dunk with the camera',
    ]) {
      expect(html).toContain(`aria-label="${label}"`);
    }
  });

  it('a red REC dot stays on the HUD while recording, even with the menu closed', () => {
    const html = renderToStaticMarkup(
      <CaptureHudView
        phase="recording" aspect="16:9" streamOn={false} controlsHidden={false}
        note={null} codecNote={null} dunkFilm={false} canShareTake={false} canShareReplay={false}
        onRecord={noop} onReplay={noop} onAspect={noop} onShare={noop}
        onStream={noop} onHide={noop} onShow={noop} onFilm={noop}
      />,
    );
    expect(html).toContain('data-testid="rec-live"');
    expect(html).toContain('REC');
    expect(html).toContain('aria-label="Recording"');
    expect(html).not.toContain('LIVE');
  });

  it('a red LIVE dot stays on the HUD while streaming — even when the controls are hidden for the broadcast', () => {
    const html = renderToStaticMarkup(
      <CaptureHudView
        phase="recording" aspect="16:9" streamOn controlsHidden
        note={null} codecNote={null} dunkFilm={false} canShareTake={false} canShareReplay={false}
        onRecord={noop} onReplay={noop} onAspect={noop} onShare={noop}
        onStream={noop} onHide={noop} onShow={noop} onFilm={noop}
      />,
    );
    expect(html).toContain('data-testid="rec-live"');
    expect(html).toContain('REC');
    expect(html).toContain('LIVE');
    expect(html).toContain('data-testid="capture-show"');
  });

  it('stream mode shows the safe area and says there is no RTMP relay', () => {
    const html = renderToStaticMarkup(
      <>
        <CaptureHudView
          phase="idle" aspect="16:9" streamOn controlsHidden={false}
          note={null} codecNote="iOS Safari cannot record video/webm;codecs=vp9,opus. This clip uses video/mp4 instead."
          dunkFilm={false} canShareTake={false} canShareReplay={false}
          busy={false}
          onRecord={noop} onReplay={noop} onAspect={noop} onShare={noop} onDiscard={noop}
          onStream={noop} onHide={noop} onShow={noop} onFilm={noop}
          defaultMenuOpen
        />
        <StreamGuides />
      </>,
    );
    expect(html).toContain('data-testid="capture-stream"');
    expect(html).toContain('Stream on');
    expect(html).toContain('role="menuitemcheckbox"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('data-testid="capture-hide"');
    expect(html).toContain('data-testid="rec-live"');
    expect(html).toContain('LIVE');
    expect(html).toContain('data-testid="stream-guides"');
    expect(html).toContain('16:9');
    expect(html).toContain('SAFE AREA');
    expect(html).toMatch(/RTMP/);
    expect(html).toMatch(/not built/i);
    expect(html).toContain('iOS Safari');
  });

  it('shows separate share buttons and discard when both clip types are saved', () => {
    const html = renderToStaticMarkup(
      <CaptureHudView
        phase="ready" aspect="9:16" streamOn={false} controlsHidden={false}
        note={null} codecNote={null} dunkFilm={false} canShareTake canShareReplay
        busy={false}
        onRecord={noop} onReplay={noop} onAspect={noop} onShare={noop} onDiscard={noop}
        onStream={noop} onHide={noop} onShow={noop} onFilm={noop}
        defaultMenuOpen
      />,
    );
    expect(html).toContain('data-testid="capture-share-take"');
    expect(html).toContain('data-testid="capture-share-replay"');
    expect(html).toContain('data-testid="capture-discard"');
  });

  it('surfaces recorder errors with a reset path', () => {
    const html = renderToStaticMarkup(
      <CaptureHudView
        phase="error" aspect="16:9" streamOn={false} controlsHidden={false}
        note="Recording is not available." codecNote={null} dunkFilm={false} canShareTake={false} canShareReplay={false}
        busy={false}
        onRecord={noop} onReplay={noop} onAspect={noop} onShare={noop} onDiscard={noop}
        onStream={noop} onHide={noop} onShow={noop} onFilm={noop}
      />,
    );
    expect(html).toContain('data-testid="capture-reset"');
    expect(html).toContain('Recording is not available.');
  });

  it('the review reel lists the jump and the session summary', () => {
    const reel = buildReel([jump], 8000);
    const html = renderToStaticMarkup(
      <DunkReelView reel={reel} canLeave note={null} onExport={noop} onShare={noop} onSaveNumbers={noop} />,
    );
    expect(html).toContain('data-testid="dunk-reel"');
    expect(html).toContain('Jump 1');
    expect(html).toContain('About 31 cm');
    expect(html).toContain('estimate');
    expect(html).toContain('Best: about 31 cm, estimate');
    expect(html).not.toMatch(/measured/i);
  });

  it('a minor without the grown-up step cannot use the export buttons', () => {
    const reel = buildReel([jump], 8000);
    const html = renderToStaticMarkup(
      <DunkReelView reel={reel} canLeave={false} note={null} onExport={noop} onShare={noop} onSaveNumbers={noop} />,
    );
    expect(html).toContain('data-testid="dunk-leave-blocked"');
    expect(html).toContain('disabled=""');
  });
});
