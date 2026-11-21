// Builds the single-file page index.html from src/:
//   src/index.html            page markup and styles, with an <!-- @scripts --> placeholder
//   src/core/geometry.ts      analytic {111} plane model (global Core)
//   src/engine/etch-engine.js level-set engine (JavaScript reference; also runs in a worker via toString())
//   engine/ (Rust)            time-step kernel, compiled to WebAssembly and inlined as base64
//   src/app/NN-*.ts           user interface, concatenated in file order inside one function scope
//   data/*.json               etchants and examples (checked by tools/validate-data.mjs), inlined as JSON
// Usage: npm run build (compiles the Rust kernel first) or node build.mjs (uses the last compiled kernel).
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { transformSync } from "esbuild";
import { validateAll } from "./tools/validate-data.mjs";

const read = f => readFileSync(new URL(f, import.meta.url), "utf8");
const ts = (code, file) => transformSync(code, { loader: "ts", target: "es2020", sourcefile: file, legalComments: "inline" }).code;
const WASM = new URL("engine/etch_core.wasm", import.meta.url)   // compiled kernel, committed (npm run build:wasm refreshes it);

const { data, problems } = validateAll();
if (problems.length) { console.error(problems.map(p => "✗ " + p).join("\n")); process.exit(1); }
const dataTags = Object.entries(data).map(([name, obj]) => `<script type="application/json" id="db-${name}">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>\n`).join("");

const page = read("src/index.html");
if (!page.includes("<!-- @scripts -->")) throw new Error("src/index.html has no <!-- @scripts --> placeholder");

const core = ts(read("src/core/geometry.ts"), "geometry.ts");
const engine = read("src/engine/etch-engine.js");
const appDir = new URL("src/app/", import.meta.url);
const files = readdirSync(appDir).filter(f => /^\d\d-.*\.ts$/.test(f)).sort();
const app = files.map(f => `// ---- src/app/${f}\n` + ts(readFileSync(new URL(f, appDir), "utf8"), f)).join("\n");

let wasmTag = "";
if (existsSync(WASM)) {
  const bytes = readFileSync(WASM);
  const sha = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  wasmTag = `<script type="application/octet-stream" id="etchWasm" data-sha256="${sha}" data-bytes="${bytes.length}">${bytes.toString("base64")}</script>\n`;
  console.log(`WebAssembly kernel: ${bytes.length} bytes, sha256 ${sha}`);
} else console.warn("No engine/etch_core.wasm (run npm run build:wasm): the page will use the JavaScript engine only.");

const guard = s => { if (/<\/script/i.test(s)) throw new Error("a script contains </script"); return s; };
const scripts = dataTags + wasmTag
  + `<script>\n${guard(core)}</script>\n`
  + `<script>\n${guard(engine)}</script>\n`
  + `<script>\n(() => {\n${guard(app)}\n})();\n</script>`;
const out = page.replace("<!-- @scripts -->", () => scripts);
writeFileSync(new URL("index.html", import.meta.url), out);
console.log(`index.html: ${(out.length/1024).toFixed(0)} kB from ${files.length} UI modules`);
