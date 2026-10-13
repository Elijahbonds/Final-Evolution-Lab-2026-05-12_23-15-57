// The audiobook player is STREAM ONLY (owner 2026-10-13, store-terms-2026-10-12): no download control, no URL in the
// page before Play. renderToStaticMarkup (no jsdom), the pattern of buy-button.test.tsx.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AudioPlayer } from './audio-player';

const SRC = readFileSync(join(process.cwd(), 'components/press/audio-player.tsx'), 'utf8');
const html = renderToStaticMarkup(
  createElement(AudioPlayer, {
    bookSlug: 'blueprint',
    bookTitle: 'Blueprint',
    chapters: [
      { id: 'audio-00', label: 'Opening', canPlay: true },
      { id: 'audio-01', label: 'Chapter 1', canPlay: true },
      { id: 'audio-02', label: 'Chapter 2', canPlay: false },
    ],
  }),
);

describe('AudioPlayer: no download control', () => {
  it('the audio element forbids download and has no source before Play', () => {
    const audio = html.match(/<audio[^>]*>/)![0];
    expect(audio).toContain('controlsList="nodownload');
    expect(audio).not.toMatch(/\ssrc=/);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toContain('storage.googleapis.com');
  });

  it('there is no download link, button or attribute anywhere in the markup', () => {
    expect(html).not.toMatch(/\sdownload(=|\s|>)/);
    expect(html).not.toMatch(/<a\s/);
    expect(html.toLowerCase()).not.toMatch(/>\s*download|download\s*</);
    expect(html).not.toContain('attachment');
  });

  it('shows the chapter list, +/-15 s, speed, and says stream only', () => {
    expect(html).toContain('Opening');
    expect(html).toContain('Chapter 1');
    expect(html).toContain('Locked');
    expect(html).toContain('Back 15 seconds');
    expect(html).toContain('Forward 15 seconds');
    expect(html).toContain('Playback speed');
    expect(html).toContain('stream only');
  });

  it('the source gets URLs only from the stream endpoint helper and never from the download route', () => {
    expect(SRC).toContain('requestStreamUrl(');
    expect(SRC).not.toContain('/api/books/download');
    expect(SRC).not.toMatch(/\.download\s*=|createElement\('a'\)|window\.location\.href\s*=|attachment/);
    expect(SRC).toContain('onContextMenu');
    expect(SRC).toContain('nodownload');
    expect(SRC).toContain('writeResume(');
  });
});
