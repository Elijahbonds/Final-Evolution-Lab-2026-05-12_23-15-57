// RUN-CAPTURE save loop (HOOPS-10 owner round 2: a headed run must land in a file, not the console). The
// transcript() packages the run; saveTranscript() downloads it. This pins the wiring on the QA handle and the
// filename shape — the DOM click is the one thing a node test cannot exercise, so the scan pins the calls and
// the artifact name, and the file content is already covered by QaTrace.transcript.test.ts.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '@/lib/testing/sourceScan';

const ROOT = path.resolve(__dirname, '../../..');
const harness = stripComments(fs.readFileSync(path.join(ROOT, 'lib/babylon/core/ModeHarness.ts'), 'utf8'));

describe('RUN-CAPTURE save loop (qa.saveTranscript)', () => {
  it('the QA handle exposes saveTranscript that downloads the transcript as JSON', () => {
    expect(harness).toContain('saveTranscript:');
    expect(harness).toContain('qa.transcript(def.modeId, qaResult)');
    expect(harness).toContain("new Blob([JSON.stringify(t, null, 2)]");
    expect(harness).toContain('a.download = name');
    expect(harness).toContain('a.click()');
    expect(harness).toContain('URL.revokeObjectURL');
  });

  it('the filename carries the mode and an optional label, filesystem-safe', () => {
    expect(harness).toContain('`${def.modeId}${label ? `-${label.replace(/[^\\w-]+/g, \'-\')}` : \'\'}-${stamp}.json`');
  });

  it('saveTranscript lives on the QA-only handle (never in a production run)', () => {
    // ECONOMY-CAPS replaced the ?agent=1 check with devOrAgentHooks(): off in production unless the
    // server marked this run. The old `agentEnabled() ? new QaTrace() : null` line is no longer in the file.
    expect(harness).toMatch(/devOrAgentHooks\(\) \? new QaTrace\(\) : null/);
  });
});
