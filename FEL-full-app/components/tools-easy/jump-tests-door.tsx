'use client';

// JumpTestsDoor — the jump tests on their own page (TOOLS-EASY, 2026-10-28). They lived only under an adult's "Measure my
// vertical" result, behind "More detail" and "More jump tests": eight taps and a whole vertical run before the first
// test. Here they open on the list: pick a test, film it. The same components, the same readers, the same rules —
// adults only (the page checks), read on this phone, kept only when the athlete taps Keep, nothing sent.
//   JumpTests        squat jump, arm swing, hands on hips, single leg L/R, the 10-5 bounce, the strength and speed profile
//   SideJumpUpload   the drop jump (bounce score)
//   JumpHistory      what this phone kept, with its CSV
import { JumpTests } from '@/components/jump/jump-tests';
import { SideJumpUpload } from '@/components/jump/side-jump-upload';
import { JumpHistory } from '@/components/jump/jump-history';
import { reachStorage } from '@/lib/jump/reachStore';

export function JumpTestsDoor() {
  const store = reachStorage();
  return (
    <div className="space-y-3" data-jump-tests-door>
      <JumpTests adult startOpen storage={store} />
      <SideJumpUpload kind="drop" />
      <JumpHistory adult storage={store} />
    </div>
  );
}
