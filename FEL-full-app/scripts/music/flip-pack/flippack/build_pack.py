#!/usr/bin/env python3
"""build_pack.py — assemble and validate the Flip loop pack (CONTRACT.md).

Every producer writes one sidecar per item (items/<id>.json, via songgen/flip_pack.py) and, optionally, bank files
(banks/<bank>.json). This script is the only writer of pack.json and PROVENANCE.md:

    python build_pack.py            # validate every item + the pack rules, write pack.json + PROVENANCE.md
    python build_pack.py --check    # validate only (no writes)
    python build_pack.py --parity   # also run the app's real Flip.ts on every file (tsx, read-only) and compare
    python build_pack.py --check --partial --only theme_,loop_ep   # a producer's self-check: its own items (id
                                                                  # prefixes), item rules only, no pack counts
    FLIPPACK_DIR=<dir> python build_pack.py ...   # a dry-run pack elsewhere

Exit 0 = every rule passed. Warnings (SHOULD rules) are printed but never fail the pack.
"""
from __future__ import annotations

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'songgen'))
import flip_pack as P  # noqa: E402

PACK_BYTES_MAX = 8_000_000
COUNTS = {                       # kind -> (min, max) items
    'theme': (3, 3),
    'loop': (8, 10),
    'oneshot': (10, 14),         # stab + hit
    'texture': (2, 3),
    'chop': (20, 48),            # one-shot chops
    'sheet': (2, 3),             # chop sheets
}
KIND_ORDER = {k: i for i, k in enumerate(P.KINDS)}


def load_items(only: list[str] | None = None, tolerant: bool = False) -> list[dict]:
    items = []
    if not os.path.isdir(P.ITEMS_DIR):
        return items
    for f in sorted(os.listdir(P.ITEMS_DIR)):
        if not f.endswith('.json') or (only and not any(f.startswith(o) for o in only)):
            continue
        try:
            with open(os.path.join(P.ITEMS_DIR, f)) as fh:
                items.append(json.load(fh))
        except json.JSONDecodeError:
            if not tolerant:
                raise
            print(f'(skipping {f}: being written)', file=sys.stderr)
    return items


def load_banks() -> list[dict]:
    d = os.path.join(P.PACK_DIR, 'banks')
    out = []
    if os.path.isdir(d):
        for f in sorted(os.listdir(d)):
            if f.endswith('.json'):
                with open(os.path.join(d, f)) as fh:
                    out.append(json.load(fh))
    return out


def main(argv: list[str]) -> int:
    check_only = '--check' in argv
    only = None
    if '--only' in argv:
        only = [x for x in argv[argv.index('--only') + 1].split(',') if x]
    items = load_items(only, tolerant='--partial' in argv)
    banks = load_banks()
    fails, warns = [], []
    by_id = {}
    for rec in items:
        v = P.validate_record(rec)
        if not v.ok:
            fails.append({'id': rec.get('id'), 'failures': v.failures()})
        if v.warnings:
            warns.append({'id': rec.get('id'), 'warnings': v.warnings})
        if rec.get('id') in by_id:
            fails.append({'id': rec.get('id'), 'failures': [{'name': 'id.unique'}]})
        by_id[rec.get('id')] = rec

    # ── pack rules ──
    def cls(r):
        if r['kind'] in ('stab', 'hit'):
            return 'oneshot'
        if r['kind'] == 'chop':
            return 'sheet' if r.get('sheet') else 'chop'
        return r['kind']
    counts = {k: 0 for k in COUNTS}
    for r in items:
        counts[cls(r)] = counts.get(cls(r), 0) + 1
    partial = '--partial' in argv
    for k, (lo, hi) in COUNTS.items():
        if not partial and not lo <= counts.get(k, 0) <= hi:
            fails.append({'id': '(pack)', 'failures': [{'name': f'count.{k}', 'detail': [counts.get(k, 0), lo, hi]}]})
    themes = sorted(r['id'] for r in items if r['kind'] == 'theme')
    cands = sorted(r.get('candidate', '') for r in items if r['kind'] == 'theme')
    if themes and not partial and cands != ['a', 'b', 'c']:
        fails.append({'id': '(pack)', 'failures': [{'name': 'themes.candidates', 'detail': cands}]})
    for r in items:
        if r['kind'] == 'theme':
            lz = r.get('lesson', {})
            fp = lz.get('flipPattern', [])
            ok = (isinstance(r.get('character'), str) and 0 < len(r['character']) <= 120
                  and lz.get('playInOrder') == list(range(len(r['suggestedPads'])))
                  and len(fp) == 16 and all(x is None or (isinstance(x, int) and 0 <= x < len(r['suggestedPads'])) for x in fp)
                  and sum(x is not None for x in fp) >= 4 and isinstance(lz.get('tip'), str) and len(lz['tip']) <= 140)
            if not ok:
                fails.append({'id': r['id'], 'failures': [{'name': 'theme.lesson', 'detail': {'character': r.get('character'), 'lesson': lz}}]})
    seen_titles = {}
    for r in items:
        key = (r['kind'], r['title'].lower())
        if key in seen_titles:
            fails.append({'id': r['id'], 'failures': [{'name': 'title.unique', 'detail': seen_titles[key]}]})
        seen_titles[key] = r['id']
    for b in banks:
        pads = b.get('pads', [])
        bad = [x for x in pads if x is not None and x not in by_id]
        wrong = [x for x in pads if x in by_id and by_id[x]['kind'] not in ('stab', 'hit', 'chop') or (x in by_id and by_id[x].get('sheet'))]
        if not (isinstance(b.get('id'), str) and isinstance(b.get('title'), str) and 1 <= len(pads) <= 16) or bad or wrong:
            fails.append({'id': f"(bank {b.get('id')})", 'failures': [{'name': 'bank', 'detail': {'unknown': bad, 'notOneShot': wrong}}]})
    referenced = {r['file'] for r in items}
    orphans = [] if ('--partial' in argv) else sorted(f'audio/{f}' for f in (os.listdir(P.AUDIO_DIR) if os.path.isdir(P.AUDIO_DIR) else [])
                     if f.endswith('.mp3') and f'audio/{f}' not in referenced)
    if orphans:
        fails.append({'id': '(pack)', 'failures': [{'name': 'orphan.audio', 'detail': orphans}]})
    audio_bytes = sum(os.path.getsize(os.path.join(P.PACK_DIR, r['file'])) for r in items
                      if os.path.exists(os.path.join(P.PACK_DIR, r['file'])))

    items_sorted = sorted(items, key=lambda r: (KIND_ORDER.get(r['kind'], 9), r['id']))
    pack = {
        'pack': 'fel_flip', 'version': P.PACK_VERSION, 'date': P.DATE, 'sampleRate': P.SR,
        'statement': P.STATEMENT, 'licence': P.LICENCE,
        'themeCandidates': themes, 'themeDefault': None,
        'finder': {'windowMs': 10, 'minGapMs': 80, 'ratio': 2.2, 'gate': 0.02, 'maxSlices': 16,
                   'note': 'onsets = Flip.ts onsetSlices on the decoded file at 44.1 kHz (identical at 48 kHz)'},
        'decoding': {'lengthField': 'samples', 'decoderDelayConvention': 529,
                     'note': 'a decoder that returns more than `samples` added LAME priming at the START: trim '
                             'encoderDelay + 529 samples there, then cut to `samples`'},
        'banks': banks,
        'items': items_sorted,
    }
    size_json = len(json.dumps(pack, indent=1).encode())
    total = audio_bytes + size_json
    if total > PACK_BYTES_MAX:
        fails.append({'id': '(pack)', 'failures': [{'name': 'bytes', 'detail': total}]})

    parity_ok = None
    if '--parity' in argv and items:
        import onsets_check as OC
        parity_ok = OC.parity([os.path.join(P.PACK_DIR, r['file']) for r in items_sorted])
        if not parity_ok:
            fails.append({'id': '(pack)', 'failures': [{'name': 'parity.flip_ts'}]})

    summary = {'ok': not fails, 'items': len(items), 'counts': counts, 'audioBytes': audio_bytes,
               'packBytes': total, 'parity': parity_ok, 'failures': fails, 'warnings': warns}
    print(json.dumps(summary, indent=1))
    if not check_only and not partial and not fails:
        with open(os.path.join(P.PACK_DIR, 'pack.json'), 'w') as fh:
            json.dump(pack, fh, indent=1)
            fh.write('\n')
        write_provenance_md(items_sorted, banks, total)
        print(f'wrote {os.path.join(P.PACK_DIR, "pack.json")} and PROVENANCE.md')
    return 0 if not fails else 1


def write_provenance_md(items: list[dict], banks: list[dict], total: int) -> None:
    lines = [f'# FEL Flip pack — provenance ({P.DATE})', '',
             P.STATEMENT, '',
             f'Licence for every file: **{P.LICENCE}**. Pack version {P.PACK_VERSION}; {len(items)} items; '
             f'{total:,} bytes including pack.json. Re-render any item by running its script (same seed, same bytes '
             'on this machine); `build_pack.py --check` re-hashes every file and script.', '',
             '| id | kind | title | script | seed | sha256 (first 16) | source detail |', '|---|---|---|---|---|---|---|']
    for r in items:
        pv = r['provenance']
        detail = ''
        if 'kokoro' in pv:
            k = pv['kokoro']
            mix = ' + '.join(f'{v} {w}' for v, w in k.get('voice', []))
            detail = f"Kokoro-82M voice {mix}, speed {k.get('speed')}, text \"{k.get('text')}\""
        else:
            detail = pv.get('library', '')
        lines.append(f"| `{r['id']}` | {r['kind']} | {r['title']} | `{os.path.basename(pv['script'])}` | {pv['seed']} | "
                     f"`{pv['sha256'][:16]}` | {detail} |")
    if banks:
        lines += ['', '## Banks', ''] + [f"- **{b['title']}** (`{b['id']}`): " + ', '.join(f'`{x}`' for x in b['pads'] if x) for b in banks]
    with open(os.path.join(P.PACK_DIR, 'PROVENANCE.md'), 'w') as fh:
        fh.write('\n'.join(lines) + '\n')


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
