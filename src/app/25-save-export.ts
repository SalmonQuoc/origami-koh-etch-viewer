// =====================================================================================================
// 💾 Save: one project file (.json) with the parts the user ticks (masks and process of each scene, custom etchants,
// presets, settings), opening such a file (the user ticks which parts to load), and export for other programs:
// masks as SVG or DXF, pictures as PNG, the etched surface as STL. Several exported files go into one .zip.

const SV_PARTS = {   // project parts: what is saved and how it is put back
  view:     { name: "Wafer and scene", note: "which wafer and which scene are open" },
  sim:      { name: "Etch simulator", note: "mask, etchant, time, thickness, domain, resolution, section line" },
  pit:      { name: "Etched pit", note: "mask openings, etchant, flat error" },
  corner:   { name: "Corner lab", note: "etchant, depth, mesa size, compensation" },
  find:     { name: "Find orientation", note: "alignment-mark layout and etch settings" },
  etchants: { name: "Custom etchants", note: "your etchants from the Custom etchant dialog" },
  presets:  { name: "My presets", note: "saved masks of the simulator and the pit, all wafers" },
  settings: { name: "Settings", note: "layout, theme, snap step, simulator defaults" },
};
function svCapture(part) {
  switch (part) {
    case "view": return { wf: S.wf, mode: S.mode };
    case "sim": return Object.assign(psCapture("sim"), { quality: SIM.quality, wf: S.wf, owner: SIM.owner || "sim" });
    case "pit": return Object.assign(psCapture("pit"), { wf: S.wf, open: S.open });
    case "corner": return { rate: CL.rate, H: CL.H, A: CL.A, type: CL.type, s1: CL.s1, s2: CL.s2 };
    case "find": return { relW: FD.relW, delta: FD.delta, reveal: FD.reveal, rate: FD.rate, final: FD.final, t: FD.t, res: FD.res, correct: FD.correct, items: mdClone(FD.items || []), wf: S.wf };
    case "etchants": return mdClone(CUSTOM);
    case "presets": return mdClone(PSETS);
    case "settings": return mdClone(SET);
  }
  return null;
}
function svHas(part) {   // is there anything of this part worth saving
  if (part === "etchants") return CUSTOM.length > 0;
  if (part === "presets") return PSETS.length > 0;
  if (part === "sim") return SIM.shapes.length > 0;
  return true;
}
function svProject(parts) {
  const out = { format: "origami-project", version: 1, saved: new Date().toISOString(), page: "Origami 3D Viewer (origami-koh-etch-viewer)", parts: {} };
  for (const p of parts) { const v = svCapture(p); if (v != null) out.parts[p] = v; }
  return out;
}
// open: put back the ticked parts. Custom etchants are added (not replaced) and the scenes use their new keys.
function svApply(proj, parts) {
  const P = proj.parts || {}, done = [], keyMap = {};
  const has = k => parts.includes(k) && P[k] != null;
  if (has("settings") && typeof P.settings === "object") { Object.assign(SET, P.settings); saveSet(); applyLook(); applyLayout(); done.push("settings"); }
  if (has("etchants") && Array.isArray(P.etchants)) {
    let n = 0;
    for (const c of P.etchants) {
      if (!c || !c.name || !["base", "own"].includes(c.mode)) continue;
      const same = CUSTOM.find(x => x.name === c.name && JSON.stringify(Object.assign({}, x, { key: "" })) === JSON.stringify(Object.assign({}, c, { key: "" })));
      if (same) { keyMap[c.key] = same.key; continue; }
      const ce = Object.assign(ceDefault(), c); let k = 1; while (CUSTOM.some(x => x.key === `CU${k}`)) k++; ce.key = `CU${k}`;
      if (ceCompute(ce).ok) { CUSTOM.push(ce); keyMap[c.key] = ce.key; n++; }
    }
    saveCustom(); registerCustom(); done.push(`${n} custom etchant${n === 1 ? "" : "s"}`);
  }
  const rate = (r, table) => { const k = keyMap[r] || r; return table[k] ? k : "PAL30"; };
  if (has("presets") && Array.isArray(P.presets)) {
    let n = 0;
    for (const q of P.presets) { if (!psValid(q)) continue; if (PSETS.some(x => x.name === q.name && x.kind === q.kind && x.wf === q.wf && JSON.stringify(x.data) === JSON.stringify(q.data))) continue; PSETS.push(Object.assign({}, q, { id: psId() })); n++; }
    psSave(); fillSimPresets(); fillOpenings(); psSyncButtons(); done.push(`${n} preset${n === 1 ? "" : "s"}`);
  }
  const wf = (P.view && has("view") && P.view.wf) || (has("sim") && P.sim.wf) || (has("pit") && P.pit.wf) || (has("find") && P.find.wf) || S.wf;
  if (["100", "110", "111"].includes(wf) && wf !== S.wf) setWafer(wf);
  if (has("sim") && Array.isArray(P.sim.shapes) && P.sim.shapes.every(s => s && SHAPE_TYPES[s.type]) && SFR[P.sim.fk]) {
    const d = P.sim;
    Object.assign(SIM, { fk: d.fk, rate: rate(d.rate, SRATES), t: d.t > 0 ? d.t : SIM.t, thick: d.thick || SIM.thick, pre: d.pre || 0, rot: d.rot || 0, hx: d.hx > 0 ? d.hx : SIM.hx, hy: d.hy > 0 ? d.hy : SIM.hy, dxMax: d.dxMax || 0,
      quality: d.quality || SIM.quality, cutAxis: d.cutAxis || "y", cutPos: d.cutPos || 0, cutLine: d.cutLine && d.cutLine.a && d.cutLine.b ? d.cutLine : null, shapes: mdClone(d.shapes),
      sel: -1, probes: null, cl: null, owner: "sim", wfLoaded: S.wf, preset: -1 });
    $("simNote").innerHTML = `Opened from a project file saved ${esc(String(proj.saved || "").slice(0, 10))}.`;
    fillSimPresets(); syncSimInputs(); renderShapeList(); SIM.dirty = true; updateDirtyNote(); done.push("etch simulator");
  }
  if (has("pit") && Array.isArray(P.pit.shapes) && P.pit.shapes.every(s => s && SHAPE_TYPES[s.type])) {
    const d = P.pit; S.rate = rate(d.rate, RATES); S.rot = d.rot || 0; $("pitRot").value = S.rot; $("selRate").value = S.rate;
    if (d.open && d.open !== "custom" && !String(d.open).startsWith("u:")) S.open = d.open; else { S.open = "custom"; S.pitShapes = mdClone(d.shapes); }
    S.pitSel = -1; fillOpenings(); renderCustomList(); prepPit(); done.push("etched pit");
  }
  if (has("corner") && CL_TYPES[P.corner.type]) { Object.assign(CL, P.corner, { rate: rate(P.corner.rate, SRATES), built: false }); if (SIM.owner === "corner") SIM.owner = "none"; clSync(); done.push("corner lab"); }
  if (has("find") && Array.isArray(P.find.items)) {
    const d = P.find; Object.assign(FD, { relW: d.relW, delta: d.delta, reveal: d.reveal, rate: rate(d.rate, SRATES), final: d.final, t: d.t, res: d.res, correct: d.correct, items: mdClone(d.items), sel: 0, mc: null, wfLoaded: fdWf() });
    fdSync(); done.push("find orientation");
  }
  const mode = has("view") && P.view.mode;
  if (mode && document.querySelector(`#segM [data-m="${mode}"]`)) { S.mode = mode; pressed($("segM"), "m", mode); }
  if (S.mode === "sim" && has("sim")) { SIM.dirty = false; updateDirtyNote(); simRun(); }
  rebuild(true); if (S.mode === "find") findChanged(true);
  return done;
}

// ---- export: files for other programs
function svBytes(s) { return new TextEncoder().encode(s); }
function svDataBytes(url) { const b = atob(url.split(",")[1]), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
function svPNG3D() { renderer.render(scene, camera); return svDataBytes(renderer.domElement.toDataURL("image/png")); }   // drawn and read in one task: no preserved buffer needed
function svCanvasPNG(id) { const c = $(id); return c && c.width > 2 ? svDataBytes(c.toDataURL("image/png")) : null; }
function svSTL() {   // binary STL of the etched surface (triangles of the 3D view, µm)
  const m = simScene && simScene.pick; if (!m) return null;
  const P = m.geometry.getAttribute("position").array, n = Math.floor(P.length/9), buf = new ArrayBuffer(84 + 50*n), dv = new DataView(buf);
  const head = "Origami 3D Viewer etched silicon surface, units um"; for (let i = 0; i < 80; i++) dv.setUint8(i, i < head.length ? head.charCodeAt(i) : 32);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const o = 84 + 50*t, a = 9*t, ux = P[a+3] - P[a], uy = P[a+4] - P[a+1], uz = P[a+5] - P[a+2], vx = P[a+6] - P[a], vy = P[a+7] - P[a+1], vz = P[a+8] - P[a+2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx; const L = Math.hypot(nx, ny, nz) || 1; nx /= L; ny /= L; nz /= L;
    dv.setFloat32(o, nx, true); dv.setFloat32(o + 4, ny, true); dv.setFloat32(o + 8, nz, true);
    for (let k = 0; k < 9; k++) dv.setFloat32(o + 12 + 4*k, P[a + k], true);
    dv.setUint16(o + 48, 0, true);
  }
  return new Uint8Array(buf);
}
const SV_EXPORTS = {   // id: name, file, availability, maker
  simSvg:  { name: "Etch simulator mask · SVG", file: "simulator-mask.svg", ok: () => SIM.shapes.length > 0, make: () => { const i = maskExportInfo("sim"); return svBytes(maskSVG(i.shapes, i)); } },
  simDxf:  { name: "Etch simulator mask · DXF", file: "simulator-mask.dxf", ok: () => SIM.shapes.length > 0, make: () => { const i = maskExportInfo("sim"); return svBytes(maskDXF(i.shapes, i)); } },
  pitSvg:  { name: "Etched pit mask · SVG", file: "pit-mask.svg", ok: () => pitShapesNow().length > 0, make: () => { const i = maskExportInfo("pit"); return svBytes(maskSVG(i.shapes, i)); } },
  pitDxf:  { name: "Etched pit mask · DXF", file: "pit-mask.dxf", ok: () => pitShapesNow().length > 0, make: () => { const i = maskExportInfo("pit"); return svBytes(maskDXF(i.shapes, i)); } },
  view3d:  { name: "3D view as shown · PNG", file: "3d-view.png", ok: () => true, make: svPNG3D },
  simStl:  { name: "Etched surface of the simulation · STL", file: "etched-surface.stl", ok: () => simLike() && !!(simScene && simScene.pick), make: svSTL, why: "run the Etch simulator (or Corner lab) first" },
  simSec:  { name: "Simulator section A → B · PNG", file: "simulator-section.png", ok: () => simLike() && !!SIM.res, make: () => svCanvasPNG("secCanvas"), why: "run the simulator first" },
  pitSec:  { name: "Pit section A → B · PNG", file: "pit-section.png", ok: () => S.mode === "pit", make: () => svCanvasPNG("pitSecCanvas"), why: "open the Etched pit scene" },
  project: { name: "Project file (everything ticked above) · JSON", file: "", ok: () => true, make: null },
};
// a .zip without compression (store), enough for a handful of files
function svZip(files) {
  const T = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; T[n] = c >>> 0; }
  const crc = u => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = T[(c ^ u[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const parts = [], cen = []; let off = 0;
  for (const f of files) {
    const nm = svBytes(f.name), c = crc(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, time, true); h.setUint16(12, date, true);
    h.setUint32(14, c, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, nm.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nm, f.data);
    const e = new DataView(new ArrayBuffer(46));
    e.setUint32(0, 0x02014b50, true); e.setUint16(4, 20, true); e.setUint16(6, 20, true); e.setUint16(8, 0x0800, true); e.setUint16(10, 0, true); e.setUint16(12, time, true); e.setUint16(14, date, true);
    e.setUint32(16, c, true); e.setUint32(20, f.data.length, true); e.setUint32(24, f.data.length, true); e.setUint16(28, nm.length, true); e.setUint32(42, off, true);
    cen.push(new Uint8Array(e.buffer), nm); off += 30 + nm.length + f.data.length;
  }
  const csz = cen.reduce((a, u) => a + u.length, 0), end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csz, true); end.setUint32(16, off, true);
  return new Blob([...parts, ...cen, new Uint8Array(end.buffer)], { type: "application/zip" });
}

// ---- dialog
const svName = () => ($("svName").value.trim() || "etch-project").replace(/[\\/:*?"<>|]+/g, "-").replace(/\.json$/i, "");
function svMsg(t) { $("svMsg").textContent = t || ""; $("svMsg").classList.toggle("hidden", !t); }
const svTicked = id => Array.from(document.querySelectorAll(`#${id} input:checked`)).map(e => (e as HTMLInputElement).value);
function svFill() {
  let keep = []; try { keep = JSON.parse(localStorage.getItem("o3d-save-parts") || "null") || []; } catch (e) {}
  $("svParts").innerHTML = Object.entries(SV_PARTS).map(([k, v]) => { const on = svHas(k), ck = on && (!keep.length || keep.includes(k));
    return `<label class="${on ? "" : "off"}"><input type="checkbox" value="${k}"${ck ? " checked" : ""}${on ? "" : " disabled"}><span>${v.name}<br><span class="note">${on ? v.note : "nothing saved yet"}</span></span></label>`; }).join("");
  $("svExp").innerHTML = Object.entries(SV_EXPORTS).map(([k, v]) => { const on = v.ok();
    return `<label class="${on ? "" : "off"}"><input type="checkbox" value="${k}"${on && (k === "simDxf" || k === "simSvg") && SIM.shapes.length ? " checked" : ""}${on ? "" : " disabled"}><span>${v.name}${on ? "" : `<br><span class="note">${(v as any).why || "nothing to export"}</span>`}</span></label>`; }).join("");
  $("svOpenBox").classList.add("hidden"); svMsg("");
}
let svPending = null;
$("bSave").addEventListener("click", () => { svFill(); $("dlgSave").showModal(); });
document.addEventListener("keydown", e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !(MD && MD.on) && !document.querySelector("dialog[open]")) { e.preventDefault(); svFill(); $("dlgSave").showModal(); } });
$("dlgSave").addEventListener("click", ev => { if (ev.target.closest("[data-close]") || ev.target === $("dlgSave")) $("dlgSave").close(); });
$("svSave").addEventListener("click", async () => {
  const parts = svTicked("svParts"); if (!parts.length) { svMsg("Tick at least one part to save."); return; }
  try { localStorage.setItem("o3d-save-parts", JSON.stringify(parts)); } catch (e) {}
  const m = await saveFile(`${svName()}.json`, JSON.stringify(svProject(parts), null, 1));
  svMsg(m || `Saved ${parts.map(p => SV_PARTS[p].name.toLowerCase()).join(", ")} in ${svName()}.json.`);
});
$("svExport").addEventListener("click", async () => {
  const ids = svTicked("svExp"); if (!ids.length) { svMsg("Tick at least one file to export."); return; }
  const files = [], fail = [];
  for (const id of ids) {
    const x = SV_EXPORTS[id];
    if (id === "project") { const parts = svTicked("svParts"); files.push({ name: `${svName()}.json`, data: svBytes(JSON.stringify(svProject(parts), null, 1)) }); continue; }
    try { const d = x.make(); if (d && d.length) files.push({ name: x.file, data: d }); else fail.push(x.name); } catch (e) { fail.push(x.name); }
  }
  if (!files.length) { svMsg(`Nothing could be exported${fail.length ? `: ${fail.join(", ")}` : ""}.`); return; }
  const text = f => /\.(json|svg|dxf)$/.test(f.name);
  const one = files.length === 1, f0 = files[0];
  const m = one ? await saveFile(f0.name, text(f0) ? new TextDecoder().decode(f0.data) : new Blob([f0.data]), f0.name.endsWith(".svg") ? "image/svg+xml" : f0.name.endsWith(".dxf") ? "application/dxf" : "application/octet-stream")
    : await saveFile(`${svName()}-export.zip`, svZip(files), "application/zip");
  svMsg(m || `Exported ${files.map(f => f.name).join(", ")}${one ? "" : ` in ${svName()}-export.zip`}.${fail.length ? ` Could not make: ${fail.join(", ")}.` : ""}`);
});
$("svOpen").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
  let j = null; try { j = JSON.parse(await f.text()); } catch (err) { svMsg("This file is not a JSON file."); return; }
  if (j && j.format === "origami-presets") j = { format: "origami-project", parts: { presets: j.presets } };
  else if (j && j.format === "origami-etchants") j = { format: "origami-project", parts: { etchants: j.etchants } };
  if (!j || j.format !== "origami-project" || !j.parts) { svMsg("This file is not a project file of this page."); return; }
  svPending = j;
  const ks = Object.keys(SV_PARTS).filter(k => j.parts[k] != null);
  $("svOpenInfo").textContent = `${f.name}${j.saved ? `, saved ${String(j.saved).slice(0, 10)}` : ""}: tick the parts to load. Masks and settings replace the current ones; custom etchants and presets are added to yours.`;
  $("svOpenParts").innerHTML = ks.map(k => `<label><input type="checkbox" value="${k}" checked><span>${SV_PARTS[k].name}<br><span class="note">${SV_PARTS[k].note}</span></span></label>`).join("") || `<p class="note">The file holds no parts this page knows.</p>`;
  $("svOpenBox").classList.remove("hidden"); svMsg("");
});
$("svOpenCancel").addEventListener("click", () => { svPending = null; $("svOpenBox").classList.add("hidden"); });
$("svLoad").addEventListener("click", () => {
  if (!svPending) return; const parts = svTicked("svOpenParts"); if (!parts.length) { svMsg("Tick at least one part to load."); return; }
  let done = []; try { done = svApply(svPending, parts); } catch (err) { svMsg(`Loading stopped with an error: ${err && err.message ? err.message : err}`); return; }
  svPending = null; $("svOpenBox").classList.add("hidden"); svMsg(`Loaded: ${done.join(", ") || "nothing"}.`);
});
