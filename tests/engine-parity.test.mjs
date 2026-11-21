// The Rust/WebAssembly kernel must reproduce the JavaScript engine: same fields to rounding, same statistics.
import test from "node:test";
import assert from "node:assert/strict";
import { engine, CASES, wasmBytes } from "./load-engine.mjs";

const run = (E, cfg, t) => { const t0 = performance.now(); const S = E.create(structuredClone(cfg)); E.step(S, t, 1e9); const ms = performance.now() - t0; return { S, ms, st: E.stats(S, t) }; };

for (const [name, cfg, t] of CASES) {
  test(`parity: ${name}`, { skip: !wasmBytes && "kernel not built" }, () => {
    const A = run(engine(false), cfg, t), B = run(engine(true), cfg, t);
    assert.equal(B.S.wasm > 0, true, "the WebAssembly kernel was used");
    assert.equal(A.S.steps, B.S.steps, "same number of time steps");
    let dphi = 0, dT = 0, nT = 0;
    for (let q = 0; q < A.S.NN; q++) {
      dphi = Math.max(dphi, Math.abs(A.S.phi[q] - B.S.phi[q]));
      const a = A.S.T[q], b = B.S.T[q];
      if ((a === Infinity) !== (b === Infinity)) nT++; else if (a !== Infinity) dT = Math.max(dT, Math.abs(a - b));
    }
    const tol = 1e-3*cfg.dx;
    assert.ok(dphi <= tol, `max |phi difference| ${dphi} µm > ${tol}`);
    assert.ok(nT <= Math.ceil(1e-4*A.S.NN), `${nT} nodes etched in one engine only`);
    assert.ok(dT <= 1e-3*t, `max arrival-time difference ${dT} min`);
    for (const k of ["depth", "under", "susp", "through"]) assert.ok(Math.abs(A.st[k] - B.st[k]) <= Math.max(1e-6, 1e-3*Math.abs(A.st[k]) + 0.01*cfg.dx), `${k}: ${A.st[k]} vs ${B.st[k]}`);
    console.log(`  ${name}: ${A.S.steps} steps, JavaScript ${A.ms.toFixed(0)} ms, Rust/WebAssembly ${B.ms.toFixed(0)} ms (×${(A.ms/B.ms).toFixed(1)}); max |Δphi| ${dphi.toExponential(1)} µm, max |ΔT| ${dT.toExponential(1)} min`);
  });
}
