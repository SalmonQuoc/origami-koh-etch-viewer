// --------------------------------------------------------------------- FIND ORIENTATION scene
// The crystal is turned by FD.delta (deg, counter-clockwise) from the flat. Test structures (slot fans, circle arcs) are etched
// with the analytic plane model and read with a finite resolution; the estimate turns the device shapes (error reduction).
const FD: FinderState = { relW: 1, delta: 1.3, reveal: true, rate: "PAL30", final: true, t: 600, res: 0.5, items: [], sel: 0, correct: false, wfLoaded: null, mc: null, an: null };
const FD_KINDS = { fan: "slot fan (test)", arc: "circle arc (test)" };
function fdLecture(wf) {   // the layouts of Lec 10 p. 18 ((100)) and pp. 25-26 ((110)); positions and fan sizes are design choices
  const fan = { kind: "fan", x: 14, y: -6, n: 11, step: 1, L: 10000, w: 20, gap: 2000, base: 0 };
  if (wf === "110") return [fan, { kind: "arc", R: 48.9, phi0: 90, n: 41, p: 51, d: 40 },
    Object.assign(shp("para", "open", 0, 0, 3000, 200, 0, { a1: 54.7356, a2: 125.2644 }), { kind: "shape", x: -14, y: 18 })];
  return [fan, { kind: "arc", R: 45, phi0: 180, n: 41, p: 80, d: 75 },
    Object.assign(shp("rect", "open", 0, 0, 8000, 200), { kind: "shape", x: 14, y: 26 })];
}
const fdWf = () => S.wf === "111" ? "100" : S.wf;
const fdFrameE = () => C.FRAMES[fdWf()];
const rot2 = (p, deg, c = [0, 0]) => { const a = deg/C.DEG, cs = Math.cos(a), sn = Math.sin(a), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x*cs - y*sn, c[1] + x*sn + y*cs]; };
const hsup = (P, n) => { let m = -Infinity; for (const p of P) m = Math.max(m, p[0]*n[0] + p[1]*n[1]); return m; };
const dirv = deg => [Math.cos(deg/C.DEG), Math.sin(deg/C.DEG)];
const quant = v => FD.res > 0 ? Math.round(v/FD.res)*FD.res : v;
// a trench width is read to the larger of the readable length and a fraction of the width (the whole trench must fit the field)
const quantW = v => { const r = Math.max(FD.res, FD.relW/100*Math.abs(v)); return r > 0 ? Math.round(v/r)*r : v; };
// etched outline (z = 0) of a convex opening O (µm, wafer frame) when the crystal is turned by rot
function fdEtch(O, rot) {
  const c = O.reduce((a, p) => [a[0] + p[0]/O.length, a[1] + p[1]/O.length], [0, 0]), L = O.map(p => [p[0] - c[0], p[1] - c[1]]);
  const H = C.etchH(fdWf(), L, FD.final ? { rot } : { rot, t: FD.t, rates: RATES[FD.rate].r });
  return C.outline(H, 0).map(p => [p[0] + c[0], p[1] + c[1]]);
}
// geometry of the items (µm)
function fdSlots(it) {
  const mid = (it.n - 1)/2, nb = dirv(it.base + 90), out = [];
  for (let k = 0; k < it.n; k++) {
    const th = it.base + (k - mid)*it.step, cx = it.x*1000 + (k - mid)*it.gap*nb[0], cy = it.y*1000 + (k - mid)*it.gap*nb[1];
    out.push({ th, rel: th - it.base, poly: C.rect(cx, cy, it.L, it.w, th) });
  }
  return out;
}
function fdCircles(it) {
  const R = it.R*1000, dphi = it.p/R, mid = (it.n - 1)/2, out = [];
  for (let k = 0; k < it.n; k++) { const ph = it.phi0/C.DEG + (k - mid)*dphi; out.push({ c: [R*Math.cos(ph), R*Math.sin(ph)], rel: (k - mid)*dphi*C.DEG }); }
  return out;
}
const fdStep = it => it.kind === "fan" ? it.step : it.p/(it.R*1000)*C.DEG;   // angular step between neighbours (deg)
// ---- estimators (also used by the random-wafer test with the long-etch formulas)
function estFan(rel, W, step) {   // rel: slot angles from the base (deg); W: read widths
  const n = W.length, m = Math.min(...W), ks = W.map((v, k) => v === m ? k : -1).filter(k => k >= 0);
  if (n === 1) return { kind: "single", note: "one slot: |δ| only, sign unknown" };
  const k0 = ks[0], k1 = ks[ks.length - 1];
  if (k0 === 0 || k1 === n - 1) return { valid: false, note: `narrowest slot at the end of the fan: δ is beyond ${rel[k0 === 0 ? 0 : n - 1].toFixed(2)}°` };
  const pick = (rel[k0] + rel[k1])/2, uPick = (k1 - k0)*step/2 + step/2;
  let fit = pick, uFit = uPick;
  if (k0 === k1) {   // V through the minimum: the higher neighbour fixes the slope
    const a = W[k0 - 1], b = W[k0 + 1], hi = Math.max(a, b) - m;
    if (hi > 0) { const rr = Math.max(FD.res, FD.relW/100*Math.max(a, b)); fit = rel[k0] + 0.5*step*(a - b)/hi; uFit = Math.min(uPick, step*rr/hi + 1e-4); }
  }
  return { valid: true, pick, uPick, fit, uFit, k: k0 };
}
function estArc(rel, D, step) {   // D[k]: read edge offset between circles k and k+1 (µm); rel: circle angles from the middle
  const mids = D.map((_, k) => (rel[k] + rel[k + 1])/2), zs = D.map((v, k) => v === 0 ? k : -1).filter(k => k >= 0);
  if (zs.length) {
    const a = zs[0], b = zs[zs.length - 1];
    if (a === 0 && b === D.length - 1) return { valid: false, note: "all offsets read zero: use a larger pitch or a finer reading" };
    if (a === 0 || b === D.length - 1) return { valid: false, note: `the zero readings reach the end of the arc: δ may lie beyond ±${(Math.abs(rel[0]) + step/2).toFixed(2)}°` };
    return { valid: true, est: (mids[a] + mids[b])/2, unc: (mids[b] - mids[a])/2 + step/2, k: Math.round((a + b)/2) };
  }
  for (let k = 0; k + 1 < D.length; k++) if (Math.sign(D[k]) !== Math.sign(D[k + 1])) {
    const f = D[k]/(D[k] - D[k + 1]); return { valid: true, est: mids[k] + f*(mids[k + 1] - mids[k]), unc: step/2, k };
  }
  return { valid: false, note: `no aligned pair: δ is outside ±${(Math.abs(rel[0]) + step/2).toFixed(2)}° of the arc` };
}
// ---- analysis of the current layout at the true δ
function fdAnalyse() {
  const d = FD.delta, res = [];
  FD.items.forEach((it, i) => {
    if (it.kind === "fan") {
      const sl = fdSlots(it), nT = dirv(it.base + d + 90);
      const out = sl.map(s => fdEtch(s.poly, d)), W = out.map(O => hsup(O, nT) + hsup(O, [-nT[0], -nT[1]])), Wr = W.map(quantW);
      const e = estFan(sl.map(s => s.rel), Wr, it.step);
      if (e.kind === "single") { const x = Math.max(-1, Math.min(1, (Wr[0] - it.w)/it.L)); (e as any).abs = Math.asin(Math.max(0, x))*C.DEG; }
      res[i] = { it, sl, out, W, Wr, e };
    } else if (it.kind === "arc") {
      const cs = fdCircles(it), m = (it.n - 1)/2, tauMid = it.phi0 + 90, nT = dirv(tauMid + d + 90);
      const base = C.circle(it.d/2, 48), out = cs.map(c => fdEtch(base.map(p => [p[0] + c.c[0], p[1] + c.c[1]]), d));
      const h = out.map(O => hsup(O, nT)), D = h.slice(1).map((v, k) => v - h[k]);
      // sign: positive when the next circle sits further along the true edge normal; orient so D grows with the angle
      const Dr = D.map(quant), e = estArc(cs.map(c => c.rel), Dr, fdStep(it));
      res[i] = { it, cs, out, D, Dr, e, tauMid, m };
    } else res[i] = { it };
  });
  // best estimate: the valid one with the smallest uncertainty
  let best = null;
  res.forEach((r, i) => {
    if (!r.e || !r.e.valid) return;
    const v = r.it.kind === "fan" ? { est: r.e.fit, unc: r.e.uFit } : { est: r.e.est, unc: r.e.unc };
    if (!best || v.unc < best.unc) best = Object.assign(v, { i });
  });
  // devices: widening beyond the mask edge before and after turning the mask by the estimate
  const corr = FD.correct && best ? best.est : 0;
  res.forEach(r => {
    if (r.it.kind !== "shape") return;
    const sh = Object.assign({}, r.it, { cx: r.it.x*1000, cy: r.it.y*1000 });
    const run = turn => {
      const pieces = shapePieces(sh).map(P => P.map(p => rot2(p, turn, [sh.cx, sh.cy])));
      const outs = pieces.map(P => fdEtch(P, d));
      return { pieces, outs, U: Math.max(0, ...outs.map(O => beyondAll(O, pieces))) };
    };
    r.before = run(0); r.after = best ? run(best.est) : null; r.now = FD.correct && best ? r.after : r.before;
    if (sh.type === "rect" && fdWf() === "100") { const l = Math.max(sh.w, sh.h), a = Math.abs((sh.w >= sh.h ? sh.ang : sh.ang + 90) - d)/C.DEG; r.eq71 = l*Math.abs(Math.sin(a)*Math.cos(a)); }
  });
  FD.an = { res, best, corr };
  return FD.an;
}
// ---- random wafers: long-etch formulas, readings rounded
function fdMonteCarlo(N = 500, dmax = 5) {
  let seed = 12345; const rnd = () => { seed = (seed*1664525 + 1013904223) >>> 0; return seed/4294967296; };
  const stats = FD.items.map(() => ({ n: 0, ok: 0, se: 0, mx: 0, inside: 0 })), best = { n: 0, se: 0, mx: 0, inside: 0 };
  for (let t = 0; t < N; t++) {
    const d = (2*rnd() - 1)*dmax; let b = null;
    FD.items.forEach((it, i) => {
      let e = null, est, unc;
      if (it.kind === "fan") {
        const mid = (it.n - 1)/2, rel = [], W = [];
        for (let k = 0; k < it.n; k++) { const th = (k - mid)*it.step, a = (it.base + th - (it.base + d))/C.DEG; rel.push(th); W.push(quantW(it.w*Math.abs(Math.cos(a)) + it.L*Math.abs(Math.sin(a)))); }
        e = estFan(rel, W, it.step); if (e.valid) { est = e.fit; unc = e.uFit; }
      } else if (it.kind === "arc") {
        const st = fdStep(it), mid = (it.n - 1)/2, rel = [], D = [];
        for (let k = 0; k < it.n; k++) rel.push((k - mid)*st);
        for (let k = 0; k + 1 < it.n; k++) D.push(quant(it.p*Math.sin(((rel[k] + rel[k + 1])/2 - d)/C.DEG)));
        e = estArc(rel, D, st); if (e.valid) { est = e.est; unc = e.unc; }
      } else return;
      const s = stats[i]; s.n++;
      if (e && e.valid) { const err = Math.abs(est - d); s.ok++; s.se += err*err; s.mx = Math.max(s.mx, err); if (err <= unc + 1e-9) s.inside++; if (!b || unc < b.unc) b = { est, unc }; }
    });
    if (b) { const err = Math.abs(b.est - d); best.n++; best.se += err*err; best.mx = Math.max(best.mx, err); if (err <= b.unc + 1e-9) best.inside++; }
  }
  return { N, dmax, stats, best };
}
// ---- 3D view: the wafer with the etched outlines
function buildFind(resetView) {
  scene = new THREE.Scene(); scene.background = COL["scene-bg"]; clearLabels();
  const wf = fdWf(), an = FD.an || fdAnalyse();
  radius = 600; frameR = 0.53*WAFER.D;
  const g = new THREE.Group(); scene.add(g);
  g.add(waferGroup(wf, S.wtype, 0, 0, { flatLabel: idxHTML(C.FRAME_IDX[wf][0], "[", "]") + " (as drawn)", normalLabel: idxHTML(negIdx(C.FRAME_IDX[wf][1]), "[", "]") }));
  const z = 3, lift = P => P.map(p => [p[0], p[1], z]);
  const maskL = [], etchL = [], R = WAFER.D/2;
  for (const r of an.res) {
    if (!r) continue;
    if (r.sl) { r.sl.forEach(s => maskL.push(lift(s.poly))); r.out.forEach(O => etchL.push(lift(O))); }
    else if (r.cs) { const base = C.circle(r.it.d/2, 24); r.cs.forEach(c => maskL.push(lift(base.map(p => [p[0] + c.c[0], p[1] + c.c[1]])))); r.out.forEach(O => etchL.push(lift(O)));
      const ends = [r.cs[0].c, r.cs[r.cs.length - 1].c]; g.add(linesFromLoops([[[ends[0][0], ends[0][1], z], [ends[1][0], ends[1][1], z]]], COL.accent)); }
    else if (r.now) { r.now.pieces.forEach(P => maskL.push(lift(P))); r.now.outs.forEach(O => etchL.push(lift(O))); }
  }
  if (maskL.length) g.add(linesFromLoops(maskL, COL.mask));
  if (etchL.length) { const L = linesFromLoops(etchL, COL.ghost); g.add(L); }
  // nominal ⟨110⟩ (along the flat) and, if shown, the true one
  g.add(linesFromLoops([[[-0.9*R, 0, z], [0.9*R, 0, z]]], COL["s-ink"], { dashed: true, dash: 1500, gap: 1000, opacity: 0.6 }));
  labelTag = "wafer";
  addLabel(new V3(-0.5*R, 0.05*R, 0), "flat direction", "");
  if (FD.reveal) { const u = dirv(FD.delta); g.add(linesFromLoops([[[-0.9*R*u[0], -0.9*R*u[1], z], [0.9*R*u[0], 0.9*R*u[1], z]]], COL.accent)); addLabel(new V3(0.92*R*u[0], 0.92*R*u[1] - 0.05*R, 0), `true ⟨110⟩ (δ = ${FD.delta.toFixed(2)}°)`, "acc"); }
  an.res.forEach((r, i) => {
    if (!r) return; const p = fdPos(r.it);
    addLabel(new V3(p[0], p[1] + 0.05*R, 0), `${i + 1}`, i === FD.sel ? "acc big" : "big");
  });
  labelTag = null;
  scene.userData.center = new V3(0, 0, 0); scene.userData.die = null;
  if (resetView) setView(dirOf(89.5, -90), scene.userData.center, true);
  resize();
}
const fdPos = it => it.kind === "arc" ? [it.R*1000*Math.cos(it.phi0/C.DEG), it.R*1000*Math.sin(it.phi0/C.DEG)] : [it.x*1000, it.y*1000];
// ---- panel: readout, device table, cards
const fdFmt = (v, u) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(v === 0 ? 2 : Math.abs(u) < 0.01 ? 4 : 3)}° ± ${u < 0.001 ? u.toExponential(1) : u.toFixed(u < 0.01 ? 4 : 3)}°`;
function fdReadout() {
  const an = FD.an, rows = [];
  rows.push(["true δ", FD.reveal ? `${FD.delta.toFixed(3)}°` : "hidden"]);
  rows.push(["flat alone", "δ unknown within ±2–5° (Lec 10 p. 18)"]);
  an.res.forEach((r, i) => {
    if (!r || r.it.kind === "shape") return;
    const e = r.e, name = r.it.kind === "fan" ? `${i + 1} · slot fan` : `${i + 1} · circle arc (${fdStep(r.it).toFixed(3)}° steps)`;
    if (e.kind === "single") rows.push([name, `one slot, width ${r.Wr[0].toFixed(1)} µm → |δ| ≈ ${e.abs.toFixed(3)}°, sign unknown`]);
    else if (!e.valid) rows.push([name, e.note]);
    else if (r.it.kind === "fan") rows.push([name, `narrowest slot: ${fdFmt(e.pick, e.uPick)}<br>V-fit of 3 widths: ${fdFmt(e.fit, e.uFit)}`]);
    else rows.push([name, `aligned pair near circle ${e.k + 1}: ${fdFmt(e.est, e.unc)}`]);
  });
  const b = an.best;
  rows.push(["best estimate", b ? `${fdFmt(b.est, b.unc)} (item ${b.i + 1})` : "no valid reading"]);
  if (b && FD.reveal) rows.push(["error of the estimate", `${(b.est - FD.delta).toFixed(4)}° (${Math.abs(b.est - FD.delta) <= b.unc + 1e-9 ? "inside" : "outside"} the stated ±)`]);
  $("fdReadout").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  const dv = [];
  an.res.forEach((r, i) => {
    if (!r || r.it.kind !== "shape") return;
    dv.push([`${i + 1} · ${SHAPE_TYPES[r.it.type].name}`, `beyond the mask edge: ${r.before.U.toFixed(1)} µm as drawn${r.after ? `, ${r.after.U.toFixed(1)} µm turned by the estimate` : ""}${r.eq71 != null ? `<br>eq. 7.1, l sin δ cos δ = ${r.eq71.toFixed(1)} µm (Pal & Sato p. 289)` : ""}`]);
  });
  if (!dv.length) dv.push(["devices", "add a shape (rectangle, L, parallelogram …) to see the error it gets"]);
  $("fdDevice").innerHTML = dv.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  const mc = FD.mc;
  $("fdMCout").innerHTML = mc ? [[`random δ`, `${mc.N} wafers, δ uniform in ±${mc.dmax}° (flat alone: rms ${(mc.dmax/Math.sqrt(3)).toFixed(2)}°)`],
    ...mc.stats.map((s, i) => s.n ? [`${i + 1} · ${FD_KINDS[FD.items[i].kind]}`, `read on ${(100*s.ok/s.n).toFixed(0)} %; rms error ${Math.sqrt(s.se/Math.max(1, s.ok)).toFixed(4)}°, max ${s.mx.toFixed(4)}°; inside its ± on ${(100*s.inside/Math.max(1, s.ok)).toFixed(0)} %`] : null).filter(Boolean),
    ["best of the layout", `read on ${(100*mc.best.n/mc.N).toFixed(0)} %; rms ${Math.sqrt(mc.best.se/Math.max(1, mc.best.n)).toFixed(4)}°, max ${mc.best.mx.toFixed(4)}°`]].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("") : "";
}
function fdCards() {
  const dirs = inPlaneDirs(fdFrameE());
  const f = (i, k, v, lbl, st = 1) => `<label>${lbl}<input type="number" step="${st}" data-i="${i}" data-k="${k}" aria-label="${lbl}" value="${+(+(v == null ? 0 : v)).toFixed(3)}"></label>`;
  $("fdList").innerHTML = FD.items.map((it, i) => {
    let body;
    if (it.kind === "fan") body = `<div class="fl">${f(i, "x", it.x, "x mm")}${f(i, "y", it.y, "y mm")}${f(i, "n", it.n, "slots")}${f(i, "step", it.step, "step°", 0.1)}${f(i, "base", it.base, "middle at°", 1)}</div><div class="fl">${f(i, "L", it.L, "length L", 500)}${f(i, "w", it.w, "width w", 5)}${f(i, "gap", it.gap, "spacing", 100)}<span class="note">µm</span></div>`;
    else if (it.kind === "arc") body = `<div class="fl">${f(i, "R", it.R, "arc R mm", 0.5)}${f(i, "phi0", it.phi0, "at°", 90)}${f(i, "n", it.n, "circles")}</div><div class="fl">${f(i, "p", it.p, "pitch p", 1)}${f(i, "d", it.d, "Ø d", 5)}<span class="note">µm · step p/R = ${fdStep(it).toFixed(4)}°, range ±${(fdStep(it)*(it.n - 1)/2).toFixed(2)}°</span></div>`;
    else { const T = SHAPE_TYPES[it.type]; const lab = { w: "w", h: "h", t: it.type === "ring" || it.type === "star" ? "inner" : "arm t", n: it.type === "star" ? "points" : "sides" };
      body = `<div class="fl">${f(i, "x", it.x, "x mm")}${f(i, "y", it.y, "y mm")}${it.type === "para" ? f(i, "a1", it.a1, "side 1°") + f(i, "a2", it.a2, "side 2°") : f(i, "ang", it.ang, "angle°")}</div>${T.f.length ? `<div class="fl">${T.f.map(k => f(i, k, it[k], lab[k], k === "n" ? 1 : 5)).join("")}<span class="note">µm</span></div>` : ""}${dirSelects(it, i, dirs)}`; }
    const name = it.kind === "shape" ? `device: ${SHAPE_TYPES[it.type].name}` : FD_KINDS[it.kind];
    return `<div class="card${i === FD.sel ? " sel" : ""}" data-row="${i}"><div class="top"><span><b>${i + 1}. ${name}</b></span><span><button class="x" data-fddup="${i}" title="duplicate (Ctrl+D)" aria-label="duplicate">⧉</button><button class="x" data-fddel="${i}" title="remove" aria-label="remove">×</button></span></div>${body}</div>`;
  }).join("") || `<p class="note">Nothing on the mask. Pick an item and press Add, or double-click on the map.</p>`;
}
// ---- the wafer map editor
function drawFindMap() {
  const cv = $("fdCanvas"); if (!cv) return;
  cv.style.width = "";
  const ctx = cv.getContext("2d"), R = WAFER.D/2; let wcss = cv.clientWidth || 300, s = (wcss - 20)/(2*R);
  { const sh_ = (edMaxH(cv) - 90)/(2.2*R); if (sh_ < s) { s = sh_; wcss = Math.round(2*R*s + 20); cv.style.width = `${wcss}px`; } }
  const PB = Math.round(0.2*R*s), hcss = 2*R*s + 34 + PB;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(wcss*dpr); cv.height = Math.round(hcss*dpr); cv.style.height = `${hcss}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, wcss, hcss);
  const V = edView("fdCanvas", s, 10, 10, 2*R*s, 2*R*s + PB, 0, -PB/s/2, 400);
  FD.ed = { s: V.s, ox: V.ox, oy: V.oy, view: V }; cv.style.height = `${hcss + 28}px`; cv.height = Math.round((hcss + 28)*dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const zs = V.s, toC = p => [FD.ed.ox + p[0]*zs, FD.ed.oy - p[1]*zs], col = c => "#" + COL[c].getHexString();
  ctx.save(); ctx.beginPath(); ctx.rect(10, 10, 2*R*s, 2*R*s + PB); ctx.clip();   // zoomed content stays in the map
  const path = P => { ctx.beginPath(); P.map(toC).forEach((q, k) => k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath(); };
  const wf = fdWf(), O = waferOutline(wf, S.wtype);
  path(O); ctx.fillStyle = col("mask"); ctx.globalAlpha = 0.28; ctx.fill(); ctx.globalAlpha = 1; ctx.strokeStyle = col("s-ink"); ctx.lineWidth = 1; ctx.stroke();
  // flats in the accent colour
  ctx.strokeStyle = col("accent"); ctx.lineWidth = 2.5; ctx.beginPath();
  for (let i = 0; i < O.length; i++) { const a = O[i], b = O[(i + 1) % O.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 5000) { const A = toC(a), B = toC(b); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } }
  ctx.stroke();
  // arrow from the middle of the primary flat, perpendicular to it and pointing outward (away from the centre)
  { const yF = -Math.sqrt(R*R - WAFER.Lp*WAFER.Lp/4), A = toC([0, yF]), B = toC([0, yF - 0.2*R]), h = 7;
    ctx.strokeStyle = ctx.fillStyle = col("accent"); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1] - h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(B[0], B[1]); ctx.lineTo(B[0] - h*0.6, B[1] - h*1.3); ctx.lineTo(B[0] + h*0.6, B[1] - h*1.3); ctx.closePath(); ctx.fill();
    ctx.font = "500 11px IBM Plex Sans, sans-serif"; ctx.fillText(`${plainIdx(negIdx(C.FRAME_IDX[wf][1]))} ⊥ flat, outward`, B[0] + 6, B[1] - 4); }
  // nominal and true ⟨110⟩ through the centre
  ctx.lineWidth = 1; ctx.setLineDash([5, 4]); ctx.strokeStyle = col("s-ink"); ctx.globalAlpha = 0.5; ctx.beginPath(); { const A = toC([-0.95*R, 0]), B = toC([0.95*R, 0]); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); } ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]);
  if (FD.reveal) { const u = dirv(FD.delta); ctx.strokeStyle = col("accent"); ctx.beginPath(); const A = toC([-0.95*R*u[0], -0.95*R*u[1]]), B = toC([0.95*R*u[0], 0.95*R*u[1]]); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); }
  const an = FD.an || fdAnalyse();
  an.res.forEach((r, i) => {
    if (!r) return; const sel = i === FD.sel;
    ctx.strokeStyle = sel ? col("accent") : col("s-ink"); ctx.lineWidth = sel ? 1.8 : 1;
    if (r.sl) { r.out.forEach(P => { path(P); ctx.fillStyle = col("ghost"); ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1; }); r.sl.forEach(q => { path(q.poly); ctx.stroke(); }); }
    else if (r.cs) { ctx.beginPath(); r.cs.forEach((c, k) => { const q = toC(c.c); k ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }); ctx.lineWidth = sel ? 4 : 3; ctx.stroke(); }
    else if (r.now) {
      r.now.outs.forEach(P => { path(P); ctx.fillStyle = col("ghost"); ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1; });
      r.now.pieces.forEach(P => { path(P); ctx.stroke(); });
      const q = toC([r.it.x*1000, r.it.y*1000]); ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, 2*Math.PI); ctx.stroke();
    }
    const q = toC(fdPos(r.it)); ctx.fillStyle = sel ? col("accent") : col("s-ink"); ctx.font = "600 12px IBM Plex Sans, sans-serif"; ctx.fillText(String(i + 1), q[0] + 6, q[1] - 6);
  });
  ctx.restore();
  if (V.z > 1) { ctx.strokeStyle = col("s-ink"); ctx.lineWidth = 1; ctx.strokeRect(10, 10, 2*R*s, 2*R*s + PB); }
  ctx.font = "11px IBM Plex Sans, sans-serif"; ctx.fillStyle = col("s-ink");
  ctx.fillText(`(${wf}) ${S.wtype}-type, Ø 100 mm. Arrow: ⊥ flat, outward.`, 12, 10 + 2*R*s + PB + 16);
  ctx.fillText(`Dashed: flat direction${FD.reveal ? "; orange: true ⟨110⟩" : ""}.`, 12, 10 + 2*R*s + PB + 30);
  ctx.fillText("Violet: mask; blue: etched outline.", 12, 10 + 2*R*s + PB + 44);
  if (S.compass) drawCompass(ctx, 10 + 2*R*s - 40, 50, 28, inPlaneDirs(fdFrameE()), FD.reveal ? FD.delta : 0);
  const it = FD.items && FD.items[FD.sel];
  drawCoords(ctx, "fdCanvas", { X0: V.X0, X1: V.X1, Y0: Math.max(V.Y0, -R), Y1: V.Y1, toC, g: V.z > 1 ? edGrid(V.X1 - V.X0) : 10000, grid: false, k: 1e-3, unit: "mm", snap: false, sel: it ? fdPos(it) : null });
}
// microscope view and the reading plot of the selected item
function drawScope() {
  const cv = $("fdScope"), ctx = cv.getContext("2d"), wcss = cv.clientWidth || 600, hcss = graphH(cv, 240), dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(wcss*dpr); cv.height = Math.round(hcss*dpr); cv.style.height = `${hcss}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, wcss, hcss);
  const col = c => "#" + COL[c].getHexString(), an = FD.an, r = an && an.res[FD.sel];
  ctx.fillStyle = col("scene-bg"); ctx.fillRect(0, 0, wcss, hcss);
  ctx.font = "11px IBM Plex Mono, monospace"; ctx.fillStyle = col("s-ink");
  if (!r) { ctx.fillText("Select an item on the map.", 12, 24); $("fdScopeNote").textContent = ""; return; }
  // gather mask polygons and etched outlines in a local frame
  let mask = [], etch = [], before = [], marks = [], note = "";
  if (r.cs) {
    const k0 = r.e.valid ? r.e.k : Math.floor((r.cs.length - 1)/2), ks = []; for (let k = k0 - 3; k <= k0 + 4; k++) if (k >= 0 && k < r.cs.length) ks.push(k);
    const base = C.circle(r.it.d/2, 48);
    for (const k of ks) { mask.push(base.map(p => [p[0] + r.cs[k].c[0], p[1] + r.cs[k].c[1]])); etch.push(r.out[k]); }
    for (let j = 0; j + 1 < ks.length; j++) { const k = ks[j], a = r.cs[k].c, b = r.cs[k + 1].c; marks.push({ p: [(a[0] + b[0])/2, (a[1] + b[1])/2], t: `${r.Dr[k] >= 0 ? "+" : ""}${r.Dr[k].toFixed(1)}` }); }
    note = `Circles ${ks[0] + 1}–${ks[ks.length - 1] + 1} of ${r.cs.length}. Numbers: read edge offset between neighbours (µm, ${FD.res} µm steps). The aligned pair reads 0.`;
  } else if (r.sl) {
    r.sl.forEach((q, k) => { mask.push(q.poly); etch.push(r.out[k]); marks.push({ p: q.poly.reduce((a, p) => [a[0] + p[0]/4, a[1] + p[1]/4], [0, 0]), t: `${r.Wr[k].toFixed(0)}` }); });
    note = `${r.sl.length} slots; numbers: read etched width (µm). The narrowest slot is closest to ⟨110⟩.`;
  } else if (r.now) {
    mask = r.now.pieces; etch = r.now.outs; if (r.after && FD.correct) before = r.before.outs;
    note = `Device ${FD.sel + 1}: mask (violet), etched outline (blue)${before.length ? ", etched outline without the correction (dashed)" : ""}. Beyond the mask edge: ${r.now.U.toFixed(1)} µm.`;
  }
  const all = mask.concat(etch, before).flat(); if (!all.length) return;
  // turn so that the long direction of the view is horizontal
  let x0 = Math.min(...all.map(p => p[0])), x1 = Math.max(...all.map(p => p[0])), y0 = Math.min(...all.map(p => p[1])), y1 = Math.max(...all.map(p => p[1]));
  const turn = (y1 - y0) > (x1 - x0) ? 90 : 0, c0 = [(x0 + x1)/2, (y0 + y1)/2], T = p => turn ? [-(p[1] - c0[1]), p[0] - c0[0]] : [p[0] - c0[0], p[1] - c0[1]];
  const tAll = all.map(T); x0 = Math.min(...tAll.map(p => p[0])); x1 = Math.max(...tAll.map(p => p[0])); y0 = Math.min(...tAll.map(p => p[1])); y1 = Math.max(...tAll.map(p => p[1]));
  const sc = Math.min((wcss - 40)/Math.max(1, x1 - x0), (hcss - 50)/Math.max(1, y1 - y0)), X = p => 20 + (T(p)[0] - x0)*sc + ((wcss - 40) - (x1 - x0)*sc)/2, Y = p => 25 + (y1 - T(p)[1])*sc;
  const path = P => { ctx.beginPath(); P.forEach((p, k) => k ? ctx.lineTo(X(p), Y(p)) : ctx.moveTo(X(p), Y(p))); ctx.closePath(); };
  ctx.fillStyle = col("mask"); ctx.globalAlpha = 0.25; ctx.fillRect(0, 0, wcss, hcss); ctx.globalAlpha = 1;
  for (const P of etch) { path(P); ctx.fillStyle = col("s-top"); ctx.fill(); ctx.strokeStyle = col("ghost"); ctx.lineWidth = 1.4; ctx.stroke(); }
  ctx.setLineDash([4, 3]); for (const P of before) { path(P); ctx.strokeStyle = col("ghost"); ctx.lineWidth = 1; ctx.stroke(); } ctx.setLineDash([]);
  for (const P of mask) { path(P); ctx.strokeStyle = col("mask"); ctx.lineWidth = 1.2; ctx.stroke(); }
  ctx.fillStyle = col("accent"); ctx.font = "600 11px IBM Plex Mono, monospace"; ctx.textAlign = "center";
  for (const m of marks) ctx.fillText(m.t, X(m.p), Math.min(hcss - 6, Y(m.p) + (r.cs ? -0.6*r.it.d*sc - 6 : 4)));
  ctx.textAlign = "left"; ctx.fillStyle = col("s-ink"); ctx.font = "11px IBM Plex Mono, monospace";
  const bar = niceStep((x1 - x0)/5); ctx.fillRect(20, hcss - 12, bar*sc, 2); ctx.fillText(`${bar >= 1000 ? bar/1000 + " mm" : bar + " µm"}`, 24 + bar*sc, hcss - 8);
  $("fdScopeNote").textContent = note + (turn ? " (view turned by 90°)" : "");
}
function drawFdPlot() {
  const cv = $("fdPlot"), ctx = cv.getContext("2d"), wcss = cv.clientWidth || 600, hcss = 200, dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(wcss*dpr); cv.height = Math.round(hcss*dpr); cv.style.height = `${hcss}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, wcss, hcss);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), ink = css("--ink"), mut = css("--muted"), line = css("--line");
  const an = FD.an, r = an && an.res[FD.sel], leg = $("fdPlotLeg");
  ctx.font = "11px IBM Plex Mono, monospace"; ctx.fillStyle = mut;
  if (!r || !(r.sl || r.cs)) { ctx.fillText("Select a test structure (slot fan or circle arc) to see its reading.", 8, 24); leg.innerHTML = ""; return; }
  const xs = r.sl ? r.sl.map(q => q.rel) : r.cs.slice(1).map((c, k) => (c.rel + r.cs[k].rel)/2), ys = r.sl ? r.Wr : r.Dr;
  const L = 52, Rm = 12, T = 10, B = 30, W = wcss - L - Rm, H = hcss - T - B;
  let xa = Math.min(...xs), xb = Math.max(...xs); const pad = 0.04*(xb - xa || 1); xa -= pad; xb += pad;
  let ya = Math.min(0, ...ys), yb = Math.max(0, ...ys); if (yb - ya < 1e-9) yb = ya + 1; const py = 0.08*(yb - ya); ya -= ya < 0 ? py : 0; yb += py;
  const X = x => L + (x - xa)/(xb - xa)*W, Y = y => T + H - (y - ya)/(yb - ya)*H;
  ctx.strokeStyle = line; ctx.textAlign = "right";
  const ys0 = niceStep((yb - ya)/4); for (let v = Math.ceil(ya/ys0)*ys0; v <= yb; v += ys0) { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(L + W, Y(v)); ctx.stroke(); ctx.fillText(v.toFixed(ys0 < 1 ? 1 : 0), L - 5, Y(v) + 4); }
  ctx.textAlign = "center"; const xs0 = niceStep((xb - xa)/6); for (let v = Math.ceil(xa/xs0)*xs0; v <= xb; v += xs0) ctx.fillText(v.toFixed(xs0 < 0.1 ? 2 : xs0 < 1 ? 1 : 0), X(v), T + H + 14);
  ctx.fillText(r.sl ? "slot angle from the middle slot (°)" : "angle of the line between neighbours, from the middle (°)", L + W/2, hcss - 2);
  ctx.save(); ctx.translate(11, T + H/2); ctx.rotate(-Math.PI/2); ctx.fillText(r.sl ? "etched width (µm)" : "edge offset (µm)", 0, 0); ctx.restore();
  ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + H); ctx.moveTo(L, Y(0)); ctx.lineTo(L + W, Y(0)); ctx.stroke();
  const acc = "#" + COL.accent.getHexString(), gh = "#" + COL.ghost.getHexString();
  ctx.fillStyle = gh; xs.forEach((x, k) => { ctx.beginPath(); ctx.arc(X(x), Y(ys[k]), 3, 0, 2*Math.PI); ctx.fill(); });
  const vline = (x, c, dash) => { if (x < xa || x > xb) return; ctx.strokeStyle = c; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(X(x), T); ctx.lineTo(X(x), T + H); ctx.stroke(); ctx.setLineDash([]); };
  const e = r.e, est = e.valid ? (r.sl ? e.fit : e.est) : null;
  if (est != null) vline(est, acc, []);
  if (FD.reveal) vline(FD.delta, ink, [4, 3]);
  leg.innerHTML = `<span><i style="background:${gh}"></i>reading</span>${est != null ? `<span><i style="background:${acc}"></i>estimate ${est.toFixed(4)}°</span>` : ""}${FD.reveal ? `<span><i style="background:${ink}"></i>true δ ${FD.delta.toFixed(4)}°</span>` : ""}`;
}
function findChanged(resetView?: boolean) { fdAnalyse(); fdCards(); fdReadout(); drawFindMap(); drawScope(); drawFdPlot(); if (S.mode === "find") buildFind(!!resetView); }
function fdSync() { $("fdDelta").value = FD.reveal ? FD.delta : ""; $("fdDelta").disabled = !FD.reveal; $("fdReveal").checked = FD.reveal; $("fdRate").value = FD.rate; $("fdFinal").checked = FD.final; $("fdTime").value = FD.t; $("fdRes").value = FD.res; $("fdRelW").value = FD.relW; $("fdCorrect").checked = FD.correct; }
$("fdRate").innerHTML = Object.entries(RATES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
$("fdType").innerHTML = Object.entries(FD_KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("") + Object.entries(SHAPE_TYPES).filter(([, v]) => !v.noAdd).map(([k, v]) => `<option value="${k}">device: ${v.name}</option>`).join("");
$("fdDelta").addEventListener("change", e => { const v = Number(e.target.value); if (isFinite(v)) FD.delta = v; FD.mc = null; findChanged(); });
$("fdRandom").addEventListener("click", () => { FD.delta = Math.round((Math.random()*10 - 5)*1000)/1000; FD.reveal = false; FD.mc = null; fdSync(); findChanged(); });
$("fdReveal").addEventListener("change", e => { FD.reveal = e.target.checked; fdSync(); findChanged(); });
$("fdRate").addEventListener("change", e => { FD.rate = e.target.value; findChanged(); });
$("fdFinal").addEventListener("change", e => { FD.final = e.target.checked; findChanged(); });
$("fdTime").addEventListener("change", e => { const v = Number(e.target.value); if (v > 0) FD.t = v; findChanged(); });
$("fdRes").addEventListener("change", e => { const v = Number(e.target.value); if (v >= 0) FD.res = v; FD.mc = null; findChanged(); });
$("fdRelW").addEventListener("change", e => { const v = Number(e.target.value); if (v >= 0) FD.relW = v; FD.mc = null; findChanged(); });
$("fdCorrect").addEventListener("change", e => { FD.correct = e.target.checked; findChanged(); });
$("fdMC").addEventListener("click", () => { FD.mc = fdMonteCarlo(500, 5); fdReadout(); });
function fdNew(type, x, y) {
  if (type === "fan") return { kind: "fan", x, y, n: 11, step: 1, L: 10000, w: 20, gap: 2000, base: 0 };
  if (type === "arc") { const R = Math.max(5, Math.min(48, Math.hypot(x, y))); return { kind: "arc", R: Math.round(R*10)/10, phi0: Math.round(Math.atan2(y, x)*C.DEG/90)*90, n: 41, p: 80, d: 75 }; }
  const d = SHAPE_TYPES[type].d, o: Record<string, number> = { w: 10*d.w, h: 10*(d.h || d.w) }; if (d.t) o.t = 10*d.t; if (d.n) o.n = d.n;
  return Object.assign(shp(type, "open", 0, 0, o.w, o.h), d, o, { kind: "shape", x: Math.round(x), y: Math.round(y) }, type === "para" ? paraSides(fdFrameE()) : {});
}
$("fdAdd").addEventListener("click", () => { FD.items.push(fdNew($("fdType").value, -20 + 5*(FD.items.length % 6), 30)); FD.sel = FD.items.length - 1; FD.mc = null; findChanged(); });
$("fdDup").addEventListener("click", () => { const it = FD.items[FD.sel]; if (!it) return; const c = JSON.parse(JSON.stringify(it)); if (c.kind === "arc") c.phi0 = (c.phi0 + 90) % 360; else { c.x += 5; c.y -= 5; } FD.items.push(c); FD.sel = FD.items.length - 1; FD.mc = null; findChanged(); });
$("fdDel").addEventListener("click", () => { if (!FD.items[FD.sel]) return; FD.items.splice(FD.sel, 1); FD.sel = Math.min(FD.sel, FD.items.length - 1); FD.mc = null; findChanged(); });
$("fdReset").addEventListener("click", () => { FD.items = fdLecture(fdWf()); FD.sel = 0; FD.mc = null; findChanged(true); });
$("fdList").addEventListener("change", e => {
  const el = e.target, i = Number(el.dataset.i), k = el.dataset.k; if (!(i >= 0) || !k || el.value === "") return;
  let v = Number(el.value); if (!isFinite(v)) return;
  if (k === "n") v = Math.max(1, Math.min(201, Math.round(v)));
  FD.items[i][k] = v; FD.sel = i; FD.mc = null; findChanged();
});
$("fdList").addEventListener("click", e => {
  const d = e.target.closest("[data-fddel]"); if (d) { FD.sel = Number(d.dataset.fddel); $("fdDel").click(); return; }
  const u = e.target.closest("[data-fddup]"); if (u) { FD.sel = Number(u.dataset.fddup); $("fdDup").click(); return; }
  const r = e.target.closest("[data-row]"); if (r && !["INPUT", "LABEL", "SELECT", "OPTION"].includes(e.target.tagName)) { FD.sel = Number(r.dataset.row); findChanged(); }
});
(() => {
  const cv = $("fdCanvas"); let drag = null;
  const world = ev => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left - FD.ed.ox)/FD.ed.s/1000, -(ev.clientY - r.top - FD.ed.oy)/FD.ed.s/1000]; };   // mm
  const hit = (x, y) => {   // nearest item within 3 mm of its position or its drawn parts
    let bi = -1, bd = Math.max(0.02, 3/((FD.ed.view && FD.ed.view.z) || 1));   // 3 mm at full view, less when zoomed in
    (FD.an ? FD.an.res : []).forEach((r, i) => {
      if (!r) return; const pts = [fdPos(r.it)];
      if (r.cs) for (let k = 0; k < r.cs.length; k += 4) pts.push(r.cs[k].c); if (r.sl) r.sl.forEach(q => pts.push(...q.poly));
      for (const p of pts) { const dd = Math.hypot(p[0]/1000 - x, p[1]/1000 - y); if (dd < bd) { bd = dd; bi = i; } }
    });
    return bi;
  };
  cv.addEventListener("pointerdown", ev => {
    if (!FD.ed) return; const [x, y] = world(ev), i = hit(x, y);
    let j = i; if (i >= 0 && ev.altKey) { FD.items.push(JSON.parse(JSON.stringify(FD.items[i]))); j = FD.items.length - 1; FD.mc = null; }   // Alt-drag: drag a copy
    FD.sel = j; if (j >= 0) { drag = { i: j, x0: x, y0: y, it: JSON.parse(JSON.stringify(FD.items[j])), moved: j !== i }; cv.setPointerCapture(ev.pointerId); }
    fdCards(); drawFindMap(); drawScope(); drawFdPlot();
  });
  cv.addEventListener("pointermove", ev => {
    if (!drag) return; const [x, y] = world(ev), it = FD.items[drag.i]; drag.moved = true;
    if (it.kind === "arc") { const R = Math.hypot(x, y); it.R = Math.round(Math.max(5, Math.min(49.5, R))*10)/10; it.phi0 = (Math.round(Math.atan2(y, x)*C.DEG/90)*90 + 360) % 360; }
    else { it.x = Math.round((drag.it.x + x - drag.x0)*2)/2; it.y = Math.round((drag.it.y + y - drag.y0)*2)/2; }
    fdAnalyse(); drawFindMap();
  });
  const end = () => { if (drag && drag.moved) { FD.mc = null; findChanged(); } drag = null; };
  cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  cv.addEventListener("dblclick", ev => { const [x, y] = world(ev); if (hit(x, y) >= 0) return; FD.items.push(fdNew($("fdType").value, x, y)); FD.sel = FD.items.length - 1; FD.mc = null; findChanged(); });
  cv.addEventListener("keydown", ev => {
    const it = FD.items[FD.sel]; if (!it) return;
    if ((ev.ctrlKey || ev.metaKey) && (ev.key === "d" || ev.key === "D")) { ev.preventDefault(); $("fdDup").click(); return; }
    const st = ev.shiftKey ? 5 : 1, mv = { ArrowLeft: [-st, 0], ArrowRight: [st, 0], ArrowUp: [0, st], ArrowDown: [0, -st] }[ev.key];
    if (mv) { ev.preventDefault(); if (it.kind === "arc") { it.R = Math.max(5, Math.min(49.5, it.R + (mv[1] || mv[0]))); } else { it.x += mv[0]; it.y += mv[1]; } FD.mc = null; findChanged(); }
    else if (ev.key === "Delete" || ev.key === "Backspace") { ev.preventDefault(); $("fdDel").click(); }
  });
})();
// the selected item, without the rest of the wafer, in the other scenes (with the same flat error)
function fdLocalShapes(r) {
  if (r.cs) { const k0 = r.e.valid ? r.e.k : Math.floor((r.cs.length - 1)/2), c0 = r.cs[k0].c, out = [];
    for (let k = Math.max(0, k0 - 2); k <= Math.min(r.cs.length - 1, k0 + 3); k++) out.push(shp("circle", "open", r.cs[k].c[0] - c0[0], r.cs[k].c[1] - c0[1], r.it.d));
    return out; }
  if (r.sl) { const c0 = [r.it.x*1000, r.it.y*1000]; return r.sl.map(q => shp("rect", "open", q.poly.reduce((a, p) => a + p[0]/4, 0) - c0[0], q.poly.reduce((a, p) => a + p[1]/4, 0) - c0[1], r.it.L, r.it.w, q.th)); }
  const sh = Object.assign({}, r.it, { cx: 0, cy: 0 }); delete sh.kind; delete sh.x; delete sh.y;
  if (FD.correct && FD.an.best) { if (sh.type === "para") { sh.a1 += FD.an.best.est; sh.a2 += FD.an.best.est; } else sh.ang += FD.an.best.est; }
  return [sh];
}
$("fdToPit").addEventListener("click", () => {
  const r = FD.an && FD.an.res[FD.sel]; if (!r) return;
  if (S.wf === "111") setWafer("100");
  S.pitShapes = fdLocalShapes(r).map(sh => Object.assign(sh, { pre: 0 })); S.open = "custom"; S.pitSel = -1; S.rot = FD.delta; S.rate = FD.rate;
  $("pitRot").value = S.rot; $("selRate").value = S.rate; S.final = FD.final; $("cFinal").checked = S.final;
  S.mode = "pit"; pressed($("segM"), "m", "pit"); fillOpenings(); renderCustomList(); prepPit(); rebuild(true);
});
$("fdToSim").addEventListener("click", () => {
  const r = FD.an && FD.an.res[FD.sel]; if (!r) return;
  const shapes = fdLocalShapes(r), pts = shapes.flatMap(shapeLoops).flat();
  const ext = Math.max(...pts.map(p => Math.abs(p[0]))), eyy = Math.max(...pts.map(p => Math.abs(p[1])));
  if (ext > 1500 || eyy > 1500) { $("fdMCout").innerHTML = `<dt>simulator</dt><dd>This item is ${(2*ext/1000).toFixed(1)} mm wide; the 3D simulator takes up to about 3 mm. Use the Etched pit, or shorten the slots.</dd>`; return; }
  if (S.wf === "111") setWafer("100");
  const R = RATES[FD.rate].r, tt = FD.final ? Math.min(600, Math.round(2*Math.max(...pts.map(p => Math.hypot(...p)))/Math.max(1e-3, R["100"]))) : FD.t;
  Object.assign(SIM, { fk: { "100": "100", "110": "110f" }[fdWf()], rate: PIT2SIM[FD.rate], rot: FD.delta, t: Math.max(5, tt), pre: 0, hx: Math.ceil((ext + 80)/10)*10, hy: Math.ceil((eyy + 80)/10)*10, dxMax: 0,
    shapes: shapes.map(s => Object.assign(s, { nx: 1, ny: 1, px: 0, py: 0 })), sel: -1, preset: -1, cutPos: 0, cutAxis: "y", wfLoaded: S.wf, owner: "sim", probes: null, cl: null });
  fillSimPresets(); $("simPreset").value = "-1"; $("simNote").innerHTML = `Item ${FD.sel + 1} from the “Find orientation” scene, with the flat error δ = ${FD.delta.toFixed(3)}° (the crystal is turned; the mask is as drawn).`;
  syncSimInputs(); renderShapeList(); S.mode = "sim"; pressed($("segM"), "m", "sim"); simRun(); rebuild(true);
});

