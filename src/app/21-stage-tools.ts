// =====================================================================================================
// Tools on the 3D view: zoom buttons, an axis gizmo (crystal axes [100], [010], [001], the flat and the
// surface normal; click one to look along it), a scale bar, and a measuring tool (click two points on a surface).
// The camera is orthographic, so one screen pixel is the same length everywhere in the view: the scale bar
// is exact for lengths parallel to the screen. The page draws the overlays after each render (stageOverlay).
const ST3 = { meas: false, pts: [] as any[], mode: "" };
const GZ_COL = { x: "#d1453b", y: "#2f9a4b", z: "#3b6fd1" };
function stageUnits() { return S.mode !== "model"; }   // the paper model has no length unit
function gizmoIdx(): number[][] { return simLike() ? SFR[SIM.fk].idx : C.FRAME_IDX[S.wf]; }
function zoom3D(f: number) {
  camera.zoom = Math.max(controls.minZoom, Math.min(controls.maxZoom, camera.zoom*f));
  camera.updateProjectionMatrix(); controls.update(); dirty = true;
}
function fit3D() { anim0Zoom = 1; setView(camera.position.clone().sub(controls.target), S.mode === "model" ? new V3(0, 0, 0) : scene.userData.center); }
function setMeasure3D(on: boolean) {
  ST3.meas = on && stageUnits(); ST3.pts = [];
  const b = document.querySelector('#stageTools [data-s="measure"]'); if (b) b.setAttribute("aria-pressed", String(ST3.meas));
  stage.classList.toggle("measuring", ST3.meas); dirty = true;
}
function pickSurface(ev: PointerEvent) {
  pickAt(ev);
  const meshes: any[] = [];
  scene.traverse((o: any) => { if (o.isMesh && o.visible && !o.userData.noPick && o.material && !(o.material.transparent && o.material.opacity < 0.2)) meshes.push(o); });
  for (const h of ray.intersectObjects(meshes, false)) {
    const cps = h.object.material.clippingPlanes;
    if (cps && cps.some((pl: any) => pl.distanceToPoint(h.point) < -1e-6)) continue;
    return h.point.clone();
  }
  return null;
}
(() => {
  controls.minZoom = 0.05; controls.maxZoom = 5000;
  const box = document.createElement("div"); box.className = "stageTools"; box.id = "stageTools";
  box.innerHTML = `<button type="button" data-s="in" title="Zoom in (or scroll)" aria-label="zoom in">+</button><button type="button" data-s="out" title="Zoom out (or scroll)" aria-label="zoom out">−</button><button type="button" data-s="fit" title="Fit the view" aria-label="fit the view">⤢</button><button type="button" data-s="measure" aria-pressed="false" title="Measure: click two points on a surface (Esc clears)" aria-label="measure">📏</button>`;
  const giz = document.createElement("div"); giz.className = "gizmo"; giz.id = "gizmo";
  giz.innerHTML = `<canvas width="288" height="288" title="Crystal axes x = [100], y = [010], z = [001]; F: primary flat; n: surface normal. Click an axis to look along it."></canvas><div class="gzLeg"></div>`;
  const sb = document.createElement("div"); sb.className = "scaleBar"; sb.id = "scaleBar"; sb.title = "Scale for lengths parallel to the screen (orthographic view)";
  sb.innerHTML = `<span class="sbLab"></span><i></i>`;
  const ov = document.createElementNS("http://www.w3.org/2000/svg", "svg"); ov.setAttribute("class", "measOv"); ov.id = "measOv";
  const lab = document.createElement("div"); lab.className = "measLab hidden"; lab.id = "measLab";
  stage.append(box, giz, sb, ov, lab);
  box.addEventListener("click", e => {
    const b = (e.target as HTMLElement).closest("button"); if (!b) return;
    const k = b.dataset.s;
    if (k === "in") zoom3D(1.5); else if (k === "out") zoom3D(1/1.5); else if (k === "fit") fit3D(); else setMeasure3D(!ST3.meas);
  });
  // click an axis end of the gizmo: look along that axis (from its positive or negative side)
  const gc = giz.querySelector("canvas") as HTMLCanvasElement;
  gc.addEventListener("click", e => {
    const r = gc.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 14;
    for (const a of gizmoAxes()) for (const sg of (a.kind === "axis" ? [1, -1] : [1])) {
      const d = Math.hypot(x - (r.width/2 + sg*a.sx*a.len), y - (r.height/2 + sg*a.sy*a.len)); if (d < bd) { bd = d; best = { a, sg }; }
    }
    if (!best) return;
    const v = best.a.v.clone().multiplyScalar(best.sg);
    if (Math.abs(v.z) > 0.9) v.set(0, -0.0087, Math.sign(v.z));   // straight down or up: keep the flat at the bottom
    setView(v, S.mode === "model" ? new V3(0, 0, 0) : scene.userData.center);
  });
  // measuring clicks (a click is a press and release without moving)
  let down: number[] | null = null;
  renderer.domElement.addEventListener("pointerdown", ev => { down = [ev.clientX, ev.clientY]; });
  renderer.domElement.addEventListener("pointerup", ev => {
    if (!ST3.meas || !down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 5) return;
    const p = pickSurface(ev); if (!p) return;
    if (ST3.pts.length >= 2) ST3.pts = [];
    ST3.pts.push(p); dirty = true;
  });
  document.addEventListener("keydown", e => {
    const tg = (e.target as HTMLElement).tagName; if (tg === "INPUT" || tg === "SELECT" || tg === "TEXTAREA" || tg === "CANVAS" && e.target !== renderer.domElement) return;
    if (e.key === "Escape" && ST3.meas && !document.querySelector("dialog[open]")) setMeasure3D(false);
  });
})();
// gizmo: the crystal axes x = [100], y = [010], z = [001] (Miller indices; Lec 4-1 p. 6, Pal & Sato Fig. 2.8 p. 31)
// placed as they sit in the wafer, plus the primary flat direction F and the surface normal n of the wafer.
// Scene coordinates are wafer axes (x along the flat), so crystal axis i has the wafer components E[k][i].
function gizmoFrame() {
  const E: number[][] = simLike() ? SFR[SIM.fk].e : C.FRAMES[S.wf];
  const idx: number[][] = gizmoIdx();
  let d = 0; if (S.mode === "find" && FD.reveal) d = (FD.delta || 0)/C.DEG;   // the crystal is turned by δ (only when δ is shown)
  const rz = (v: any) => new V3(v.x*Math.cos(d) - v.y*Math.sin(d), v.x*Math.sin(d) + v.y*Math.cos(d), v.z);
  return { E, idx, rz };
}
function gizmoAxes() {
  const q = camera.quaternion.clone().invert(), { E, idx, rz } = gizmoFrame(), out: any[] = [];
  const W = (document.querySelector("#gizmo canvas") as HTMLElement)?.clientWidth || 120, La = 0.27*W, Lf = 0.31*W;
  const add = (n: string, v: any, col: string, len: number, kind: string, lab: string) => { const c = v.clone().applyQuaternion(q); out.push({ n, v, sx: c.x, sy: -c.y, depth: c.z, len, col, kind, lab }); };
  (["x", "y", "z"] as const).forEach((n, i) => add(n, rz(new V3(E[0][i], E[1][i], E[2][i])), GZ_COL[n], La, "axis", ["[100]", "[010]", "[001]"][i]));
  add("F", new V3(1, 0, 0), "#" + COL.accent.getHexString(), Lf, "flat", "F");
  const nrm = new V3(0, 0, 1);
  if (!out.slice(0, 3).some(a => Math.abs(a.v.dot(nrm)) > 0.999)) add("n", nrm, "#" + COL["s-ink"].getHexString(), Lf, "normal", "n");
  return out;
}
function drawGizmo() {
  const gc = document.querySelector("#gizmo canvas") as HTMLCanvasElement; if (!gc) return;
  const ctx = gc.getContext("2d"), W = gc.clientWidth || 120, dpr = gc.width/W;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, W);
  const c = W/2, ax = gizmoAxes(), ends: any[] = [], ink = "#" + COL["s-ink"].getHexString(), bg = "#" + COL["scene-bg"].getHexString();
  for (const a of ax) for (const sg of (a.kind === "axis" ? [1, -1] : [1])) ends.push({ a, sg, d: sg*a.depth });
  ends.sort((p, q) => p.d - q.d);   // far ends first, so the near axes are drawn on top
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  // centre dot
  const labs: any[] = [];
  ctx.fillStyle = ink; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.arc(c, c, 2.2, 0, 2*Math.PI); ctx.fill();
  for (const e of ends) {
    const x = c + e.sg*e.a.sx*e.a.len, y = c + e.sg*e.a.sy*e.a.len, isAx = e.a.kind === "axis", pos = e.sg > 0;
    const front = e.d >= 0;   // pointing toward the viewer
    ctx.globalAlpha = pos ? (front ? 1 : 0.8) : 0.45;
    ctx.strokeStyle = e.a.col; ctx.lineWidth = isAx ? (pos ? 3.2 : 1.6) : 1.8; ctx.lineCap = "round";
    ctx.setLineDash(isAx ? [] : [4, 3]); ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
    if (isAx) {
      ctx.beginPath(); ctx.arc(x, y, pos ? 10.5 : 6, 0, 2*Math.PI);
      if (pos) {
        ctx.fillStyle = e.a.col; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = bg; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "700 12px IBM Plex Sans, sans-serif"; ctx.fillText(e.a.n, x, y + 0.5);
      } else { ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = e.a.col; ctx.stroke(); }
    } else {
      // arrow head for the flat and the normal
      const ux = e.a.sx, uy = e.a.sy, ul = Math.hypot(ux, uy) || 1, hx = ux/ul, hy = uy/ul;
      ctx.fillStyle = e.a.col; ctx.beginPath(); ctx.moveTo(x + hx*6, y + hy*6); ctx.lineTo(x - hy*4, y + hx*4); ctx.lineTo(x + hy*4, y - hx*4); ctx.closePath(); ctx.fill();
    }
    if (pos) labs.push({ e, x, y, isAx, front });
  }
  // labels last, so no axis covers them: the Miller index (or the name) just beyond the tip. Each label tries
  // the outward spot first, then spots turned to either side, and keeps the first one that covers no ball and
  // no label already placed (or the one with the least overlap); near axes are placed first.
  const balls = ends.filter(e => e.a.kind === "axis").map(e => ({ x: c + e.sg*e.a.sx*e.a.len, y: c + e.sg*e.a.sy*e.a.len, r: (e.sg > 0 ? 10.5 : 6) + 1.5 }));
  const placed: number[][] = [];
  const hit = (b: number[]) => {
    let o = 0;
    for (const p of placed) o += Math.max(0, Math.min(b[2], p[2]) - Math.max(b[0], p[0]) + 2)*Math.max(0, Math.min(b[3], p[3]) - Math.max(b[1], p[1]) + 2);
    for (const k of balls) { const qx = Math.max(b[0], Math.min(k.x, b[2])), qy = Math.max(b[1], Math.min(k.y, b[3])), d = Math.hypot(qx - k.x, qy - k.y); if (d < k.r) o += (k.r - d)*k.r; }
    return o;
  };
  labs.sort((p, q) => (q.isAx ? 1 : 0) - (p.isAx ? 1 : 0) || q.e.d - p.e.d);
  for (const L of labs) {
    const { e, x, y, isAx, front } = L, ux = e.a.sx, uy = e.a.sy, ul = Math.hypot(ux, uy);
    ctx.font = isAx ? "600 11px IBM Plex Mono, monospace" : "italic 700 12px IBM Plex Sans, sans-serif";
    const tw = ctx.measureText(e.a.lab).width, h0 = ul > 0.15 ? Math.atan2(uy/ul, ux/ul) : -Math.PI/4;
    let best: number[] | null = null, bo = Infinity;
    search: for (const sc of [1, 1.7, 2.4]) for (const da of [0, 0.45, -0.45, 0.9, -0.9, 1.35, -1.35, 1.9, -1.9, Math.PI]) {
      const hx = Math.cos(h0 + da), hy = Math.sin(h0 + da);
      const off = (isAx ? 13 : 8)*sc + Math.abs(hx)*(tw/2 + 2) + Math.abs(hy)*7.5;
      let lx = x + hx*off - c, ly = y + hy*off - c; const rmax = W/2 - Math.hypot(tw/2 + 3, 7.5) - 1, rl = Math.hypot(lx, ly);
      if (rl > rmax) { lx *= rmax/rl; ly *= rmax/rl; }
      const b = [c + lx - tw/2 - 2, c + ly - 7, c + lx + tw/2 + 2, c + ly + 7], o = hit(b);
      if (o < bo - 0.5) { bo = o; best = b; }
      if (o === 0) break search;
    }
    placed.push(best);
    ctx.globalAlpha = 0.9; ctx.fillStyle = bg; ctx.fillRect(best[0], best[1], best[2] - best[0], 14);
    ctx.globalAlpha = front || !isAx ? 1 : 0.75; ctx.fillStyle = e.a.col; ctx.fillText(e.a.lab, (best[0] + best[2])/2, best[1] + 7.5);
  }
  ctx.globalAlpha = 1;
  const leg = document.querySelector("#gizmo .gzLeg");
  const key = `${S.mode}|${S.wf}|${SIM.fk}|${S.mode === "find" && FD.reveal ? FD.delta : ""}`;
  if (leg && leg.getAttribute("data-k") !== key) {
    const { idx } = gizmoFrame(), acc = "#" + COL.accent.getHexString();
    leg.innerHTML = `<div><b style="color:${GZ_COL.x}">x</b> [100] <b style="color:${GZ_COL.y}">y</b> [010] <b style="color:${GZ_COL.z}">z</b> [001]</div>`
      + `<div><b style="color:${acc}">F</b> flat along ${idxHTML(idx[0], "[", "]")}</div>`
      + `<div><b>n</b> surface normal ${idxHTML(idx[2], "[", "]")}</div>`
      + (S.mode === "find" ? `<div class="gzNote">${FD.reveal ? `crystal turned by δ = ${FD.delta}°` : "crystal as drawn (δ hidden)"}</div>` : "");
    leg.setAttribute("data-k", key);
  }
}
function drawScaleBar() {
  const sb = $("scaleBar"); if (!sb) return;
  sb.classList.toggle("hidden", !stageUnits()); if (!stageUnits()) return;
  const W = stage.clientWidth || 1, perPx = (camera.right - camera.left)/camera.zoom/W;   // world µm per CSS px
  const len = niceStep(110*perPx), px = len/perPx;
  (sb.querySelector("i") as HTMLElement).style.width = `${px.toFixed(1)}px`;
  sb.querySelector(".sbLab").textContent = fmtLen(len);
}
function drawMeasure3D() {
  const ov = $("measOv") as unknown as SVGSVGElement, lab = $("measLab"); if (!ov) return;
  if (ST3.mode !== S.mode) { ST3.mode = S.mode; if (ST3.meas || ST3.pts.length) setMeasure3D(false); }
  const W = stage.clientWidth, H = stage.clientHeight;
  const sc = (p: any) => { const q = p.clone().project(camera); return [(q.x + 1)/2*W, (1 - q.y)/2*H]; };
  const P = ST3.pts.map(sc), acc = "#" + COL.accent.getHexString();
  let html = "";
  if (P.length === 2) html += `<line x1="${P[0][0]}" y1="${P[0][1]}" x2="${P[1][0]}" y2="${P[1][1]}" stroke="${acc}" stroke-width="2"/>`;
  for (const p of P) html += `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="${acc}" stroke="#fff" stroke-width="1.5"/>`;
  ov.innerHTML = html;
  if (P.length === 2) {
    const [a, b] = ST3.pts, d = b.clone().sub(a);
    lab.innerHTML = `<b>${fmtLen(d.length())}</b><span>Δx ${fmtLen(d.x)} · Δy ${fmtLen(d.y)} · Δz ${fmtLen(d.z)}</span>`;
    lab.classList.remove("hidden");
    const mx = (P[0][0] + P[1][0])/2, my = (P[0][1] + P[1][1])/2;
    lab.style.left = `${Math.max(8, Math.min(W - 230, mx + 12))}px`; lab.style.top = `${Math.max(8, Math.min(H - 60, my - 44))}px`;
  } else if (ST3.meas) {
    lab.innerHTML = `<span>${P.length ? "Click the second point" : "Click a first point on a surface"}</span>`; lab.classList.remove("hidden");
    lab.style.left = "56px"; lab.style.top = "10px";
  } else lab.classList.add("hidden");
}
function stageOverlay() {
  // the ruler (📏) and the scale bar only where lengths have a unit: not on the paper model
  const mb = document.querySelector('#stageTools [data-s="measure"]'); if (mb) mb.classList.toggle("hidden", !stageUnits());
  drawGizmo(); drawScaleBar(); drawMeasure3D();
}
