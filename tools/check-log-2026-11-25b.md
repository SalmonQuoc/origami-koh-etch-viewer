# Check log 2026-11-25 (b): doping and the p++ boron etch stop

Sources: Pal & Sato, *Silicon Wet Bulk Micromachining for MEMS* (2016), p. 93 (Section 4.1.6.1, Fig. 4.11, from
Seidel et al. 1990, Part II), p. 94 (Fig. 4.12) and p. 191 (Section 5.7.1). Page numbers are the printed ones
(PDF page index − 13 in the copy in the project files).

## What the sources say

| statement | source |
|---|---|
| Doping at a normal level does not change the etch rate | p. 93 |
| Boron above 1 × 10¹⁹ cm⁻³ decreases the rate significantly; "reduced by one hundreds" | p. 93 |
| Phosphorus and germanium do not show such a strong reduction | p. 93 |
| Diffused p++ layer thickness is limited to about 2–3 µm | p. 93 |
| All common alkaline etchants slow down at high boron doping | p. 191 |
| TMAH: low rate at 2.5 × 10²⁰ cm⁻³; heavily : lightly doped about 1 : 40; lightly doped means < 10¹⁸ cm⁻³ | p. 191 |

So the wafer type (p or n) does not enter the model: the rate tables (Table 4.1, p. 87, and the lecture values) are
for lightly doped silicon.

## Rate factors read from Fig. 4.11 (24 wt% KOH, 60 °C, Si(100))

Read from the page image (PDF page 106); the 24 wt% curve has a plateau of about 27 µm/h. Reading error about ±20 % in
the rate (log axis, scanned figure). Values between the measured points follow the drawn curve.

| boron (cm⁻³) | rate read (µm/h) | factor f used |
|---|---|---|
| 1 × 10¹⁹ | about 23 | 0.85 |
| 2 × 10¹⁹ | about 12.7 | 0.47 |
| 3.2 × 10¹⁹ | 8.2 | 0.30 (offered as 3 × 10¹⁹) |
| 4.8 × 10¹⁹ | 3.6 | 0.13 (offered as 5 × 10¹⁹) |
| 7.1 × 10¹⁹ | 1.1 | 0.04 (offered as 7 × 10¹⁹) |
| 1.0 × 10²⁰ | 0.6 | 0.022 |

Also offered: f = 1/100 (p. 93, KOH, text) and f = 1/40 (p. 191, TMAH). Assumptions (stated on the page): the Si(100)
factor is applied to every orientation and to every etchant and temperature; the layer has sharp edges; a grid row
filled by the layer to a fraction w gets 1/((1 − w) + w/f), the factor of the etch time through the row.

## Engine change

`ham` in `src/engine/etch-engine.js` and `Kern::ham` in `engine/src/sim.rs` multiply the Hamiltonian, including its
Lax-Friedrichs dissipation, by a per-row factor `kz[k]` (local Lax-Friedrichs: the dissipation bound scales with the
rate). Without a layer every factor is exactly 1, so the fields are unchanged bit for bit (new test in
`tests/engine-physics.test.mjs`). New C ABI pointer `sim_kz_ptr`; the JavaScript engine falls back to itself if an
older kernel without it is loaded and a layer is set.

## Before / after (QUICK=1 node tools/accuracy.mjs, Rust/WebAssembly kernel)

| case | before | after |
|---|---|---|
| pit dx 4: depth | 47.32 µm | 47.32 µm |
| pit dx 4: wall angle | 54.73° | 54.73° |
| 45° window dx 2: undercut | 26.5 µm | 26.5 µm |
| 10 µm wall dx 2: width at top / 10 µm | 12 / 28 µm | 12 / 28 µm |
| (110) ⟨110⟩ groove dx 4: floor / wall | 43.60 µm / 33.93° | 43.60 µm / 33.93° |
| (100) mesa dx 4: corner bevel / l/d | 23.3° / 2.87 | 23.3° / 2.87 |

Identical (only the run times differ): the change does nothing without a layer.

## New check: the floor stops on the layer

200 µm window along ⟨110⟩ on (100), KOH 30 wt% at 70 °C (R(100) = 0.797 µm/min, Table 4.1, p. 87), 60 min, layer
30–33 µm. Expected: the floor reaches 30 µm at 37.6 min and then moves at f · R(100); after 60 min it stands at
30 + f · 0.797 · 22.4 µm (if that is less than 3 µm, else it has broken through).

| f | grid | depth at 40 min | depth at 60 min | expected at 60 min |
|---|---|---|---|---|
| — (no layer) | 2 µm | 31.63 | 47.56 | 47.82 |
| 0.022 | 4 µm | 28.03 | 30.64 | 30.39 |
| 0.022 | 2 µm | 29.88 | 31.37 | 30.39 |
| 0.022 | 1 µm | 30.28 | 30.97 | 30.39 |
| 0.01 | 2 µm | 29.78 | 31.16 | 30.18 |
| 0.30 | 2 µm | 30.66 | 41.86 | 40.82 (breaks through at 50.2 min) |

The stop depth is right within half to one cell; the front slows about one cell before the layer (the difference
stencil reaches into it), and the arrival-time interpolation places it up to one cell inside. The page example
"p++ boron etch stop" (dx 2 µm at normal resolution) gives 31.4 µm in the browser, the same as the 2 µm row.
Parity case "(100) square pit onto a p++ layer" (layer 30–42 µm, dx 4 µm): Rust = JavaScript.

## Tests

`npx tsc`, `node build.mjs`, `node tools/validate-data.mjs`, `npm test` (18 tests, 3 new) and the browser test
(28 subtests, 1 new) pass. The browser test was run with three.js r128 served from the npm package because the CDN
was not reachable from the build machine.
