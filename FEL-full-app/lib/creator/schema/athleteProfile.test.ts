// A ROUND TRIP THROUGH AN OLDER CLIENT MUST NOT AMPUTATE YOUR BUILD (2026-09-14).
//
// The spec's §9 asks for four things that are all really one thing — do not lose the player's work:
// byte-identical export for an unmodified profile, unknown keys preserved rather than dropped, older
// versions migrated rather than rejected, and validation that reports instead of refusing. The sharpest
// test is the sync case: export from a NEWER client, import into this one, export again, and the newer
// client's fields have to still be there.

import { describe, it, expect } from 'vitest';
import {
  exportProfile, importProfile, emptyAthleteProfile, checksumOf, stableStringify, ATHLETE_PROFILE_VERSION,
} from './athleteProfile';

const withBuild = () => {
  const p = emptyAthleteProfile('abc-123');
  p.attributes = { speed: 80, threePoint: 72, ballHandle: 65 };
  p.traits = { breakdownArtist: 1 };
  p.prq = { speed: 62, strength: 55 };
  return p;
};

describe('AthleteProfile — determinism', () => {
  it('round-trips byte-identical for an unmodified profile', () => {
    const p = withBuild();
    const once = exportProfile(p);
    const twice = exportProfile(importProfile(once).profile);
    expect(twice).toBe(once);
  });

  it('is stable across key insertion order — two equal builds produce equal bytes', () => {
    const a = emptyAthleteProfile('x'); a.attributes = { speed: 70, agility: 60 };
    const b = emptyAthleteProfile('x'); b.attributes = { agility: 60, speed: 70 };
    expect(exportProfile(a)).toBe(exportProfile(b));
  });

  it('sorts nested keys too, not just the top level', () => {
    expect(stableStringify({ b: 1, a: { d: 1, c: 2 } })).toBe('{"a":{"c":2,"d":1},"b":1}');
  });

  it('changes the checksum when the content changes', () => {
    const p = withBuild();
    const before = importProfile(exportProfile(p)).profile.checksum;
    p.attributes.speed = 81;
    expect(importProfile(exportProfile(p)).profile.checksum).not.toBe(before);
  });
});

describe('AthleteProfile — never lose the player\'s work', () => {
  // THE SHARPEST CASE: a newer client wrote fields this build has never heard of.
  it('carries unknown keys through a round trip instead of dropping them', () => {
    const fromNewer = JSON.parse(exportProfile(withBuild())) as Record<string, unknown>;
    fromNewer.schema_version = '2.0.0';
    fromNewer.signature_moves = { dunk: 'eastbay' };      // a v2 section
    fromNewer.attributes = { ...(fromNewer.attributes as object), gravity: 77 };   // a v2 attribute

    const back = importProfile(JSON.stringify(fromNewer));
    expect(back.fromFuture).toBe(true);
    expect(back.profile.unknown?.signature_moves).toEqual({ dunk: 'eastbay' });
    // the unknown ATTRIBUTE survives too — it lives inside a known section, so it rides in that map
    expect(back.profile.attributes.gravity).toBe(77);
    // and it is still there after we write it back out
    const again = importProfile(exportProfile(back.profile));
    expect(again.profile.unknown?.signature_moves).toEqual({ dunk: 'eastbay' });
    expect(again.profile.attributes.gravity).toBe(77);
  });

  it('loads a future profile rather than refusing it, and flags it', () => {
    const f = JSON.parse(exportProfile(withBuild())) as Record<string, unknown>;
    f.schema_version = '9.9.9';
    const r = importProfile(JSON.stringify(f));
    expect(r.fromFuture).toBe(true);
    expect(r.profile.attributes.speed).toBe(80);         // the build came back
    expect(r.notes.join(' ')).toContain('newer version');
  });

  it('migrates an older profile forward silently', () => {
    const old = { schema_version: '0.9.0', profile_id: 'old-1', attributes: { speed: 50 } };
    const r = importProfile(JSON.stringify(old));
    expect(r.migrated).toBe(true);
    expect(r.fromFuture).toBe(false);
    expect(r.profile.schema_version).toBe(ATHLETE_PROFILE_VERSION);
    expect(r.profile.attributes.speed).toBe(50);
  });

  it('never throws on garbage — it starts a profile and says so', () => {
    for (const junk of ['', 'not json', '[]', 'null', '42', JSON.stringify([1, 2])]) {
      const r = importProfile(junk);
      expect(r.profile.schema_version).toBe(ATHLETE_PROFILE_VERSION);
      expect(Array.isArray(r.notes)).toBe(true);
    }
    expect(() => importProfile(undefined)).not.toThrow();
  });

  it('notices a hand-edited file without refusing to load it', () => {
    const tampered = JSON.parse(exportProfile(withBuild())) as Record<string, unknown>;
    tampered.checksum = 'deadbeef';
    const r = importProfile(JSON.stringify(tampered));
    expect(r.checksumMismatch).toBe(true);
    expect(r.profile.attributes.speed).toBe(80);         // loaded anyway
  });

  it('keeps the measured axes the ceilings were resolved against', () => {
    const r = importProfile(exportProfile(withBuild()));
    expect(r.profile.prq?.speed).toBe(62);
  });

  it('drops nothing on a profile that is entirely empty', () => {
    const r = importProfile(exportProfile(emptyAthleteProfile('e')));
    expect(r.profile.ink).toEqual([]);
    expect(r.profile.prq).toBeNull();
    expect(r.checksumMismatch).toBe(false);
  });
});

describe('AthleteProfile — the checksum', () => {
  it('covers the content and not itself', () => {
    const p = emptyAthleteProfile('c');
    const { checksum, ...rest } = p;
    expect(checksum).toBe(checksumOf(rest));
  });
});
