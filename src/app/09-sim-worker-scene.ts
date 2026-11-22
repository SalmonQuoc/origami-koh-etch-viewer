// ---- worker (with an in-page fallback when workers are blocked)
function startWorker() {
  if (SIM.worker) return;
  const onMsg = m => simMessage(m);
  try {
    const wb = (document.getElementById("etchWasm") || {}).textContent || "";
    const src = `${etchEngineFactory.toString()}\nconst E = etchEngineFactory();\nconst WB = ${JSON.stringify(wb.trim())};\nif (WB) { const s = atob(WB), b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); E.wasmInit(b); }\nconst h = E.makeHandler((m, t) => postMessage(m, t || []));\nonmessage = e => h(e.data, f => setTimeout(f, 0));`;
    const url = URL.createObjectURL(new Blob([src], { type: "text/javascript" }));
    const w = new Worker(url);
    w.onmessage = e => onMsg(e.data);
    w.onerror = () => { w.terminate(); SIM.worker = null; inPage(); };
    SIM.worker = { post: m => w.postMessage(m), kind: "worker" };
  } catch (e) { inPage(); }
  function inPage() {
    const h = EE.makeHandler(m => setTimeout(() => onMsg(m), 0));
    SIM.worker = { post: m => h(m, f => setTimeout(f, 0)), kind: "page" };
    if (SIM.pendingRun) SIM.worker.post(SIM.pendingRun);
  }
}

// ---- configuration from the UI state
var SIM_CELLS = { draft: 1.5e5, normal: 4e5, fine: 1e6, ultra: 2.5e6 };
var SIM_DXF = { draft: 1.4, normal: 1, fine: 0.7, ultra: 0.5 };   // factor on the cell-size cap
function simConfig() {
  const F = simFrame(), R = SRATES[SIM.rate].r;
  const shapes = SIM.shapes.map(engineShape);
  const X0 = -SIM.hx, X1 = SIM.hx, Y0 = -SIM.hy, Y1 = SIM.hy;
  const vert = EE.rateC(EE.makeRate(R), F.e[2][0], F.e[2][1], F.e[2][2]);   // R of the wafer normal (crystal components of e3)
  // target number of grid cells per resolution; the cell size dx follows from the domain volume (at least 0.5 µm)
  const target = SIM_CELLS[SIM.quality] || SIM_CELLS.normal;
  let dx = 1, Lz = 0;
  for (let it = 0; it < 4; it++) {
    Lz = Math.min(SIM.thick, vert*SIM.t*1.06 + (SIM.pre || 0) + 6*dx + 4);
    dx = Math.max(0.5, Math.ceil(Math.cbrt((X1 - X0)*(Y1 - Y0)*Lz/target)*4)/4);
    // preset with thin walls (and the corner lab): a cap on the cell size, finer with the resolution
    if (SIM.dxMax) dx = Math.max(0.5, Math.min(dx, Math.round(SIM.dxMax*(SIM_DXF[SIM.quality] || 1)*4)/4));
  }
  Lz = Math.min(SIM.thick, Math.max(3*dx, Lz));
  return { frame: simE(), rates: R, probes: SIM.probes || null, shapes, X0, X1, Y0, Y1, depth: Lz, dx, pre: SIM.pre || 0 };
}
function cutSpec() {
  if (!SIM.grid) return null;
  const g = SIM.grid;
  if (SIM.cutAxis === "y") return { axis: "y", index: Math.max(0, Math.min(g.Ny - 1, Math.round((SIM.cutPos + SIM.hy)/g.dx - 0.5))) };
  return { axis: "x", index: Math.max(0, Math.min(g.Nx - 1, Math.round((SIM.cutPos + SIM.hx)/g.dx - 0.5))) };
}

function simRun() {
  startWorker();
  const cfg: any = simConfig(); cfg.noWasm = SET.engine === "js";
  SIM.id++; SIM.hist = null; SIM.rtab = EE.makeRate(cfg.rates); SIM.tEnd = SIM.t; SIM.tSim = 0; SIM.running = true; SIM.res = null; SIM.cfg = cfg;
  SIM.grid = { Nx: Math.round((cfg.X1 - cfg.X0)/cfg.dx), Ny: Math.round((cfg.Y1 - cfg.Y0)/cfg.dx), Nz: Math.max(3, Math.round(cfg.depth/cfg.dx)), dx: cfg.dx, depth: cfg.depth };
  const msg = { cmd: "run", cfg, tEnd: SIM.t, id: SIM.id, cut: cutSpec(), cutMesh: SIM.cutOn };
  SIM.pendingRun = msg;
  SIM.worker.post(msg);
  $("simStatus").textContent = `Grid ${SIM.grid.Nx} × ${SIM.grid.Ny} × ${SIM.grid.Nz}, cell ${cfg.dx} µm, depth simulated ${cfg.depth.toFixed(0)} µm. Etching…`;
  $("simBar").style.width = "0%";
  $("bSimRun").textContent = "Restart";
  SIM.dirty = false; updateDirtyNote();
}
function simMessage(m) {
  if (m.type === "error") { $("simStatus").textContent = "Error: " + m.message; SIM.running = false; return; }
  if (m.id !== SIM.id) return;
  if (m.type === "grid") { SIM.grid = { Nx: m.Nx, Ny: m.Ny, Nz: m.Nz, dx: m.dx, depth: SIM.cfg.depth }; SIM.engineInfo = m; return; }
  if (m.type === "progress" || m.type === "done") {
    SIM.tSim = m.t; SIM.res = m;
    $("simBar").style.width = `${(100*m.t/SIM.tEnd).toFixed(1)}%`;
    if (m.type === "done") {
      SIM.running = false; if (m.hist) SIM.hist = m.hist;
      $("simStatus").textContent = `Done: ${m.steps} time steps in ${(m.ms/1000).toFixed(1)} s on a ${SIM.grid.Nx} × ${SIM.grid.Ny} × ${SIM.grid.Nz} grid (cell ${SIM.grid.dx} µm), ${SIM.engineInfo && SIM.engineInfo.engine === "rust" ? "Rust/WebAssembly kernel" : "JavaScript engine"}.`;
    } else $("simStatus").textContent = `Etching… ${m.t.toFixed(0)} of ${SIM.tEnd} min`;
    $("simT").max = String(SIM.tSim); $("simT").value = String(SIM.tSim); SIM.tv = SIM.tSim;
    $("simTnow").textContent = `${SIM.tv.toFixed(0)} min`; $("simTmax").textContent = `${SIM.tSim.toFixed(0)} min simulated`;
    if (simLike()) buildSim(false);
    return;
  }
  if (m.type === "view") {
    SIM.viewBusy = false; SIM.res = m;
    if (simLike()) buildSim(false);
    if (SIM.viewWant) { const w = SIM.viewWant; SIM.viewWant = null; requestView(w); }
  }
}
function requestView(tv) {
  if (!SIM.worker || !SIM.res) return;
  if (SIM.viewBusy) { SIM.viewWant = tv; return; }
  SIM.viewBusy = true;
  SIM.worker.post({ cmd: "view", tv, cut: cutSpec(), cutMesh: SIM.cutOn, id: SIM.id });
}

// ---- plane classification for colours and the tooltip
const FAMS = ["100", "110", "111", "311", "211", "221", "331", "210", "310", "320", "411", "511", "321"].map(k => {
  const v = k.split("").map(Number), n = Math.hypot(...v); return { k, v: v.map(x => x/n).sort((a, b) => b - a), raw: v };
});
function classifyN(nw) {   // nw: wafer-frame unit normal -> {fam, hkl, ang}
  const [e1, e2, e3] = simE();
  const c = [0, 1, 2].map(i => e1[i]*nw[0] + e2[i]*nw[1] + e3[i]*nw[2]);
  const order = [0, 1, 2].sort((a, b) => Math.abs(c[b]) - Math.abs(c[a]));
  const s = order.map(i => Math.abs(c[i]));
  let best = null, ba = 1e9;
  for (const f of FAMS) { const d = f.v[0]*s[0] + f.v[1]*s[1] + f.v[2]*s[2]; const a = Math.acos(Math.min(1, d))*C.DEG; if (a < ba) { ba = a; best = f; } }
  const sortedRaw = best.raw.slice().sort((a, b) => b - a), hkl = [0, 0, 0];
  order.forEach((ci, r) => { hkl[ci] = Math.sign(c[ci] || 1)*sortedRaw[r]; });
  return { fam: best.k, hkl, ang: ba };
}
function famCol(f, ang) {
  if (ang > 4) return COL["s-side"];
  return f === "111" ? COL.f111 : f === "100" ? COL.f100 : f === "110" ? COL.f110 : COL.fhi;
}

// ---- 3D scene
let simScene = null;
function buildSim(resetView) {
  scene = new THREE.Scene(); scene.background = COL["scene-bg"]; clearLabels();
  const X0 = -SIM.hx, X1 = SIM.hx, Y0 = -SIM.hy, Y1 = SIM.hy, zb = SIM.grid ? SIM.grid.Nz*SIM.grid.dx : 100;
  radius = 0.5*Math.hypot(X1 - X0, Y1 - Y0, zb)*0.85;
  const g = new THREE.Group(); scene.add(g);
  simScene = { pick: null, triInfo: null };
  const r = SIM.res;
  const cut = SIM.cutOn ? cutSpec() : null;
  let clip = null;
  if (cut && SIM.grid) {
    const d = SIM.grid.dx;
    clip = cut.axis === "y" ? [new THREE.Plane(new V3(0, -1, 0), Y0 + (cut.index + 1)*d)] : [new THREE.Plane(new V3(-1, 0, 0), X0 + (cut.index + 1)*d)];
  }
  if (r && r.mesh && r.mesh.idx.length) {
    const { pos, idx, tag } = r.mesh, nt = idx.length/3, nv = pos.length/3;
    const P = new Float32Array(nt*9), Cc = new Float32Array(nt*9), info = new Array(nt), VN = new Float32Array(nv*3), FN = new Float32Array(nt*3);
    for (let t = 0; t < nt; t++) {   // face normals (area weighted) accumulated on vertices: smooths the grid staircase
      const a = idx[3*t], b = idx[3*t+1], c = idx[3*t+2];
      const ux = pos[3*b] - pos[3*a], uy = pos[3*b+1] - pos[3*a+1], uz = pos[3*b+2] - pos[3*a+2], vx = pos[3*c] - pos[3*a], vy = pos[3*c+1] - pos[3*a+1], vz = pos[3*c+2] - pos[3*a+2];
      const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
      FN[3*t] = nx; FN[3*t+1] = ny; FN[3*t+2] = nz;
      if (tag[t]) continue;
      for (const v of [a, b, c]) { VN[3*v] += nx; VN[3*v+1] += ny; VN[3*v+2] += nz; }
    }
    for (let pass = 0; pass < 2; pass++) {   // two more smoothing rings (vertex -> face -> vertex)
      const V2 = new Float32Array(nv*3);
      for (let t = 0; t < nt; t++) {
        if (tag[t]) continue;
        const a = idx[3*t], b = idx[3*t+1], c = idx[3*t+2];
        let sx = VN[3*a] + VN[3*b] + VN[3*c], sy = VN[3*a+1] + VN[3*b+1] + VN[3*c+1], sz = VN[3*a+2] + VN[3*b+2] + VN[3*c+2];
        const L = Math.hypot(sx, sy, sz) || 1; sx /= L; sy /= L; sz /= L;
        for (const v of [a, b, c]) { V2[3*v] += sx; V2[3*v+1] += sy; V2[3*v+2] += sz; }
      }
      VN.set(V2);
    }
    const gx1 = X0 + SIM.grid.Nx*SIM.grid.dx, gy1 = Y0 + SIM.grid.Ny*SIM.grid.dx;
    // colour by a value: depth, local rate R(n) or arrival time of the front
    const mode = SIM.color, vt = r.mesh.vt;
    let vval = null, vmax = 1;
    if (mode !== "plane") {
      vval = new Float32Array(nv);
      if (mode === "depth") { vmax = Math.max(1, SIM.hist ? Math.max(...SIM.hist.depth) : r.st ? r.st.depth : zb); for (let v = 0; v < nv; v++) vval[v] = -pos[3*v+2]; }
      else if (mode === "time") { vmax = Math.max(1e-6, r.tv); for (let v = 0; v < nv; v++) vval[v] = vt ? vt[v] : 0; }
      else {
        if (!SIM.rtab) SIM.rtab = EE.makeRate(SRATES[SIM.rate].r);
        const [e1, e2, e3] = simE(); vmax = Math.max(...Object.values(SRATES[SIM.rate].r));
        for (let v = 0; v < nv; v++) {
          const L = Math.hypot(VN[3*v], VN[3*v+1], VN[3*v+2]) || 1, n = [VN[3*v]/L, VN[3*v+1]/L, VN[3*v+2]/L];
          vval[v] = EE.rateC(SIM.rtab, e1[0]*n[0] + e2[0]*n[1] + e3[0]*n[2], e1[1]*n[0] + e2[1]*n[1] + e3[1]*n[2], e1[2]*n[0] + e2[2]*n[1] + e3[2]*n[2]);
        }
      }
      SIM.cbar = { mode, vmax };
    } else SIM.cbar = null;
    const d = SIM.grid.dx*0.05, onB = v => Math.abs(pos[3*v] - X0) < d || Math.abs(pos[3*v] - gx1) < d || Math.abs(pos[3*v+1] - Y0) < d || Math.abs(pos[3*v+1] - gy1) < d || Math.abs(pos[3*v+2] + zb) < d;
    for (let t = 0; t < nt; t++) {
      const a = idx[3*t], b = idx[3*t+1], c = idx[3*t+2];
      P.set([pos[3*a], pos[3*a+1], pos[3*a+2], pos[3*b], pos[3*b+1], pos[3*b+2], pos[3*c], pos[3*c+1], pos[3*c+2]], 9*t);
      const L = Math.hypot(FN[3*t], FN[3*t+1], FN[3*t+2]) || 1, fn = [FN[3*t]/L, FN[3*t+1]/L, FN[3*t+2]/L];
      let qn = [VN[3*a] + VN[3*b] + VN[3*c], VN[3*a+1] + VN[3*b+1] + VN[3*c+1], VN[3*a+2] + VN[3*b+2] + VN[3*c+2]];
      const Q = Math.hypot(...qn); qn = Q > 0 ? qn.map(v => v/Q) : fn;
      let col, cls = null, kind = 0;
      if (tag[t]) { col = shadeColor(COL["s-cut"], fn); kind = 1; }
      else if (onB(a) && onB(b) && onB(c)) { col = shadeColor(COL["s-side"], fn); kind = 2; }
      else if (pos[3*a+2] > -d && pos[3*b+2] > -d && pos[3*c+2] > -d && fn[2] > 0.9) { col = shadeColor(COL["s-top"], fn); kind = 3; }
      else { cls = classifyN(qn); col = shadeColor(famCol(cls.fam, cls.ang), qn); }
      info[t] = { qn: kind ? fn : qn, cls, cap: kind === 1, kind, val: vval && !kind ? (vval[a] + vval[b] + vval[c])/3 : null };
      if (vval && !kind) {
        [a, b, c].forEach((v, k) => { const cv = shadeColor(cmap(vval[v]/vmax), qn); Cc[9*t + 3*k] = cv.r; Cc[9*t + 3*k + 1] = cv.g; Cc[9*t + 3*k + 2] = cv.b; });
        continue;
      }
      for (let k = 0; k < 3; k++) { Cc[9*t + 3*k] = col.r; Cc[9*t + 3*k + 1] = col.g; Cc[9*t + 3*k + 2] = col.b; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(P, 3)); geo.setAttribute("color", new THREE.BufferAttribute(Cc, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
    g.add(mesh); simScene.pick = mesh; simScene.triInfo = info;
  }
  // domain box edges
  const zbb = -zb;
  g.add(linesFromLoops([[[X0, Y0, 0], [X1, Y0, 0], [X1, Y1, 0], [X0, Y1, 0]], [[X0, Y0, zbb], [X1, Y0, zbb], [X1, Y1, zbb], [X0, Y1, zbb]]], COL["s-ink"], { opacity: 0.35, clip }));
  g.add(linesFromLoops([[[X0, Y0, 0], [X0, Y0, zbb]], [[X1, Y0, 0], [X1, Y0, zbb]], [[X0, Y1, 0], [X0, Y1, zbb]], [[X1, Y1, 0], [X1, Y1, zbb]]], COL["s-ink"], { opacity: 0.35, clip }));
  // mask layer at its true thickness (it thins at the SiO₂ etch rate), with suspended parts tinted
  const film = maskFilm(SIM.rate, SIM.res ? SIM.res.tv : 0), zMask = film.left;
  if (SIM.showMask) {
    const tex = maskTexture(r);
    const pg = new THREE.PlaneGeometry(X1 - X0, Y1 - Y0); pg.translate((X0 + X1)/2, (Y0 + Y1)/2, zMask);
    const mm = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: film.gone ? 0.3 : 1, side: THREE.DoubleSide, alphaTest: 0.02, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
    mm.renderOrder = 5; mm.userData.noPick = true; g.add(mm);
  }
  // mask outlines
  const clipRect = P => {   // Sutherland-Hodgman clip of a mask loop to the simulated domain
    for (const [ax, sg, lim] of [[0, 1, X0], [0, -1, X1], [1, 1, Y0], [1, -1, Y1]]) {
      const Q = [];
      for (let i = 0; i < P.length; i++) {
        const A = P[i], B = P[(i + 1) % P.length], da = sg*(A[ax] - lim), db = sg*(B[ax] - lim);
        if (da >= 0) Q.push(A);
        if ((da >= 0) !== (db >= 0)) { const u = da/(da - db); Q.push([A[0] + u*(B[0] - A[0]), A[1] + u*(B[1] - A[1])]); }
      }
      P = Q; if (P.length < 3) return [];
    }
    const onEdge = P.every(p => Math.min(Math.abs(p[0] - X0), Math.abs(p[0] - X1), Math.abs(p[1] - Y0), Math.abs(p[1] - Y1)) < 1e-6);
    return onEdge ? [] : P;   // a shape covering the whole domain draws no outline
  };
  const loops = SIM.shapes.flatMap(s => shapePolys(s).map(clipRect)).filter(P => P.length).map(P => P.map(p => [p[0], p[1], Math.max(0.8, 0.005*radius)]));
  if (SIM.showMask) { const es = SIM.shapes.map(engineShape); g.add(maskRim(SIM.shapes.flatMap(shapePolys), (x, y) => EE.isOpen(es, x, y), zMask, clip, [X0, X1, Y0, Y1])); }
  else if (loops.length) g.add(linesFromLoops(loops, COL.mask, { clip, opacity: 0.8 }));
  // flat and frame labels
  const F = simFrame();
  g.add(topArrow(new V3(1, 0, 0), new V3(X0, Y0, zMask + 0.004*zb), (X1 - X0)*0.25, radius*0.06, radius*0.035));
  addLabel(new V3(X0 + (X1 - X0)*0.13, Y0 - radius*0.06, 0), idxHTML(F.idx[0], "[", "]") + " along flat", "acc");
  // perpendicular to the flat, pointing outward (wafer -y, away from the centre); for the (110) arrow convention this is the ⟨111⟩ arrow
  g.add(topArrow(new V3(0, -1, 0), new V3((X0 + X1)/2, Y0, zMask + 0.004*zb), radius*0.35, radius*0.06, radius*0.035));
  addLabel(new V3((X0 + X1)/2 + radius*0.04, Y0 - radius*0.42, 0), (F.arrow ? "⟨111⟩ " : "") + idxHTML(negIdx(F.idx[1]), "[", "]") + " ⊥ flat, outward", "acc");
  addLabel(new V3(X1, Y1, 0), idxHTML(F.idx[2], "(", ")") + " surface", "", camDir => camDir.z > 0.1);
  scene.userData.center = new V3((X0 + X1)/2, (Y0 + Y1)/2, -zb/2); scene.userData.die = scene.userData.center.clone();
  frameR = S.waferOn ? 0.53*WAFER.D : 0;
  if (S.waferOn) { g.add(waferGroup(F.wf, S.wtype, -S.dieX*1000, -S.dieY*1000, { hole: [X0, X1, Y0, Y1], clip, flatLabel: idxHTML(F.idx[0], "[", "]"), normalLabel: idxHTML(negIdx(F.idx[1]), "[", "]") })); scene.userData.center = new V3(-S.dieX*1000, -S.dieY*1000, 0); }
  if (resetView) setView(dirOf(30, -62), scene.userData.center, true);
  if (S.mode === "corner" && SIM.cl) {
    addLabel(new V3(SIM.cl.xL, SIM.cl.yc + 0.25*SIM.hy, 2), "no compensation", "acc");
    addLabel(new V3(SIM.cl.xR, SIM.cl.yc + 0.25*SIM.hy, 2), SIM.cl.type === "none" ? "no compensation" : $("clType").selectedOptions[0].textContent, "acc");
  }
  updateSimReadout(); drawSection(); drawMaskEditor(); drawSimGraph(); simCbar(); clReadout();
  resize();
}
const CB_TITLE = { depth: ["depth below the surface", "µm"], rate: ["local etch rate R(n)", "µm/min"], time: ["time the front reached the surface", "min"] };
function simCbar() {
  if (!simLike() || !SIM.cbar) { if (simLike()) hideCbar(); return; }
  const [t, u] = CB_TITLE[SIM.cbar.mode]; showCbar(t, 0, SIM.cbar.vmax, u);
}
function drawSimGraph() {
  const h = SIM.hist, cv = $("simGraph"), leg = $("simGraphLeg");
  if (!h) { const ctx = cv.getContext("2d"); cv.style.height = "40px"; cv.width = cv.clientWidth || 300; cv.height = 40; ctx.clearRect(0, 0, cv.width, 40); ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted"); ctx.font = "12px IBM Plex Sans, sans-serif"; ctx.fillText(SIM.running ? "The history appears when the run finishes." : "Run the simulation to see the history.", 4, 24); leg.innerHTML = ""; return; }
  let series = [{ name: "max depth", color: "#" + COL.accent.getHexString(), x: h.t, y: h.depth },
                  { name: "max undercut under the mask", color: "#" + COL.ghost.getHexString(), x: h.t, y: h.under }];
  let marks = [];
  if (S.mode === "corner" && h.probe && h.probe.length === 2 && SIM.cl) {
    series = [{ name: "unprotected corner", color: "#" + COL.accent.getHexString(), x: h.t, y: h.probe[0] }];
    if (SIM.cl.type !== "none") series.push({ name: "compensated corner", color: "#" + COL.ghost.getHexString(), x: h.t, y: h.probe[1] });
    marks = [{ x: SIM.cl.tT, label: `depth H at ${SIM.cl.tT.toFixed(0)} min` }];
  }
  const vals = drawGraph(cv, series, { xmax: h.t[h.t.length - 1], tv: SIM.tv, marks, ylabel: S.mode === "corner" ? "corner position (µm)" : "µm" });
  graphLegend(leg, series, vals, SIM.tv);
}
function maskTexture(r) {
  const X0 = -SIM.hx, Y0 = -SIM.hy, W = 2*SIM.hx, H = 2*SIM.hy, s = Math.min(4, 1400/Math.max(W, H));
  const cv = document.createElement("canvas"); cv.width = Math.max(2, Math.round(W*s)); cv.height = Math.max(2, Math.round(H*s));
  const ctx = cv.getContext("2d");
  paintMask(ctx, s, X0, Y0, H, "#" + COL.mask.getHexString(), 0.85);
  // mask with no silicon under it (released or undercut): darker
  if (r && r.top && SIM.grid && SIM.cfg) {
    const g = SIM.grid, dx = g.dx, ov = document.createElement("canvas"); ov.width = cv.width; ov.height = cv.height;
    const o = ov.getContext("2d"); o.setTransform(s, 0, 0, -s, -X0*s, (Y0 + H)*s); o.fillStyle = "#" + COL.mask.clone().multiplyScalar(0.55).getHexString();
    for (let j = 0; j < g.Ny; j++) for (let i = 0; i < g.Nx; i++) if (r.top[j*g.Nx + i]) o.fillRect(X0 + i*dx - 0.3, Y0 + j*dx - 0.3, dx + 0.6, dx + 0.6);
    o.setTransform(1, 0, 0, 1, 0, 0); o.globalCompositeOperation = "destination-in"; o.drawImage(cv, 0, 0);
    ctx.globalAlpha = 1; ctx.drawImage(ov, 0, 0);
  }
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
}
function paintMask(ctx, s, X0, Y0, H, color, alpha) {
  const W = ctx.canvas.width/s;
  ctx.save();
  ctx.setTransform(s, 0, 0, -s, -X0*s, (Y0 + H)*s);   // world (x, y) -> canvas, y up
  ctx.globalAlpha = alpha; ctx.fillStyle = color; ctx.fillRect(X0, Y0, W, H);
  for (const sh of SIM.shapes) {
    ctx.beginPath();
    for (const P of shapePolys(sh)) { P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }
    if (sh.op === "open") { ctx.globalCompositeOperation = "destination-out"; ctx.globalAlpha = 1; ctx.fill(); }
    else { ctx.globalCompositeOperation = "destination-out"; ctx.globalAlpha = 1; ctx.fill(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = alpha; ctx.fill(); }
  }
  ctx.restore();
}

// ---- readout
function updateSimReadout() {
  const r = SIM.res, rows = [];
  rows.push(["view time", r ? `${r.tv.toFixed(0)} min` : "-"]);
  if (r && r.st) {
    const st = r.st, d = st.depth;
    rows.push(["max depth", d > 0 ? um(d) : "-"]);
    rows.push(["max undercut under mask", st.under > 0 ? um(st.under) : "none"]);
    if (d > 0 && st.under > 0) rows.push(["undercut / depth", (st.under/d).toFixed(2)]);
    rows.push(["mask with no Si under it", `${(st.susp/1e3).toFixed(1)}×10³ µm²`]);
    if (st.through > 0) rows.push(SIM.cfg && SIM.cfg.depth >= SIM.thick - 1e-6 ? ["etched through the wafer", `${(st.through/1e3).toFixed(1)}×10³ µm²`] : ["reached the simulated depth", `${SIM.cfg.depth.toFixed(0)} µm (raise it only by a longer time)`]);
    SIM.shapes.forEach((s, i) => { if (s.name && st.rel[i] != null) rows.push([`${s.name} free`, `${(100*st.rel[i]).toFixed(0)} %${st.rel[i] > 0.995 ? " (released)" : ""}`]); });
    rows.push(["mask film", maskFilmText(maskFilm(SIM.rate, r.tv), r.tv)]);
  }
  $("simReadout").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

// ---- 2D section
function drawSection() {
  const cv = $("secCanvas"), ctx = cv.getContext("2d");
  const wcss = cv.clientWidth || 600, r = SIM.res;
  const sec = r && r.sec, g = SIM.grid;
  const along = SIM.cutAxis === "y" ? 2*SIM.hx : 2*SIM.hy, a0 = SIM.cutAxis === "y" ? -SIM.hx : -SIM.hy;
  const zd = g ? g.Nz*g.dx : 100;
  const pad = 34, sc = (wcss - 2*pad)/along, hcss = Math.min(bigBox(cv) ? Math.round(window.innerHeight*0.55) : 420, Math.max(120, zd*sc + 2*pad));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(wcss*dpr); cv.height = Math.round(hcss*dpr); cv.style.height = `${hcss}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, wcss, hcss);
  const X = a => pad + (a - a0)*sc, Z = z => pad - z*sc;    // z <= 0 downward
  const ink = "#" + COL["s-ink"].getHexString(), si = "#" + COL["s-top"].getHexString(), maskc = "#" + COL.mask.getHexString();
  ctx.font = "11px IBM Plex Mono, monospace"; ctx.fillStyle = ink; ctx.strokeStyle = ink;
  if (!sec || !g) { ctx.fillText("Run the simulation to see the section.", pad, pad + 14); return; }
  const n = sec.n, Nz = sec.Nz, dx = g.dx;
  const ax = a => a0 + (a + 0.5)*dx, zk = k => -(k + 0.5)*dx;
  ctx.fillStyle = si; ctx.beginPath();
  // marching squares on the node lattice, extended by half a cell to the block faces and the surface
  const S2 = (k, a) => (k < 0 || a < 0 || a >= n || k >= Nz) ? 0 : sec.sil[k*n + a];
  const pt = (a, k) => [X(ax(a)), Z(zk(k))];
  for (let k = -1; k < Nz; k++) for (let a = -1; a < n; a++) {
    const cs = [[a, k], [a + 1, k], [a + 1, k + 1], [a, k + 1]];
    const v = cs.map(([aa, kk]) => S2(kk, aa));
    if (!v.some(x => x)) continue;
    const poly = [];
    for (let e = 0; e < 4; e++) {
      const [pa, pk] = cs[e], [qa, qk] = cs[(e + 1) % 4], va = v[e], vb = v[(e + 1) % 4];
      if (va) poly.push(pt(pa, pk));
      if (va !== vb) {
        let f = 0.5;
        const inside = (aa, kk) => aa >= 0 && aa < n && kk >= 0 && kk < Nz;
        if (inside(pa, pk) && inside(qa, qk)) {
          if (pk === qk) { const lo = Math.min(pa, qa), fr = sec.fa[pk*n + lo]; if (fr >= 0) f = pa < qa ? fr : 1 - fr; }
          else { const lo = Math.min(pk, qk), fr = sec.fk[lo*n + pa]; if (fr >= 0) f = pk < qk ? fr : 1 - fr; }
        }
        const A = pt(pa, pk), B = pt(qa, qk); poly.push([A[0] + f*(B[0] - A[0]), A[1] + f*(B[1] - A[1])]);
      }
    }
    if (poly.length >= 3) { ctx.moveTo(poly[0][0], poly[0][1]); for (let i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath(); }
  }
  ctx.fill();
  // mask on top
  ctx.fillStyle = maskc;
  for (let a = 0; a < n; a++) if (!sec.open[a]) ctx.fillRect(X(a0 + a*dx), Z(0) - 3, dx*sc + 0.6, 3);
  // axes
  ctx.fillStyle = ink; ctx.globalAlpha = 0.8;
  ctx.beginPath(); ctx.moveTo(X(a0), Z(0)); ctx.lineTo(X(a0 + along), Z(0)); ctx.lineWidth = 0.5; ctx.stroke();
  const step = edGrid(along);
  for (let v = Math.ceil(a0/step)*step; v <= a0 + along + 1e-6; v += step) { ctx.fillRect(X(v), Z(0) + 1, 0.8, 4); ctx.fillText(`${v.toFixed(0)}`, X(v) - 8, Z(0) - 7); }
  const zs = niceStep(zd/4);
  for (let v = 0; v <= zd + 1e-6; v += zs) { ctx.fillRect(X(a0) - 5, Z(-v), 4, 0.8); ctx.fillText(`${v.toFixed(0)}`, 2, Z(-v) + 4); }
  ctx.fillText(SIM.cutAxis === "y" ? "x (µm)" : "y (µm)", X(a0 + along) - 44, Z(0) - 20);
  { // where the cursor is in the mask editor, projected on the section
    const c = EDC.maskCanvas; if (c && SET.coords !== false) { const v = SIM.cutAxis === "y" ? c[0] : c[1];
      ctx.save(); ctx.strokeStyle = "#" + COL.accent.getHexString(); ctx.globalAlpha = 0.7; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X(v), Z(0) - 4); ctx.lineTo(X(v), Z(-zd)); ctx.stroke(); ctx.restore(); } }
  ctx.globalAlpha = 1;
  const ci = cutSpec().index, lab = SIM.cutAxis === "y" ? `section along x at y = ${(-SIM.hy + (ci + 0.5)*dx).toFixed(0)} µm` : `section along y at x = ${(-SIM.hx + (ci + 0.5)*dx).toFixed(0)} µm`;
  ctx.fillText(lab + "  (µm, true scale; mask drawn on top)", pad, hcss - 8);
}
function niceStep(x) { const p = Math.pow(10, Math.floor(Math.log10(x))); for (const k of [1, 2, 2.5, 5, 10]) if (k*p >= x) return k*p; return 10*p; }

// ---- mask editor
function drawMaskEditor() {
  const cv = $("maskCanvas"), ctx = cv.getContext("2d");
  const W = 2*SIM.hx, H = 2*SIM.hy; cv.style.width = "";
  let wcss = cv.clientWidth || 300, s = (wcss - 20)/W;
  const sh_ = (edMaxH(cv) - 34)/H; if (sh_ < s) { s = sh_; wcss = Math.round(W*s + 20); cv.style.width = `${wcss}px`; }
  const hcss = H*s + 34;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(wcss*dpr); cv.height = Math.round(hcss*dpr); cv.style.height = `${hcss}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, wcss, hcss);
  const V = edView("maskCanvas", s, 10, 10, W*s, H*s, 0, 0, 40);
  SIM.ed = { s: V.s, ox: V.ox, oy: V.oy, view: V };
  const tmp = document.createElement("canvas"); tmp.width = Math.round(W*s*dpr); tmp.height = Math.round(H*s*dpr);
  paintMask(tmp.getContext("2d"), V.s*dpr, V.X0, V.Y0, V.Y1 - V.Y0, "#" + COL.mask.getHexString(), 0.55);
  ctx.fillStyle = "#" + COL["scene-bg"].getHexString(); ctx.fillRect(10, 10, W*s, H*s);
  ctx.drawImage(tmp, 10, 10, W*s, H*s);
  if (V.z < 1) {   // zoomed out: grey out what lies outside the simulated domain
    const a0 = V.ox - SIM.hx*V.s, b0 = V.oy - SIM.hy*V.s, dw = 2*SIM.hx*V.s, dh = 2*SIM.hy*V.s;
    ctx.save(); ctx.beginPath(); ctx.rect(10, 10, W*s, H*s); ctx.rect(a0, b0, dw, dh);
    ctx.fillStyle = "#" + COL["scene-bg"].getHexString(); ctx.globalAlpha = 0.82; ctx.fill("evenodd"); ctx.globalAlpha = 1;
    ctx.strokeStyle = "#" + COL["s-ink"].getHexString(); ctx.setLineDash([5, 3]); ctx.strokeRect(a0, b0, dw, dh); ctx.setLineDash([]);
    ctx.font = "10px IBM Plex Sans, sans-serif"; ctx.fillStyle = "#" + COL["s-ink"].getHexString(); ctx.fillText("simulated domain", a0 + 2, b0 - 4);
    ctx.restore();
  }
  ctx.strokeStyle = "#" + COL["s-ink"].getHexString(); ctx.lineWidth = 1; ctx.strokeRect(10, 10, W*s, H*s);
  const zs = V.s, toC = p => [SIM.ed.ox + p[0]*zs, SIM.ed.oy - p[1]*zs];
  ctx.save(); ctx.beginPath(); ctx.rect(10, 10, W*s, H*s); ctx.clip();   // zoomed content stays in the plot
  SIM.shapes.forEach((sh, i) => {
    ctx.beginPath();
    for (const Q of shapePolys(sh)) { const P = Q.map(toC); P.forEach((p, k) => k ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }
    ctx.setLineDash(sh.op === "open" ? [] : [4, 3]); ctx.lineWidth = i === SIM.sel ? 2.2 : 1;
    ctx.strokeStyle = i === SIM.sel ? "#" + COL.accent.getHexString() : "#" + COL["s-ink"].getHexString(); ctx.stroke();
  });
  ctx.setLineDash([]);
  // section line
  ctx.strokeStyle = "#" + COL.ghost.getHexString(); ctx.setLineDash([6, 4]); ctx.lineWidth = 1.2; ctx.beginPath();
  if (SIM.cutAxis === "y") { const y = SIM.ed.oy - SIM.cutPos*zs; ctx.moveTo(10, y); ctx.lineTo(10 + W*s, y); }
  else { const x = SIM.ed.ox + SIM.cutPos*zs; ctx.moveTo(x, 10); ctx.lineTo(x, 10 + H*s); }
  ctx.stroke(); ctx.setLineDash([]);
  { // its coordinate, at the right end (along x) or the top end (along y), and a grip to drag it
    const lab = `${SIM.cutAxis === "y" ? "y" : "x"} = ${+(+SIM.cutPos).toFixed(1)} µm`;
    ctx.font = "600 10px IBM Plex Mono, monospace"; const tw = ctx.measureText(lab).width;
    const [gx, gy] = SIM.cutAxis === "y" ? [10 + W*s - tw - 14, SIM.ed.oy - SIM.cutPos*zs] : [SIM.ed.ox + SIM.cutPos*zs, 10 + 16];
    const bx = SIM.cutAxis === "y" ? gx : Math.min(Math.max(gx + 6, 12), 10 + W*s - tw - 10), by = SIM.cutAxis === "y" ? (gy - 18 < 12 ? gy + 4 : gy - 18) : gy - 7;
    ctx.fillStyle = "#" + COL["scene-bg"].getHexString(); ctx.globalAlpha = 0.85; ctx.fillRect(bx - 3, by, tw + 6, 14); ctx.globalAlpha = 1;
    ctx.fillStyle = "#" + COL.ghost.getHexString(); ctx.fillText(lab, bx, by + 10);
    const [hx_, hy_] = SIM.cutAxis === "y" ? [10 + W*s - 6, gy] : [gx, 10 + 6];
    ctx.beginPath(); ctx.arc(hx_, hy_, 4, 0, 2*Math.PI); ctx.fill();
  }
  ctx.restore();
  // flat at the bottom edge
  ctx.fillStyle = "#" + COL.accent.getHexString(); ctx.fillRect(10, 10 + H*s + 2, W*s, 3);
  ctx.font = "11px IBM Plex Sans, sans-serif";
  ctx.fillText(`primary flat side; x along ${plainIdx(simFrame().idx[0])}${SET.coords !== false ? `; grid ${edGrid(V.X1 - V.X0)} µm` : ""}`, 12, 10 + H*s + 18);
  if (S.compass) drawCompass(ctx, 10 + W*s - 44, 54, 30, inPlaneDirs(SFR[SIM.fk].e), SIM.rot || 0);
  const sel = SIM.shapes[SIM.sel];
  drawCoords(ctx, "maskCanvas", { X0: V.X0, X1: V.X1, Y0: V.Y0, Y1: V.Y1, toC, g: edGrid(V.X1 - V.X0), grid: true, sel: sel ? [sel.cx, sel.cy] : null });
  drawOverlay(ctx, "maskCanvas", toC);
}
const plainIdx = v => "[" + v.map(x => x < 0 ? `${-x}̅` : `${x}`).join("") + "]";
function renderShapeList() {
  const dirs = inPlaneDirs(SFR[SIM.fk].e);
  const rows = SIM.shapes.map((sh, i) => {
    const f = (k, v, st = 5, ttl = k) => `<input type="number" step="${st}" data-i="${i}" data-k="${k}" title="${ttl}" value="${+(+(v == null ? 0 : v)).toFixed(1)}">`;
    const T = SHAPE_TYPES[sh.type] || SHAPE_TYPES.rect;
    const dims = T.f.map(k => f(k, sh[k] == null ? 100 : sh[k], k === "n" ? 1 : 5, { w: "w (µm)", h: "h (µm)", t: sh.type === "ring" || sh.type === "star" ? "inner size (µm)" : "arm width t (µm)", n: "sides or points", k: "scale (%)" }[k])).join("");
    const ang = (sh.type === "para" ? f("a1", sh.a1, 1, "side 1 angle to the flat (°)") + f("a2", sh.a2, 1, "side 2 angle to the flat (°)") : sh.type === "pts" ? "" : f("ang", sh.ang, 1, "angle to the flat (°)")) + dirSelects(sh, i, dirs);
    const arr = `${f("nx", sh.nx || 1, 1, "copies along x")}${f("ny", sh.ny || 1, 1, "copies along y")}${f("px", sh.px || 0, 5, "pitch x (µm)")}${f("py", sh.py || 0, 5, "pitch y (µm)")}`;
    return `<tr class="${i === SIM.sel ? "sel" : ""}" data-row="${i}"><td><select data-i="${i}" data-k="op"><option value="open"${sh.op === "open" ? " selected" : ""}>open</option><option value="mask"${sh.op === "mask" ? " selected" : ""}>mask</option></select></td>
      <td class="ty">${T.name}</td><td>${f("cx", sh.cx)}${f("cy", sh.cy)}</td><td>${dims}</td><td>${ang}</td><td>${arr}</td><td style="white-space:nowrap"><button class="x" data-dup="${i}" title="duplicate (Ctrl+D)" aria-label="duplicate">⧉</button><button class="x" data-del="${i}" title="remove">×</button></td></tr>`;
  }).join("");
  $("shapeList").innerHTML = `<tr class="hd"><td>layer</td><td>shape</td><td>centre x, y</td><td>size</td><td>angle°</td><td>array nx, ny, px, py</td><td></td></tr>` + rows;
}
function markDirty() { SIM.dirty = true; updateDirtyNote(); renderShapeList(); if (simLike()) buildSim(false); autoRunMaybe(); }
function updateDirtyNote() { $("simDirty").classList.toggle("hidden", !SIM.dirty); stageRunSync(); }

function loadPreset(wf, i) {
  const p = SPRESETS[wf][i]; SIM.preset = i;
  SIM.fk = p.fk; SIM.rate = p.rate; SIM.t = p.t; SIM.pre = p.pre || 0; SIM.rot = 0; SIM.probes = null; SIM.cl = null; SIM.owner = "sim"; SIM.hx = p.hx; SIM.hy = p.hy; SIM.dxMax = p.dxMax || 0;
  SIM.shapes = p.shapes.map(s => Object.assign({}, s)); SIM.sel = -1; SIM.cutPos = 0; SIM.cutAxis = "y";
  $("simNote").innerHTML = p.note;
  syncSimInputs(); renderShapeList();
}
function syncSimInputs() {
  $("simFrame").value = SIM.fk; $("simFrameRow").classList.toggle("hidden", SFR[SIM.fk].wf !== "110");
  $("simRate").value = SIM.rate; $("simTime").value = SIM.t; $("simPre").value = SIM.pre; $("simRot").value = SIM.rot || 0; $("simThick").value = SIM.thick;
  $("simHx").value = 2*SIM.hx; $("simHy").value = 2*SIM.hy; $("simQual").value = SIM.quality;
  pressed($("segCut"), "a", SIM.cutAxis); syncCutSlider();
  $("simFrameSrc").textContent = SFR[SIM.fk].src;
  $("simRateSrc").textContent = SRATES[SIM.rate].src;
}
function syncCutSlider() {
  const h = SIM.cutAxis === "y" ? SIM.hy : SIM.hx; $("simCutPos").min = String(-h); $("simCutPos").max = String(h); $("simCutPos").value = String(SIM.cutPos);
  $("simCutLbl").textContent = SIM.cutAxis === "y" ? "y" : "x";
  const nb = $("simCutNum"); nb.min = String(-h); nb.max = String(h); nb.step = String(Number(SET.snap) || 1);
  if (document.activeElement !== nb) nb.value = String(+(+SIM.cutPos).toFixed(1));
}
function fillSimPresets() {
  $("simPreset").innerHTML = `<optgroup label="Examples">` + SPRESETS[S.wf].map((p, i) => `<option value="${i}">${p.name}</option>`).join("") + `</optgroup>`
    + psOptions("sim") + `<option value="-1">Custom (keep the current mask)</option>`;
  $("simPreset").value = String(SIM.preset);
}

// ---- wiring
$("simRate").innerHTML = Object.entries(SRATES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
$("simPreset").addEventListener("change", e => { if (e.target.value.startsWith("u:")) { psLoad(e.target.value.slice(2)); return; } const i = Number(e.target.value); if (i < 0) return; loadPreset(S.wf, i); simRun(); buildSim(true); });
$("bSimRun").addEventListener("click", () => { simRun(); buildSim(false); });
$("simFrame").addEventListener("change", e => { SIM.fk = e.target.value; $("simFrameSrc").textContent = SFR[SIM.fk].src; markDirty(); });
$("simRate").addEventListener("change", e => { SIM.rate = e.target.value; $("simRateSrc").textContent = SRATES[SIM.rate].src; markDirty(); });
$("simRot").addEventListener("change", e => { SIM.rot = Number(e.target.value) || 0; markDirty(); });
for (const [id, key, mul] of [["simTime", "t", 1], ["simPre", "pre", 1], ["simThick", "thick", 1], ["simHx", "hx", 0.5], ["simHy", "hy", 0.5]] as [string, string, number][])
  $(id).addEventListener("change", e => { const v = Number(e.target.value); if (!(v >= 0)) return; SIM[key] = v*mul; if (key === "hx" || key === "hy") syncCutSlider(); markDirty(); });
$("simQual").addEventListener("change", e => { SIM.quality = e.target.value; markDirty(); });
$("simT").addEventListener("input", e => { SIM.tv = Number(e.target.value); $("simTnow").textContent = `${SIM.tv.toFixed(0)} min`; requestView(SIM.tv); });
$("bSimPlay").addEventListener("click", () => {
  SIM.playing = !SIM.playing; $("bSimPlay").textContent = SIM.playing ? "Pause" : "Play"; $("bSimPlay").setAttribute("aria-pressed", String(!!SIM.playing));
  if (SIM.playing && SIM.tv >= SIM.tSim - 1e-6) { SIM.tv = 0; }
});
function stepSimPlay(now) {
  if (!SIM.playing || !simLike() || SIM.viewBusy || SIM.running) return;
  if (now - (SIM.lastPlay || 0) < 60) return;
  SIM.lastPlay = now;
  SIM.tv = Math.min(SIM.tSim, SIM.tv + SIM.tSim/80);
  $("simT").value = String(SIM.tv); $("simTnow").textContent = `${SIM.tv.toFixed(0)} min`; requestView(SIM.tv);
  if (SIM.tv >= SIM.tSim - 1e-9) { SIM.playing = false; $("bSimPlay").textContent = "Play"; $("bSimPlay").setAttribute("aria-pressed", "false"); }
}
$("cSimMask").addEventListener("change", e => { SIM.showMask = e.target.checked; buildSim(false); });
$("simColor").addEventListener("change", e => { SIM.color = e.target.value; $("simPlaneLegend").classList.toggle("hidden", SIM.color !== "plane"); buildSim(false); });
$("cSimCut").addEventListener("change", e => { SIM.cutOn = e.target.checked; requestView(SIM.tv); });
$("segCut").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; SIM.cutAxis = b.dataset.a; SIM.cutPos = 0; pressed($("segCut"), "a", SIM.cutAxis); syncCutSlider(); drawMaskEditor(); requestView(SIM.tv); });
$("simCutPos").addEventListener("input", e => { SIM.cutPos = Number(e.target.value); syncCutSlider(); drawMaskEditor(); requestView(SIM.tv); });
// the same position typed in µm (clamped to the simulated area)
$("simCutNum").addEventListener("change", e => { setCutPos(Number(e.target.value)); e.target.value = String(SIM.cutPos); });
function setCutPos(v: number) {
  const h = SIM.cutAxis === "y" ? SIM.hy : SIM.hx; if (!isFinite(v)) return;
  SIM.cutPos = Math.max(-h, Math.min(h, v)); syncCutSlider(); drawMaskEditor(); requestView(SIM.tv);
}
$("shapeList").addEventListener("change", e => {
  const el = e.target, i = Number(el.dataset.i), k = el.dataset.k; if (!(i >= 0) || !k) return;
  if (el.value === "" && el.tagName === "SELECT") return;
  SIM.shapes[i][k] = k === "op" ? el.value : Number(el.value); $("simPreset").value = "-1"; markDirty();
});
$("shapeList").addEventListener("click", e => {
  const d = e.target.closest("[data-del]"); if (d) { SIM.shapes.splice(Number(d.dataset.del), 1); SIM.sel = -1; markDirty(); return; }
  const u = e.target.closest("[data-dup]"); if (u) { SIM.sel = Number(u.dataset.dup); $("bDupShape").click(); return; }
  const r = e.target.closest("tr[data-row]"); if (r && e.target.tagName !== "INPUT" && e.target.tagName !== "SELECT") { SIM.sel = Number(r.dataset.row); drawMaskEditor(); renderShapeList(); }
});
$("addType").innerHTML = Object.entries(SHAPE_TYPES).filter(([, v]) => !v.noAdd).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
$("bAddShape").addEventListener("click", () => {
  const type = $("addType").value, d = SHAPE_TYPES[type].d;
  SIM.shapes.push(Object.assign(shp(type, $("addOp").value, 0, 0, d.w, d.h == null ? d.w : d.h), d, { nx: 1, ny: 1, px: 0, py: 0 }, type === "para" ? paraSides(SFR[SIM.fk].e) : {}));
  SIM.sel = SIM.shapes.length - 1; $("simPreset").value = "-1"; markDirty();
});
$("bDupShape").addEventListener("click", () => {
  if (!(SIM.sel >= 0) || !SIM.shapes[SIM.sel]) return;
  const c = JSON.parse(JSON.stringify(SIM.shapes[SIM.sel])); c.cx += 20; c.cy -= 20; delete c.name;
  SIM.shapes.push(c); SIM.sel = SIM.shapes.length - 1; $("simPreset").value = "-1"; markDirty();
});
// drag shapes in the editor
(() => {
  const cv = $("maskCanvas"); let drag = null;
  const world = ev => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left - SIM.ed.ox)/SIM.ed.s, -(ev.clientY - r.top - SIM.ed.oy)/SIM.ed.s]; };
  cv.addEventListener("pointerdown", ev => {
    const [x, y] = world(ev);
    for (let i = SIM.shapes.length - 1; i >= 0; i--) if (EE.isOpen([Object.assign(engineShape(SIM.shapes[i]), { op: "open" })], x, y)) {
      let j = i; if (ev.altKey) { const c = JSON.parse(JSON.stringify(SIM.shapes[i])); delete c.name; SIM.shapes.push(c); j = SIM.shapes.length - 1; }   // Alt-drag: drag a copy
      SIM.sel = j; drag = { i: j, x0: x, y0: y, cx: SIM.shapes[j].cx, cy: SIM.shapes[j].cy, moved: j !== i }; cv.setPointerCapture(ev.pointerId); drawMaskEditor(); renderShapeList(); return;
    }
    SIM.sel = -1; drawMaskEditor(); renderShapeList();
  });
  cv.addEventListener("pointermove", ev => {
    if (!drag) return; const [x, y] = world(ev);
    const sh = SIM.shapes[drag.i]; sh.cx = snapV(drag.cx + x - drag.x0); sh.cy = snapV(drag.cy + y - drag.y0); drag.moved = true; drawMaskEditor();
  });
  cv.addEventListener("pointerup", () => { if (drag && drag.moved) { $("simPreset").value = "-1"; markDirty(); } drag = null; });
  cv.setAttribute("tabindex", "0");
  cv.addEventListener("dblclick", ev => {   // double-click an empty spot: add the chosen shape there
    const [x, y] = world(ev);
    if (SIM.shapes.some(sh => EE.isOpen([Object.assign(engineShape(sh), { op: "open" })], x, y))) return;
    const type = $("addType").value, d = SHAPE_TYPES[type].d;
    SIM.shapes.push(Object.assign(shp(type, $("addOp").value, snapV(x), snapV(y), d.w, d.h == null ? d.w : d.h), d, { nx: 1, ny: 1, px: 0, py: 0 }, type === "para" ? paraSides(SFR[SIM.fk].e) : {}));
    SIM.sel = SIM.shapes.length - 1; $("simPreset").value = "-1"; markDirty();
  });
  cv.addEventListener("keydown", ev => {   // arrow keys move the selected shape, Delete removes it
    const sh = SIM.shapes[SIM.sel]; if (!sh) return;
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === "d" || ev.key === "D")) { ev.preventDefault(); $("bDupShape").click(); return; }
    const st = (ev.shiftKey ? 5 : 1)*(Number(SET.snap) || 1), mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[ev.key];
    if (mv) { ev.preventDefault(); sh.cx += mv[0]; sh.cy += mv[1]; $("simPreset").value = "-1"; markDirty(); }
    else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); SIM.shapes.splice(SIM.sel, 1); SIM.sel = -1; markDirty(); }
  });
})();
