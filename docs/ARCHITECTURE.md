# How the viewer is built

The page people open is one file, `index.html`, so it can be hosted anywhere (GitHub Pages, the claude.ai artifact, a USB stick). It is **generated**. Edit the files under `src/`, `data/` and `engine/`, then run `npm run build`.

```
data/                     etch rates and examples (JSON): see docs/DATA.md
  etchants.json             rate tables and etchants (Pal & Sato Table 4.1, Lec 4-1, Lec 10, EDP)
  sim-examples.json         the Etch simulator examples, per wafer
  pit-examples.json         the Etched pit examples, per wafer
engine/                   Rust crate etch-core: the level-set time step, compiled to WebAssembly
  src/sim.rs                time step, narrow band, fast-marching re-initialisation (+ a unit test)
  src/lib.rs                C-style interface used by the JavaScript engine (sim_new, sim_step, ...)
  examples/bench.rs         native timing on a state dumped from the page set-up (development only)
src/
  index.html                page markup and styles, with an <!-- @scripts --> placeholder
  core/geometry.ts          analytic {111}-plane model used by Model on wafer, Etched pit and Find orientation
  engine/etch-engine.js     the etch engine: grid set-up, JavaScript time step (reference and fallback), mesh,
                            sections, statistics, worker message handler; loads the Rust kernel when it can
  app/00-data.ts ... 25-save-export.ts  the user interface, one file per part (see below)
  types/*.d.ts              shared types: page state objects, globals from the other scripts
tools/validate-data.mjs   checks data/*.json (run by the build and the tests)
build.mjs                 makes index.html
tests/                    node tests (engine parity, physics checks, data) and tests/browser (Chromium);
                            tests/measure.mjs: wall-angle, corner-bevel and lateral-rate measurements shared with tools/
tools/accuracy.mjs        engine against cases with a known answer; tools/source-checks.mjs: rate model against the sources;
                            tools/undercut-lag.mjs: {100} undercut lag; tools/check-log-*.md: results of each check
.github/workflows/        ci.yml: all checks on every push, then publishes index.html to Pages on main; pages.yml: publish by hand
```

## Build

`npm run build` = `cargo build --target wasm32-unknown-unknown --release` in `engine/`, then `node build.mjs`, which:

1. validates `data/*.json` and stops on any problem;
2. inlines each data file as `<script type="application/json" id="db-NAME">`;
3. inlines the WebAssembly kernel as base64 in `<script type="application/octet-stream" id="etchWasm">` (with its size and SHA-256);
4. inlines `src/core/geometry.ts` and `src/engine/etch-engine.js` as two scripts;
5. strips the types from `src/app/*.ts` (esbuild), joins the files in name order and wraps them in one function scope, so the modules share their top-level names as before the split;
6. writes `index.html`.

`npm run typecheck` runs the TypeScript compiler over `src/app`, `src/core` and `src/types`. Because the UI files share one scope, the compiler sees them together and reports any name that is used but defined nowhere.

## The etch engine

`etchEngineFactory()` in `src/engine/etch-engine.js` is serialised with `toString()` into a Web Worker, together with the kernel bytes. In the worker:

- `create(cfg)` builds the grid in JavaScript: mask distance field (supersampled exact distance transform), initial level set, rate table over the standard triangle, dissipation coefficients and time step.
- If the WebAssembly kernel loaded, `create` copies these arrays into it (`sim_new`, `sim_*_ptr`, `sim_init`) and `step` calls `sim_step`; `phi`, `T` (arrival time) and `Hr` are read in place from WebAssembly memory by the mesh, section and statistics code.
- If WebAssembly is not allowed or fails, or **Settings → etch engine** is set to JavaScript, the same steps run in JavaScript.

The two time steps are the same algorithm with the same arithmetic (f64, stored as f32), so they give bit-identical fields: `tests/engine-parity.test.mjs` checks this on five cases. If you change the scheme, change both `engine/src/sim.rs` and the JavaScript `step`, `rebuild` and `makeReinit`, and keep that test passing.

## User-interface modules (`src/app`)

| File | Contents |
|---|---|
| `00-data.ts` | loaders for the data files (typed) |
| `01-settings-helpers.ts` | user settings, etchant tables for the pit, pit examples, colour map, graphs |
| `02-renderer-labels.ts` | three.js renderer, camera and views, overlay labels |
| `03-geometry-wafer.ts` | 3D builders, the whole 100 mm wafer, in-plane directions, compass |
| `04-state-model.ts` | page state `S` and the Model on wafer scene |
| `05-pit-scene.ts` | Etched pit scene (analytic cavity, mask film, readouts) |
| `06-picking-ui.ts` | hover and picking, toolbar and panel wiring, whole-wafer controls |
| `07-pit-editor.ts` | pit mask editor, simulator frames, rate tables, shape types |
| `08-shapes-presets.ts` | polygon tools (drawn outlines, convex split), shape geometry, simulator examples, state `SIM` |
| `09-sim-worker-scene.ts` | worker start-up, run configuration, 3D scene, section, simulator mask editor |
| `10-corner-lab.ts` | Corner lab |
| `11-find-orientation.ts` | Find orientation |
| `12-layout-views.ts` | theater, split view, full screen |
| `13-draw-tool.ts` | freehand drawing in the mask editors |
| `14-enlarge-settings.ts` | enlarged windows, Settings dialog and layouts, the ⓘ Explanations switch |
| `15-custom-etchants.ts` | custom etchants (Arrhenius, concentration, own rates) and file saving |
| `16-guidance.ts` | scene tips, Quick start dialog, Run button on the stage |
| `17-user-presets.ts` | the user's own presets (save, load, export, import) |
| `18-startup.ts` | start-up and the `window.__o3d` handle used by the browser tests |
| `19-coordinates.ts` | coordinates in the 2D editors (axes, ticks, cursor position, selected centre), dragging the section line, zoom and pan in the 2D editors |
| `20-sections.ts` | collapsible panel sections (wraps the panel markup that the earlier modules have filled) |
| `21-stage-tools.ts` | tools on the 3D view: zoom buttons, axis gizmo, scale bar, measuring tool; drawn after each render (`stageOverlay`) |
| `22-show-tab.ts` | the 👁 Show tab on the 3D view (key V): every visibility and colour option of the scene; each entry sets the panel or Settings control it stands for |
| `23-section-line.ts` | section line A → B in the 2D editors: drag its ends or the line, draw a new one, type its ends |
| `24-mask-designer.ts` | full-screen mask designer: vector tools, snapping (grid, shape points, crystal directions), typed coordinates, undo, DXF/SVG import and export (`maskSVG`, `maskDXF`, shared with module 25) |
| `25-save-export.ts` | 💾 Save dialog: project file with chosen parts (save and open), export bundle (SVG, DXF, PNG, STL; .zip) |

## Browser storage

Settings (`o3d-settings`), custom etchants (`o3d-etchants`), presets (`o3d-presets`), hidden tips (`o3d-tips-hidden`) and the split width (`o3d-splitW`) live in the visitor's browser only. Exports are JSON files (and, from 💾 Save, SVG, DXF, PNG, STL or a .zip of them); on claude.ai they go through the viewer's save prompt (the `downloads` capability).
