# Working on the viewer

## Set up once

- Node.js 22 and npm
- Rust with the WebAssembly target: `rustup target add wasm32-unknown-unknown`
- `npm install` (esbuild, TypeScript, Playwright); for the browser test also `npx playwright install chromium`

## Everyday commands

| Command | What it does |
|---|---|
| `npm run build` | compiles the Rust kernel and writes `index.html` from `src/`, `data/` and `engine/` |
| `npm run build:page` | rewrites `index.html` without recompiling Rust |
| `npm run validate` | checks `data/*.json` |
| `npm run typecheck` | TypeScript check of the user interface |
| `npm test` | engine parity (Rust = JavaScript), physics checks, data checks |
| `npm run test:browser` | opens the built page in Chromium and clicks through the main functions |
| `npm run check` | all of the above |

Commit `index.html` together with the source change: GitHub Pages serves that file, and CI fails if it is out of date.

## Rules for content

- Every number shown on the page names its source (book or lecture, page). Anything that is not from a source is marked as an assumption. Source notes under the controls use `class="note src"` and per-setting help uses `class="xinfo"`: both are hidden until the reader turns on ⓘ Explanations, so put nothing there that is needed to use the page.
- Longer explanations go in the How it works section (`<section id="learn">` in `src/index.html`), one `<details class="learn">` per topic, closed by default.
- Data goes in `data/` (see `docs/DATA.md`), not in the code.
- If you change the etch scheme, change the Rust kernel and the JavaScript reference together and keep `tests/engine-parity.test.mjs` passing (see `docs/ARCHITECTURE.md`).

## Reporting an error

Open an issue with the scene, the settings (or an exported preset) and the source you compared with.
