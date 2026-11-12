// perf-lag's rig entry (round 7), types stripped: phase marks on the real clock, the virtual clock from 'playing', per-frame split timings.
import { setAgentRunHooksAllowed } from "@/lib/agentRunHooks";
import { runMode, InputBus } from "@/lib/babylon";
import { MODES } from "@/lib/babylon/modes/registry";
import { readCourtLocation } from "@/lib/babylon/nexus/courtLocations";
const W = window;
const now = () => W.__realNow ? W.__realNow() : performance.now();
W.__marks = W.__marks || [];
function felFirstFrameBegin() {
  const t = now();
  while (now() - t < 4) {
  }
}
function felFirstFrameEnd() {
  const t = now();
  while (now() - t < 4) {
  }
}
function felPlayBegin() {
  const t = now();
  while (now() - t < 4) {
  }
}
W.__marks.push(["script", now()]);
setAgentRunHooksAllowed(true);
(async () => {
  const q = new URLSearchParams(window.location.search);
  const key = q.get("mode") ?? "dunk";
  const raster = Number(q.get("raster") ?? 4);
  const canvas = document.getElementById("c");
  const bus = new InputBus();
  W.__bus = bus;
  const def = MODES[key];
  if (!def) {
    W.__err = "no mode " + key;
    return;
  }
  let hooked = false;
  const pressStart = () => {
    if (W.__phase !== "ready") return;
    if (q.get("holdStart") === "1" && !W.__go) {
      setTimeout(pressStart, 200);
      return;
    }
    if (Number(q.get("dwell") ?? 0) > 0 && !W.__dwelt) {
      W.__dwelt = 1;
      setTimeout(pressStart, Number(q.get("dwell")));
      return;
    }
    W.__marks.push(["start", now()]);
    bus.emit({ t: "button", btn: "START", pressed: true });
    bus.emit({ t: "button", btn: "START", pressed: false });
    setTimeout(pressStart, 500);
  };
  W.__frames = [];
  const heap = () => performance.memory ? performance.memory.usedJSHeapSize : 0;
  const hookEngine = () => {
    if (hooked || !W.__FEL_DEV__) return;
    hooked = true;
    const scene = W.__FEL_DEV__.scene;
    const engine = scene.getEngine();
    if (raster !== 1) {
      engine.setHardwareScalingLevel(engine.getHardwareScalingLevel() * raster);
      W.__rasterAt = engine.getHardwareScalingLevel();
    }
    let tb = 0, ta = 0, taa = 0, d0 = 0;
    engine.onBeginFrameObservable.add(() => {
      if (W.__phase === "playing" && !W.__ffB) {
        W.__ffB = 1;
        felFirstFrameBegin();
      }
      tb = now();
      d0 = engine._drawCalls ? engine._drawCalls.current : 0;
      ta = 0;
      taa = 0;
    });
    scene.onBeforeAnimationsObservable.add(() => {
      ta = now();
    });
    scene.onAfterAnimationsObservable.add(() => {
      taa = now();
    });
    let lastA = -1;
    engine.onEndFrameObservable.add(() => {
      if (W.__phase === "playing" && W.__ffB && !W.__ffE) {
        W.__ffE = 1;
        felFirstFrameEnd();
      }
      const te = now();
      if (W.__frames.length >= 2e4) return;
      const ph = W.__phase || "";
      if (ph === "playing" && W.__vtOn) {
        const g = (performance.now() - W.__vt0) / 1e3;
        bus.emit({ t: "stick", side: "L", x: Math.sin(g * 0.7) * 0.8, y: -0.6 + Math.cos(g * 0.5) * 0.3 });
        const a = g % 1.5 < 0.12;
        if (a !== (lastA === 1)) {
          bus.emit({ t: "button", btn: "A", pressed: a });
          lastA = a ? 1 : 0;
        }
      }
      W.__frames.push([
        ph,
        tb,
        te,
        ta ? ta - tb : 0,
        ta && taa ? taa - ta : 0,
        taa ? te - taa : 0,
        heap(),
        engine._drawCalls ? engine._drawCalls.current - d0 : 0,
        scene.getActiveMeshes().length,
        W.__vtTicks || 0
      ]);
      if (W.__frames.length % 10 === 5 && ph === "playing") {
        const c0 = now();
        let x = 0;
        for (let i = 0; i < 2e5; i++) x += Math.sqrt(i) * 1.0001;
        (W.__calib ||= []).push(now() - c0 + (x < 0 ? 1 : 0));
      }
    });
  };
  try {
    W.__marks.push(["runMode", now()]);
    W.__stop = await runMode(def, {
      canvas,
      location: readCourtLocation(),
      input: bus,
      onPhase: (p, d) => {
        W.__phase = p;
        W.__marks.push([p, now()]);
        if (p === "playing" && !W.__pb) {
          W.__pb = 1;
          felPlayBegin();
        }
        if (p === "loading") hookEngine();
        if (p === "ready") pressStart();
        if (p === "playing" && !W.__vtOn && W.__VT !== false) {
          W.__vtStart && W.__vtStart();
        }
        if (p === "error") W.__err = String(d);
      },
      onHud: () => {
        W.__hudCalls = (W.__hudCalls || 0) + 1;
      },
      resultSink: async () => {
      }
    });
  } catch (e) {
    W.__err = String(e?.message ?? e);
  }
})();
