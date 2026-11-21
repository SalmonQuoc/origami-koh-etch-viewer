// --------------------------------------------------------------------- state
const S: PageState = { rot: 0, waferOn: false, wtype: "p", dieX: 0, dieY: 0, compass: true, pitColor: "plane", pitShapes: [], pitSel: -1, wf: "100", mode: "model", sel: null, open: 0, rate: "PAL30", t: 0, final: false, cut: false, block: true, ghost: true, mask: true,
            corners: true, faces: false, upper: true, playing: false };

// --------------------------------------------------------------------- MODEL scene
const OCTA = [];   // faces: {hkl, verts(wafer)}
function octaFaces(wf) {
  const out = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const hkl = [sx, sy, sz];
    const V = [[sx, 0, 0], [0, sy, 0], [0, 0, sz]].map(v => C.toWafer(v, wf));
    let n = C.toWafer(C.unit(hkl), wf);
    // order counter-clockwise seen from outside
    if (C.dot(C.cross(C.sub(V[1], V[0]), C.sub(V[2], V[0])), n) < 0) V.reverse();
    out.push({ hkl, V, n });
  }
  return out;
}
const PL_UP = [new THREE.Plane(new V3(0, 0, 1), 0)], PL_LOW = [new THREE.Plane(new V3(0, 0, -1), 0)];
let model = null;

function buildModel() {
  const wf = S.wf, F = octaFaces(wf);
  scene = new THREE.Scene(); scene.background = COL["scene-bg"]; clearLabels();
  radius = 1.6; frameR = 0;
  const g = new THREE.Group(); scene.add(g);
  // upper half (translucent) and lower half (the pit), both from the same 8 triangles
  const polys = F.map(f => f.V);
  const up = meshFromPolys(polys, F.map(f => shadeColor(COL["m-up"], f.n)), { clippingPlanes: PL_UP, transparent: true, opacity: 0.55, depthWrite: false });
  const low = meshFromPolys(polys, F.map(f => shadeColor(COL["m-low"], f.n)), { clippingPlanes: PL_LOW, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  up.visible = S.upper; up.renderOrder = 3;
  g.add(low, up);
  const edges = [];
  for (const f of F) for (let i = 0; i < 3; i++) edges.push([f.V[i], f.V[(i + 1) % 3]]);
  const eLow = linesFromLoops(edges, COL["s-ink"], { clip: PL_LOW });
  const eUp = linesFromLoops(edges, COL["s-ink"], { clip: PL_UP, opacity: 0.55 });
  eUp.visible = S.upper;
  g.add(eLow, eUp);
  // wafer disc with the primary flat
  const R = 1.7, YF = -1.45, xf = Math.sqrt(R*R - YF*YF), D = [];
  const a0 = Math.atan2(YF, xf), a1 = Math.atan2(YF, -xf) + 2*Math.PI;
  for (let i = 0; i <= 120; i++) { const a = a0 + (a1 - a0)*i/120; D.push([R*Math.cos(a), R*Math.sin(a), 0]); }
  const discShape = new THREE.Shape(D.map(p => new THREE.Vector2(p[0], p[1])));
  const disc = new THREE.Mesh(new THREE.ShapeGeometry(discShape), new THREE.MeshBasicMaterial({ color: COL.disc, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
  disc.renderOrder = 2; g.add(disc);
  g.add(linesFromLoops([D], COL["s-ink"], { opacity: 0.5 }));
  const flat = linesFromLoops([[[-xf, YF, 0], [xf, YF, 0]]], COL.accent); g.add(flat);
  // outline of the model at the surface (= pit outline for a point-like opening)
  const H = F.map(f => ({ n: f.n, b: 1/Math.sqrt(3) }));
  const O = C.outline(H, 0);
  if (O.length >= 3) g.add(linesFromLoops([O.map(p => [p[0], p[1], 0.002])], COL.accent));
  // axis arrows: e1 along the flat, e3 up
  const e = C.FRAME_IDX[wf];
  g.add(new THREE.ArrowHelper(new V3(1, 0, 0), new V3(0.1, YF + 0.16, 0), 0.6, COL["s-ink"].getHex(), 0.1, 0.06));
  addLabel(new V3(0.92, YF + 0.16, 0), idxHTML(e[0], "[", "]"), "", camDir => Math.abs(camDir.x) < 0.9);
  addLabel(new V3(-xf*0.45, YF - 0.14, 0), "primary flat", "acc");
  // perpendicular to the flat, pointing outward (away from the centre)
  g.add(topArrow(new V3(0, -1, 0), new V3(0, YF, 0), 0.4, 0.1, 0.06));
  addLabel(new V3(0.05, YF - 0.5, 0), idxHTML(negIdx(e[1]), "[", "]") + " ⊥ flat, outward", "acc");
  g.add(new THREE.ArrowHelper(new V3(0, 0, 1), new V3(0, 0, 1.03), 0.4, COL["s-ink"].getHex(), 0.1, 0.06));
  addLabel(new V3(0, 0, 1.6), idxHTML(e[2], "[", "]") + " up");
  // corner labels (crystal directions of the six corners)
  const cornerEls = [];
  for (const [i, s] of [[0, 1], [0, -1], [1, 1], [1, -1], [2, 1], [2, -1]]) {
    const c = [0, 0, 0]; c[i] = s; const p = C.toWafer(c, wf);
    const el = addLabel(v3(p).multiplyScalar(1.13), idxHTML(c, "[", "]"), "", camDir => S.corners && !(p[2] < -0.5 && camDir.z > 0.9) && !(p[2] > 0.5 && camDir.z < -0.9));
    cornerEls.push(el);
  }
  // face labels
  for (const f of F) {
    const c = f.V.reduce(C.add, [0, 0, 0]).map(x => x/3);
    const nn = v3(f.n);
    addLabel(v3(c).addScaledVector(nn, 0.06), idxHTML(f.hkl), "", camDir => S.faces && camDir.dot(nn) > 0.05);
  }
  model = { F, up, low, eUp, sel: new THREE.Group() };
  scene.add(model.sel);
  if (S.sel !== null) selectFace(S.sel, false);
  resize();
}

function classify(f) {
  const nz = f.n[2], zs = f.V.map(v => v[2]), zmin = Math.min(...zs), zmax = Math.max(...zs), eps = 1e-9;
  if (nz > 1 - 1e-9) return "top face: parallel to the surface and above it, not part of the pit";
  if (nz < -1 + 1e-9) return "floor of the pit: parallel to the surface";
  if (zmin > -eps) return "upper half: above the wafer surface, not part of the pit";
  if (Math.abs(nz) < 1e-9) return "vertical wall of the pit";
  if (nz < 0) return "wall of the pit, leaning inward (the pit narrows with depth)";
  return "overhanging wall of the pit (the pit widens with depth, undercut)";
}

function selectFace(k, moveCam = false) {
  S.sel = k;
  const sel = model.sel; while (sel.children.length) sel.remove(sel.children[0]);
  labels = labels.filter(L => { if (L.sel) { L.el.remove(); return false; } return true; });
  const fi = document.getElementById("faceInfo");
  if (k === null) { document.getElementById("vAlong").disabled = true; dirty = true; return; }
  openFoldsAround(fi);   // show the "Selected face" section (module 20)
  const f = model.F[k], n = f.n, theta = C.angleToSurface(n);
  // highlight
  const hl = meshFromPolys([f.V.map(p => C.add(p, C.mul(n, 0.004)))], [COL.accent], { transparent: true, opacity: 0.45, depthWrite: false });
  hl.renderOrder = 4; sel.add(hl);
  sel.add(linesFromLoops([f.V.map(p => C.add(p, C.mul(n, 0.004)))], COL.accent));
  let html = `<div class="face"><b>${idxHTML(f.hkl)}</b> face of the model<br>${classify(f)}.</div><dl class="kv" style="margin-top:8px">`;
  html += `<dt>angle to surface</dt><dd>${fmtA(theta)}</dd>`;
  const horiz = Math.hypot(n[0], n[1]) > 1e-9;
  let along = false;
  if (horiz) {
    const u = C.unit(C.cross(n, [0, 0, 1]));
    // midpoint of the trace: the part of the face at z = 0, or the closest point of the plane's trace line
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const a = f.V[i], b = f.V[(i + 1) % 3];
      if (Math.abs(a[2]) < 1e-9) pts.push(a);
      else if (a[2]*b[2] < 0) { const t = a[2]/(a[2] - b[2]); pts.push(C.add(a, C.mul(C.sub(b, a), t))); }
    }
    const nxy = [n[0], n[1], 0], s = (1/Math.sqrt(3))/C.dot(nxy, nxy), base = C.mul(nxy, s);
    let M = pts.length ? C.mul(pts.reduce(C.add, [0, 0, 0]), 1/pts.length) : base;
    M = C.add(base, C.mul(u, C.dot(C.sub(M, base), u))); M[2] = 0;
    sel.add(linesFromLoops([[C.add(M, C.mul(u, -1.3)), C.add(M, C.mul(u, 1.3))]], COL.accent, { dashed: true, dash: 0.06, gap: 0.04 }));
    // directions in the plane perpendicular to the line: hS (surface, acute side) and w (down the wall)
    let w = C.unit(C.cross(u, n)); if (w[2] > 0) w = C.mul(w, -1);
    let hS;
    if (Math.abs(w[2] + 1) < 1e-9) hS = C.mul(C.unit(nxy), -1); else hS = C.unit([w[0], w[1], 0]);
    const r = 0.5;
    sel.add(linesFromLoops([[M, C.add(M, C.mul(hS, r*1.6))], [M, C.add(M, C.mul(w, r*1.6))]], COL["s-ink"]));
    const arc = [];
    const ang = Math.acos(Math.max(-1, Math.min(1, C.dot(hS, w))));
    const kx = C.unit(C.cross(hS, w));
    for (let i = 0; i <= 30; i++) { const t = ang*i/30; arc.push(C.add(M, C.add(C.mul(hS, r*Math.cos(t)), C.mul(C.cross(kx, hS), r*Math.sin(t))))); }
    const arcLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(arc.map(v3)), new THREE.LineBasicMaterial({ color: COL.accent }));
    sel.add(arcLine);
    const mid = arc[15], lab = C.add(M, C.mul(C.sub(mid, M), 1.45));
    labels.push(Object.assign({ el: addLabelEl(`θ = ${fmtA(theta)}`, "acc big"), pos: v3(lab), sel: true }));
    // normals
    const nw = n[2] >= 0 ? n : C.mul(n, -1), c0 = C.add(M, C.mul(u, 0.55));
    sel.add(new THREE.ArrowHelper(new V3(0, 0, 1), v3(c0), 0.5, COL["s-ink"].getHex(), 0.08, 0.05));
    sel.add(new THREE.ArrowHelper(v3(nw), v3(c0), 0.5, COL.accent.getHex(), 0.08, 0.05));
    labels.push({ el: addLabelEl("n<sub>s</sub>", ""), pos: v3(C.add(c0, [0, 0, 0.6])), sel: true });
    labels.push({ el: addLabelEl("n<sub>w</sub>", "acc"), pos: v3(C.add(c0, C.mul(nw, 0.62))), sel: true });
    // pit / silicon wedge angles at the rim
    const hout = C.unit(nxy), siAng = Math.acos(Math.max(-1, Math.min(1, C.dot(hout, w))))*C.DEG;
    let uc = C.intDir(C.toCrystal(u, S.wf));
    if (uc && uc.find(x => x !== 0) < 0) uc = uc.map(x => -x || 0);
    let phi = Math.atan2(u[1], u[0])*C.DEG; phi = ((phi % 180) + 180) % 180; const toFlat = Math.min(phi, 180 - phi);
    html += `<dt>angle between normals</dt><dd>${fmtA(Math.acos(Math.abs(n[2]))*C.DEG)}</dd>`;
    html += `<dt>trace on surface</dt><dd>${uc ? idxHTML(uc, "[", "]") : "-"}</dd>`;
    html += `<dt>trace to flat</dt><dd>${fmtA(toFlat)}</dd>`;
    if (Math.min(...f.V.map(v => v[2])) < -1e-9 && Math.abs(n[2]) > 1e-9) {
      html += `<dt>pit-side angle</dt><dd>${fmtA(180 - siAng)}</dd><dt>silicon-side angle</dt><dd>${fmtA(siAng)}</dd>`;
    }
    html += `</dl><p class="note" style="margin:8px 0 0">The angle between two planes is the angle between their normals, n<sub>s</sub> (surface) and n<sub>w</sub> (wall). It appears at true size only when you look along the line where the planes meet; from any other direction it looks smaller or larger.</p>`;
    model.along = { dir: v3(u), M: v3(M) };
    along = true;
  } else {
    html += `</dl><p class="note" style="margin:8px 0 0">This face is parallel to the wafer surface, so it does not meet it in a line.</p>`;
    model.along = null;
  }
  fi.innerHTML = html;
  document.getElementById("vAlong").disabled = !along;
  sel.traverse(o => { if (o.material && o !== hl) { o.material.depthTest = false; o.renderOrder = 10; } });
  dirty = true;
}
function addLabelEl(html, cls) { const el = document.createElement("div"); el.innerHTML = html; if (cls) el.className = cls; labelsEl.appendChild(el); return el; }

