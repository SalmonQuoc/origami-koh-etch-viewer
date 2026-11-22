// =====================================================================================================
// "Show" tab on the 3D view: every visibility and colour option of the current scene in one place
// (layers, mask film, whole wafer, flat arrows, colours, labels, gizmo, scale bar, editor overlays).
// The tab holds no state of its own: each entry reads the page state and, when changed, sets the
// control it stands for in the panel or in Settings and fires its "change" event, so the panel,
// Settings and the tab always agree. Key V opens or closes it.
type ShowItem = { g: string, label: string, modes: string, get?: () => any, set?: (v: any) => void, opts?: () => string, legend?: () => string };
var SHOW = { open: false, key: "" };   // var: read by stageOverlay (module 21) from the render loop
function viaCtl(sel: string, v: any) {   // set a panel / Settings control and let its own handler do the work
  const el = document.querySelector(sel) as HTMLInputElement | HTMLSelectElement; if (!el) return;
  if ((el as HTMLInputElement).type === "checkbox") (el as HTMLInputElement).checked = !!v; else el.value = v;
  el.dispatchEvent(new Event("change", { bubbles: true }));
}
const chk = (sel: string) => () => !!(document.querySelector(sel) as HTMLInputElement)?.checked;
const SHOW_ITEMS: ShowItem[] = [
  // modes: m model, p pit, s simulator and corner lab, f find orientation
  { g: "Layers", label: "upper half of the octahedron", modes: "m", get: chk("#cUpper"), set: v => viaCtl("#cUpper", v) },
  { g: "Layers", label: "corner directions", modes: "m", get: chk("#cCorners"), set: v => viaCtl("#cCorners", v) },
  { g: "Layers", label: "face indices", modes: "m", get: chk("#cFaces"), set: v => viaCtl("#cFaces", v) },
  { g: "Layers", label: "silicon block (off: cast of the pit)", modes: "p", get: chk("#cBlock"), set: v => viaCtl("#cBlock", v) },
  { g: "Layers", label: "mask layer", modes: "p", get: chk("#cMask"), set: v => viaCtl("#cMask", v) },
  { g: "Layers", label: "mask layer", modes: "s", get: chk("#cSimMask"), set: v => viaCtl("#cSimMask", v) },
  { g: "Layers", label: "final {111} shape (wire)", modes: "p", get: chk("#cGhost"), set: v => viaCtl("#cGhost", v) },
  { g: "Layers", label: "cut open at the section line (A → B)", modes: "p", get: chk("#cCut"), set: v => viaCtl("#cCut", v) },
  { g: "Layers", label: "cut open at the section line (A → B)", modes: "s", get: chk("#cSimCut"), set: v => viaCtl("#cSimCut", v) },
  { g: "Layers", label: "whole 100 mm wafer around the die", modes: "p", get: () => !!S.waferOn, set: v => viaCtl('#panelPit [data-wu="on"]', v) },
  { g: "Layers", label: "whole 100 mm wafer around the die", modes: "s", get: () => !!S.waferOn, set: v => viaCtl('#panelSim [data-wu="on"]', v) },
  { g: "Layers", label: "true flat error δ", modes: "f", get: chk("#fdReveal"), set: v => viaCtl("#fdReveal", v) },
  { g: "Flat arrows", label: "along the flat", modes: "mps", get: () => SET.arrAlong !== false, set: v => viaCtl('#dlgSet [data-arr="arrAlong"]', v) },
  { g: "Flat arrows", label: "⊥ flat, outward", modes: "mpsf", get: () => SET.arrPerp !== false, set: v => viaCtl('#dlgSet [data-arr="arrPerp"]', v) },
  { g: "Colours", label: "colour by", modes: "p", get: () => ($("pitColor") as HTMLSelectElement).value, set: v => viaCtl("#pitColor", v), opts: () => $("pitColor").innerHTML },
  { g: "Colours", label: "colour by", modes: "s", get: () => ($("simColor") as HTMLSelectElement).value, set: v => viaCtl("#simColor", v), opts: () => $("simColor").innerHTML },
  { g: "Colours", label: "", modes: "p", legend: () => $("pitLegend").innerHTML },
  { g: "Colours", label: "", modes: "s", legend: () => $("simLegend").innerHTML + (SIM.color === "plane" ? $("simPlaneLegend").innerHTML : "") },
  { g: "Colours", label: "theme", modes: "mpsf", get: () => SET.theme, set: v => viaCtl("#stTheme", v), opts: () => $("stTheme").innerHTML },
  { g: "Labels and guides", label: "labels in the 3D view", modes: "mpsf", get: () => SET.labels, set: v => viaCtl("#stLabels", v), opts: () => $("stLabels").innerHTML },
  { g: "Labels and guides", label: "axis gizmo", modes: "mpsf", get: () => SET.gizmo !== false, set: v => { SET.gizmo = !!v; saveSet(); dirty = true; } },
  { g: "Labels and guides", label: "scale bar", modes: "psf", get: () => SET.scaleBar !== false, set: v => { SET.scaleBar = !!v; saveSet(); dirty = true; } },
  { g: "Mask editor", label: "crystal compass ({111} traces)", modes: "ps", get: () => S.compass !== false, set: v => viaCtl(".cCompass", v) },
  { g: "Mask editor", label: "coordinates and cursor position", modes: "psf", get: () => SET.coords !== false, set: v => viaCtl("#stCoords", v) },
];
function showModeKey() { return S.mode === "model" ? "m" : S.mode === "pit" ? "p" : S.mode === "find" ? "f" : "s"; }
function renderShowTab() {
  const body = $("showBody"); if (!body) return;
  const mk = showModeKey(); let html = "", g = "";
  SHOW_ITEMS.forEach((it, i) => {
    if (!it.modes.includes(mk)) return;
    if (it.g !== g) { html += `${g ? "</div>" : ""}<div class="shG"><div class="shH">${it.g}</div>`; g = it.g; }
    html += it.legend ? `<div class="legend shLeg" data-shl="${i}"></div>` : it.opts
      ? `<label class="shSel"><span>${it.label}</span><select data-sh="${i}">${it.opts()}</select></label>`
      : `<label class="shChk"><input type="checkbox" data-sh="${i}"> <span>${it.label}</span></label>`;
  });
  body.innerHTML = html + (g ? "</div>" : "");
  SHOW.key = mk; syncShowTab();
}
function syncShowTab() {
  if (!SHOW.open) return;
  for (const el of document.querySelectorAll("#showBody [data-shl]")) el.innerHTML = SHOW_ITEMS[Number(el.getAttribute("data-shl"))].legend();
  for (const el of document.querySelectorAll("#showBody [data-sh]")) {
    const it = SHOW_ITEMS[Number(el.getAttribute("data-sh"))], v = it.get();
    if ((el as HTMLInputElement).type === "checkbox") (el as HTMLInputElement).checked = !!v; else (el as HTMLSelectElement).value = v;
  }
}
function setShowTab(on: boolean) {
  SHOW.open = on; $("showPanel").classList.toggle("hidden", !on); $("showTab").setAttribute("aria-expanded", String(on));
  if (on) renderShowTab();
}
(() => {
  const tab = document.createElement("button"); tab.type = "button"; tab.id = "showTab"; tab.className = "showTab";
  tab.setAttribute("aria-expanded", "false"); tab.setAttribute("aria-controls", "showPanel");
  tab.title = "Show or hide layers, arrows, colours and guides in the 3D view (key V)";
  tab.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="currentColor"/></svg><span>Show</span>`;
  const pan = document.createElement("div"); pan.id = "showPanel"; pan.className = "showPanel hidden"; pan.setAttribute("role", "region"); pan.setAttribute("aria-label", "What the 3D view shows");
  pan.innerHTML = `<div class="shTop"><b>Show in this scene</b><button type="button" class="linkbtn" data-sh-close title="Close (V or Esc)">✕</button></div><div id="showBody"></div>`;
  stage.append(tab, pan);
  tab.addEventListener("click", () => setShowTab(!SHOW.open));
  pan.addEventListener("click", e => { if ((e.target as Element).closest("[data-sh-close]")) setShowTab(false); });
  pan.addEventListener("change", e => {
    const el = e.target as HTMLInputElement, k = el.getAttribute("data-sh"); if (k === null) return;
    e.stopPropagation();   // the tab's own controls are not page state
    SHOW_ITEMS[Number(k)].set(el.type === "checkbox" ? el.checked : el.value); syncShowTab();
  });
  // keep the tab in step with changes made in the panel or in Settings
  document.addEventListener("change", () => requestAnimationFrame(syncShowTab));
  document.addEventListener("keydown", e => {
    const t = e.target as HTMLInputElement, tg = t.tagName;
    if (tg === "INPUT" && t.type !== "checkbox" || tg === "SELECT" || tg === "TEXTAREA" || tg === "CANVAS" || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "v" || e.key === "V") setShowTab(!SHOW.open);
    else if (e.key === "Escape" && SHOW.open && !document.querySelector("dialog[open]") && !ST3.meas) setShowTab(false);
  });
})();
