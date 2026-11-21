// Loads the etch engine (src/engine/etch-engine.js) the way the page does, with or without the WebAssembly kernel.
import { readFileSync, existsSync } from "node:fs";
const src = readFileSync(new URL("../src/engine/etch-engine.js", import.meta.url), "utf8");
const factory = new Function(`${src}\nreturn etchEngineFactory;`)();
export const WASM_PATH = new URL("../engine/etch_core.wasm", import.meta.url);
export const wasmBytes = existsSync(WASM_PATH) ? readFileSync(WASM_PATH) : null;
export function engine(useWasm) {
  const E = factory();
  if (useWasm) { if (!wasmBytes) throw new Error("build the kernel first: npm run build:wasm"); if (!E.wasmInit(wasmBytes)) throw new Error("WebAssembly kernel failed to load"); }
  return E;
}
// test cases (validate-cases.js): KOH 30 wt% at 70 °C, Pal & Sato Table 4.1, p. 87
export const PAL30 = { "100": 0.797, "110": 1.455, "210": 1.561, "211": 1.319, "221": 0.714, "310": 1.456, "311": 1.436, "320": 1.543, "331": 1.160, "530": 1.556, "540": 1.512, "111": 0.005 };
const s2 = Math.SQRT1_2, D = Math.PI/180, a1 = 54.7356*D, a2 = 125.2644*D;
export const F110 = [[-s2, s2, 0], [0, 0, 1], [s2, s2, 0]], F100 = [[-s2, s2, 0], [-s2, -s2, 0], [0, 0, 1]];
const para = (w, h) => { const u = [Math.cos(a1), Math.sin(a1)], v = [Math.cos(a2), Math.sin(a2)]; return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [p*w/2*u[0] + q*h/2*v[0], p*w/2*u[1] + q*h/2*v[1]]); };
const sq = (cx, cy, w, h) => [[cx-w/2, cy-h/2], [cx+w/2, cy-h/2], [cx+w/2, cy+h/2], [cx-w/2, cy+h/2]];
const rot = (P, deg) => P.map(([x, y]) => [x*Math.cos(deg*D) - y*Math.sin(deg*D), x*Math.sin(deg*D) + y*Math.cos(deg*D)]);
export const CASES = [
  ["(110) parallelogram", { frame: F110, rates: PAL30, shapes: [{ pts: para(300, 160), op: "open" }], X0: -260, X1: 260, Y0: -200, Y1: 200, depth: 150, dx: 6 }, 40],
  ["(100) square pit", { frame: F100, rates: PAL30, shapes: [{ pts: sq(0, 0, 200, 200), op: "open" }], X0: -160, X1: 160, Y0: -160, Y1: 160, depth: 80, dx: 4 }, 60],
  ["(100) mesa", { frame: F100, rates: PAL30, shapes: [{ pts: sq(0, 0, 1000, 1000), op: "open" }, { pts: sq(0, 0, 200, 200), op: "mask" }], X0: -180, X1: 180, Y0: -180, Y1: 180, depth: 70, dx: 4 }, 40],
  ["(100) cantilever along <110>", { frame: F100, rates: PAL30, shapes: [{ pts: sq(0, 0, 300, 180), op: "open" }, { pts: sq(-57.5, 0, 185, 50), op: "mask" }], X0: -200, X1: 200, Y0: -130, Y1: 130, depth: 90, dx: 5 }, 60],
  ["(100) square at 45°", { frame: F100, rates: PAL30, shapes: [{ pts: rot(sq(0, 0, 140, 140), 45), op: "open" }], X0: -160, X1: 160, Y0: -160, Y1: 160, depth: 90, dx: 4 }, 60],
];
