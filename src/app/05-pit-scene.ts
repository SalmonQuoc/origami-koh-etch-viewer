// --------------------------------------------------------------------- PIT scene
const PL_CUT = [new THREE.Plane(new V3(0, 1, 0), 0)];
let pit = null;
// openings of the current etch: one preset, or the user's list. Each opening is cut into convex pieces (g = which opening);
// each piece is etched on its own and the cavity drawn is the union of the pieces' cavities.
function pitItems() {
  if (S.open === "custom") return S.pitShapes.flatMap((sh, g) => shapePieces(sh).map(o => ({ o, pre: sh.pre || 0, g })));
  const op = OPENINGS[S.wf][S.open]; return [{ o: op.o, pre: op.pre || 0, g: 0 }];
}
const pitLoops = () => S.open === "custom" ? S.pitShapes.flatMap(shapeLoops) : [OPENINGS[S.wf][S.open].o];
// the shapes the pit editor shows: the user's list, or the chosen example as one polygon
const presetShape = () => { const op = OPENINGS[S.wf][S.open]; return shp("pts", "open", 0, 0, 0, 0, 0, { pts: op.o.map(p => p.slice()), pre: op.pre || 0 }); };
const pitShapesNow = () => S.open === "custom" ? S.pitShapes : [presetShape()];
// largest distance of an outline O outside the union of convex openings os
function beyondAll(O, os) {
  let under = 0;
  for (const p of O) { let s = Infinity; for (const o of os) s = Math.min(s, beyondEdge([p], o)); under = Math.max(under, s); }
  return under;
}
// 3D: part of convex polygon P outside the convex cavity H (list of {n, b}, inside = n.x <= b), as convex pieces
function clip3(P, n, b) {   // keep n.x <= b
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length], fp = C.dot(n, p) - b, fq = C.dot(n, q) - b;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const u = fp/(fp - fq); out.push([p[0] + u*(q[0] - p[0]), p[1] + u*(q[1] - p[1]), p[2] + u*(q[2] - p[2])]); }
  }
  return out;
}
function minusCavity(P, H, eps) {   // eps > 0: a polygon lying on the cavity's surface is kept; eps < 0: it is removed
  const out = []; let Rm = P;
  for (const h of H) {
    const o = clip3(Rm, C.mul(h.n, -1), -(h.b - eps));   // n.x >= b - eps: outside this plane
    if (o.length >= 3) out.push(o);
    Rm = clip3(Rm, h.n, h.b - eps);
    if (Rm.length < 3) return out;
  }
  return out;   // the rest is inside the cavity: dropped
}
const inCavity = (q, H, eps) => H.every(h => C.dot(h.n, q) <= h.b + eps);
// walls of every cavity minus the inside of the other cavities. Where two cavities share a plane (a common floor), the
// earlier cavity keeps it. An edge is drawn unless the face just across it lies in the same plane (a seam inside one flat face).
function unionWalls(cavs, keep, eps) {
  const faces = [];
  const bb = V => { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const v of V) for (let i = 0; i < 3; i++) { b[i] = Math.min(b[i], v[i]); b[i + 3] = Math.max(b[i + 3], v[i]); } return b; };
  const meet = (a, b) => [0, 1, 2].every(i => a[i] <= b[i + 3] + 10*eps && b[i] <= a[i + 3] + 10*eps);
  const cb = cavs.map(c => bb(c.verts));
  cavs.forEach((cav, k) => {
    for (const f of cav.faces) {
      if (!keep(f)) continue;
      let parts = [f.poly];
      const fb = bb(f.poly);
      cavs.forEach((o, j) => { if (j !== k && o.faces.length && meet(fb, cb[j])) parts = parts.flatMap(P => minusCavity(P, o.H, j < k ? -eps : eps)); });
      for (const P of parts) faces.push(Object.assign({}, f, { poly: P, cav: k }));
    }
  });
  const onFace = (q, F) => {
    if (Math.abs(C.dot(F.n, q) - F.b) > 10*eps) return false;
    const P = F.poly; let A = [0, 0, 0];
    for (let i = 0; i < P.length; i++) A = C.add(A, C.cross(P[i], P[(i + 1) % P.length]));
    const sg = C.dot(A, F.n) >= 0 ? 1 : -1;
    return P.every((a, i) => sg*C.dot(C.cross(C.sub(P[(i + 1) % P.length], a), C.sub(q, a)), F.n) >= -eps*C.norm(C.sub(P[(i + 1) % P.length], a)));
  };
  const byPlane = new Map(), pk = F => F.n.map(v => Math.round(v*1e6)).join(",") + "|" + Math.round(F.b/(1e3*eps));
  for (const F of faces) { const k = pk(F); if (!byPlane.has(k)) byPlane.set(k, []); byPlane.get(k).push(F); }
  const edges = [];
  for (const F of faces) {
    const same = byPlane.get(pk(F));
    const P = F.poly, c = C.mul(P.reduce(C.add, [0, 0, 0]), 1/P.length);
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length], ab = C.sub(b, a), L = C.norm(ab);
      if (L < 10*eps) continue;
      const m = C.mul(C.add(a, b), 0.5);
      let d = C.cross(F.n, C.mul(ab, 1/L)); if (C.dot(d, C.sub(m, c)) < 0) d = C.mul(d, -1);   // in-plane, pointing out of this piece
      const q = C.add(m, C.mul(d, Math.max(20*eps, 1e-3*L)));
      if (same.length < 2 || !same.some(G => G !== F && onFace(q, G))) edges.push([a, b]);
    }
  }
  // each shared crease is found from both sides: keep one copy
  const seen = new Set(), key = p => p.map(v => Math.round(v/(100*eps))).join(","), out = [];
  for (const [a, b] of edges) { const k1 = key(a) + "|" + key(b), k2 = key(b) + "|" + key(a); if (seen.has(k1) || seen.has(k2)) continue; seen.add(k1); out.push([a, b]); }
  return { faces, edges: out };
}
// 2D: edges of convex polygons minus the inside of the other polygons (for section outlines)
function unionEdges2(polys, eps) {
  const Ps = polys.map(ccw), out = [];
  const inside = (q, P) => P.every((a, i) => { const b = P[(i + 1) % P.length]; return (b[0] - a[0])*(q[1] - a[1]) - (b[1] - a[1])*(q[0] - a[0]) > eps*Math.hypot(b[0] - a[0], b[1] - a[1]); });
  Ps.forEach((P, k) => P.forEach((a, i) => {
    const b = P[(i + 1) % P.length], ns = 24;
    for (let s = 0; s < ns; s++) {
      const p = [a[0] + (b[0] - a[0])*s/ns, a[1] + (b[1] - a[1])*s/ns], q = [a[0] + (b[0] - a[0])*(s + 1)/ns, a[1] + (b[1] - a[1])*(s + 1)/ns];
      const m = [(p[0] + q[0])/2, (p[1] + q[1])/2];
      if (!Ps.some((O, j) => j !== k && inside(m, O))) out.push([p, q]);
    }
  }));
  return out;
}
// largest distance of an outline O outside the (convex) mask opening o
function beyondEdge(O, o) {
  const M = ccw(o); let under = 0;
  for (const p of O) {
    let s = -Infinity;
    for (let i = 0; i < M.length; i++) {
      const a = M[i], b = M[(i + 1) % M.length], ex = b[0] - a[0], ey = b[1] - a[1], L = Math.hypot(ex, ey);
      s = Math.max(s, (ey*(p[0] - a[0]) - ex*(p[1] - a[1]))/L);
    }
    under = Math.max(under, s);
  }
  return under;
}
// analytic etch of one convex opening in the pit; S.rot = flat error (the crystal turned by S.rot relative to the flat)
const pe = (o, opts) => C.etch(S.wf, o, Object.assign({ rot: S.rot || 0 }, opts));
function prepPit() {
  const items = pitItems(), R = RATES[S.rate].r;
  if (!items.length) {   // empty mask: plain wafer
    pit = { items, R, fins: [], tmax: 100, box: [-250, 250, -250, 250], zb: 100, dmax: 1, hist: null };
    document.getElementById("tMax").textContent = "100 min"; document.getElementById("pcWarn").classList.add("hidden"); return;
  }
  const nice = x => { const p = Math.pow(10, Math.floor(Math.log10(x))); for (const k of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k*p >= x) return k*p; return 10*p; };
  const fins = items.map(it => pe(it.o, { T: T_WAFER, pre: it.pre }));
  let hiAll = 1;
  items.forEach((it, k) => {   // time at which the cavity reaches 98 % of its long-etch volume
    const vf = C.volume(fins[k]), V = t => C.volume(pe(it.o, { t, T: T_WAFER, pre: it.pre, rates: R }));
    let lo = 0, hi = 50;
    while (V(hi) < 0.98*vf && hi < 1e5) hi *= 2;
    for (let i = 0; i < 30; i++) { const m = (lo + hi)/2; if (V(m) < 0.98*vf) lo = m; else hi = m; }
    hiAll = Math.max(hiAll, hi);
  });
  const tmax = nice(1.15*hiAll);
  const lasts = items.map(it => pe(it.o, { t: tmax, T: T_WAFER, pre: it.pre, rates: R }));
  let ext = [Infinity, -Infinity, Infinity, -Infinity];
  const grow = P => { for (const p of P) { ext[0] = Math.min(ext[0], p[0]); ext[1] = Math.max(ext[1], p[0]); ext[2] = Math.min(ext[2], p[1]); ext[3] = Math.max(ext[3], p[1]); } };
  items.forEach((it, k) => { grow(C.outline(fins[k].H)); grow(C.outline(lasts[k].H)); grow(it.o); });
  const span = Math.max(ext[1] - ext[0], ext[3] - ext[2]), m = 0.18*span + 10;
  const box = [ext[0] - m, ext[1] + m, ext[2] - m, ext[3] + m];
  const dmax = Math.max(...fins.map(C.depth), ...lasts.map(C.depth));
  const zb = dmax > 0.75*T_WAFER ? T_WAFER : Math.min(T_WAFER, Math.ceil(1.3*dmax/10)*10);
  // history: depth and largest distance beyond the mask edge against time
  const hist = { t: [], depth: [], under: [] }, nh = 40;
  for (let i = 0; i <= nh; i++) {
    const t = tmax*i/nh; let d = 0, u = 0;
    items.forEach(it => { const c = pe(it.o, { t, T: T_WAFER, pre: it.pre, rates: R }); d = Math.max(d, C.depth(c)); const O = C.outline(c.H, 0); if (O.length) u = Math.max(u, beyondAll(O, items.filter(o => o.g === it.g).map(o => o.o))); });
    hist.t.push(t); hist.depth.push(d); hist.under.push(u);
  }
  pit = { items, R, fins, tmax, box, zb, dmax: Math.max(1, Math.min(zb, dmax)), hist };
  document.getElementById("tMax").textContent = `${tmax.toFixed(0)} min`;
  // overlapping cavities are not merged by this model
  const outs = lasts.map(c => C.outline(c.H, 0)), ov = [];
  for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) {
    if (items[i].g === items[j].g) continue;   // pieces of one opening are meant to merge
    let P = outs[i]; const Q = ccw(outs[j]);
    for (let k = 0; k < Q.length && P.length; k++) { const a = Q[k], b = Q[(k + 1) % Q.length], n = [b[1] - a[1], -(b[0] - a[0])]; P = C.clip2(P, n, n[0]*a[0] + n[1]*a[1]); }
    const pair = `${items[i].g + 1} and ${items[j].g + 1}`;
    if (P.length >= 3 && !ov.includes(pair)) ov.push(pair);
  }
  const w = document.getElementById("pcWarn");
  w.classList.toggle("hidden", !ov.length);
  w.textContent = ov.length ? `Openings ${ov.join(", ")} grow into each other before ${tmax.toFixed(0)} min. Here their cavities are simply overlaid: the mask strip between them is not undercut. Use “Open in etch simulator” for the real merge.` : "";
}

// rectangle (or any rectangle in a plane) minus polygons, painted on a canvas texture: robust for many and overlapping holes
function holeTexture(x0, x1, y0, y1, holes, color) {
  const W = x1 - x0, H = y1 - y0, s = Math.min(6, 1600/Math.max(W, H));
  const cv = document.createElement("canvas"); cv.width = Math.max(2, Math.round(W*s)); cv.height = Math.max(2, Math.round(H*s));
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#" + color.getHexString(); ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.setTransform(s, 0, 0, -s, -x0*s, y1*s); ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  for (const P of holes) { if (P.length < 3) continue; P.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); }
  ctx.fill();
  const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; return t;
}
function holePlane(x0, x1, y0, y1, holes, color, place, opts: Record<string, any> = {}) {
  const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0); geo.translate((x0 + x1)/2, (y0 + y1)/2, 0);
  const mat = new THREE.MeshBasicMaterial(Object.assign({ map: holeTexture(x0, x1, y0, y1, holes, color), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }, opts));
  const m = new THREE.Mesh(geo, mat); place(m); return m;
}
function meshFromPolysV(polys, vcol, matOpts) {   // per-vertex colours: vcol(point, polyIndex) -> THREE.Color
  const pos = [], col = [], tri2poly = [];
  polys.forEach((P, k) => {
    for (let i = 1; i + 1 < P.length; i++) {
      for (const q of [P[0], P[i], P[i + 1]]) { const c = vcol(q, k); pos.push(q[0], q[1], q[2]); col.push(c.r, c.g, c.b); }
      tri2poly.push(k);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, matOpts || {})));
  m.userData.tri2poly = tri2poly; return m;
}

// mask film, drawn at its true thickness (µm). A SiO₂ film thins at the oxide etch rate of the etchant.
var MASKMAT = {
  sio2: { name: "thermal SiO₂", t0: 1, src: "1 µm: a design choice inside the 1–2 µm thermal oxide of Pal & Sato p. 348" },
  si3n4: { name: "LPCVD Si₃N₄", t0: 0.15, src: "0.15 µm: the upper end of the 100–150 nm nitride of Pal & Sato p. 54 (a LOCOS layer there; using it as the KOH mask is an assumption)" },
};
const MASK_SEL = 150;   // Si : SiO₂ etch selectivity in KOH, "about 150 under normal etching conditions" (Pal & Sato p. 83)
function maskOxRate(simKey: string): { r: number | null; src: string; est?: boolean } {   // µm/min
  const e = SRATES[simKey]; if (!e) return { r: null, src: "SiO₂ etch rate not in the course files" };
  if (e.sio2 != null) return { r: e.sio2, src: e.sio2src || "" };
  if (/KOH/.test(e.name) && e.r["100"]) return { r: e.r["100"]/MASK_SEL, src: `estimate R(100)/${MASK_SEL}, from the Si : SiO₂ selectivity of about ${MASK_SEL} (Pal & Sato p. 83)`, est: true };
  return { r: null, src: "SiO₂ etch rate not in the course files" };
}
function maskFilm(simKey: string, tMin: number, final = false) {
  const t0 = Math.max(0, Number(S.maskT0) || 0);
  if (S.maskMat === "si3n4") return { t0, left: t0, r: null as number | null, gone: false, tGone: null as number | null, src: "Si₃N₄ etch rate in KOH and EDP not in the course files: drawn without loss (assumption)", est: false };
  const o = maskOxRate(simKey), tGone = o.r ? t0/o.r : null;
  const left = o.r == null || final ? t0 : Math.max(0, t0 - o.r*tMin);
  return { t0, left, r: o.r, gone: !final && o.r != null && left <= 0, tGone, src: o.src, est: !!o.est };
}
function maskFilmText(mf, tMin: number, final = false) {   // one readout line
  const nm = MASKMAT[S.maskMat].name, f = (v: number) => v.toFixed(v < 0.1 ? 3 : 2);
  if (final) return `${nm} ${f(mf.t0)} µm (loss not shown at the long-etch limit${mf.tGone != null ? `; used up after ${mf.tGone.toFixed(0)} min` : ""})`;
  if (mf.r == null) return `${nm} ${f(mf.t0)} µm; ${mf.src}`;
  if (mf.gone) return `<b>used up after ${mf.tGone.toFixed(0)} min</b> (${nm} ${f(mf.t0)} µm at ${(mf.r*60).toPrecision(2)} µm/h; ${mf.src}). From then on a real wafer etches everywhere; this model keeps the mask.`;
  return `${nm}: ${f(mf.left)} of ${f(mf.t0)} µm left after ${tMin.toFixed(0)} min (${(mf.r*60).toPrecision(2)} µm/h, ${mf.src})`;
}
const pitFilm = () => maskFilm(PIT2SIM[S.rate] || S.rate, S.t, S.final);
// side faces of the mask film along the opening edges: only where one side of the edge is open and the other is masked
function maskRim(loops, isOpenAt, tm, clip, box) {
  const pos = [], col = [], ln = [], dark = COL.mask.clone().multiplyScalar(0.62);
  for (const P of loops) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    const nx = (b[1] - a[1])/L, ny = -(b[0] - a[0])/L, ns = Math.max(1, Math.ceil(L/4)), d = 0.4;
    for (let k = 0; k < ns; k++) {
      const p = [a[0] + (b[0] - a[0])*k/ns, a[1] + (b[1] - a[1])*k/ns], q = [a[0] + (b[0] - a[0])*(k + 1)/ns, a[1] + (b[1] - a[1])*(k + 1)/ns];
      const m = [(p[0] + q[0])/2, (p[1] + q[1])/2];
      if (box && (m[0] < box[0] || m[0] > box[1] || m[1] < box[2] || m[1] > box[3])) continue;
      if (isOpenAt(m[0] + d*nx, m[1] + d*ny) === isOpenAt(m[0] - d*nx, m[1] - d*ny)) continue;
      for (const v of [[p, 0], [q, 0], [q, tm], [p, 0], [q, tm], [p, tm]]) { pos.push(v[0][0], v[0][1], v[1]); col.push(dark.r, dark.g, dark.b); }
      ln.push(p[0], p[1], tm, q[0], q[1], tm);
    }
  }
  const grp = new THREE.Group();
  const gq = new THREE.BufferGeometry(); gq.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); gq.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  grp.add(new THREE.Mesh(gq, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, clippingPlanes: clip || null })));
  const gl = new THREE.BufferGeometry(); gl.setAttribute("position", new THREE.Float32BufferAttribute(ln, 3));
  grp.add(new THREE.LineSegments(gl, new THREE.LineBasicMaterial({ color: COL["s-ink"], clippingPlanes: clip || null })));
  return grp;
}
function buildPit() {
  scene = new THREE.Scene(); scene.background = COL["scene-bg"]; clearLabels();
  const { items, R, fins, box, zb } = pit;
  const t = S.t;
  const cavs = items.map((it, k) => S.final ? fins[k] : pe(it.o, { t, T: T_WAFER, pre: it.pre, rates: R }));
  pit.cavs = cavs;
  const [x0, x1, y0, y1b] = box, yA = S.cut ? 0 : y0, yB = y1b;
  const cx = (x0 + x1)/2, cy = (y0 + y1b)/2;
  radius = 0.5*Math.hypot(x1 - x0, y1b - y0, zb)*0.92;
  const clip = S.cut ? PL_CUT : null;
  const g = new THREE.Group(); scene.add(g);
  pit.pick = [];
  const rmax = Math.max(...(Object.values(R) as number[])), mode = S.pitColor;
  // cavity walls: union of the cavities of all pieces (walls inside another piece's cavity are removed)
  const eps = 1e-6*Math.max(1, radius);
  const U = unionWalls(cavs.filter(c => c.faces.length), f => S.block ? !(f.label === "surface" || f.label === "back") : true, eps);
  pit.walls = U.faces;
  {
    const walls = U.faces;
    const nOf = f => S.block ? C.mul(f.n, -1) : f.n, other = f => f.fam === "surface" || f.fam === "back";
    let mesh;
    if (mode === "plane") {
      const cols = walls.map(f => shadeColor(other(f) ? COL["s-top"] : famColor(f.fam), nOf(f)));
      mesh = meshFromPolys(walls.map(f => f.poly), cols, { clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    } else {
      const rateOf = f => S.final ? R["111"] : (R[f.fam] == null ? 0 : R[f.fam]);
      mesh = meshFromPolysV(walls.map(f => f.poly), (q, k) => {
        const f = walls[k]; if (other(f)) return shadeColor(COL["s-top"], nOf(f));
        return shadeColor(cmap(mode === "depth" ? -q[2]/pit.dmax : rateOf(f)/rmax), nOf(f));
      }, { clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    }
    if (walls.length) { mesh.userData.faces = walls; g.add(mesh); pit.pick.push(mesh); }
    if (U.edges.length) g.add(linesFromLoops(U.edges, COL["s-ink"], { clip }));
  }
  if (mode === "depth") showCbar("depth below the surface", 0, pit.dmax, "µm");
  else if (mode === "rate") showCbar(S.final ? "etch rate (long-etch limit: {111} only)" : "etch rate of the wall plane", 0, rmax, "µm/min");
  else hideCbar();
  // silicon block
  if (S.block) {
    const outs = cavs.map(c => C.outline(c.H, 0)).filter(O => O.length >= 3);
    const top = holePlane(x0, x1, yA, yB, outs, COL["s-top"], m => { m.position.z = 0; });
    top.userData.block = true; g.add(top); pit.pick.push(top);
    const polys = [], cols = [];
    const sides = [[[x1, yA], [x1, yB], [1, 0, 0]], [[x0, yB], [x0, yA], [-1, 0, 0]], [[x1, yB], [x0, yB], [0, 1, 0]]];
    if (!S.cut) sides.push([[x0, yA], [x1, yA], [0, -1, 0]]);
    for (const [a, b, n] of sides) { polys.push([[a[0], a[1], 0], [b[0], b[1], 0], [b[0], b[1], -zb], [a[0], a[1], -zb]]); cols.push(shadeColor(COL["s-side"], n)); }
    const blk = meshFromPolys(polys, cols, { polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    blk.userData.block = true; g.add(blk); pit.pick.push(blk);
    const outsB = zb >= T_WAFER ? cavs.map(c => C.outline(c.H, -zb + 1e-6)).filter(O => O.length >= 3) : [];
    const bot = holePlane(x0, x1, yA, yB, outsB, COL["s-side"], m => { m.position.z = -zb; });
    bot.userData.block = true; g.add(bot); pit.pick.push(bot);
    if (S.cut) {
      const secs = cavs.map(c => C.vsectionY(c.H, 0)).filter(P => P.length >= 3);
      const cutp = holePlane(x0, x1, -zb, 0, secs, COL["s-cut"], m => { m.rotation.x = Math.PI/2; });   // (x, z) plane at y = 0
      cutp.userData.block = true; g.add(cutp); pit.pick.push(cutp);
      if (secs.length) g.add(linesFromLoops(unionEdges2(secs, 1e-6).map(([a, b]) => [[a[0], -0.002*zb, a[1]], [b[0], -0.002*zb, b[1]]]), COL["s-ink"]));
    }
    const yl = yB;
    g.add(linesFromLoops([[[x0, yA, 0], [x1, yA, 0], [x1, yl, 0], [x0, yl, 0]], [[x0, yA, -zb], [x1, yA, -zb], [x1, yl, -zb], [x0, yl, -zb]]], COL["s-ink"], { opacity: 0.6 }));
    g.add(linesFromLoops([[[x0, yA, 0], [x0, yA, -zb]], [[x1, yA, 0], [x1, yA, -zb]], [[x0, yl, 0], [x0, yl, -zb]], [[x1, yl, 0], [x1, yl, -zb]]], COL["s-ink"], { opacity: 0.6 }));
    if (zb < T_WAFER) addLabel(new V3(x1, yA, -zb), `depth shown: ${zb.toFixed(0)} µm`, "", camDir => camDir.z > -0.2);
    // mask
    if (S.mask) {   // mask film on top of the silicon at its true thickness; it overhangs where the silicon is undercut
      const mf = pitFilm(), tm = mf.left, opens = items.map(it => it.o);
      const mm = holePlane(x0, x1, yA, yB, opens, COL.mask, m => { m.position.z = tm; }, { opacity: mf.gone ? 0.3 : 0.88, alphaTest: 0.01, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
      mm.renderOrder = 5; mm.userData.noPick = true; g.add(mm);   // its openings are transparent pixels: measure through it
      const os = opens.map(o => ({ pts: o, op: "open" })), inOpen = (x, y) => EE.isOpen(os, x, y);
      g.add(maskRim(pitLoops(), inOpen, tm, clip, [x0, x1, yA, yB]));
    }
  }
  // mask opening outlines
  g.add(linesFromLoops(pitLoops().map(P => P.map(p => [p[0], p[1], (S.mask && S.block ? pitFilm().left : 0) + 0.004*zb])), COL.mask, S.mask && S.block ? { clip } : { clip, dashed: true, dash: radius*0.03, gap: radius*0.02 }));
  // ghost: final {111} shape
  if (S.ghost && !S.final) { const gh = linesFromLoops(unionWalls(fins.filter(c => c.faces.length), f => f.label !== "surface", eps).edges, COL.ghost, { clip, opacity: 0.55 }); gh.material.depthTest = false; gh.renderOrder = 8; g.add(gh); }
  // axes labels on the top surface
  const e = C.FRAME_IDX[S.wf];
  const zArr = (S.mask && S.block ? pitFilm().left : 0) + 0.004*zb;
  if (SET.arrAlong !== false) {   // the two flat arrows can be hidden (Show > flat arrows)
    g.add(topArrow(new V3(1, 0, 0), new V3(x0, yA, zArr), (x1 - x0)*0.25, radius*0.06, radius*0.035));
    addLabel(new V3(x0 + (x1 - x0)*0.3, yA - radius*0.04, 0), idxHTML(e[0], "[", "]") + " along flat", "acc");
  }
  // perpendicular to the flat, pointing outward (wafer -y, away from the centre), from the flat-side edge
  if (SET.arrPerp !== false) {
    g.add(topArrow(new V3(0, -1, 0), new V3(x0 + (x1 - x0)*0.5, yA, zArr), radius*0.35, radius*0.06, radius*0.035));
    addLabel(new V3(x0 + (x1 - x0)*0.5 + radius*0.04, yA - radius*0.42, 0), idxHTML(negIdx(e[1]), "[", "]") + " ⊥ flat, outward", "acc");
  }
  scene.userData.center = new V3(cx, cy, -zb/2); scene.userData.die = scene.userData.center.clone();
  frameR = S.waferOn ? 0.53*WAFER.D : 0;
  if (S.waferOn) { g.add(waferGroup(S.wf, S.wtype, -S.dieX*1000, -S.dieY*1000, { hole: [x0, x1, y0, y1b], clip, flatLabel: idxHTML(e[0], "[", "]"), normalLabel: idxHTML(negIdx(e[1]), "[", "]") })); scene.userData.center = new V3(-S.dieX*1000, -S.dieY*1000, 0); }
  updateReadout(cavs);
  drawPitGraph(); drawPitEditor();
  resize();
}
function drawPitGraph() {
  if (!pit || !pit.hist) return;
  const h = pit.hist, tv = S.final ? null : S.t;
  const series = [{ name: "depth", color: "#" + COL.accent.getHexString(), x: h.t, y: h.depth },
                  { name: "beyond the mask edge (undercut)", color: "#" + COL.ghost.getHexString(), x: h.t, y: h.under }];
  const vals = drawGraph($("pitGraph"), series, { xmax: pit.tmax, tv });
  graphLegend($("pitGraphLeg"), series, vals, tv);
}

const polyArea3 = P => { let A = [0, 0, 0]; for (let i = 0; i < P.length; i++) A = C.add(A, C.cross(P[i], P[(i + 1) % P.length])); return 0.5*C.norm(A); };
function updateReadout(cavs) {
  let d = 0, under = 0, xs = [], ys = [], floors = 0, through = false;
  cavs.forEach((cav, k) => {
    d = Math.max(d, C.depth(cav));
    const O = C.outline(cav.H, 0);
    for (const p of O) { xs.push(p[0]); ys.push(p[1]); }
    if (O.length) under = Math.max(under, beyondAll(O, pit.items.filter(o => o.g === pit.items[k].g).map(o => o.o)));
    if (cav.faces.find(f => f.label !== "surface" && f.n[2] < -1 + 1e-9 && f.label !== "back")) floors++;
    if (cav.faces.some(f => f.label === "back")) through = true;
  });
  const ng = new Set(pit.items.map(it => it.g)).size, nf = (pit.walls || []).filter(f => f.label !== "surface" && f.label !== "back" && f.n[2] < -1 + 1e-9);
  const floor = cavs.length === 1 ? cavs[0].faces.find(f => f.label !== "surface" && f.n[2] < -1 + 1e-9 && f.label !== "back") : null;
  const rows = [
    ["time", S.final ? "long-etch limit" : `${S.t.toFixed(S.t < 10 ? 1 : 0)} min`],
    ["openings", ng > 1 || cavs.length > 1 ? `${ng}${cavs.length > ng ? ` (${cavs.length} convex pieces)` : ""}` : "1"],
    ["depth", d > 0 ? um(d) : "-"],
    ["outline along flat", xs.length ? um(Math.max(...xs) - Math.min(...xs)) : "-"],
    ["outline across flat", ys.length ? um(Math.max(...ys) - Math.min(...ys)) : "-"],
    ["beyond mask edge", xs.length ? um(Math.max(0, under)) : "-"],
    ["flat floor", through ? "etched through" : cavs.length === 1 ? (floor ? `yes, area ${(floor.area/1e3).toFixed(1)}×10³ µm²` : "no (walls meet)") : (nf.length ? `yes, area ${(nf.reduce((a, f) => a + polyArea3(f.poly), 0)/1e3).toFixed(1)}×10³ µm² (all pieces)` : "no (walls meet)")],
  ];
  if (cavs.length === 1) rows.splice(1, 1);
  if (S.mask) rows.push(["mask film", maskFilmText(pitFilm(), S.t, S.final)]);
  document.getElementById("readout").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  // walls grouped by family and angle
  const groups = new Map();
  for (const f of (pit.walls || [])) {
    if (f.label === "surface" || f.label === "back") continue;
    const a = C.angleToSurface(f.n), key = `${f.fam}|${a.toFixed(2)}|${f.n[2] > 1e-9 ? "o" : ""}`;
    const g = groups.get(key) || { fam: f.fam, a, over: f.n[2] > 1e-9, n: 0, ids: new Set() };
    const id = `${f.cav}|${f.label}`; if (!g.ids.has(id)) { g.ids.add(id); g.n++; } groups.set(key, g);   // a wall cut into parts counts once
  }
  const arr = [...groups.values()].sort((p, q) => (Number(p.fam > q.fam) - Number(p.fam < q.fam)) || p.a - q.a);
  const sw = f => `<span class="sw" style="background:${"#" + famColor(f).getHexString()}"></span>`;
  document.getElementById("walls").innerHTML = arr.length ? arr.map(g => `<tr><td>${sw(g.fam)}${famHTML(g.fam)}</td><td class="num">${g.a < 1e-6 ? "floor" : fmtA(g.a) + (g.over ? " ovh." : "")}</td><td class="num">× ${g.n}</td></tr>`).join("") : `<tr><td>no pit yet</td></tr>`;
}

