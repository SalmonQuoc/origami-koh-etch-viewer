// =====================================================================================================
// Tools on the 3D view: zoom buttons, an axis gizmo (wafer axes x, y, z with their crystal directions;
// click an axis to look along it), a scale bar, and a measuring tool (click two points on a surface).
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
  giz.innerHTML = `<canvas width="168" height="168" title="Wafer axes: click an axis to look along it"></canvas><div class="gzLeg"></div>`;
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
    for (const a of gizmoAxes()) for (const sg of [1, -1]) {
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
function gizmoAxes() {
  const q = camera.quaternion.clone().invert(), len = 30;
  return (["x", "y", "z"] as const).map((n, i) => {
    const v = new V3(i === 0 ? 1 : 0, i === 1 ? 1 : 0, i === 2 ? 1 : 0), c = v.clone().applyQuaternion(q);
    return { n, v, sx: c.x, sy: -c.y, depth: c.z, len, col: GZ_COL[n] };
  });
}
function drawGizmo() {
  const gc = document.querySelector("#gizmo canvas") as HTMLCanvasElement; if (!gc) return;
  const ctx = gc.getContext("2d"), W = gc.clientWidth || 84, dpr = gc.width/W;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, W);
  const c = W/2, ax = gizmoAxes(), ends: any[] = [];
  for (const a of ax) for (const sg of [1, -1]) ends.push({ a, sg, d: sg*a.depth });
  ends.sort((p, q) => p.d - q.d);   // far ends first
  ctx.font = "600 10px IBM Plex Sans, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const e of ends) {
    const x = c + e.sg*e.a.sx*e.a.len, y = c + e.sg*e.a.sy*e.a.len;
    ctx.globalAlpha = e.sg > 0 ? 1 : 0.55;
    ctx.strokeStyle = e.a.col; ctx.lineWidth = e.sg > 0 ? 2.2 : 1.2; ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, e.sg > 0 ? 8 : 5, 0, 2*Math.PI);
    if (e.sg > 0) { ctx.fillStyle = e.a.col; ctx.fill(); ctx.fillStyle = "#fff"; ctx.fillText(e.a.n, x, y + 0.5); }
    else { ctx.fillStyle = "#" + COL["scene-bg"].getHexString(); ctx.fill(); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
  const leg = document.querySelector("#gizmo .gzLeg");
  const key = `${S.mode}|${S.wf}|${SIM.fk}`;
  if (leg && leg.getAttribute("data-k") !== key) {
    const e = gizmoIdx(), nm = ["along the flat", "away from the flat", "wafer normal"];
    leg.innerHTML = (["x", "y", "z"] as const).map((n, i) => `<div><b style="color:${GZ_COL[n]}">${n}</b> ${idxHTML(e[i], "[", "]")} <span>${nm[i]}</span></div>`).join("")
      + (S.mode === "find" ? `<div class="gzNote">crystal as drawn (δ = 0)</div>` : "");
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
function stageOverlay() { drawGizmo(); drawScaleBar(); drawMeasure3D(); }
