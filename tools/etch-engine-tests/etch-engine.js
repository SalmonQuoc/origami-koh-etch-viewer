function etchEngineFactory() {
  const ORIENT = { "100": [1,0,0], "110": [1,1,0], "210": [2,1,0], "211": [2,1,1], "221": [2,2,1], "310": [3,1,0],
                   "311": [3,1,1], "320": [3,2,0], "331": [3,3,1], "530": [5,3,0], "540": [5,4,0], "111": [1,1,1] };
  const uvOf = (h, k, l) => { const s = [Math.abs(h), Math.abs(k), Math.abs(l)].sort((x, y) => y - x); return [s[1]/s[0], s[2]/s[0]]; };

  function delaunay(P) {
    const big = 100, pts = P.concat([[-big, -big], [big*2, -big], [0.5, big*2]]), n = P.length;
    let tris = [[n, n+1, n+2]];
    const circ = t => {
      const [a, b, c] = t.map(i => pts[i]);
      const d = 2*(a[0]*(b[1]-c[1]) + b[0]*(c[1]-a[1]) + c[0]*(a[1]-b[1]));
      const A = a[0]**2 + a[1]**2, Bq = b[0]**2 + b[1]**2, C = c[0]**2 + c[1]**2;
      const ux = (A*(b[1]-c[1]) + Bq*(c[1]-a[1]) + C*(a[1]-b[1]))/d, uy = (A*(c[0]-b[0]) + Bq*(a[0]-c[0]) + C*(b[0]-a[0]))/d;
      return [ux, uy, (a[0]-ux)**2 + (a[1]-uy)**2];
    };
    for (let p = 0; p < n; p++) {
      const [x, y] = pts[p], bad = [], keep = [];
      for (const t of tris) { const [cx, cy, r2] = circ(t); ((x-cx)**2 + (y-cy)**2 < r2*(1 - 1e-12)) ? bad.push(t) : keep.push(t); }
      const edges = new Map();
      for (const t of bad) for (let e = 0; e < 3; e++) {
        const a = t[e], b = t[(e+1)%3], key = a < b ? a + "," + b : b + "," + a;
        edges.set(key, edges.has(key) ? null : [a, b]);
      }
      tris = keep;
      for (const e of edges.values()) if (e) tris.push([e[0], e[1], p]);
    }
    return tris.filter(t => t.every(i => i < n));
  }

  function makeRate(values) {
    const keys = Object.keys(values), P = keys.map(k => uvOf(...ORIENT[k])), V = keys.map(k => values[k]);
    const tris = delaunay(P), N = 256, W = N + 1, tab = new Float32Array(W*W);
    for (let a = 0; a <= N; a++) for (let b = 0; b <= a; b++) {
      const u = a/N, v = b/N; let val = 0;
      for (const t of tris) {
        const [p0, p1, p2] = t.map(i => P[i]);
        const det = (p1[1]-p2[1])*(p0[0]-p2[0]) + (p2[0]-p1[0])*(p0[1]-p2[1]);
        if (Math.abs(det) < 1e-14) continue;
        const l0 = ((p1[1]-p2[1])*(u-p2[0]) + (p2[0]-p1[0])*(v-p2[1]))/det;
        const l1 = ((p2[1]-p0[1])*(u-p2[0]) + (p0[0]-p2[0])*(v-p2[1]))/det, l2 = 1 - l0 - l1;
        if (l0 > -1e-9 && l1 > -1e-9 && l2 > -1e-9) { val = l0*V[t[0]] + l1*V[t[1]] + l2*V[t[2]]; break; }
      }
      tab[a*W + b] = val; tab[b*W + a] = val;
    }
    return { N, tab, tris: tris.map(t => t.map(i => keys[i])) };
  }
  function rateC(RT, x, y, z) {
    x = x < 0 ? -x : x; y = y < 0 ? -y : y; z = z < 0 ? -z : z;
    let a = x, b = y, c = z, t;
    if (b > a) { t = a; a = b; b = t; } if (c > a) { t = a; a = c; c = t; } if (c > b) { t = b; b = c; c = t; }
    const N = RT.N, fu = b/a*N, fv = c/a*N;
    let iu = fu | 0, iv = fv | 0; if (iu >= N) iu = N - 1; if (iv >= N) iv = N - 1;
    const du = fu - iu, dv = fv - iv, tab = RT.tab, W = N + 1, o = iu*W + iv;
    return (tab[o]*(1-dv) + tab[o+1]*dv)*(1-du) + (tab[o+W]*(1-dv) + tab[o+W+1]*dv)*du;
  }

  // ---------------------------------------------------------------- 2D mask -> signed distance
  function edt1d(f, n, d, v, z) {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s;
      while (true) { s = ((f[q] + q*q) - (f[v[k]] + v[k]*v[k]))/(2*q - 2*v[k]); if (s <= z[k] && k > 0) k--; else break; }
      if (s <= z[k]) { v[0] = q; z[0] = -Infinity; z[1] = Infinity; k = 0; continue; }
      k++; v[k] = q; z[k] = s; z[k+1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k+1] < q) k++; d[q] = (q - v[k])**2 + f[v[k]]; }
  }
  function edt2d(bin, W, H) {
    const INF = 1e20, D = new Float64Array(W*H), n = Math.max(W, H);
    const f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) f[y] = bin[y*W + x] ? 0 : INF; edt1d(f, H, d, v, z); for (let y = 0; y < H; y++) D[y*W + x] = d[y]; }
    for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) f[x] = D[y*W + x]; edt1d(f, W, d, v, z); for (let x = 0; x < W; x++) D[y*W + x] = d[x]; }
    return D;
  }
  function inPoly(P, x, y) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0]-a[0])*(y-a[1])/(b[1]-a[1]) + a[0]) c = !c; }
    return c;
  }
  // shapes are painted in order: "open" removes mask, "mask" puts it back. Default: masked.
  function isOpen(shapes, x, y) { let o = false; for (const s of shapes) if (inPoly(s.pts, x, y)) o = s.op === "open"; return o; }

  // ---------------------------------------------------------------- simulation
  function create(cfg) {
    // cfg: frame [e1,e2,e3] (crystal components of the wafer x,y,z axes), rates {key: um/min}, shapes,
    //      X0,X1,Y0,Y1 (um), depth (um, simulated depth = back side), dx (um), pre (um, vertical pre-etch), alphaScale
    const dx = cfg.dx, Nx = Math.max(4, Math.round((cfg.X1 - cfg.X0)/dx)), Ny = Math.max(4, Math.round((cfg.Y1 - cfg.Y0)/dx));
    const Nz = Math.max(3, Math.round(cfg.depth/dx)), NXY = Nx*Ny, NN = NXY*Nz;
    const RT = makeRate(cfg.rates);
    const [e1, e2, e3] = cfg.frame;
    const Rg = (x, y, z) => rateC(RT, e1[0]*x + e2[0]*y + e3[0]*z, e1[1]*x + e2[1]*y + e3[1]*z, e1[2]*x + e2[2]*y + e3[2]*z);
    // signed in-plane distance to the opening edge (supersampled EDT); >0 under the mask
    const SS = 4, W = Nx*SS, H = Ny*SS, inb = new Uint8Array(W*H), outb = new Uint8Array(W*H);
    for (let y = 0; y < H; y++) { const yy = cfg.Y0 + (y + 0.5)*dx/SS;
      for (let x = 0; x < W; x++) { const o = isOpen(cfg.shapes, cfg.X0 + (x + 0.5)*dx/SS, yy); inb[y*W + x] = o ? 1 : 0; outb[y*W + x] = o ? 0 : 1; } }
    const Din = edt2d(inb, W, H), Dout = edt2d(outb, W, H);
    const sd = new Float32Array(NXY), open = new Uint8Array(NXY);
    for (let j = 0; j < Ny; j++) for (let i = 0; i < Nx; i++) {
      let s = 0;
      for (let b = 1; b <= 2; b++) for (let a = 1; a <= 2; a++) { const q = (j*SS + b)*W + i*SS + a; s += inb[q] ? -(Math.sqrt(Dout[q]) - 0.5) : (Math.sqrt(Din[q]) - 0.5); }
      sd[j*Nx + i] = s/4*dx/SS; open[j*Nx + i] = sd[j*Nx + i] < 0 ? 1 : 0;
    }
    const band = cfg.band || 4, B = band*dx, pre = cfg.pre || 0;
    const phi = new Float32Array(NN), T = new Float32Array(NN).fill(Infinity), Hr = new Float32Array(NN);
    for (let k = 0; k < Nz; k++) { const z = (k + 0.5)*dx;
      for (let q = 0; q < NXY; q++) {
        const d = Math.max(sd[q], 0); let v;
        if (sd[q] < 0 && z < pre) v = Math.max(sd[q], z - pre);               // inside the pre-etched prism
        else v = Math.hypot(d, Math.max(0, z - (sd[q] < 0 ? pre : 0)) || (sd[q] >= 0 && z < pre ? 0 : 0)) ;
        if (sd[q] >= 0 && z < pre) v = d;                                     // beside the prism: lateral distance
        else if (sd[q] >= 0) v = Math.hypot(d, Math.max(0, z - pre));
        v = Math.max(-B, Math.min(B, v));
        phi[k*NXY + q] = v; if (v <= 0) T[k*NXY + q] = 0;
      } }
    const gOpen = new Float32Array(NXY); for (let q = 0; q < NXY; q++) gOpen[q] = Math.max(-0.5*dx, sd[q]);
    // dissipation coefficients alpha_i >= max |dH/dp_i| (sampled)
    const al = [0, 0, 0], h = 1e-4; let rmax = 0;
    for (let s = 0; s < 30000; s++) {
      const u = 2*((s*0.6180339887) % 1) - 1, ph = 2*Math.PI*((s*0.7548776662) % 1), r = Math.sqrt(1 - u*u), p = [r*Math.cos(ph), r*Math.sin(ph), u];
      const H0 = Rg(p[0], p[1], p[2]); if (H0 > rmax) rmax = H0;
      for (let i = 0; i < 3; i++) { const q = p.slice(); q[i] += h; const nq = Math.hypot(q[0], q[1], q[2]); const g = (Rg(q[0]/nq, q[1]/nq, q[2]/nq)*nq - H0)/h; if (Math.abs(g) > al[i]) al[i] = Math.abs(g); }
    }
    const as = cfg.alphaScale || 1; for (let i = 0; i < 3; i++) al[i] *= as;
    const S = { cfg, Nx, Ny, Nz, NXY, NN, dx, B, phi, T, Hr, gOpen, open, sd, RT, Rg, al, rmax, t: 0, steps: 0, e: [e1, e2, e3] };
    S.dt0 = (cfg.cfl || 0.9)*dx/(al[0] + al[1] + al[2]);
    // band bookkeeping
    S.act = new Int32Array(Math.min(NN, 1 << 20)); S.nact = 0; S.stamp = new Uint32Array(NN); S.gen = 1; S.tmp = new Float32Array(S.act.length);
    S.reinit = makeReinit(Nx, Ny, Nz, dx, B);
    rebuild(S, true);
    return S;
  }

  function rebuild(S, full) {
    const { Nx, Ny, Nz, NXY, NN, phi, B, stamp } = S;
    S.gen++; const gen = S.gen;
    const old = full ? null : S.act.slice(0, S.nact);
    let act = S.act, n = 0;
    const add = q => {
      if (stamp[q] === gen) return; stamp[q] = gen;
      if (phi[q] <= -B) return;
      if (n >= act.length) { const a = new Int32Array(act.length*2); a.set(act); act = a; S.tmp = new Float32Array(act.length); }
      act[n++] = q;
    };
    const visit = q => {
      const p = phi[q]; if (p >= B || p <= -B) return;
      add(q);
      const k = (q / NXY) | 0, r = q - k*NXY, j = (r / Nx) | 0, i = r - j*Nx;
      if (i > 0) add(q - 1); if (i < Nx - 1) add(q + 1); if (j > 0) add(q - Nx); if (j < Ny - 1) add(q + Nx);
      if (k > 0) add(q - NXY); if (k < Nz - 1) add(q + NXY);
    };
    if (old) { for (let m = 0; m < old.length; m++) visit(old[m]); } else for (let q = 0; q < NN; q++) visit(q);
    S.act = act; S.nact = n;
  }

  function step(S, tEnd, maxSteps) {
    const { Nx, Ny, Nz, NXY, dx, B, phi, T, Hr, gOpen, open, RT, al } = S;
    const [e1, e2, e3] = S.e, tab = RT.tab, N = RT.N, WT = N + 1;
    const ax = al[0], ay = al[1], az = al[2], idx = 1/dx;
    let ns = 0;
    while (S.t < tEnd - 1e-9 && ns < maxSteps) {
      const dt = Math.min(S.dt0, tEnd - S.t), act = S.act, nact = S.nact, tmp = S.tmp;
      for (let m = 0; m < nact; m++) {
        const q = act[m], c = phi[q];
        const k = (q / NXY) | 0, r = q - k*NXY, j = (r / Nx) | 0, i = r - j*Nx;
        const xm = i > 0 ? phi[q-1] : c, xp = i < Nx-1 ? phi[q+1] : c;
        const ym = j > 0 ? phi[q-Nx] : c, yp = j < Ny-1 ? phi[q+Nx] : c;
        const zp = k < Nz-1 ? phi[q+NXY] : c;
        let zm;
        if (k > 0) zm = phi[q-NXY]; else { zm = 2*c - zp; if (open[r]) { if (zm > gOpen[r]) zm = gOpen[r]; } else if (S.cfg.ghost !== "extrap" && zm < c) zm = c; }
        const dxm = (c - xm)*idx, dxp = (xp - c)*idx, dym = (c - ym)*idx, dyp = (yp - c)*idx, dzm = (c - zm)*idx, dzp = (zp - c)*idx;
        const px = 0.5*(dxm + dxp), py = 0.5*(dym + dyp), pz = -0.5*(dzm + dzp);   // grid k runs downward
        const pn = Math.sqrt(px*px + py*py + pz*pz);
        let Hn = 0;
        if (pn > 1e-12) {
          const nx = px/pn, ny = py/pn, nz = pz/pn;
          let a = e1[0]*nx + e2[0]*ny + e3[0]*nz, b = e1[1]*nx + e2[1]*ny + e3[1]*nz, cc = e1[2]*nx + e2[2]*ny + e3[2]*nz, t;
          if (a < 0) a = -a; if (b < 0) b = -b; if (cc < 0) cc = -cc;
          if (b > a) { t = a; a = b; b = t; } if (cc > a) { t = a; a = cc; cc = t; } if (cc > b) { t = b; b = cc; cc = t; }
          const fu = b/a*N, fv = cc/a*N; let iu = fu | 0, iv = fv | 0; if (iu >= N) iu = N - 1; if (iv >= N) iv = N - 1;
          const du = fu - iu, dv = fv - iv, o = iu*WT + iv;
          Hn = ((tab[o]*(1-dv) + tab[o+1]*dv)*(1-du) + (tab[o+WT]*(1-dv) + tab[o+WT+1]*dv)*du)*pn;
        }
        Hn -= 0.5*(ax*(dxp - dxm) + ay*(dyp - dym) + az*(dzp - dzm));
        let v = c - dt*Hn; if (v > c) v = c; if (v < -B) v = -B; else if (v > B) v = B;   // etching is irreversible: phi never rises
        tmp[m] = v; Hr[q] = Hn;
      }
      for (let m = 0; m < nact; m++) {
        const q = act[m], c = phi[q], v = tmp[m];
        if (c > 0 && v <= 0) T[q] = S.t + dt*c/(c - v);
        phi[q] = v;
      }
      S.t += dt; S.steps++; ns++;
      if (S.steps % 2 === 0) rebuild(S, false);
      if (S.steps % 6 === 0) { S.reinit(phi, S.act, S.nact); rebuild(S, false); }
    }
    return S.t;
  }

  function makeReinit(Nx, Ny, Nz, dx, B) {
    const NXY = Nx*Ny, NN = NXY*Nz, st = new Uint8Array(NN), dist = new Float32Array(NN);
    let hv = new Float32Array(1 << 16), hi = new Int32Array(1 << 16), hn = 0;
    const push = (v, q) => {
      if (hn >= hv.length) { const a = new Float32Array(hv.length*2); a.set(hv); hv = a; const b = new Int32Array(hi.length*2); b.set(hi); hi = b; }
      let k = hn++;
      while (k > 0) { const p = (k - 1) >> 1; if (hv[p] <= v) break; hv[k] = hv[p]; hi[k] = hi[p]; k = p; }
      hv[k] = v; hi[k] = q;
    };
    const pop = () => {
      const q = hi[0], lv = hv[--hn], li = hi[hn]; let k = 0;
      while (true) { let c = 2*k + 1; if (c >= hn) break; if (c + 1 < hn && hv[c+1] < hv[c]) c++; if (hv[c] >= lv) break; hv[k] = hv[c]; hi[k] = hi[c]; k = c; }
      hv[k] = lv; hi[k] = li; return q;
    };
    const NB = new Int32Array(6);
    const nb = q => {
      const k = (q / NXY) | 0, r = q - k*NXY, j = (r / Nx) | 0, i = r - j*Nx;
      NB[0] = i > 0 ? q-1 : -1; NB[1] = i < Nx-1 ? q+1 : -1; NB[2] = j > 0 ? q-Nx : -1; NB[3] = j < Ny-1 ? q+Nx : -1;
      NB[4] = k > 0 ? q-NXY : -1; NB[5] = k < Nz-1 ? q+NXY : -1;
    };
    const A3 = new Float64Array(3);
    function solve(q) {
      nb(q); let na = 0;
      for (let ax = 0; ax < 3; ax++) {
        let m = Infinity; const r0 = NB[2*ax], r1 = NB[2*ax+1];
        if (r0 >= 0 && st[r0] === 2 && dist[r0] < m) m = dist[r0];
        if (r1 >= 0 && st[r1] === 2 && dist[r1] < m) m = dist[r1];
        if (m < Infinity) A3[na++] = m;
      }
      if (na === 0) return Infinity;
      // sort small array
      for (let a = 1; a < na; a++) { const v = A3[a]; let b = a - 1; while (b >= 0 && A3[b] > v) { A3[b+1] = A3[b]; b--; } A3[b+1] = v; }
      let d = A3[0] + dx;
      if (na > 1 && d > A3[1]) {
        d = 0.5*(A3[0] + A3[1] + Math.sqrt(Math.max(0, 2*dx*dx - (A3[0] - A3[1])**2)));
        if (na > 2 && d > A3[2]) { const s = A3[0] + A3[1] + A3[2], q2 = A3[0]*A3[0] + A3[1]*A3[1] + A3[2]*A3[2]; d = (s + Math.sqrt(Math.max(0, s*s - 3*(q2 - dx*dx))))/3; }
      }
      return d;
    }
    const touched = [];
    return function (phi, list, n) {
      hn = 0; touched.length = 0;
      for (let m = 0; m < n; m++) {
        const q = list[m], c = phi[q]; nb(q);
        let inv = 0, any = false;
        for (let ax = 0; ax < 3; ax++) {
          let best = Infinity;
          for (let s = 0; s < 2; s++) { const r = NB[2*ax+s]; if (r >= 0) { const o = phi[r]; if ((c > 0) !== (o > 0)) { const f = c/(c - o); if (f < best) best = f; } } }
          if (best < Infinity) { const dd = Math.max(best*dx, 1e-3*dx); inv += 1/(dd*dd); any = true; }
        }
        if (any) { dist[q] = 1/Math.sqrt(inv); st[q] = 2; touched.push(q); }
      }
      const nInit = touched.length;
      for (let m = 0; m < nInit; m++) { nb(touched[m]); for (let s = 0; s < 6; s++) { const r = NB[s]; if (r >= 0 && st[r] === 0) { st[r] = 1; push(solve(r), r); } } }
      while (hn > 0) {
        const q = pop(); if (st[q] === 2) continue;
        const d = solve(q); st[q] = 2; dist[q] = d; touched.push(q);
        if (d >= B) continue;
        nb(q); for (let s = 0; s < 6; s++) { const r = NB[s]; if (r >= 0 && st[r] !== 2) { st[r] = 1; push(solve(r), r); } }
      }
      for (let m = 0; m < touched.length; m++) { const q = touched[m]; const s = phi[q] > 0 ? 1 : -1; phi[q] = s*Math.min(B, dist[q]); st[q] = 0; }
    };
  }

  // effective arrival time of node q, valid for any view time <= S.t
  function teff(S, q) {
    const T = S.T[q]; if (T !== Infinity) return T;
    const p = S.phi[q], h = S.Hr[q];
    return S.t + (h > 1e-9 ? Math.max(0, p)/h : 1e9);
  }

  // ---------------------------------------------------------------- surface nets
  // Silicon at view time tv: nodes with T > tv. Edge crossings: exact arrival times where both are known,
  // otherwise a constant-speed interpolation between the arrival at the etched node and the current front.
  function crossing(S, qa, qb, tv) {   // qa etched at tv, qb not; fraction from a towards b
    const Ta = S.T[qa], Tb = S.T[qb];
    if (Tb !== Infinity) return Math.min(1, Math.max(0, (tv - Ta)/Math.max(1e-9, Tb - Ta)));
    const pa = S.phi[qa], pb = S.phi[qb];
    const pend = pb > pa ? Math.min(1, Math.max(0, -pa/(pb - pa))) : 0.5;
    const span = S.t - Ta;
    return span > 1e-9 ? pend*Math.min(1, Math.max(0, (tv - Ta)/span)) : pend;
  }
  function extract(S, tv, opt = {}) {
    const { Nx, Ny, Nz, NXY, dx } = S, X0 = S.cfg.X0, Y0 = S.cfg.Y0, T = S.T;
    const PX = Nx + 2, PY = Ny + 2, PZ = Nz + 2, PXY = PX*PY;
    const cutJ = opt.cutJ == null ? -1 : opt.cutJ, cutI = opt.cutI == null ? -1 : opt.cutI, live = tv >= S.t - 1e-6;
    // padded state: 1 silicon, 0 etchant/air; qmap -> engine index (or -1 for pads and cut-away nodes)
    const sil = new Uint8Array(PX*PY*PZ), qmap = new Int32Array(PX*PY*PZ).fill(-1);
    for (let k = 0; k < Nz; k++) for (let j = 0; j < Ny; j++) {
      if (cutJ >= 0 && j > cutJ) continue;
      for (let i = 0; i < Nx; i++) {
        if (cutI >= 0 && i > cutI) continue;
        const q = k*NXY + j*Nx + i, p = (k+1)*PXY + (j+1)*PX + (i+1);
        qmap[p] = q; sil[p] = (live ? S.phi[q] > 0 : T[q] > tv) ? 1 : 0;
      }
    }
    const frac = (pa, pb) => {   // pa silicon, pb not: fraction from pa to pb where the surface sits
      const qa = qmap[pa], qb = qmap[pb];
      if (qa < 0 || qb < 0) return 0.5;
      if (live) { const pa = S.phi[qa], pb = S.phi[qb]; return pa > pb ? Math.min(1, Math.max(0, pa/(pa - pb))) : 0.5; }
      return 1 - crossing(S, qb, qa, tv);
    };
    const vid = new Int32Array(PX*PY*PZ).fill(-1), pos = [];
    const C = [[0,0,0],[1,0,0],[0,1,0],[1,1,0],[0,0,1],[1,0,1],[0,1,1],[1,1,1]];
    const E = [[0,1],[2,3],[4,5],[6,7],[0,2],[1,3],[4,6],[5,7],[0,4],[1,5],[2,6],[3,7]];
    const off = C.map(c => c[2]*PXY + c[1]*PX + c[0]);
    for (let k = 0; k < PZ-1; k++) for (let j = 0; j < PY-1; j++) for (let i = 0; i < PX-1; i++) {
      const p0 = k*PXY + j*PX + i; let m = 0;
      for (let c = 0; c < 8; c++) if (sil[p0 + off[c]]) m |= 1 << c;
      if (m === 0 || m === 255) continue;
      let sx = 0, sy = 0, sz = 0, n = 0;
      for (let e = 0; e < 12; e++) {
        const a = E[e][0], b = E[e][1], ia = (m >> a) & 1, ib = (m >> b) & 1; if (ia === ib) continue;
        const s = ia ? frac(p0 + off[a], p0 + off[b]) : 1 - frac(p0 + off[b], p0 + off[a]);
        sx += C[a][0] + s*(C[b][0] - C[a][0]); sy += C[a][1] + s*(C[b][1] - C[a][1]); sz += C[a][2] + s*(C[b][2] - C[a][2]); n++;
      }
      vid[p0] = pos.length/3;
      pos.push(X0 + (i + sx/n - 0.5)*dx, Y0 + (j + sy/n - 0.5)*dx, -(k + sz/n - 0.5)*dx);
    }
    const tri = [], tag = [];
    const cube = (k, j, i) => (k < 0 || j < 0 || i < 0 || k >= PZ-1 || j >= PY-1 || i >= PX-1) ? -1 : vid[k*PXY + j*PX + i];
    for (let k = 0; k < PZ; k++) for (let j = 0; j < PY; j++) for (let i = 0; i < PX; i++) {
      const p = k*PXY + j*PX + i, v0 = sil[p];
      for (let ax = 0; ax < 3; ax++) {
        const i1 = i + (ax === 0), j1 = j + (ax === 1), k1 = k + (ax === 2);
        if (i1 >= PX || j1 >= PY || k1 >= PZ) continue;
        const p1 = k1*PXY + j1*PX + i1; if (v0 === sil[p1]) continue;
        let a, b, c, d;
        if (ax === 0) { a = cube(k, j, i); b = cube(k, j-1, i); c = cube(k-1, j-1, i); d = cube(k-1, j, i); }
        else if (ax === 1) { a = cube(k, j, i); b = cube(k-1, j, i); c = cube(k-1, j, i-1); d = cube(k, j, i-1); }
        else { a = cube(k, j, i); b = cube(k, j, i-1); c = cube(k, j-1, i-1); d = cube(k, j-1, i); }
        if (a < 0 || b < 0 || c < 0 || d < 0) continue;
        // z index grows downward, so the k-axis flips handedness
        const flip = (v0 === 1) !== (ax === 2);
        if (flip) tri.push(a, b, c, a, c, d); else tri.push(a, c, b, a, d, c);
        const cap = (cutJ >= 0 && ax === 1 && j1 === cutJ + 2 && qmap[p] >= 0) || (cutI >= 0 && ax === 0 && i1 === cutI + 2 && qmap[p] >= 0);
        tag.push(cap ? 1 : 0, cap ? 1 : 0);
      }
    }
    return { pos: new Float32Array(pos), idx: new Uint32Array(tri), tag: new Uint8Array(tag) };
  }

  // 2D section of the arrival-time field in the plane j = const (axis "y") or i = const (axis "x")
  function section(S, axis, index, tv) {
    // returns silicon flags and per-edge crossing fractions along the row (a) and column (k) directions
    const { Nx, Ny, Nz, NXY } = S, n = axis === "y" ? Nx : Ny;
    const at = (k, a) => axis === "y" ? k*NXY + index*Nx + a : k*NXY + a*Nx + index;
    const sil = new Uint8Array(n*Nz), fa = new Float32Array(n*Nz).fill(-1), fk = new Float32Array(n*Nz).fill(-1);
    const live = tv >= S.t - 1e-6, cr = (qa, qb) => { if (live) { const pa = S.phi[qa], pb = S.phi[qb]; return pa < pb ? Math.min(1, Math.max(0, -pa/(pb - pa))) : 0.5; } return crossing(S, qa, qb, tv); };
    for (let k = 0; k < Nz; k++) for (let a = 0; a < n; a++) sil[k*n + a] = (live ? S.phi[at(k, a)] > 0 : S.T[at(k, a)] > tv) ? 1 : 0;
    for (let k = 0; k < Nz; k++) for (let a = 0; a < n; a++) {
      const s0 = sil[k*n + a];
      if (a + 1 < n && s0 !== sil[k*n + a + 1]) { const qa = at(k, a), qb = at(k, a + 1); fa[k*n + a] = s0 ? 1 - cr(qb, qa) : cr(qa, qb); }
      if (k + 1 < Nz && s0 !== sil[(k+1)*n + a]) { const qa = at(k, a), qb = at(k + 1, a); fk[k*n + a] = s0 ? 1 - cr(qb, qa) : cr(qa, qb); }
    }
    const open = new Uint8Array(n); for (let a = 0; a < n; a++) open[a] = axis === "y" ? S.open[index*Nx + a] : S.open[a*Nx + index];
    return { n, Nz, sil, fa, fk, open };
  }

  // ---------------------------------------------------------------- statistics at view time tv
  function stats(S, tv) {
    const { Nx, Ny, Nz, NXY, dx, T, sd } = S;
    let depth = 0, under = 0, susp = 0, through = 0;
    for (let q = 0; q < NXY; q++) {
      // deepest etched node in this column (+ crossing to the next)
      let kk = -1;
      for (let k = 0; k < Nz; k++) { if (T[k*NXY + q] <= tv) kk = k; else break; }
      if (kk >= 0) {
        let d = (kk + 0.5)*dx;
        if (kk + 1 < Nz) d += crossing(S, kk*NXY + q, (kk + 1)*NXY + q, tv)*dx; else { d = Nz*dx; through++; }
        if (d > depth) depth = d;
      }
      if (sd[q] > 0 && T[q] <= tv) { susp++; if (sd[q] > under) under = sd[q]; }
    }
    // release of each "mask" shape: fraction of its masked area with no silicon under it (top node row)
    const rel = (S.shapeMap || []).map(m => { let a = 0, b = 0; for (const q of m) { a++; if (T[q] <= tv) b++; } return a ? b/a : null; });
    return { depth, under, susp: susp*dx*dx, through: through*dx*dx, rel };
  }
  function shapeMaps(S) {
    const { Nx, Ny, dx, cfg } = S; S.shapeMap = cfg.shapes.map(() => []);
    for (let j = 0; j < Ny; j++) for (let i = 0; i < Nx; i++) {
      const x = cfg.X0 + (i + 0.5)*dx, y = cfg.Y0 + (j + 0.5)*dx, q = j*Nx + i;
      if (S.open[q]) continue;
      for (let s = cfg.shapes.length - 1; s >= 0; s--) if (inPoly(cfg.shapes[s].pts, x, y)) { if (cfg.shapes[s].op === "mask") S.shapeMap[s].push(q); break; }
    }
  }

  // ---------------------------------------------------------------- message handler (worker or in-page)
  function makeHandler(post) {
    let S = null, job = 0;
    const view = (tv, cut, cutMesh) => {
      const opt = {}; if (cut && cutMesh) { if (cut.axis === "y") opt.cutJ = cut.index; else opt.cutI = cut.index; }
      const m = extract(S, tv, opt);
      const sec = cut ? section(S, cut.axis, cut.index, tv) : null;
      const top = new Uint8Array(S.NXY); for (let q = 0; q < S.NXY; q++) top[q] = S.T[q] <= tv ? 1 : 0;
      return { mesh: m, sec, top, st: stats(S, tv), t: S.t, tv };
    };
    const tr = r => { const a = [r.mesh.pos.buffer, r.mesh.idx.buffer, r.mesh.tag.buffer, r.top.buffer]; if (r.sec) a.push(r.sec.sil.buffer, r.sec.fa.buffer, r.sec.fk.buffer, r.sec.open.buffer); return a; };
    return function (msg, tick) {
      if (msg.cmd === "run") {
        const my = ++job, t0 = Date.now();
        try { S = create(msg.cfg); shapeMaps(S); } catch (e) { post({ type: "error", message: String(e && e.message || e) }); return; }
        post({ type: "grid", id: msg.id, Nx: S.Nx, Ny: S.Ny, Nz: S.Nz, dx: S.dx, dt: S.dt0, al: S.al, rmax: S.rmax, tris: S.RT.tris });
        let lastPost = Date.now();
        const loop = () => {
          if (my !== job) return;
          step(S, msg.tEnd, 8);
          const done = S.t >= msg.tEnd - 1e-9;
          if (done || Date.now() - lastPost > 450) {
            lastPost = Date.now();
            const r = view(S.t, msg.cut, msg.cutMesh); r.type = done ? "done" : "progress"; r.id = msg.id; r.ms = Date.now() - t0; r.steps = S.steps;
            post(r, tr(r));
          }
          if (!done) tick(loop);
        };
        tick(loop);
      } else if (msg.cmd === "view") {
        if (!S) return;
        const r = view(Math.min(msg.tv, S.t), msg.cut, msg.cutMesh); r.type = "view"; r.id = msg.id; r.req = msg.req; post(r, tr(r));
      } else if (msg.cmd === "stop") { job++; }
    };
  }

  return { ORIENT, uvOf, makeRate, rateC, create, step, extract, section, teff, isOpen, stats, makeHandler };
}

if (typeof module !== "undefined") module.exports = etchEngineFactory();
