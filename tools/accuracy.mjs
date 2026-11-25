// Accuracy and speed of the etch engine on cases with a known answer (dev tool: node tools/accuracy.mjs [js|wasm]).
// KOH 30 wt% at 70 °C (Pal & Sato Table 4.1, p. 87). Exact values: floor depth R(100)·t; {111} wall angle 54.74°
// (Pal & Sato p. 31); a vertical {100} wall (window at 45° on (100)) moves sideways at R(100); a <110> Si wall between
// two windows is bounded by {111} planes and loses only R(111)·t per side.
import { engine, PAL30, F100, F110 } from "../tests/load-engine.mjs";
import { fitAngle, bevel } from "../tests/measure.mjs";
const E = engine(process.argv[2] !== "js");
const sq = (cx, cy, w, h) => [[cx-w/2, cy-h/2], [cx+w/2, cy-h/2], [cx+w/2, cy+h/2], [cx-w/2, cy+h/2]];
const ORDER = process.env.ORDER ? Number(process.env.ORDER) : undefined, QUICK = !!process.env.QUICK;
const run = cfg => { if (ORDER) cfg.c.order = ORDER; if (process.env.BAND) cfg.c.band = Number(process.env.BAND); const t0 = performance.now(); const S = E.create(cfg.c); E.step(S, cfg.t, 1e9); return { S, ms: performance.now() - t0 }; };
const out = [];
for (const dx of process.env.WALL || process.env.UND ? [] : QUICK ? [4] : [4, 2]) {   // (100) square pit with <110> edges: floor depth and {111} wall angle
  const t = 60, c = { frame: F100, rates: PAL30, shapes: [{ pts: sq(0, 0, 200, 200), op: "open" }], X0: -160, X1: 160, Y0: -160, Y1: 160, depth: 80, dx };
  const { S, ms } = run({ c, t }), { Nx, Ny, Nz, NXY } = S, phi = S.phi, j = Math.floor(Ny/2), depth = E.stats(S, t).depth;
  const edge = k => { for (let i = Math.floor(Nx/2); i < Nx - 1; i++) { const a = phi[k*NXY + j*Nx + i], b = phi[k*NXY + j*Nx + i + 1]; if (a <= 0 && b > 0) return (i + 0.5 + a/(a - b))*dx + c.X0; } return null; };
  const P = []; for (let k = 1; k < Nz; k++) { const x = edge(k), z = (k + 0.5)*dx; if (x != null && z > 0.2*depth && z < 0.8*depth) P.push([x, z]); }
  const n = P.length, mx = P.reduce((s, p) => s + p[0], 0)/n, mz = P.reduce((s, p) => s + p[1], 0)/n;
  const ang = Math.atan(Math.abs(P.reduce((s, p) => s + (p[0] - mx)*(p[1] - mz), 0)/P.reduce((s, p) => s + (p[0] - mx)**2, 0)))*180/Math.PI;
  out.push([`pit dx ${dx}: depth (µm)`, depth.toFixed(2), (PAL30["100"]*t).toFixed(2), ms]);
  out.push([`pit dx ${dx}: wall angle (°)`, ang.toFixed(2), "54.74", 0]);
}
for (const dx of process.env.UND ? [Number(process.env.UND)] : process.env.WALL ? [] : QUICK ? [2] : [2, 1]) {   // 100 µm window at 45° on (100): vertical {100} walls, lateral undercut at 20 µm depth
  const s2 = Math.SQRT1_2, W = 100, t = 40, L = W/2*Math.SQRT2, c = { frame: F100, rates: PAL30, shapes: [{ pts: [[L, 0], [0, L], [-L, 0], [0, -L]], op: "open" }], X0: -110, X1: 110, Y0: -110, Y1: 110, depth: 40, dx };
  const { S, ms } = run({ c, t }), { Nx, NXY } = S, val = (x, y, k) => S.phi[k*NXY + Math.floor((y + 110)/dx)*Nx + Math.floor((x + 110)/dx)];
  const k = Math.floor(20/dx); let r = 0; while (r < 105 && val(r*s2, r*s2, k) <= 0) r += 0.25;
  out.push([`45° window dx ${dx}: undercut (µm)`, (r - W/2).toFixed(1), (PAL30["100"]*t).toFixed(1), ms]);
}
for (const dx of process.env.WALL ? [Number(process.env.WALL)] : process.env.UND ? [] : QUICK ? [2] : [2, 1]) {   // 10 µm <110> Si wall between two windows, 30 min: wall width at the surface and at 10 µm depth
  const t = 30, c = { frame: F100, rates: PAL30, shapes: [{ pts: sq(-45, 0, 80, 120), op: "open" }, { pts: sq(45, 0, 80, 120), op: "open" }], X0: -100, X1: 100, Y0: -80, Y1: 80, depth: 40, dx };
  const { S, ms } = run({ c, t }), { Nx, Ny, NXY } = S, j = Math.floor(Ny/2);
  const width = k => { let w = 0; for (let i = 0; i < Nx; i++) { const x = (i + 0.5)*dx + c.X0; if (Math.abs(x) < 30 && S.phi[k*NXY + j*Nx + i] > 0) w += dx; } return w; };
  out.push([`10 µm wall dx ${dx}: width at top / 10 µm (µm)`, `${width(0)} / ${width(Math.floor(10/dx))}`, `${(10 - 2*PAL30["111"]*t).toFixed(1)} / ${(10 + 2*10/Math.tan(54.74*Math.PI/180)).toFixed(1)}`, ms]);
}
const NEW = !process.env.WALL && !process.env.UND;
for (const dx of NEW ? (QUICK ? [4] : [4, 2]) : []) {   // groove with <110> edges on (110): shallow {111} walls at 35.26° (Pal & Sato p. 213, Fig. 6.2)
  const t = 30, c = { frame: F110, rates: PAL30, shapes: [{ pts: sq(0, 0, 2000, 200), op: "open" }], X0: -60, X1: 60, Y0: -160, Y1: 160, depth: 60, dx };
  const { S, ms } = run({ c, t }), { Nx, Ny, Nz, NXY } = S, i = Math.floor(Nx/2), depth = E.stats(S, t).depth;
  const edge = k => { for (let j = Math.floor(Ny/2); j < Ny - 1; j++) { const a = S.phi[k*NXY + j*Nx + i], b = S.phi[k*NXY + (j+1)*Nx + i]; if (a <= 0 && b > 0) return (j + 0.5 + a/(a - b))*dx + c.Y0; } return null; };
  const P = []; for (let k = 0; k < Nz; k++) { const y = edge(k), z = (k + 0.5)*dx; if (y != null && z > 0.2*depth && z < 0.8*depth) P.push([y, z]); }
  out.push([`(110) <110> groove dx ${dx}: floor (µm)`, depth.toFixed(2), (PAL30["110"]*t).toFixed(2), ms]);
  out.push([`(110) <110> groove dx ${dx}: wall angle (°)`, fitAngle(P).toFixed(2), "35.26", 0]);
}
for (const dx of NEW ? (QUICK ? [4] : [4, 2]) : []) {   // 320 µm square mesa on (100), 40 min: bevel of the undercut convex corner (Pal & Sato p. 231: 30 ± 1°; Mayer et al. 1990: 30.96°)
  const H = 160, t = 40, c = { frame: F100, rates: PAL30, shapes: [{ pts: sq(0, 0, 4000, 4000), op: "open" }, { pts: sq(0, 0, 2*H, 2*H), op: "mask" }], X0: 0, X1: H + 40, Y0: 0, Y1: H + 40, depth: 50, dx };
  const { S, ms } = run({ c, t }), b = bevel(S, H, dx);
  out.push([`(100) mesa dx ${dx}: corner bevel (°) / l/d`, `${b.alpha.toFixed(1)} / ${(b.l/E.stats(S, t).depth).toFixed(2)}`, "30 ± 1 (map: 25.0)", ms]);
}
console.log(`engine: ${process.argv[2] === "js" ? "JavaScript" : "Rust/WebAssembly"}`);
for (const r of out) console.log(`${r[0].padEnd(44)} ${String(r[1]).padStart(14)}  exact ${String(r[2]).padStart(12)}  ${r[3] ? r[3].toFixed(0) + " ms" : ""}`);
