#!/usr/bin/env python3
"""THE MIC's renderer (2026-09-24): every scripted line, voiced offline, packed into banks the game fetches.

Input: a render job (scripts/mic/build-mic.mts writes it) listing each cast member's Kokoro voice mix, speaking rate and lines.
Output, under public/audio/voice/v1/<cast>/:
  <group>.<hash>.bin  the group's clips (AAC in .m4a, mono, 24 kHz, 32 kbps; 24 for the crowd, which the game filters to 3.6 kHz anyway), back to back
  <group>.json        the index: each line's id, moment, text, tier/tags, byte range in the bank and length in seconds

The voices are Kokoro-82M (Apache-2.0 weights, hexgrad/Kokoro-82M; the ONNX export onnx-community/Kokoro-82M-v1.0-ONNX) run
locally through kokoro-onnx. Nothing leaves the machine. The tool lives OUTSIDE the repo: KOKORO_HOME (default ~/.cache/fel-kokoro)
holds .venv, model.onnx and voices-en.npz. Run it with that venv's python:

    ~/.cache/fel-kokoro/.venv/bin/python tools/voice/render-mic.py <job.json> <out dir>

Each clip is trimmed (30 ms of head, 80 ms of tail), levelled (speech RMS to about -19 dBFS, peaks under -1 dBFS), faded (8 ms)
and encoded with macOS afconvert. Clips are cached by (text, voice, rate) in KOKORO_HOME/clips, so a re-render only voices what
changed.

A REAL VOICE (a signed creator card): when the job marks a cast `recordings: <dir>` (build-mic.mts does that only for a cast whose
card is signed), a take at <dir>/<line id>.wav|.aif|.m4a replaces the rendered line, id for id; lines not recorded yet keep the
rendered voice. Takes are converted to 24 kHz mono and levelled like everything else.
"""
import hashlib, json, os, subprocess, sys, tempfile, time
import numpy as np
import soundfile as sf

HOME = os.path.expanduser(os.environ.get('KOKORO_HOME', '~/.cache/fel-kokoro'))
RATE = 24000
CACHE = os.path.join(HOME, 'clips')


def level(a: np.ndarray) -> np.ndarray:
    peak = float(np.abs(a).max()) if a.size else 0.0
    if peak < 1e-4:
        return a
    thr = peak * 0.02
    idx = np.where(np.abs(a) > thr)[0]
    head = max(0, idx[0] - int(0.03 * RATE))
    tail = min(len(a), idx[-1] + int(0.08 * RATE))
    a = a[head:tail].astype(np.float32)
    voiced = a[np.abs(a) > thr]
    rms = float(np.sqrt(np.mean(voiced ** 2))) if voiced.size else 1e-3
    gain = min(10 ** (-19 / 20) / max(rms, 1e-6), 0.89 / max(float(np.abs(a).max()), 1e-6))
    a = a * gain
    f = int(0.008 * RATE)
    if len(a) > 2 * f:
        ramp = np.linspace(0, 1, f, dtype=np.float32)
        a[:f] *= ramp
        a[-f:] *= ramp[::-1]
    return a


def main() -> None:
    job_path, out_dir = sys.argv[1], sys.argv[2]
    job = json.load(open(job_path))
    os.makedirs(CACHE, exist_ok=True)
    from kokoro_onnx import Kokoro
    k = Kokoro(os.path.join(HOME, 'model.onnx'), os.path.join(HOME, 'voices-en.npz'))
    t0, voiced, cached = time.time(), 0, 0
    for cast in job['casts']:
        mix = cast['voice']['mix']
        style = sum(w * k.get_voice_style(v) for v, w in mix)
        speed = float(cast['voice']['speed'])
        vkey = json.dumps([mix, speed, cast.get('kbps', 32)])
        groups: dict[str, list] = {}
        for line in cast['lines']:
            h = hashlib.sha1(f"{vkey}|{line['text']}".encode()).hexdigest()[:16]
            m4a = os.path.join(CACHE, f'{h}.m4a')
            meta = os.path.join(CACHE, f'{h}.json')
            take = next((os.path.join(cast['recordings'], line['id'] + ext) for ext in ('.wav', '.aif', '.aiff', '.m4a')
                         if cast.get('recordings') and os.path.exists(os.path.join(cast['recordings'], line['id'] + ext))), None)
            if take:
                h = 'take-' + hashlib.sha1(open(take, 'rb').read()).hexdigest()[:16]
                m4a, meta = os.path.join(CACHE, f'{h}.m4a'), os.path.join(CACHE, f'{h}.json')
            if not (os.path.exists(m4a) and os.path.exists(meta)) and take:
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as raw:
                    subprocess.run(['afconvert', '-f', 'WAVE', '-d', f'LEI16@{RATE}', '-c', '1', take, raw.name], check=True)
                    audio = level(sf.read(raw.name, dtype='float32')[0])
                    os.unlink(raw.name)
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                    sf.write(tmp.name, audio, RATE, subtype='PCM_16')
                    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', str(cast.get('kbps', 32) * 1000), tmp.name, m4a], check=True)
                    os.unlink(tmp.name)
                json.dump({'sec': round(len(audio) / RATE, 3), 'take': os.path.basename(take)}, open(meta, 'w'))
                voiced += 1
            elif not (os.path.exists(m4a) and os.path.exists(meta)):
                audio, sr = k.create(line['text'], voice=style, speed=speed, lang='en-us')
                assert sr == RATE, sr
                audio = level(np.asarray(audio, dtype=np.float32))
                with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as tmp:
                    sf.write(tmp.name, audio, RATE, subtype='PCM_16')
                    subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', str(cast.get('kbps', 32) * 1000), tmp.name, m4a], check=True)
                    os.unlink(tmp.name)
                json.dump({'sec': round(len(audio) / RATE, 3)}, open(meta, 'w'))
                voiced += 1
            else:
                cached += 1
            groups.setdefault(line['group'], []).append((line, m4a, json.load(open(meta))['sec']))
        cdir = os.path.join(out_dir, cast['id'])
        os.makedirs(cdir, exist_ok=True)
        for old in os.listdir(cdir):
            os.unlink(os.path.join(cdir, old))
        for group, items in groups.items():
            blob, lines = bytearray(), []
            for line, m4a, sec in items:
                b = open(m4a, 'rb').read()
                entry = {k2: line[k2] for k2 in ('id', 'moment', 'text', 'tier', 'tags') if k2 in line}
                entry.update({'off': len(blob), 'len': len(b), 'sec': sec})
                lines.append(entry)
                blob += b
            digest = hashlib.sha1(blob).hexdigest()[:10]
            bank = f'{group}.{digest}.bin'
            open(os.path.join(cdir, bank), 'wb').write(blob)
            json.dump({'cast': cast['id'], 'group': group, 'bank': bank, 'lines': lines}, open(os.path.join(cdir, f'{group}.json'), 'w'), separators=(',', ':'))
        for group in cast.get('groups', []):   # a group the game may ask this voice for, with nothing in it: an empty index, not a 404
            if group not in groups:
                json.dump({'cast': cast['id'], 'group': group, 'bank': '', 'lines': []}, open(os.path.join(cdir, f'{group}.json'), 'w'), separators=(',', ':'))
        print(f"{cast['id']}: {len(cast['lines'])} lines in {len(groups)} banks ({time.time() - t0:.0f}s)", flush=True)
    print(f'done: {voiced} voiced, {cached} from the cache, {time.time() - t0:.0f}s', flush=True)


if __name__ == '__main__':
    main()
