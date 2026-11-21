// --------------------------------------------------------------------- geometry builders
function meshFromPolys(polys, colors, matOpts) {   // polys: arrays of [x,y,z] (convex), colors: THREE.Color per poly
  const pos = [], col = [], tri2poly = [];
  polys.forEach((P, k) => {
    for (let i = 1; i + 1 < P.length; i++) {
      for (const q of [P[0], P[i], P[i + 1]]) { pos.push(q[0], q[1], q[2]); col.push(colors[k].r, colors[k].g, colors[k].b); }
      tri2poly.push(k);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, matOpts || {})));
  m.userData.tri2poly = tri2poly;
  return m;
}
function linesFromLoops(loops, color, opts: Record<string, any> = {}) {
  const pos = [];
  for (const P of loops) for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length]; pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  const mat = opts.dashed ? new THREE.LineDashedMaterial({ color, dashSize: opts.dash || 4, gapSize: opts.gap || 3, clippingPlanes: opts.clip || null, transparent: !!opts.opacity, opacity: opts.opacity || 1 })
                          : new THREE.LineBasicMaterial({ color, clippingPlanes: opts.clip || null, transparent: !!opts.opacity, opacity: opts.opacity || 1 });
  const L = new THREE.LineSegments(g, mat);
  if (opts.dashed) L.computeLineDistances();
  return L;
}
function ccw(P) {
  let a = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; a += p[0]*q[1] - q[0]*p[1]; }
  return a >= 0 ? P : P.slice().reverse();
}
// rectangle minus convex polygon O, as a list of convex (overlapping) pieces
function rectMinus(rect, O) {
  if (!O || O.length < 3) return [rect];
  O = ccw(O); const out = [];
  for (let i = 0; i < O.length; i++) {
    const p = O[i], q = O[(i + 1) % O.length], a = [q[1] - p[1], -(q[0] - p[0])];
    const piece = C.clip2(rect, [-a[0], -a[1]], -(a[0]*p[0] + a[1]*p[1]));
    if (piece.length >= 3) out.push(piece);
  }
  return out;
}

// --------------------------------------------------------------------- whole wafer (100 mm) and in-plane crystal directions
// 100 mm wafer, 525 µm thick (Pal & Sato Table 2.1, p. 30); flat lengths 32.5 mm and 18 mm (Topline drawing A 174004 A,
// "Wafer dimensions 100 mm standard"). Secondary flat: degrees clockwise from the primary flat (Lec 10 p. 10); null = none.
const WAFER = { D: 100000, T: 525, Lp: 32500, Ls: 18000 };
const SEC_FLAT = { "100": { n: 180, p: 90 }, "110": { n: null, p: null }, "111": { n: 45, p: null } };
// outline in the wafer frame (µm), centre at the origin, primary flat on the -y side (x along the flat)
function waferOutline(wf, type, m = 360) {
  const R = WAFER.D/2, fl = [[-90, WAFER.Lp]], sf = SEC_FLAT[wf] && SEC_FLAT[wf][type];
  if (sf != null) fl.push([-90 - sf, WAFER.Ls]);   // clockwise seen from the front
  // arc points outside the flats, plus the exact flat end points (on the circle), in angle order
  const norm = a => ((a % (2*Math.PI)) + 2*Math.PI) % (2*Math.PI), F = fl.map(([deg, L]) => ({ a: norm(deg/C.DEG), b: Math.asin(L/(2*R)) }));
  const inFlat = t => F.some(f => { const d = Math.abs(norm(t - f.a + Math.PI) - Math.PI); return d < f.b - 1e-12; });
  const ang = []; for (let i = 0; i < m; i++) { const t = 2*Math.PI*i/m; if (!inFlat(t)) ang.push(t); }
  for (const f of F) ang.push(norm(f.a - f.b), norm(f.a + f.b));
  return ang.sort((p, q) => p - q).map(t => [R*Math.cos(t), R*Math.sin(t)]);
}
const secFlatText = (wf, type) => { const sf = SEC_FLAT[wf][type]; return sf == null ? "primary flat only" : `secondary flat ${sf}° clockwise from the primary`; };
// 3D wafer: top face (with the die box cut out), rim, bottom; centred at (ox, oy); flats drawn in the accent colour
const negIdx = v => v.map(x => (x === 0 ? 0 : -x));   // opposite direction (outward flat normal = -wafer y)
// a flat arrow drawn on top of everything (mask film included)
function topArrow(dir, origin, len, head, width) {
  const a = new THREE.ArrowHelper(dir, origin, len, COL.accent.getHex(), head, width);
  for (const m of [a.line.material, a.cone.material]) { m.depthTest = false; m.transparent = true; }
  a.line.renderOrder = a.cone.renderOrder = 20; return a;
}
function waferGroup(wf, type, ox, oy, opts: Record<string, any> = {}) {
  const grp = new THREE.Group(), O = waferOutline(wf, type).map(p => [p[0] + ox, p[1] + oy]), T = WAFER.T, clip = opts.clip || null;
  const shape = new THREE.Shape(O.map(p => new THREE.Vector2(p[0], p[1])));
  if (opts.hole) { const [x0, x1, y0, y1] = opts.hole; shape.holes.push(new THREE.Path([[x0, y0], [x0, y1], [x1, y1], [x1, y0]].map(p => new THREE.Vector2(p[0], p[1])))); }
  const top = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color: shadeColor(COL["s-top"], [0, 0, 1]), side: THREE.DoubleSide, clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: 3, polygonOffsetUnits: 3 }));
  grp.add(top);
  const bot = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape(O.map(p => new THREE.Vector2(p[0], p[1])))), new THREE.MeshBasicMaterial({ color: shadeColor(COL["s-side"], [0, 0, -1]), side: THREE.DoubleSide, clippingPlanes: clip }));
  bot.position.z = -T; grp.add(bot);
  const pos = [], col = [];
  for (let i = 0; i < O.length; i++) {
    const a = O[i], b = O[(i + 1) % O.length], n = C.unit([b[1] - a[1], -(b[0] - a[0]), 0]), c = shadeColor(COL["s-side"], n);
    for (const v of [[a, 0], [b, 0], [b, -T], [a, 0], [b, -T], [a, -T]]) { pos.push(v[0][0], v[0][1], v[1]); col.push(c.r, c.g, c.b); }
  }
  const gr = new THREE.BufferGeometry(); gr.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); gr.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  grp.add(new THREE.Mesh(gr, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, clippingPlanes: clip })));
  grp.add(linesFromLoops([O.map(p => [p[0], p[1], 0]), O.map(p => [p[0], p[1], -T])], COL["s-ink"], { clip, opacity: 0.6 }));
  // flats: the straight parts of the outline (segments longer than 5 mm)
  const flats = [];
  for (let i = 0; i < O.length; i++) { const a = O[i], b = O[(i + 1) % O.length]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 5000) flats.push([[a[0], a[1], 1], [b[0], b[1], 1]]); }
  grp.add(linesFromLoops(flats, COL.accent, { clip }));
  // arrow from the middle of the primary flat, perpendicular to it and pointing outward (wafer -y, away from the centre)
  const Rw = WAFER.D/2, yF = -Math.sqrt(Rw*Rw - WAFER.Lp*WAFER.Lp/4), aL = 0.22*Rw;
  const arw = new THREE.ArrowHelper(new V3(0, -1, 0), new V3(ox, oy + yF, 3), aL, COL.accent.getHex(), 0.07*Rw, 0.04*Rw);
  if (clip) { arw.line.material.clippingPlanes = clip; arw.cone.material.clippingPlanes = clip; }
  grp.add(arw);
  labelTag = "wafer";
  if (opts.labels !== false && opts.normalLabel) addLabel(new V3(ox + 0.04*Rw, oy + yF - aL - 0.06*Rw, 0), `${opts.normalLabel} ⊥ flat, outward`, "acc");
  if (opts.labels !== false) {
    const R = WAFER.D/2, yp = -Math.sqrt(R*R - WAFER.Lp*WAFER.Lp/4);
    addLabel(new V3(ox - 0.33*R, oy + yp - 0.05*R, 0), `primary flat ${opts.flatLabel || ""}`, "acc");
    const sf = SEC_FLAT[wf][type];
    if (sf != null) { const a = (-90 - sf)/C.DEG, d = Math.sqrt(R*R - WAFER.Ls*WAFER.Ls/4) + 0.07*R; addLabel(new V3(ox + d*Math.cos(a), oy + d*Math.sin(a), 0), "secondary flat", "acc"); }
  }
  if (opts.hole) {   // the die: its outline and a cross-hair big enough to find it on the whole wafer
    const [x0, x1, y0, y1] = opts.hole, cx = (x0 + x1)/2, cy = (y0 + y1)/2, k = 0.035*WAFER.D;
    grp.add(linesFromLoops([[[x0, y0, 2], [x1, y0, 2], [x1, y1, 2], [x0, y1, 2]]], COL.accent));
    grp.add(linesFromLoops([[[cx - k, cy, 2], [cx - 0.3*k, cy, 2]], [[cx + 0.3*k, cy, 2], [cx + k, cy, 2]], [[cx, cy - k, 2], [cx, cy - 0.3*k, 2]], [[cx, cy + 0.3*k, 2], [cx, cy + k, 2]]], COL.accent));
    addLabel(new V3(cx + 1.2*k, cy + 0.6*k, 0), "die", "acc", () => camera.zoom < 0.12*frameR/radius);
  }
  labelTag = null;
  return grp;
}
// directions lying in the wafer surface (index ≤ 3), as angles from the flat (0 to 180°), with the {111} traces marked.
// e: crystal components of the wafer x, y, z axes. Each angle keeps the lowest-index direction.
function inPlaneDirs(e) {
  const [e1, e2, e3] = e, best = new Map(), gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) for (let c = -3; c <= 3; c++) {
    if (gcd(gcd(Math.abs(a), Math.abs(b)), Math.abs(c)) !== 1) continue;
    const v = [a, b, c], L = Math.hypot(a, b, c);
    if (Math.abs(C.dot(v, e3)) > 1e-9*L) continue;
    let ang = Math.atan2(C.dot(v, e2), C.dot(v, e1))*C.DEG;
    if (ang < -1e-6 || ang >= 180 - 1e-6) continue;   // one of v and -v
    ang = Math.max(0, ang);
    const key = ang.toFixed(3), sum = Math.abs(a) + Math.abs(b) + Math.abs(c), old = best.get(key);
    if (!old || sum < old.sum) best.set(key, { ang, v, sum, fam: [a, b, c].map(Math.abs).sort((p, q) => q - p).join("") });
  }
  const out = [...best.values()].filter(d => ["100", "110", "111", "210", "211", "221", "310", "311"].includes(d.fam)).sort((p, q) => p.ang - q.ang);
  // traces of the {111} planes on the surface: a wall along this direction is a {111} plane at angle w to the surface
  for (const m of [[1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]]) {
    const n = C.unit(m), nz = C.dot(n, e3), tr = C.cross(e3, n), L = C.norm(tr); if (L < 1e-9) continue;
    let ang = Math.atan2(C.dot(tr, e2), C.dot(tr, e1))*C.DEG; ang = ((ang % 180) + 180) % 180; if (ang > 180 - 1e-6) ang = 0;
    const d = out.find(q => Math.abs(q.ang - ang) < 1e-3); if (d) d.wall = Math.acos(Math.min(1, Math.abs(nz)))*C.DEG;
  }
  return out;
}
const dirText = d => `${plainIdx(d.v)} ⟨${d.fam}⟩ ${d.ang.toFixed(2)}°${d.wall != null ? ` · {111} trace, wall ${d.wall.toFixed(1)}°` : ""}`;
// <select> of the in-plane directions for a shape angle; value = angle from the flat
function dirSelect(dirs, val, attrs, label = "edges along") {
  const m = ((Number(val) % 180) + 180) % 180, hit = dirs.find(d => Math.abs(d.ang - m) < 0.01);
  return `<label class="dsel">${label}<select ${attrs} aria-label="${label}"><option value=""${hit ? "" : " selected"}>${hit ? "custom angle" : `custom (${m.toFixed(2)}°)`}</option>${dirs.map(d => `<option value="${d.ang}"${d === hit ? " selected" : ""}>${dirText(d)}</option>`).join("")}</select></label>`;
}
// small compass in a 2D editor: in-plane directions of the crystal (rot: the crystal turned by rot degrees from the flat)
function drawCompass(ctx, cx, cy, r, dirs, rot = 0) {
  const ink = "#" + COL["s-ink"].getHexString(), acc = "#" + COL.accent.getHexString();
  ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = "#" + COL["scene-bg"].getHexString(); ctx.beginPath(); ctx.arc(cx, cy, r + 4, 0, 2*Math.PI); ctx.fill();
  ctx.font = "9.5px IBM Plex Mono, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  for (const d of dirs) {
    if (!["100", "110", "111", "211"].includes(d.fam)) continue;
    const a = (d.ang + rot)/C.DEG, ux = Math.cos(a), uy = -Math.sin(a), k = d.fam === "110" || d.fam === "100" ? 1 : 0.72;
    ctx.strokeStyle = d.wall != null ? acc : ink; ctx.lineWidth = d.wall != null ? 1.6 : 0.8; ctx.globalAlpha = d.wall != null ? 0.95 : 0.55;
    ctx.beginPath(); ctx.moveTo(cx - ux*r*k, cy - uy*r*k); ctx.lineTo(cx + ux*r*k, cy + uy*r*k); ctx.stroke();
    ctx.globalAlpha = 0.9; ctx.fillStyle = d.wall != null ? acc : ink; ctx.fillText(d.fam, cx + ux*(r*k + 8), cy + uy*(r*k + 8));
  }
  ctx.restore();
}

