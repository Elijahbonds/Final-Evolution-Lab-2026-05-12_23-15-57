#!/usr/bin/env python3
"""Synthesize an original, CC0 808-style drum/synth kit for FEL Music Mode.

All samples are generated from scratch with numpy (no samples, no copyrighted
sources) so they are fully original and license-clean. Output: 16-bit mono WAV
at 44.1 kHz in public/audio/kits/808/.
"""
import os
import struct
import math
import wave

try:
    import numpy as np
except ImportError:
    raise SystemExit("numpy required: pip install numpy")

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio", "kits", "808")
os.makedirs(OUT, exist_ok=True)


def save(name, sig):
    # normalize to -1.5 dBFS, apply tiny fade to avoid clicks
    sig = np.asarray(sig, dtype=np.float64)
    peak = np.max(np.abs(sig)) or 1.0
    sig = sig / peak * 0.84
    n = len(sig)
    fade = min(256, n // 8)
    if fade > 0:
        ramp = np.linspace(0.0, 1.0, fade)
        sig[:fade] *= ramp
        sig[-fade:] *= ramp[::-1]
    pcm = np.int16(np.clip(sig, -1.0, 1.0) * 32767)
    path = os.path.join(OUT, name)
    with wave.open(path, "w") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f"wrote {name}  ({n/SR*1000:.0f} ms)")


def env(n, a, d, s=0.0, sr_lvl=0.0, rel=0.0):
    # simple AD/ADSR-ish exponential envelope of length n samples
    e = np.zeros(n)
    ai = int(a * SR)
    di = int(d * SR)
    ai = max(1, min(ai, n))
    e[:ai] = np.linspace(0, 1, ai)
    rem = n - ai
    if rem > 0:
        di = min(di, rem)
        e[ai:ai + di] = np.linspace(1, s, di) if di > 0 else 1
        if n - ai - di > 0:
            e[ai + di:] = s
    return e


def t(n):
    return np.arange(n) / SR


# --- KICK: pitch-swept sine (808 boom) ---
def kick():
    n = int(0.55 * SR)
    tt = t(n)
    f = 120 * np.exp(-tt * 30) + 45  # pitch env from ~165 to 45 Hz
    phase = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(phase)
    amp = np.exp(-tt * 6.5)
    click = np.sin(2 * np.pi * 1400 * tt) * np.exp(-tt * 220) * 0.4
    return body * amp + click


# --- SNARE: tone + noise ---
def snare():
    n = int(0.22 * SR)
    tt = t(n)
    tone = (np.sin(2 * np.pi * 185 * tt) + np.sin(2 * np.pi * 330 * tt)) * np.exp(-tt * 32) * 0.5
    noise = np.random.uniform(-1, 1, n) * np.exp(-tt * 26)
    return tone + noise * 0.9


# --- HAT (closed): high-passed noise, short ---
def hat():
    n = int(0.06 * SR)
    tt = t(n)
    noise = np.random.uniform(-1, 1, n)
    # crude high-pass via differencing
    hp = np.diff(noise, prepend=noise[0])
    return hp * np.exp(-tt * 90)


# --- OPEN HAT: longer decay ---
def openhat():
    n = int(0.35 * SR)
    tt = t(n)
    noise = np.random.uniform(-1, 1, n)
    hp = np.diff(noise, prepend=noise[0])
    return hp * np.exp(-tt * 12)


# --- CLAP: 3 noise bursts + tail ---
def clap():
    n = int(0.3 * SR)
    out = np.zeros(n)
    for off in (0.0, 0.009, 0.018):
        s = int(off * SR)
        seg = n - s
        tt = t(seg)
        out[s:] += np.random.uniform(-1, 1, seg) * np.exp(-tt * 55)
    tt = t(n)
    out += np.random.uniform(-1, 1, n) * np.exp(-tt * 18) * 0.4
    return out


# --- BASS: sub sine with slight harmonic (one-shot, tuned to A1 ~55Hz) ---
def bass():
    n = int(0.6 * SR)
    tt = t(n)
    f0 = 55.0
    sig = np.sin(2 * np.pi * f0 * tt) + 0.25 * np.sin(2 * np.pi * f0 * 2 * tt)
    return sig * np.exp(-tt * 4.5)


# --- LEAD: saw-ish pluck (tuned to A3 ~220Hz) ---
def lead():
    n = int(0.4 * SR)
    tt = t(n)
    f0 = 220.0
    # additive saw
    sig = np.zeros(n)
    for k in range(1, 12):
        sig += np.sin(2 * np.pi * f0 * k * tt) / k
    return sig * np.exp(-tt * 9)


# --- FX: rising sweep riser ---
def fx():
    n = int(0.5 * SR)
    tt = t(n)
    f = 200 * np.exp(tt * 4)  # rising
    phase = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(phase) * 0.5 + np.random.uniform(-1, 1, n) * 0.2
    return sig * env(n, 0.3, 0.2, s=0.0)


np.random.seed(808)
save("kick.wav", kick())
save("snare.wav", snare())
save("hat.wav", hat())
save("openhat.wav", openhat())
save("clap.wav", clap())
save("bass.wav", bass())
save("lead.wav", lead())
save("fx.wav", fx())
print("808 kit complete ->", os.path.abspath(OUT))
