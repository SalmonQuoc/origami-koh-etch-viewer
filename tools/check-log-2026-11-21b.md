# Check log, 21 Nov 2026 (b): How it works section and custom-etchant explanations

Ten checking passes over the new text and the switches, with what each found and what was changed.

| Pass | What was checked | Result | Change made |
|---|---|---|---|
| 1 | Every worked number recomputed (Arrhenius factors 12.4, 1.78, 3.06; 0.797 → 1.42 and 0.599 → 1.83 µm/min; 35 wt% 0.698; selectivity 124, 11.9 h, 4.0 µm; 54.74°, tan = √2, W/√2: 70.7 and 212 µm, 266 min; 47.82 µm) | all within rounding | none |
| 2 | 38 citations matched against the page text of Pal & Sato (printed = PDF − 13), Hsu 2e (printed = PDF − 24), Lec 4-1 and Lec 10 | 38/38 found | the 54.74° claim cited Lec 4-1 p. 8, whose text does not state it: now Hsu p. 325 only; the "fastest is not (110)" sentence separated the 30 wt% table from the 40 % map (p. 85) |
| 3 | Text about the method against the code (rate map sort, gnomonic u = b/a, v = c/a, Delaunay, Lax-Friedrichs, dt = 0.9 dx/Σα, band 4 dx, re-initialisation every 6 steps, φ never rises; custom etchant: Q(100) for other planes, clamping 30–50 wt%, SiO₂ rule, default name) | matches | the rate-map text wrongly said every three-rate etchant borrows the other nine planes; EDP does not (fixed); grid text now says the mask distance is sampled four times finer |
| 4 | Switch behaviour in Chromium: off at first, all `details` closed, key I, toolbar button, Settings box, dialog box, kept after reload | as intended | Settings reset now also resets the switch |
| 5 | Custom-etchant results in the page against the text: 30 wt% 80 °C R(100) 1.42 µm/min; 40 wt% 90 °C 1.83 µm/min; 35 wt% 70 °C 0.698 µm/min | match | none |
| 6 | Pit claims with the page geometry (Core.etch): final depth of 100 and 300 µm squares on (100) | 70.71 and 212.13 µm | none |
| 7 | Simulator claims: depth 47.85 µm; wall angle | the 54.5° quoted since Oct was not reproduced: the fit gives 54.24° at dx 4 µm and 54.79° at dx 2 µm | page, panel and README updated; new test in tests/engine-physics.test.mjs (within 1° at dx 4) |
| 8 | Layout: phone width 390 px with every part open; light and dark screenshots | no sideways scroll | equations set in the text font (the mono font drew subscripts poorly) |
| 9 | Wording: tone, terms, words such as "just", "easy" | two loose phrases | "add just enough smoothing" reworded; "brackets" → "parentheses" |
| 10 | Regression: typecheck, node tests (12), browser test (10 subtests incl. a new one for the switch), CI | pass | own-rate help: removed the claim that {111} sets the wall angle and that {110} is the fastest corner plane (neither is right); the own-rate note no longer leans on an equation of Radjenović et al. that was not re-read here |

Not checked here: the Radjenović et al. (2010) paper itself could not be opened from this session, so the existing reference to its eq. 1 (EDP rate maps, Model panel) is unchanged and unverified in this pass.
