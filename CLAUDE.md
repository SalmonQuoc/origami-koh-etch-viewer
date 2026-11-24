# Notes for working on this repository with Claude Code

Read `CONTRIBUTING.md` (commands, content rules) and `docs/ARCHITECTURE.md` (modules, engine) first; this file only adds what is easy to get wrong.

## What it is

One self-contained HTML page (`index.html`) for students of silicon bulk micromachining: the {111} octahedron on (100), (110) and (111) wafers, an analytic etched pit, a 3D level-set KOH/EDP etch simulator (Rust/WebAssembly kernel with a bit-identical JavaScript reference), a corner-compensation lab and a wafer-orientation finder. Live at https://salmonquoc.github.io/origami-koh-etch-viewer/ (GitHub Pages, deployed by the `pages` job after CI passes on `main`).

## Build and check

- `index.html` is generated. Edit `src/`, `data/` or `engine/`, then `node build.mjs` (page only) or `npm run build` (Rust kernel too). Commit `index.html` with the source; CI fails if it is stale.
- Before a commit: `npx tsc -p tsconfig.json`, `node build.mjs`, `npm test`, `npm run test:browser`.
- Browser test with a Chromium that is not Playwright's own: set `CHROMIUM_PATH` to its executable.
- Ad-hoc Playwright scripts must sit inside the repository (module resolution); delete them before committing.

## Traps

- `src/app/NN-*.ts` are concatenated into one script scope in file order. Function declarations are hoisted, but a `const`/`let` read by an earlier module before its own module has run throws "Cannot access ... before initialization". Use `var` (and a null guard) for state that earlier modules touch, e.g. `var SHOW`, `var SL`.
- Engine: `src/engine/etch-engine.js` and `engine/src/sim.rs` must stay bit-identical (`tests/engine-parity.test.mjs`). Change both, rebuild the wasm, commit `engine/etch_core.wasm`.
- Accuracy checks: `node tools/accuracy.mjs` (env `QUICK`, `ORDER`, `BAND`, `WALL`, `UND`); record before/after numbers in a `tools/check-log-YYYY-MM-DD.md`.
- The panels hold no show/colour options: the 👁 Show tab (module 22) drives hidden controls in `#ctlStore` at the end of `src/index.html`. Keep those elements when editing; their change handlers do the work.
- Section line A -> B (module 23): `SIM.cutLine` / `S.pitLine` in µm; `null` falls back to a line through the centre.

## Content rules (from the author)

- Every number on the page names its source (book or lecture, page); anything else is marked as an assumption.
- Explanations teach (idea, equation, worked number, where to see it on the page); they are collapsible and closed by default.
- Do not put the author's e-mail address on the page; contact is through GitHub issues.
