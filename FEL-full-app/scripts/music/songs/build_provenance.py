"""build_provenance.py — writes musicsuite/songs/PROVENANCE.json, the set-wide provenance manifest.

It re-hashes every file under songs/<id>/ (8 stems, preview.mp3, map.json), checks each audio hash against the
song's own map.provenance record, checks that the generator script, fel_synth and any voice module still match the
hashes stamped at render time, decodes every MP3 to confirm channels / rate / length, and (unless --no-validate)
runs `validate.py songs --suite` and records the verdict. Nothing is re-rendered and no audio is modified.

    /Users/elijahbonds/.cache/fel-kokoro/.venv/bin/python songgen/build_provenance.py [--no-validate]

Exit 0 when every check holds, 1 otherwise (the manifest is still written, with the failures listed).
"""
from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys

import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.dirname(HERE)
SONGS = os.path.join(SUITE, 'songs')
OUT = os.path.join(SONGS, 'PROVENANCE.json')
IDS = ['warmup', 'cypher', 'goldenhour', 'battle', 'canals', 'evolution']
STEMS = ['bed', 'drums', 'bass', 'keys', 'perc', 'horns', 'lead', 'fx']
LICENCE = 'FEL original, generated'
DATE = '2026-09-25'


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    validate = '--no-validate' not in sys.argv[1:]
    failures: list[str] = []
    files: list[dict] = []
    songs: list[dict] = []
    library = None

    for sid in IDS:
        d = os.path.join(SONGS, sid)
        m = json.load(open(os.path.join(d, 'map.json')))
        p = m['provenance']
        script_now = sha256(p['script'])
        lib_now = sha256(p['library'])
        if script_now != p['scriptSha256']:
            failures.append(f'{sid}: script changed since render')
        if lib_now != p['librarySha256']:
            failures.append(f'{sid}: fel_synth changed since render')
        library = {'path': p['library'], 'sha256': lib_now, 'version': p.get('libraryVersion')}
        modules = []
        for name, mod in (p.get('modules') or {}).items():
            now = sha256(mod['path'])
            if now != mod['sha256']:
                failures.append(f'{sid}: module {name} changed since render')
            modules.append({'path': mod['path'], 'sha256': now})
        generator = {'script': p['script'], 'scriptSha256': script_now,
                     'library': p['library'], 'librarySha256': lib_now, 'libraryVersion': p.get('libraryVersion')}
        if modules:
            generator['modules'] = modules
        seed = int(p['seed'])
        base = {'song': sid, 'generator': generator, 'seed': seed, 'seedHex': f'0x{seed:04X}',
                'date': p['date'], 'licence': LICENCE}

        rels = [f'stems/{s}.mp3' for s in STEMS] + ['preview.mp3', 'map.json']
        song_bytes = 0
        for rel in rels:
            path = os.path.join(d, rel)
            h = sha256(path)
            size = os.path.getsize(path)
            entry = {'path': f'songs/{sid}/{rel}', 'absPath': path, 'sha256': h, 'bytes': size}
            if rel.endswith('.mp3'):
                recorded = p['sha256'].get(rel)
                ok = recorded == h
                if not ok:
                    failures.append(f'{sid}/{rel}: sha256 differs from map.provenance')
                info = sf.info(path)
                entry.update({'kind': 'preview' if rel == 'preview.mp3' else 'stem',
                              'channels': info.channels, 'sampleRate': info.samplerate,
                              'decodedFrames': info.frames, 'matchesMapProvenance': ok})
                if rel.startswith('stems/'):
                    entry['stem'] = rel[6:-4]
                    song_bytes += size
                    if info.channels != 1 or info.samplerate != 44100 or info.frames != m['samples']:
                        failures.append(f'{sid}/{rel}: decoded {info.channels}ch {info.samplerate} Hz '
                                        f'{info.frames} frames, map says mono 44100 Hz {m["samples"]}')
                else:
                    if info.channels != 2:
                        failures.append(f'{sid}/preview.mp3: not stereo')
            else:
                entry.update({'kind': 'map', 'note': 'written by the same render; carries the per-audio-file '
                                                     'sha256 record (map.provenance.sha256)'})
            entry.update(base)
            files.append(entry)
        songs.append({'id': sid, 'title': m['title'], 'style': m['style'], 'bpm': m['bpm'], 'key': m['key'],
                      'bars': m['bars'], 'durationSec': m['durationSec'], 'samples': m['samples'],
                      'difficulty': m['difficulty'], 'seed': seed, 'seedHex': f'0x{seed:04X}',
                      'generator': generator, 'date': p['date'], 'stemBytes': song_bytes,
                      'previewBytes': os.path.getsize(os.path.join(d, 'preview.mp3')),
                      'statement': p['statement'], 'tools': p.get('tools')})

    verdict = None
    if validate:
        py = sys.executable
        r = subprocess.run([py, os.path.join(HERE, 'validate.py'), SONGS, '--suite'], cwd=HERE,
                           capture_output=True, text=True)
        try:
            out = json.loads(r.stdout[r.stdout.find('{'):])
            per = {s['id']: {'ok': s['ok'], 'checks': len(s['checks']),
                             'passed': sum(1 for c in s['checks'] if c['ok'])} for s in out['songs']}
            suite = out['suite']
            verdict = {'command': 'validate.py songs --suite', 'exitCode': r.returncode, 'ok': out['ok'],
                       'songs': per, 'setRules': {'ok': suite['ok'], 'checks': len(suite['checks']),
                                                  'passed': sum(1 for c in suite['checks'] if c['ok'])}}
        except Exception as e:  # pragma: no cover - report, do not hide
            verdict = {'command': 'validate.py songs --suite', 'exitCode': r.returncode, 'error': repr(e)}
        if r.returncode != 0:
            failures.append(f'validate.py --suite exit {r.returncode}')

    manifest = {
        'schema': 'fel-musicsuite-provenance/1',
        'date': DATE,
        'licence': LICENCE,
        'statement': ('All audio in songs/ is 100% original and generated from code by FEL: numpy oscillators, FM, '
                      'filtered seeded noise and synthetic reverb impulse responses (fel_synth) driven by one '
                      'composition script per song. No samples, no loops, no recordings, no third-party audio, '
                      'no vocals (only the wordless formant synth "ooh/aah" pads in warmup, goldenhour and '
                      'canals). Rendering is deterministic: the same script + library + seed give byte-identical '
                      'files.'),
        'hash': 'sha256 over the file bytes (git-free content hash)',
        'seedDerivation': 'every random draw = numpy PCG64(blake2b(seed, stem/voice/variant/params...))',
        'library': library,
        'validator': {'path': os.path.join(HERE, 'validate.py'), 'sha256': sha256(os.path.join(HERE, 'validate.py'))},
        'contract': {'path': os.path.join(HERE, 'CONTRACT.md'), 'sha256': sha256(os.path.join(HERE, 'CONTRACT.md'))},
        'spec': {'path': os.path.join(HERE, 'SONGS.md'), 'sha256': sha256(os.path.join(HERE, 'SONGS.md'))},
        'manifestBuilder': {'path': os.path.abspath(__file__), 'sha256': sha256(os.path.abspath(__file__))},
        'validation': verdict,
        'checksOk': not failures,
        'failures': failures,
        'songs': songs,
        'files': files,
    }
    with open(OUT, 'w') as f:
        json.dump(manifest, f, indent=1)
        f.write('\n')
    print(json.dumps({'written': OUT, 'files': len(files), 'checksOk': not failures, 'failures': failures,
                      'validation': verdict}, indent=1))
    return 0 if not failures else 1


if __name__ == '__main__':
    sys.exit(main())
