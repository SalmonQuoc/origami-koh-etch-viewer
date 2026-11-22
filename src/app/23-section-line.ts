// =====================================================================================================
// Section line: a free line A -> B (any length, any angle) in the mask editor of the etched pit and of the
// simulator / corner lab, used like the ruler. Drag A or B to move one end, drag the line to move it,
// "✎ Draw line" then drag across the editor to draw a new one, or type the coordinates. The cross-section
// below the editor shows the vertical plane through the line (distance from A along the x axis of the plot),
// and "cut open" in the Show tab removes the silicon on the right-hand side of A -> B in the 3D view.
type SecLine = { a: number[]; b: number[] };
var SLD: Record<string, boolean> = {};   // "draw a new line" mode per editor
function simLine(): SecLine {
  if (SIM.cutLine) return SIM.cutLine;
  return SIM.cutAxis === "x" ? { a: [SIM.cutPos || 0, -SIM.hy], b: [SIM.cutPos || 0, SIM.hy] } : { a: [-SIM.hx, SIM.cutPos || 0], b: [SIM.hx, SIM.cutPos || 0] };
}
function pitBox() { return pit && pit.box ? pit.box : [-100, 100, -100, 100]; }
function pitLine(): SecLine {
  if (S.pitLine) return S.pitLine;
  const [x0, x1] = pitBox(); return { a: [x0, 0], b: [x1, 0] };
}
// 3D: plane through the line that keeps the left-hand side of A -> B (n·p + c >= 0 is kept)
function secPlane(l: SecLine) {
  const dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], L = Math.hypot(dx, dy) || 1, n = new V3(-dy/L, dx/L, 0);
  return new THREE.Plane(n, -(n.x*l.a[0] + n.y*l.a[1]));
}
function secLen(l: SecLine) { return Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]); }
// the part of the (infinite) line through A, B inside the box [x0, x1, y0, y1], as distances [s0, s1] from A
function lineInBox(l: SecLine, box: number[]) {
  const L = secLen(l) || 1, u = [(l.b[0] - l.a[0])/L, (l.b[1] - l.a[1])/L]; let s0 = -Infinity, s1 = Infinity;
  for (let k = 0; k < 2; k++) {
    const lo = box[2*k], hi = box[2*k + 1];
    if (Math.abs(u[k]) < 1e-12) { if (l.a[k] < lo || l.a[k] > hi) return null; continue; }
    let t0 = (lo - l.a[k])/u[k], t1 = (hi - l.a[k])/u[k]; if (t0 > t1) [t0, t1] = [t1, t0];
    s0 = Math.max(s0, t0); s1 = Math.min(s1, t1);
  }
  return s1 - s0 > 1e-9 ? [s0, s1] : null;
}
var SL: Record<string, { get: () => SecLine; set: (l: SecLine) => void; ed: () => any; redraw: () => void; half: () => number[] }> = {
  maskCanvas: {
    get: simLine, ed: () => SIM.ed, half: () => [SIM.hx, SIM.hy],
    set: l => { SIM.cutLine = l; syncSecUI("maskCanvas"); drawMaskEditor(); if (SIM.cutOn) buildSim(false); requestView(SIM.tv); if (SIM.res) drawSection(); },
    redraw: () => drawMaskEditor(),
  },
  pitCanvas: {
    get: pitLine, ed: () => S.pitEd, half: () => { const [x0, x1, y0, y1] = pitBox(); return [Math.max(-x0, x1), Math.max(-y0, y1)]; },
    set: l => { S.pitLine = l; syncSecUI("pitCanvas"); drawPitEditor(); if (S.cut) buildPit(); drawPitSection(); },
    redraw: () => drawPitEditor(),
  },
};
function syncSecUI(id: string) {
  const box = document.querySelector(`.secUI[data-for="${id}"]`); if (!box || !SL) return;   // SL is set when this module runs
  const l = SL[id].get(), v = { ax: l.a[0], ay: l.a[1], bx: l.b[0], by: l.b[1] };
  for (const k of Object.keys(v)) { const el = box.querySelector(`[data-sl="${k}"]`) as HTMLInputElement; if (el && document.activeElement !== el) el.value = String(+v[k].toFixed(1)); }
  const len = box.querySelector("[data-sl=len]"); if (len) len.textContent = `length ${fmtLen(secLen(l))}, ${(Math.atan2(l.b[1] - l.a[1], l.b[0] - l.a[0])*C.DEG).toFixed(1)}° from x`;
  const dr = box.querySelector('[data-sl="draw"]'); if (dr) dr.setAttribute("aria-pressed", String(!!SLD[id]));
  const sh = box.querySelector('[data-sl="shift"]') as HTMLInputElement, [hx, hy] = SL[id].half();
  if (sh && document.activeElement !== sh) { const m = Math.hypot(hx, hy); sh.min = String(-m); sh.max = String(m); sh.value = "0"; }
}
function setSecDraw(id: string, on: boolean) { SLD[id] = on; $(id).classList.toggle("measuring", on); syncSecUI(id); }
// drawn in the editor (inside its clip), in the ghost colour, with the ends A and B
function drawSecLine(ctx: CanvasRenderingContext2D, id: string, toC: (p: number[]) => number[]) {
  const l = SL[id].get(), A = toC(l.a), B = toC(l.b), col = "#" + COL.ghost.getHexString(), bg = "#" + COL["scene-bg"].getHexString();
  ctx.save(); ctx.strokeStyle = col; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.setLineDash([]);
  // arrow head at B and the kept side (left of A -> B) marked by a short tick
  const ux = B[0] - A[0], uy = B[1] - A[1], ul = Math.hypot(ux, uy) || 1, hx = ux/ul, hy = uy/ul;
  ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(B[0] + hx*2, B[1] + hy*2); ctx.lineTo(B[0] - hx*9 - hy*4.5, B[1] - hy*9 + hx*4.5); ctx.lineTo(B[0] - hx*9 + hy*4.5, B[1] - hy*9 - hx*4.5); ctx.closePath(); ctx.fill();
  ctx.font = "700 10px IBM Plex Sans, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const [P, t] of [[A, "A"], [B, "B"]] as [number[], string][]) {
    ctx.beginPath(); ctx.arc(P[0], P[1], 6.5, 0, 2*Math.PI); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = col; ctx.stroke();
    ctx.fillStyle = col; ctx.fillText(t, P[0], P[1] + 0.5);
  }
  ctx.textAlign = "start"; ctx.textBaseline = "alphabetic";
  const lab = `section ${fmtLen(secLen(l))}`; ctx.font = "600 10px IBM Plex Mono, monospace";
  const tw = ctx.measureText(lab).width, mx = (A[0] + B[0])/2 - hy*14 - tw/2, my = (A[1] + B[1])/2 + hx*14;
  ctx.globalAlpha = 0.85; ctx.fillStyle = bg; ctx.fillRect(mx - 3, my - 9, tw + 6, 13); ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fillText(lab, mx, my);
  ctx.restore();
}
// ---- the controls (one block per editor) and the pointer handling
(() => {
  for (const box of document.querySelectorAll(".secUI")) {
    const id = box.getAttribute("data-for");
    box.innerHTML = `<div class="row"><span class="seg"><button type="button" data-sl="x" title="A horizontal line through the centre">along x</button><button type="button" data-sl="y" title="A vertical line through the centre">along y</button><button type="button" data-sl="draw" aria-pressed="false" title="Drag across the editor to draw the section line (key L); Esc stops">✎ Draw line</button></span></div>
      <div class="fields secAB"><label>A (start) <span><input type="number" data-sl="ax" step="1" aria-label="A x"> , <input type="number" data-sl="ay" step="1" aria-label="A y"> µm</span></label>
      <label>B (end) <span><input type="number" data-sl="bx" step="1" aria-label="B x"> , <input type="number" data-sl="by" step="1" aria-label="B y"> µm</span></label>
      <label>move across <input type="range" data-sl="shift" step="any" value="0" aria-label="move the line sideways"></label></div>
      <p class="note" data-sl="len"></p>
      <p class="note">In the editor: drag <b>A</b> or <b>B</b> to move an end, drag the dashed line to move it, or use ✎ Draw line. The plot below shows the plane through A → B; “cut open” in 👁 Show removes the silicon on the right of A → B.</p>`;
    let base: SecLine | null = null;   // the line when the "move across" slider was grabbed
    box.addEventListener("click", e => {
      const b = (e.target as HTMLElement).closest("button"); if (!b) return;
      const k = b.getAttribute("data-sl"), [hx, hy] = SL[id].half();
      if (k === "draw") setSecDraw(id, !SLD[id]);
      else if (k === "x") SL[id].set({ a: [-hx, 0], b: [hx, 0] });
      else if (k === "y") SL[id].set({ a: [0, -hy], b: [0, hy] });
    });
    box.addEventListener("change", e => {
      const t = e.target as HTMLInputElement, k = t.getAttribute("data-sl"); if (!k || k === "shift") return;
      const l = SL[id].get(), v = Number(t.value); if (!isFinite(v)) return;
      const n = { a: l.a.slice(), b: l.b.slice() };
      if (k === "ax") n.a[0] = v; else if (k === "ay") n.a[1] = v; else if (k === "bx") n.b[0] = v; else if (k === "by") n.b[1] = v;
      if (secLen(n) > 1e-6) SL[id].set(n); else syncSecUI(id);
    });
    const sh = box.querySelector('[data-sl="shift"]') as HTMLInputElement;
    sh.addEventListener("input", () => {
      const l = base || (base = SL[id].get()), L = secLen(l) || 1, nx = -(l.b[1] - l.a[1])/L, ny = (l.b[0] - l.a[0])/L, d = Number(sh.value);
      SL[id].set({ a: [snapV(l.a[0] + nx*d), snapV(l.a[1] + ny*d)], b: [snapV(l.b[0] + nx*d), snapV(l.b[1] + ny*d)] });
    });
    sh.addEventListener("change", () => { base = null; sh.value = "0"; });
  }
  for (const id of Object.keys(SL)) {
    const cv = $(id); if (!cv) continue;
    const host = cv.parentElement;
    const px = (e: PointerEvent) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    const world = (e: PointerEvent, snap = true) => { const ed = SL[id].ed(), [x, y] = px(e), w = [(x - ed.ox)/ed.s, -(y - ed.oy)/ed.s]; return snap ? w.map(snapV) : w; };
    const scr = (p: number[]) => { const ed = SL[id].ed(); return [ed.ox + p[0]*ed.s, ed.oy - p[1]*ed.s]; };
    const hit = (e: PointerEvent) => {   // "a", "b", "line" or null
      const ed = SL[id].ed(); if (!ed) return null;
      const l = SL[id].get(), P = px(e), A = scr(l.a), B = scr(l.b);
      if (Math.hypot(P[0] - A[0], P[1] - A[1]) <= 8) return "a";
      if (Math.hypot(P[0] - B[0], P[1] - B[1]) <= 8) return "b";
      const vx = B[0] - A[0], vy = B[1] - A[1], L2 = vx*vx + vy*vy || 1, t = Math.max(0, Math.min(1, ((P[0] - A[0])*vx + (P[1] - A[1])*vy)/L2));
      return Math.hypot(P[0] - A[0] - t*vx, P[1] - A[1] - t*vy) <= 5 ? "line" : null;
    };
    let drag: { mode: string; w0: number[]; l0: SecLine } | null = null;
    host.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.target !== cv || e.button !== 0 || DRAW.on === id || (EDM[id] && EDM[id].on) || !SL[id].ed()) return;
      const mode = SLD[id] ? "new" : hit(e); if (!mode) return;
      e.stopPropagation(); e.preventDefault(); cv.setPointerCapture(e.pointerId);
      const w = world(e); drag = { mode, w0: w, l0: SL[id].get() };
      if (mode === "new") { if (id === "maskCanvas") SIM.cutLine = { a: w, b: w.slice() }; else S.pitLine = { a: w, b: w.slice() }; SL[id].redraw(); }
    }, true);
    host.addEventListener("pointermove", (e: PointerEvent) => {
      if (e.target !== cv) return;
      if (!drag) { if (e.buttons === 0 && DRAW.on !== id && !(EDM[id] && EDM[id].on)) { const h = SLD[id] ? "new" : hit(e); if (h) cv.style.cursor = h === "line" ? "move" : h === "new" ? "crosshair" : "grab"; else if (cv.style.cursor === "move" || cv.style.cursor === "grab" || cv.style.cursor === "crosshair") cv.style.cursor = ""; } return; }
      e.stopPropagation();
      const w = world(e), l = drag.l0, d = [w[0] - drag.w0[0], w[1] - drag.w0[1]];
      const n = drag.mode === "a" ? { a: w, b: l.b.slice() } : drag.mode === "b" ? { a: l.a.slice(), b: w } : drag.mode === "new" ? { a: drag.w0, b: w } : { a: [l.a[0] + d[0], l.a[1] + d[1]], b: [l.b[0] + d[0], l.b[1] + d[1]] };
      if (id === "maskCanvas") SIM.cutLine = n; else S.pitLine = n;
      SL[id].redraw(); syncSecUI(id);
      if (id === "maskCanvas") requestView(SIM.tv); else drawPitSection();   // the plot follows the line while dragging
    }, true);
    const end = (e: PointerEvent) => {
      if (!drag) return; e.stopPropagation();
      const d = drag; drag = null;
      if (secLen(SL[id].get()) < 1e-6) { if (id === "maskCanvas") SIM.cutLine = d.l0; else S.pitLine = d.l0; }   // a click, not a line
      if (d.mode === "new") setSecDraw(id, false);
      SL[id].set(SL[id].get());
    };
    host.addEventListener("pointerup", end, true); host.addEventListener("pointercancel", end, true);
    cv.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "l" || e.key === "L") { e.preventDefault(); setSecDraw(id, !SLD[id]); }
      else if (e.key === "Escape" && SLD[id]) { e.preventDefault(); setSecDraw(id, false); }
    });
  }
  for (const id of Object.keys(SL)) syncSecUI(id);
})();

// ---- the cross-section of the etched pit: the analytic cavities cut by the vertical plane through the line
function drawPitSection() {
  const cv = $("pitSecCanvas") as HTMLCanvasElement; if (!cv || S.mode !== "pit" || !pit || !pit.cavs) return;
  const ctx = cv.getContext("2d"), l = pitLine(), L = secLen(l) || 1, ux = (l.b[0] - l.a[0])/L, uy = (l.b[1] - l.a[1])/L;
  const zb = pit.zb, wcss = cv.clientWidth || 600, pad = 34, sc = (wcss - 2*pad)/L;
  const hcss = Math.min(bigBox(cv) ? Math.round(window.innerHeight*0.55) : 420, Math.max(120, zb*sc + 2*pad));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(wcss*dpr); cv.height = Math.round(hcss*dpr); cv.style.height = `${hcss}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, wcss, hcss);
  const X = s => pad + s*sc, Z = z => pad - z*sc;
  const ink = "#" + COL["s-ink"].getHexString(), si = "#" + COL["s-top"].getHexString(), maskc = "#" + COL.mask.getHexString();
  // cavities in (s, z): n·(a + s u) + n_z z <= b
  const secs = pit.cavs.map(c => C.section2d(c.H.map(h => [[h.n[0]*ux + h.n[1]*uy, h.n[2]], h.b - h.n[0]*l.a[0] - h.n[1]*l.a[1]]))).filter(P => P.length >= 3);
  ctx.fillStyle = si; ctx.beginPath(); ctx.rect(X(0), Z(0), L*sc, zb*sc);
  for (const P of secs) { P.forEach((p, k) => k ? ctx.lineTo(X(p[0]), Z(Math.max(-zb, Math.min(0, p[1])))) : ctx.moveTo(X(p[0]), Z(Math.max(-zb, Math.min(0, p[1]))))); ctx.closePath(); }
  ctx.save(); ctx.beginPath(); ctx.rect(X(0), Z(0), L*sc, zb*sc); ctx.clip();
  ctx.beginPath(); ctx.rect(X(0), Z(0), L*sc, zb*sc); for (const P of secs) { P.forEach((p, k) => k ? ctx.lineTo(X(p[0]), Z(p[1])) : ctx.moveTo(X(p[0]), Z(p[1]))); ctx.closePath(); }
  ctx.fill("evenodd");
  ctx.strokeStyle = ink; ctx.lineWidth = 1; for (const [a, b] of unionEdges2(secs, 1e-6)) { ctx.beginPath(); ctx.moveTo(X(a[0]), Z(a[1])); ctx.lineTo(X(b[0]), Z(b[1])); ctx.stroke(); }
  ctx.restore();
  // the mask on top (where the line is not in an opening)
  if (S.mask) {
    const os = pit.items.map(it => ({ pts: it.o, op: "open" })), N = Math.max(2, Math.ceil(L*sc/2));
    ctx.fillStyle = maskc;
    for (let m = 0; m < N; m++) { const s = (m + 0.5)*L/N; if (!EE.isOpen(os, l.a[0] + ux*s, l.a[1] + uy*s)) ctx.fillRect(X(m*L/N), Z(0) - 3, L/N*sc + 0.6, 3); }
  }
  secAxes(ctx, X, Z, L, zb, ink, wcss, hcss, pad);
  ctx.fillStyle = ink; ctx.fillText(`section A → B, ${fmtLen(L)} long, at t = ${S.final ? "long-etch limit" : `${S.t.toFixed(0)} min`}  (µm, true scale; mask on top)`, pad, hcss - 8);
}
function secAxes(ctx: CanvasRenderingContext2D, X: (s: number) => number, Z: (z: number) => number, L: number, zd: number, ink: string, wcss: number, hcss: number, pad: number) {
  ctx.fillStyle = ink; ctx.strokeStyle = ink; ctx.globalAlpha = 0.8; ctx.font = "11px IBM Plex Mono, monospace";
  ctx.beginPath(); ctx.moveTo(X(0), Z(0)); ctx.lineTo(X(L), Z(0)); ctx.lineWidth = 0.5; ctx.stroke();
  const step = edGrid(L);
  for (let v = 0; v <= L + 1e-6; v += step) { ctx.fillRect(X(v), Z(0) + 1, 0.8, 4); ctx.fillText(`${v.toFixed(0)}`, X(v) - 8, Z(0) - 7); }
  const zs = niceStep(zd/4);
  for (let v = 0; v <= zd + 1e-6; v += zs) { ctx.fillRect(X(0) - 5, Z(-v), 4, 0.8); ctx.fillText(`${v.toFixed(0)}`, 2, Z(-v) + 4); }
  ctx.globalAlpha = 1; ctx.font = "700 11px IBM Plex Sans, sans-serif"; ctx.fillStyle = "#" + COL.ghost.getHexString();
  ctx.fillText("A", X(0) - 4, Z(0) - 20); ctx.fillText("B", X(L) - 4, Z(0) - 20);
  ctx.font = "11px IBM Plex Mono, monospace"; ctx.fillStyle = ink; ctx.fillText("distance from A (µm)", X(L) - 150, Z(0) - 20);
}
