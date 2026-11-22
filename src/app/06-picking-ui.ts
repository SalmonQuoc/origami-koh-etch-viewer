// --------------------------------------------------------------------- picking
const ray = new THREE.Raycaster(); ray.params.Line.threshold = 0;
function pickAt(ev) {
  const r = renderer.domElement.getBoundingClientRect();
  const m = new THREE.Vector2(((ev.clientX - r.left)/r.width)*2 - 1, -((ev.clientY - r.top)/r.height)*2 + 1);
  ray.setFromCamera(m, camera);
  return m;
}
let downAt = null;
renderer.domElement.addEventListener("pointerdown", ev => { downAt = [ev.clientX, ev.clientY]; });
renderer.domElement.addEventListener("pointerup", ev => {
  if (!downAt || Math.hypot(ev.clientX - downAt[0], ev.clientY - downAt[1]) > 5) return;
  if (S.mode !== "model") return;
  pickAt(ev);
  const objs = [model.low]; if (S.upper) objs.push(model.up);
  const hits = ray.intersectObjects(objs).filter(h => (h.object === model.low ? h.point.z <= 1e-6 : h.point.z >= -1e-6));
  if (!hits.length) { selectFace(null); document.getElementById("faceInfo").innerHTML = '<span class="note">Click any face.</span>'; return; }
  selectFace(hits[0].object.userData.tri2poly[hits[0].faceIndex]);
  document.getElementById("hint").textContent = "Drag to turn; try \"Along the selected line\"";
});
renderer.domElement.addEventListener("pointermove", ev => {
  if (simLike() && !ev.buttons) { simHover(ev); return; }
  if (S.mode !== "pit" || ev.buttons) { tip.style.display = "none"; return; }
  pickAt(ev);
  let hits = ray.intersectObjects(pit.pick || []);
  if (S.cut) { const pl = secPlane(pitLine()); hits = hits.filter(h => pl.distanceToPoint(h.point) >= -1e-3); }   // the removed side of the section line
  const h = hits[0];
  if (!h || h.object.userData.block) { tip.style.display = "none"; return; }
  const f = h.object.userData.faces[h.object.userData.tri2poly[h.faceIndex]];
  if (!Array.isArray(f.label)) { tip.style.display = "none"; return; }
  const a = C.angleToSurface(f.n);
  const kind = a < 1e-6 ? "floor" : Math.abs(a - 90) < 1e-6 ? "vertical wall" : f.n[2] > 0 ? "overhanging wall" : "sloping wall";
  tip.innerHTML = `<b>${idxHTML(f.label)}</b> &nbsp;${famHTML(f.fam)}<br>${kind}, ${fmtA(a)} to the surface`;
  const r = stage.getBoundingClientRect();
  tip.style.left = `${Math.min(ev.clientX - r.left + 14, r.width - 200)}px`; tip.style.top = `${ev.clientY - r.top + 12}px`; tip.style.display = "block";
});
renderer.domElement.addEventListener("pointerleave", () => { tip.style.display = "none"; });

// --------------------------------------------------------------------- UI wiring
const $ = (id: string): any => document.getElementById(id);   // page elements are looked up by id; typed loosely on purpose
function pressed(seg, attr, val) { for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset[attr] === val)); }
function fillOpenings() {
  $("selOpen").innerHTML = OPENINGS[S.wf].map((o, i) => `<option value="${i}">Example: ${o.name}</option>`).join("") + psOptions("pit") +
    `<option value="custom">Your own mask (${S.pitShapes.length} shape${S.pitShapes.length === 1 ? "" : "s"})</option>`;
  $("selOpen").value = String(S.open);
}
$("selRate").innerHTML = Object.entries(RATES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
function setHold() {
  $("holdTitle").textContent = HOLD[S.wf].title;
  $("holdSteps").innerHTML = HOLD[S.wf].steps.map(s => `<li>${s}</li>`).join("");
}
function sliderToT() { return pit.tmax*Number($("tSlider").value)/1000; }
function rebuild(resetView) {
  syncWaferUI(); uiSync();
  if (S.mode === "model") {
    buildModel();
    $("panelModel").classList.remove("hidden"); $("panelPit").classList.add("hidden"); $("panelSim").classList.add("hidden"); $("simBelow").classList.add("hidden"); $("pitBelow").classList.add("hidden"); hideCbar();
    $("panelFind").classList.add("hidden"); $("findBelow").classList.add("hidden");
    $("vAlong").classList.remove("hidden");
    $("hint").textContent = S.sel === null ? "Click a face of the model" : "Drag to turn";
    if (resetView) setView(dirOf(...OBL[S.wf]), new V3(0, 0, 0), true);
  } else if (simLike()) {
    $("panelSim").classList.remove("hidden"); $("panelFind").classList.add("hidden"); $("findBelow").classList.add("hidden");
    $("cornerBox").classList.toggle("hidden", S.mode !== "corner"); $("simExBox").classList.toggle("hidden", S.mode === "corner"); $("simBelow").classList.remove("hidden"); $("panelPit").classList.add("hidden"); $("panelModel").classList.add("hidden"); $("pitBelow").classList.add("hidden");
    $("vAlong").classList.add("hidden");
    $("hint").textContent = "Hover a surface for its plane";
    if (S.mode === "corner") { if (SIM.owner !== "corner") { clSync(); clBuild(false); simRun(); resetView = true; } }
    else if (SIM.wfLoaded !== S.wf || SIM.owner !== "sim") { SIM.wfLoaded = S.wf; SIM.owner = "sim"; SIM.preset = 0; fillSimPresets(); loadPreset(S.wf, 0); simRun(); resetView = true; }
    buildSim(resetView);
  } else if (S.mode === "find") {
    $("panelFind").classList.remove("hidden"); $("findBelow").classList.remove("hidden");
    for (const id of ["panelPit", "panelModel", "panelSim", "simBelow", "pitBelow"]) $(id).classList.add("hidden");
    hideCbar(); $("vAlong").classList.add("hidden"); $("fdWarn").classList.toggle("hidden", S.wf !== "111");
    $("hint").textContent = "Mask map of the whole wafer: zoom in to see the structures";
    if (FD.wfLoaded !== fdWf()) { FD.wfLoaded = fdWf(); FD.items = fdLecture(fdWf()); FD.sel = 0; FD.mc = null; resetView = true; }
    fdSync(); fdAnalyse(); fdCards(); fdReadout(); buildFind(resetView);
    requestAnimationFrame(() => { drawFindMap(); drawScope(); drawFdPlot(); });
  } else {
    S.t = sliderToT();
    $("panelPit").classList.remove("hidden"); $("panelModel").classList.add("hidden"); $("panelSim").classList.add("hidden"); $("simBelow").classList.add("hidden"); $("pitBelow").classList.remove("hidden");
    $("panelFind").classList.add("hidden"); $("findBelow").classList.add("hidden");
    buildPit();
    $("vAlong").classList.add("hidden");
    $("hint").textContent = "Hover a wall for its plane";
    if (resetView) setView(dirOf(...OBL[S.wf]), scene.userData.center, true);
  }
}
function setWafer(w) {
  S.wf = w; S.sel = null; S.open = 0; S.pitShapes = []; S.pitSel = -1; renderCustomList(); S.rate = OPENINGS[w][0].rate; $("selRate").value = S.rate;
  pressed($("segW"), "w", w); setHold(); fillOpenings();
  $("faceInfo").innerHTML = '<span class="note">Click any face. The page then draws where its plane cuts the wafer surface, the two normals and the angle between the planes.</span>';
  prepPit(); rebuild(true);
}
$("segW").addEventListener("click", e => { const b = e.target.closest("button"); if (b) setWafer(b.dataset.w); });
$("segM").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b || b.dataset.m === S.mode) return;
  S.mode = b.dataset.m; pressed($("segM"), "m", S.mode); tip.style.display = "none"; rebuild(true);
});
$("views").addEventListener("click", e => {
  const b = e.target.closest("button"); if (!b || b.disabled) return;
  const v = b.dataset.v;
  if (v === "along") {
    if (!model || !model.along) return;
    const cur = camera.position.clone().sub(controls.target);
    const d = model.along.dir.clone(); if (cur.dot(d) < 0) d.negate();
    setView(d, model.along.M); return;
  }
  const tgt = S.mode === "model" ? new V3(0, 0, 0) : scene.userData.center;
  setView(dirOf(...(v === "oblique" ? OBL[S.wf] : v === "back" ? [OBL[S.wf][0], OBL[S.wf][1] + 180] as [number, number] : VIEWS[v])), tgt);
});
$("selOpen").addEventListener("change", e => {
  if (e.target.value.startsWith("u:")) { psLoad(e.target.value.slice(2)); return; }
  S.open = e.target.value === "custom" ? "custom" : Number(e.target.value); S.pitSel = -1; S.pitLine = null;
  if (S.open !== "custom") { S.rate = OPENINGS[S.wf][S.open].rate; $("selRate").value = S.rate; }
  renderCustomList(); prepPit(); rebuild(true);
});
$("pitColor").addEventListener("change", e => { S.pitColor = e.target.value; buildPit(); });
$("pitRot").addEventListener("change", e => { S.rot = Number(e.target.value) || 0; prepPit(); rebuild(false); });
// ---- whole-wafer controls (one copy in the pit panel, one in the simulator panel, same state)
const WAFER_SRC = "100 mm wafer, 525 µm thick (Pal & Sato Table 2.1, p. 30); flat lengths 32.5 mm and 18 mm (Topline drawing A 174004 A); flat positions Lec 10 p. 10, secondary flat measured clockwise from the primary seen from the front. Lec 10 p. 10 labels the (110) flat ⟨111⟩; the (110) frames here follow Lec 4-1. The die is drawn to scale: use “Zoom to die”.";
for (const el of document.querySelectorAll(".waferUI")) el.innerHTML = `  <div class="row"><label><input type="checkbox" data-wu="on"> show the whole 100 mm wafer around the die</label></div>
  <div class="fields" data-wu="box">
    <label>doping (sets the secondary flat) <select data-wu="type"><option value="p">p-type</option><option value="n">n-type</option></select></label>
    <label>die centre on the wafer <span><input type="number" data-wu="x" step="1"> , <input type="number" data-wu="y" step="1"> mm</span></label>
    <div class="row"><button class="btn" data-wu="wview">Whole wafer</button><button class="btn" data-wu="dview">Zoom to die</button></div>
    <p class="note src" data-wu="txt"></p></div>`;
// ---- mask film controls (one copy in the pit panel, one in the simulator panel, same state)
for (const el of document.querySelectorAll(".maskUI")) el.innerHTML = `<div class="fields">
    <label>mask film <select data-mf="mat"><option value="sio2">thermal SiO₂</option><option value="si3n4">LPCVD Si₃N₄</option></select></label>
    <label>starting thickness <span><input type="number" data-mf="t0" min="0" max="20" step="0.05"> µm</span></label></div>
  <p class="note src" data-mf="src"></p>`;
function syncMaskUI() {
  for (const el of document.querySelectorAll(".maskUI")) {
    (el.querySelector('[data-mf="mat"]') as HTMLSelectElement).value = S.maskMat;
    (el.querySelector('[data-mf="t0"]') as HTMLInputElement).value = String(S.maskT0);
    el.querySelector('[data-mf="src"]').textContent = `Default ${MASKMAT[S.maskMat].src}. Drawn to scale: 1 µm on a die a few hundred µm wide is a thin sheet; zoom in on an edge to see it.`;
  }
}
document.addEventListener("change", e => {
  const t = e.target as HTMLInputElement, k = t && t.getAttribute && t.getAttribute("data-mf"); if (!k) return;
  if (k === "mat") { S.maskMat = t.value; S.maskT0 = MASKMAT[S.maskMat].t0; }
  else S.maskT0 = Math.min(20, Math.max(0, Number(t.value) || 0));
  syncMaskUI();
  if (S.mode === "pit") rebuild(false); else if (simLike()) { buildSim(false); updateSimReadout(); }
});
syncMaskUI();
// ---- flat arrows: the arrow along the primary flat and the outward arrow perpendicular to it can be hidden
// (one copy in each Show section and in Settings, same state, kept in SET)
for (const el of document.querySelectorAll(".arrUI")) el.innerHTML = `<div class="row arrRow"><span class="lbl">Flat arrows</span>`
  + (el.getAttribute("data-only") === "perp" ? "" : `<label title="Arrow and label along the primary flat"><input type="checkbox" data-arr="arrAlong"> along the flat</label>`)
  + `<label title="Arrow and label perpendicular to the primary flat, pointing outward"><input type="checkbox" data-arr="arrPerp"> ⊥ flat, outward</label></div>`;
function syncArrUI() { for (const c of document.querySelectorAll("[data-arr]")) (c as HTMLInputElement).checked = SET[c.getAttribute("data-arr")] !== false; }
document.addEventListener("change", e => {
  const t = e.target as HTMLInputElement, k = t && t.getAttribute && t.getAttribute("data-arr"); if (!k) return;
  SET[k] = t.checked; saveSet(); syncArrUI(); rebuild(false); if (S.mode === "find") drawFindMap();
});
syncArrUI();
function syncWaferUI() {
  const wf = simLike() ? SFR[SIM.fk].wf : S.wf;
  for (const el of document.querySelectorAll(".waferUI")) {
    el.querySelector('[data-wu="on"]').checked = S.waferOn; el.querySelector('[data-wu="box"]').classList.toggle("hidden", !S.waferOn);
    el.querySelector('[data-wu="type"]').value = S.wtype; el.querySelector('[data-wu="x"]').value = S.dieX; el.querySelector('[data-wu="y"]').value = S.dieY;
    const out = Math.hypot(S.dieX, S.dieY) > 47 ? " The die is outside the usable wafer area." : "";
    el.querySelector('[data-wu="txt"]').textContent = `(${wf}) ${S.wtype}-type: ${secFlatText(wf, S.wtype)}.${out} ${WAFER_SRC}`;
  }
}
function viewTo(target, zoom) {
  anim0Zoom = zoom; const d = camera.position.clone().sub(controls.target).normalize(); setView(d, target);
}
document.addEventListener("change", e => {
  const k = e.target.dataset && e.target.dataset.wu; if (!k) return;
  if (k === "on") S.waferOn = e.target.checked; else if (k === "type") S.wtype = e.target.value;
  else if (k === "x") S.dieX = Number(e.target.value) || 0; else if (k === "y") S.dieY = Number(e.target.value) || 0;
  syncWaferUI(); rebuild(k === "on" || k === "x" || k === "y");
});
document.addEventListener("click", e => {
  const k = e.target.dataset && e.target.dataset.wu; if (k !== "wview" && k !== "dview") return;
  if (k === "wview") viewTo(scene.userData.center, 1);
  else viewTo(scene.userData.die || scene.userData.center, frameR ? frameR/radius : 1);
});
document.addEventListener("change", e => {
  if (!e.target.classList.contains("cCompass")) return;
  S.compass = e.target.checked; for (const c of document.querySelectorAll(".cCompass")) c.checked = S.compass;
  if (S.mode === "pit") drawPitEditor(); else if (simLike()) drawMaskEditor();
});
