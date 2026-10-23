# Origami 3D viewer and KOH etch simulator

An interactive 3D page for anisotropic wet etching of single-crystal silicon, made for ESS5850 Micro System Design (National Tsing Hua University, fall 2026).

It has three scenes:

- **Model on wafer**: the HW2 {111} octahedron held over a (100), (110) or (111) wafer. Click a face to see its trace on the surface and its angle to the surface.
- **Etched pit**: the cavity under a convex mask opening, built as an intersection of moving crystal planes (n·x ≤ h + R·t over the {100}, {110} and {111} planes).
- **Etched pit**: you can also add your own openings (rectangle, circle, L, U, cross, frame, ring, star and more, with rotation). A non-convex opening is split into overlapping convex pieces; each piece etches on its own and the cavity drawn is their union, so concave corners stop at {111}. Convex mask corners are not undercut in this scene (they are in real KOH etching; Kovacs et al. 1998, Fig. 1(c); Pal et al. 2007, Sec. 2), so "Open in etch simulator" runs the same mask in the level-set model.
- **Mask film**: drawn in its own colour as an opaque layer with exaggerated thickness, so it reads apart from the silicon and shows the overhang where the silicon is undercut.
- **Etch simulator**: a 3D level-set simulation of KOH etching for any mask drawn in the mask editor. It includes 20 examples: cantilevers and bridges released by undercut, mesa corner attack with three compensation types, windows of different sizes and shapes that merge, (110) vertical walls and trenches, (111) pre-etched holes, and four (100) masks at 45° to the flat after Paul et al. (2024).

Other functions:

- **Shapes**: rectangle, circle, ellipse, triangle, regular polygon, L, U, cross, frame, ring and star, each as opening or mask, with rotation and an nx × ny array at a set pitch.
- **Colour scales**: colour the etched surface by crystal plane, depth, local etch rate R(n) or arrival time, with a colour bar.
- **Graphs**: depth, undercut and released mask area against etch time (simulator), and depth and outline size against time (pit).
- **Theater view** (key T) widens the 3D view; **Full screen** fills the screen.

## Run it

Open `index.html` in a browser. The page loads three.js r128 from cdnjs and jsDelivr. Nothing needs to be built.

## Author

Huu Quoc Anh Nguyen, Student ID X1150030, Department of Engineering and System Science (ESS), National Tsing Hua University.

**AI use.** This viewer was written with AI help (Claude, by Anthropic). I chose the content and checked the numbers against the sources listed below. The AI wrote most of the code.

## Method and validation

- **Etch-rate model.** The rate R(hkl) for any orientation comes from the 12 orientations in Pal & Sato, Table 4.1 (p. 87): KOH at 30, 40 and 50 wt%, 70 °C. Between those orientations it is interpolated piecewise-linearly in gnomonic coordinates of the standard triangle, which keeps the slow {111} cusp. A KOH 42 wt%, 75 °C option uses Lec 4-1 p. 7 for {100}, {110} and {111}. The other orientations in that option are scaled from Pal & Sato 40 wt%; this scaling is an assumption.
- **Front motion.** The level-set equation φ_t + R(n)|∇φ| = 0 is solved on a cubic grid. It uses a first-order Lax-Friedrichs scheme with fast-marching re-initialisation, and φ never rises, because etching cannot be undone.
- **Mask edge (assumption).** Etchant cannot reach silicon through the mask. Under the mask, the level set therefore has no downward slope at the top boundary, and where the wall there is near-vertical (|dφ/dz| < 0.35 |∇ₕφ|) the vertical gradient is set to zero so the wall moves sideways at the full {100} rate. Check (`tools/etch-engine-tests/undercut-100.js`): a 100 µm square window at 45° on (100), 40 min in 30 wt% KOH, gives 26.5 µm sideways undercut at dx = 2 µm (21.0 µm at 3 µm, 15.5 µm at 4 µm) against 0.797 × 40 = 31.9 µm (Pal & Sato Table 4.1, p. 87); the older clamp gave 23.4 µm at 2 µm. A ⟨110⟩-aligned pit still keeps 0 µm undercut (`validate-cases.js`).
- **Check.** For a 200 µm square window on (100) in 30 wt% KOH for 60 min, the simulated depth is 47.9 µm, against 0.797 × 60 = 47.82 µm. The {111} walls come out at 54.5°, against 54.74°.
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

## Repository layout

| Path | Contents |
|---|---|
| `index.html` | The viewer (a single file) |
| `tools/core.js` | The geometry core of the Etched pit scene, as a separate file |
| `tools/etch-engine-tests/etch-engine.js` | The level-set engine as a Node module, for tests |
| `tools/etch-engine-tests/validate-cases.js` | Depth and undercut for 5 reference cases (`npm run validate`) |
| `tools/etch-engine-tests/undercut-100.js` | Sideways {100} undercut against grid size (`node tools/etch-engine-tests/undercut-100.js 2 40`) |
| `tools/etch-engine-tests/browser-presets.js` | Runs every example in headless Chromium and saves screenshots (`npm run test:browser`) |
