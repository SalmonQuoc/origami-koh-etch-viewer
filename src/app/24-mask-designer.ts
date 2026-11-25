// =====================================================================================================
// Mask designer: a full-screen vector editor for the two mask editors (Etched pit and Etch simulator), in the manner
// of CAD and illustration programs. It works on a copy of the editor's shape list and writes every finished edit
// back to it, so the 3D view, the tables and the presets stay in step; Ctrl+Z undoes it.
// Tools: select (V: move, scale, stretch, rotate), corners (A), rectangle (R), ellipse (E), polygon and freehand (P),
// catalogue shape (S), measure (M), pan (H). Snaps to the grid, to shape points and to the crystal directions of the
// wafer; points and sizes can be typed as in CAD (x,y  @dx,dy  @length<angle). Import and export: DXF and SVG.

var MD = null;   // designer state while it is open (var: the Escape handlers of earlier modules test it)
const MD_TGT = {
  sim: { name: "Etch simulator", ops: true, get: () => SIM.shapes, extra: () => ({ nx: 1, ny: 1, px: 0, py: 0 }),
    set: a => { SIM.shapes = a; SIM.sel = -1; $("simPreset").value = "-1"; markDirty(); },
    meta: a => { SIM.shapes = a; },   // only locks or names changed: the etch stays valid
    frame: () => SFR[SIM.fk].e, rot: () => SIM.rot || 0, domain: () => [SIM.hx, SIM.hy],
    label: () => `(${SFR[SIM.fk].wf}) wafer · x along ${plainIdx(simFrame().idx[0])} · primary flat below` },
  pit: { name: "Etched pit", ops: false, get: () => pitShapesNow(), extra: () => ({ pre: 0 }),
    set: a => { S.open = "custom"; S.pitShapes = a; S.pitSel = -1; pitChanged(false); },
    meta: a => { const was = S.open; S.open = "custom"; S.pitShapes = a; if (was !== "custom") pitChanged(false); },
    frame: () => C.FRAMES[S.wf], rot: () => S.rot || 0, domain: () => null,
    label: () => `(${S.wf}) wafer · x along ${plainIdx(C.FRAME_IDX[S.wf][0])} · primary flat below` },
};
// the corner lab etches the simulator's mask: the same target, with the two mesas and the domain locked by Build (module 10)
MD_TGT["corner"] = Object.assign({}, MD_TGT.sim, { name: "Corner lab", label: () => "(100) wafer · mesa edges along ⟨110⟩ · the mesas are locked; unlock them to change them" });
const MD_TOOLS = {
  select:  { key: "v", name: "Select", hint: "Click a shape to select it (Shift adds), drag to move (Alt-drag moves a copy). Drag on empty space: left to right selects shapes fully inside, right to left also those touched. Handles: stretch, scale, rotate (Shift: keep proportions or 15° steps; Alt: about the centre)." },
  node:    { key: "a", name: "Corners", hint: "Drag a corner of a drawn outline. Double-click an edge to add a corner; Delete removes the picked corner. Other shapes: press To outline first." },
  rect:    { key: "r", name: "Rectangle", hint: "Drag from corner to corner, or click twice (Shift: square, Alt: from the centre). Type @w,h for an exact size. Edges run along the ‘new shapes along’ direction." },
  ellipse: { key: "e", name: "Ellipse", hint: "Drag from the centre (Shift: circle). Type @w,h for an exact size or one number for a circle diameter." },
  pen:     { key: "p", name: "Polygon", hint: "Click to place corners or drag to draw freely. Finish with Enter, a double-click, a right-click or a click on the first corner; Backspace removes the last corner. Type x,y or @dx,dy or @length<angle." },
  shape:   { key: "s", name: "Catalogue", hint: "Click to place the shape chosen under ‘catalogue’ (L, U, cross, frame, ring, star, …) with its default size." },
  measure: { key: "m", name: "Measure", hint: "Drag to measure a distance; the angle is read against the flat and the nearest crystal direction." },
  hand:    { key: "h", name: "Pan", hint: "Drag to move the view. In any tool: middle button or Space + drag pans, the wheel zooms, F fits." },
};
const mdClone = o => JSON.parse(JSON.stringify(o));
const mdR = v => Math.round(v*1e4)/1e4;
const mdNormA = a => { const r = ((a % 360) + 540) % 360 - 180; return Math.round((r === -180 ? 180 : r)*1e4)/1e4; };
const mdRot = (p, a) => { const c = Math.cos(a/C.DEG), s = Math.sin(a/C.DEG); return [p[0]*c - p[1]*s, p[0]*s + p[1]*c]; };
const mdArr = sh => Math.max(1, Math.round(sh.nx || 1))*Math.max(1, Math.round(sh.ny || 1)) > 1;
const mdCol = c => "#" + COL[c].getHexString();
const mdLk = i => !!(MD && MD.shapes[i] && MD.shapes[i].lock);   // a locked shape cannot be picked on the drawing or changed
const mdA = (name: string) => `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;
function mdBBox(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const sh of list) for (const P of shapeLoops(sh)) for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return x0 <= x1 ? [x0, y0, x1, y1] : null;
}
function mdInPoly(P, x, y) {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0])*(y - a[1])/(b[1] - a[1]) + a[0]) c = !c; }
  return c;
}
function mdSegD(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx*dx + dy*dy, t = L > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0])*dx + (p[1] - a[1])*dy)/L)) : 0;
  return Math.hypot(p[0] - a[0] - t*dx, p[1] - a[1] - t*dy);
}
function mdHit(sh, w, tol) {
  if (shapePolys(sh).some(P => mdInPoly(P, w[0], w[1]))) return true;
  for (const P of shapeLoops(sh)) for (let i = 0; i < P.length; i++) if (mdSegD(w, P[i], P[(i + 1) % P.length]) < tol) return true;
  return false;
}
// ---- transforms of one shape (all lengths in µm)
function mdMove(sh, dx, dy) { sh.cx = mdR(sh.cx + dx); sh.cy = mdR(sh.cy + dy); }
function mdRotate(sh, th, P) {
  const c = mdRot([sh.cx - P[0], sh.cy - P[1]], th); sh.cx = mdR(P[0] + c[0]); sh.cy = mdR(P[1] + c[1]);
  if (sh.type === "para") { sh.a1 = mdNormA(sh.a1 + th); sh.a2 = mdNormA(sh.a2 + th); } else sh.ang = mdNormA((sh.ang || 0) + th);
}
function mdScale(sh, f, P) {
  sh.cx = mdR(P[0] + f*(sh.cx - P[0])); sh.cy = mdR(P[1] + f*(sh.cy - P[1]));
  for (const k of ["w", "h", "t", "px", "py"]) if (typeof sh[k] === "number") sh[k] = mdR(sh[k]*f);
  if (sh.pts) sh.pts = sh.pts.map(p => [mdR(p[0]*f), mdR(p[1]*f)]);
}
const MD_UNI = { circle: 1, tri: 1, poly: 1, ring: 1, star: 1 };            // only scaled as a whole
const MD_YSYM = { rect: 1, circle: 1, ellipse: 1, tri: 1, poly: 1, ushape: 1, cross: 1, frame: 1, ring: 1, star: 1 };   // mirror-symmetric about the local y axis
function mdLocalBox(sh) {
  const P = basePts(sh); let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return [x0, y0, x1, y1];
}
function mdStretch(sh, sx, sy, shift) {   // scale in the shape's own axes, then move its centre by shift (local axes)
  if (sh.type === "free" || sh.type === "pts") sh.pts = sh.pts.map(p => [mdR(p[0]*sx), mdR(p[1]*sy)]);
  else {
    sh.w = mdR(sh.w*sx); if (typeof sh.h === "number") sh.h = mdR(sh.h*(MD_UNI[sh.type] ? sx : sy));
    if (typeof sh.t === "number") sh.t = MD_UNI[sh.type] ? mdR(sh.t*sx) : Math.min(sh.t, mdR(0.95*Math.min(sh.w, sh.h || sh.w)));
  }
  if (sh.type === "free") { const b = mdLocalBox(sh); sh.w = mdR(b[2] - b[0]); sh.h = mdR(b[3] - b[1]); }
  const d = mdRot(shift, sh.ang || 0); sh.cx = mdR(sh.cx + d[0]); sh.cy = mdR(sh.cy + d[1]);
}
function mdToFree(sh) {   // the shape as an editable outline (null where it has a hole or is an array)
  if (sh.type === "free") return sh;
  if (sh.type === "frame" || sh.type === "ring" || mdArr(sh)) return null;
  const W = shapePolys(sh)[0], c = polyCentroid(W), cx = mdR(c[0]), cy = mdR(c[1]);
  const pts = W.map(p => [mdR(p[0] - cx), mdR(p[1] - cy)]);   // same corner order, so a corner index stays valid
  const o = mdClone(sh); for (const k of ["a1", "a2", "t", "n", "name"]) delete o[k];
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return Object.assign(o, { type: "free", cx, cy, ang: 0, k: 100, pts, w: mdR(Math.max(...xs) - Math.min(...xs)), h: mdR(Math.max(...ys) - Math.min(...ys)) });
}
function mdMirror(sh, axis, m) {   // axis "h": mirror left-right about x = m; "v": up-down about y = m
  let s = sh;
  if (s.type === "lshape" || s.type === "pts") s = mdToFree(s) || s;
  if (axis === "h") s.cx = mdR(2*m - s.cx); else s.cy = mdR(2*m - s.cy);
  if (s.type === "para") { s.a1 = mdNormA(axis === "h" ? 180 - s.a1 : -s.a1); s.a2 = mdNormA(axis === "h" ? 180 - s.a2 : -s.a2); return s; }
  if (s.type === "free") { s.ang = mdNormA(-(s.ang || 0)); s.pts = s.pts.map(p => axis === "h" ? [-p[0], p[1]] : [p[0], -p[1]]).reverse(); return s; }
  if (MD_YSYM[s.type]) s.ang = mdNormA(axis === "h" ? -(s.ang || 0) : 180 - (s.ang || 0));
  return s;
}
function mdExplode(sh) {   // an array as separate shapes
  if (!mdArr(sh)) return [sh];
  const nx = Math.max(1, Math.round(sh.nx || 1)), ny = Math.max(1, Math.round(sh.ny || 1)), out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = mdClone(sh); c.nx = 1; c.ny = 1; c.px = 0; c.py = 0; delete c.name;
    c.cx = mdR(sh.cx + (i - (nx - 1)/2)*(sh.px || 0)); c.cy = mdR(sh.cy + (j - (ny - 1)/2)*(sh.py || 0)); out.push(c);
  }
  return out;
}
function mdNew(type, x, y, o?: Record<string, any>) {   // a new shape for the open editor
  let sh;
  if (MD.tk === "pit") sh = newPitShape(type, x, y);
  else { const d = SHAPE_TYPES[type].d || {}; sh = Object.assign(shp(type, MD.op, x, y, d.w, d.h == null ? d.w : d.h), d, MD.t.extra(), type === "para" ? paraSides(SFR[SIM.fk].e) : {}); }
  sh.cx = mdR(x); sh.cy = mdR(y); if (type !== "para") sh.ang = MD.ax;
  Object.assign(sh, o || {}); sh.op = MD.tk === "pit" ? "open" : (o && o.op) || MD.op;
  return sh;
}
function mdFreeFrom(raw, op?: string, tolUm?: number) {   // a drawn outline from corner points (world µm); a string says why it failed
  const t1 = tolUm != null ? tolUm : 1.5/MD.v.s, t2 = tolUm != null ? tolUm : 4/MD.v.s; let P = [];
  for (const p of raw) if (!P.length || Math.hypot(p[0] - P[P.length - 1][0], p[1] - P[P.length - 1][1]) > t1) P.push(p);
  while (P.length > 3 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) <= t2) P.pop();
  if (P.length < 3 || Math.abs(polyArea(P)) < 1e-3) return "An outline needs at least three corners that enclose an area.";
  if (selfCrosses(P)) return "The outline crosses itself, so it has no clear inside. Draw it again without crossing.";
  if (polyArea(P) < 0) P.reverse();
  const c = polyCentroid(P), cx = mdR(c[0]), cy = mdR(c[1]), pts = P.map(p => [mdR(p[0] - cx), mdR(p[1] - cy)]);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return Object.assign(shp("free", MD.tk === "pit" ? "open" : (op || MD.op), cx, cy, mdR(Math.max(...xs) - Math.min(...xs)), mdR(Math.max(...ys) - Math.min(...ys)), 0, { pts, k: 100 }), MD.t.extra());
}
function mdCornerW(sh) { return shapePolys(sh)[0]; }   // corners of a single outline in world µm
function mdSetCorner(sh, i, w) {   // move corner i of a drawn outline to the world point w
  const k = (sh.k || 100)/100, l = mdRot([w[0] - sh.cx, w[1] - sh.cy], -(sh.ang || 0));
  sh.pts[i] = [mdR(l[0]/k), mdR(l[1]/k)];
}

// ---- opening and closing
function mdOpen(tk) {
  if (DRAW.on) drawStop();
  if (typeof enlOpen !== "undefined" && enlOpen) enlarge(enlOpen.el, false);
  const t = MD_TGT[tk];
  MD = { on: true, tk, t, shapes: mdClone(t.get()), sel: [], tool: "select", op: "open", ax: 0, type: "lshape",
    snap: { grid: true, obj: true, dir: true, ortho: false }, step: Number(SET.snap) || 1, v: { cx: 0, cy: 0, s: 1 }, W: 300, H: 200, dpr: 1,
    hist: [], fut: [], base: "", clip: null, cur: null, curS: null, sn: null, hover: -1, drag: null, pen: null, rc: null, meas: null, vsel: -1, space: false, raf: 0 };
  MD.base = JSON.stringify(MD.shapes);
  const rt = $("mdRoot"); rt.classList.remove("hidden"); document.body.classList.add("md-open");
  $("mdTitle").textContent = `Mask designer · ${t.name}`; $("mdSub").textContent = t.label();
  $("mdOpRow").classList.toggle("hidden", !t.ops);
  mdFillSelects(); mdSyncBar(); mdSetTool("select"); mdResize(); mdFit(); mdPanel();
  if (rt.requestFullscreen && !document.fullscreenElement) { const r = rt.requestFullscreen(); if (r && r.catch) r.catch(() => {}); }
  $("mdCanvas").focus();
}
function mdClose() {
  if (!MD) return;
  MD.on = false; if (MD.raf) cancelAnimationFrame(MD.raf);
  if (document.fullscreenElement === $("mdRoot")) document.exitFullscreen().catch(() => {});
  $("mdRoot").classList.add("hidden"); document.body.classList.remove("md-open");
  const tk = MD.tk; MD = null;
  if (tk !== "pit") { renderShapeList(); drawMaskEditor(); } else { renderCustomList(); drawPitEditor(); }
}
function mdFillSelects() {
  const dirs = inPlaneDirs(MD.t.frame()), rot = MD.t.rot();
  MD.dirs = [];
  for (const d of dirs) for (const k of [0, 180]) MD.dirs.push({ ang: d.ang + rot + k, label: `${plainIdx(d.v)} ⟨${d.fam}⟩${d.wall != null ? ` · {111} wall ${d.wall.toFixed(1)}°` : ""}` });
  $("mdAx").innerHTML = `<option value="0">the flat (0°)</option>` + dirs.map(d => `<option value="${mdR(d.ang + rot)}">${dirText(d)}</option>`).join("");
  $("mdAx").value = "0"; MD.ax = 0;
  $("mdType").innerHTML = Object.entries(SHAPE_TYPES).filter(([, v]) => !v.noAdd).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
  $("mdType").value = MD.type;
}
function mdSyncBar() {
  $("mdSnapGrid").checked = MD.snap.grid; $("mdSnapObj").checked = MD.snap.obj; $("mdSnapDir").checked = MD.snap.dir; $("mdSnapOrtho").checked = MD.snap.ortho;
  $("mdStep").value = MD.step; $("mdOp").value = MD.op;
}
function mdSetTool(t) {
  if (!MD_TOOLS[t]) return;
  MD.tool = t; MD.pen = null; MD.rc = null; MD.drag = null; if (t !== "measure") MD.meas = null; if (t !== "node") MD.vsel = -1;
  for (const b of document.querySelectorAll("#mdTools [data-tool]")) b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.tool === t));
  $("mdHint").textContent = MD_TOOLS[t].hint; $("mdCanvas").dataset.mode = t; mdRequest();
}
function mdMsg(txt) { $("mdMsg").textContent = txt || ""; }

// ---- view
function mdResize() {
  if (!MD) return;
  const box = $("mdCanvasBox"), cv = $("mdCanvas"), dpr = Math.min(2, window.devicePixelRatio || 1);
  MD.W = Math.max(100, box.clientWidth); MD.H = Math.max(100, box.clientHeight); MD.dpr = dpr;
  cv.width = Math.round(MD.W*dpr); cv.height = Math.round(MD.H*dpr); cv.style.width = `${MD.W}px`; cv.style.height = `${MD.H}px`;
  mdRequest();
}
function mdFit() {
  const d = MD.t.domain(); let b = mdBBox(MD.shapes);
  if (d) b = b ? [Math.min(b[0], -d[0]), Math.min(b[1], -d[1]), Math.max(b[2], d[0]), Math.max(b[3], d[1])] : [-d[0], -d[1], d[0], d[1]];
  if (!b) b = [-200, -150, 200, 150];
  const w = Math.max(20, b[2] - b[0]), h = Math.max(20, b[3] - b[1]);
  MD.v = { cx: (b[0] + b[2])/2, cy: (b[1] + b[3])/2, s: Math.min((MD.W - 60)/w, (MD.H - 60)/h) };
  mdRequest();
}
const mdToS = p => [MD.W/2 + (p[0] - MD.v.cx)*MD.v.s, MD.H/2 - (p[1] - MD.v.cy)*MD.v.s];
const mdToW = (x, y) => [MD.v.cx + (x - MD.W/2)/MD.v.s, MD.v.cy - (y - MD.H/2)/MD.v.s];
function mdZoom(f, sx, sy) {
  const w = mdToW(sx, sy), s = Math.max(0.005, Math.min(400, MD.v.s*f));
  MD.v.s = s; MD.v.cx = w[0] - (sx - MD.W/2)/s; MD.v.cy = w[1] + (sy - MD.H/2)/s; mdRequest();
}
function mdRequest() { if (MD && !MD.raf) MD.raf = requestAnimationFrame(() => { if (!MD) return; MD.raf = 0; if (MD.on) mdDraw(); }); }

// ---- snapping: shape points first, then a ray along a crystal direction or a 15° step, then the grid
function mdSnap(sx, sy, o?: Record<string, any>) {
  o = o || {};
  const w = mdToW(sx, sy); let best = null, bd = 10;
  const cand = (p, kind) => { const q = mdToS(p), d = Math.hypot(q[0] - sx, q[1] - sy); if (d < bd) { bd = d; best = { p: [mdR(p[0]), mdR(p[1])], kind }; } };
  if (MD.snap.obj && !o.noObj) {
    cand([0, 0], "origin");
    MD.shapes.forEach((sh, i) => {
      if (o.skip && o.skip.includes(i)) return;
      cand([sh.cx, sh.cy], "centre");
      for (const L of shapeLoops(sh)) {
        if (L.length > 160) continue;
        const few = L.length <= 24;
        for (let k = 0; k < L.length; k++) { cand(L[k], few ? "corner" : "point"); if (few) { const q = L[(k + 1) % L.length]; cand([(L[k][0] + q[0])/2, (L[k][1] + q[1])/2], "midpoint"); } }
      }
    });
    const d = MD.t.domain(); if (d) for (const p of [[-d[0], -d[1]], [d[0], -d[1]], [d[0], d[1]], [-d[0], d[1]], [0, -d[1]], [0, d[1]], [-d[0], 0], [d[0], 0]]) cand(p, "domain edge");
    if (o.extra) for (const p of o.extra) cand(p, "corner");
  }
  if (best) return best;
  const ref = o.ref;
  if (ref && (MD.snap.dir || MD.snap.ortho || o.shift)) {
    const dx = w[0] - ref[0], dy = w[1] - ref[1], L = Math.hypot(dx, dy);
    if (L*MD.v.s > 6) {
      const a = Math.atan2(dy, dx)*C.DEG; let hit = null, hd = Infinity;
      const dd = (b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
      if (MD.snap.ortho || o.shift) for (let b = -180; b < 180; b += 15) { const e = dd(b); if (e < hd && (o.shift || e < 4)) { hd = e; hit = { ang: b, label: `${mdNormA(b)}°` }; } }
      if (MD.snap.dir && !o.shift) for (const d of MD.dirs) { const e = dd(d.ang); if (e < 3 && e < hd) { hd = e; hit = d; } }
      if (hit) {
        const u = [Math.cos(hit.ang/C.DEG), Math.sin(hit.ang/C.DEG)], len0 = dx*u[0] + dy*u[1], st = MD.step;
        const len = MD.snap.grid ? Math.round(len0/st)*st : len0;
        return { p: [mdR(ref[0] + len*u[0]), mdR(ref[1] + len*u[1])], kind: "ray", ray: { from: ref, ang: hit.ang, label: hit.label } };
      }
    }
  }
  if (MD.snap.grid && !o.noGrid) {
    const st = MD.step, A = SET.gridType === "crystal" ? gridAngles(inPlaneDirs(MD.t.frame()), MD.t.rot()) : [0, 90];
    if (A.length >= 2 && !(Math.abs(A[0]) < 1e-9 && Math.abs(A[1] - 90) < 1e-9)) {   // crystal grid: the crossing of the two nearest lines of the first two families
      const n = A.slice(0, 2).map(a => [-Math.sin(a*Math.PI/180), Math.cos(a*Math.PI/180)]), k = n.map(v => Math.round((v[0]*w[0] + v[1]*w[1])/st)*st);
      const det = n[0][0]*n[1][1] - n[0][1]*n[1][0];
      if (Math.abs(det) > 1e-6) return { p: [mdR((k[0]*n[1][1] - n[0][1]*k[1])/det), mdR((n[0][0]*k[1] - k[0]*n[1][0])/det)], kind: "grid" };
    }
    return { p: [mdR(Math.round(w[0]/st)*st), mdR(Math.round(w[1]/st)*st)], kind: "grid" };
  }
  return { p: [mdR(w[0]), mdR(w[1])], kind: "" };
}

// ---- history: every finished edit is one step and is written back to the editor
const mdGeo = a => JSON.stringify(a.map(s => { const c = Object.assign({}, s); delete c.lock; delete c.name; return c; }));   // what changes the etch
function mdCommit(msg?: string) {
  const now = JSON.stringify(MD.shapes);
  if (now !== MD.base) {
    const meta = mdGeo(MD.shapes) === mdGeo(JSON.parse(MD.base)) && MD.t.meta;
    MD.hist.push(MD.base); if (MD.hist.length > 300) MD.hist.shift(); MD.fut = []; MD.base = now;
    if (meta) MD.t.meta(JSON.parse(now)); else MD.t.set(JSON.parse(now));
  }
  if (msg != null) mdMsg(msg);
  mdPanel(); mdRequest();
}
function mdRevert() { MD.shapes = JSON.parse(MD.base); MD.sel = MD.sel.filter(i => i < MD.shapes.length); mdRequest(); }
function mdUndo(redo?: boolean) {
  const from = redo ? MD.fut : MD.hist, to = redo ? MD.hist : MD.fut;
  if (!from.length) { mdMsg(redo ? "Nothing to redo." : "Nothing to undo."); return; }
  to.push(MD.base); MD.base = from.pop(); MD.shapes = JSON.parse(MD.base);
  MD.sel = MD.sel.filter(i => i < MD.shapes.length); MD.vsel = -1; MD.t.set(JSON.parse(MD.base));
  mdMsg(redo ? "Redone." : "Undone."); mdPanel(); mdRequest();
}

// ---- selection frame and its handles
function mdFrame() {   // single shape: its own axes (stretch); several or an array: the box around them (scale)
  if (!MD.sel.length || MD.sel.some(mdLk)) return null;
  if (MD.sel.length === 1) {
    const sh = MD.shapes[MD.sel[0]];
    if (sh && sh.type !== "para" && !mdArr(sh)) return { kind: "local", o: [sh.cx, sh.cy], a: sh.ang || 0, b: mdLocalBox(sh), uni: !!MD_UNI[sh.type] };
  }
  const b = mdBBox(MD.sel.map(i => MD.shapes[i]).filter(Boolean)); if (!b) return null;
  return { kind: "box", o: [0, 0], a: 0, b, uni: true };
}
const mdFw = (F, p) => { const r = mdRot(p, F.a); return [F.o[0] + r[0], F.o[1] + r[1]]; };   // frame -> world
const mdFl = (F, w) => mdRot([w[0] - F.o[0], w[1] - F.o[1]], -F.a);                         // world -> frame
function mdHandles(F) {
  const [x0, y0, x1, y1] = F.b, out = [];
  for (const hx of [-1, 0, 1]) for (const hy of [-1, 0, 1]) {
    if (!hx && !hy) continue;
    if (F.kind === "box" && (!hx || !hy)) continue;   // a group scales from its corners only
    out.push({ hx, hy, w: mdFw(F, [hx < 0 ? x0 : hx > 0 ? x1 : (x0 + x1)/2, hy < 0 ? y0 : hy > 0 ? y1 : (y0 + y1)/2]) });
  }
  const top = mdFw(F, [(x0 + x1)/2, y1]), up = mdRot([0, 1], F.a);
  out.push({ rot: true, w: [top[0] + up[0]*26/MD.v.s, top[1] + up[1]*26/MD.v.s], base: top });
  return out;
}
function mdHandleAt(sx, sy) {
  const F = mdFrame(); if (!F || MD.tool !== "select") return null;
  for (const h of mdHandles(F)) { const q = mdToS(h.w); if (Math.abs(q[0] - sx) <= 6 && Math.abs(q[1] - sy) <= 6) return { h, F }; }
  return null;
}
function mdPick(sx, sy) {
  const w = mdToW(sx, sy), tol = 5/MD.v.s;
  for (const i of MD.sel.slice().reverse()) if (MD.shapes[i] && !mdLk(i) && mdHit(MD.shapes[i], w, tol)) return i;   // a selected shape stays on top for picking
  for (let i = MD.shapes.length - 1; i >= 0; i--) if (!mdLk(i) && mdHit(MD.shapes[i], w, tol)) return i;
  return -1;
}

// ---- drawing the canvas
function mdGridStep() { let g = MD.step; while (g*MD.v.s < 7) g = niceStep(g*2.01); return g; }
function mdDraw() {
  const cv = $("mdCanvas"), ctx = cv.getContext("2d"), W = MD.W, H = MD.H, dpr = MD.dpr, s = MD.v.s;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const ink = mdCol("s-ink"), acc = mdCol("accent"), bg = mdCol("scene-bg");
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const [X0, Y1] = mdToW(0, 0), [X1, Y0] = mdToW(W, H), dom = MD.t.domain();
  // mask with the openings: the shapes are painted in order, "open" removes the mask and "mask" puts it back
  if (!MD.off) MD.off = document.createElement("canvas");
  const off = MD.off; if (off.width !== cv.width || off.height !== cv.height) { off.width = cv.width; off.height = cv.height; }
  const o = off.getContext("2d"); o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, off.width, off.height);
  o.setTransform(dpr*s, 0, 0, -dpr*s, dpr*(W/2 - MD.v.cx*s), dpr*(H/2 + MD.v.cy*s));
  o.fillStyle = mdCol("mask"); o.globalAlpha = 0.5;
  if (dom) o.fillRect(-dom[0], -dom[1], 2*dom[0], 2*dom[1]); else o.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
  for (const sh of MD.shapes) {
    o.beginPath(); for (const P of shapePolys(sh)) { P.forEach((p, i) => i ? o.lineTo(p[0], p[1]) : o.moveTo(p[0], p[1])); o.closePath(); }
    o.globalCompositeOperation = "destination-out"; o.globalAlpha = 1; o.fill();
    if (sh.op === "mask") { o.globalCompositeOperation = "source-over"; o.globalAlpha = 0.5; o.fill(); }
  }
  o.globalCompositeOperation = "source-over"; o.globalAlpha = 1;
  // grid (minor and every fifth line), under the mask colour
  const g = mdGridStep(), G = g*5;
  edGridDraw(ctx, { toC: mdToS, X0, X1, Y0, Y1, g, px: MD.v.s, ink, angs: gridAngles(inPlaneDirs(MD.t.frame()), MD.t.rot()) });
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(off, 0, 0); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // axes through the origin, domain and flat
  const O = mdToS([0, 0]); ctx.globalAlpha = 0.45; ctx.beginPath(); ctx.moveTo(O[0], 0); ctx.lineTo(O[0], H); ctx.moveTo(0, O[1]); ctx.lineTo(W, O[1]); ctx.stroke(); ctx.globalAlpha = 1;
  ctx.font = "11px IBM Plex Sans, sans-serif"; ctx.fillStyle = ink;
  if (dom) {
    const a = mdToS([-dom[0], dom[1]]), b = mdToS([dom[0], -dom[1]]);
    ctx.setLineDash([6, 4]); ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.setLineDash([]);
    ctx.fillText(`simulated domain ${fmtLen(2*dom[0])} × ${fmtLen(2*dom[1])}`, a[0] + 4, a[1] - 5);
    ctx.fillStyle = acc; ctx.fillRect(a[0], b[1] + 3, b[0] - a[0], 3); ctx.fillStyle = ink;
  }
  // outlines
  const path = P => { P.forEach((p, k) => { const q = mdToS(p); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.closePath(); };
  MD.shapes.forEach((sh, i) => {
    const on = MD.sel.includes(i), hv = i === MD.hover && !on;
    ctx.beginPath(); for (const P of shapeLoops(sh)) path(P);
    ctx.setLineDash(sh.op === "mask" ? [5, 3] : []); ctx.lineWidth = on ? 2.2 : hv ? 1.8 : 1.1;
    ctx.strokeStyle = on || hv ? acc : ink; ctx.globalAlpha = hv ? 0.7 : sh.lock && !on ? 0.5 : 1; ctx.stroke(); ctx.globalAlpha = 1;
    if (sh.lock) { const bb = mdBBox([sh]); if (bb) { const q = mdToS([bb[0], bb[3]]); ctx.font = "11px system-ui, sans-serif"; ctx.fillStyle = on ? acc : ink; ctx.fillText("🔒", q[0] + 2, q[1] + 13); } }
  });
  ctx.setLineDash([]);
  // selection: frame, handles, centre; corners in the corner tool
  const F = MD.tool === "select" && !MD.drag ? mdFrame() : MD.tool === "select" && MD.drag && MD.drag.kind === "handle" ? mdFrame() : null;
  if (F) {
    const [x0, y0, x1, y1] = F.b, Q = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(p => mdToS(mdFw(F, p)));
    ctx.strokeStyle = acc; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.beginPath(); Q.forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); ctx.stroke(); ctx.setLineDash([]);
    for (const h of mdHandles(F)) {
      const q = mdToS(h.w);
      if (h.rot) { const b = mdToS(h.base); ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); ctx.beginPath(); ctx.arc(q[0], q[1], 5, 0, 2*Math.PI); ctx.fillStyle = bg; ctx.fill(); ctx.stroke(); }
      else { ctx.fillStyle = bg; ctx.fillRect(q[0] - 4, q[1] - 4, 8, 8); ctx.strokeRect(q[0] - 4, q[1] - 4, 8, 8); }
    }
    if (MD.sel.length === 1) { const sh = MD.shapes[MD.sel[0]], c = mdToS([sh.cx, sh.cy]); ctx.beginPath(); ctx.moveTo(c[0] - 5, c[1]); ctx.lineTo(c[0] + 5, c[1]); ctx.moveTo(c[0], c[1] - 5); ctx.lineTo(c[0], c[1] + 5); ctx.stroke(); }
  }
  if (MD.tool === "node") for (const i of MD.sel) {
    const sh = MD.shapes[i]; if (!sh || (sh.type !== "free" && sh.type !== "pts") || mdArr(sh)) continue;
    mdCornerW(sh).forEach((p, k) => { const q = mdToS(p); ctx.fillStyle = k === MD.vsel ? acc : bg; ctx.strokeStyle = acc; ctx.fillRect(q[0] - 4, q[1] - 4, 8, 8); ctx.strokeRect(q[0] - 4, q[1] - 4, 8, 8); });
  }
  // what the current tool is drawing
  ctx.strokeStyle = acc; ctx.fillStyle = acc; ctx.lineWidth = 1.6;
  const d = MD.drag;
  if (d && d.kind === "box") {
    const a = d.s0, b = MD.curS, cross = b[0] < a[0];
    ctx.setLineDash(cross ? [5, 4] : []); ctx.globalAlpha = 0.12; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.globalAlpha = 1;
    ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); ctx.setLineDash([]);
  }
  const pr = mdPreview();
  if (pr) { ctx.beginPath(); for (const P of pr.loops) path(P); ctx.globalAlpha = 0.15; ctx.fill(); ctx.globalAlpha = 1; ctx.stroke(); }
  if (MD.pen) {
    const P = MD.pen.stroke || MD.pen.pts, cur = !MD.pen.stroke && MD.sn ? MD.sn.p : null;
    if (P.length) {
      ctx.beginPath(); P.concat(cur ? [cur] : []).forEach((p, k) => { const q = mdToS(p); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.stroke();
      if (P.length >= 2) { ctx.setLineDash([4, 4]); ctx.globalAlpha = 0.6; const a = mdToS(cur || P[P.length - 1]), b = mdToS(P[0]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
      if (!MD.pen.stroke) P.forEach((p, k) => { const q = mdToS(p); ctx.beginPath(); ctx.arc(q[0], q[1], k ? 3 : 5, 0, 2*Math.PI); k ? ctx.fill() : ctx.stroke(); });
    }
  }
  if (MD.meas && MD.meas.b) {
    const a = mdToS(MD.meas.a), b = mdToS(MD.meas.b), m = mdMeasText(MD.meas.a, MD.meas.b);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    for (const q of [a, b]) { ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, 2*Math.PI); ctx.fill(); }
    ctx.font = "12px IBM Plex Mono, monospace"; const tw = ctx.measureText(m).width, tx = Math.min(W - tw - 8, (a[0] + b[0])/2 + 8), ty = (a[1] + b[1])/2 - 8;
    ctx.fillStyle = bg; ctx.globalAlpha = 0.85; ctx.fillRect(tx - 3, ty - 12, tw + 6, 16); ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.fillText(m, tx, ty);
  }
  // snap marker and alignment ray
  const sn = MD.sn;
  if (sn && MD.curS && MD.tool !== "hand") {
    const q = mdToS(sn.p); ctx.strokeStyle = acc; ctx.lineWidth = 1.4;
    if (sn.ray) {
      const a = mdToS(sn.ray.from), u = [Math.cos(sn.ray.ang/C.DEG), -Math.sin(sn.ray.ang/C.DEG)];
      ctx.setLineDash([2, 4]); ctx.globalAlpha = 0.8; ctx.beginPath(); ctx.moveTo(a[0] - u[0]*4000, a[1] - u[1]*4000); ctx.lineTo(a[0] + u[0]*4000, a[1] + u[1]*4000); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    if (sn.kind === "corner" || sn.kind === "point" || sn.kind === "domain edge") ctx.strokeRect(q[0] - 5, q[1] - 5, 10, 10);
    else if (sn.kind === "centre" || sn.kind === "origin") { ctx.beginPath(); ctx.arc(q[0], q[1], 6, 0, 2*Math.PI); ctx.stroke(); }
    else if (sn.kind === "midpoint") { ctx.beginPath(); ctx.moveTo(q[0], q[1] - 6); ctx.lineTo(q[0] + 6, q[1] + 5); ctx.lineTo(q[0] - 6, q[1] + 5); ctx.closePath(); ctx.stroke(); }
    if (MD.tool !== "select" || MD.drag) { ctx.beginPath(); ctx.moveTo(q[0] - 8, q[1]); ctx.lineTo(q[0] + 8, q[1]); ctx.moveTo(q[0], q[1] - 8); ctx.lineTo(q[0], q[1] + 8); ctx.lineWidth = 1; ctx.stroke(); }
    const lab = sn.ray ? sn.ray.label : sn.kind && sn.kind !== "grid" ? sn.kind : "";
    if (lab) { ctx.font = "11px IBM Plex Sans, sans-serif"; ctx.fillStyle = acc; ctx.fillText(lab, q[0] + 10, q[1] - 10); }
  }
  // compass of the crystal directions and a scale bar
  drawCompass(ctx, W - 72, 66, 40, inPlaneDirs(MD.t.frame()), MD.t.rot());
  const L = niceStep(110/s), lp = L*s; ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(16, H - 16); ctx.lineTo(16 + lp, H - 16); ctx.moveTo(16, H - 21); ctx.lineTo(16, H - 11); ctx.moveTo(16 + lp, H - 21); ctx.lineTo(16 + lp, H - 11); ctx.stroke();
  ctx.font = "11px IBM Plex Mono, monospace"; ctx.fillText(fmtLen(L), 16, H - 25);
  ctx.fillText(SET.gridType === "off" ? `grid hidden (snap step ${fmtLen(MD.step)})` : `grid ${fmtLen(g)} (bold ${fmtLen(G)})${SET.gridType === "crystal" ? " along the {111} traces" : ""}`, 16 + lp + 14, H - 12);
}
function mdMeasText(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), ang = Math.atan2(dy, dx)*C.DEG;
  let near = null, nd = Infinity;
  for (const d of MD.dirs) { const e = Math.abs(((ang - d.ang) % 360 + 540) % 360 - 180); if (e < nd) { nd = e; near = d; } }
  return `${fmtLen(L)} · Δx ${fmtLen(dx)} · Δy ${fmtLen(dy)} · ${ang.toFixed(2)}° from the flat${near ? ` · ${nd.toFixed(2)}° off ${near.label.split(" · ")[0]}` : ""}`;
}
function mdRectFrom(a, b, alt, shift, circ?: boolean) {   // rectangle or ellipse in the drawing axes: centre (world) and size
  const la = mdRot(a, -MD.ax), lb = mdRot(b, -MD.ax);
  let w = Math.abs(lb[0] - la[0]), h = Math.abs(lb[1] - la[1]);
  if (shift) w = h = Math.max(w, h);
  let c;
  if (circ || alt) { c = a; w *= 2; h *= 2; }
  else { const sx = Math.sign(lb[0] - la[0]) || 1, sy = Math.sign(lb[1] - la[1]) || 1; c = mdRot([la[0] + sx*w/2, la[1] + sy*h/2], MD.ax); }
  return { c: [mdR(c[0]), mdR(c[1])], w: mdR(w), h: mdR(h) };
}
function mdPreview() {   // shape the rectangle, ellipse or catalogue tool would add now
  const sn = MD.sn; if (!sn || !MD.curS) return null;
  if ((MD.tool === "rect" || MD.tool === "ellipse") && MD.rc) {
    const r = mdRectFrom(MD.rc.a, sn.p, MD.rc.alt, MD.rc.shift, MD.tool === "ellipse");
    if (r.w <= 0 || r.h <= 0) return null;
    const sh = MD.tool === "rect" ? shp("rect", "open", r.c[0], r.c[1], r.w, r.h, MD.ax) : shp(r.w === r.h ? "circle" : "ellipse", "open", r.c[0], r.c[1], r.w, r.h, MD.ax);
    return { loops: shapeLoops(sh), sh };
  }
  if (MD.tool === "shape" && !MD.drag) return { loops: shapeLoops(mdNew(MD.type, sn.p[0], sn.p[1])) };
  return null;
}

// ---- pointer input
function mdPtr(ev) { const r = $("mdCanvas").getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; }
function mdDown(ev) {
  if (!MD) return;
  const cv = $("mdCanvas"), [sx, sy] = mdPtr(ev); cv.focus(); MD.curS = [sx, sy];
  if (ev.button === 1 || ev.button === 0 && (MD.space || MD.tool === "hand")) { MD.drag = { kind: "pan", s0: [sx, sy], v0: Object.assign({}, MD.v) }; cv.setPointerCapture(ev.pointerId); ev.preventDefault(); return; }
  if (ev.button === 2) { ev.preventDefault(); if (MD.pen && MD.pen.pts.length >= 3) mdPenFinish(MD.pen.pts); return; }
  if (ev.button !== 0) return;
  cv.setPointerCapture(ev.pointerId);
  const t = MD.tool;
  if (t === "select") {
    const hh = mdHandleAt(sx, sy);
    if (hh) { MD.drag = { kind: "handle", h: hh.h, F: hh.F, orig: MD.sel.map(i => mdClone(MD.shapes[i])), w0: mdToW(sx, sy) }; return; }
    const i = mdPick(sx, sy);
    if (i < 0) { if (!ev.shiftKey) MD.sel = []; MD.drag = { kind: "box", s0: [sx, sy], add: ev.shiftKey }; mdPanel(); mdRequest(); return; }
    if (ev.shiftKey) { MD.sel = MD.sel.includes(i) ? MD.sel.filter(j => j !== i) : MD.sel.concat([i]); mdPanel(); mdRequest(); return; }
    if (!MD.sel.includes(i)) MD.sel = [i];
    MD.sel = MD.sel.filter(j => !mdLk(j));
    if (ev.altKey) { const c = MD.sel.map(j => { const x = mdClone(MD.shapes[j]); delete x.name; delete x.lock; return x; }); const n = MD.shapes.length; MD.shapes.push(...c); MD.sel = c.map((_, k) => n + k); }
    const b = mdSnap(sx, sy, { skip: MD.sel });
    MD.drag = { kind: "move", b: b.p, orig: MD.sel.map(j => mdClone(MD.shapes[j])), moved: ev.altKey };
    mdPanel(); mdRequest(); return;
  }
  if (t === "node") {
    for (const i of MD.sel) {
      const sh = MD.shapes[i]; if (!sh || sh.lock || (sh.type !== "free" && sh.type !== "pts") || mdArr(sh)) continue;
      const k = mdCornerW(sh).findIndex(p => { const q = mdToS(p); return Math.abs(q[0] - sx) <= 6 && Math.abs(q[1] - sy) <= 6; });
      if (k >= 0) {
        if (sh.type === "pts") { const f = mdToFree(sh); MD.shapes[i] = f; }
        MD.vsel = k; MD.drag = { kind: "corner", i, k }; mdRequest(); return;
      }
    }
    const i = mdPick(sx, sy); MD.sel = i >= 0 ? [i] : []; MD.vsel = -1;
    if (i >= 0) { const sh = MD.shapes[i]; mdMsg(sh.type === "free" || sh.type === "pts" ? (mdArr(sh) ? "This outline is an array: press Explode array first to edit the corners of one copy." : "") : `The corners of ${mdA(SHAPE_TYPES[sh.type].name)} follow from its sizes. Press To outline (key O) to edit them one by one.`); }
    mdPanel(); mdRequest(); return;
  }
  if (t === "pen") { MD.pen = MD.pen || { pts: [], stroke: null }; MD.pen.down = { s: [sx, sy], w: mdToW(sx, sy) }; MD.pen.stroke = null; return; }
  if (t === "rect" || t === "ellipse") {
    const p = mdSnap(sx, sy, MD.rc ? { ref: MD.rc.a, shift: ev.shiftKey } : {}).p;
    if (!MD.rc) { MD.rc = { a: p, s0: [sx, sy], alt: ev.altKey, shift: ev.shiftKey, down: true }; return; }
    mdRectFinish(p, ev); return;
  }
  if (t === "shape") { const p = mdSnap(sx, sy).p; MD.shapes.push(mdNew(MD.type, p[0], p[1])); MD.sel = [MD.shapes.length - 1]; mdCommit(`Added ${mdA(SHAPE_TYPES[MD.type].name)} at (${p[0]}, ${p[1]}) µm.`); return; }
  if (t === "measure") { const p = mdSnap(sx, sy).p; MD.meas = { a: p, b: p }; MD.drag = { kind: "measure" }; mdRequest(); }
}
function mdMoveEv(ev) {
  if (!MD) return;
  const [sx, sy] = mdPtr(ev); MD.curS = [sx, sy]; const d = MD.drag, w = mdToW(sx, sy);
  if (d && d.kind === "pan") { MD.v.cx = d.v0.cx - (sx - d.s0[0])/MD.v.s; MD.v.cy = d.v0.cy + (sy - d.s0[1])/MD.v.s; mdRequest(); return; }
  if (d && d.kind === "move") {
    const p = mdSnap(sx, sy, { skip: MD.sel, ref: d.b, shift: ev.shiftKey }); MD.sn = p;
    const dx = p.p[0] - d.b[0], dy = p.p[1] - d.b[1]; d.moved = d.moved || Math.abs(dx) + Math.abs(dy) > 0;
    MD.sel.forEach((j, k) => { const c = mdClone(d.orig[k]); mdMove(c, dx, dy); MD.shapes[j] = c; });
    mdPos(w, `moving by Δx ${fmtLen(dx)}, Δy ${fmtLen(dy)}`); mdRequest(); return;
  }
  if (d && d.kind === "handle") { mdHandleDrag(d, sx, sy, ev); return; }
  if (d && d.kind === "corner") {
    const sh = MD.shapes[d.i], W0 = mdCornerW(sh), others = W0.filter((_, k) => k !== d.k);
    const p = mdSnap(sx, sy, { skip: [d.i], extra: others, ref: W0[(d.k + W0.length - 1) % W0.length], shift: ev.shiftKey }); MD.sn = p;
    mdSetCorner(sh, d.k, p.p); d.moved = true; mdPos(p.p, `corner ${d.k + 1}`); mdRequest(); return;
  }
  if (d && d.kind === "box") { mdRequest(); return; }
  if (d && d.kind === "measure") { const p = mdSnap(sx, sy, { ref: MD.meas.a, shift: ev.shiftKey }); MD.sn = p; MD.meas.b = p.p; mdPos(p.p, mdMeasText(MD.meas.a, p.p)); mdRequest(); return; }
  if (MD.pen && MD.pen.down && (ev.buttons & 1)) {   // freehand stroke
    if (!MD.pen.stroke && Math.hypot(sx - MD.pen.down.s[0], sy - MD.pen.down.s[1]) > 6) MD.pen.stroke = [MD.pen.down.w];
    if (MD.pen.stroke) { const l = MD.pen.stroke[MD.pen.stroke.length - 1]; if (Math.hypot(w[0] - l[0], w[1] - l[1])*MD.v.s > 2.5) MD.pen.stroke.push(w); }
    mdRequest(); return;
  }
  // hover: snap preview and shape under the pointer
  const ref = MD.pen && MD.pen.pts.length ? MD.pen.pts[MD.pen.pts.length - 1] : MD.rc ? MD.rc.a : null;
  MD.sn = MD.tool === "hand" ? null : mdSnap(sx, sy, { ref, shift: ev.shiftKey, extra: MD.pen ? MD.pen.pts : null });
  if (MD.rc) { MD.rc.shift = ev.shiftKey; MD.rc.alt = MD.rc.alt || ev.altKey; }
  const hv = MD.tool === "select" || MD.tool === "node" ? mdPick(sx, sy) : -1;
  MD.hover = hv;
  const hh = mdHandleAt(sx, sy), cv = $("mdCanvas");
  cv.style.cursor = MD.space || MD.tool === "hand" ? "grab" : hh ? (hh.h.rot ? "alias" : "nwse-resize") : MD.tool === "select" && hv >= 0 ? "move" : MD.tool === "select" ? "default" : "crosshair";
  const pr = MD.rc && MD.sn ? mdRectFrom(MD.rc.a, MD.sn.p, MD.rc.alt, MD.rc.shift, MD.tool === "ellipse") : null;
  mdPos(MD.sn ? MD.sn.p : w, pr ? `w ${fmtLen(pr.w)} × h ${fmtLen(pr.h)}` : MD.pen && MD.pen.pts.length && MD.sn ? mdMeasText(MD.pen.pts[MD.pen.pts.length - 1], MD.sn.p) : hv >= 0 ? `${hv + 1}. ${SHAPE_TYPES[MD.shapes[hv].type].name}` : "");
  mdRequest();
}
function mdUp(ev) {
  if (!MD) return;
  const [sx, sy] = mdPtr(ev), d = MD.drag; MD.drag = null;
  if (d && d.kind === "pan") { mdRequest(); return; }
  if (d && d.kind === "move") { if (d.moved) mdCommit(`Moved ${MD.sel.length} shape${MD.sel.length === 1 ? "" : "s"}.`); else mdRequest(); return; }
  if (d && d.kind === "handle") { mdCommit(d.msg || ""); return; }
  if (d && d.kind === "corner") {
    const sh = MD.shapes[d.i];
    if (selfCrosses(mdCornerW(sh))) { mdRevert(); mdMsg("That would make the outline cross itself; the corner went back."); return; }
    if (sh.type === "free") { const b = mdLocalBox(sh); sh.w = mdR(b[2] - b[0]); sh.h = mdR(b[3] - b[1]); }
    mdCommit(d.moved ? `Moved corner ${d.k + 1}.` : ""); return;
  }
  if (d && d.kind === "box") {
    const a = mdToW(d.s0[0], d.s0[1]), b = mdToW(sx, sy), cross = sx < d.s0[0];
    const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
    if (Math.abs(sx - d.s0[0]) + Math.abs(sy - d.s0[1]) > 3) {
      const got = [];
      MD.shapes.forEach((sh, i) => { const bb = mdBBox([sh]); if (!bb || sh.lock) return;
        const inside = bb[0] >= x0 && bb[2] <= x1 && bb[1] >= y0 && bb[3] <= y1, touch = bb[0] <= x1 && bb[2] >= x0 && bb[1] <= y1 && bb[3] >= y0;
        if (cross ? touch : inside) got.push(i); });
      MD.sel = d.add ? [...new Set(MD.sel.concat(got))] : got;
    }
    mdPanel(); mdRequest(); return;
  }
  if (d && d.kind === "measure") { mdRequest(); return; }
  if (MD.tool === "pen" && MD.pen && MD.pen.down) {
    const pen = MD.pen; pen.down = null;
    if (pen.stroke) {   // freehand: simplify to 1.2 px and close
      let P = simplifyRDP(pen.stroke.concat([mdToW(sx, sy)]), 1.2/MD.v.s);
      for (let tol = 2.4; P.length > 120; tol *= 1.5) P = simplifyRDP(P, tol/MD.v.s);
      pen.stroke = null; mdPenFinish(P.map(p => [mdR(Math.round(p[0]*2)/2), mdR(Math.round(p[1]*2)/2)])); return;
    }
    const ref = pen.pts.length ? pen.pts[pen.pts.length - 1] : null, p = mdSnap(sx, sy, { ref, shift: ev.shiftKey, extra: pen.pts }).p;
    mdPenAdd(p); return;
  }
  if ((MD.tool === "rect" || MD.tool === "ellipse") && MD.rc && MD.rc.down) {
    MD.rc.down = false;
    if (Math.hypot(sx - MD.rc.s0[0], sy - MD.rc.s0[1]) > 4) mdRectFinish(mdSnap(sx, sy, { ref: MD.rc.a, shift: ev.shiftKey }).p, ev);
  }
}
function mdHandleDrag(d, sx, sy, ev) {
  const F = d.F, wRaw = mdToW(sx, sy), wS = mdSnap(sx, sy, { skip: MD.sel, noObj: !!d.h.rot }).p;
  if (d.h.rot) {   // rotate about the centre of the frame
    const [x0, y0, x1, y1] = F.b, P = mdFw(F, [(x0 + x1)/2, (y0 + y1)/2]);
    let th = (Math.atan2(wRaw[1] - P[1], wRaw[0] - P[0]) - Math.atan2(d.w0[1] - P[1], d.w0[0] - P[0]))*C.DEG;
    const a0 = MD.sel.length === 1 ? (d.orig[0].type === "para" ? d.orig[0].a1 : d.orig[0].ang || 0) : 0;
    let lab = "";
    if (ev.shiftKey) th = Math.round(th/15)*15;
    else if (MD.snap.dir) for (const q of MD.dirs) { for (const k of [0, 90, -90]) { const e = ((a0 + th - q.ang - k) % 180 + 270) % 180 - 90; if (Math.abs(e) < 2) { th -= e; lab = ` (edges along ${q.label.split(" · ")[0]}${k ? " and across it" : ""})`; break; } } if (lab) break; }
    MD.sel.forEach((j, k) => { const c = mdClone(d.orig[k]); mdRotate(c, th, P); MD.shapes[j] = c; });
    d.msg = `Turned by ${mdR(th)}°${lab}.`; mdPos(wRaw, `turn ${th.toFixed(2)}°${lab}`); mdRequest(); return;
  }
  const [x0, y0, x1, y1] = F.b, m = mdFl(F, wS), cx = (x0 + x1)/2, cy = (y0 + y1)/2, alt = ev.altKey;
  if (F.kind === "box") {   // scale the group from the opposite corner (Alt: from the centre)
    const A = alt ? [cx, cy] : [d.h.hx > 0 ? x0 : x1, d.h.hy > 0 ? y0 : y1], Cn = [d.h.hx > 0 ? x1 : x0, d.h.hy > 0 ? y1 : y0];
    const D = [Cn[0] - A[0], Cn[1] - A[1]], f = Math.max(0.02, ((m[0] - A[0])*D[0] + (m[1] - A[1])*D[1])/(D[0]*D[0] + D[1]*D[1] || 1));
    MD.sel.forEach((j, k) => { const c = mdClone(d.orig[k]); mdScale(c, f, A); MD.shapes[j] = c; });
    d.msg = `Scaled by ${(100*f).toFixed(1)} %.`; mdPos(wS, `scale ${(100*f).toFixed(1)} %`); mdRequest(); return;
  }
  const fx = d.h.hx > 0 ? x0 : x1, mx = d.h.hx > 0 ? x1 : x0, fy = d.h.hy > 0 ? y0 : y1, my = d.h.hy > 0 ? y1 : y0;
  const ratio = (v, f0, m0) => Math.abs(m0 - f0) < 1e-9 ? 1 : Math.max(0.02, (v - f0)/(m0 - f0));
  let sxf = d.h.hx ? ratio(m[0], alt ? cx : fx, mx) : 1, syf = d.h.hy ? ratio(m[1], alt ? cy : fy, my) : 1;
  if (F.uni) { const f = d.h.hx && d.h.hy ? Math.max(sxf, syf) : d.h.hx ? sxf : syf; sxf = syf = f; }
  else if (ev.shiftKey && d.h.hx && d.h.hy) sxf = syf = Math.max(sxf, syf);
  const ax = alt || !d.h.hx ? cx : fx, ay = alt || !d.h.hy ? cy : fy;
  const c = mdClone(d.orig[0]); mdStretch(c, sxf, syf, [ax*(1 - sxf), ay*(1 - syf)]); MD.shapes[MD.sel[0]] = c;
  const b = mdLocalBox(c); d.msg = `Size now ${fmtLen(b[2] - b[0])} × ${fmtLen(b[3] - b[1])}.`;
  mdPos(wS, `${fmtLen(b[2] - b[0])} × ${fmtLen(b[3] - b[1])}`); mdRequest();
}
function mdPos(p, extra) { $("mdPos").textContent = `x ${coordFmt(p[0], 0.01)}  y ${coordFmt(p[1], 0.01)} µm${MD.sn && MD.sn.kind && MD.sn.kind !== "grid" ? ` · ${MD.sn.ray ? "along " + MD.sn.ray.label : MD.sn.kind}` : ""}${extra ? " · " + extra : ""}`; }
function mdPenAdd(p) {
  const pen = MD.pen || (MD.pen = { pts: [], stroke: null });
  if (pen.pts.length >= 3 && Math.hypot(p[0] - pen.pts[0][0], p[1] - pen.pts[0][1])*MD.v.s < 9) { mdPenFinish(pen.pts); return; }
  const l = pen.pts[pen.pts.length - 1]; if (!l || Math.hypot(p[0] - l[0], p[1] - l[1]) > 1e-6) pen.pts.push(p);
  mdMsg(`${pen.pts.length} corner${pen.pts.length === 1 ? "" : "s"}; Enter finishes.`); mdRequest();
}
function mdPenFinish(P) {
  const r = mdFreeFrom(P); MD.pen = null;
  if (typeof r === "string") { mdMsg(r); mdRequest(); return; }
  MD.shapes.push(r); MD.sel = [MD.shapes.length - 1]; mdCommit(`Added an outline with ${r.pts.length} corners.`);
}
function mdRectFinish(b, ev) {
  const rc = MD.rc; MD.rc = null; if (!rc) return;
  const r = mdRectFrom(rc.a, b, rc.alt || (ev && ev.altKey), ev ? ev.shiftKey : false, MD.tool === "ellipse");
  if (!(r.w > 0 && r.h > 0)) { mdMsg("The size is zero: drag further or type @w,h."); mdRequest(); return; }
  const type = MD.tool === "rect" ? "rect" : r.w === r.h ? "circle" : "ellipse";
  MD.shapes.push(mdNew(type, r.c[0], r.c[1], { w: r.w, h: r.h, ang: MD.ax })); MD.sel = [MD.shapes.length - 1];
  mdCommit(`Added ${mdA(SHAPE_TYPES[type].name)} ${fmtLen(r.w)} × ${fmtLen(r.h)} at (${r.c[0]}, ${r.c[1]}) µm.`);
}

// ---- commands of the toolbar, the keys and the command line
function mdSelShapes() { return MD.sel.map(i => MD.shapes[i]).filter(Boolean); }
function mdSelBox() { return mdBBox(mdSelShapes()); }
function mdReorder(rows, at) {   // move the shapes rows to just before position at (in the old order); locked shapes stay
  rows = rows.filter(i => !mdLk(i) && MD.shapes[i]).sort((a, b) => a - b); if (!rows.length) return;
  const mv = rows.map(i => MD.shapes[i]), keep = MD.shapes.filter((_, i) => !rows.includes(i)), k = at - rows.filter(i => i < at).length;
  MD.shapes = keep.slice(0, k).concat(mv, keep.slice(k)); MD.sel = mv.map((_, j) => k + j); MD.anchor = k;
  mdCommit(MD.t.ops ? "Order changed: shapes lower in the list are applied later and win where they overlap." : "Order changed.");
}
const MD_MOD = { cut: 1, del: 1, move: 1, rot: 1, scale: 1, fliph: 1, flipv: 1, front: 1, back: 1, up: 1, down: 1, outline: 1, explode: 1, align: 1, array: 1, op: 1 };
function mdDo(cmd, arg?: any) {
  if (!MD) return;
  if (cmd === "lock" || cmd === "unlock") {
    if (!MD.sel.length) { mdMsg(`Select the shapes to ${cmd} first (on the drawing, or in the list: Ctrl-click adds, Shift-click a range).`); return; }
    const n = MD.sel.length; for (const i of MD.sel) { if (cmd === "lock") MD.shapes[i].lock = true; else delete MD.shapes[i].lock; }
    if (cmd === "lock") MD.sel = [];
    mdCommit(cmd === "lock" ? `Locked ${n} shape${n === 1 ? "" : "s"}: ${n === 1 ? "it stays" : "they stay"} in the mask but cannot be picked or changed. Unlock with 🔒 in the list or Ctrl+Shift+L.` : `Unlocked ${n} shape${n === 1 ? "" : "s"}.`); return;
  }
  if (cmd === "unlockall") { const L = MD.shapes.map((s, i) => s.lock ? i : -1).filter(i => i >= 0); if (!L.length) { mdMsg("No shape is locked."); return; } for (const i of L) delete MD.shapes[i].lock; MD.sel = L; mdCommit(`Unlocked ${L.length} shape${L.length === 1 ? "" : "s"} (now selected).`); return; }
  let note = "";
  if (MD_MOD[cmd] && !(cmd === "del" && MD.tool === "node" && MD.vsel >= 0)) {
    const lk = MD.sel.filter(mdLk);
    if (lk.length) {
      MD.sel = MD.sel.filter(i => !mdLk(i));
      if (!MD.sel.length) { mdMsg(`${lk.length === 1 ? "This shape is" : "These shapes are"} locked. Unlock first (🔒 in the list, or Ctrl+Shift+L).`); mdPanel(); mdRequest(); return; }
      note = ` ${lk.length} locked shape${lk.length === 1 ? " was" : "s were"} left as ${lk.length === 1 ? "it was" : "they were"}.`;
    }
  }
  mdDo0(cmd, arg);
  if (note) mdMsg($("mdMsg").textContent + note);
}
function mdDo0(cmd, arg?: any) {
  const need = () => { if (!MD.sel.length) { mdMsg("Select a shape first."); return false; } return true; };
  const box = () => mdSelBox(), ctr = () => { const b = box(); return [(b[0] + b[2])/2, (b[1] + b[3])/2]; };
  switch (cmd) {
    case "undo": mdUndo(); return;
    case "redo": mdUndo(true); return;
    case "fit": mdFit(); return;
    case "side": listSide(SET.listSide === "left" ? "right" : "left"); return;
    case "done": mdClose(); return;
    case "full": { const rt = $("mdRoot"); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (rt.requestFullscreen) rt.requestFullscreen().catch(() => mdMsg("Full screen is not allowed here; the designer fills the window.")); return; }
    case "all": { MD.sel = MD.shapes.map((_, i) => i).filter(i => !mdLk(i)); const nl = MD.shapes.length - MD.sel.length; if (nl) mdMsg(`${nl} locked shape${nl === 1 ? " is" : "s are"} not selected.`); mdPanel(); mdRequest(); return; }
    case "op": { for (const s of mdSelShapes()) s.op = arg || (s.op === "mask" ? "open" : "mask"); mdCommit(MD.t.ops ? "Layer changed: open removes the mask, mask puts it back." : ""); return; }
    case "copy": case "cut": if (!need()) return; MD.clip = mdClone(mdSelShapes()); mdMsg(`Copied ${MD.clip.length} shape${MD.clip.length === 1 ? "" : "s"}.`); if (cmd === "cut") mdDo("del"); return;
    case "paste": {
      if (!MD.clip || !MD.clip.length) { mdMsg("Nothing copied yet."); return; }
      const c = mdClone(MD.clip), off = 10*MD.step; for (const s of c) { delete s.lock; mdMove(s, off, -off); if (MD.tk === "pit") { s.op = "open"; s.pre = s.pre || 0; } else Object.assign(s, Object.assign(MD.t.extra(), { nx: s.nx || 1, ny: s.ny || 1, px: s.px || 0, py: s.py || 0 })); }
      const n = MD.shapes.length; MD.shapes.push(...c); MD.sel = c.map((_, k) => n + k); MD.clip = mdClone(c); mdCommit(`Pasted ${c.length} shape${c.length === 1 ? "" : "s"}.`); return;
    }
    case "dup": {
      if (!need()) return; const d = arg || [20, -20], c = mdSelShapes().map(s => { const x = mdClone(s); delete x.name; delete x.lock; mdMove(x, d[0], d[1]); return x; });
      const n = MD.shapes.length; MD.shapes.push(...c); MD.sel = c.map((_, k) => n + k); mdCommit(`Duplicated ${c.length} shape${c.length === 1 ? "" : "s"}.`); return;
    }
    case "del": {
      if (MD.tool === "node" && MD.vsel >= 0 && MD.sel.length === 1) {
        const sh = MD.shapes[MD.sel[0]];
        if (sh.type === "free" || sh.type === "pts") {
          if (sh.pts.length <= 3) { mdMsg("An outline keeps at least three corners."); return; }
          const f = sh.type === "pts" ? mdToFree(sh) : sh; f.pts.splice(MD.vsel, 1);
          if (selfCrosses(mdCornerW(f))) { mdRevert(); mdMsg("Removing that corner would make the outline cross itself."); return; }
          MD.shapes[MD.sel[0]] = f; MD.vsel = -1; mdCommit("Removed a corner."); return;
        }
      }
      if (!need()) return; const n = MD.sel.length; MD.shapes = MD.shapes.filter((_, i) => !MD.sel.includes(i)); MD.sel = []; mdCommit(`Deleted ${n} shape${n === 1 ? "" : "s"}.`); return;
    }
    case "move": if (!need()) return; for (const s of mdSelShapes()) mdMove(s, arg[0], arg[1]); mdCommit(`Moved by (${arg[0]}, ${arg[1]}) µm.`); return;
    case "rot": if (!need()) return; { const P = ctr(); for (const s of mdSelShapes()) mdRotate(s, arg, P); mdCommit(`Turned by ${arg}°.`); } return;
    case "scale": if (!need()) return; if (!(arg > 0)) { mdMsg("The factor must be positive."); return; } { const P = ctr(); for (const s of mdSelShapes()) mdScale(s, arg, P); mdCommit(`Scaled by ${arg}.`); } return;
    case "fliph": case "flipv": {
      if (!need()) return; const b = box(), m = cmd === "fliph" ? (b[0] + b[2])/2 : (b[1] + b[3])/2;
      for (const i of MD.sel) MD.shapes[i] = mdMirror(MD.shapes[i], cmd === "fliph" ? "h" : "v", m);
      mdCommit(cmd === "fliph" ? "Mirrored left to right." : "Mirrored top to bottom."); return;
    }
    case "front": case "back": case "up": case "down": {
      if (!need()) return;
      const sel = MD.sel.slice().sort((a, b) => a - b), keep = MD.shapes.filter((_, i) => !sel.includes(i)), mv = sel.map(i => MD.shapes[i]);
      let at = cmd === "front" ? keep.length : cmd === "back" ? 0 : null;
      if (at === null) { const first = sel[0], before = MD.shapes.slice(0, first).filter((_, i) => !sel.includes(i)).length; at = Math.max(0, Math.min(keep.length, before + (cmd === "up" ? 1 : -1))); }
      MD.shapes = keep.slice(0, at).concat(mv, keep.slice(at)); MD.sel = mv.map((_, k) => at + k);
      mdCommit(MD.t.ops ? "Order changed: shapes lower in the list are applied later and win where they overlap." : "Order changed."); return;
    }
    case "outline": {
      if (!need()) return; let n = 0, bad = 0;
      for (const i of MD.sel) { const s = MD.shapes[i]; if (s.type === "free") continue; const f = mdToFree(s); if (f) { MD.shapes[i] = f; n++; } else bad++; }
      mdCommit(`${n} shape${n === 1 ? "" : "s"} turned into editable outlines${bad ? `; ${bad} skipped (a frame or ring has a hole, an array must be exploded first)` : ""}.`);
      if (n) mdSetTool("node"); return;
    }
    case "explode": {
      if (!need()) return; const out = [], sel = []; let n = 0;
      MD.shapes.forEach((s, i) => { if (MD.sel.includes(i) && mdArr(s)) { const e = mdExplode(s); n += e.length; e.forEach(x => { sel.push(out.length); out.push(x); }); } else { if (MD.sel.includes(i)) sel.push(out.length); out.push(s); } });
      MD.shapes = out; MD.sel = sel; mdCommit(n ? `The array became ${n} separate shapes.` : "No array selected."); return;
    }
    case "align": {
      if (MD.sel.length < 2) { mdMsg("Select two or more shapes to align them."); return; }
      const b = box();
      for (const s of mdSelShapes()) { const q = mdBBox([s]);
        const dx = arg === "l" ? b[0] - q[0] : arg === "r" ? b[2] - q[2] : arg === "c" ? (b[0] + b[2] - q[0] - q[2])/2 : 0;
        const dy = arg === "b" ? b[1] - q[1] : arg === "t" ? b[3] - q[3] : arg === "m" ? (b[1] + b[3] - q[1] - q[3])/2 : 0;
        mdMove(s, dx, dy); }
      if (arg === "dh" || arg === "dv") {   // distribute: equal gaps between the boxes
        const k = arg === "dh" ? 0 : 1, L = mdSelShapes().map(s => ({ s, q: mdBBox([s]) })).sort((u, v) => u.q[k] - v.q[k]);
        const tot = L.reduce((a, u) => a + u.q[k + 2] - u.q[k], 0), gap = (b[k + 2] - b[k] - tot)/(L.length - 1); let at = b[k];
        for (const u of L) { const d = at - u.q[k]; mdMove(u.s, k ? 0 : d, k ? d : 0); at += u.q[k + 2] - u.q[k] + gap; }
      }
      mdCommit("Aligned."); return;
    }
    case "array": {
      if (MD.tk === "pit") { mdMsg("Arrays are part of the simulator mask; in the pit editor use Duplicate."); return; }
      if (!need()) return; for (const s of mdSelShapes()) Object.assign(s, { nx: arg[0], ny: arg[1], px: arg[2], py: arg[3] }); mdCommit(`Array ${arg[0]} × ${arg[1]} at ${arg[2]} × ${arg[3]} µm.`); return;
    }
  }
}
const MD_NUM = "([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?)";
function mdCommand(raw) {
  const s = raw.trim(), lo = s.toLowerCase(); if (!s) { if (MD.pen && MD.pen.pts.length >= 3) mdPenFinish(MD.pen.pts); return; }
  const nums = (t) => (t.match(new RegExp(MD_NUM, "gi")) || []).map(Number);
  const word = lo.match(/^([a-z]+)\b\s*(.*)$/);
  if (word) {
    const [, w, rest] = word, n = nums(rest);
    const go = { z: "fit", zoom: "fit", fit: "fit", u: "undo", undo: "undo", redo: "redo", del: "del", delete: "del", all: "all", outline: "outline", explode: "explode", fliph: "fliph", flipv: "flipv", mirror: "fliph" }[w];
    if (go) { mdDo(go); return; }
    if ((w === "m" || w === "move") && n.length >= 2) { mdDo("move", [n[0], n[1]]); return; }
    if ((w === "co" || w === "copy") && n.length >= 2) { mdDo("dup", [n[0], n[1]]); return; }
    if ((w === "ro" || w === "rotate") && n.length >= 1) { mdDo("rot", n[0]); return; }
    if ((w === "sc" || w === "scale") && n.length >= 1) { mdDo("scale", n[0]); return; }
    if ((w === "ar" || w === "array") && n.length >= 4) { mdDo("array", n.slice(0, 4).map((v, i) => i < 2 ? Math.max(1, Math.round(v)) : v)); return; }
    if (w === "grid" && n[0] > 0) { MD.step = n[0]; mdSyncBar(); mdMsg(`Grid and snap step ${fmtLen(n[0])}.`); mdRequest(); return; }
    const tl = Object.entries(MD_TOOLS).find(([k, v]) => k === w || v.name.toLowerCase() === w); if (tl) { mdSetTool(tl[0]); return; }
    mdMsg(`Unknown command “${s}”. Try x,y  @dx,dy  @length<angle, or move dx,dy · copy dx,dy · rotate a · scale f · array nx,ny,px,py · grid step · fit · undo.`); return;
  }
  // a point: absolute x,y, relative @dx,dy, polar @length<angle, or a length along the pointer direction
  const ref = MD.pen && MD.pen.pts.length ? MD.pen.pts[MD.pen.pts.length - 1] : MD.rc ? MD.rc.a : MD.meas && MD.tool === "measure" ? MD.meas.a : null;
  const rel = s.startsWith("@"), body = rel ? s.slice(1) : s, n = nums(body);
  let p = null, size = null;
  if (/</.test(body) && n.length >= 2) { const b = ref || [0, 0]; p = [b[0] + n[0]*Math.cos(n[1]/C.DEG), b[1] + n[0]*Math.sin(n[1]/C.DEG)]; }
  else if (n.length >= 2) {
    if (rel && (MD.tool === "rect" || MD.tool === "ellipse") && MD.rc) size = [n[0], n[1]];
    else if (rel && MD.tool === "select" && !ref) { mdDo("move", [n[0], n[1]]); return; }
    else { const b = rel ? (ref || [0, 0]) : [0, 0]; p = [b[0] + n[0], b[1] + n[1]]; }
  } else if (n.length === 1) {
    if (MD.tool === "ellipse" && MD.rc) size = [n[0], n[0]];
    else if (ref && MD.sn) { const dx = MD.sn.p[0] - ref[0], dy = MD.sn.p[1] - ref[1], L = Math.hypot(dx, dy) || 1; p = [ref[0] + n[0]*dx/L, ref[1] + n[0]*dy/L]; }
    else { mdMsg("Type two numbers, e.g. 100,50, or @100<54.74 for a length and an angle."); return; }
  } else { mdMsg(`Could not read “${s}”.`); return; }
  if (p) p = [mdR(p[0]), mdR(p[1])];
  const t = MD.tool;
  if (t === "pen") { mdPenAdd(p); return; }
  if (t === "rect" || t === "ellipse") {
    if (!MD.rc) { if (!p) return; MD.rc = { a: p, s0: mdToS(p), alt: false, shift: false, down: false }; mdMsg(t === "rect" ? "First corner set; type @w,h or the opposite corner." : "Centre set; type @w,h or a diameter."); mdRequest(); return; }
    if (size) {
      const a = MD.rc.a, w = Math.abs(size[0]), h = Math.abs(size[1]); MD.rc.alt = t === "ellipse";
      const b = t === "ellipse" ? mdRot([w/2, h/2], MD.ax).map((v, i) => a[i] + v) : mdRot([size[0], size[1]], MD.ax).map((v, i) => a[i] + v);
      mdRectFinish(b, null); return;
    }
    mdRectFinish(p, null); return;
  }
  if (t === "measure") { if (!MD.meas || MD.meas.b !== MD.meas.a && MD.meas.done) { MD.meas = { a: p, b: p }; } else { MD.meas.b = p; MD.meas.done = true; mdMsg(mdMeasText(MD.meas.a, p)); } mdRequest(); return; }
  if (t === "shape") { MD.shapes.push(mdNew(MD.type, p[0], p[1])); MD.sel = [MD.shapes.length - 1]; mdCommit(`Added ${mdA(SHAPE_TYPES[MD.type].name)} at (${p[0]}, ${p[1]}) µm.`); return; }
  if (t === "select" && MD.sel.length === 1) { const sh = MD.shapes[MD.sel[0]]; mdMove(sh, p[0] - sh.cx, p[1] - sh.cy); mdCommit(`Centre now at (${p[0]}, ${p[1]}) µm.`); return; }
  mdMsg("Pick a drawing tool first (R, E, P or S), or select one shape to place its centre.");
}

// ---- side panel: properties of the selection and the list of shapes (the order in which they are applied)
function mdPanel() {
  if (!MD) return;
  const f = (k, v, lbl, st = 1, ttl = "") => `<label${ttl ? ` title="${ttl}"` : ""}>${lbl}<input type="number" step="${st}" data-k="${k}" value="${+(+(v == null ? 0 : v)).toFixed(3)}"></label>`;
  const sel = mdSelShapes(); let h = "";
  if (sel.length === 1) {
    const sh = sel[0], T = SHAPE_TYPES[sh.type] || SHAPE_TYPES.rect, dirs = inPlaneDirs(MD.t.frame());
    const lab = { w: "w", h: "h", t: sh.type === "ring" || sh.type === "star" ? "inner" : "arm t", n: sh.type === "star" ? "points" : "sides", k: "scale %" };
    h += `<h4>${MD.sel[0] + 1}. ${T.name}${sh.lock ? " · 🔒 locked" : ""}</h4>`;
    h += `<div class="row mdLockRow"><label style="flex:1">name <input type="text" data-k="name" maxlength="40" value="${esc(sh.name || "")}" placeholder="${esc(T.name.replace(/ \(.*\)$/, ""))}"></label><button class="btn" data-md="${sh.lock ? "unlock" : "lock"}" title="${sh.lock ? "Allow changes again" : "Keep this shape as it is: it can no longer be picked or changed on the drawing"} (Ctrl+${sh.lock ? "Shift+" : ""}L)">${sh.lock ? "🔓 Unlock" : "🔒 Lock"}</button></div>`;
    if (MD.t.ops) h += `<label>layer <select data-k="op"><option value="open"${sh.op === "open" ? " selected" : ""}>open (removes the mask)</option><option value="mask"${sh.op === "mask" ? " selected" : ""}>mask (puts it back)</option></select></label>`;
    h += `<div class="mdF">${f("cx", sh.cx, "x (µm)")}${f("cy", sh.cy, "y (µm)")}${sh.type === "para" ? f("a1", sh.a1, "side 1 °", 0.1) + f("a2", sh.a2, "side 2 °", 0.1) : sh.type === "pts" ? "" : f("ang", sh.ang || 0, "angle °", 0.1)}`;
    h += T.f.map(k => f(k, sh[k] == null ? 100 : sh[k], lab[k] + (k === "n" || k === "k" ? "" : " (µm)"), k === "n" ? 1 : 0.5)).join("");
    if (MD.tk !== "pit") h += f("nx", sh.nx || 1, "copies x", 1) + f("ny", sh.ny || 1, "copies y", 1) + f("px", sh.px || 0, "pitch x (µm)", 1) + f("py", sh.py || 0, "pitch y (µm)", 1);
    else h += f("pre", sh.pre || 0, "pre-etch (µm)", 1);
    h += `</div>${dirSelects(sh, 0, dirs).replace(/data-i="0" /g, "")}`;
    const bb = mdBBox([sh]); if (bb) h += `<p class="note">Extent ${fmtLen(bb[2] - bb[0])} × ${fmtLen(bb[3] - bb[1])}${sh.type === "free" || sh.type === "pts" ? ` · ${sh.pts.length} corners · area ${Math.round(Math.abs(polyArea(mdCornerW(sh)))).toLocaleString("en")} µm²` : ""}</p>`;
    if ((sh.type === "free" || sh.type === "pts") && !mdArr(sh) && sh.pts.length <= 80)
      h += `<details class="mdCorners"><summary>Corners (x, y in µm)</summary><div>${mdCornerW(sh).map((p, k) => `<span class="mdV"><b>${k + 1}</b><input type="number" step="0.5" data-v="${k}" data-c="0" value="${mdR(p[0])}"><input type="number" step="0.5" data-v="${k}" data-c="1" value="${mdR(p[1])}"></span>`).join("")}</div></details>`;
  } else if (sel.length > 1) {
    const b = mdSelBox();
    const nl = sel.filter(x => x.lock).length;
    h += `<h4>${sel.length} shapes${nl ? ` · ${nl} locked` : ""}</h4><div class="row mdLockRow"><button class="btn" data-md="lock" title="Ctrl+L">🔒 Lock all ${sel.length}</button>${nl ? `<button class="btn" data-md="unlock" title="Unlock the selected shapes">🔓 Unlock</button>` : ""}</div><p class="note">Box ${fmtLen(b[2] - b[0])} × ${fmtLen(b[3] - b[1])}, centre (${mdR((b[0] + b[2])/2)}, ${mdR((b[1] + b[3])/2)}) µm.</p>`;
    if (MD.t.ops) h += `<label>layer of all <select data-k="op"><option value="">keep</option><option value="open">open</option><option value="mask">mask</option></select></label>`;
    h += `<div class="mdAlign"><button class="btn" data-md="align" data-a="l">Left</button><button class="btn" data-md="align" data-a="c">Centre</button><button class="btn" data-md="align" data-a="r">Right</button><button class="btn" data-md="align" data-a="t">Top</button><button class="btn" data-md="align" data-a="m">Middle</button><button class="btn" data-md="align" data-a="b">Bottom</button><button class="btn" data-md="align" data-a="dh">Spread ↔</button><button class="btn" data-md="align" data-a="dv">Spread ↕</button></div>`;
  } else h += `<h4>No selection</h4><p class="note">${MD.shapes.length} shape${MD.shapes.length === 1 ? "" : "s"}. Pick a tool on the left; ${MD_TOOLS[MD.tool].name}: ${MD_TOOLS[MD.tool].hint}</p>`;
  $("mdProps").innerHTML = h;
  if (sel.some(x => x.lock)) for (const el of $("mdProps").querySelectorAll("input, select, [data-md=align]")) (el as HTMLInputElement).disabled = true;   // locked: shown, not changed
  const nm = sh => sh.name ? esc(sh.name) : SHAPE_TYPES[sh.type] ? SHAPE_TYPES[sh.type].name.replace(/ \(.*\)$/, "") : esc(sh.type);
  $("mdList").innerHTML = MD.shapes.map((sh, i) => `<div class="mdRow${MD.sel.includes(i) ? " sel" : ""}${sh.lock ? " locked" : ""}" data-row="${i}" draggable="${sh.lock ? "false" : "true"}" title="Click selects, Ctrl-click adds, Shift-click selects a range; drag to change the order${sh.lock ? " (unlock first)" : ""}"><span class="mdGrip" aria-hidden="true">⋮⋮</span><span class="mdNm">${i + 1}. ${nm(sh)}${mdArr(sh) ? ` ×${(sh.nx || 1)*(sh.ny || 1)}` : ""}</span>${MD.t.ops ? `<button class="mdOp ${sh.op}" data-rop="${i}" title="${sh.lock ? "Locked" : "Switch between open (removes the mask) and mask (puts it back)"}"${sh.lock ? " disabled" : ""}>${sh.op}</button>` : ""}<button class="mdLk${sh.lock ? " on" : ""}" data-rlock="${i}" aria-pressed="${!!sh.lock}" title="${sh.lock ? "Locked: click to unlock" : "Lock: keep this shape as it is"}">${sh.lock ? "🔒" : "🔓"}</button></div>`).join("") || `<p class="note">No shapes yet.</p>`;
  const nL = MD.shapes.filter(x => x.lock).length; $("mdLayInfo").textContent = MD.shapes.length ? `${MD.shapes.length} shape${MD.shapes.length === 1 ? "" : "s"}${nL ? `, ${nL} locked` : ""}` : "";
  for (const b of document.querySelectorAll("#mdRoot [data-md=undo]")) (b as HTMLButtonElement).disabled = !MD.hist.length;
  for (const b of document.querySelectorAll("#mdRoot [data-md=redo]")) (b as HTMLButtonElement).disabled = !MD.fut.length;
}

// ---- import of DXF and SVG outlines (1 drawing unit = 1 µm unless the DXF header names another unit)
function mdParseDXF(txt) {
  const L = txt.split(/\r?\n/), pr = [];
  for (let i = 0; i + 1 < L.length; i += 2) pr.push([parseInt(L[i].trim(), 10), L[i + 1].trim()]);
  let unit = 1, sec = "", i = 0, skipped = 0, bulge = false;
  const loops = [];
  const U = { 1: 25400, 2: 304800, 4: 1000, 5: 10000, 6: 1e6, 13: 1, 14: 1e-3 };
  while (i < pr.length) {
    const [c, v] = pr[i];
    if (c === 0 && v === "SECTION") { sec = pr[i + 1] ? pr[i + 1][1] : ""; i += 2; continue; }
    if (c === 9 && v === "$INSUNITS" && pr[i + 1]) { unit = U[parseInt(pr[i + 1][1], 10)] || 1; i += 2; continue; }
    if (c !== 0 || sec !== "ENTITIES") { i++; continue; }
    const ent = v, props = []; i++;
    while (i < pr.length && pr[i][0] !== 0) props.push(pr[i++]);
    const layer = (props.find(q => q[0] === 8) || [0, "0"])[1].toUpperCase();
    if (layer === "DOMAIN") continue;
    const op = /MASK/.test(layer) && !/OPEN/.test(layer) ? "mask" : "open";
    if (ent === "LWPOLYLINE") {
      const P = []; let x = null;
      for (const [k, val] of props) { if (k === 10) x = Number(val); else if (k === 20 && x !== null) { P.push([x*unit, Number(val)*unit]); x = null; } else if (k === 42 && Number(val) !== 0) bulge = true; }
      if (P.length >= 3) loops.push({ pts: P, op }); else skipped++;
    } else if (ent === "POLYLINE") {
      const P = [];
      while (i < pr.length && pr[i][1] === "VERTEX" && pr[i][0] === 0) {
        i++; let x = 0, y = 0; while (i < pr.length && pr[i][0] !== 0) { const [k, val] = pr[i++]; if (k === 10) x = Number(val); else if (k === 20) y = Number(val); else if (k === 42 && Number(val) !== 0) bulge = true; }
        P.push([x*unit, y*unit]);
      }
      if (i < pr.length && pr[i][1] === "SEQEND") { i++; while (i < pr.length && pr[i][0] !== 0) i++; }
      if (P.length >= 3) loops.push({ pts: P, op }); else skipped++;
    } else if (ent === "CIRCLE") {
      const g = k => Number((props.find(q => q[0] === k) || [0, 0])[1]);
      loops.push({ circle: [g(10)*unit, g(20)*unit, 2*g(40)*unit], op });
    } else if (ent !== "SEQEND" && ent !== "EOF" && ent !== "ENDSEC") skipped++;
  }
  return { loops, skipped, note: bulge ? "Arc segments (bulges) were read as straight edges." : "" };
}
function mdParseSVG(txt) {
  const doc = new DOMParser().parseFromString(txt, "image/svg+xml"), loops = []; let skipped = 0, curves = false, tf = false;
  if (doc.querySelector("parsererror")) return { loops, skipped: 1, note: "The file is not valid SVG." };
  const num = (el, a) => parseFloat(el.getAttribute(a) || "0");
  for (const el of Array.from(doc.querySelectorAll("rect, circle, ellipse, polygon, polyline, path"))) {
    const cls = (el.getAttribute("class") || "") + " " + (el.getAttribute("data-op") || "");
    if (/\b(bg|domain|skip)\b/.test(cls)) continue;
    if (el.getAttribute("transform") || el.closest("[transform]")) tf = true;
    const op = /\bmask\b/.test(cls) ? "mask" : "open", tag = el.tagName.toLowerCase(), fl = P => P.map(p => [p[0], -p[1]]);
    if (tag === "rect") { const x = num(el, "x"), y = num(el, "y"), w = num(el, "width"), h = num(el, "height"); if (w > 0 && h > 0) loops.push({ pts: fl([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]), op }); else skipped++; }
    else if (tag === "circle") loops.push({ circle: [num(el, "cx"), -num(el, "cy"), 2*num(el, "r")], op });
    else if (tag === "ellipse") loops.push({ ellipse: [num(el, "cx"), -num(el, "cy"), 2*num(el, "rx"), 2*num(el, "ry")], op });
    else if (tag === "polygon" || tag === "polyline") { const n = (el.getAttribute("points") || "").match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [], P = []; for (let k = 0; k + 1 < n.length; k += 2) P.push([Number(n[k]), Number(n[k + 1])]); if (P.length >= 3) loops.push({ pts: fl(P), op }); else skipped++; }
    else {   // path: M L H V Z exactly; C S Q T sampled; A by its end point
      const d = el.getAttribute("d") || "", tok = d.match(/[a-df-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || [];
      let k = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0, P = [];
      const flush = () => { if (P.length >= 3) loops.push({ pts: fl(P), op }); else if (P.length) skipped++; P = []; };
      const nx = () => Number(tok[k++]);
      while (k < tok.length) {
        if (/[a-z]/i.test(tok[k])) cmd = tok[k++];
        const r = cmd === cmd.toLowerCase(), C0 = cmd.toUpperCase();
        if (C0 === "Z") { flush(); x = sx; y = sy; continue; }
        if (C0 === "M") { flush(); x = (r ? x : 0) + nx(); y = (r ? y : 0) + nx(); sx = x; sy = y; P.push([x, y]); cmd = r ? "l" : "L"; continue; }
        if (C0 === "L" || C0 === "T") { x = (r ? x : 0) + nx(); y = (r ? y : 0) + nx(); P.push([x, y]); if (C0 === "T") curves = true; continue; }
        if (C0 === "H") { x = (r ? x : 0) + nx(); P.push([x, y]); continue; }
        if (C0 === "V") { y = (r ? y : 0) + nx(); P.push([x, y]); continue; }
        if (C0 === "C" || C0 === "S" || C0 === "Q") {
          const n = C0 === "C" ? 3 : 2, q = []; for (let j = 0; j < n; j++) q.push([(r ? x : 0) + nx(), (r ? y : 0) + nx()]);
          const p0 = [x, y], ctl = C0 === "S" ? [p0, q[0], q[1]] : C0 === "Q" ? [p0, q[0], q[1]] : [p0, q[0], q[1], q[2]];
          for (let j = 1; j <= 8; j++) { const t = j/8, B = ctl.length === 4 ? [(1 - t)**3, 3*t*(1 - t)**2, 3*t*t*(1 - t), t**3] : [(1 - t)**2, 2*t*(1 - t), t*t]; P.push([B.reduce((a, b, m) => a + b*ctl[m][0], 0), B.reduce((a, b, m) => a + b*ctl[m][1], 0)]); }
          [x, y] = q[q.length - 1]; curves = true; continue;
        }
        if (C0 === "A") { k += 5; x = (r ? x : 0) + nx(); y = (r ? y : 0) + nx(); P.push([x, y]); curves = true; continue; }
        k++;
      }
      flush();
    }
  }
  return { loops, skipped, note: [curves ? "Curves were turned into short straight edges and arcs into chords." : "", tf ? "Transforms in the SVG were ignored; export without them for exact positions." : ""].filter(Boolean).join(" ") };
}
async function mdImport(file) {
  const txt = await file.text(), r = /^\s*</.test(txt) ? mdParseSVG(txt) : mdParseDXF(txt);
  let n = 0, bad = r.skipped, holes = 0; const sel = [];
  for (const L of r.loops) {
    if (!MD.t.ops && L.op === "mask") { holes++; continue; }   // the pit has openings only
    const op = L.op;
    let sh = null;
    if (L.circle) { if (L.circle[2] > 0) sh = mdNew("circle", L.circle[0], L.circle[1], { w: mdR(L.circle[2]), h: mdR(L.circle[2]), ang: 0, op }); }
    else if (L.ellipse) { if (L.ellipse[2] > 0 && L.ellipse[3] > 0) sh = mdNew("ellipse", L.ellipse[0], L.ellipse[1], { w: mdR(L.ellipse[2]), h: mdR(L.ellipse[3]), ang: 0, op }); }
    else {
      let P = L.pts; if (P.length > 400) { const span = Math.max(...P.map(p => Math.abs(p[0]) + Math.abs(p[1]))); P = simplifyRDP(P, span*1e-4); }
      const f = mdFreeFrom(P, op, 1e-3); if (typeof f !== "string") sh = f;
    }
    if (sh) { sel.push(MD.shapes.length); MD.shapes.push(sh); n++; } else bad++;
  }
  MD.sel = sel; mdCommit(`Imported ${n} outline${n === 1 ? "" : "s"} from ${file.name}${bad ? `; skipped ${bad} that were not closed outlines` : ""}${holes ? `; skipped ${holes} on the MASK layer (the pit editor has openings only)` : ""}. ${r.note}`.trim()); if (n) mdFit();
}

// ---- export of a mask as SVG or DXF (shared with the Save dialog, module 25)
function maskLoopsOrdered(shapes) {   // closed loops in painting order; the hole of a frame or ring is the opposite layer
  const out = [];
  for (const sh of shapes) {
    const two = sh.type === "frame" || sh.type === "ring", L = shapeLoops(sh);
    L.forEach((P, j) => out.push({ pts: P, op: two && j % 2 === 1 ? (sh.op === "mask" ? "open" : "mask") : (sh.op || "open") }));
  }
  return out;
}
function maskSVG(shapes, o) {
  const dom = o.domain; let b = mdBBox(shapes);
  if (dom) b = b ? [Math.min(b[0], -dom[0]), Math.min(b[1], -dom[1]), Math.max(b[2], dom[0]), Math.max(b[3], dom[1])] : [-dom[0], -dom[1], dom[0], dom[1]];
  if (!b) b = [-100, -100, 100, 100];
  const m = 0.05*Math.max(b[2] - b[0], b[3] - b[1]) + 5, x0 = b[0] - m, y0 = -(b[3] + m), w = b[2] - b[0] + 2*m, h = b[3] - b[1] + 2*m, n = v => +v.toFixed(4);
  const sw = n(Math.max(w, h)/800);
  const d = P => "M" + P.map(p => `${n(p[0])} ${n(-p[1])}`).join(" L") + " Z";
  const paths = maskLoopsOrdered(shapes).map(L => `  <path class="${L.op}" data-op="${L.op}" fill="${L.op === "open" ? "#ffffff" : "#b9a8d9"}" stroke="#222222" stroke-width="${sw}"${L.op === "mask" ? ` stroke-dasharray="${n(4*sw)} ${n(3*sw)}"` : ""} d="${d(L.pts)}"/>`).join("\n");
  const esc2 = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(x0)} ${n(y0)} ${n(w)} ${n(h)}" width="${n(w/1000)}mm" height="${n(h/1000)}mm">
  <title>${esc2(o.title || "mask")}</title>
  <desc>${esc2(o.desc || "")} Units: 1 = 1 µm; y of the wafer frame points up (SVG y = −y). Purple: mask, white: opening; shapes are painted in order.</desc>
  <rect class="bg" x="${n(x0)}" y="${n(y0)}" width="${n(w)}" height="${n(h)}" fill="#b9a8d9"/>
${paths}${dom ? `\n  <rect class="domain" x="${n(-dom[0])}" y="${n(-dom[1])}" width="${n(2*dom[0])}" height="${n(2*dom[1])}" fill="none" stroke="#b5481d" stroke-width="${sw}" stroke-dasharray="${n(6*sw)} ${n(4*sw)}"/>` : ""}
  <line class="skip" x1="${n(x0 + m)}" y1="${n(-(b[1] - m/2))}" x2="${n(x0 + w - m)}" y2="${n(-(b[1] - m/2))}" stroke="#b5481d" stroke-width="${n(3*sw)}"/>
</svg>
`;
}
function maskDXF(shapes, o) {   // AutoCAD R12 ASCII DXF: closed POLYLINEs on layers OPEN and MASK (and DOMAIN), in µm
  const out = [], g = (c, v) => { out.push(String(c), String(v)); }, n = v => (+v.toFixed(5)).toString();
  g(0, "SECTION"); g(2, "HEADER"); g(9, "$ACADVER"); g(1, "AC1009"); g(9, "$INSUNITS"); g(70, 13); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "TABLES"); g(0, "TABLE"); g(2, "LAYER"); g(70, 3);
  for (const [nm, c] of [["OPEN", 7], ["MASK", 6], ["DOMAIN", 1]] as [string, number][]) { g(0, "LAYER"); g(2, nm); g(70, 0); g(62, c); g(6, "CONTINUOUS"); }
  g(0, "ENDTAB"); g(0, "ENDSEC");
  g(0, "SECTION"); g(2, "ENTITIES");
  const poly = (P, layer) => { g(0, "POLYLINE"); g(8, layer); g(66, 1); g(10, 0); g(20, 0); g(30, 0); g(70, 1); for (const p of P) { g(0, "VERTEX"); g(8, layer); g(10, n(p[0])); g(20, n(p[1])); g(30, 0); } g(0, "SEQEND"); g(8, layer); };
  for (const L of maskLoopsOrdered(shapes)) poly(L.pts, L.op === "mask" ? "MASK" : "OPEN");
  if (o.domain) { const d = o.domain; poly([[-d[0], -d[1]], [d[0], -d[1]], [d[0], d[1]], [-d[0], d[1]]], "DOMAIN"); }
  g(0, "ENDSEC"); g(0, "EOF");
  return out.join("\n") + "\n";
}
function maskExportInfo(tk) {   // shapes, domain and a description of one editor's mask
  const t = MD_TGT[tk], shapes = MD && MD.tk === tk ? MD.shapes : t.get();
  return { shapes, domain: t.domain(), title: `${t.name} mask`, desc: `Origami 3D Viewer, ${t.name} mask, ${t.label()}.` };
}

// ---- wiring
(() => {
  const cv = $("mdCanvas");
  cv.addEventListener("pointerdown", mdDown); cv.addEventListener("pointermove", mdMoveEv);
  cv.addEventListener("pointerup", mdUp); cv.addEventListener("pointercancel", mdUp);
  cv.addEventListener("pointerleave", () => { if (MD && !MD.drag) { MD.curS = null; MD.hover = -1; mdRequest(); } });
  cv.addEventListener("contextmenu", ev => ev.preventDefault());
  cv.addEventListener("wheel", ev => { if (!MD) return; ev.preventDefault(); const [sx, sy] = mdPtr(ev); mdZoom(Math.exp(-ev.deltaY*(ev.deltaMode ? 0.05 : 0.0015)), sx, sy); }, { passive: false });
  cv.addEventListener("dblclick", ev => {
    if (!MD) return; const [sx, sy] = mdPtr(ev);
    if (MD.tool === "pen" && MD.pen && MD.pen.pts.length >= 3) { mdPenFinish(MD.pen.pts); return; }
    if (MD.tool === "select") { const i = mdPick(sx, sy); if (i >= 0 && (MD.shapes[i].type === "free" || MD.shapes[i].type === "pts")) { MD.sel = [i]; mdSetTool("node"); mdPanel(); } return; }
    if (MD.tool === "node" && MD.sel.length === 1) {   // add a corner on the nearest edge
      const sh = MD.shapes[MD.sel[0]]; if (!sh || (sh.type !== "free" && sh.type !== "pts") || mdArr(sh)) return;
      const W0 = mdCornerW(sh), w = mdToW(sx, sy); let bi = -1, bd = 8/MD.v.s;
      for (let k = 0; k < W0.length; k++) { const dd = mdSegD(w, W0[k], W0[(k + 1) % W0.length]); if (dd < bd) { bd = dd; bi = k; } }
      if (bi < 0) return;
      const f = sh.type === "pts" ? mdToFree(sh) : sh, p = mdSnap(sx, sy, { noObj: true }).p, k = (f.k || 100)/100, l = mdRot([p[0] - f.cx, p[1] - f.cy], -(f.ang || 0));
      f.pts.splice(bi + 1, 0, [mdR(l[0]/k), mdR(l[1]/k)]); MD.shapes[MD.sel[0]] = f; MD.vsel = bi + 1; mdCommit(`Added corner ${bi + 2}.`);
    }
  });
  new ResizeObserver(() => { if (MD && MD.on) mdResize(); }).observe($("mdCanvasBox"));
  // layer list: drag rows to change the order in which the shapes are applied
  const ls = $("mdList"), clr = () => { for (const r of ls.querySelectorAll(".mdRow.dropA, .mdRow.dropB")) r.classList.remove("dropA", "dropB"); };
  ls.addEventListener("dragstart", ev => { const r = ev.target.closest && ev.target.closest(".mdRow"); if (!r || !MD) return; const i = Number(r.dataset.row);
    if (!MD.sel.includes(i)) { MD.sel = [i]; MD.anchor = i; } MD.sel = MD.sel.filter(j => !mdLk(j)); MD.rowDrag = MD.sel.slice(); ev.dataTransfer.effectAllowed = "move"; ev.dataTransfer.setData("text/plain", String(i)); mdRequest(); });
  ls.addEventListener("dragover", ev => { const r = ev.target.closest(".mdRow"); if (!r || !MD || !MD.rowDrag) return; ev.preventDefault(); clr();
    const bx = r.getBoundingClientRect(); r.classList.add(ev.clientY < bx.top + bx.height/2 ? "dropA" : "dropB"); });
  ls.addEventListener("dragleave", ev => { if (!ls.contains(ev.relatedTarget)) clr(); });
  ls.addEventListener("drop", ev => { const r = ev.target.closest(".mdRow"); if (!r || !MD || !MD.rowDrag) return; ev.preventDefault();
    const bx = r.getBoundingClientRect(), at = Number(r.dataset.row) + (ev.clientY < bx.top + bx.height/2 ? 0 : 1); clr(); mdReorder(MD.rowDrag, at); MD.rowDrag = null; });
  ls.addEventListener("dragend", () => { clr(); if (MD) MD.rowDrag = null; });
  $("mdRoot").addEventListener("click", ev => {
    const b = ev.target.closest("[data-md]"); if (b && MD) { mdDo(b.dataset.md, b.dataset.a); return; }
    const t = ev.target.closest("#mdTools [data-tool]"); if (t && MD) { mdSetTool(t.dataset.tool); return; }
    const lb = ev.target.closest("[data-rlock]"); if (lb && MD) {   // lock of one row; of all selected rows when it is one of them
      const i = Number(lb.dataset.rlock), on = !MD.shapes[i].lock, L = MD.sel.includes(i) && MD.sel.length > 1 ? MD.sel.slice() : [i];
      const keep = MD.sel.filter(j => !L.includes(j)); MD.sel = L; mdDo(on ? "lock" : "unlock"); if (!on) MD.sel = keep.concat(L); else MD.sel = keep; mdPanel(); mdRequest(); return;
    }
    const ob = ev.target.closest("[data-rop]"); if (ob && MD) { const i = Number(ob.dataset.rop); if (!MD.sel.includes(i)) MD.sel = [i]; mdDo("op", MD.shapes[i].op === "mask" ? "open" : "mask"); return; }
    const r = ev.target.closest(".mdRow"); if (r && MD) {
      const i = Number(r.dataset.row);
      if (ev.shiftKey && MD.anchor != null && MD.shapes[MD.anchor]) { const a = Math.min(MD.anchor, i), b = Math.max(MD.anchor, i); MD.sel = Array.from({ length: b - a + 1 }, (_, k) => a + k); }
      else if (ev.ctrlKey || ev.metaKey) { MD.sel = MD.sel.includes(i) ? MD.sel.filter(j => j !== i) : MD.sel.concat([i]); MD.anchor = i; }
      else { MD.sel = [i]; MD.anchor = i; }
      mdPanel(); mdRequest();
    }
  });
  $("mdProps").addEventListener("change", ev => {
    if (!MD) return; const el = ev.target;
    if (mdSelShapes().some(x => x.lock)) { mdMsg("Locked shapes are not changed. Unlock first."); mdPanel(); return; }
    if (el.dataset.k === "name") { for (const sh of mdSelShapes()) { const v = el.value.trim().slice(0, 40); if (v) sh.name = v; else delete sh.name; } mdCommit("Renamed."); return; }
    if (el.dataset.v != null) {   // a corner typed in
      const sh = MD.shapes[MD.sel[0]], f = sh.type === "pts" ? mdToFree(sh) : sh, W0 = mdCornerW(f), k = Number(el.dataset.v), p = W0[k].slice(); p[Number(el.dataset.c)] = Number(el.value);
      mdSetCorner(f, k, p); MD.shapes[MD.sel[0]] = f;
      if (selfCrosses(mdCornerW(f))) { mdRevert(); mdMsg("That would make the outline cross itself."); mdPanel(); return; }
      mdCommit(`Corner ${k + 1} at (${mdR(p[0])}, ${mdR(p[1])}) µm.`); return;
    }
    const k = el.dataset.k; if (!k || el.value === "") return;
    for (const sh of mdSelShapes()) {
      if (k === "op") sh.op = el.value;
      else { let v = Number(el.value); if (!isFinite(v)) return; if (["w", "h", "t", "k"].includes(k) && v <= 0) { mdMsg("Sizes must be positive."); mdPanel(); return; } if (["n", "nx", "ny"].includes(k)) v = Math.max(k === "n" ? 3 : 1, Math.round(v)); sh[k] = v; }
    }
    mdCommit("");
  });
  const bar = $("mdRoot");
  bar.addEventListener("change", ev => {
    if (!MD) return; const id = ev.target.id;
    if (id === "mdSnapGrid") MD.snap.grid = ev.target.checked; else if (id === "mdSnapObj") MD.snap.obj = ev.target.checked;
    else if (id === "mdSnapDir") MD.snap.dir = ev.target.checked; else if (id === "mdSnapOrtho") MD.snap.ortho = ev.target.checked;
    else if (id === "mdStep") { const v = Number(ev.target.value); if (v > 0) MD.step = v; }
    else if (id === "mdOp") MD.op = ev.target.value; else if (id === "mdAx") MD.ax = Number(ev.target.value) || 0;
    else if (id === "mdType") { MD.type = ev.target.value; mdSetTool("shape"); }
    else if (id === "mdImport") { const f = ev.target.files && ev.target.files[0]; if (f) mdImport(f).catch(() => mdMsg("This file could not be read as DXF or SVG.")); ev.target.value = ""; }
    else return;
    mdRequest();
  });
  $("mdExpSvg").addEventListener("click", async () => { const i = maskExportInfo(MD.tk); const m = await saveFile(`${MD.tk}-mask.svg`, maskSVG(i.shapes, i), "image/svg+xml"); mdMsg(m || "Saved the mask as SVG."); });
  $("mdExpDxf").addEventListener("click", async () => { const i = maskExportInfo(MD.tk); const m = await saveFile(`${MD.tk}-mask.dxf`, maskDXF(i.shapes, i), "application/dxf"); mdMsg(m || "Saved the mask as DXF (R12, µm, layers OPEN, MASK, DOMAIN)."); });
  $("bDesign").addEventListener("click", () => mdOpen("sim"));
  $("pcDesign").addEventListener("click", () => mdOpen("pit"));
  $("clDesign").addEventListener("click", () => { if (SIM.owner !== "corner") clBuild(false, true); mdOpen("corner"); });
  $("bDesign").title = "Open the mask in the full-screen designer";
  // keys: while the designer is open the page's own shortcuts are off
  window.addEventListener("keydown", ev => {
    if (!MD || !MD.on) return;
    ev.stopPropagation();
    const tg = ev.target, inCmd = tg && tg.id === "mdCmd", tag = tg && tg.tagName;
    if (!inCmd && (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA")) { if (ev.key === "Escape" || ev.key === "Enter" && tag === "INPUT") { tg.blur(); $("mdCanvas").focus(); } return; }
    if (inCmd) {
      if (ev.key === "Enter") { ev.preventDefault(); const v = tg.value; tg.value = ""; mdCommand(v); $("mdCanvas").focus(); }   // back to the drawing, so tool keys work; typing a number comes back here
      else if (ev.key === "Escape") { tg.value = ""; $("mdCanvas").focus(); }
      return;
    }
    const k = ev.key, ctl = ev.ctrlKey || ev.metaKey, lk = k.length === 1 ? k.toLowerCase() : k;
    if (ctl) {
      const m = { z: ev.shiftKey ? "redo" : "undo", y: "redo", c: "copy", x: "cut", v: "paste", d: "dup", a: "all", l: ev.shiftKey ? "unlockall" : "lock" }[lk];
      if (m) { ev.preventDefault(); mdDo(m); } return;
    }
    if (k === " ") { MD.space = true; ev.preventDefault(); return; }
    if (k === "Escape") { ev.preventDefault(); if (MD.pen || MD.rc || MD.drag) { if (MD.drag && MD.drag.kind !== "pan" && MD.drag.kind !== "box") mdRevert(); MD.pen = null; MD.rc = null; MD.drag = null; mdMsg("Cancelled."); } else if (MD.sel.length) { MD.sel = []; MD.vsel = -1; mdPanel(); } else if (MD.tool !== "select") mdSetTool("select"); mdRequest(); return; }
    if (k === "Enter") { ev.preventDefault(); if (MD.pen && MD.pen.pts.length >= 3) mdPenFinish(MD.pen.pts); return; }
    if (k === "Backspace" || k === "Delete") { ev.preventDefault(); if (MD.pen && MD.pen.pts.length) { MD.pen.pts.pop(); mdRequest(); return; } mdDo("del"); return; }
    const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[k];
    if (mv) { ev.preventDefault(); if (MD.sel.length) { const st = (ev.shiftKey ? 10 : 1)*MD.step; mdDo("move", [mv[0]*st, mv[1]*st]); } else { MD.v.cx += mv[0]*60/MD.v.s; MD.v.cy += mv[1]*60/MD.v.s; mdRequest(); } return; }
    if (k === "+" || k === "=") { mdZoom(1.25, MD.W/2, MD.H/2); return; }
    if (k === "_") { mdZoom(0.8, MD.W/2, MD.H/2); return; }
    const tool = Object.entries(MD_TOOLS).find(([, v]) => v.key === lk);
    if (tool && !ev.altKey) { mdSetTool(tool[0]); return; }
    if (lk === "f") { mdFit(); return; }
    if (lk === "g") { MD.snap.grid = !MD.snap.grid; mdSyncBar(); mdMsg(`Grid snap ${MD.snap.grid ? "on" : "off"}.`); return; }
    if (lk === "o") { mdDo("outline"); return; }
    if (/^[0-9@.,<-]$/.test(k)) { const c = $("mdCmd"); c.focus(); }   // typing a point or a size goes to the command line
  }, true);
  window.addEventListener("keyup", ev => { if (MD && MD.on && ev.key === " ") { MD.space = false; ev.stopPropagation(); } }, true);
  document.addEventListener("fullscreenchange", () => { if (document.fullscreenElement === $("mdRoot") && !(MD && MD.on)) { document.exitFullscreen().catch(() => {}); return; }   // closed before full screen began
    if (MD && MD.on) { $("mdFull").textContent = document.fullscreenElement ? "Leave full screen" : "Full screen"; requestAnimationFrame(mdResize); } });
})();
