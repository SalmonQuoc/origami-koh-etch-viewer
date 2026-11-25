//! Narrow-band level-set etch on a cubic grid (port of the JavaScript engine's `step`,
//! `rebuild` and `makeReinit`). Index q = k*NXY + j*Nx + i; k runs downward from the surface.

pub struct Sim {
    pub nx: usize,
    pub ny: usize,
    pub nz: usize,
    pub nxy: usize,
    pub nn: usize,
    pub dx: f64,
    pub b: f64,
    pub dt0: f64,
    pub al: [f64; 3],
    pub t: f64,
    pub steps: u32,
    /// level set (>0 silicon), arrival time, last Hamiltonian value
    pub phi: Vec<f32>,
    pub tarr: Vec<f32>,
    pub hr: Vec<f32>,
    /// top-row boundary data: ghost value over openings, opening flag
    pub gopen: Vec<f32>,
    pub open: Vec<u8>,
    /// rate factor per node row k (heavily boron-doped layer); 1 outside a layer
    pub kz: Vec<f32>,
    /// rate table (N+1)^2 over the standard triangle, N = n_rate
    pub tab: Vec<f32>,
    pub n_rate: usize,
    /// crystal components of the wafer axes: e1 (0..3), e2 (3..6), e3 (6..9)
    pub e: Vec<f64>,
    // band bookkeeping
    pub act: Vec<i32>,
    /// grid coordinates of the band nodes, packed i | j << 21 | k << 42 (saves two divisions per node and step)
    act_ijk: Vec<u64>,
    stamp: Vec<u32>,
    /// native timing of kernel, band rebuild and re-initialisation (seconds; stays zero in WebAssembly)
    pub timers: [f64; 3],
    gen: u32,
    tmp: Vec<f32>,
    /// stage-0 values of the band during the second Runge-Kutta stage
    old: Vec<f32>,
    /// 2: second-order differences + Heun stepping (default); 1: first order, forward Euler
    pub order: u32,
    re: Reinit,
}

impl Sim {
    pub fn new(nx: usize, ny: usize, nz: usize, n_rate: usize) -> Sim {
        let nxy = nx * ny;
        let nn = nxy * nz;
        let w = n_rate + 1;
        Sim {
            nx, ny, nz, nxy, nn,
            dx: 1.0, b: 4.0, dt0: 0.0, al: [0.0; 3], t: 0.0, steps: 0,
            phi: vec![0.0; nn],
            tarr: vec![f32::INFINITY; nn],
            hr: vec![0.0; nn],
            gopen: vec![0.0; nxy],
            open: vec![0; nxy],
            kz: vec![1.0; nz],
            tab: vec![0.0; w * w],
            n_rate,
            e: vec![0.0; 9],
            act: Vec::with_capacity(nn.min(1 << 20)),
            act_ijk: Vec::with_capacity(nn.min(1 << 20)),
            stamp: vec![0; nn],
            timers: [0.0; 3],
            gen: 1,
            tmp: Vec::new(),
            old: Vec::new(),
            order: 2,
            re: Reinit::new(nn),
        }
    }

    /// Narrow band: every node with |phi| < B and its six neighbours (those with phi > -B), in the same order
    /// as the JavaScript engine (which matters for the re-initialisation).
    pub fn rebuild(&mut self, full: bool) {
        self.gen = self.gen.wrapping_add(1);
        let gen = self.gen;
        let b = self.b;
        let (nx, ny, nz, nxy) = (self.nx, self.ny, self.nz, self.nxy);
        let old: Vec<u64> = if full { Vec::new() } else { std::mem::take(&mut self.act_ijk) };
        let mut act: Vec<i32> = std::mem::take(&mut self.act);
        act.clear();
        let mut ijk: Vec<u64> = Vec::with_capacity(old.len().max(16));
        let phi = &self.phi;
        let stamp = &mut self.stamp;
        #[inline(always)]
        fn pack(i: usize, j: usize, k: usize) -> u64 { i as u64 | (j as u64) << 21 | (k as u64) << 42 }
        let mut add = |q: usize, c: u64, act: &mut Vec<i32>, ijk: &mut Vec<u64>| {
            if stamp[q] == gen { return; }
            stamp[q] = gen;
            if (phi[q] as f64) <= -b { return; }
            act.push(q as i32);
            ijk.push(c);
        };
        let mut visit = |i: usize, j: usize, k: usize, act: &mut Vec<i32>, ijk: &mut Vec<u64>| {
            let q = k * nxy + j * nx + i;
            let p = phi[q] as f64;
            if p >= b || p <= -b { return; }
            add(q, pack(i, j, k), act, ijk);
            if i > 0 { add(q - 1, pack(i - 1, j, k), act, ijk); }
            if i < nx - 1 { add(q + 1, pack(i + 1, j, k), act, ijk); }
            if j > 0 { add(q - nx, pack(i, j - 1, k), act, ijk); }
            if j < ny - 1 { add(q + nx, pack(i, j + 1, k), act, ijk); }
            if k > 0 { add(q - nxy, pack(i, j, k - 1), act, ijk); }
            if k < nz - 1 { add(q + nxy, pack(i, j, k + 1), act, ijk); }
        };
        if full {
            for k in 0..nz { for j in 0..ny { for i in 0..nx { visit(i, j, k, &mut act, &mut ijk); } } }
        } else {
            const M: u64 = (1 << 21) - 1;
            for &c in old.iter() { visit((c & M) as usize, ((c >> 21) & M) as usize, (c >> 42) as usize, &mut act, &mut ijk); }
        }
        self.act = act;
        self.act_ijk = ijk;
    }

    pub fn step(&mut self, t_end: f64, max_steps: u32) -> f64 {
        let (nx, ny, nz, nxy) = (self.nx, self.ny, self.nz, self.nxy);
        let b = self.b;
        let o2 = self.order == 2;
        let mut ns: u32 = 0;
        const M: u64 = (1 << 21) - 1;
        while self.t < t_end - 1e-9 && ns < max_steps {
            let dt = self.dt0.min(t_end - self.t);
            let tk = Clock::now();
            let nact = self.act.len();
            if self.tmp.len() < nact { self.tmp.resize(nact, 0.0); }
            if o2 && self.old.len() < nact { self.old.resize(nact, 0.0); }
            {
                let kx = Kern {
                    nx, ny, nz, nxy, idx: 1.0 / self.dx, al: self.al,
                    e: [self.e[0], self.e[1], self.e[2], self.e[3], self.e[4], self.e[5], self.e[6], self.e[7], self.e[8]],
                    tab: &self.tab, n: self.n_rate, gopen: &self.gopen, open: &self.open, kz: &self.kz,
                };
                let act = &self.act;
                let ijk = &self.act_ijk;
                let phi = &mut self.phi;
                let hr = &mut self.hr;
                let tmp = &mut self.tmp;
                // stage 1 (forward Euler)
                for m in 0..nact {
                    let q = act[m] as usize;
                    let c3 = ijk[m];
                    let hn = kx.ham(phi, q, (c3 & M) as usize, ((c3 >> 21) & M) as usize, (c3 >> 42) as usize, o2);
                    let c = phi[q] as f64;
                    let mut v = c - dt * hn;
                    if v > c { v = c; } // etching is irreversible: phi never rises
                    if v < -b { v = -b; } else if v > b { v = b; }
                    tmp[m] = v as f32;
                    hr[q] = hn as f32;
                }
                if o2 {
                    // stage 2 on the stage-1 field, then the average (Heun / TVD Runge-Kutta 2)
                    let old = &mut self.old;
                    for m in 0..nact { let q = act[m] as usize; old[m] = phi[q]; phi[q] = tmp[m]; }
                    for m in 0..nact {
                        let q = act[m] as usize;
                        let c3 = ijk[m];
                        let hn = kx.ham(phi, q, (c3 & M) as usize, ((c3 >> 21) & M) as usize, (c3 >> 42) as usize, true);
                        let c1 = phi[q] as f64;
                        let c = old[m] as f64;
                        let mut v = 0.5 * (c + c1 - dt * hn);
                        if v > c { v = c; }
                        if v < -b { v = -b; } else if v > b { v = b; }
                        tmp[m] = v as f32;
                        hr[q] = (0.5 * (hr[q] as f64 + hn)) as f32;
                    }
                    for m in 0..nact { phi[act[m] as usize] = old[m]; }
                }
            }
            for m in 0..nact {
                let q = self.act[m] as usize;
                let c = self.phi[q] as f64;
                let v32 = self.tmp[m];
                let v = v32 as f64;
                if c > 0.0 && v <= 0.0 { self.tarr[q] = (self.t + dt * c / (c - v)) as f32; }
                self.phi[q] = v32;
            }
            self.t += dt;
            self.steps += 1;
            ns += 1;
            self.timers[0] += tk.secs();
            let tb = Clock::now();
            if self.steps % 2 == 0 { self.rebuild(false); }
            self.timers[1] += tb.secs();
            if self.steps % 6 == 0 {
                let tr = Clock::now();
                self.re.run(&mut self.phi, &self.act, nx, ny, nz, self.dx, b, &self.gopen, &self.open);
                self.timers[2] += tr.secs();
                let tb = Clock::now();
                self.rebuild(false);
                self.timers[1] += tb.secs();
            }
        }
        self.t
    }
}

/// Unchecked read (the band holds only interior indices; the stencil is guarded by the i, j, k bounds).
#[inline(always)]
fn g(f: &[f32], i: usize) -> f64 {
    debug_assert!(i < f.len());
    unsafe { *f.get_unchecked(i) as f64 }
}

#[inline(always)]
fn mm(a: f64, b: f64) -> f64 {
    if a * b <= 0.0 { 0.0 } else if a > 0.0 { if a < b { a } else { b } } else if a > b { a } else { b }
}

/// Read-only data of the time step (grid, dissipation, rate table, top-row boundary).
struct Kern<'a> {
    nx: usize, ny: usize, nz: usize, nxy: usize,
    idx: f64,
    al: [f64; 3],
    e: [f64; 9],
    tab: &'a [f32],
    n: usize,
    gopen: &'a [f32],
    open: &'a [u8],
    kz: &'a [f32],
}

impl<'a> Kern<'a> {
    /// Hamiltonian with Lax-Friedrichs dissipation at node q of field f (same as `ham` in etch-engine.js).
    /// One-sided differences are second order (ENO, minmod limiter) where the stencil fits in the grid;
    /// in z next to the surface (k < 2) they stay first order, with the top-row ghost value.
    #[inline(always)]
    fn ham(&self, f: &[f32], q: usize, i: usize, j: usize, k: usize, o2: bool) -> f64 {
        let (nx, ny, nz, nxy, idx) = (self.nx, self.ny, self.nz, self.nxy, self.idx);
        let r = q - k * nxy;
        let c = g(f, q);
        let xm = if i > 0 { g(f, q - 1) } else { c };
        let xp = if i < nx - 1 { g(f, q + 1) } else { c };
        let ym = if j > 0 { g(f, q - nx) } else { c };
        let yp = if j < ny - 1 { g(f, q + nx) } else { c };
        let zp = if k < nz - 1 { g(f, q + nxy) } else { c };
        let mut dxm = (c - xm) * idx;
        let mut dxp = (xp - c) * idx;
        let mut dym = (c - ym) * idx;
        let mut dyp = (yp - c) * idx;
        let mut dzp = (zp - c) * idx;
        if o2 {
            let xmm = if i > 1 { g(f, q - 2) } else { xm };
            let xpp = if i + 2 < nx { g(f, q + 2) } else { xp };
            let ymm = if j > 1 { g(f, q - 2 * nx) } else { ym };
            let ypp = if j + 2 < ny { g(f, q + 2 * nx) } else { yp };
            let cx = xp - 2.0 * c + xm;
            let cy = yp - 2.0 * c + ym;
            dxm += 0.5 * mm(c - 2.0 * xm + xmm, cx) * idx;
            dxp -= 0.5 * mm(cx, xpp - 2.0 * xp + c) * idx;
            dym += 0.5 * mm(c - 2.0 * ym + ymm, cy) * idx;
            dyp -= 0.5 * mm(cy, ypp - 2.0 * yp + c) * idx;
        }
        let px = 0.5 * (dxm + dxp);
        let py = 0.5 * (dym + dyp);
        let mut zm;
        let mut wall = false;
        if k > 0 {
            zm = g(f, q - nxy);
        } else {
            zm = 2.0 * c - zp;
            if unsafe { *self.open.get_unchecked(r) } != 0 {
                let g = unsafe { *self.gopen.get_unchecked(r) } as f64;
                if zm > g { zm = g; }
            } else if dzp * dzp < 0.1225 * (px * px + py * py) {
                wall = true; // near-vertical wall under the mask: no flux through the mask, no z dissipation
            } else if zm < c {
                zm = c;
            }
        }
        let mut dzm = (c - zm) * idx;
        if o2 && k > 1 {
            let zmm = g(f, q - 2 * nxy);
            let zpp = if k + 2 < nz { g(f, q + 2 * nxy) } else { zp };
            let cz = zp - 2.0 * c + zm;
            dzm += 0.5 * mm(c - 2.0 * zm + zmm, cz) * idx;
            dzp -= 0.5 * mm(cz, zpp - 2.0 * zp + c) * idx;
        }
        let pz = if wall { 0.0 } else { -0.5 * (dzm + dzp) }; // grid k runs downward
        let pn = (px * px + py * py + pz * pz).sqrt();
        let mut hn = 0.0f64;
        if pn > 1e-12 {
            // crystal components of the gradient; the table needs only their ratios, so no normalisation
            let e = &self.e;
            let mut a = (e[0] * px + e[3] * py + e[6] * pz).abs();
            let mut bb = (e[1] * px + e[4] * py + e[7] * pz).abs();
            let mut cc = (e[2] * px + e[5] * py + e[8] * pz).abs();
            let mut t;
            if bb > a { t = a; a = bb; bb = t; }
            if cc > a { t = a; a = cc; cc = t; }
            if cc > bb { t = bb; bb = cc; cc = t; }
            let _ = t;
            let n = self.n;
            let wt = n + 1;
            let ia = n as f64 / a;
            let fu = bb * ia;
            let fv = cc * ia;
            let mut iu = fu as usize;
            let mut iv = fv as usize;
            if iu >= n { iu = n - 1; }
            if iv >= n { iv = n - 1; }
            let du = fu - iu as f64;
            let dv = fv - iv as f64;
            let o = iu * wt + iv;
            let tab = self.tab;
            let (t00, t01, t10, t11) = (g(tab, o), g(tab, o + 1), g(tab, o + wt), g(tab, o + wt + 1));
            hn = ((t00 * (1.0 - dv) + t01 * dv) * (1.0 - du) + (t10 * (1.0 - dv) + t11 * dv) * du) * pn;
        }
        // the layer factor scales the rate and the dissipation together (local Lax-Friedrichs); exactly 1 outside a layer
        g(self.kz, k) * (hn - 0.5 * (self.al[0] * (dxp - dxm) + self.al[1] * (dyp - dym) + self.al[2] * (dzp - dzm)))
    }
}

/// Fast-marching re-initialisation of the band to a signed distance (capped at B).
struct Reinit {
    st: Vec<u8>,
    dist: Vec<f32>,
    hv: Vec<f32>,
    hi: Vec<i32>,
    touched: Vec<usize>,
}

impl Reinit {
    fn new(nn: usize) -> Reinit {
        Reinit { st: vec![0; nn], dist: vec![0.0; nn], hv: Vec::with_capacity(1 << 16), hi: Vec::with_capacity(1 << 16), touched: Vec::new() }
    }

    fn push(&mut self, v: f64, q: usize) {
        // the JavaScript heap compares the stored f32 keys with the incoming f64 value
        let mut k = self.hv.len();
        self.hv.push(0.0);
        self.hi.push(0);
        while k > 0 {
            let p = (k - 1) >> 1;
            if (self.hv[p] as f64) <= v { break; }
            self.hv[k] = self.hv[p];
            self.hi[k] = self.hi[p];
            k = p;
        }
        self.hv[k] = v as f32;
        self.hi[k] = q as i32;
    }

    fn pop(&mut self) -> usize {
        let q = self.hi[0] as usize;
        let lv = self.hv.pop().unwrap();
        let li = self.hi.pop().unwrap();
        let hn = self.hv.len();
        if hn == 0 { return q; }
        let mut k = 0usize;
        loop {
            let mut c = 2 * k + 1;
            if c >= hn { break; }
            if c + 1 < hn && self.hv[c + 1] < self.hv[c] { c += 1; }
            if self.hv[c] >= lv { break; }
            self.hv[k] = self.hv[c];
            self.hi[k] = self.hi[c];
            k = c;
        }
        self.hv[k] = lv;
        self.hi[k] = li;
        q
    }

    #[inline]
    fn nb(q: usize, nx: usize, ny: usize, nz: usize) -> [isize; 6] {
        let nxy = nx * ny;
        let k = q / nxy;
        let r = q - k * nxy;
        let j = r / nx;
        let i = r - j * nx;
        let qi = q as isize;
        [
            if i > 0 { qi - 1 } else { -1 },
            if i < nx - 1 { qi + 1 } else { -1 },
            if j > 0 { qi - nx as isize } else { -1 },
            if j < ny - 1 { qi + nx as isize } else { -1 },
            if k > 0 { qi - nxy as isize } else { -1 },
            if k < nz - 1 { qi + nxy as isize } else { -1 },
        ]
    }

    fn solve(&self, q: usize, nx: usize, ny: usize, nz: usize, dx: f64) -> f64 {
        let nbr = Self::nb(q, nx, ny, nz);
        let mut a3 = [0.0f64; 3];
        let mut na = 0;
        for ax in 0..3 {
            let mut m = f64::INFINITY;
            for s in 0..2 {
                let r = nbr[2 * ax + s];
                if r >= 0 {
                    let r = r as usize;
                    if self.st[r] == 2 && (self.dist[r] as f64) < m { m = self.dist[r] as f64; }
                }
            }
            if m < f64::INFINITY { a3[na] = m; na += 1; }
        }
        if na == 0 { return f64::INFINITY; }
        for a in 1..na {
            let v = a3[a];
            let mut b = a as isize - 1;
            while b >= 0 && a3[b as usize] > v { a3[(b + 1) as usize] = a3[b as usize]; b -= 1; }
            a3[(b + 1) as usize] = v;
        }
        let mut d = a3[0] + dx;
        if na > 1 && d > a3[1] {
            d = 0.5 * (a3[0] + a3[1] + (2.0 * dx * dx - (a3[0] - a3[1]).powi(2)).max(0.0).sqrt());
            if na > 2 && d > a3[2] {
                let s = a3[0] + a3[1] + a3[2];
                let q2 = a3[0] * a3[0] + a3[1] * a3[1] + a3[2] * a3[2];
                d = (s + (s * s - 3.0 * (q2 - dx * dx)).max(0.0).sqrt()) / 3.0;
            }
        }
        d
    }

    #[allow(clippy::too_many_arguments)]
    fn run(&mut self, phi: &mut [f32], list: &[i32], nx: usize, ny: usize, nz: usize, dx: f64, b: f64, gopen: &[f32], open: &[u8]) {
        self.hv.clear();
        self.hi.clear();
        self.touched.clear();
        for &qq in list.iter() {
            let q = qq as usize;
            let c = phi[q] as f64;
            let nbr = Self::nb(q, nx, ny, nz);
            let mut inv = 0.0f64;
            let mut any = false;
            for ax in 0..3 {
                let mut best = f64::INFINITY;
                for s in 0..2 {
                    let r = nbr[2 * ax + s];
                    // top row: the etchant above an opening (ghost value)
                    let o = if r >= 0 { phi[r as usize] as f64 } else if ax == 2 && s == 0 && open[q] != 0 { gopen[q] as f64 } else { continue };
                    if (c > 0.0) != (o > 0.0) {
                        let f = c / (c - o);
                        if f < best { best = f; }
                    }
                }
                if best < f64::INFINITY {
                    let dd = (best * dx).max(1e-3 * dx);
                    inv += 1.0 / (dd * dd);
                    any = true;
                }
            }
            if any {
                // silicon seeds: distance from the linear crossings; etched seeds keep their value (the front stays put)
                self.dist[q] = if c > 0.0 { (1.0 / inv.sqrt()) as f32 } else { (-c) as f32 };
                self.st[q] = 2;
                self.touched.push(q);
            }
        }
        let n_init = self.touched.len();
        for m in 0..n_init {
            let nbr = Self::nb(self.touched[m], nx, ny, nz);
            for s in 0..6 {
                let r = nbr[s];
                if r >= 0 && self.st[r as usize] == 0 {
                    let r = r as usize;
                    self.st[r] = 1;
                    let v = self.solve(r, nx, ny, nz, dx);
                    self.push(v, r);
                }
            }
        }
        while !self.hv.is_empty() {
            let q = self.pop();
            if self.st[q] == 2 { continue; }
            let d = self.solve(q, nx, ny, nz, dx);
            self.st[q] = 2;
            self.dist[q] = d as f32;
            self.touched.push(q);
            if d >= b { continue; }
            let nbr = Self::nb(q, nx, ny, nz);
            for s in 0..6 {
                let r = nbr[s];
                if r >= 0 && self.st[r as usize] != 2 {
                    let r = r as usize;
                    self.st[r] = 1;
                    let v = self.solve(r, nx, ny, nz, dx);
                    self.push(v, r);
                }
            }
        }
        // band nodes the marching did not reach are farther than B from the front: back to +-B, so values that
        // drifted just below B under the dissipation cannot grow the band into the whole grid
        for &qq in list.iter() {
            let q = qq as usize;
            if self.st[q] != 2 { phi[q] = if phi[q] > 0.0 { b as f32 } else { -b as f32 }; }
        }
        for m in 0..self.touched.len() {
            let q = self.touched[m];
            let sg = if phi[q] > 0.0 { 1.0f64 } else { -1.0 };
            phi[q] = (sg * b.min(self.dist[q] as f64)) as f32;
            self.st[q] = 0;
        }
    }
}

/// Wall clock for the native timing; a no-op in WebAssembly (no clock without imports).
struct Clock(#[cfg(not(target_arch = "wasm32"))] std::time::Instant);
impl Clock {
    #[inline(always)]
    fn now() -> Clock { Clock(#[cfg(not(target_arch = "wasm32"))] std::time::Instant::now()) }
    #[inline(always)]
    fn secs(&self) -> f64 {
        #[cfg(not(target_arch = "wasm32"))]
        { self.0.elapsed().as_secs_f64() }
        #[cfg(target_arch = "wasm32")]
        { 0.0 }
    }
}

#[cfg(test)]
mod tests {
    use super::Sim;

    /// A flat (100) front etched at a constant rate R moves down by R·t (within one cell).
    #[test]
    fn flat_front_moves_at_the_rate() {
        let (nx, ny, nz, n) = (4, 4, 40, 8);
        let mut s = Sim::new(nx, ny, nz, n);
        let dx = 1.0;
        s.dx = dx; s.b = 4.0 * dx; s.al = [1.0, 1.0, 1.0]; s.dt0 = 0.9 * dx / 3.0;
        for v in s.tab.iter_mut() { *v = 1.0; }                 // R = 1 µm/min for every orientation
        s.e.copy_from_slice(&[1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0]);
        for g in s.gopen.iter_mut() { *g = -0.5 * dx as f32; }
        for o in s.open.iter_mut() { *o = 1; }
        let z0 = 5.0;
        for k in 0..nz { for q in 0..nx * ny {
            let v = ((k as f64 + 0.5) * dx - z0).clamp(-s.b, s.b);
            s.phi[k * nx * ny + q] = v as f32;
            if v <= 0.0 { s.tarr[k * nx * ny + q] = 0.0; }
        } }
        s.rebuild(true);
        let t = 12.0;
        s.step(t, u32::MAX);
        // zero crossing in the middle column
        let col: Vec<f64> = (0..nz).map(|k| s.phi[k * nx * ny + nx + 1] as f64).collect();
        let k = (0..nz - 1).find(|&k| col[k] <= 0.0 && col[k + 1] > 0.0).expect("front found");
        let z = (k as f64 + 0.5 + col[k] / (col[k] - col[k + 1])) * dx;
        assert!((z - (z0 + t)).abs() <= dx, "front at {z}, expected {}", z0 + t);
        // arrival time of a node 6 µm below the start: about 6 min
        let q = 10 * nx * ny + nx + 1;    // node centre at 10.5 µm
        assert!((s.tarr[q] as f64 - 5.5).abs() <= 1.0, "arrival {}", s.tarr[q]);
    }
}
