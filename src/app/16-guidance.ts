// =====================================================================================================
// guidance: one tip per scene (hidden once dismissed), help dialog, run button on the stage
var GUIDE = {
  model: "<b>Start here.</b> Pick a wafer in the bar above, then drag the model to turn it. Click a face to see its plane and its angle to the wafer. The panel on the right says how to hold the paper model.",
  pit: "<b>Etched pit.</b> Follow the numbered steps on the right: edit the openings in the mask editor, pick an etchant and move the time slider. Hover a wall to name its plane.",
  sim: "<b>Etch simulator.</b> Follow the numbered steps on the right: pick an example, change or draw the mask, set the process and press <b>Run</b>. Then scrub the time slider to replay the etch.",
  corner: "<b>Corner lab.</b> Pick a compensation pattern and press <b>Build and run</b>. The left mesa has no compensation; the right one has your pattern.",
  find: "<b>Find orientation.</b> Follow the numbered steps on the right: set a flat error, etch the alignment marks, then read δ from the pattern and see how much the correction helps.",
};
var tipsHidden = [];
try { tipsHidden = JSON.parse(localStorage.getItem("o3d-tips-hidden") || "[]"); if (!Array.isArray(tipsHidden)) tipsHidden = []; } catch (e) {}
function uiSync() {   // called by rebuild()
  const g = document.getElementById("guide"); if (!g) return;
  const m = S.mode, show = !!GUIDE[m] && !tipsHidden.includes(m);
  g.classList.toggle("hidden", !show); if (show) document.getElementById("guideTxt").innerHTML = GUIDE[m];
  stageRunSync();
}
function stageRunSync() { const b = document.getElementById("stageRun"); if (b) b.classList.toggle("hidden", !(simLike() && SIM.dirty)); }
$("guideX").addEventListener("click", () => {
  if (!tipsHidden.includes(S.mode)) tipsHidden.push(S.mode);
  try { localStorage.setItem("o3d-tips-hidden", JSON.stringify(tipsHidden)); } catch (e) {}
  uiSync();
});
function tipsAgain() { tipsHidden = []; try { localStorage.removeItem("o3d-tips-hidden"); } catch (e) {} uiSync(); }
$("stTips").addEventListener("click", tipsAgain); $("hpTips").addEventListener("click", tipsAgain);
$("stageRun").addEventListener("click", () => { $("bSimRun").click(); stageRunSync(); });
$("bHelp").addEventListener("click", () => $("dlgHelp").showModal());
document.addEventListener("keydown", e => {
  if (e.key !== "?" || e.ctrlKey || e.metaKey || e.altKey) return;
  const tg = e.target.tagName; if (tg === "INPUT" || tg === "SELECT" || tg === "TEXTAREA" || document.querySelector("dialog[open]")) return;
  e.preventDefault(); $("dlgHelp").showModal();
});
uiSync();


