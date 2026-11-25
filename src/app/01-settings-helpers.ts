const C = Core, V3 = THREE.Vector3;
const T_WAFER = 525;
// ---- user settings (kept in this browser only)
const SET_DEF = { gridType: "lines", listSide: "right", layout: "standard", panelW: 340, stageH: 68, theme: "auto", labels: "normal", anim: true, pixel: "auto", snap: 5, quality: "normal", autoRun: false, engine: "auto", coords: true, explain: false, arrAlong: true, arrPerp: true, gizmo: true, scaleBar: true };
const SET = Object.assign({}, SET_DEF);
try { Object.assign(SET, JSON.parse(localStorage.getItem("o3d-settings") || "{}")); } catch (e) {}
const saveSet = () => { try { localStorage.setItem("o3d-settings", JSON.stringify(SET)); } catch (e) {} };
let layoutBusy = false;   // true while applyLayout() switches split/theater, so they do not overwrite SET.layout
const snapV = v => { const st = Number(SET.snap) || 1; return Math.round(v/st)*st; };
// a point on the editor grid: square steps, or with the crystal grid the crossing of its first two line families (angs in degrees)
function snapP(x: number, y: number, angs?: number[]) {
  const st = Number(SET.snap) || 1, r = v => Math.round(v*1e4)/1e4;
  if (SET.gridType === "crystal" && angs && angs.length >= 2 && !(Math.abs(angs[0]) < 1e-9 && Math.abs(angs[1] - 90) < 1e-9)) {
    const n = angs.slice(0, 2).map(a => [-Math.sin(a*Math.PI/180), Math.cos(a*Math.PI/180)]), k = n.map(v => Math.round((v[0]*x + v[1]*y)/st)*st), det = n[0][0]*n[1][1] - n[0][1]*n[1][0];
    if (Math.abs(det) > 1e-6) return [r((k[0]*n[1][1] - n[0][1]*k[1])/det), r((n[0][0]*k[1] - k[0]*n[1][0])/det)];
  }
  return [snapV(x), snapV(y)];
}
const EDC: Record<string, number[]> = {};   // cursor position in each 2D editor (world µm), set in 19-coordinates.ts
const edGrid = (W: number) => niceStep(W/8);
// text from files or storage (names of etchants and presets) is escaped before it goes into HTML
function escHTML(v: unknown) { return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;"); }
// editor speed: pointer moves redraw an editor at most once per frame, and the off-screen mask layers are reused
var ED_LATER: Record<string, any> = {};
function edLater(key: string, f: () => void) {
  if (ED_LATER[key]) { ED_LATER[key].f = f; return; }
  ED_LATER[key] = { f }; requestAnimationFrame(() => { const q = ED_LATER[key]; delete ED_LATER[key]; if (q) q.f(); });
}
var ED_TMP: Record<string, HTMLCanvasElement> = {};
function edTmp(key: string, w: number, h: number) {   // a cleared off-screen canvas of this size
  const c = ED_TMP[key] || (ED_TMP[key] = document.createElement("canvas"));
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } else { const x = c.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1; x.clearRect(0, 0, w, h); }
  return c;
}
const EDZ: Record<string, { z: number; cx: number; cy: number }> = {};
const EDM: Record<string, { on: boolean; a: number[] | null; b: number[] | null }> = {};   // measuring tool in the 2D editors (module 19)
const fmtLen = (v: number) => { const a = Math.abs(v); return a >= 1000 ? `${+(v/1000).toPrecision(4)} mm` : a >= 10 ? `${+v.toFixed(1)} µm` : `${+v.toFixed(2)} µm`; };   // zoom and centre of each 2D editor (19-coordinates.ts)  // grid and tick step of an editor W µm wide
// height limit of an editor or graph canvas: generous inside an enlarged window, none otherwise
const bigBox = cv => !!(cv && cv.closest(".enlarged"));
const edMaxH = cv => { if (!bigBox(cv)) return Infinity; const box = cv.closest(".enlarged"); return Math.max(260, (box.clientHeight || window.innerHeight*0.94) - (cv.offsetTop || 120) - 56); };
// grid of the 2D editors (setting gridType): square lines, dots, lines along the crystal directions in the wafer plane, or none
const GRID_TYPES = { lines: "square lines", dots: "dots", crystal: "crystal directions", off: "no grid" };
function gridSelect(cls = "gridSel") { return `<label class="gridPick" title="Grid of the editors: square lines, dots, lines along the {111} wall traces of this wafer, or none">grid <select class="${cls}">${Object.entries(GRID_TYPES).map(([k, v]) => `<option value="${k}"${SET.gridType === k ? " selected" : ""}>${v}</option>`).join("")}</select></label>`; }
function gridAngles(dirs, rot) {   // up to three line families: the {111} wall traces (else all listed directions), modulo 180°
  const L = (dirs.some(d => d.wall != null) ? dirs.filter(d => d.wall != null) : dirs).map(d => (((d.ang + (rot || 0)) % 180) + 180) % 180), out = [];
  for (const a of L) if (!out.some(b => Math.min(Math.abs(a - b), 180 - Math.abs(a - b)) < 1)) out.push(a);
  return out.length ? out.slice(0, 3) : [0, 90];
}
function edGridDraw(ctx: CanvasRenderingContext2D, o: { toC: (p: number[]) => number[]; X0: number; X1: number; Y0: number; Y1: number; g: number; px: number; angs?: number[]; ink: string; kind?: string; bold?: number }) {
  const kind = o.kind || SET.gridType || "lines"; if (kind === "off") return;
  const g = o.g, G = g*(o.bold || 5);
  ctx.save(); ctx.strokeStyle = ctx.fillStyle = o.ink; ctx.lineWidth = 1; ctx.setLineDash([]);
  if (kind === "dots") {
    const st = g*o.px >= 7 ? g : G; ctx.globalAlpha = 0.35; const r = st === g ? 0.8 : 1;
    for (let x = Math.ceil(o.X0/st)*st; x <= o.X1; x += st) for (let y = Math.ceil(o.Y0/st)*st; y <= o.Y1; y += st) {
      const q = o.toC([x, y]), big = Math.abs(x/G - Math.round(x/G)) < 1e-6 && Math.abs(y/G - Math.round(y/G)) < 1e-6; ctx.fillRect(q[0] - (big ? 1.2 : r), q[1] - (big ? 1.2 : r), big ? 2.4 : 2*r, big ? 2.4 : 2*r);
    }
  } else {
    const angs = kind === "crystal" ? (o.angs && o.angs.length ? o.angs : [0, 90]) : [0, 90];
    const cx = (o.X0 + o.X1)/2, cy = (o.Y0 + o.Y1)/2, R = Math.hypot(o.X1 - o.X0, o.Y1 - o.Y0)/2;
    for (const [st, al] of [[g, 0.07], [G, 0.15]] as [number, number][]) {
      if (st*o.px < 4) continue;
      ctx.globalAlpha = al; ctx.beginPath();
      for (const a of angs) {
        const u = [Math.cos(a*Math.PI/180), Math.sin(a*Math.PI/180)], n = [-u[1], u[0]], c0 = cx*n[0] + cy*n[1];
        for (let k = Math.ceil((c0 - R)/st); k*st <= c0 + R; k++) {
          const d = k*st, m = [n[0]*d, n[1]*d], t0 = (cx - m[0])*u[0] + (cy - m[1])*u[1];
          const A = o.toC([m[0] + u[0]*(t0 - R), m[1] + u[1]*(t0 - R)]), B = o.toC([m[0] + u[0]*(t0 + R), m[1] + u[1]*(t0 + R)]);
          ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]);
        }
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}
// every grid list on the page shows the same choice; a change redraws the editors (redrawAll and mdRequest are defined later)
document.addEventListener("change", ev => { const t = ev.target as HTMLSelectElement; if (!t || !t.classList || !t.classList.contains("gridSel")) return;
  SET.gridType = t.value; saveSet(); for (const s of document.querySelectorAll(".gridSel")) (s as HTMLSelectElement).value = SET.gridType;
  if (typeof redrawAll === "function") redrawAll(); if (typeof MD !== "undefined" && MD && MD.on) mdRequest(); });
const graphH = (cv, h) => bigBox(cv) ? Math.max(h, Math.round(window.innerHeight*0.33)) : h;
// etch rates from data/etchants.json (pit: three planes per etchant; simulator: up to 12, see 07-pit-editor)
const ETCH = loadEtchants(readDb<EtchantDb>("etchants"));
const RATES = ETCH.PR, PIT2SIM = ETCH.PIT2SIM;
// vertical-wall trench on (110): long edges along a vertical-wall trace (54.74° from the flat), as Example 8
function trench110(W, L) {
  const a = 35.2644/C.DEG, d1 = [Math.sin(a), Math.cos(a)], d2 = [-Math.sin(a), Math.cos(a)];
  const n1 = [d1[1], -d1[0]], s2 = W/Math.abs(d2[0]*n1[0] + d2[1]*n1[1]);
  const P0 = [-L/2*d1[0] - s2/2*d2[0], -L/2*d1[1] - s2/2*d2[1]];
  return [P0, [P0[0] + L*d1[0], P0[1] + L*d1[1]], [P0[0] + L*d1[0] + s2*d2[0], P0[1] + L*d1[1] + s2*d2[1]], [P0[0] + s2*d2[0], P0[1] + s2*d2[1]]];
}
const OPENINGS = loadPitExamples(readDb("pit-examples"), trench110);   // data/pit-examples.json
const HOLD = {
  "100": { title: "(100) wafer: a corner up", steps: [
    "Hold the model with one corner pointing straight up. That corner is [001]; the opposite corner points into the wafer.",
    "Turn it about the vertical axis until the four edges around the middle run parallel and perpendicular to the flat. Those edges lie along ⟨110⟩, and the [100] and [010] corners sit 45° to either side of the flat normal, as drawn in Lec 4-1 p. 6.",
    "The wafer surface cuts the model through those four edges. The lower half is the pit for a very small opening: an inverted pyramid with four faces at 54.74°.",
    "For a real opening, slide each lower face outward until it touches the opening (tutorial, Step 2)."] },
  "110": { title: "(110) wafer: an edge up", steps: [
    "Hold the model with one edge on top, horizontal. The midpoint of that edge points along [110], the wafer normal.",
    "Turn it until the top edge is parallel to the flat. The top edge then runs along [1̄10].",
    "The wafer surface cuts the model through its middle. Four faces hang straight down (vertical walls, traces at 54.74° to the flat); the two lower faces lean at 35.26° and meet in a trough under the bottom edge.",
    "Slide each lower face outward until it touches the opening."] },
  "111": { title: "(111) wafer: a face up", steps: [
    "Lay the model on one face, so the opposite face is flat on top. Both are {111} planes parallel to the wafer.",
    "Turn it until one edge of the top triangle is parallel to the flat (flat assumed along [1̄10]).",
    "The wafer surface cuts the model in a hexagon. Three side faces lean inward and three overhang, all at 70.53°; the bottom face is the floor.",
    "Because the top face is {111}, an opening does not etch down unless the hole is started first (pre-etch); the walls then undercut sideways."] },
};

// --------------------------------------------------------------------- helpers
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let COL: Record<string, any> = {};
function readColors() {
  for (const k of ["scene-bg", "s-ink", "s-top", "s-side", "s-cut", "f111", "f100", "f110", "fhi", "m-up", "m-low", "disc", "mask", "ghost", "accent"])
    COL[k] = new THREE.Color(css("--" + k) || "#888");
}
const fmtA = a => Math.abs(a - Math.round(a)) < 0.005 ? `${Math.round(a)}°` : `${a.toFixed(2)}°`;
const um = x => `${x.toFixed(1)} µm`;
function idxHTML(v, open = "(", close = ")") {
  return open + v.map(x => x < 0 ? `<span class="ob">${-x}</span>` : `${x}`).join("") + close;
}
const famHTML = f => f === "surface" || f === "back" ? f : `{${f}}`;
const LIGHT = C.unit([0.35, -0.6, 0.75]);
function shadeColor(base, n) {
  const k = 0.62 + 0.38*Math.max(0, C.dot(n, LIGHT));
  return base.clone().multiplyScalar(k);
}
const famColor = f => f === "111" ? COL.f111 : f === "100" ? COL.f100 : f === "110" ? COL.f110 : COL["s-top"];
const v3 = p => new V3(p[0], p[1], p[2]);
// sequential colour map (viridis stops): readable on light and dark backgrounds
const CMAP = [[68,1,84],[72,40,120],[62,74,137],[49,104,142],[38,130,142],[31,158,137],[53,183,121],[109,205,89],[180,222,44],[253,231,37]];
function cmap(u) {
  u = Math.max(0, Math.min(1, u || 0)) * (CMAP.length - 1);
  const i = Math.min(CMAP.length - 2, Math.floor(u)), f = u - i, a = CMAP[i], b = CMAP[i + 1];
  return new THREE.Color((a[0] + f*(b[0] - a[0]))/255, (a[1] + f*(b[1] - a[1]))/255, (a[2] + f*(b[2] - a[2]))/255);
}
function showCbar(title, v0, v1, unit) {
  const box = document.getElementById("cbar"), cv = document.getElementById("cbarCv");
  box.classList.remove("hidden"); document.getElementById("cbarTitle").textContent = title;
  const w = 210, h = 34, dpr = Math.min(2, window.devicePixelRatio || 1), ctx = cv.getContext("2d");
  cv.width = w*dpr; cv.height = h*dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const x0 = 6, x1 = w - 6;
  for (let x = x0; x < x1; x++) { ctx.fillStyle = "#" + cmap((x - x0)/(x1 - x0 - 1)).getHexString(); ctx.fillRect(x, 2, 1.2, 11); }
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim() || "#222";
  ctx.fillStyle = ink; ctx.font = "10.5px IBM Plex Mono, monospace"; ctx.textAlign = "center";
  const span = v1 - v0, st = span > 0 ? niceStep(span/4) : 1, dig = st < 0.01 ? 3 : st < 0.1 ? 2 : st < 1 ? 1 : 0;
  for (let v = Math.ceil(v0/st)*st; v <= v1 + 1e-9*Math.max(1, Math.abs(v1)); v += st) {
    const x = x0 + (span > 0 ? (v - v0)/span : 0)*(x1 - x0); ctx.fillRect(x - 0.5, 13, 1, 4); ctx.fillText(v.toFixed(dig), Math.min(x1 - 8, Math.max(x0 + 8, x)), 28);
  }
  ctx.textAlign = "right"; ctx.fillStyle = ink; ctx.globalAlpha = 0.7; ctx.fillText(unit, w - 2, 28 + 0); ctx.globalAlpha = 1;
}
function hideCbar() { document.getElementById("cbar").classList.add("hidden"); }
// line graph against time: series [{name, color, x: [], y: []}], vertical marker at tv
function drawGraph(cv, series, { xmax, tv, ylabel = "µm", marks = [] }) {
  const wcss = cv.clientWidth || 600, hcss = graphH(cv, 190), dpr = Math.min(2, window.devicePixelRatio || 1), ctx = cv.getContext("2d");
  cv.width = Math.round(wcss*dpr); cv.height = Math.round(hcss*dpr); cv.style.height = `${hcss}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, wcss, hcss);
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const ink = css("--ink"), mut = css("--muted"), line = css("--line");
  const L = 46, R = 12, T = 10, B = 30, W = wcss - L - R, H = hcss - T - B;
  let ymax = 0, ymin = 0; for (const s of series) for (const v of s.y) { if (v > ymax) ymax = v; if (v < ymin) ymin = v; }
  ymax = ymax > 0 ? ymax*1.08 : (ymin < 0 ? 0.08*-ymin : 1); ymin = ymin < 0 ? ymin*1.08 : 0; xmax = xmax > 0 ? xmax : 1;
  const X = x => L + x/xmax*W, Y = y => T + H - (y - ymin)/(ymax - ymin)*H;
  ctx.font = "11px IBM Plex Mono, monospace"; ctx.lineWidth = 1;
  const ys = niceStep((ymax - ymin)/4), xs = niceStep(xmax/6);
  ctx.strokeStyle = line; ctx.fillStyle = mut; ctx.textAlign = "right";
  for (let v = Math.ceil(ymin/ys - 1e-9)*ys; v <= ymax + 1e-9; v += ys) { ctx.beginPath(); ctx.moveTo(L, Y(v)); ctx.lineTo(L + W, Y(v)); ctx.stroke(); ctx.fillText(v.toFixed(ys < 1 ? 1 : 0), L - 6, Y(v) + 4); }
  ctx.textAlign = "center";
  for (let v = 0; v <= xmax + 1e-9; v += xs) { ctx.fillText(v.toFixed(0), X(v), T + H + 15); }
  ctx.fillText("etch time (min)", L + W/2, hcss - 2);
  ctx.save(); ctx.translate(11, T + H/2); ctx.rotate(-Math.PI/2); ctx.fillText(ylabel, 0, 0); ctx.restore();
  ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + H); ctx.moveTo(L, Y(0)); ctx.lineTo(L + W, Y(0)); ctx.stroke();
  for (const m of marks) { ctx.strokeStyle = m.color || ink; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(m.x), T); ctx.lineTo(X(m.x), T + H); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = m.color || ink; ctx.textAlign = "left"; ctx.fillText(m.label, Math.min(X(m.x) + 4, L + W - 90), T + 10); }
  for (const s of series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.beginPath();
    s.x.forEach((x, i) => i ? ctx.lineTo(X(x), Y(s.y[i])) : ctx.moveTo(X(x), Y(s.y[i]))); ctx.stroke();
  }
  const out = [];
  if (tv != null) {
    ctx.strokeStyle = mut; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(tv), T); ctx.lineTo(X(tv), T + H); ctx.stroke(); ctx.setLineDash([]);
    for (const s of series) {
      let k = 0; while (k < s.x.length - 1 && s.x[k + 1] < tv) k++;
      const x0 = s.x[k], x1 = s.x[Math.min(k + 1, s.x.length - 1)], f = x1 > x0 ? Math.max(0, Math.min(1, (tv - x0)/(x1 - x0))) : 0;
      const v = s.y[k] + f*(s.y[Math.min(k + 1, s.y.length - 1)] - s.y[k]);
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(X(tv), Y(v), 3.5, 0, 2*Math.PI); ctx.fill(); out.push(v);
    }
  }
  return out;
}
function graphLegend(el, series, vals, tv) {
  el.innerHTML = series.map((s, i) => `<span><i style="background:${s.color}"></i>${s.name}${vals && vals[i] != null ? `: ${vals[i].toFixed(1)} µm` : ""}</span>`).join("") + (tv != null ? `<span>at ${tv.toFixed(0)} min</span>` : "");
}

