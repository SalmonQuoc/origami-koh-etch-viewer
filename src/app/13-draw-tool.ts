// =====================================================================================================
// drawing a free outline in the mask editors (Etched pit and simulator)
// Click to place corners; drag to draw freely; finish with a double-click, Enter or a click on the first
// corner; Backspace removes the last corner; Esc cancels.
var DRAW = { on: null, pts: [], cur: null, down: null, stroke: null };
const DRAW_ED = {
  pitCanvas: { ed: () => S.pitEd, redraw: () => drawPitEditor(true), btn: "pcDraw", help: "pcDrawHelp",
    add: sh => { toCustom(); S.pitShapes.push(Object.assign(sh, { op: "open", pre: 0 })); S.pitSel = S.pitShapes.length - 1; pitChanged(false); } },
  maskCanvas: { ed: () => SIM.ed, redraw: () => drawMaskEditor(), btn: "bDraw", help: "simDrawHelp",
    add: sh => { SIM.shapes.push(Object.assign(sh, { op: $("addOp").value, nx: 1, ny: 1, px: 0, py: 0 })); SIM.sel = SIM.shapes.length - 1; $("simPreset").value = "-1"; markDirty(); } },
};
const DRAW_HELP = "Drawing: <b>click</b> to place corners or <b>drag</b> to draw freely. Finish with a <b>double-click</b>, <span class=\"kbd\">Enter</span> or a click on the first corner; <span class=\"kbd\">Backspace</span> removes the last corner, <span class=\"kbd\">Esc</span> cancels.";
function drawSetHelp(id, html) { const h = $(DRAW_ED[id].help); h.innerHTML = html; h.classList.toggle("hidden", !html); }
function drawStart(id) {
  if (DRAW.on) drawStop();
  Object.assign(DRAW, { on: id, pts: [], cur: null, down: null, stroke: null });
  const d = DRAW_ED[id]; $(d.btn).classList.add("on"); $(d.btn).textContent = "✎ Drawing… (Esc)";
  $(id).classList.add("drawing"); $(id).focus(); drawSetHelp(id, DRAW_HELP); d.redraw();
}
function drawStop(msg?: string) {
  const id = DRAW.on; if (!id) return;
  const d = DRAW_ED[id]; DRAW.on = null; DRAW.pts = []; DRAW.stroke = null;
  $(d.btn).classList.remove("on"); $(d.btn).textContent = "✎ Draw"; $(id).classList.remove("drawing");
  drawSetHelp(id, msg || ""); d.redraw();
}
function drawWorld(id, ev) {
  const ed = DRAW_ED[id].ed(), r = $(id).getBoundingClientRect();
  return [(ev.clientX - r.left - ed.ox)/ed.s, -(ev.clientY - r.top - ed.oy)/ed.s];
}
function drawFinish(raw) {
  const id = DRAW.on; if (!id) return;
  const ed = DRAW_ED[id].ed(), tolPx = 2;
  let P = [];
  for (const p of raw) if (!P.length || Math.hypot(p[0] - P[P.length - 1][0], p[1] - P[P.length - 1][1])*ed.s > tolPx) P.push(p);
  while (P.length > 3 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1])*ed.s <= 6) P.pop();
  if (P.length < 3 || Math.abs(polyArea(P)) < 4) { drawStop("The outline needs at least three corners that enclose an area. Press ✎ Draw to try again."); return; }
  if (selfCrosses(P)) { drawStop("The outline crosses itself, so it has no clear inside. Press ✎ Draw and draw it again without crossing."); return; }
  if (polyArea(P) < 0) P.reverse();
  const c = polyCentroid(P), cx = Math.round(c[0]*10)/10, cy = Math.round(c[1]*10)/10;
  const pts = P.map(p => [Math.round((p[0] - cx)*10)/10, Math.round((p[1] - cy)*10)/10]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const sh = shp("free", "open", cx, cy, Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), 0, { pts, k: 100 });
  const add = DRAW_ED[id].add; drawStop(`Added a drawn outline with ${pts.length} corners. Change its scale or angle in the list.`); add(sh);
}
// drawing overlay, called at the end of each editor's draw function
function drawOverlay(ctx, id, toC) {
  if (DRAW.on !== id) return;
  const col = c => "#" + COL[c].getHexString(), path = DRAW.stroke ? DRAW.stroke : DRAW.pts;
  ctx.save(); ctx.strokeStyle = col("accent"); ctx.fillStyle = col("accent"); ctx.lineWidth = 2;
  if (path.length) {
    ctx.beginPath(); path.map(toC).forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]));
    if (!DRAW.stroke && DRAW.cur) { const q = toC(DRAW.cur); ctx.lineTo(q[0], q[1]); }
    ctx.stroke();
    if (path.length >= 2) { ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.6; ctx.beginPath(); const a = toC(DRAW.stroke ? path[path.length - 1] : (DRAW.cur || path[path.length - 1])), b = toC(path[0]); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
    if (!DRAW.stroke) DRAW.pts.forEach((p, k) => { const q = toC(p); ctx.beginPath(); ctx.arc(q[0], q[1], k ? 3 : 5, 0, 2*Math.PI); k ? ctx.fill() : ctx.stroke(); });
  }
  if (DRAW.cur && !DRAW.stroke) { const q = toC(DRAW.cur); ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.moveTo(q[0] - 6, q[1]); ctx.lineTo(q[0] + 6, q[1]); ctx.moveTo(q[0], q[1] - 6); ctx.lineTo(q[0], q[1] + 6); ctx.lineWidth = 1; ctx.stroke(); }
  ctx.restore();
}
for (const id of Object.keys(DRAW_ED)) {
  const cv = $(id), host = cv.parentElement;
  // capture on the parent: these run before the editor's own handlers and stop them while drawing
  const mine = ev => DRAW.on === id && ev.target === cv;
  host.addEventListener("pointerdown", ev => {
    if (!mine(ev)) return; ev.stopPropagation(); ev.preventDefault();
    DRAW.down = { x: ev.clientX, y: ev.clientY, w: drawWorld(id, ev) }; DRAW.stroke = null; cv.setPointerCapture(ev.pointerId);
  }, true);
  host.addEventListener("pointermove", ev => {
    if (!mine(ev)) return; ev.stopPropagation();
    const w = drawWorld(id, ev); DRAW.cur = [snapV(w[0]), snapV(w[1])];
    if (DRAW.down && (ev.buttons & 1)) {
      if (!DRAW.stroke && Math.hypot(ev.clientX - DRAW.down.x, ev.clientY - DRAW.down.y) > 6) DRAW.stroke = [DRAW.down.w];
      if (DRAW.stroke) { const l = DRAW.stroke[DRAW.stroke.length - 1], s = DRAW_ED[id].ed().s; if (Math.hypot(w[0] - l[0], w[1] - l[1])*s > 2.5) DRAW.stroke.push(w); }
    }
    DRAW_ED[id].redraw();
  }, true);
  host.addEventListener("pointerup", ev => {
    if (!mine(ev)) return; ev.stopPropagation();
    if (DRAW.stroke) {   // free stroke: simplify (1.2 px) and close it
      const s = DRAW_ED[id].ed().s; let P = simplifyRDP(DRAW.stroke.concat([drawWorld(id, ev)]), 1.2/s);
      for (let tol = 2.4; P.length > 120; tol *= 1.5) P = simplifyRDP(P, tol/s);
      DRAW.down = null; DRAW.stroke = null; drawFinish(P.map(p => [Math.round(p[0]*2)/2, Math.round(p[1]*2)/2])); return;
    }
    if (!DRAW.down) return;
    const w = DRAW.down.w, q = [snapV(w[0]), snapV(w[1])], s = DRAW_ED[id].ed().s; DRAW.down = null;
    if (DRAW.pts.length >= 3 && Math.hypot(q[0] - DRAW.pts[0][0], q[1] - DRAW.pts[0][1])*s < 9) { drawFinish(DRAW.pts); return; }
    const l = DRAW.pts[DRAW.pts.length - 1]; if (!l || Math.hypot(q[0] - l[0], q[1] - l[1])*s > 2) DRAW.pts.push(q);
    DRAW_ED[id].redraw();
  }, true);
  host.addEventListener("dblclick", ev => { if (!mine(ev)) return; ev.stopPropagation(); ev.preventDefault(); if (DRAW.pts.length >= 3) drawFinish(DRAW.pts); }, true);
  host.addEventListener("pointerleave", ev => { if (DRAW.on === id) { DRAW.cur = null; DRAW_ED[id].redraw(); } }, true);
  $(DRAW_ED[id].btn).addEventListener("click", () => DRAW.on === id ? drawStop() : drawStart(id));
}
document.addEventListener("keydown", ev => {
  if (!DRAW.on) return;
  if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); drawStop(); }
  else if (ev.key === "Enter") { ev.preventDefault(); if (DRAW.pts.length >= 3) drawFinish(DRAW.pts); }
  else if (ev.key === "Backspace" || ev.key === "Delete") { ev.preventDefault(); ev.stopPropagation(); DRAW.pts.pop(); DRAW_ED[DRAW.on].redraw(); }
}, true);

