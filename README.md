# Origami 3D viewer: KOH and EDP etching of silicon

**Open it:** https://salmonquoc.github.io/origami-koh-etch-viewer/

[![CI](https://github.com/SalmonQuoc/origami-koh-etch-viewer/actions/workflows/ci.yml/badge.svg)](https://github.com/SalmonQuoc/origami-koh-etch-viewer/actions/workflows/ci.yml)

An interactive 3D page for anisotropic wet etching of single-crystal silicon. It was made as a study aid for ESS5850 Micro System Design and ESS 5810 Advanced Micro System Fabrication and Lab (Prof. Fan-Gang Tseng, National Tsing Hua University, fall 2026). It is not official course material: every number names its source, so check it against your own lecture notes.

It has five scenes:

- **Model on wafer**: the HW2 {111} octahedron held over a (100), (110) or (111) wafer. Click a face to see its trace on the surface and its angle to the surface.
- **Etched pit**: the cavity under a mask opening, built as an intersection of moving crystal planes (n·x ≤ h + R·t over the {100}, {110} and {111} planes). It has a 2D mask editor like the simulator's: add shapes, drag them, double-click to add one at a spot, use the arrow keys to nudge, press Delete to remove, and edit sizes, angle and pre-etch in the list; editing an example turns it into your own mask. A non-convex opening is split into overlapping convex pieces; each piece etches on its own and the cavity drawn is their union, so concave corners stop at {111}. Convex mask corners are not undercut in this scene (they are in real KOH etching; Kovacs et al. 1998, Fig. 1(c); Pal et al. 2007, Sec. 2), so "Open this mask in the etch simulator" runs the same mask in the level-set model.
- **Etch simulator**: a 3D level-set simulation of KOH or EDP etching for any mask drawn in the mask editor. It includes 20 examples: cantilevers and bridges released by undercut, mesa corner attack with three compensation types, windows of different sizes and shapes that merge, (110) vertical walls and trenches, (111) pre-etched holes, and four (100) masks at 45° to the flat after Paul et al. (2024).
- **Corner lab**: two mesas whose convex corners face each other, etched in the level-set model, with no compensation, a square (a = H), a ⟨110⟩ beam or a ⟨100⟩ beam (Lec 10 pp. 14–16; Pal & Sato pp. 235–249; Pal et al. 2007). The readout gives the time to reach the target depth H, the unprotected undercut U/H and how much of the compensated corner is eaten; the graph follows the top corner of each mesa.
- **Find orientation**: the wafer flat is only good to 2–5° (Lec 10 p. 18), so this scene puts alignment structures on a whole 100 mm wafer turned by a flat error δ (set or random and hidden): a fan of long slots at stepped angles (Lec 10 p. 18) and circles on an arc (Ensell on (100), Tseng and Chang on (110); Lec 10 pp. 18, 25–26; Pal & Sato Ch. 7). It reads δ from the etched structures, applies the correction to the device layout and shows the error left on a device. A random-wafer test runs 500 wafers with δ uniform in ±5°. Structures can be added, moved (drag, double-click, arrow keys) and sent to the Etched pit or the simulator.

Other functions:

- **Whole wafer** (pit and simulator): draws the 100 mm wafer with its primary flat (32.5 mm) and, for the chosen doping type, its secondary flat (18 mm) after Lec 10 p. 10 and the Topline drawing; the die can be placed anywhere on the wafer and the view can jump between wafer and die.
- **Flat error** (pit and simulator): turns the crystal by δ under the mask, as when the mask is aligned to an imperfect flat.
- **Edges along a crystal direction** (Lec 10 p. 22): each shape card has an "edges along" list of in-plane directions of the wafer surface (with the {111} traces and their wall angles marked), and a compass in the 2D editors shows them. A parallelogram can have both sides set, for example the two {111} traces of a (110) wafer.
- **Etchants**: KOH 30, 40, 50 wt% (Pal & Sato Table 4.1), KOH 42 wt% (Lec 4-1 p. 7), KOH 57 wt% (Lec 10 p. 11), EDP Type S (Lec 10 p. 11) and EDP "F&K" 50:30:3 (Finne & Klein 1967, scaled to Lec 10 p. 11).
- **Mask film**: drawn in its own colour as an opaque layer with exaggerated thickness, so it reads apart from the silicon and shows the overhang where the silicon is undercut.
- **Shapes**: rectangle, circle, ellipse, triangle, regular polygon, L, U, cross, frame, ring and star, each as opening or mask, with rotation and an nx × ny array at a set pitch.
- **Colour scales**: colour the etched surface by crystal plane, depth, local etch rate R(n) or arrival time, with a colour bar.
- **Graphs**: depth, undercut and released mask area against etch time (simulator), and depth and outline size against time (pit).
- **Split view** (key S): the 3D view and the controls sit side by side and scroll separately, under a toolbar that stays at the top. Drag the divider to resize the panes (arrow keys also work when it has focus); double-click it to reset. **Swap sides** moves the controls to the left. The page remembers these settings. Split view is off below 900 px width.
- **Theater view** (key T) widens the 3D view; **Full screen** fills the screen.
- **Drawing and editing masks**: ✎ Draw places corners by clicking or follows a free drag stroke; a drawn outline is etched exactly in the simulator and split into convex pieces in the Etched pit. Shapes can be duplicated (⧉ button, Ctrl+D, Alt-drag). Every editor and graph panel has ⤢ Enlarge.
- **How it works** (section below the page): study notes on the chemistry of KOH etching, why the rate depends on the crystal plane, temperature (Arrhenius) and concentration, mask selectivity, the 54.74° walls and corners, the rate map, the pit model and the level-set simulation, each with a number to check and a pointer to the scene, plus four questions with hidden answers. Every part is closed until opened.
- **Explanations** (ⓘ in the toolbar, key I, or Settings): shows the source notes under the controls and a short explanation of each custom-etchant setting. Off at first.
- **Coordinates** in the 2D editors (pit, simulator, finder map): x and y axes through the die centre (the wafer centre on the finder map) with tick labels in µm (mm on the finder map), a grid, the cursor position at the top left (snapped to the snap step), and the centre of the selected shape. x runs along the primary flat, y away from it, as in the shape list. In the simulator the section line carries its position, can be dragged in the editor or typed in µm, and the cursor position is marked on the cross-section. Can be turned off in Settings.
- **Zoom and pan** in the 2D editors (pit, simulator, finder map): the − / + / fit buttons above each editor, Ctrl + scroll or a pinch at the cursor, the keys + − 0 with the editor focused, and Space + drag or middle-drag to pan. Up to 40× in the pit and the simulator and 400× on the finder map, so single test structures on the 100 mm wafer can be placed and read.
- **Collapsible sections**: each heading in the right-hand panels and in the graph panels under the 3D view opens or closes its section. On load only the first section of each panel is open; the 3D view is never folded. “open all” and “close all” sit at the top of each panel.
- **Settings** (⚙): page layout (standard, split, split with controls left, theater, one column), panel width, 3D view height, theme, label size, camera animation, render quality, snap step, coordinates, simulator resolution, automatic re-run and etch engine. Kept in the browser.
- **Custom etchants**: a listed etchant at another temperature (R = R₀ exp(−Q/kT), Q(100) ≈ 0.60 eV for 40 % KOH, Pal & Sato p. 90; the same Q for the other planes and for EDP is an assumption) or another KOH concentration (linear between the 30, 40 and 50 wt% columns of Table 4.1, assumption), or your own measured rates. Export and import as JSON.
- **Your own presets**: ☆ Save as my preset keeps a pit or simulator mask with its process (and its custom etchant); export and import as JSON.
- **Guidance**: numbered steps in each panel, a tip per scene, a Quick start with all mouse and key controls (? key), and a Run button on the 3D view when the mask or process has changed.
- **Flat arrows**: the die view has one arrow along the flat and one perpendicular to it pointing outward, away from the centre (the outward flat normal), each labelled with its crystal direction. Every scene that shows a wafer (Model on wafer, the whole-wafer views and the finder map) has the outward arrow from the middle of the primary flat.

## Run it

Open https://salmonquoc.github.io/origami-koh-etch-viewer/ (GitHub Pages, published from `index.html` on `main` after the checks pass), or download `index.html` and open it in a browser. The page loads three.js r128 from cdnjs and jsDelivr; everything else, including the WebAssembly kernel and the data, is inside the file.

To change the page, edit `src/`, `data/` or `engine/` and run `npm run build` (see [CONTRIBUTING.md](CONTRIBUTING.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DATA.md](docs/DATA.md)).

## Author

Huu Quoc Anh Nguyen (Student ID X1150030), undergraduate exchange student from the University of Science and Technology of Hanoi (USTH), Vietnam, at the Department of Engineering and System Science (ESS), National Tsing Hua University (NTHU), Taiwan, in fall 2026. Background: semiconductor device physics and materials; interested in semiconductor process engineering.

**Found an error?** Please open an issue in this repository with the scene, the settings and the source you compared with.

**How to cite.** H. Q. A. Nguyen, "Origami 3D viewer: KOH and EDP etching of silicon," National Tsing Hua University, Nov. 2026. [Online]. Available: https://github.com/SalmonQuoc/origami-koh-etch-viewer

**AI use.** This viewer was written with AI help (Claude, by Anthropic). I chose the content and checked the numbers against the sources listed below. The AI wrote most of the code.

## Method and validation

- **Etch-rate model.** The rate R(hkl) for any orientation comes from the 12 orientations in Pal & Sato, Table 4.1 (p. 87): KOH at 30, 40 and 50 wt%, 70 °C. Between those orientations it is interpolated piecewise-linearly in gnomonic coordinates of the standard triangle, which keeps the slow {111} cusp. A KOH 42 wt%, 75 °C option uses Lec 4-1 p. 7 for {100}, {110} and {111}. The other orientations in that option are scaled from Pal & Sato 40 wt%; this scaling is an assumption.
- **Front motion.** The level-set equation φ_t + R(n)|∇φ| = 0 is solved on a cubic grid. It uses a first-order Lax-Friedrichs scheme with fast-marching re-initialisation, and φ never rises, because etching cannot be undone. The time step runs in Rust compiled to WebAssembly (`engine/`); the JavaScript version in `src/engine/etch-engine.js` is the reference and the fallback. Both give bit-identical fields on the five test cases (`tests/engine-parity.test.mjs`); the Rust kernel is 1.2 to 1.9 times faster in Node and took 8.1 s instead of 11.8 s for the first simulator example in Chromium.
- **Mask edge (assumption).** Etchant cannot reach silicon through the mask. Under the mask, the level set therefore has no downward slope at the top boundary, and where the wall there is near-vertical (|dφ/dz| < 0.35 |∇ₕφ|) the vertical gradient is set to zero so the wall moves sideways at the full {100} rate. Check (`tests/engine-physics.test.mjs`): a 100 µm square window at 45° on (100), 40 min in 30 wt% KOH, gives 24.0 µm sideways undercut at 20 µm depth with dx = 2 µm (16.5 µm at 3 µm, 9.5 µm at 4 µm) against 0.797 × 40 = 31.9 µm (Pal & Sato Table 4.1, p. 87). A ⟨110⟩-aligned pit keeps 0 µm undercut.
- **Check.** For a 200 µm square window on (100) in 30 wt% KOH for 60 min, the simulated depth is 47.85 µm, against 0.797 × 60 = 47.82 µm (`tests/engine-physics.test.mjs`). The {111} side walls stand at 54.2° with a 4 µm grid and 54.8° with a 2 µm grid, against 54.74° (`tests/engine-physics.test.mjs`, fit between 20 % and 80 % of the depth).
- **Engine fix (21 Nov 2026).** Porting the engine to Rust showed that the JavaScript re-initialisation looped over the neighbours of the wrong node after the first one (a shared scratch array was refilled inside the loop). Fixed in both versions. On the five test cases depths changed by 0.05 to 0.14 µm (at most 0.04 cells): three (100) cases moved closer to R(100)·t, the (100) cantilever and the (110) case moved slightly away; undercuts did not change. Details in `tools/check-log-2026-11-21.md`.
- **EDP rates (assumption).** Lec 10 p. 11 gives EDP rates for {100}, {110} and {111} only (51, 57 and 1.25 µm/h). All other orientations use the three-rate interpolation, which equals the Hubbard three-parameter model in gnomonic coordinates (Radjenović et al. 2010, eq. 1). Lec 10 p. 16 orders EDP as (100) > (110) > (111), which the p. 11 values do not follow, so a second set "EDP F&K" uses the 50:30:3 ratio of Finne & Klein (1967, as listed in the Berkeley Microlab manual ch. 1.10) scaled to R(100) = 51 µm/h. With that set a trench along ⟨100⟩ gets 47° walls (Lec 10 p. 17: 45°); with Type S it gets 63°.
- **Flat error check.** A 100 µm square on (100) with the crystal turned by 45° gives 32.0 µm depth (0.797 × 40 = 31.9 µm) and 23.8 µm undercut, the same as a square turned 45° on a true frame (22.2 µm), within one cell.
- **Orientation finder (method).** In the long-etch limit a slot of length L and width w misaligned by α etches to width w cos α + L sin α; 3 cm at 1° gives 524 µm and at 0.06° 31.4 µm (Lec 10 p. 18: 524 and 33 µm). Device error is compared with U = l sin δ cos δ (Pal & Sato eq. 7.1, p. 289: 18 µm for 10 mm at 0.1°; here 17.45 µm). Check logs: `tools/check-log-2026-11-20.md`, `tools/check-log-2026-11-21.md`.
- **Known limits.** Silicon walls and beams narrower than about 8 grid cells thin slowly. This comes from numerical dissipation, not physics, and it is worst for walls oblique to the grid. Windows narrower than about 5 cells etch too slowly. Undercut on {111} walls is good to about one or two cells. Sideways undercut of vertical {100} walls lags by about 2–3 cells (see the check above), so use a fine grid when it matters.

## Wafer frames

- **(100) wafer.** x = [1̄10] runs along the primary flat, y = [1̄1̄0], and z = [001] (Lec 4-1 p. 6).
- **(110) wafer.** There are two conventions:
  - the flat along ⟨110⟩ (Lec 4-1 p. 6);
  - the ⟨111⟩ arrow taken as the outward flat normal (Lec 4-1 p. 11, HW2 P5).
- **(111) wafer.** The flat along [1̄10] is an assumption.

## References

1. F.-G. Tseng, "Lecture 4-1: Bulk micromachining," *ESS5850 Micro System Design Class Notes*, National Tsing Hua University. pp. 6–16 (wafer flats, KOH rates p. 7, corner behaviour p. 8, compensation p. 9, (110) p. 12, (111) p. 13, bridges p. 14, etch stop p. 15, DRIE p. 16).
2. P. Pal and K. Sato, *Silicon Wet Bulk Micromachining for MEMS*, 1st ed. Singapore: Jenny Stanford Publishing, 2017, doi: 10.1201/9781315364926. Table 2.1 (p. 30), Table 4.1 (p. 87), p. 104, pp. 235–249.
3. F.-G. Tseng, "HW #2," ESS5850 Micro System Design, National Tsing Hua University, fall 2026 (octahedron net, p. 3; problem 5).
4. N. Paul, S. Bonam, S. R. K. Vanjari, and S. G. Singh, "Silicon membranes for microbolometers: simulation and fabrication using frontend bulk micromachining," in *2024 IEEE Int. Conf. Electron Devices Society Kolkata Chapter (EDKCON)*, Kolkata, India, 2024, pp. 623–628, doi: 10.1109/EDKCON62339.2024.10870751. Used for the 45° (⟨100⟩-aligned) mask examples (Fig. 1, Sec. II–III); KOH 30 wt% replaces their TMAH, for which the course files give no rate table.
5. G. T. A. Kovacs, N. I. Maluf, and K. E. Petersen, "Bulk micromachining of silicon," *Proceedings of the IEEE*, vol. 86, no. 8, pp. 1536–1551, Aug. 1998. Concave and convex corners and the undercut cantilever (Fig. 1(b), 1(c), p. 1537); wet etchants (Table 1, p. 1538).
6. P. Pal, K. Sato, and S. Chandra, "Fabrication techniques of convex corners in a (1 0 0)-silicon wafer using bulk micromachining: a review," *J. Micromech. Microeng.*, vol. 17, no. 10, pp. R111–R133, 2007, doi: 10.1088/0960-1317/17/10/R01. Undercut at convex corners (Sec. 2) and corner compensation (Sec. 3.1).
7. H. Q. A. Nguyen, "Origami tutorial: the {111} octahedron on (100), (110) and (111) wafers," ESS5850 study notes, Rev. 1, Oct. 2026.

8. F.-G. Tseng, "Lecture 10: Bulk micromachining," *ESS 5810 Advanced Micro System Fabrication and Lab class notes* (file 16-Lec10Bulkmicromachining.pdf), National Tsing Hua University. Flats p. 10; KOH and EDP rates p. 11; corner attack pp. 14–16; ⟨100⟩ trench in EDP p. 17; flat error and alignment marks p. 18; in-plane directions p. 22; (110) alignment pp. 25–26.
9. UC Berkeley Marvell Nanofabrication Laboratory, "Chapter 1.10: Miscellaneous etches," *Lab manual*, https://nanolab.berkeley.edu/labmanual/chap1/1.10miscetch.pdf. EDP compositions and rates after R. M. Finne and D. L. Klein, *J. Electrochem. Soc.*, vol. 114, p. 965, 1967, and A. Reisman et al., *J. Electrochem. Soc.*, vol. 126, p. 1406, 1979.
10. B. Radjenović, M. Radmilović-Radjenović, and M. Mitrić, "Level set approach to anisotropic wet etching of silicon," *Sensors*, vol. 10, no. 5, pp. 4950–4967, 2010, doi: 10.3390/s100504950. Three-parameter rate model, eq. 1.
11. Pal and Sato (ref. 2), Ch. 7, pp. 287–320: misalignment and eq. 7.1 (p. 289), flat accuracy (p. 294), pre-etched patterns (p. 296), Ensell's circles (pp. 297–299), mask-writer limits (p. 304).
12. Topline Corp., "Wafer dimensions: 100 mm standard," drawing A 174004 A, https://www.topline.tv/drawings/pdf/wafers/wafer_flats_thickness.pdf. Primary and secondary flat lengths.

## Repository layout

| Path | Contents |
|---|---|
| `index.html` | The viewer, a single file built from the folders below (served by GitHub Pages) |
| `src/index.html` | Page markup and styles |
| `src/app/*.ts` | User interface in 19 TypeScript modules |
| `src/core/geometry.ts` | Analytic {111}-plane model (Model on wafer, Etched pit, Find orientation) |
| `src/engine/etch-engine.js` | Level-set engine: set-up, mesh, sections, statistics, JavaScript time step |
| `engine/` | Rust crate: the time step compiled to WebAssembly |
| `data/*.json` | Etchants, simulator examples and pit examples ([docs/DATA.md](docs/DATA.md)) |
| `build.mjs`, `tools/validate-data.mjs` | Build and data checks |
| `tests/` | Engine parity, physics and data tests; `tests/browser/` page test in Chromium |
| `docs/` | [Architecture](docs/ARCHITECTURE.md) and [data format](docs/DATA.md) |
| `tools/check-log-*.md` | Check logs of each release |
