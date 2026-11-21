// =====================================================================================================
// enlarge an editor or a graph panel into a large window over the page (Esc or the button closes it)
let enlOpen = null;
function redrawAll() { redrawPanes(); if (S.mode === "pit") drawPitEditor(true); if (simLike()) drawMaskEditor(); if (S.mode === "find") drawFindMap(); }
function enlarge(el, on) {
  if (on && enlOpen && enlOpen.el !== el) enlarge(enlOpen.el, false);
  if (on) {
    const ph = document.createComment("enlarged"); el.parentNode.insertBefore(ph, el);
    const back = document.createElement("div"); back.id = "enlBack"; back.addEventListener("click", () => enlarge(el, false));
    document.body.append(back, el); el.classList.add("enlarged"); document.body.classList.add("enl-open");
    enlOpen = { el, ph, back };
  } else if (enlOpen && enlOpen.el === el) {
    enlOpen.ph.replaceWith(el); enlOpen.back.remove(); el.classList.remove("enlarged"); document.body.classList.remove("enl-open"); enlOpen = null;
  }
  const b = el.querySelector(":scope > .enlBtn"); if (b) { b.textContent = on ? "✕ Close" : "⤢ Enlarge"; b.title = on ? "Back to the page (Esc)" : "Open in a large window"; }
  requestAnimationFrame(redrawAll);
}
for (const el of document.querySelectorAll(".enl")) {
  const b = document.createElement("button"); b.className = "btn enlBtn"; b.type = "button"; b.textContent = "⤢ Enlarge"; b.title = "Open in a large window";
  b.addEventListener("click", () => enlarge(el, !el.classList.contains("enlarged"))); el.prepend(b);
}
document.addEventListener("keydown", ev => { if (ev.key === "Escape" && enlOpen && !DRAW.on && !document.querySelector("dialog[open]")) enlarge(enlOpen.el, false); });
window.addEventListener("resize", () => { if (enlOpen) requestAnimationFrame(redrawAll); });

// =====================================================================================================
// settings and layouts
function applyLayout() {
  const L = SET.layout, b = document.body.classList, root = document.documentElement.style;
  layoutBusy = true;
  b.toggle("stacked", L === "stacked"); b.toggle("swap", L === "split-left");
  setSplit(L === "split" || L === "split-left"); setTheater(L === "theater");
  layoutBusy = false;
  root.setProperty("--panelW", `${SET.panelW}px`);
  if (Number(SET.stageH) === SET_DEF.stageH) root.removeProperty("--stageHt"); else root.setProperty("--stageHt", `${SET.stageH}vh`);
  requestAnimationFrame(redrawPanes);
}
function applyLook() {
  const root = document.documentElement;
  if (SET.theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", SET.theme);
  document.body.classList.toggle("lbl-off", SET.labels === "off");
  root.style.setProperty("--lblFs", { small: "10.5px", normal: "12px", large: "14px", off: "12px" }[SET.labels] || "12px");
  renderer.setPixelRatio(SET.pixel === "fast" ? 1 : Math.min(2, window.devicePixelRatio || 1)); resize();
}
function syncSettingsUI() {
  $("stLayout").value = SET.layout; $("stPanelW").value = SET.panelW; $("stPanelWv").textContent = `${SET.panelW} px`;
  $("stStageH").value = SET.stageH; $("stStageHv").textContent = `${SET.stageH} %`;
  $("stTheme").value = SET.theme; $("stLabels").value = SET.labels; $("stAnim").value = SET.anim ? "1" : "0"; $("stPixel").value = SET.pixel;
  $("stSnap").value = String(SET.snap); $("stQual").value = SET.quality; $("stAuto").checked = !!SET.autoRun; $("stEngine").value = SET.engine || "auto"; $("stCoords").checked = SET.coords !== false;
}
let autoT = 0;
function autoRunMaybe() {
  if (!SET.autoRun || !simLike()) return;
  clearTimeout(autoT); autoT = setTimeout(() => { if (simLike()) { simRun(); buildSim(false); } }, 700);
}
$("bSettings").addEventListener("click", () => { syncSettingsUI(); $("dlgSet").showModal(); });
for (const d of document.querySelectorAll("dialog.dlg")) {
  d.addEventListener("click", ev => { if (ev.target.closest("[data-close]") || ev.target === d) d.close(); });
}
$("dlgSet").addEventListener("input", ev => {
  const t = ev.target;
  if (t.id === "stPanelW") { SET.panelW = Number(t.value); $("stPanelWv").textContent = `${SET.panelW} px`; applyLayout(); }
  else if (t.id === "stStageH") { SET.stageH = Number(t.value); $("stStageHv").textContent = `${SET.stageH} %`; applyLayout(); }
  saveSet();
});
$("dlgSet").addEventListener("change", ev => {
  const t = ev.target;
  if (t.id === "stLayout") { SET.layout = t.value; applyLayout(); if (SET.layout.startsWith("split")) requestAnimationFrame(splitScroll); }
  else if (t.id === "stTheme") { SET.theme = t.value; applyLook(); }
  else if (t.id === "stLabels") { SET.labels = t.value; applyLook(); dirty = true; }
  else if (t.id === "stAnim") SET.anim = t.value === "1";
  else if (t.id === "stPixel") { SET.pixel = t.value; applyLook(); }
  else if (t.id === "stSnap") SET.snap = Number(t.value);
  else if (t.id === "stCoords") { SET.coords = t.checked; redrawEditors(); }
  else if (t.id === "stQual") { SET.quality = t.value; SIM.quality = t.value; syncSimInputs(); }
  else if (t.id === "stAuto") SET.autoRun = t.checked;
  else if (t.id === "stEngine") { SET.engine = t.value; if (simLike()) markDirty(); }
  saveSet();
});
$("stReset").addEventListener("click", () => {
  Object.assign(SET, SET_DEF); saveSet(); SIM.quality = SET.quality; syncSimInputs();
  try { localStorage.removeItem("o3d-splitW"); } catch (e) {} document.documentElement.style.removeProperty("--splitW");
  applyLayout(); applyLook(); syncSettingsUI();
});
$("stClearEtch").addEventListener("click", () => { CUSTOM.length = 0; saveCustom(); registerCustom(); ceCur = ceDefault(); ceFill(); prepPit(); rebuild(false); });

