// =====================================================================================================
// Coordinates in the 2D editors (Etched pit, simulator mask, Find orientation map): axes through the origin,
// tick labels along the edges, the cursor position, the centre of the selected shape, and in the simulator
// the section line, which can be dragged and is labelled with its position.
// Each editor calls drawCoords() at the end of its draw function; the pointer tracking is below.

interface CoordOpts {
  X0: number; X1: number; Y0: number; Y1: number;   // plotted area in world µm
  toC: (p: number[]) => number[];                     // world µm -> canvas px
  g: number; grid?: boolean;                          // tick step (µm); grid lines (the pit draws its own)
  k?: number; unit?: string; snap?: boolean;          // shown value = µm*k in unit; snap the cursor to SET.snap
  sel?: number[] | null;                              // centre of the selected shape (µm)
}
function coordFmt(v: number, step: number) {
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2, r = +v.toFixed(d);
  return (r === 0 ? 0 : r).toFixed(d).replace("-", "−");
}
function drawCoords(ctx: CanvasRenderingContext2D, id: string, o: CoordOpts) {
  if (SET.coords === false) return;
  const col = (c: string) => "#" + COL[c].getHexString(), k = o.k || 1, unit = o.unit || "µm", g = o.g;
  const [L, T] = o.toC([o.X0, o.Y1]), [R, B] = o.toC([o.X1, o.Y0]);
  const ink = col("s-ink"), bg = col("scene-bg");
  ctx.save(); ctx.beginPath(); ctx.rect(L, T, R - L, B - T); ctx.clip();
  ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.setLineDash([]);
  const xs: number[] = [], ys: number[] = [];
  for (let x = Math.ceil(o.X0/g - 1e-9)*g; x <= o.X1 + 1e-9; x += g) xs.push(x);
  for (let y = Math.ceil(o.Y0/g - 1e-9)*g; y <= o.Y1 + 1e-9; y += g) ys.push(y);
  if (o.grid) {
    ctx.globalAlpha = 0.08; ctx.beginPath();
    for (const x of xs) { const [a] = o.toC([x, 0]); ctx.moveTo(a, T); ctx.lineTo(a, B); }
    for (const y of ys) { const [, b] = o.toC([0, y]); ctx.moveTo(L, b); ctx.lineTo(R, b); }
    ctx.stroke();
  }
  // axes through the origin
  const [ox, oy] = o.toC([0, 0]);
  ctx.globalAlpha = 0.45; ctx.lineWidth = 1; ctx.beginPath();
  if (ox > L && ox < R) { ctx.moveTo(ox, T); ctx.lineTo(ox, B); }
  if (oy > T && oy < B) { ctx.moveTo(L, oy); ctx.lineTo(R, oy); }
  ctx.stroke();
  // ticks and labels along the bottom and left edges
  ctx.globalAlpha = 0.85; ctx.fillStyle = ink; ctx.font = "10px IBM Plex Mono, monospace";
  ctx.beginPath();
  ctx.textAlign = "center";
  for (const x of xs) {
    const [a] = o.toC([x, 0]); ctx.moveTo(a, B); ctx.lineTo(a, B - 4);
    if (a - L > 16 && R - a > 16) ctx.fillText(coordFmt(x*k, g*k), a, B - 6);
  }
  ctx.textAlign = "left";
  for (const y of ys) {
    const [, b] = o.toC([0, y]); ctx.moveTo(L, b); ctx.lineTo(L + 4, b);
    if (b - T > 24 && B - b > 18) ctx.fillText(coordFmt(y*k, g*k), L + 6, b + 3);
  }
  ctx.stroke();
  ctx.font = "italic 600 11px IBM Plex Sans, sans-serif";
  if (oy > T + 8 && oy < B - 8) { ctx.textAlign = "right"; ctx.fillText("x", R - 4, oy - 4); }
  if (ox > L + 8 && ox < R - 8) { ctx.textAlign = "left"; ctx.fillText("y", ox + 4, T + 30); }
  ctx.textAlign = "left";
  ctx.font = "10px IBM Plex Mono, monospace";
  // centre of the selected shape
  if (o.sel) {
    const [a, b] = o.toC(o.sel), lab = `(${coordFmt(o.sel[0]*k, k < 1 ? 0.01 : 1)}, ${coordFmt(o.sel[1]*k, k < 1 ? 0.01 : 1)})`;
    ctx.globalAlpha = 1; ctx.strokeStyle = ctx.fillStyle = col("accent"); ctx.beginPath();
    ctx.moveTo(a - 5, b); ctx.lineTo(a + 5, b); ctx.moveTo(a, b - 5); ctx.lineTo(a, b + 5); ctx.stroke();
    const tw = ctx.measureText(lab).width, bx = Math.min(a + 7, R - tw - 4);
    ctx.fillStyle = bg; ctx.globalAlpha = 0.8; ctx.fillRect(bx - 2, b + 5, tw + 4, 13); ctx.globalAlpha = 1;
    ctx.fillStyle = col("accent"); ctx.fillText(lab, bx, b + 15);
  }
  // cursor: crosshair across the plot and its position at the top left
  const c = EDC[id];
  if (c && c[0] >= o.X0 && c[0] <= o.X1 && c[1] >= o.Y0 && c[1] <= o.Y1) {
    const v = o.snap === false ? c : [snapV(c[0]), snapV(c[1])], [a, b] = o.toC(v);
    ctx.strokeStyle = ink; ctx.globalAlpha = 0.35; ctx.setLineDash([3, 4]); ctx.beginPath();
    ctx.moveTo(a, T); ctx.lineTo(a, B); ctx.moveTo(L, b); ctx.lineTo(R, b); ctx.stroke(); ctx.setLineDash([]);
    const st = o.snap === false ? (k < 1 ? 0.01 : 0.1) : Math.min(1, Number(SET.snap) || 1);
    const lab = `x ${coordFmt(v[0]*k, st)}  y ${coordFmt(v[1]*k, st)} ${unit}`, tw = ctx.measureText(lab).width;
    ctx.globalAlpha = 0.9; ctx.fillStyle = bg; ctx.fillRect(L + 4, T + 4, tw + 10, 16);
    ctx.globalAlpha = 1; ctx.strokeStyle = ink; ctx.lineWidth = 0.6; ctx.strokeRect(L + 4, T + 4, tw + 10, 16);
    ctx.fillStyle = ink; ctx.fillText(lab, L + 9, T + 15);
  }
  ctx.restore();
}
function redrawEditors() {
  if (S.mode === "pit") drawPitEditor();
  if (simLike()) { drawMaskEditor(); if (SIM.res) drawSection(); }
  if (S.mode === "find") drawFindMap();
}

// ---- pointer tracking (capture phase on the parent, so it also runs while drawing or dragging)
(() => {
  const ED: Record<string, { ed: () => any; k: number; redraw: () => void }> = {
    pitCanvas: { ed: () => S.pitEd, k: 1, redraw: () => drawPitEditor() },
    maskCanvas: { ed: () => SIM.ed, k: 1, redraw: () => { drawMaskEditor(); if (SIM.res) drawSection(); } },
    fdCanvas: { ed: () => FD.ed, k: 1, redraw: () => drawFindMap() },
  };
  let raf = 0; const pending = new Set<string>();
  const later = (id: string) => { pending.add(id); if (!raf) raf = requestAnimationFrame(() => { raf = 0; for (const p of pending) ED[p].redraw(); pending.clear(); }); };
  const world = (id: string, ev: PointerEvent) => { const ed = ED[id].ed(), r = $(id).getBoundingClientRect(); return ed ? [(ev.clientX - r.left - ed.ox)/ed.s, -(ev.clientY - r.top - ed.oy)/ed.s] : null; };
  // the section line of the simulator: distance in px from the pointer, and dragging it
  const cutDist = (ev: PointerEvent) => {
    const ed = SIM.ed, r = $("maskCanvas").getBoundingClientRect(); if (!ed) return Infinity;
    const px = ev.clientX - r.left, py = ev.clientY - r.top;
    return SIM.cutAxis === "y" ? Math.abs(py - (ed.oy - SIM.cutPos*ed.s)) : Math.abs(px - (ed.ox + SIM.cutPos*ed.s));
  };
  let cutDrag = false;
  for (const id of Object.keys(ED)) {
    const cv = $(id); if (!cv) continue;
    const host = cv.parentElement, mine = (ev: Event) => ev.target === cv;
    host.addEventListener("pointermove", (ev: PointerEvent) => {
      if (!mine(ev)) return;
      const w = world(id, ev); if (!w) return;
      EDC[id] = w;
      if (id === "maskCanvas") {
        if (cutDrag) { ev.stopPropagation(); setCutPos(snapV(SIM.cutAxis === "y" ? w[1] : w[0])); return; }
        cv.style.cursor = DRAW.on !== id && ev.buttons === 0 && cutDist(ev) <= 5 ? (SIM.cutAxis === "y" ? "ns-resize" : "ew-resize") : "";
      }
      // the editors redraw themselves while a shape is dragged or an outline drawn
      if (ev.buttons === 0 && DRAW.on !== id) later(id);
    }, true);
    host.addEventListener("pointerleave", (ev: PointerEvent) => { if (!mine(ev) || cutDrag) return; delete EDC[id]; later(id); }, true);
    cv.addEventListener("pointerleave", () => { if (cutDrag) return; delete EDC[id]; later(id); });
    if (id === "maskCanvas") {
      host.addEventListener("pointerdown", (ev: PointerEvent) => {
        if (!mine(ev) || DRAW.on === id || cutDist(ev) > 5) return;
        ev.stopPropagation(); ev.preventDefault(); cutDrag = true; cv.setPointerCapture(ev.pointerId);
      }, true);
      const end = (ev: PointerEvent) => { if (!cutDrag) return; ev.stopPropagation(); cutDrag = false; };
      host.addEventListener("pointerup", end, true); host.addEventListener("pointercancel", end, true);
    }
  }
})();

// =====================================================================================================
// Zoom and pan in the 2D editors. Each editor draws its plot in a fixed rectangle (L, T, Wp × Hp px) at the
// fit scale s0; edView() returns the zoomed scale and origin for the current zoom z and centre (cx, cy), and
// the visible world range. Ctrl + wheel or pinch zooms at the cursor, the − + Fit buttons and the + − 0 keys
// zoom about the centre, and Space + drag or middle-button drag pans.
function edView(id: string, s0: number, L: number, T: number, Wp: number, Hp: number, cx0: number, cy0: number, zmax: number) {
  const v = EDZ[id] || (EDZ[id] = { z: 1, cx: cx0, cy: cy0 });
  v.z = Math.max(1, Math.min(zmax, v.z || 1));
  if (v.z === 1) { v.cx = cx0; v.cy = cy0; }
  const sz = s0*v.z, hw = Wp/2/sz, hh = Hp/2/sz, HW = Wp/2/s0, HH = Hp/2/s0;
  v.cx = Math.max(cx0 - HW + hw, Math.min(cx0 + HW - hw, v.cx));
  v.cy = Math.max(cy0 - HH + hh, Math.min(cy0 + HH - hh, v.cy));
  const view = { s: sz, ox: L + Wp/2 - v.cx*sz, oy: T + Hp/2 + v.cy*sz, z: v.z, zmax, s0, L, T, Wp, Hp, X0: v.cx - hw, X1: v.cx + hw, Y0: v.cy - hh, Y1: v.cy + hh };
  const lab = document.querySelector(`.zoomBar[data-for="${id}"] .zv`); if (lab) lab.textContent = `${Math.round(v.z*100)} %`;
  return view;
}
(() => {
  const ED: Record<string, { ed: () => any; redraw: () => void }> = {
    pitCanvas: { ed: () => S.pitEd, redraw: () => drawPitEditor() },
    maskCanvas: { ed: () => SIM.ed, redraw: () => drawMaskEditor() },
    fdCanvas: { ed: () => FD.ed, redraw: () => drawFindMap() },
  };
  let raf = 0; const pend = new Set<string>();
  const redraw = (id: string) => { pend.add(id); if (!raf) raf = requestAnimationFrame(() => { raf = 0; for (const p of pend) ED[p].redraw(); pend.clear(); }); };
  // zoom by factor f keeping the canvas point (px, py) fixed; no point: the centre of the plot
  function zoomAt(id: string, f: number, px?: number, py?: number) {
    const ed = ED[id].ed(), V = ed && ed.view; if (!V) return;
    const v = EDZ[id], z1 = Math.max(1, Math.min(V.zmax, v.z*f)); if (z1 === v.z) return;
    if (px == null) { px = V.L + V.Wp/2; py = V.T + V.Hp/2; }
    const wx = (px - ed.ox)/ed.s, wy = -(py - ed.oy)/ed.s, s1 = V.s0*z1;
    v.z = z1; v.cx = wx - (px - V.L - V.Wp/2)/s1; v.cy = wy + (py - V.T - V.Hp/2)/s1;
    ED[id].redraw();
  }
  let space = false;
  window.addEventListener("keydown", e => { if (e.code === "Space" && (e.target as HTMLElement).tagName === "CANVAS" && ED[(e.target as HTMLElement).id]) { space = true; e.preventDefault(); } });
  window.addEventListener("keyup", e => { if (e.code === "Space") space = false; });
  for (const id of Object.keys(ED)) {
    const cv = $(id); if (!cv) continue;
    // the bar above the editor
    const bar = document.createElement("div"); bar.className = "zoomBar"; bar.dataset.for = id;
    bar.innerHTML = `<button class="btn" data-z="out" title="Zoom out (key −)" aria-label="zoom out">−</button><span class="zv" aria-live="polite">100 %</span><button class="btn" data-z="in" title="Zoom in (key +)" aria-label="zoom in">+</button><button class="btn" data-z="fit" title="Show everything (key 0)">Fit</button><span class="note">Ctrl + scroll or pinch to zoom at the cursor; Space + drag or middle-drag to pan</span>`;
    cv.parentElement.insertBefore(bar, cv);
    bar.addEventListener("click", e => {
      const b = (e.target as HTMLElement).closest("button"); if (!b) return;
      if (b.dataset.z === "in") zoomAt(id, 2); else if (b.dataset.z === "out") zoomAt(id, 0.5);
      else { EDZ[id] = { z: 1, cx: 0, cy: 0 }; ED[id].redraw(); }
    });
    cv.addEventListener("wheel", (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;   // a plain wheel scrolls the page
      e.preventDefault(); const r = cv.getBoundingClientRect();
      zoomAt(id, Math.exp(-e.deltaY*0.0025), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    cv.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") { e.preventDefault(); zoomAt(id, 2); }
      else if (e.key === "-" || e.key === "_") { e.preventDefault(); zoomAt(id, 0.5); }
      else if (e.key === "0") { e.preventDefault(); EDZ[id] = { z: 1, cx: 0, cy: 0 }; ED[id].redraw(); }
    });
    // pan: capture on the parent so it runs before the editor's own drag and draw handlers
    let pan: { x: number; y: number; cx: number; cy: number } | null = null;
    const host = cv.parentElement;
    host.addEventListener("pointerdown", (e: PointerEvent) => {
      if (e.target !== cv || !(e.button === 1 || (space && e.button === 0))) return;
      const v = EDZ[id]; if (!v || v.z <= 1) return;
      e.stopPropagation(); e.preventDefault(); cv.setPointerCapture(e.pointerId);
      pan = { x: e.clientX, y: e.clientY, cx: v.cx, cy: v.cy }; cv.style.cursor = "grabbing";
    }, true);
    host.addEventListener("pointermove", (e: PointerEvent) => {
      if (!pan || e.target !== cv) return; e.stopPropagation();
      const v = EDZ[id], ed = ED[id].ed(); v.cx = pan.cx - (e.clientX - pan.x)/ed.s; v.cy = pan.cy + (e.clientY - pan.y)/ed.s; redraw(id);
    }, true);
    const end = (e: PointerEvent) => { if (!pan) return; e.stopPropagation(); pan = null; cv.style.cursor = ""; };
    host.addEventListener("pointerup", end, true); host.addEventListener("pointercancel", end, true);
    cv.addEventListener("auxclick", e => { if (e.button === 1) e.preventDefault(); });
  }
})();
