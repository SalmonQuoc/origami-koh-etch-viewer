# Development history: Origami KOH etch viewer

State on 2026-11-24: repository commit 3b036a8, site version 2.0 (package.json), Claude artifact version 24. Upload this file to the new project's knowledge and update it at the end of each working session.

## 1. Timeline (git log of github.com/SalmonQuoc/origami-koh-etch-viewer)

| Date | Commit | Change |
|---|---|---|
| 2026-10-22 | 620f993 | First viewer: {111} octahedron on (100)/(110)/(111) wafers, KOH etch simulator (3D level set) |
| 2026-10-23 | be1fd8f, 5eea580, 411d1f2 | Author note, references (incl. Paul et al., EDKCON 2024), theater view, colour by depth/rate/time, history graphs, more shapes; pit with L/U/cross/frame/ring/star openings (convex split); 2D mask editor |
| 2026-11-20 | 13f7589 … 1a3c202 | Whole 100 mm wafer with flats, flat error input, crystal-direction edges, EDP etchants, Corner lab, Find orientation; split view; flat arrows (outward perpendicular, per the author); About section |
| 2026-11-21 | 3f888ad … 8ad1c7b | Freehand drawing, duplicate, enlarge, Settings, layouts, custom etchants (Arrhenius), user presets, export through the claude.ai save prompt |
| 2026-11-21 | 6191c69 | **Version 2.0**: Rust/WebAssembly etch kernel + JavaScript reference, TypeScript UI modules, data files, tests, CI |
| 2026-11-21 | d71c1c9 … a2e3c04 | Coordinates in editors; CI fixes (ubuntu-24.04, Node 24 actions); How it works section; GitHub Pages; 2D zoom/pan; collapsible sections; mask film at true thickness |
| 2026-11-22 | 8550231 … 663a3a3 | 3D zoom, axis gizmo (Miller axes), scale bar, measuring; finer simulator grids |
| 2026-11-22 | ea6ce90, 837ca88 | Larger gizmo, flat-arrow toggles; 👁 Show tab (key V) with every visibility/colour option |
| 2026-11-22 | eb5e475 | Engine accuracy: ENO2 + Heun, re-initialisation keeps the front, band-leak fix (numbers in section 3) |
| 2026-11-22 | ffc6d8a | Free section line A → B in pit, simulator, corner lab (drag, draw with L, type); pit cross-section; show/colour options only in the Show tab; Whole wafer as its own section |
| 2026-11-24 | 3b036a8 | CLAUDE.md for further development |

## 2. Decisions made by the author (keep them)

- The page is a study aid for students; explanations teach and are closed by default; ⓘ Explanations switch (key I) hides source notes until wanted.
- Perpendicular flat arrow points outward (away from the wafer centre); both flat arrows can be hidden.
- All show/hide and colour options live in the 👁 Show tab, not in the panels.
- Rust/WebAssembly engine with TypeScript UI, still built into one HTML file, same look.
- The page does not show the author's e-mail address; contact through GitHub issues. The repository has no licence yet.
- No AI-usage statement is needed in coursework; the page itself has an author note on AI assistance.

## 3. Accuracy status (tools/check-log-2026-11-22.md)

| Check (KOH 30 wt%, 70 °C) | Before eb5e475 | After | Target and source |
|---|---|---|---|
| {111} wall angle, 4 µm grid | 54.24° | 54.73° | 54.74° (Pal & Sato p. 31) |
| {111} wall angle, 2 µm grid | 54.79° | 54.69° | 54.74° |
| Depth of 200 µm window, 60 min, 4 µm grid | 47.85 µm | 47.32 µm | 47.82 µm (0.797 µm/min, Table 4.1 p. 87) |
| 45° {100} undercut, 40 min, 2 µm grid | 23.8 µm | 26.5 µm | 31.9 µm |
| 45° {100} undercut, 1 µm grid | 28.0 µm | 29.3 µm | 31.9 µm |

Engine speed after eb5e475: 1.2 to 2.6 times faster.

## 4. Known limits and open questions

- {100} vertical undercut under the mask is still about 8 % short at a 1 µm grid; depth trails by about 0.1 grid cell.
- Silicon walls narrower than about 8 grid cells thin slowly (numerical); use finer grids.
- Finder cavities are overlaid, not merged; EDP off-axis rates are interpolated (assumption).
- Same activation energy for all planes in custom etchants (assumption; Pal & Sato p. 90 gives Q(100) = 0.60 eV).
- Source inconsistencies shown on the page: Lec 10 p. 11 vs p. 16 EDP ordering; Lec 10 p. 25 angle (35 µm at R 48.9 mm gives 0.041°, not 0.06°); Lec 4-1 p. 6 labels the (111) wafer flat ⟨111⟩ (impossible), p. 11 labels the (110) flat ⟨111⟩ (a different convention from p. 6).
- Draft-resolution meshes show some colour speckle at the domain edges (pre-existing, cosmetic).

## 5. Ideas not yet done

- Licence for the repository (author's choice).
- Close the remaining {100} undercut gap (mask-edge boundary treatment).
- Merge finder cavities; more etchants (TMAH) with sourced rate tables.
