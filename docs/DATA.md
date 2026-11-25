# Editing the data

All rates and examples are in `data/`. After an edit run:

```
npm run validate      # checks the files and names each problem
npm run build         # rebuilds index.html (it also validates)
npm test              # engine and data tests
```

Every number needs a source. Write it in the `source` or `note` text as in the existing entries (book and page, lecture and page), and write "(assumption)" after anything that is your own choice.

## `etchants.json`

```jsonc
{
  "tables": {
    "PalSato4.1": {                       // a table of rates, keyed by column
      "source": "Pal & Sato, Table 4.1, p. 87", "etchant": "KOH", "T_C": 70, "unit": "um/min",
      "columns": { "30": { "100": 0.797, "110": 1.455, "111": 0.005, ... }, "40": {...}, "50": {...} }
    }
  },
  "etchants": [
    { "key": "PAL30", "pitKey": "PAL30", "name": "KOH 30 wt%, 70 °C", "pitName": "KOH 30 wt%, 70 °C (Pal & Sato p. 87)",
      "T_C": 70, "conc_wt": 30, "rates": { "table": "PalSato4.1", "column": "30" }, "source": "...", "sio2": null },
    { "key": "LEC42", "pitKey": "LEC", "name": "...", "T_C": 75,
      "rates": { "unit": "um/h", "given": { "100": 42, "110": 66, "111": 0.5 },
                 "others": { "table": "PalSato4.1", "column": "40", "scaleBy": "100" } },
      "source": "...", "sio2": { "value": 0.34, "unit": "um/h", "source": "Lec 10 p. 11" } }
  ]
}
```

- `key`: used by the simulator, corner lab and saved presets. Do not rename an existing key: presets that people saved refer to it. Keys starting with `CU` are kept for custom etchants.
- `pitKey` / `pitName`: present if the etchant is offered in the Etched pit (which uses {100}, {110} and {111} only).
- `rates`: either a whole table column (`table`, `column`), or the rates the source gives (`given`, in `unit`), optionally completed by a table column scaled so that the plane `scaleBy` matches (`others`). Planes: 100, 110, 111, 210, 211, 221, 310, 311, 320, 331, 530, 540. {100}, {110} and {111} are required. Planes that are not given are interpolated linearly over the standard triangle.
- `T_C`: the temperature of the data, used as the start point when someone makes a custom etchant at another temperature (Arrhenius).
- `conc_wt`: for etchants taken from a table with concentration columns: the custom-etchant dialog can then interpolate between columns.
- `sio2`: mask (thermal oxide) etch rate with its source, or `null`.
- `Q` (optional): activation energies in eV, `{ "100", "110", "111", "sio2", "source" }`. They are the defaults of the custom-etchant dialog when the etchant is moved to another temperature (R = R₀ exp(−Q/kT)); `sio2` moves the thermal-oxide rate. Cite the figure or page for each value and mark assumptions.

**To add an etchant**: add a table if the source gives one, then an entry in `etchants`. The new etchant appears in every etchant list after `npm run build`.

## `sim-examples.json`

```jsonc
{ "wafers": { "100": [ { "name": "...", "fk": "100", "rate": "PAL30", "t": 100, "hx": 200, "hy": 130,
                          "pre": 0, "dxMax": 0, "note": "text with sources",
                          "shapes": [ { "type": "rect", "op": "open", "cx": 0, "cy": 0, "w": 300, "h": 180, "ang": 0 }, ... ] } ],
              "110": [...], "111": [...] } }
```

- `fk`: wafer frame: `100`, `110f` (flat along ⟨110⟩, Lec 4-1 p. 6), `110a` (⟨111⟩ arrow = flat normal, Lec 4-1 p. 11) or `111`.
- `t` etch time in min; `hx`, `hy` half-widths of the simulated area in µm; `pre` vertical pre-etch depth in µm; `dxMax` largest grid cell in µm (0 = automatic).
- `shapes` are painted in order: `open` removes the mask, `mask` puts it back. Types: rect, circle, ellipse, tri, poly, para, lshape, ushape, cross, frame, ring, star, pts (corner list), free (drawn outline). Lengths in µm, `ang` in degrees from the flat; `nx`, `ny`, `px`, `py` make an array.

**To add an example**: make it on the page in the Etch simulator, press ☆ Save as my preset, then Export. Copy the `data` part of your preset (`fk`, `rate`, `t`, `hx`, `hy`, `pre`, `shapes`) into the right wafer list, add `name` and `note`, and use a `rate` key from `etchants.json` (not a `CU…` custom one).

## `pit-examples.json`

```jsonc
{ "wafers": { "100": [ { "name": "Square 200 µm turned 45° (Example 2)", "open": { "shape": "rect", "w": 200, "h": 200, "ang": 45 }, "rate": "PAL30" } ] } }
```

`open` is `rect` (w, h, ang), `circle` (d) or `trench110` (w, l: vertical-wall trench on (110) along a {111} trace). `pre` is an optional pre-etch depth in µm. `rate` is a `pitKey` of `etchants.json`.
