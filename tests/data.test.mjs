// The data files are valid, and the validator catches the usual mistakes.
import test from "node:test";
import assert from "node:assert/strict";
import { validateAll, validateEtchants, validateSimExamples } from "../tools/validate-data.mjs";

test("data/*.json pass the checks", () => {
  const { data, problems } = validateAll();
  assert.deepEqual(problems, []);
  for (const f of ["etchants", "sim-examples", "pit-examples"]) assert.ok(data[f], `${f}.json present`);
});

test("validator: missing source, missing plane, unknown etchant and shape are reported", () => {
  const { data } = validateAll(), db = structuredClone(data.etchants), msgs = [];
  db.etchants.push({ key: "X1", name: "test", T_C: 20, rates: { unit: "um/h", given: { "100": 10, "110": 5 } }, sio2: null });
  validateEtchants(db, m => msgs.push(m));
  assert.ok(msgs.some(m => /X1: no source/.test(m)), msgs.join("; "));
  assert.ok(msgs.some(m => /X1: needs a \{111\} rate/.test(m)), msgs.join("; "));
  const sim = structuredClone(data["sim-examples"]), m2 = [];
  sim.wafers["100"][0].rate = "NOPE"; sim.wafers["100"][0].shapes[0].type = "blob";
  validateSimExamples(sim, new Set(db.etchants.map(e => e.key)), m => m2.push(m));
  assert.ok(m2.some(m => /rate NOPE/.test(m)) && m2.some(m => /unknown shape type blob/.test(m)), m2.join("; "));
});

test("Pal & Sato Table 4.1 values are unchanged (p. 87)", () => {
  const T = validateAll().data.etchants.tables["PalSato4.1"].columns;
  assert.deepEqual([T["30"]["100"], T["30"]["110"], T["30"]["111"]], [0.797, 1.455, 0.005]);
  assert.deepEqual([T["40"]["100"], T["40"]["110"], T["40"]["111"]], [0.599, 1.293, 0.009]);
  assert.deepEqual([T["50"]["100"], T["50"]["110"], T["50"]["111"]], [0.539, 0.870, 0.009]);
});
