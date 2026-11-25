// Checks of the etch-rate model against the sources, without running the level-set simulation
// (dev tool: node tools/source-checks.mjs). Each block prints the model number next to the source number.
// Results and sources are recorded in tools/check-log-2026-11-25.md.
import { readFileSync } from "node:fs";
import { engine, PAL30 } from "../tests/load-engine.mjs";
import { lateralMaxima } from "../tests/measure.mjs";

const E = engine(false);
const db = JSON.parse(readFileSync(new URL("../data/etchants.json", import.meta.url), "utf8"));
const PAL = db.tables["PalSato4.1"].columns;
const KB = 8.617333262e-5, K = c => c + 273.15;
const arr = (Q, T0, T1) => Math.exp(-Q/KB*(1/K(T1) - 1/K(T0)));
const D = Math.PI/180, norm = v => { const n = Math.hypot(...v); return v.map(x => x/n); };
const R = (RT, v) => E.rateC(RT, v[0], v[1], v[2]);
const line = (a, b, c = "") => console.log(`${a.padEnd(58)} ${String(b).padStart(12)}   ${c}`);
const fails = [];
const check = (name, ok) => { if (!ok) fails.push(name); };

// ---- rate map (pass 2): measured points are kept, (100) and (111) are local minima, (110) is not the maximum,
// rate grows linearly with the angle away from (111)
console.log("\nRate map, KOH 30 wt% 70 °C (Pal & Sato Table 4.1, p. 87)");
const RT = E.makeRate(PAL30);
let maxErr = 0;
for (const [k, v] of Object.entries(PAL30)) {
  const o = E.ORIENT[k];
  for (const p of [[0, 1, 2], [2, 0, 1], [1, 2, 0]]) for (const s of [1, -1]) maxErr = Math.max(maxErr, Math.abs(R(RT, [s*o[p[0]], o[p[1]], -o[p[2]]]) - v));
}
line("largest error at the 12 measured orientations (µm/min)", maxErr.toExponential(1), "table lookup, 257 × 257 grid");
check("measured points", maxErr < 2e-3);
let best = { r: 0, n: null };
for (let i = 0; i <= 400; i++) for (let j = 0; j <= i; j++) { const n = [1, i/400, j/400], r = R(RT, n); if (r > best.r) best = { r, n }; }
const idx = best.n.map(x => +(x/best.n[0]).toFixed(3));
line("maximum of the rate map (µm/min) at (1, u, v)", best.r.toFixed(3), `(${idx.join(", ")}); R(110) = ${PAL30["110"]}`);
check("(110) is not the maximum (p. 85)", best.r > PAL30["110"] + 1e-3);
const around = (c, deg) => { let m = Infinity; const a = norm(c); for (let ph = 0; ph < 360; ph += 5) {
  const t = Math.abs(a[2]) < 0.9 ? norm([a[1], -a[0], 0]) : [1, 0, 0], b = [a[1]*t[2] - a[2]*t[1], a[2]*t[0] - a[0]*t[2], a[0]*t[1] - a[1]*t[0]];
  const v = a.map((x, i) => x*Math.cos(deg*D) + (t[i]*Math.cos(ph*D) + b[i]*Math.sin(ph*D))*Math.sin(deg*D)); m = Math.min(m, R(RT, v)); } return m; };
line("(100): smallest rate 3° around / at (100)", `${around([1, 0, 0], 3).toFixed(3)} / ${PAL30["100"]}`, "local minimum (p. 85)");
check("(100) local minimum", around([1, 0, 0], 3) > PAL30["100"]);
const vic = [0.5, 1, 2].map(a => { const t = norm([-1, -1, 2]), a1 = norm([1, 1, 1]); return R(RT, a1.map((x, i) => x*Math.cos(a*D) + t[i]*Math.sin(a*D))); });
line("vicinal (111) toward (112): R at 0.5°, 1°, 2° (µm/min)", vic.map(v => v.toFixed(4)).join(", "), "linear in the off-angle (Pal & Sato p. 104)");
const lin = (vic[2] - PAL30["111"])/(vic[1] - PAL30["111"]);
line("  ratio of the increments 2° / 1°", lin.toFixed(3), "2.000 for a linear cusp");
check("vicinal (111) linear", Math.abs(lin - 2) < 0.05);

// ---- convex-corner bevel predicted by the rate map (pass 4): largest lateral underetch rate on (001)
console.log("\nConvex-corner bevel from the rate map (minimum envelope, Pal & Sato p. 228)");
const col = c => { const lo = c <= 40 ? 30 : 40, u = (c - lo)/10; return Object.fromEntries(Object.keys(PAL[30]).map(k => [k, PAL[lo][k]*(1 - u) + PAL[lo + 10][k]*u])); };
for (const c of [30, 34, 40, 50]) {
  const m = lateralMaxima(E, E.makeRate(col(c)));
  line(`  ${c} wt% KOH, 70 °C: bevel angle to <110> (°)`, m.map(x => x[0].toFixed(1)).join(", "), "measured 30 ± 1° (p. 231, 35 wt%); 30.96° (Mayer et al. 1990)");
}

// ---- temperature (pass 6): Arrhenius with Q(100) = 0.60 eV
console.log("\nTemperature (Arrhenius)");
const f4080 = arr(0.60, 40, 80);
line("R(80 °C)/R(40 °C) with Q = 0.60 eV", f4080.toFixed(1), "about 10 (Pal & Sato p. 90, 40 % KOH)");
for (const [c, q] of [[20, 0.57], [42, 0.59], [57, 0.61]]) line(`  same with Seidel's Q(100) for ${c} % KOH, ${q} eV`, arr(q, 40, 80).toFixed(1), "Seidel et al. 1990, Fig. 12, p. 3618");
line("Q(110) − Q(100), 20 % KOH (eV)", (0.59 - 0.57).toFixed(2), "Seidel et al. 1990, Fig. 17, p. 3620: 0.59 and 0.57 eV");
check("Arrhenius order of magnitude", f4080 > 8 && f4080 < 15);

// ---- concentration (pass 7): table columns against the lecture etchants
console.log("\nConcentration: Table 4.1 (70 °C) interpolated and moved to 75 °C with Q = 0.60 eV, against the lectures");
const at = (c, k) => { const lo = c <= 40 ? 30 : 40, u = (Math.min(50, Math.max(30, c)) - lo)/10; return PAL[lo][k]*(1 - u) + PAL[lo + 10][k]*u; };
const f7075 = arr(0.60, 70, 75);
for (const [k, lec] of [["100", 42], ["110", 66], ["111", 0.5]]) {
  const m = at(42, k)*f7075*60;
  line(`  42 wt%, 75 °C: R(${k}) (µm/h)`, m.toFixed(k === "111" ? 2 : 1), `Lec 4-1 p. 7: ${lec} (model/lecture ${(m/lec).toFixed(2)})`);
}
line("  R(100) at 50 wt% / 30 wt% in Table 4.1", (PAL[50]["100"]/PAL[30]["100"]).toFixed(2), "p. 88 text: (100) almost the same from 17 to 51 wt%");
line("  R(110)/R(100) at 30, 40, 50 wt%", [30, 40, 50].map(c => (PAL[c]["110"]/PAL[c]["100"]).toFixed(2)).join(", "), "falls with concentration (pp. 88–90)");

// ---- mask selectivity (pass 8): SiO₂ moved with its own activation energy
console.log("\nThermal SiO₂ in KOH");
const QSI = 0.60, QOX = 0.85;
const selT = (s0, T0, T1) => s0*arr(QSI, T0, T1)/arr(QOX, T0, T1);
line("selectivity 45 wt% KOH: S(135 °C)/S(110 °C), model", (selT(1, 110, 135)).toFixed(3), `Pal & Sato p. 92: 25/40 = ${(25/40).toFixed(3)}`);
check("selectivity trend 110 → 135 °C", Math.abs(selT(1, 110, 135) - 25/40) < 0.05);
const sLec = 42/0.34;
line("Lec 4-1 p. 7, 42 wt% 75 °C: selectivity 42/0.34", sLec.toFixed(0), "Pal & Sato p. 83: about 150; Seidel p. 3619: 100–200");
line("  moved to 110 °C / 135 °C with Q(Si) 0.60, Q(SiO₂) 0.85 eV", `${selT(sLec, 75, 110).toFixed(0)} / ${selT(sLec, 75, 135).toFixed(0)}`, "Pal & Sato p. 92 (45 wt%): 40 / 25");
line("custom KOH 30 wt% at 90 °C: Si(100) : SiO₂ (from 150 at 70 °C)", selT(150, 70, 90).toFixed(0), "page example, How it works part 5");
const sL57 = 25/0.62;
line("Lec 10 p. 11, 57 wt% 75 °C: selectivity 25/0.62", sL57.toFixed(0), "Seidel Fig. 20: ratio falls above about 35 wt%");

// ---- EDP (pass 10): activation energies of Seidel Fig. 13
console.log("\nEDP type S");
for (const [k, q] of [["100", 0.40], ["110", 0.33], ["111", 0.52]]) line(`  R(${k}) 110 °C → 95 °C with Q = ${q} eV, factor`, arr(q, 110, 95).toFixed(3), "Seidel et al. 1990, Fig. 13, p. 3619");
line("  same with the KOH value 0.60 eV for every plane", arr(0.60, 110, 95).toFixed(3), "old default (assumption)");

console.log(fails.length ? `\nFAILED: ${fails.join("; ")}` : "\nall checks passed");
process.exitCode = fails.length ? 1 : 0;
