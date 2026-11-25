// Sideways undercut of the vertical {100} walls of a 100 µm window turned 45° on (100), KOH 30 wt% at 70 °C, measured
// with a sub-cell zero crossing of φ along the window diagonal at several depths (dev tool).
// Usage: DX=2 T=40 Z=3,5,10,20 node tools/undercut-lag.mjs   (exact: R(100)·t, Pal & Sato Table 4.1, p. 87)
import { engine, PAL30, F100 } from "../tests/load-engine.mjs";
const E = engine(process.argv[2] !== "js");
const s2 = Math.SQRT1_2, W = 100, t = Number(process.env.T || 40), dx = Number(process.env.DX || 2), L = W/2*Math.SQRT2;
const c = { frame: F100, rates: PAL30, shapes: [{ pts: [[L, 0], [0, L], [-L, 0], [0, -L]], op: "open" }], X0: -110, X1: 110, Y0: -110, Y1: 110, depth: 40, dx };
const t0 = performance.now(), S = E.create(c); E.step(S, t, 1e9);
const { Nx, NXY } = S;
const ph = (x, y, k) => { const fx = (x + 110)/dx - 0.5, fy = (y + 110)/dx - 0.5, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, q = k*NXY + j*Nx + i;
  return (S.phi[q]*(1-u) + S.phi[q+1]*u)*(1-v) + (S.phi[q+Nx]*(1-u) + S.phi[q+Nx+1]*u)*v; };
const out = [];
for (const z of (process.env.Z || "3,5,10,20").split(",").map(Number)) {
  const k = Math.round(z/dx - 0.5); let r = W/2 - 5;
  while (r < 100 && ph(r*s2, r*s2, k) <= 0) r += 0.05;
  const a = ph((r - 0.05)*s2, (r - 0.05)*s2, k), b = ph(r*s2, r*s2, k); r = r - 0.05 + 0.05*(-a)/(b - a);
  out.push(`${((k + 0.5)*dx).toFixed(0)} µm: ${(r - W/2).toFixed(2)}`);
}
console.log(`dx ${dx}, ${t} min: undercut at depth ${out.join(", ")} (exact ${(PAL30["100"]*t).toFixed(2)} µm); floor ${E.stats(S, t).depth.toFixed(2)} µm; ${(performance.now() - t0).toFixed(0)} ms`);
