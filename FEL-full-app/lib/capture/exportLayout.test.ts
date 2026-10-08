import { describe, expect, it } from 'vitest';
import { EXPORT_SIZE, FEL_MARK, felAppLink, fitRect, watermarkAt } from './exportLayout';
import { LIVE_RELAY_BUILT, RTMP_NOTE, streamSafeBox, streamStageBox } from './streamLayout';

describe('export frames', () => {
  it('9:16 and 16:9 are those shapes', () => {
    expect(EXPORT_SIZE['9:16'].w / EXPORT_SIZE['9:16'].h).toBeCloseTo(9 / 16, 5);
    expect(EXPORT_SIZE['16:9'].w / EXPORT_SIZE['16:9'].h).toBeCloseTo(16 / 9, 5);
  });

  it('fits a widescreen game into a vertical frame with bars, not a crop', () => {
    const box = fitRect(1920, 1080, EXPORT_SIZE['9:16'].w, EXPORT_SIZE['9:16'].h);
    expect(box.w).toBeLessThanOrEqual(EXPORT_SIZE['9:16'].w);
    expect(box.h).toBeLessThan(EXPORT_SIZE['9:16'].h);
    expect(box.y).toBeGreaterThan(0);
    expect(box.w / box.h).toBeCloseTo(16 / 9, 1);
  });

  it('the mark is small, named FEL, and carries the app link', () => {
    const mark = watermarkAt(720, 1280, 'https://final-evolution-lab.web.app/play/dunk');
    expect(mark.mark).toBe(FEL_MARK);
    expect(mark.link).toBe('final-evolution-lab.web.app');
    expect(mark.markPx).toBeLessThan(40);
    expect(mark.x).toBeGreaterThan(8);
    expect(mark.y).toBeGreaterThan(1000);
    expect(felAppLink(null)).toBe('https://final-evolution-lab.web.app');
  });
});

describe('stream mode layout', () => {
  it('the stage is 16:9 and the safe area sits inside it', () => {
    const stage = streamStageBox(390, 844);
    expect(stage.w / stage.h).toBeCloseTo(16 / 9, 2);
    expect(stage.w).toBeLessThanOrEqual(390);
    const safe = streamSafeBox(stage);
    expect(safe.x).toBeGreaterThan(stage.x);
    expect(safe.y).toBeGreaterThan(stage.y);
    expect(safe.w).toBeLessThan(stage.w);
    expect(safe.h).toBeLessThan(stage.h);
  });

  it('there is no live relay, and the note says what one would take', () => {
    expect(LIVE_RELAY_BUILT).toBe(false);
    expect(RTMP_NOTE).toMatch(/not built/i);
    expect(RTMP_NOTE).toMatch(/RTMP/);
    expect(RTMP_NOTE).toMatch(/stream key/i);
    expect(RTMP_NOTE).toMatch(/OBS/);
  });
});
