// =====================================================================================================
// the user's own presets (Etch simulator and Etched pit): kept in this browser, export and import as JSON
var PSETS = [];
try { const a = JSON.parse(localStorage.getItem("o3d-presets") || "[]"); if (Array.isArray(a)) PSETS = a.filter(q => q && q.id && q.name && q.data); } catch (e) {}
const psSave = () => { try { localStorage.setItem("o3d-presets", JSON.stringify(PSETS)); return true; } catch (e) { return false; } };
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
function psOptions(kind) {   // <optgroup> of the user's presets for this scene and wafer
  const L = (typeof PSETS === "undefined" ? [] : PSETS).filter(q => q.kind === kind && q.wf === S.wf);
  return L.length ? `<optgroup label="My presets">` + L.map(q => `<option value="u:${q.id}">☆ ${esc(q.name)}</option>`).join("") + `</optgroup>` : "";
}
const psBox = kind => document.querySelector(`.psBox[data-ps="${kind}"]`);
function psMsg(kind, txt) { const m = psBox(kind).querySelector("[data-ps-msg]"); m.textContent = txt || ""; m.classList.toggle("hidden", !txt); }
function psSel(kind) { const v = $(kind === "sim" ? "simPreset" : "selOpen").value; return v.startsWith("u:") ? v.slice(2) : null; }
function psSyncButtons() { for (const k of ["sim", "pit"]) psBox(k).querySelector("[data-ps-del]").disabled = !psSel(k); }
function psEtch(key) { const c = CUSTOM.find(x => x.key === key); return c ? JSON.parse(JSON.stringify(c)) : null; }
function psCapture(kind) {
  if (kind === "sim") return { fk: SIM.fk, rate: SIM.rate, t: SIM.t, thick: SIM.thick, pre: SIM.pre, rot: SIM.rot || 0, hx: SIM.hx, hy: SIM.hy, dxMax: SIM.dxMax || 0,
    cutAxis: SIM.cutAxis, cutPos: SIM.cutPos, cutLine: SIM.cutLine || null, shapes: JSON.parse(JSON.stringify(SIM.shapes)) };
  return { rate: S.rate, rot: S.rot || 0, shapes: JSON.parse(JSON.stringify(pitShapesNow())) };
}
function psRate(q, table) {   // the preset's etchant key here: re-create its custom etchant if this browser lacks it
  const r = q.data.rate; if (table[r] && !(r.startsWith("CU") && q.etch && table[r].name !== `★ ${q.etch.name}`)) return r;
  if (q.etch) {
    const same = CUSTOM.find(c => c.name === q.etch.name && JSON.stringify(Object.assign({}, c, { key: "" })) === JSON.stringify(Object.assign({}, q.etch, { key: "" })));
    if (same) return same.key;
    let n = 1; while (CUSTOM.some(x => x.key === `CU${n}`)) n++;
    const ce = Object.assign({}, q.etch, { key: `CU${n}` }); if (ceCompute(ce).ok) { CUSTOM.push(ce); saveCustom(); registerCustom(); return ce.key; }
  }
  return "PAL30";
}
function psLoad(id) {
  const q = PSETS.find(x => x.id === id); if (!q) return;
  const d = q.data, kind = q.kind;
  if (S.wf !== q.wf) setWafer(q.wf);
  if (kind === "sim") {
    Object.assign(SIM, { fk: d.fk, rate: psRate(q, SRATES), t: d.t, thick: d.thick || SIM.thick, pre: d.pre || 0, rot: d.rot || 0, hx: d.hx, hy: d.hy, dxMax: d.dxMax || 0,
      cutAxis: d.cutAxis || "y", cutPos: d.cutPos || 0, cutLine: d.cutLine && d.cutLine.a && d.cutLine.b ? d.cutLine : null, shapes: JSON.parse(JSON.stringify(d.shapes)), sel: -1, probes: null, cl: null, owner: "sim", wfLoaded: S.wf, preset: `u:${q.id}` });
    $("simNote").innerHTML = `Your preset <b>${esc(q.name)}</b>, saved ${esc(q.saved || "")}.`;
    fillSimPresets(); syncSimInputs(); renderShapeList(); simRun(); buildSim(true);
  } else {
    S.rate = psRate(q, RATES); S.rot = d.rot || 0; $("pitRot").value = S.rot; $("selRate").value = S.rate;
    S.pitShapes = JSON.parse(JSON.stringify(d.shapes)); S.pitSel = -1; S.open = "custom";
    fillOpenings(); $("selOpen").value = `u:${q.id}`; renderCustomList(); prepPit(); rebuild(true);
  }
  psMsg(kind, ""); psSyncButtons();
}
function psValid(q) {
  return q && typeof q.name === "string" && ["sim", "pit"].includes(q.kind) && ["100", "110", "111"].includes(q.wf) && q.data && Array.isArray(q.data.shapes)
    && q.data.shapes.every(s => s && SHAPE_TYPES[s.type]) && (q.kind === "pit" || (SFR[q.data.fk] && q.data.t > 0 && q.data.hx > 0 && q.data.hy > 0));
}
const psId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
for (const kind of ["sim", "pit"]) {
  const box = psBox(kind), nameEl = box.querySelector("[data-ps-name]");
  const save = () => {
    const data = psCapture(kind);
    if (!data.shapes.length) { psMsg(kind, "The mask has no shapes yet: add or draw one first."); return; }
    const name = nameEl.value.trim() || `${kind === "sim" ? "My simulation" : "My pit"} ${PSETS.filter(q => q.kind === kind).length + 1}`;
    const old = PSETS.find(q => q.kind === kind && q.wf === S.wf && q.name === name);
    const q = { id: old ? old.id : psId(), name, kind, wf: S.wf, saved: new Date().toISOString().slice(0, 10), data, etch: data.rate.startsWith("CU") ? psEtch(data.rate) : null };
    if (old) PSETS[PSETS.indexOf(old)] = q; else PSETS.push(q);
    const ok = psSave(); nameEl.value = "";
    if (kind === "sim") { SIM.preset = `u:${q.id}`; fillSimPresets(); } else { fillOpenings(); $("selOpen").value = `u:${q.id}`; }
    psSyncButtons();
    psMsg(kind, ok ? `${old ? "Updated" : "Saved"} “${name}” for the (${S.wf}) wafer. It is in the list above, under My presets.` : "Saved for this visit only: this browser does not allow storage.");
  };
  box.querySelector("[data-ps-save]").addEventListener("click", save);
  nameEl.addEventListener("keydown", (e: KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); save(); } });
  box.querySelector("[data-ps-del]").addEventListener("click", () => {
    const id = psSel(kind), i = PSETS.findIndex(q => q.id === id); if (i < 0) return;
    const nm = PSETS[i].name; PSETS.splice(i, 1); psSave();
    if (kind === "sim") { SIM.preset = -1; fillSimPresets(); } else fillOpenings();
    psSyncButtons(); psMsg(kind, `Deleted “${nm}”. The mask stays as it is.`);
  });
  box.querySelector("[data-ps-exp]").addEventListener("click", async () => {
    if (!PSETS.length) { psMsg(kind, "There are no presets to export yet."); return; }
    const m = await saveFile("my-etch-presets.json", JSON.stringify({ format: "origami-presets", version: 1, presets: PSETS }, null, 2)); if (m) { psMsg(kind, m); return; }
    psMsg(kind, `Exported ${PSETS.length} preset${PSETS.length === 1 ? "" : "s"} (all scenes and wafers).`);
  });
  box.querySelector("[data-ps-imp]").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text()), list = Array.isArray(j) ? j : j.presets; let n = 0, bad = 0;
      for (const q of list || []) { if (psValid(q)) { PSETS.push(Object.assign({}, q, { id: psId() })); n++; } else bad++; }
      psSave(); if (kind === "sim") fillSimPresets(); else fillOpenings(); psSyncButtons();
      psMsg(kind, `Imported ${n} preset${n === 1 ? "" : "s"}${bad ? `; skipped ${bad} that could not be read` : ""}. Presets for another wafer show when you pick that wafer.`);
    } catch (err) { psMsg(kind, "This file could not be read as a preset list."); }
    e.target.value = "";
  });
}
$("simPreset").addEventListener("change", psSyncButtons); $("selOpen").addEventListener("change", psSyncButtons);
$("stClearPs").addEventListener("click", () => { PSETS = []; psSave(); SIM.preset = SIM.preset && String(SIM.preset).startsWith("u:") ? -1 : SIM.preset; fillSimPresets(); fillOpenings(); psSyncButtons(); });
fillSimPresets(); fillOpenings(); psSyncButtons();

