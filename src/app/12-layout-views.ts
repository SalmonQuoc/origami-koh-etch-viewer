// ---- theater view (wide stage, panel below) and full screen
function setTheater(on) {
  document.body.classList.toggle("theater", on); $("bTheater").setAttribute("aria-pressed", String(on));
  $("bTheater").textContent = on ? "Exit theater view" : "Theater view";
  if (on && document.body.classList.contains("split")) setSplit(false);
  if (!layoutBusy) { if (on) document.body.classList.remove("stacked"); SET.layout = on ? "theater" : (SET.layout === "theater" ? "standard" : SET.layout); saveSet(); }
  requestAnimationFrame(redrawPanes);
}
function redrawPanes() { resize(); if (simLike()) { drawSection(); drawMaskEditor(); drawSimGraph(); } else if (S.mode === "pit") { drawPitGraph(); drawPitEditor(); } else if (S.mode === "find") { drawFindMap(); drawScope(); drawFdPlot(); } }
// split view: two panes, draggable divider (width of the 3D pane kept in --splitW)
function setSplit(on) {
  document.body.classList.toggle("split", on); $("bSplit").setAttribute("aria-pressed", String(on));
  $("bSplit").textContent = on ? "Exit split view" : "Split view"; $("bSwap").classList.toggle("hidden", !on);
  if (on && document.body.classList.contains("theater")) setTheater(false);
  if (!layoutBusy) { if (on) document.body.classList.remove("stacked"); SET.layout = on ? (document.body.classList.contains("swap") ? "split-left" : "split") : (SET.layout.startsWith("split") ? "standard" : SET.layout); saveSet(); }
  requestAnimationFrame(redrawPanes);
}
function setSplitW(px) {
  const W = document.querySelector(".grid").clientWidth, v = Math.max(320, Math.min(W - 312, px));
  document.documentElement.style.setProperty("--splitW", `${(100*v/W).toFixed(2)}%`);
}
// toolbar height, for the sticky panes under the sticky toolbar in split view
new ResizeObserver(() => document.documentElement.style.setProperty("--barH", `${document.querySelector(".bar").offsetHeight}px`)).observe(document.querySelector(".bar"));
const splitScroll = () => { const gr = document.querySelector(".grid"), bh = document.querySelector(".bar").offsetHeight; window.scrollTo(0, gr.getBoundingClientRect().top + window.scrollY - bh); };
const toggleSplit = () => { const on = !document.body.classList.contains("split"); setSplit(on); if (on) requestAnimationFrame(splitScroll); };
$("bSplit").addEventListener("click", toggleSplit);
$("bSwap").addEventListener("click", () => {
  const on = !document.body.classList.contains("swap"); document.body.classList.toggle("swap", on);
  if (document.body.classList.contains("split")) { SET.layout = on ? "split-left" : "split"; saveSet(); }
  requestAnimationFrame(redrawPanes);
});
{
  const sp = $("splitter"); let drag = false, raf = 0;
  const save = () => { try { localStorage.setItem("o3d-splitW", getComputedStyle(document.documentElement).getPropertyValue("--splitW").trim()); } catch (e) {} };
  const moveTo = x => {
    const g = document.querySelector(".grid").getBoundingClientRect(), swap = document.body.classList.contains("swap");
    setSplitW(swap ? g.right - x - 6 : x - g.left - 6);
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; redrawPanes(); });
  };
  sp.addEventListener("pointerdown", e => { drag = true; sp.setPointerCapture(e.pointerId); sp.classList.add("drag"); document.body.classList.add("dragging"); e.preventDefault(); });
  sp.addEventListener("pointermove", e => { if (drag) moveTo(e.clientX); });
  const end = () => { if (!drag) return; drag = false; sp.classList.remove("drag"); document.body.classList.remove("dragging"); save(); redrawPanes(); };
  sp.addEventListener("pointerup", end); sp.addEventListener("pointercancel", end);
  sp.addEventListener("dblclick", () => { document.documentElement.style.removeProperty("--splitW"); try { localStorage.removeItem("o3d-splitW"); } catch (e) {} requestAnimationFrame(redrawPanes); });
  sp.addEventListener("keydown", e => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const left = document.querySelector(".grid > .left").getBoundingClientRect().width, d = (e.key === "ArrowLeft" ? -1 : 1)*(e.shiftKey ? 80 : 20)*(document.body.classList.contains("swap") ? -1 : 1);
    setSplitW(left + d); save(); requestAnimationFrame(redrawPanes); e.preventDefault(); e.stopPropagation();
  });
}
$("bTheater").addEventListener("click", () => setTheater(!document.body.classList.contains("theater")));
document.addEventListener("keydown", e => {
  const k = e.key.toLowerCase(); if (k !== "t" && k !== "s") return;
  const tg = e.target.tagName; if (tg === "INPUT" || tg === "SELECT" || tg === "TEXTAREA" || tg === "CANVAS" || e.ctrlKey || e.metaKey || e.altKey) return;
  if (k === "t") setTheater(!document.body.classList.contains("theater"));
  else toggleSplit();
});
$("bFull").addEventListener("click", () => {
  if (document.fullscreenElement) { document.exitFullscreen().catch(() => {}); return; }
  const r = stage.requestFullscreen ? stage.requestFullscreen() : null;
  if (r && r.catch) r.catch(() => { $("bFull").textContent = "Full screen not available here"; setTimeout(() => { $("bFull").textContent = "Full screen"; }, 2500); });
});
document.addEventListener("fullscreenchange", () => { $("bFull").textContent = document.fullscreenElement ? "Exit full screen" : "Full screen"; $("bFull").setAttribute("aria-pressed", String(!!document.fullscreenElement)); requestAnimationFrame(resize); });
try {
  const w = localStorage.getItem("o3d-splitW"); if (w && /^[\d.]+%$/.test(w)) document.documentElement.style.setProperty("--splitW", w);
  if (!localStorage.getItem("o3d-settings")) {   // older versions kept the layout in separate keys
    if (localStorage.getItem("o3d-split") === "1") SET.layout = localStorage.getItem("o3d-swap") === "1" ? "split-left" : "split";
    else if (localStorage.getItem("o3d-theater") === "1") SET.layout = "theater";
  }
} catch (e) {}

