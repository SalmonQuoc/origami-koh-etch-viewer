// ---- corner lab: a mesa corner left unprotected next to one with compensation, on (100)
const CL: CornerState = { rate: "PAL30", H: 40, A: 200, type: "beam110", s1: 108, s2: 40, built: false };
const CL_TYPES = {   // size labels and the design rules (sourced) or design choices
  none:    { l1: null, l2: null },
  square:  { l1: "square side a", l2: null },
  beam110: { l1: "beam length L (from the corner)", l2: "beam width W" },
  beam100: { l1: "beam length L (along the diagonal)", l2: "beam width W" },
};
function clRule(type, H) {
  if (type === "square") return { s1: Math.round(H), s2: 0, txt: `Square side a ≈ H (Pal et al. 2007, Sec. 3.1.1, p. R114, rule given for EDP; the same paper finds the square distorts the corner in KOH).` };
  if (type === "beam110") return { s1: Math.round(2.7*H), s2: Math.max(20, Math.round(H)), txt: `Total ⟨110⟩ beam length L = 2.7 H for 33 wt% KOH, where R{411}/R{100} ≈ 1.38 (Pal et al. 2007, p. R120). Width W = H is a design choice.` };
  if (type === "beam100") return { s1: Math.round(3*H), s2: Math.round(2*H), txt: `⟨100⟩ beam width W = 2H, long side at 135° to the mesa side (Pal et al. 2007, Sec. 3.1.1, p. R114; Pal & Sato p. 249). Length L = 3H is a design choice.` };
  return { s1: 0, s2: 0, txt: "No compensation: both corners are attacked." };
}
function clSync() {
  const T = CL_TYPES[CL.type];
  $("clRate").value = CL.rate; $("clH").value = CL.H; $("clA").value = CL.A; $("clType").value = CL.type; $("clS1").value = CL.s1; $("clS2").value = CL.s2;
  $("clL1").classList.toggle("hidden", !T.l1); $("clL2").classList.toggle("hidden", !T.l2);
  if (T.l1) $("clL1").firstChild.textContent = T.l1 + " "; if (T.l2) $("clL2").firstChild.textContent = T.l2 + " ";
  $("clRule").textContent = clRule(CL.type, CL.H).txt;
}
function clBuild(run = true) {
  const H = CL.H, A = CL.A, R100 = SRATES[CL.rate].r["100"], tT = H/R100;
  const reach = CL.type === "square" ? CL.s1*0.75 : CL.type === "none" ? 0 : CL.s1;
  const m = 1.6*H + 30, hx = A/2 + reach + m, Ly1 = Math.max(0.5*A, 1.5*H), Ly = Ly1 + reach + m, hy = Ly/2, yc = hy - reach - m;
  const xL = -hx + A/2, xR = hx - A/2;   // the two corners; the domain edges are mirror planes, so each piece is half a mesa of width A
  const sh = [shp("rect", "open", 0, 0, 2*hx + 40, 2*hy + 40),
              shp("rect", "mask", (-hx - 20 + xL)/2, (yc - hy - 20)/2, xL + hx + 20, yc + hy + 20),
              shp("rect", "mask", (xR + hx + 20)/2, (yc - hy - 20)/2, hx + 20 - xR, yc + hy + 20)];
  for (const x of sh) x.lock = true;   // domain and mesas: locked, so editing in the designer or the table changes only the compensation
  const a = CL.s1, w = CL.s2, d = [-SQ2, SQ2];
  if (CL.type === "square") sh.push(shp("rect", "mask", xR, yc, a, a));
  else if (CL.type === "beam110") sh.push(shp("rect", "mask", xR - a/2, yc - w/2, a, w));
  else if (CL.type === "beam100") sh.push(shp("rect", "mask", xR + d[0]*a/2, yc + d[1]*a/2, a, w, 135));
  Object.assign(SIM, { fk: "100", rot: 0, rate: CL.rate, t: Math.max(5, Math.round(1.3*tT)), pre: 0, hx: Math.ceil(hx/5)*5, hy: Math.ceil(hy/5)*5, dxMax: Math.max(0.5, H/16),
    shapes: sh, sel: -1, preset: -1, cutPos: Math.round(yc - 0.15*H), cutAxis: "y", cutLine: null, owner: "corner", wfLoaded: null });
  SIM.probes = [{ x: xL, y: yc, ux: SQ2, uy: SQ2, s0: -0.45*Math.min(A, 2*Ly1), s1: reach + m }, { x: xR, y: yc, ux: -SQ2, uy: SQ2, s0: -0.45*Math.min(A, 2*Ly1), s1: reach + m }];
  SIM.cl = { tT, H, xL, xR, yc, type: CL.type };
  CL.built = true; syncSimInputs(); renderShapeList();
  if (run) { simRun(); buildSim(true); }
}
function clValueAt(h, k, t) {   // probe k of the history at time t (linear)
  let i = 0; while (i < h.t.length - 2 && h.t[i + 1] < t) i++;
  const f = Math.max(0, Math.min(1, (t - h.t[i])/Math.max(1e-9, h.t[i + 1] - h.t[i]))); return h.probe[k][i] + f*(h.probe[k][i + 1] - h.probe[k][i]);
}
function clReadout() {
  if (S.mode !== "corner" || !SIM.cl) return;
  const r = SIM.res, h = SIM.hist, cl = SIM.cl, rows = [], g = SIM.grid ? SIM.grid.dx : 1, R100 = SRATES[SIM.rate].r["100"];
  rows.push(["target time t = H/R(100)", `${cl.tT.toFixed(1)} min (R(100) = ${(R100*60).toFixed(1)} µm/h)`]);
  if (r && r.st && r.st.probe) rows.push([`corner at ${r.tv.toFixed(0)} min`, `left ${r.st.probe[0].toFixed(1)} µm, right ${r.st.probe[1].toFixed(1)} µm`]);
  if (h && h.probe && h.probe.length === 2) {
    const a = clValueAt(h, 0, cl.tT), b = clValueAt(h, 1, cl.tT);
    rows.push(["unprotected at H", a < -g ? `attacked: corner moved ${(-a).toFixed(1)} µm along the diagonal (U/H = ${(-a/cl.H).toFixed(2)})` : `sharp within the grid (${a.toFixed(1)} µm)`]);
    if (cl.type !== "none") {
      rows.push(["compensated at H", Math.abs(b) <= 1.5*g ? `sharp: ${b.toFixed(1)} µm from the mask corner (grid ${g} µm)` : b > 0 ? `compensation not used up: ${b.toFixed(1)} µm of silicon left past the corner` : `compensation too small: corner eaten by ${(-b).toFixed(1)} µm`]);
      // the corner of the mesa itself starts to be eaten when the probe drops below -1.5 cells
      const lim = -1.5*g; let tc = null;
      for (let i = 1; i < h.t.length; i++) if (h.probe[1][i - 1] > lim && h.probe[1][i] <= lim) { const f = (h.probe[1][i - 1] - lim)/(h.probe[1][i - 1] - h.probe[1][i]); tc = h.t[i - 1] + f*(h.t[i] - h.t[i - 1]); break; }
      rows.push(["mesa corner first attacked", tc != null ? `at ${tc.toFixed(1)} min, depth ≈ ${(R100*tc).toFixed(1)} µm (aim: H = ${cl.H} µm${R100*tc >= cl.H ? ", protected long enough" : ""})` : h.probe[1][h.probe[1].length - 1] > lim ? "not within the run: protected" : "from the start"]);
    }
  } else rows.push(["corner history", SIM.running ? "when the run finishes" : "run first"]);
  $("clReadout").innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}
$("clRate").innerHTML = Object.entries(SRATES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join("");
$("clRate").addEventListener("change", e => { CL.rate = e.target.value; clSync(); });
$("clType").addEventListener("change", e => { CL.type = e.target.value; Object.assign(CL, clRule(CL.type, CL.H)); clSync(); clBuild(); });
for (const [id, k] of [["clH", "H"], ["clA", "A"], ["clS1", "s1"], ["clS2", "s2"]]) $(id).addEventListener("change", e => { const v = Number(e.target.value); if (v >= 0) CL[k] = v; clSync(); });
$("clAuto").addEventListener("click", () => { const r = clRule(CL.type, CL.H); CL.s1 = r.s1; CL.s2 = r.s2; clSync(); clBuild(); });
$("clRun").addEventListener("click", () => clBuild());
$("clRunMask").addEventListener("click", () => { if (SIM.owner !== "corner") { clBuild(); return; } simRun(); buildSim(false); });
// hover on the 3D surface
function simHover(ev) {
  if (!simScene || !simScene.pick) { tip.style.display = "none"; return; }
  pickAt(ev);
  const cps = simScene.pick.material.clippingPlanes;   // skip the part removed by the section cut
  const h = ray.intersectObject(simScene.pick).find(h => !cps || cps.every(pl => pl.distanceToPoint(h.point) >= -1e-3));
  if (!h) { tip.style.display = "none"; return; }
  const inf = simScene.triInfo[h.faceIndex];
  if (!inf || inf.cap || inf.kind === 2) { tip.innerHTML = `${inf && inf.kind === 2 ? "edge of the simulated block" : "section face (cut)"}<br>z = ${(-h.point.z).toFixed(1)} µm deep`; }
  else if (inf.kind === 3) { tip.innerHTML = `original wafer surface under the mask<br>${idxHTML(simFrame().idx[2])}`; }
  else {
    const n = inf.qn, a = Math.acos(Math.min(1, Math.abs(n[2])))*C.DEG, c = inf.cls;
    const kind = a < 3 ? (n[2] > 0 ? "floor or top face" : "underside (faces down)") : a > 87 ? "vertical wall" : n[2] < 0 ? "overhanging wall (faces down)" : "sloping wall";
    const [e1, e2, e3] = simE(), cc = [0, 1, 2].map(i => e1[i]*n[0] + e2[i]*n[1] + e3[i]*n[2]);
    if (!SIM.rtab) SIM.rtab = EE.makeRate(SRATES[SIM.rate].r);
    const R = EE.rateC(SIM.rtab, cc[0], cc[1], cc[2]);
    tip.innerHTML = c.ang <= 4 ? `<b>${idxHTML(c.hkl)}</b> &nbsp;{${c.fam}} (within ${c.ang.toFixed(1)}°)<br>${kind}, ${a.toFixed(1)}° to the surface<br>model rate ${R.toFixed(3)} µm/min`
                               : `no low-index plane within 4° (nearest {${c.fam}}, ${c.ang.toFixed(1)}° off)<br>${kind}, ${a.toFixed(1)}° to the surface<br>model rate ${R.toFixed(3)} µm/min`;
  }
  if (inf && inf.val != null && SIM.cbar) { const [t, u] = CB_TITLE[SIM.cbar.mode]; tip.innerHTML += `<br>${t}: ${inf.val.toFixed(SIM.cbar.mode === "rate" ? 3 : 1)} ${u}`; }
  const r = stage.getBoundingClientRect();
  tip.style.left = `${Math.min(ev.clientX - r.left + 14, r.width - 220)}px`; tip.style.top = `${ev.clientY - r.top + 12}px`; tip.style.display = "block";
}


