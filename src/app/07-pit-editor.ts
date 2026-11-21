// ---- the pit mask editor: the same handling as the simulator's (add, select, drag, edit in the table)
function fillPcTypes() { $("pcType").innerHTML = Object.entries(SHAPE_TYPES).filter(([, v]) => !v.noAdd).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join(""); }
// any edit of an example turns it into the user's own mask, starting from the example
function toCustom() {
  if (S.open === "custom") return;
  S.pitShapes = [presetShape()]; S.open = "custom"; fillOpenings();
}
// a new parallelogram gets its sides along two {111} traces of the wafer (vertical walls first)
function paraSides(e) {
  const t = inPlaneDirs(e).filter(d => d.wall != null).sort((p, q) => q.wall - p.wall || p.ang - q.ang);
  return t.length >= 2 ? { a1: t[0].ang, a2: t[1].ang } : { a1: 0, a2: 90 };
}
function newPitShape(type, x, y) {
  const d = SHAPE_TYPES[type].d;   // the simulator defaults, doubled: pit openings are usually larger
  const o: Record<string, number> = { w: 2*d.w, h: 2*(d.h || d.w) }; if (d.t) o.t = 2*d.t; if (d.n) o.n = d.n;
  return Object.assign(shp(type, "open", snapV(x), snapV(y), o.w, o.h), d, o, { pre: 0 }, type === "para" ? paraSides(C.FRAMES[S.wf]) : {});
}
let pitBusy = 0;
function pitChanged(resetView) {   // after an edit: rebuild the pit (deferred so the editor redraws first)
  fillOpenings(); renderCustomList(); drawPitEditor(true);
  $("hint").textContent = "Updating the 3D view…";
  clearTimeout(pitBusy);
  pitBusy = setTimeout(() => { prepPit(); rebuild(!!resetView); drawPitEditor(); }, 30);
}
// direction selects for a shape card or table row: "edges along" (or both sides of a parallelogram)
function dirSelects(sh, i, dirs) {
  if (sh.type === "pts") return "";
  if (sh.type === "para") return dirSelect(dirs, sh.a1, `data-i="${i}" data-k="a1"`, "side 1 along") + dirSelect(dirs, sh.a2, `data-i="${i}" data-k="a2"`, "side 2 along");
  return dirSelect(dirs, sh.ang, `data-i="${i}" data-k="ang"`, sh.type === "circle" || sh.type === "ring" || sh.type === "free" ? "turned to" : "edges along");
}
function renderCustomList() {
  const list = pitShapesNow(), dirs = inPlaneDirs(C.FRAMES[S.wf]);
  const f = (i, k, v, lbl, st = 5) => `<label>${lbl}<input type="number" step="${st}" data-i="${i}" data-k="${k}" aria-label="${lbl}" value="${+(+(v == null ? 0 : v)).toFixed(1)}"></label>`;
  const cards = list.map((sh, i) => {
    const T = SHAPE_TYPES[sh.type] || SHAPE_TYPES.rect;
    const lab = { w: "w", h: "h", t: sh.type === "ring" || sh.type === "star" ? "inner" : "arm t", n: sh.type === "star" ? "points" : "sides", k: "scale %" };
    const dims = T.f.map(k => f(i, k, sh[k] == null ? 100 : sh[k], lab[k], k === "n" ? 1 : 5)).join("");
    return `<div class="card${i === S.pitSel ? " sel" : ""}" data-row="${i}">
      <div class="top"><span><b>${i + 1}. ${T.name}</b>${S.open === "custom" ? "" : ' <span class="note">(the example; editing it makes it your own mask)</span>'}</span><span><button class="x" data-pcdup="${i}" title="duplicate (Ctrl+D)" aria-label="duplicate">⧉</button><button class="x" data-pcdel="${i}" title="remove" aria-label="remove">×</button></span></div>
      <div class="fl">${f(i, "cx", sh.cx, "x")}${f(i, "cy", sh.cy, "y")}${sh.type === "para" ? f(i, "a1", sh.a1, "side 1°", 1) + f(i, "a2", sh.a2, "side 2°", 1) : sh.type === "pts" ? "" : f(i, "ang", sh.ang, "angle°", 1)}${f(i, "pre", sh.pre || 0, "pre-etch")}</div>
      ${dims ? `<div class="fl">${dims}<span class="note">${sh.type === "free" ? sh.pts.length + " corners" : "µm"}</span></div>` : ""}${dirSelects(sh, i, dirs)}</div>`;
  }).join("");
  $("pcList").innerHTML = list.length ? cards : `<p class="note">No openings. Pick a shape and press “Add shape”, or double-click in the editor.</p>`;
  $("pcDup").disabled = $("pcDel").disabled = !(S.pitSel >= 0 && S.pitSel < list.length);
}
// 2D editor of the pit mask: openings over the mask, with the cavity edge at the surface at the current time
function drawPitEditor(keepExtent?: boolean) {
  const cv = $("pitCanvas"); if (!cv || !pit) return;
  const ctx = cv.getContext("2d"), list = pitShapesNow();
  if (!keepExtent || !S.pitEd) {
    // fit the shapes and the cavity at the current time, with a margin
    const pts = list.flatMap(shapeLoops).flat().concat((pit.cavs || []).flatMap(c => C.outline(c.H, 0)));
    const ax = pts.length ? Math.max(...pts.map(p => Math.abs(p[0]))) : 200, ay = pts.length ? Math.max(...pts.map(p => Math.abs(p[1]))) : 200;
    const r50 = v => Math.max(100, Math.ceil(v/50)*50), m = 0.2*Math.max(ax, ay) + 30;
    S.pitEd = { hx: r50(ax + m), hy: r50(Math.max(ay + m, 0.35*(ax + m))) };
  }
  const { hx, hy } = S.pitEd; cv.style.width = "";
  let wcss = cv.clientWidth || 300, s = (wcss - 20)/(2*hx);
  const sh_ = (edMaxH(cv) - 34)/(2*hy); if (sh_ < s) { s = sh_; wcss = Math.round(2*hx*s + 20); cv.style.width = `${wcss}px`; }
  const hcss = 2*hy*s + 34;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(wcss*dpr); cv.height = Math.round(hcss*dpr); cv.style.height = `${hcss}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, wcss, hcss);
  const V = edView("pitCanvas", s, 10, 10, 2*hx*s, 2*hy*s, 0, 0, 40);
  Object.assign(S.pitEd, { s: V.s, ox: V.ox, oy: V.oy, view: V });
  const toC = p => [S.pitEd.ox + p[0]*S.pitEd.s, S.pitEd.oy - p[1]*S.pitEd.s], col = c => "#" + COL[c].getHexString();
  const path = (c, P) => { P.map(toC).forEach((q, k) => k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])); c.closePath(); };
  ctx.fillStyle = col("scene-bg"); ctx.fillRect(10, 10, 2*hx*s, 2*hy*s);
  ctx.save(); ctx.beginPath(); ctx.rect(10, 10, 2*hx*s, 2*hy*s); ctx.clip();   // zoomed content stays in the plot
  // grid
  const g = edGrid(V.X1 - V.X0); ctx.strokeStyle = col("s-ink"); ctx.globalAlpha = 0.08; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = Math.ceil(V.X0/g)*g; x <= V.X1; x += g) { const [a] = toC([x, 0]); ctx.moveTo(a, 10); ctx.lineTo(a, 10 + 2*hy*s); }
  for (let y = Math.ceil(V.Y0/g)*g; y <= V.Y1; y += g) { const [, b] = toC([0, y]); ctx.moveTo(10, b); ctx.lineTo(10 + 2*hx*s, b); }
  ctx.stroke(); ctx.globalAlpha = 1;
  // mask with the openings cut out
  const tmp = document.createElement("canvas"); tmp.width = cv.width; tmp.height = cv.height;
  const t = tmp.getContext("2d"); t.setTransform(dpr, 0, 0, dpr, 0, 0);
  t.globalAlpha = 0.6; t.fillStyle = col("mask"); t.fillRect(10, 10, 2*hx*s, 2*hy*s); t.globalAlpha = 1;
  t.globalCompositeOperation = "destination-out"; t.beginPath();
  for (const sh of list) for (const P of shapePieces(sh)) path(t, P);
  t.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(tmp, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // cavity edge at the surface (not while dragging: it is from before the move)
  if (!keepExtent && pit.cavs && pit.cavs.length) {
    const outs = pit.cavs.map(c => C.outline(c.H, 0)).filter(O => O.length >= 3);
    ctx.strokeStyle = col("ghost"); ctx.lineWidth = 1.4; ctx.setLineDash([5, 3]); ctx.beginPath();
    for (const [a, b] of unionEdges2(outs, 1e-6)) { const A = toC(a), B = toC(b); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); }
    ctx.stroke(); ctx.setLineDash([]);
  }
  // shape outlines
  list.forEach((sh, i) => {
    ctx.beginPath(); for (const P of shapeLoops(sh)) path(ctx, P);
    ctx.lineWidth = i === S.pitSel ? 2.4 : 1.1; ctx.strokeStyle = i === S.pitSel ? col("accent") : col("s-ink"); ctx.stroke();
    if (i === S.pitSel) { const [a, b] = toC([sh.cx, sh.cy]); ctx.fillStyle = col("accent"); ctx.fillRect(a - 3, b - 3, 6, 6); }
  });
  ctx.restore();
  ctx.strokeStyle = col("s-ink"); ctx.lineWidth = 1; ctx.strokeRect(10, 10, 2*hx*s, 2*hy*s);
  ctx.fillStyle = col("accent"); ctx.fillRect(10, 10 + 2*hy*s + 2, 2*hx*s, 3);
  ctx.font = "11px IBM Plex Sans, sans-serif";
  ctx.fillText(`primary flat side; x along ${plainIdx(C.FRAME_IDX[S.wf][0])}; grid ${g} µm`, 12, 10 + 2*hy*s + 18);
  if (S.compass) drawCompass(ctx, 10 + 2*hx*s - 44, 54, 30, inPlaneDirs(C.FRAMES[S.wf]), S.rot || 0);
  const sel = list[S.pitSel];
  drawCoords(ctx, "pitCanvas", { X0: V.X0, X1: V.X1, Y0: V.Y0, Y1: V.Y1, toC, g, grid: false, sel: sel ? [sel.cx, sel.cy] : null });
  drawOverlay(ctx, "pitCanvas", toC);
}
(() => {
  const cv = $("pitCanvas"); let drag = null;
  const world = ev => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left - S.pitEd.ox)/S.pitEd.s, -(ev.clientY - r.top - S.pitEd.oy)/S.pitEd.s]; };
  const hit = (x, y) => { const list = pitShapesNow(); for (let i = list.length - 1; i >= 0; i--) if (shapePieces(list[i]).some(P => EE.isOpen([{ pts: P, op: "open" }], x, y))) return i; return -1; };
  cv.addEventListener("pointerdown", ev => {
    if (!S.pitEd) return;
    const [x, y] = world(ev), i = hit(x, y);
    S.pitSel = i; renderCustomList();
    if (i >= 0) {
      let j = i, dup = false;
      if (ev.altKey) { toCustom(); S.pitShapes.push(JSON.parse(JSON.stringify(S.pitShapes[i]))); j = S.pitShapes.length - 1; S.pitSel = j; dup = true; renderCustomList(); }   // Alt-drag: drag a copy
      const sh = pitShapesNow()[j]; drag = { i: j, x0: x, y0: y, cx: sh.cx, cy: sh.cy, moved: dup }; cv.setPointerCapture(ev.pointerId); cv.style.cursor = "grabbing"; }
    drawPitEditor(true);
  });
  cv.addEventListener("pointermove", ev => {
    if (!drag || !S.pitEd) return; const [x, y] = world(ev);
    if (!drag.moved) { toCustom(); drag.moved = true; }
    if (!S.pitShapes[drag.i]) return;
    const sh = S.pitShapes[drag.i]; sh.cx = snapV(drag.cx + x - drag.x0); sh.cy = snapV(drag.cy + y - drag.y0);
    drawPitEditor(true); $("hint").textContent = `Moving to (${sh.cx}, ${sh.cy}) µm; let go to update the 3D view`;
  });
  const end = () => { cv.style.cursor = ""; if (drag && drag.moved) pitChanged(false); else drawPitEditor(); drag = null; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("dblclick", ev => {
    const [x, y] = world(ev); if (hit(x, y) >= 0) return;
    toCustom(); S.pitShapes.push(newPitShape($("pcType").value, x, y)); S.pitSel = S.pitShapes.length - 1; pitChanged(false);
  });
  cv.addEventListener("keydown", ev => {
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === "d" || ev.key === "D")) { ev.preventDefault(); $("pcDup").click(); return; }
    if (!(S.pitSel >= 0)) return;
    const st = (ev.shiftKey ? 5 : 1)*(Number(SET.snap) || 1), mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[ev.key];
    if (mv) { ev.preventDefault(); toCustom(); const sh = S.pitShapes[S.pitSel]; sh.cx += mv[0]; sh.cy += mv[1]; pitChanged(false); }
    else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); $("pcDel").click(); }
  });
})();
$("pcAdd").addEventListener("click", () => {
  toCustom();
  // place the new shape beside the others so it does not land on top of them
  const n = S.pitShapes.length, x = n ? Math.max(...S.pitShapes.flatMap(shapeLoops).flat().map(p => p[0])) + 2*SHAPE_TYPES[$("pcType").value].d.w/2 + 40 : 0;
  S.pitShapes.push(newPitShape($("pcType").value, x, 0)); S.pitSel = S.pitShapes.length - 1; pitChanged(true);
});
$("pcDup").addEventListener("click", () => {
  if (!(S.pitSel >= 0)) return; toCustom();
  const c = JSON.parse(JSON.stringify(S.pitShapes[S.pitSel])); c.cx += 40; c.cy -= 40;
  S.pitShapes.push(c); S.pitSel = S.pitShapes.length - 1; pitChanged(false);
});
$("pcDel").addEventListener("click", () => {
  if (!(S.pitSel >= 0)) return; toCustom();
  S.pitShapes.splice(S.pitSel, 1); S.pitSel = -1; pitChanged(false);
});
$("pcClear").addEventListener("click", () => { S.open = "custom"; S.pitShapes = []; S.pitSel = -1; pitChanged(false); });
$("pcList").addEventListener("change", e => {
  const el = e.target, i = Number(el.dataset.i), k = el.dataset.k; if (!(i >= 0) || !k) return;
  if (el.value === "") return;   // "custom angle" picked in a direction list: nothing to change
  toCustom(); S.pitShapes[i][k] = Number(el.value); S.pitSel = i; pitChanged(false);
});
$("pcList").addEventListener("click", e => {
  const d = e.target.closest("[data-pcdel]"); if (d) { S.pitSel = Number(d.dataset.pcdel); $("pcDel").click(); return; }
  const u = e.target.closest("[data-pcdup]"); if (u) { S.pitSel = Number(u.dataset.pcdup); $("pcDup").click(); return; }
  const r = e.target.closest("[data-row]"); if (r && e.target.tagName !== "INPUT" && e.target.tagName !== "LABEL") { S.pitSel = Number(r.dataset.row); renderCustomList(); drawPitEditor(); }
});
$("pcToSim").addEventListener("click", () => {
  // the current openings, as they are (not their hulls), go to the etch simulator
  const shapes = pitShapesNow().map(sh => JSON.parse(JSON.stringify(sh)));
  const [x0, x1, y0, y1] = pit.box, hx = Math.ceil(Math.max(Math.abs(x0), Math.abs(x1))/10)*10, hy = Math.ceil(Math.max(Math.abs(y0), Math.abs(y1))/10)*10;
  SIM.fk = { "100": "100", "110": "110f", "111": "111" }[S.wf]; SIM.rate = PIT2SIM[S.rate];
  SIM.rot = S.rot || 0; SIM.probes = null;
  SIM.t = Math.max(5, Math.round(S.final ? pit.tmax : S.t)); SIM.pre = Math.max(0, ...pit.items.map(it => it.pre)); SIM.hx = hx; SIM.hy = hy; SIM.dxMax = 0;
  SIM.shapes = shapes; SIM.sel = -1; SIM.preset = -1; SIM.cutPos = 0; SIM.cutAxis = "y"; SIM.wfLoaded = S.wf; SIM.owner = "sim"; SIM.cl = null;
  fillSimPresets(); $("simPreset").value = "-1";
  $("simNote").innerHTML = "Openings sent from the Etched pit scene. Here they keep their real shape, and cavities that meet merge.";
  syncSimInputs(); renderShapeList();
  S.mode = "sim"; pressed($("segM"), "m", "sim"); tip.style.display = "none";
  simRun(); rebuild(true);
});
$("selRate").addEventListener("change", e => { S.rate = e.target.value; prepPit(); rebuild(false); });
$("tSlider").addEventListener("input", () => { S.t = sliderToT(); $("tNow").textContent = `${S.t.toFixed(S.t < 10 ? 1 : 0)} min`; if (S.final) { S.final = false; $("cFinal").checked = false; } buildPit(); });
$("cFinal").addEventListener("change", e => { S.final = e.target.checked; buildPit(); });
for (const [id, key] of [["cCut", "cut"], ["cBlock", "block"], ["cGhost", "ghost"], ["cMask", "mask"]])
  $(id).addEventListener("change", e => { S[key] = e.target.checked; buildPit(); });
$("cCorners").addEventListener("change", e => { S.corners = e.target.checked; dirty = true; });
$("cFaces").addEventListener("change", e => { S.faces = e.target.checked; dirty = true; });
$("cUpper").addEventListener("change", e => { S.upper = e.target.checked; model.up.visible = model.eUp.visible = S.upper; dirty = true; });
let lastPlay = 0;
$("bPlay").addEventListener("click", () => {
  S.playing = !S.playing; $("bPlay").textContent = S.playing ? "Pause" : "Play";
  if (S.playing && Number($("tSlider").value) >= 1000) $("tSlider").value = 0;
  if (S.playing) { S.final = false; $("cFinal").checked = false; }
  lastPlay = performance.now();
});
function stepPlay(now) {
  if (!S.playing || S.mode !== "pit") return;
  if (now - lastPlay < 50) return;
  lastPlay = now;
  const v = Math.min(1000, Number($("tSlider").value) + 6);
  $("tSlider").value = v; S.t = sliderToT(); $("tNow").textContent = `${S.t.toFixed(S.t < 10 ? 1 : 0)} min`; buildPit();
  if (v >= 1000) { S.playing = false; $("bPlay").textContent = "Play"; }
}

// --------------------------------------------------------------------- ETCH SIMULATOR scene
const EE = etchEngineFactory();
const SQ2 = Math.SQRT1_2, SQ3 = 1/Math.sqrt(3), SQ6 = 1/Math.sqrt(6);
const SFR = {   // wafer frames for the simulator: e1 along the flat, e2 in-plane (flat on the -e2 side), e3 = normal
  "100":  { wf: "100", e: [[-SQ2, SQ2, 0], [-SQ2, -SQ2, 0], [0, 0, 1]], idx: [[-1,1,0],[-1,-1,0],[0,0,1]],
            name: "(100), flat along ⟨110⟩", src: "Lec 4-1 p. 6; tutorial frame: x = [1̄10] along the flat, y = [1̄1̄0]" },
  "110f": { wf: "110", e: [[-SQ2, SQ2, 0], [0, 0, 1], [SQ2, SQ2, 0]], idx: [[-1,1,0],[0,0,1],[1,1,0]],
            name: "(110), flat along ⟨110⟩ (Lec 4-1 p. 6)", src: "Lec 4-1 p. 6: flat edge along [1̄10], flat normal [001̄]" },
  "110a": { wf: "110", e: [[SQ6, -SQ6, -2*SQ6], [-SQ3, SQ3, -SQ3], [SQ2, SQ2, 0]], idx: [[1,-1,-2],[-1,1,-1],[1,1,0]], arrow: [1,-1,1],
            name: "(110), ⟨111⟩ arrow = flat normal (Lec 4-1 p. 11, HW2 P5)", src: "Lec 4-1 p. 11 and HW2 P5: the ⟨111⟩ arrow [11̄1] is the outward flat normal; flat edge along [11̄2̄] (Flat and Arrow Note)" },
  "111":  { wf: "111", e: [[SQ2, -SQ2, 0], [SQ6, SQ6, -2*SQ6], [SQ3, SQ3, SQ3]], idx: [[1,-1,0],[1,1,-2],[1,1,1]],
            name: "(111), flat along [11̄0] (assumed)", src: "assumption: Lec 4-1 p. 6 labels the (111) flat ⟨111⟩, which cannot lie in a (111) surface; Pal & Sato p. 31 draw ⟨110⟩" },
};
// rate tables and etchants from data/etchants.json
const PAL = { 30: ETCH.TABLES["PalSato4.1:30"], 40: ETCH.TABLES["PalSato4.1:40"], 50: ETCH.TABLES["PalSato4.1:50"] };   // Pal & Sato Table 4.1, p. 87
const SRATES = ETCH.SR;
const T_WAFER_SIM = 525;   // Pal & Sato Table 2.1, p. 30: 100 mm wafer

// in-plane angle (deg, from the flat, 0..180) of the traces of vertical {111} planes in a frame
function vTraces(fk) {
  const [e1, e2, e3] = SFR[fk].e, out = [];
  for (const m of EE.ORIENT["111"] ? [[1,1,1],[1,1,-1],[1,-1,1],[-1,1,1]] : []) {
    const n = [m[0]*SQ3, m[1]*SQ3, m[2]*SQ3], nz = n[0]*e3[0] + n[1]*e3[1] + n[2]*e3[2];
    if (Math.abs(nz) > 1e-6) continue;
    const nx = n[0]*e1[0] + n[1]*e1[1] + n[2]*e1[2], ny = n[0]*e2[0] + n[1]*e2[1] + n[2]*e2[2];
    let a = Math.atan2(nx, -ny)*C.DEG; a = ((a % 180) + 180) % 180; out.push(a);   // trace direction is perpendicular to (nx, ny)
  }
  return out.sort((p, q) => p - q);
}
// shape helpers (all in µm, wafer frame)
const shp = (type: string, op: string, cx: number, cy: number, w?: number, h?: number, ang?: number, extra?: Record<string, any>) => Object.assign({ type, op, cx, cy, w, h: h == null ? w : h, ang: ang || 0 }, extra || {});
const SHAPE_TYPES: Record<string, any> = {   // name, which size fields the editor shows, defaults for a new shape
  rect:    { name: "rectangle",       f: ["w", "h"],      d: { w: 100, h: 60 } },
  circle:  { name: "circle",          f: ["w"],           d: { w: 80 } },
  ellipse: { name: "ellipse",         f: ["w", "h"],      d: { w: 120, h: 70 } },
  tri:     { name: "triangle",        f: ["w"],           d: { w: 90 } },
  poly:    { name: "regular polygon", f: ["w", "n"],      d: { w: 90, n: 6 } },
  lshape:  { name: "L-shape",         f: ["w", "h", "t"], d: { w: 120, h: 120, t: 35 } },
  ushape:  { name: "U-shape",         f: ["w", "h", "t"], d: { w: 120, h: 100, t: 30 } },
  cross:   { name: "cross",           f: ["w", "h", "t"], d: { w: 140, h: 140, t: 40 } },
  frame:   { name: "square frame",    f: ["w", "h", "t"], d: { w: 160, h: 160, t: 25 } },
  ring:    { name: "ring",            f: ["w", "t"],      d: { w: 140, t: 80 } },
  star:    { name: "star",            f: ["w", "t", "n"], d: { w: 140, t: 60, n: 5 } },
  para:    { name: "parallelogram (sides along chosen directions)", f: ["w", "h"], d: { w: 120, h: 60, a1: 54.74, a2: 125.26 } },
  pts:     { name: "example outline",         f: [],              d: {}, noAdd: true },
  free:    { name: "drawn outline",           f: ["k"],           d: { k: 100 }, noAdd: true },
};
const ngon = (r, n, a0 = 0) => Array.from({ length: n }, (_, i) => { const a = a0 + 2*Math.PI*i/n; return [r*Math.cos(a), r*Math.sin(a)]; });
// polygon with a hole as one loop: outer (counter-clockwise), a zero-width slit along +x, inner reversed
function keyhole(O, I) { return [...O, O[0], I[0], ...I.slice(1).reverse(), I[0]]; }
function basePts(s) {   // shape outline before rotation and translation
  const w = s.w, h = s.h, t = Math.max(1, s.t || 0), n = Math.max(3, Math.round(s.n || 3));
  switch (s.type) {
    case "rect": return [[-w/2, -h/2], [w/2, -h/2], [w/2, h/2], [-w/2, h/2]];
    case "circle": return ngon(w/2, 64);
    case "ellipse": return Array.from({ length: 72 }, (_, i) => { const a = 2*Math.PI*i/72; return [w/2*Math.cos(a), h/2*Math.sin(a)]; });
    case "tri": return ngon(s.w/Math.sqrt(3), 3, Math.PI/2);
    case "poly": return ngon(w/2, n, Math.PI/2);
    case "lshape": return [[-w/2, -h/2], [w/2, -h/2], [w/2, -h/2 + t], [-w/2 + t, -h/2 + t], [-w/2 + t, h/2], [-w/2, h/2]];
    case "ushape": return [[-w/2, -h/2], [w/2, -h/2], [w/2, h/2], [w/2 - t, h/2], [w/2 - t, -h/2 + t], [-w/2 + t, -h/2 + t], [-w/2 + t, h/2], [-w/2, h/2]];
    case "cross": { const a = t/2; return [[-a, -h/2], [a, -h/2], [a, -a], [w/2, -a], [w/2, a], [a, a], [a, h/2], [-a, h/2], [-a, a], [-w/2, a], [-w/2, -a], [-a, -a]]; }
    case "frame": {
      const R = (W, H) => [[W/2, 0], [W/2, H/2], [-W/2, H/2], [-W/2, -H/2], [W/2, -H/2]];
      return keyhole(R(w, h), R(Math.max(1, w - 2*t), Math.max(1, h - 2*t)));
    }
    case "ring": return keyhole(ngon(w/2, 72), ngon(Math.min(t, w - 2)/2, 72));
    case "star": return Array.from({ length: 2*n }, (_, i) => { const r = i % 2 ? Math.min(t, w)/2 : w/2, a = Math.PI/2 + Math.PI*i/n; return [r*Math.cos(a), r*Math.sin(a)]; });
    case "pts": return s.pts.map(p => p.slice());
    case "free": { const k = (s.k || 100)/100; return s.pts.map(p => [p[0]*k, p[1]*k]); }
  }
  return [[-w/2, -h/2], [w/2, -h/2], [w/2, h/2], [-w/2, h/2]];
}
