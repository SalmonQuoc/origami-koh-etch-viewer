# Origami 3D viewer and KOH etch simulator

An interactive 3D page for anisotropic wet etching of single-crystal silicon, made for ESS5850 Micro System Design (National Tsing Hua University, fall 2026).

It has three scenes:

- **Model on wafer**: the HW2 {111} octahedron held over a (100), (110) or (111) wafer. Click a face to see its trace on the surface and its angle to the surface.
- **Etched pit**: the cavity under a convex mask opening, built as an intersection of moving crystal planes (n·x ≤ h + R·t over the {100}, {110} and {111} planes).
- **Etch simulator**: a 3D level-set simulation of KOH etching for any mask drawn in the mask editor. It includes 16 examples: cantilevers and bridges released by undercut, mesa corner attack with three compensation types, windows of different sizes and shapes that merge, (110) vertical walls and trenches, and (111) pre-etched holes.

## Run it

Open `index.html` in a browser. The page loads three.js r128 from cdnjs and jsDelivr. Nothing needs to be built.

## Author

Huu Quoc Anh Nguyen, Student ID X1150030, Department of Engineering and System Science (ESS), National Tsing Hua University.

**AI use.** This viewer was written with AI help (Claude, by Anthropic). I chose the content and checked the numbers against the sources listed below. The AI wrote most of the code.

## Method and validation

- **Etch-rate model.** The rate R(hkl) for any orientation comes from the 12 orientations in Pal & Sato, Table 4.1 (p. 87): KOH at 30, 40 and 50 wt%, 70 °C. Between those orientations it is interpolated piecewise-linearly in gnomonic coordinates of the standard triangle, which keeps the slow {111} cusp. A KOH 42 wt%, 75 °C option uses Lec 4-1 p. 7 for {100}, {110} and {111}. The other orientations in that option are scaled from Pal & Sato 40 wt%; this scaling is an assumption.
- **Front motion.** The level-set equation φ_t + R(n)|∇φ| = 0 is solved on a cubic grid. It uses a first-order Lax-Friedrichs scheme with fast-marching re-initialisation, and φ never rises, because etching cannot be undone.
- **Mask edge (assumption).** Etchant cannot reach silicon through the mask. Under the mask, the level set therefore has no downward slope at the top boundary.
- **Check.** For a 200 µm square window on (100) in 30 wt% KOH for 60 min, the simulated depth is 47.9 µm, against 0.797 × 60 = 47.82 µm. The {111} walls come out at 54.5°, against 54.74°.
- **Known limits.** Silicon walls and beams narrower than about 8 grid cells thin slowly. This comes from numerical dissipation, not physics, and it is worst for walls oblique to the grid. Windows narrower than about 5 cells etch too slowly. Undercut values are good to about one or two cells.

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
4. H. Q. A. Nguyen, "Origami tutorial: the {111} octahedron on (100), (110) and (111) wafers," ESS5850 study notes, Rev. 1, Oct. 2026.

## Repository layout

| Path | Contents |
|---|---|
| `index.html` | The viewer (a single file) |
| `tools/core.js` | The geometry core of the Etched pit scene, as a separate file |
| `tools/etch-engine-tests/etch-engine.js` | The level-set engine as a Node module, for tests |
| `tools/etch-engine-tests/validate-cases.js` | Depth and undercut for 5 reference cases (`npm run validate`) |
| `tools/etch-engine-tests/browser-presets.js` | Runs every example in headless Chromium and saves screenshots (`npm run test:browser`) |
