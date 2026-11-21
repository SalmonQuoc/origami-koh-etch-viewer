// ---- polygon tools for drawn outlines
const polyArea = P => { let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0]*q[1] - q[0]*p[1]; } return a/2; };
function polyCentroid(P) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], c = p[0]*q[1] - q[0]*p[1]; a += c; cx += (p[0] + q[0])*c; cy += (p[1] + q[1])*c; }
  return Math.abs(a) < 1e-12 ? [P.reduce((u, p) => u + p[0], 0)/P.length, P.reduce((u, p) => u + p[1], 0)/P.length] : [cx/(3*a), cy/(3*a)];
}
function selfCrosses(P) {   // true if two non-adjacent edges cross
  const n = P.length, cr = (a, b, c) => (b[0] - a[0])*(c[1] - a[1]) - (b[1] - a[1])*(c[0] - a[0]);
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
    if (i === 0 && j === n - 1) continue;
    const a = P[i], b = P[(i + 1) % n], c = P[j], d = P[(j + 1) % n];
    if (cr(a, b, c)*cr(a, b, d) < 0 && cr(c, d, a)*cr(c, d, b) < 0) return true;
  }
  return false;
}
function simplifyRDP(P, tol) {   // Ramer-Douglas-Peucker on an open polyline
  if (P.length < 3) return P.slice();
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const st = [[0, P.length - 1]];
  while (st.length) {
    const [i0, i1] = st.pop(), a = P[i0], b = P[i1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let dm = -1, im = -1;
    for (let i = i0 + 1; i < i1; i++) {   // distance to the chord; to the end point when the chord closes on itself
      const p = P[i], d = L > 1e-9 ? Math.abs((b[0] - a[0])*(a[1] - p[1]) - (a[0] - p[0])*(b[1] - a[1]))/L : Math.hypot(p[0] - a[0], p[1] - a[1]);
      if (d > dm) { dm = d; im = i; }
    }
    if (dm > tol) { keep[im] = 1; st.push([i0, im], [im, i1]); }
  }
  return P.filter((_, i) => keep[i]);
}
// convex pieces of a simple polygon: ear-clipping triangulation, then Hertel-Mehlhorn merging of neighbours
function convexPieces(P0) {
  let P = P0.map(p => p.slice()); if (P.length < 3) return [P];
  if (polyArea(P) < 0) P.reverse();
  const sc = Math.max(...P.map(p => Math.abs(p[0]) + Math.abs(p[1])), 1), eps = 1e-10*sc*sc;
  const cr = (a, b, c) => (b[0] - a[0])*(c[1] - a[1]) - (b[1] - a[1])*(c[0] - a[0]);
  const inTri = (p, a, b, c) => cr(a, b, p) > eps && cr(b, c, p) > eps && cr(c, a, p) > eps;
  const idx = P.map((_, i) => i), tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 20000) {
    let cut = -1;
    for (let i = 0; i < idx.length && cut < 0; i++) {
      const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
      if (cr(P[ia], P[ib], P[ic]) <= eps) continue;
      if (idx.some(j => j !== ia && j !== ib && j !== ic && inTri(P[j], P[ia], P[ib], P[ic]))) continue;
      tris.push([ia, ib, ic]); cut = i;
    }
    if (cut < 0) {   // no ear (degenerate input): drop the flattest vertex
      let best = 0, bv = Infinity;
      for (let i = 0; i < idx.length; i++) { const v = Math.abs(cr(P[idx[(i + idx.length - 1) % idx.length]], P[idx[i]], P[idx[(i + 1) % idx.length]])); if (v < bv) { bv = v; best = i; } }
      cut = best;
    }
    idx.splice(cut, 1);
  }
  if (idx.length === 3 && Math.abs(cr(P[idx[0]], P[idx[1]], P[idx[2]])) > eps) tris.push(idx.slice());
  if (!tris.length) return [hull2(P)];
  const convex = Q => { for (let i = 0; i < Q.length; i++) if (cr(P[Q[i]], P[Q[(i + 1) % Q.length]], P[Q[(i + 2) % Q.length]]) < -eps) return false; return true; };
  const merge = (A, B) => {   // A and B share the edge (u, v) in A and (v, u) in B
    for (let i = 0; i < A.length; i++) {
      const u = A[i], v = A[(i + 1) % A.length], j = B.indexOf(v);
      if (j < 0 || B[(j + 1) % B.length] !== u) continue;
      const a = [], b = [];
      for (let k = 0; k < A.length; k++) a.push(A[(i + 1 + k) % A.length]);   // v ... u
      for (let k = 2; k < B.length; k++) b.push(B[(j + k) % B.length]);       // after u ... before v
      const M = a.concat(b); return convex(M) ? M : null;
    }
    return null;
  };
  const pieces = tris.map(t => t.slice());
  for (let again = true; again;) {
    again = false;
    for (let a = 0; a < pieces.length && !again; a++) for (let b = a + 1; b < pieces.length && !again; b++) {
      const m = merge(pieces[a], pieces[b]); if (m) { pieces[a] = m; pieces.splice(b, 1); again = true; }
    }
  }
  return pieces.map(Q => Q.map(i => P[i].slice()));
}
// the shape as overlapping convex pieces that cover it, for the Etched pit scene. Pieces overlap so that no point of the
// opening lies only on a seam between two pieces (a seam would leave a false silicon ridge between their cavities).
function basePieces(s) {
  const w = s.w, h = s.h, t = Math.max(1, s.t || 0), n = Math.max(3, Math.round(s.n || 3));
  const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  switch (s.type) {
    case "lshape": return [box(-w/2, -h/2, w/2, -h/2 + t), box(-w/2, -h/2, -w/2 + t, h/2)];
    case "ushape": return [box(-w/2, -h/2, w/2, -h/2 + t), box(-w/2, -h/2, -w/2 + t, h/2), box(w/2 - t, -h/2, w/2, h/2)];
    case "cross": { const a = t/2; return [box(-w/2, -a, w/2, a), box(-a, -h/2, a, h/2)]; }
    case "frame": { const tx = Math.min(t, w/2), ty = Math.min(t, h/2);
      return [box(-w/2, -h/2, w/2, -h/2 + ty), box(-w/2, h/2 - ty, w/2, h/2), box(-w/2, -h/2, -w/2 + tx, h/2), box(w/2 - tx, -h/2, w/2, h/2)]; }
    case "ring": { const m = 24, ro = w/2, ri = Math.min(t, w - 2)/2, O = ngon(ro, m), I = ngon(ri, m);   // each piece spans two of m sectors
      return Array.from({ length: m }, (_, i) => [I[i], O[i], O[(i + 1) % m], O[(i + 2) % m], I[(i + 2) % m]]); }
    case "star": { const P = basePts(s), inner = P.filter((_, i) => i % 2);   // centre polygon + one kite per point
      return [inner, ...Array.from({ length: n }, (_, i) => [[0, 0], P[(2*i - 1 + 2*n) % (2*n)], P[2*i], P[2*i + 1]])]; }
    case "free": return convexPieces(basePts(s));
  }
  return [basePts(s)];
}
// the shape's outline loops (holes as separate loops), before rotation and translation: for drawing the mask edge
function baseLoops(s) {
  const w = s.w, h = s.h, t = Math.max(1, s.t || 0);
  if (s.type === "frame") { const R = (W, H) => [[-W/2, -H/2], [W/2, -H/2], [W/2, H/2], [-W/2, H/2]]; return [R(w, h), R(Math.max(1, w - 2*t), Math.max(1, h - 2*t))]; }
  if (s.type === "ring") return [ngon(w/2, 72), ngon(Math.min(t, w - 2)/2, 72)];
  return [basePts(s)];
}
// all polygons of a shape (several when it is an array), in the wafer frame (µm); base(s) gives the polygons before placement
function placePolys(s, base) {
  const c = Math.cos(s.ang/C.DEG), sn = Math.sin(s.ang/C.DEG);
  const Ps = base.map(P => P.map(([x, y]) => [x*c - y*sn, x*sn + y*c]));
  const nx = Math.max(1, Math.round(s.nx || 1)), ny = Math.max(1, Math.round(s.ny || 1)), px = s.px || 0, py = s.py || 0, out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ox = s.cx + (i - (nx - 1)/2)*px, oy = s.cy + (j - (ny - 1)/2)*py;
    for (const P of Ps) out.push(P.map(([x, y]) => [ox + x, oy + y]));
  }
  return out;
}
const shapePieces = s => s.type === "para" || s.type === "pts" ? shapePolys(s).map(hull2) : placePolys(s, basePieces(s));
const shapeLoops = s => s.type === "para" || s.type === "pts" ? shapePolys(s) : placePolys(s, baseLoops(s));
function shapePolys(s) {
  let P;
  if (s.type === "para") {   // parallelogram: side w along angle a1 (deg), side h along angle a2, relative to the flat
    const u = [Math.cos(s.a1/C.DEG), Math.sin(s.a1/C.DEG)], v = [Math.cos(s.a2/C.DEG), Math.sin(s.a2/C.DEG)];
    P = [[-1,-1],[1,-1],[1,1],[-1,1]].map(([p, q]) => [p*s.w/2*u[0] + q*s.h/2*v[0], p*s.w/2*u[1] + q*s.h/2*v[1]]);
  } else {
    const c = Math.cos(s.ang/C.DEG), sn = Math.sin(s.ang/C.DEG);
    P = basePts(s).map(([x, y]) => [x*c - y*sn, x*sn + y*c]);
  }
  const nx = Math.max(1, Math.round(s.nx || 1)), ny = Math.max(1, Math.round(s.ny || 1)), px = s.px || 0, py = s.py || 0, out = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const ox = s.cx + (i - (nx - 1)/2)*px, oy = s.cy + (j - (ny - 1)/2)*py;
    out.push(P.map(([x, y]) => [ox + x, oy + y]));
  }
  return out;
}
function shapePts(s) { return shapePolys(s)[0]; }
const engineShape = s => { const polys = shapePolys(s); return { pts: polys[0], polys, op: s.op }; };
function hull2(pts) {   // convex hull (monotone chain), counter-clockwise
  const P = pts.map(p => p.slice()).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0])*(b[1] - o[1]) - (a[1] - o[1])*(b[0] - o[0]), lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-9) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 1e-9) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
const isConvexType = t => ["rect", "circle", "ellipse", "tri", "poly", "para"].includes(t);
// presets: wafer frame key, shapes, domain half-sizes, etchant, time, pre-etch, note
const SPRESETS = loadSimExamples(readDb("sim-examples"));   // data/sim-examples.json

const SIM: SimState = { rot: 0, probes: null, color: "plane", hist: null, fk: "100", rate: "PAL30", t: 60, thick: T_WAFER_SIM, pre: 0, quality: "normal", hx: 200, hy: 130, shapes: [], preset: 0,
              tv: 0, tSim: 0, tEnd: 0, res: null, running: false, cutOn: false, cutAxis: "y", cutPos: 0, showMask: true, sel: -1,
              grid: null, id: 0, dirty: false, playing: false, viewBusy: false, viewWant: null, worker: null };
function simFrame() { return SFR[SIM.fk]; }
// crystal components of the wafer axes with the flat error: the crystal is turned by SIM.rot about the normal
function simE() {
  const [e1, e2, e3] = SFR[SIM.fk].e, d = (SIM.rot || 0)/C.DEG, c = Math.cos(d), s = Math.sin(d);
  return [e1.map((v, i) => c*v - s*e2[i]), e1.map((v, i) => s*v + c*e2[i]), e3.slice()];
}

