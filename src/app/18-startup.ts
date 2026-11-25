// start-up of the settings, layout and custom etchants
SIM.quality = SET.quality;
registerCustom(); syncSimInputs(); applyLook(); applyLayout();

// theme changes: re-read colours and rebuild
function onTheme() { readColors(); rebuild(false); }
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", onTheme);
new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

function loop(now) {
  stepAnim(now); stepPlay(now); stepSimPlay(now);
  if (dirty) { renderer.render(scene, camera); placeLabels(); stageOverlay(); dirty = false; }
  requestAnimationFrame(loop);
}
readColors(); setHold(); fillOpenings(); fillPcTypes(); renderCustomList(); $("selRate").value = S.rate;
prepPit(); $("tNow").textContent = `${sliderToT().toFixed(0)} min`;
rebuild(true);
requestAnimationFrame(loop);
window.__o3d = { get simScene() { return simScene; }, COL, EDC, EDZ, EDM, get ST3() { return ST3; }, S, camera, controls, C, get pit() { return pit; }, get model() { return model; }, setView, dirOf, VIEWS, selectFace, setWafer, SIM, EE, SPRESETS, loadPreset, simRun, buildSim, simConfig, classifyN, vTraces,
  FD, fdAnalyse, fdMonteCarlo, estFan, estArc, fdEtch, waferOutline, inPlaneDirs, CL, clBuild, RATES, SRATES, simE, beyondAll, shapePieces, shp, rebuild, findChanged, SET, CUSTOM, get DRAW() { return DRAW; }, get MD() { return MD; }, mdCommand, mdDo, mdOpen, svProject, svApply, maskDXF, maskSVG, mdParseDXF, mdParseSVG };
