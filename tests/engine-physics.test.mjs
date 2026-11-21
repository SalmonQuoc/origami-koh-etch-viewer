// Physical checks of the etch engine (run with the WebAssembly kernel when it is built, else with JavaScript).
import test from "node:test";
import assert from "node:assert/strict";
import { engine, CASES, PAL30, F100, wasmBytes } from "./load-engine.mjs";

const E = engine(!!wasmBytes);

test("(100) pit floor moves at R(100): depth = 0.797 µm/min × 60 min within one cell", () => {
  const [, cfg, t] = CASES.find(c => c[0] === "(100) square pit");
  const S = E.create(structuredClone(cfg)); E.step(S, t, 1e9);
  const d = E.stats(S, t).depth, want = PAL30["100"]*t;
  assert.ok(Math.abs(d - want) <= cfg.dx, `depth ${d.toFixed(2)} µm, expected ${want.toFixed(2)} ± ${cfg.dx}`);
});

test("(100) pit with <110> edges: no undercut below the mask ({111} walls)", () => {
  const [, cfg, t] = CASES.find(c => c[0] === "(100) square pit");
  const S = E.create(structuredClone(cfg)); E.step(S, t, 1e9);
  assert.ok(E.stats(S, t).under <= 0.5*cfg.dx);
});

test("square at 45° on (100): vertical {100} walls undercut sideways at about R(100)·t", () => {
  // 100 µm window at 45°, 40 min, dx 2 µm: 24.0 µm at 20 µm depth against 31.9 µm (the first-order scheme lags by 2-4 cells; README, Known limits)
  const s2 = Math.SQRT1_2, W = 100, sq = [[W/2*Math.SQRT2, 0], [0, W/2*Math.SQRT2], [-W/2*Math.SQRT2, 0], [0, -W/2*Math.SQRT2]], dx = 2, t = 40;
  const S = E.create({ frame: F100, rates: PAL30, shapes: [{ pts: sq, op: "open" }], X0: -130, X1: 130, Y0: -130, Y1: 130, depth: 50, dx });
  E.step(S, t, 1e9);
  const { Nx, NXY } = S, val = (x, y, k) => S.phi[k*NXY + Math.round((y + 130)/dx - 0.5)*Nx + Math.round((x + 130)/dx - 0.5)];
  const k = Math.round(20/dx); let r = 0; while (r < 120 && val(r*s2, r*s2, k) <= 0) r += 0.5;
  const under = r - W/2, want = PAL30["100"]*t;
  assert.ok(under > 0.65*want && under < 1.1*want, `lateral undercut at 20 µm depth ${under.toFixed(1)} µm, R(100)·t = ${want.toFixed(1)} µm`);
});
