// Checks the data files in data/ before they go into the page. Used by build.mjs and the tests.
// Usage: node tools/validate-data.mjs   (prints the problems and exits with 1 if there are any)
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PLANES = ["100", "110", "111", "210", "211", "221", "310", "311", "320", "331", "530", "540"];
const FRAMES = { "100": "100", "110f": "110", "110a": "110", "111": "111" };
const SHAPES = ["rect", "circle", "ellipse", "tri", "poly", "para", "lshape", "ushape", "cross", "frame", "ring", "star", "pts", "free"];
const isNum = v => typeof v === "number" && Number.isFinite(v);

export function validateEtchants(db, err) {
  if (db.format !== "origami-etchants-db") err("etchants.json: format must be origami-etchants-db");
  for (const [name, T] of Object.entries(db.tables || {})) {
    if (!T.source) err(`table ${name}: no source`);
    if (!["um/min", "um/h"].includes(T.unit)) err(`table ${name}: unit must be um/min or um/h`);
    for (const [c, col] of Object.entries(T.columns || {})) for (const [p, v] of Object.entries(col)) {
      if (!PLANES.includes(p)) err(`table ${name} column ${c}: unknown plane {${p}}`);
      if (!isNum(v) || v < 0) err(`table ${name} column ${c} {${p}}: rate must be a number >= 0`);
    }
  }
  const keys = new Set(), pitKeys = new Set();
  for (const e of db.etchants || []) {
    const at = `etchant ${e.key || "(no key)"}`;
    if (!e.key || keys.has(e.key)) err(`${at}: key missing or repeated`); keys.add(e.key);
    if (e.key && e.key.startsWith("CU")) err(`${at}: keys starting with CU are kept for the user's custom etchants`);
    if (e.pitKey) { if (pitKeys.has(e.pitKey)) err(`${at}: pitKey repeated`); pitKeys.add(e.pitKey); }
    if (!e.name) err(`${at}: no name`);
    if (!e.source) err(`${at}: no source (cite the table or lecture page, and mark assumptions)`);
    if (!isNum(e.T_C)) err(`${at}: T_C (temperature, °C) must be a number`);
    const R = e.rates || {};
    const col = (t, c) => db.tables?.[t]?.columns?.[c];
    if (R.table && !col(R.table, R.column)) err(`${at}: no table ${R.table} column ${R.column}`);
    if (R.given) {
      if (!["um/min", "um/h"].includes(R.unit)) err(`${at}: rates.unit must be um/min or um/h`);
      for (const [p, v] of Object.entries(R.given)) { if (!PLANES.includes(p)) err(`${at}: unknown plane {${p}}`); if (!isNum(v) || v < 0) err(`${at} {${p}}: rate must be a number >= 0`); }
    }
    if (R.others && (!col(R.others.table, R.others.column) || !R.given?.[R.others.scaleBy])) err(`${at}: rates.others needs an existing table column and a given rate for scaleBy`);
    const has = p => (R.table && col(R.table, R.column)?.[p] != null) || R.given?.[p] != null;
    for (const p of ["100", "110", "111"]) if (!has(p)) err(`${at}: needs a {${p}} rate`);
    if (!(has("100") && ((R.given?.["100"] ?? 1) > 0))) err(`${at}: {100} rate must be above zero`);
    if (e.sio2 && (!isNum(e.sio2.value) || !e.sio2.source)) err(`${at}: sio2 needs value, unit and source`);
  }
  return { keys, pitKeys };
}

function validateShape(s, at, err) {
  if (!SHAPES.includes(s.type)) err(`${at}: unknown shape type ${s.type}`);
  if (!["open", "mask"].includes(s.op)) err(`${at}: op must be open or mask`);
  for (const k of ["cx", "cy", "w", "h", "ang"]) if (s[k] != null && !isNum(s[k])) err(`${at}: ${k} must be a number`);
  if ((s.type === "pts" || s.type === "free") && !(Array.isArray(s.pts) && s.pts.length >= 3)) err(`${at}: ${s.type} needs pts (3 or more corners)`);
}

export function validateSimExamples(db, keys, err) {
  if (db.format !== "origami-sim-examples") err("sim-examples.json: format must be origami-sim-examples");
  for (const [w, L] of Object.entries(db.wafers || {})) {
    if (!["100", "110", "111"].includes(w)) err(`sim-examples: unknown wafer ${w}`);
    L.forEach((p, i) => {
      const at = `sim-examples (${w}) #${i + 1} ${p.name || ""}`;
      if (!p.name || !p.note) err(`${at}: needs name and note (with sources)`);
      if (FRAMES[p.fk] !== w) err(`${at}: fk ${p.fk} is not a frame of the (${w}) wafer`);
      if (!keys.has(p.rate)) err(`${at}: rate ${p.rate} is not an etchant key`);
      for (const k of ["t", "hx", "hy"]) if (!isNum(p[k]) || p[k] <= 0) err(`${at}: ${k} must be a number > 0`);
      if (!Array.isArray(p.shapes) || !p.shapes.length) err(`${at}: needs shapes`);
      (p.shapes || []).forEach((s, k) => validateShape(s, `${at} shape ${k + 1}`, err));
    });
  }
}

export function validatePitExamples(db, pitKeys, err) {
  if (db.format !== "origami-pit-examples") err("pit-examples.json: format must be origami-pit-examples");
  for (const [w, L] of Object.entries(db.wafers || {})) L.forEach((e, i) => {
    const at = `pit-examples (${w}) #${i + 1} ${e.name || ""}`, o = e.open || {};
    if (!e.name) err(`${at}: no name`);
    if (!pitKeys.has(e.rate)) err(`${at}: rate ${e.rate} is not a pitKey in etchants.json`);
    if (o.shape === "rect" ? !(o.w > 0 && o.h > 0) : o.shape === "circle" ? !(o.d > 0) : o.shape === "trench110" ? !(o.w > 0 && o.l > 0) : true) err(`${at}: open must be rect (w, h, ang), circle (d) or trench110 (w, l)`);
    if (e.pre != null && !(e.pre >= 0)) err(`${at}: pre must be >= 0`);
  });
}

export function validateAll(dir = new URL("../data/", import.meta.url)) {
  const problems = [], err = m => problems.push(m), read = f => JSON.parse(readFileSync(new URL(f, dir), "utf8"));
  const files = readdirSync(dir).filter(f => f.endsWith(".json"));
  const data = {};
  for (const f of files) { try { data[f.replace(/\.json$/, "")] = read(f); } catch (e) { err(`${f}: not valid JSON (${e.message})`); } }
  if (data.etchants) {
    const { keys, pitKeys } = validateEtchants(data.etchants, err);
    if (data["sim-examples"]) validateSimExamples(data["sim-examples"], keys, err);
    if (data["pit-examples"]) validatePitExamples(data["pit-examples"], pitKeys, err);
  } else err("data/etchants.json is missing");
  return { data, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { data, problems } = validateAll();
  if (problems.length) { console.error(problems.map(p => "✗ " + p).join("\n")); process.exit(1); }
  console.log(`data OK: ${Object.keys(data).map(k => k + ".json").join(", ")}`);
}
