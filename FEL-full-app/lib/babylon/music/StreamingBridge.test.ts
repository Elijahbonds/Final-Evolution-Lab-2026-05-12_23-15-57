import { describe, expect, it, beforeEach, vi } from 'vitest';
import { PROVIDER_META, StreamingConnect, StreamingShelf, parseStreamingUrl } from './StreamingBridge';

/** A localStorage good enough to exercise the shelf, and one that refuses everything. */
function fakeStore() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    clear: () => map.clear(),
  } as unknown as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStore());
});

describe('parsing a pasted share link', () => {
  it('turns a Spotify track into its official embed', () => {
    const l = parseStreamingUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT');
    expect(l).toEqual({
      provider: 'spotify',
      url: 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT',
      kind: 'track',
      embedUrl: 'https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT',
    });
  });

  it('handles the localised path Spotify hands out in some countries', () => {
    expect(parseStreamingUrl('https://open.spotify.com/intl-de/album/1A2B3c')?.kind).toBe('album');
  });

  it('keeps the query off the embed, since a share link carries tracking on it', () => {
    const l = parseStreamingUrl('https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT?si=abc123');
    expect(l?.embedUrl).toBe('https://open.spotify.com/embed/track/4cOdK2wGLETKBW3PvgPWqT');
  });

  it('reads an Apple album, and an Apple track as the ?i= inside one', () => {
    expect(parseStreamingUrl('https://music.apple.com/us/album/some-record/12345')?.kind).toBe('album');
    expect(parseStreamingUrl('https://music.apple.com/us/album/some-record/12345?i=678')?.kind).toBe('track');
  });

  it('REFUSES A HOST THAT IS NOT THEIRS, however much it looks like it', () => {
    // The check must be the whole hostname. A suffix test would accept evil-open.spotify.com.evil.tld.
    for (const bad of [
      'https://open.spotify.com.evil.tld/track/abc',
      'https://evil.tld/open.spotify.com/track/abc',
      'https://notmusic.apple.com/us/album/x/1',
      'https://music.apple.com.evil.tld/us/album/x/1',
    ]) {
      expect(parseStreamingUrl(bad), bad).toBeNull();
    }
  });

  it('refuses a non-http scheme rather than building an embed out of it', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,<script>', 'file:///etc/passwd', '']) {
      expect(parseStreamingUrl(bad), bad).toBeNull();
    }
  });

  it('never returns an embed URL off the provider’s own origin', () => {
    // Everything the parser emits is loaded in an iframe, so the origin is the only thing standing between a
    // pasted link and somebody else's page rendering inside the app.
    for (const raw of [
      'https://open.spotify.com/track/abc',
      'https://music.apple.com//evil.com/album/x/1',
      'https://music.apple.com/us/album/x/1?i=2&redirect=https://evil.tld',
    ]) {
      const l = parseStreamingUrl(raw);
      if (!l) continue;
      const origin = new URL(l.embedUrl).origin;
      expect(['https://open.spotify.com', 'https://embed.music.apple.com'], raw).toContain(origin);
    }
  });

  it('refuses junk and rubbish paths', () => {
    expect(parseStreamingUrl('https://open.spotify.com/')).toBeNull();
    expect(parseStreamingUrl('https://open.spotify.com/podcast/abc')).toBeNull();
    expect(parseStreamingUrl('https://music.apple.com/us/nonsense/x')).toBeNull();
    expect(parseStreamingUrl('not a url at all')).toBeNull();
  });
});

describe('the connect seam', () => {
  it('never reports connected, and says exactly what is missing', () => {
    const r = StreamingConnect.requestConnect('spotify');
    expect(r.ok).toBe(false);
    expect(r.needs).toBe(PROVIDER_META.spotify.connectNeeds);
    expect(StreamingConnect.state().spotify).toBe('awaiting-credentials');
  });

  it('resets back to unconnected', () => {
    StreamingConnect.requestConnect('apple');
    StreamingConnect.reset('apple');
    expect(StreamingConnect.state().apple).toBe('unconnected');
  });
});

describe('the listening shelf', () => {
  const link = (id: string) => parseStreamingUrl(`https://open.spotify.com/track/${id}`)!;

  it('keeps what was added, newest first', () => {
    StreamingShelf.add(link('aaa'));
    StreamingShelf.add(link('bbb'));
    expect(StreamingShelf.list().map((l) => l.kind)).toHaveLength(2);
    expect(StreamingShelf.list()[0].url).toContain('bbb');
  });

  it('does not keep the same link twice', () => {
    StreamingShelf.add(link('aaa'));
    StreamingShelf.add(link('aaa'));
    expect(StreamingShelf.list()).toHaveLength(1);
  });

  it('removes one', () => {
    StreamingShelf.add(link('aaa'));
    StreamingShelf.remove(link('aaa').url);
    expect(StreamingShelf.list()).toEqual([]);
  });

  it('SURVIVES BEING PASSED AROUND AS A FUNCTION', () => {
    // `add` calls this.list(). Handed to a callback — onClick={StreamingShelf.add} is the obvious way to use
    // it — `this` is undefined and it throws.
    const { add, list } = StreamingShelf;
    expect(() => add(link('ccc'))).not.toThrow();
    expect(list()).toHaveLength(1);
  });

  it('SURVIVES A STORE THAT REFUSES TO WRITE', () => {
    // list() already guards this; add() and remove() did not, so reading was safe in private mode and writing
    // took the room down.
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => {},
    } as unknown as Storage);
    expect(() => StreamingShelf.add(link('ddd'))).not.toThrow();
    expect(() => StreamingShelf.remove('whatever')).not.toThrow();
  });
});
