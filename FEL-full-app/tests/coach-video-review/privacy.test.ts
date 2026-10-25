// COACH-VIDEO-REVIEW (2026-10-24): no video bytes leave the phone by default, and a minor never sends video — held
// statically over every file of the feature, so a later change that adds a recorder or an upload fails here first.
//
// The runtime half is lib/coach/formReview/payload.test.ts (the body is pose data only; the server refuses any other
// field) and gate.test.ts (clipDecision: minors never; adults not while CLIP_UPLOADS_LIVE is false).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIP_UPLOADS_LIVE } from '@/lib/coach/formReview/clipPolicy';

const ROOT = join(__dirname, '../..');
const DIRS = ['lib/coach/formReview', 'components/coach/form-review', 'app/api/coach/form-reviews', 'app/coach/form-review'];

function files(dir: string): string[] {
  const out: string[] = [];
  for (const n of readdirSync(join(ROOT, dir))) {
    const p = join(ROOT, dir, n);
    if (statSync(p).isDirectory()) out.push(...files(relative(ROOT, p)));
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
const SRC = DIRS.flatMap(files).map((p) => ({ file: relative(ROOT, p), src: readFileSync(p, 'utf8') }));
const code = (s: string) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const RECORD = /\bMediaRecorder\b|captureStream\s*\(|toDataURL\s*\(|toBlob\s*\(|ImageCapture\b|getImageData\s*\(|new\s+VideoEncoder\b/;
const UPLOAD = /\bFormData\b|new\s+(Blob|File)\s*\(|signPutUrl|signGetUrl|coach-store\/storage|soundtrack\/storage|COACH_REVIEWS_BUCKET/;
const CAMERA = /getUserMedia|mediaDevices/;

describe('no media path exists in the form review', () => {
  it('found the feature\'s files, and the scans see a recorder, an upload and a direct camera when one is there (control)', () => {
    expect(SRC.length).toBeGreaterThanOrEqual(15);
    expect(RECORD.test(code('const r = new MediaRecorder(stream);'))).toBe(true);
    expect(RECORD.test(code('canvas.toBlob((b) => send(b));'))).toBe(true);
    expect(UPLOAD.test(code('const fd = new FormData(); fd.append("clip", blob);'))).toBe(true);
    expect(UPLOAD.test(code("import { signPutUrl } from '@/lib/coach-store/storage';"))).toBe(true);
    expect(CAMERA.test(code('navigator.mediaDevices.getUserMedia({ video: true })'))).toBe(true);
    expect(RECORD.test(code('// a comment about MediaRecorder is not a recorder'))).toBe(false);
  });

  it('nothing records, captures or encodes the picture: no MediaRecorder, no canvas capture, no frame grabs', () => {
    const hits = SRC.filter(({ src }) => RECORD.test(code(src))).map((x) => x.file);
    expect(hits).toEqual([]);
  });

  it('nothing uploads a file: no FormData, no Blob or File bodies, no signed upload, no clip storage', () => {
    const hits = SRC.filter(({ src }) => UPLOAD.test(code(src))).map((x) => x.file);
    expect(hits).toEqual([]);
  });

  it('the camera is opened only through the shared pose service (the Mirror\'s pipeline), never directly', () => {
    const hits = SRC.filter(({ src }) => CAMERA.test(code(src))).map((x) => x.file);
    expect(hits).toEqual([]);
  });

  it('the clip is off, and the switch is the only way on (an owner call)', () => {
    expect(CLIP_UPLOADS_LIVE).toBe(false);
  });
});
