const C = Core, V3 = THREE.Vector3;
const T_WAFER = 525;
// ---- user settings (kept in this browser only)
const SET_DEF = { layout: "standard", panelW: 340, stageH: 68, theme: "auto", labels: "normal", anim: true, pixel: "auto", snap: 5, quality: "normal", autoRun: false, engine: "auto", coords: true };
const SET = Object.assign({}, SET_DEF);
try { Object.assign(SET, JSON.parse(localStorage.getItem("o3d-settings") || "{}")); } catch (e) {}
const saveSet = () => { try { localStorage.setItem("o3d-settings", JSON.stringify(SET)); } catch (e) {} };
let layoutBusy = false;   // true while applyLayout() switches split/theater, so they do not overwrite SET.layout
const snapV = v => { const st = Number(SET.snap) || 1; return Math.round(v/st)*st; };
const EDC: Record<string, number[]> = {};   // cursor position in each 2D editor (world µm), set in 19-coordinates.ts
const edGrid = (W: number) => niceStep(W/8);  // grid and tick step of an editor W µm wide
// height limit of an editor or graph canvas: generous inside an enlarged window, none otherwise
const bigBox = cv => !!(cv && cv.closest(".enlarged"));
const edMaxH = cv => bigBox(cv) ? Math.max(260, window.innerHeight*0.94 - 230) : Infinity;
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

