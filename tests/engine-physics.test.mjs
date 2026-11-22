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
  // 100 µm window at 45°, 40 min, dx 2 µm: 26.5 µm at 20 µm depth against 31.9 µm (lags by about 2.5 cells at dx 2; README, Known limits)
  const s2 = Math.SQRT1_2, W = 100, sq = [[W/2*Math.SQRT2, 0], [0, W/2*Math.SQRT2], [-W/2*Math.SQRT2, 0], [0, -W/2*Math.SQRT2]], dx = 2, t = 40;
  const S = E.create({ frame: F100, rates: PAL30, shapes: [{ pts: sq, op: "open" }], X0: -130, X1: 130, Y0: -130, Y1: 130, depth: 50, dx });
  E.step(S, t, 1e9);
  const { Nx, NXY } = S, val = (x, y, k) => S.phi[k*NXY + Math.round((y + 130)/dx - 0.5)*Nx + Math.round((x + 130)/dx - 0.5)];
  const k = Math.round(20/dx); let r = 0; while (r < 120 && val(r*s2, r*s2, k) <= 0) r += 0.5;
  const under = r - W/2, want = PAL30["100"]*t;
  assert.ok(under > 0.75*want && under < 1.1*want, `lateral undercut at 20 µm depth ${under.toFixed(1)} µm, R(100)·t = ${want.toFixed(1)} µm`);
});

test("(100) square pit: the {111} side walls stand at 54.74° within 1° (dx 4 µm)", () => {
  // fit of the wall position against depth along y = 0, between 20 % and 80 % of the depth (README: 54.73° at dx 4, 54.69° at dx 2)
  const [, cfg, t] = CASES[1], S = E.create(cfg); E.step(S, t, 1e9);
  const { Nx, Ny, Nz, dx, NXY } = S, phi = S.phi, j = Math.floor(Ny/2);
  const edge = k => { for (let i = Math.floor(Nx/2); i < Nx - 1; i++) { const a = phi[k*NXY + j*Nx + i], b = phi[k*NXY + j*Nx + i + 1]; if (a <= 0 && b > 0) return (i + 0.5 + a/(a - b))*dx + cfg.X0; } return null; };
  const depth = E.stats(S, t).depth, P = [];
  for (let k = 1; k < Nz; k++) { const x = edge(k), z = (k + 0.5)*dx; if (x != null && z > 0.2*depth && z < 0.8*depth) P.push([x, z]); }
  const n = P.length, mx = P.reduce((s, p) => s + p[0], 0)/n, mz = P.reduce((s, p) => s + p[1], 0)/n;
  const sxz = P.reduce((s, p) => s + (p[0] - mx)*(p[1] - mz), 0), sxx = P.reduce((s, p) => s + (p[0] - mx)**2, 0);
  const ang = Math.atan(Math.abs(sxz/sxx))*180/Math.PI;
  assert.ok(n >= 5 && Math.abs(ang - 54.74) < 0.5, `wall angle ${ang.toFixed(2)}° from ${n} points`);
});

test("a 10 µm <110> Si wall between two windows keeps its {111} sides (dx 2 µm, 30 min)", () => {
  // width at depth z: 10 + 2z/tan 54.74° (only R(111)·t = 0.15 µm lost per side); before the Nov 2026 engine update the
  // re-initialisation moved the front and thinned such walls by several µm (tools/check-log-2026-11-22.md)
  const sq = (cx, cy, w, h) => [[cx-w/2, cy-h/2], [cx+w/2, cy-h/2], [cx+w/2, cy+h/2], [cx-w/2, cy+h/2]], dx = 2, t = 30;
  const S = E.create({ frame: F100, rates: PAL30, shapes: [{ pts: sq(-45, 0, 80, 120), op: "open" }, { pts: sq(45, 0, 80, 120), op: "open" }], X0: -100, X1: 100, Y0: -80, Y1: 80, depth: 40, dx });
  E.step(S, t, 1e9);
  const { Nx, Ny, NXY } = S, j = Math.floor(Ny/2), half = Math.floor(Nx/2);
  const width = z => {   // sub-cell position of the left wall face at depth z, doubled (the case is symmetric)
    const k = Math.floor(z/dx);
    for (let i = half; i > 0; i--) { const a = S.phi[k*NXY + j*Nx + i], b = S.phi[k*NXY + j*Nx + i - 1]; if (a > 0 && b <= 0) return 2*((half - i) - a/(a - b))*dx; }
    return 0;
  };
  for (const z of [5, 10]) { const w = width(z), want = 10 + 2*z/Math.tan(54.74*Math.PI/180); assert.ok(Math.abs(w - want) <= 1.5*dx, `wall width at ${z} µm depth ${w.toFixed(1)} µm, expected ${want.toFixed(1)}`); }
});
