#!/usr/bin/env python3
"""
MUSIC-SUITE P7 (2026-09-29), the public-domain shelf: trim leading/trailing silence off a downloaded
transfer and write the result as public/audio/pd/<id>.mp3.

There is no ffmpeg on this machine. The repo's Kokoro venv (~/.cache/fel-kokoro/.venv) carries `soundfile`
built on libsndfile 1.2+, which reads MP3/OGG/FLAC/WAV and also WRITES MP3 (libsndfile's built-in LAME
encoder) -- so the whole pipeline (read the original, trim, encode) is one library, no shell-out.

Run: ~/.cache/fel-kokoro/.venv/bin/python scripts/music/pd-shelf/trim_convert.py <src> <dst.mp3> <meta.json>

Silence is judged on a short-window RMS envelope RELATIVE to the file's own loud-passage RMS (95th
percentile), not an absolute level. These are 1909-1924 acoustic transfers with a constant surface-noise
floor: an absolute dBFS gate would either trim nothing (the noise floor alone is already audible) or eat
quiet passages. A window counts as "sound" once its RMS is within REL_DB of the loud-passage RMS; the trim
points are the first and last such window, backed off by PAD_S so an attack/decay is not clipped. Some
sources (found: whiteman_rhapsody_1924, an already-cleaned archive.org 64kbps derivative) have no silence to
trim at either end -- the script then leaves both edges alone, which is correct, not a bug.

Every run's PROVENANCE.json entry records this script's own sha256 (provenance.test.ts checks it against the
repo copy), so the pack can be rebuilt from here exactly as it was.
"""
import sys
import json
import numpy as np
import soundfile as sf

WINDOW_S = 0.05     # 50 ms analysis window
PAD_S = 0.25        # keep this much room before the first / after the last "sound" window
REL_DB = 20.0       # a window counts as sound if within REL_DB of the loud-passage RMS


def rms_envelope(mono: np.ndarray, sr: int, window_s: float):
    win = max(1, int(sr * window_s))
    n = len(mono) // win
    if n == 0:
        return np.array([np.sqrt(np.mean(mono ** 2) + 1e-12)]), win
    trimmed = mono[: n * win].reshape(n, win)
    env = np.sqrt(np.mean(trimmed.astype(np.float64) ** 2, axis=1) + 1e-12)
    return env, win


def find_bounds(mono: np.ndarray, sr: int):
    env, win = rms_envelope(mono, sr, WINDOW_S)
    loud = np.percentile(env, 95)
    loud_db = 20 * np.log10(loud + 1e-12)
    gate_db = loud_db - REL_DB
    gate = 10 ** (gate_db / 20)
    sound = np.where(env >= gate)[0]
    if len(sound) == 0:
        return 0, len(mono)
    pad = int(PAD_S * sr)
    start = max(0, sound[0] * win - pad)
    end = min(len(mono), (sound[-1] + 1) * win + pad)
    return start, end


def main(src: str, dst: str, meta_out: str):
    data, sr = sf.read(src, always_2d=True)  # (frames, channels), float64
    mono = data.mean(axis=1)
    start, end = find_bounds(mono, sr)
    trimmed = data[start:end]
    orig_dur = len(data) / sr
    trimmed_dur = len(trimmed) / sr
    sf.write(dst, trimmed.astype(np.float32), sr, format="MP3")
    out_info = sf.info(dst)
    meta = {
        "src": src,
        "dst": dst,
        "samplerate": sr,
        "channels": data.shape[1],
        "orig_frames": len(data),
        "orig_duration_s": round(orig_dur, 3),
        "trim_start_s": round(start / sr, 3),
        "trim_end_s": round((len(data) - end) / sr, 3),
        "trimmed_duration_s": round(trimmed_dur, 3),
        "out_duration_s": round(out_info.frames / out_info.samplerate, 3),
    }
    with open(meta_out, "w") as f:
        json.dump(meta, f, indent=2)
    print(json.dumps(meta, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
