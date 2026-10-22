// Geometry core: port of octa.py (Wulff-Jaccodine cavity as an intersection of half-spaces).
const Core = (() => {
  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const mul = (a, s) => [a[0]*s, a[1]*s, a[2]*s];
  const norm = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => mul(a, 1/norm(a));
  const DEG = 180/Math.PI;

  function family(fam) {
    const base = fam.split("").map(Number), out = new Map();
    const perms = [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
    for (const p of perms) for (let s = 0; s < 8; s++) {
      const v = p.map((k, i) => base[k]*((s >> i) & 1 ? -1 : 1));
      if (v.some(x => x !== 0)) out.set(v.join(","), v.map(x => x === 0 ? 0 : x));
    }
    return [...out.values()];
  }
  const s2 = Math.SQRT1_2, s3 = 1/Math.sqrt(3), s6 = 1/Math.sqrt(6);
  // e1 along the primary flat, e2 in-plane, e3 = wafer normal (up)
  const FRAMES = {
    "100": [[-s2, s2, 0], [-s2, -s2, 0], [0, 0, 1]],
    "110": [[-s2, s2, 0], [0, 0, 1], [s2, s2, 0]],
    "111": [[s2, -s2, 0], [s6, s6, -2*s6], [s3, s3, s3]],
  };
  const FRAME_IDX = { "100": [[-1,1,0],[-1,-1,0],[0,0,1]], "110": [[-1,1,0],[0,0,1],[1,1,0]], "111": [[1,-1,0],[1,1,-2],[1,1,1]] };
  const toWafer = (v, wf) => FRAMES[wf].map(e => dot(e, v));
  const toCrystal = (p, wf) => { const [e1, e2, e3] = FRAMES[wf]; return add(add(mul(e1, p[0]), mul(e2, p[1])), mul(e3, p[2])); };

  // smallest integer direction parallel to v
  function intDir(v) {
    const m = Math.max(...v.map(Math.abs));
    for (let k = 1; k <= 12; k++) {
      const w = v.map(x => x/m*k);
      if (w.every(x => Math.abs(x - Math.round(x)) < 1e-4)) {
        let r = w.map(x => Math.round(x));
        const g = r.reduce((a, b) => gcd(a, Math.abs(b)), 0) || 1;
        return r.map(x => x/g);
      }
    }
    return null;
  }
  function gcd(a, b) { return b ? gcd(b, a % b) : Math.abs(a); }

  const angleToSurface = n => Math.acos(Math.min(1, Math.abs(n[2])))*DEG;

  // ---------------------------------------------------------------- polyhedron from half-spaces A x <= b
  function solve3(a, b, c, d) {    // rows a,b,c ; rhs d
    const det = dot(a, cross(b, c));
    if (Math.abs(det) < 1e-10) return null;
    const x = [
      dot([d[0], a[1], a[2]], cross([d[1], b[1], b[2]], [d[2], c[1], c[2]])),
      dot([a[0], d[0], a[2]], cross([b[0], d[1], b[2]], [c[0], d[2], c[2]])),
      dot([a[0], a[1], d[0]], cross([b[0], b[1], d[1]], [c[0], c[1], d[2]])),
    ];
    return mul(x, 1/det);
  }

  function polyhedron(H) {   // H: [{n, b, label, fam}]
    const m = H.length;
    let scale = 1;
    for (const h of H) scale = Math.max(scale, Math.abs(h.b));
    const tol = 1e-7*scale, V = [];
    for (let i = 0; i < m; i++) for (let j = i+1; j < m; j++) {
      const cij = cross(H[i].n, H[j].n);
      if (norm(cij) < 1e-10) continue;
      for (let k = j+1; k < m; k++) {
        const v = solve3(H[i].n, H[j].n, H[k].n, [H[i].b, H[j].b, H[k].b]);
        if (!v) continue;
        let ok = true;
        for (let q = 0; q < m; q++) if (dot(H[q].n, v) > H[q].b + tol) { ok = false; break; }
        if (!ok) continue;
        if (!V.some(u => Math.abs(u[0]-v[0]) + Math.abs(u[1]-v[1]) + Math.abs(u[2]-v[2]) < 1e-6*scale)) V.push(v);
      }
    }
    const faces = [];
    if (V.length < 4) return { verts: V, faces, scale };
    for (const h of H) {
      const on = V.filter(v => Math.abs(dot(h.n, v) - h.b) < 1e-6*scale);
      if (on.length < 3) continue;
      const c = mul(on.reduce(add, [0, 0, 0]), 1/on.length);
      let u = null;
      for (const p of on) { const d = sub(p, c); if (norm(d) > 1e-9*scale) { u = unit(d); break; } }
      if (!u) continue;
      const w = cross(h.n, u);
      const P = on.map(p => [p, Math.atan2(dot(sub(p, c), w), dot(sub(p, c), u))]).sort((a, b) => a[1] - b[1]).map(t => t[0]);
      let A = [0, 0, 0];
      for (let k = 0; k < P.length; k++) A = add(A, cross(P[k], P[(k+1) % P.length]));
      const area = 0.5*Math.abs(dot(A, h.n));
      if (area < 1e-9*scale*scale) continue;
      faces.push({ n: h.n, poly: P, label: h.label, fam: h.fam, area, b: h.b });
    }
    return { verts: V, faces, scale };
  }

  function volume(P) {
    if (P.faces.length < 4) return 0;
    let v = 0;
    for (const f of P.faces) v += f.area*f.b/3;     // origin-based: sum area * (n.x0) / 3, valid for any origin
    return v;
  }
  const depth = P => P.verts.length ? -Math.min(...P.verts.map(v => v[2])) : 0;

  // 2D clip of polygon P by a.q <= b
  function clip2(P, a, b) {
    const out = [], n = P.length;
    for (let i = 0; i < n; i++) {
      const p = P[i], q = P[(i+1) % n];
      const fp = a[0]*p[0] + a[1]*p[1] - b, fq = a[0]*q[0] + a[1]*q[1] - b;
      if (fp <= 1e-12) out.push(p);
      if (fp*fq < -1e-24) { const t = fp/(fp - fq); out.push([p[0] + t*(q[0]-p[0]), p[1] + t*(q[1]-p[1])]); }
    }
    return out;
  }
  function section2d(cons, big = 1e5) {   // cons: [[a2, b]]
    let P = [[-big, -big], [big, -big], [big, big], [-big, big]];
    for (const [a, b] of cons) {
      if (Math.hypot(a[0], a[1]) < 1e-12) { if (b < -1e-9) return []; continue; }
      P = clip2(P, a, b);
      if (!P.length) break;
    }
    return simplify2(P);
  }
  function simplify2(P, tol = 1e-6) {
    P = P.filter((p, i) => Math.hypot(p[0] - P[(i-1+P.length) % P.length][0], p[1] - P[(i-1+P.length) % P.length][1]) > tol);
    const out = [];
    for (let i = 0; i < P.length; i++) {
      const a = P[(i-1+P.length) % P.length], b = P[i], c = P[(i+1) % P.length];
      if (Math.abs((b[0]-a[0])*(c[1]-b[1]) - (b[1]-a[1])*(c[0]-b[0])) > tol*Math.max(1, Math.hypot(c[0]-a[0], c[1]-a[1]))) out.push(b);
    }
    return out;
  }
  // horizontal section at height z0
  const outline = (H, z0 = 0) => section2d(H.map(h => [[h.n[0], h.n[1]], h.b - h.n[2]*z0]));
  // vertical section through the plane y = y0 : polygon in (x, z)
  const vsectionY = (H, y0 = 0) => section2d(H.map(h => [[h.n[0], h.n[2]], h.b - h.n[1]*y0]));

  function planes(wf, fams, rates) {
    const out = [];
    for (const f of fams) for (const hkl of family(f))
      out.push({ hkl, fam: f, n: toWafer(unit(hkl), wf), R: rates ? rates[f] : 0 });
    return out;
  }

  // cavity under a convex opening; t = null -> final {111} shape
  function etchH(wf, opening, { t = null, T = null, pre = 0, rates = null } = {}) {
    let P = opening.map(p => [p[0], p[1], 0]);
    if (pre > 0) P = P.concat(opening.map(p => [p[0], p[1], -pre]));
    const pl = t === null ? planes(wf, ["111"], null) : planes(wf, ["100", "110", "111"], rates);
    const H = pl.map(p => {
      let s = -Infinity; for (const q of P) s = Math.max(s, dot(p.n, q));
      return { n: p.n, b: s + (t === null ? 0 : p.R*t), label: p.hkl, fam: p.fam };
    });
    H.push({ n: [0, 0, 1], b: 0, label: "surface", fam: "surface" });
    if (T !== null) H.push({ n: [0, 0, -1], b: T, label: "back", fam: "back" });
    return H;
  }
  function etch(wf, opening, opts) { const H = etchH(wf, opening, opts); const P = polyhedron(H); P.H = H; return P; }

  function circle(R, m = 180) { const o = []; for (let i = 0; i < m; i++) { const a = 2*Math.PI*i/m; o.push([R*Math.cos(a), R*Math.sin(a)]); } return o; }
  function rect(cx, cy, w, h, deg = 0) {
    const c = Math.cos(deg/DEG), s = Math.sin(deg/DEG);
    return [[-w/2, -h/2], [w/2, -h/2], [w/2, h/2], [-w/2, h/2]].map(([x, y]) => [cx + x*c - y*s, cy + x*s + y*c]);
  }
  return { dot, cross, sub, add, mul, norm, unit, DEG, family, FRAMES, FRAME_IDX, toWafer, toCrystal, intDir, angleToSurface,
           polyhedron, volume, depth, outline, vsectionY, section2d, clip2, planes, etchH, etch, circle, rect, simplify2 };
})();
if (typeof module !== "undefined") module.exports = Core;
