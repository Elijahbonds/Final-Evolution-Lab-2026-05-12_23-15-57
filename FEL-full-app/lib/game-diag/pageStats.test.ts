import { describe, expect, it } from 'vitest';
import { domFpsDetail, domTtfpDetail, pageOsClass, summarizeDomFrames, type DomDeviceClass } from './pageStats';

const PHONE: DomDeviceClass = { os: 'ios', dpr: 3, px: '390x844' };

describe('DOM page diagnostics', () => {
  it('summarizes browser frame intervals without sending raw device identifiers', () => {
    const s = summarizeDomFrames([16, 17, 20, 60]);
    expect(s.n).toBe(4);
    expect(s.fpsP50).toBeCloseTo(58.8, 1);
    expect(s.fpsP5).toBeCloseTo(16.7, 1);
    expect(s.longPerMin).toBeGreaterThan(500);
    expect(s.worstMs).toBe(60);

    const detail = domFpsDetail(1, s, PHONE);
    expect(detail).toContain('surface=dom');
    expect(detail).toContain('os=ios');
    expect(detail).toContain('px=390x844');
    expect(detail).not.toMatch(/Mozilla|AppleWebKit|renderer|GPU/i);
    expect(detail.length).toBeLessThan(180);
  });

  it('formats first-frame timing and classifies iPadOS without carrying the user agent', () => {
    expect(pageOsClass('Macintosh; Intel Mac OS X 10_15_7', 5)).toBe('ios');
    expect(pageOsClass('Mozilla/5.0 (Linux; Android 15)', 1)).toBe('android');
    expect(domTtfpDetail({ firstMs: 123.4, pageMs: 456.7 }, PHONE)).toBe('surface=dom first=123 page=457 os=ios dpr=3 px=390x844');
  });
});
