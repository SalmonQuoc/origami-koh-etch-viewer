// =====================================================================================================
// custom etchants: a listed etchant at another temperature or KOH concentration, or the user's own rates
const KB_EV = 8.617333262e-5;   // Boltzmann constant, eV/K (standard constant, not in the course files)
const TBASE = ETCH.TBASE;
const PALC = ETCH.PALC;
const ORDER12 = ["100", "110", "111", "210", "211", "221", "310", "311", "320", "331", "530", "540"];
const BUILTIN = new Set(Object.keys(SRATES));
const CUSTOM = [];
try { const a = JSON.parse(localStorage.getItem("o3d-etchants") || "[]"); if (Array.isArray(a)) CUSTOM.push(...a.filter(c => c && c.key && c.name)); } catch (e) {}
const saveCustom = () => { try { localStorage.setItem("o3d-etchants", JSON.stringify(CUSTOM)); } catch (e) {} };
function ceCompute(ce) {   // -> { r: µm/min by plane key, sio2: µm/min or null, src, ok, msg }
  const out = { r: {}, sio2: null, src: "", ok: true, msg: "" };
  if (ce.mode === "own") {
    for (const k of ORDER12) { const v = Number(ce.own && ce.own[k]); if (ce.own && ce.own[k] !== "" && ce.own[k] != null && isFinite(v) && v >= 0) out.r[k] = v/60; }
    if (!(out.r["100"] > 0 && out.r["110"] > 0 && out.r["111"] >= 0) || out.r["111"] == null) { out.ok = false; out.msg = "Enter the {100}, {110} and {111} rates."; }
    const n = Object.keys(out.r).length;
    out.src = `User rates (µm/h): ${ORDER12.filter(k => out.r[k] != null).map(k => `{${k}} ${+(out.r[k]*60).toPrecision(4)}`).join(", ")}. ${n <= 3 ? "Other planes: linear interpolation between {100}, {110} and {111} over the orientation triangle, as the engine does for the listed sets (assumption)." : "Other planes: interpolated between the given ones (assumption)."}`;
  } else {
    const b = SRATES[ce.base]; if (!b) { out.ok = false; out.msg = "Pick a listed etchant."; return out; }
    const Tb = TBASE[ce.base], T = isFinite(ce.T) ? ce.T : Tb, f = isFinite(ce.factor) ? ce.factor : 1;
    let r0 = b.r, cTxt = "";
    if (PALC[ce.base] != null && isFinite(ce.conc) && ce.conc !== PALC[ce.base]) {
      const c = Math.max(30, Math.min(50, ce.conc)), lo = c <= 40 ? 30 : 40, hi = lo + 10, u = (c - lo)/10; r0 = {};
      for (const k of Object.keys(PAL[lo])) r0[k] = PAL[lo][k]*(1 - u) + PAL[hi][k]*u;
      cTxt = ` at ${c} wt% (linear between the ${lo} and ${hi} wt% columns of Pal & Sato Table 4.1, p. 87; assumption)`;
    }
    const Q = k => k === "110" ? ce.Q110 : k === "111" ? ce.Q111 : ce.Q100;
    for (const k of Object.keys(r0)) out.r[k] = r0[k]*Math.exp(-Q(k)/KB_EV*(1/(T + 273.15) - 1/(Tb + 273.15)))*f;
    out.src = `${b.name}${cTxt}, moved from ${Tb} °C to ${T} °C with R = R₀ exp(−Q/kT): Q(100) ${ce.Q100} eV, Q(110) ${ce.Q110} eV, Q(111) ${ce.Q111} eV (Pal & Sato p. 90 gives Q(100) ≈ 0.60 eV for 40 % KOH; the other values and their use for this etchant are assumptions); other planes use Q(100) (assumption)${f !== 1 ? `; extra factor × ${f}` : ""}. Base: ${b.src}`;
    if (T === Tb && !cTxt && f === 1 && b.sio2) out.sio2 = b.sio2;
  }
  if (isFinite(ce.ox) && ce.ox !== null && ce.ox !== "" && Number(ce.ox) >= 0) out.sio2 = Number(ce.ox)/60;
  if (out.ok && !(out.r["100"] > 0)) { out.ok = false; out.msg = "The {100} rate must be above zero."; }
  return out;
}
function registerCustom() {
  for (const k of Object.keys(SRATES)) if (!BUILTIN.has(k)) delete SRATES[k];
  for (const k of Object.keys(RATES)) if (k.startsWith("CU")) { delete RATES[k]; delete PIT2SIM[k]; }
  for (const ce of CUSTOM) {
    const c = ceCompute(ce); if (!c.ok) continue;
    SRATES[ce.key] = { name: `★ ${ce.name}`, r: c.r, src: c.src, sio2: c.sio2, sio2src: c.sio2 != null ? (ce.ox != null && ce.ox !== "" ? "user value" : "from the listed etchant") : undefined, custom: true };
    RATES[ce.key] = { name: `★ ${ce.name}`, r: { "100": c.r["100"], "110": c.r["110"], "111": c.r["111"] } }; PIT2SIM[ce.key] = ce.key;
  }
  if (!RATES[S.rate]) S.rate = "PAL30";
  if (!SRATES[SIM.rate]) SIM.rate = "PAL30";
  if (!SRATES[CL.rate]) CL.rate = "PAL30";
  if (!RATES[FD.rate]) FD.rate = "PAL30";
  // names of custom etchants can come from imported files: escape them, never insert them as HTML
  const fill = (id, T, val) => { const el = $(id); el.innerHTML = Object.entries(T).map(([k, v]) => `<option value="${escHTML(k)}">${escHTML((v as { name: string }).name)}</option>`).join(""); el.value = val; };
  fill("selRate", RATES, S.rate); fill("fdRate", RATES, FD.rate); fill("simRate", SRATES, SIM.rate); fill("clRate", SRATES, CL.rate);
  $("simRateSrc").textContent = SRATES[SIM.rate].src;
}
let ceCur = null, ceFrom = "sim";
function ceDefault() { return { key: "", name: "", mode: "base", base: "PAL30", T: 70, conc: 30, Q100: 0.6, Q110: 0.6, Q111: 0.6, factor: 1, own: {}, ox: null }; }
function ceFill() {   // the dialog from ceCur
  $("ceList").innerHTML = `<option value="">new etchant</option>` + CUSTOM.map(c => `<option value="${escHTML(c.key)}">${escHTML(c.name)}</option>`).join("");
  $("ceList").value = ceCur.key || "";
  $("ceBase").innerHTML = [...BUILTIN].map(k => `<option value="${k}">${SRATES[k].name}</option>`).join("");
  $("ceName").value = ceCur.name; $("ceMode").value = ceCur.mode; $("ceBase").value = ceCur.base;
  $("ceT").value = ceCur.T; $("ceConc").value = ceCur.conc ?? ""; $("ceQ100").value = ceCur.Q100; $("ceQ110").value = ceCur.Q110; $("ceQ111").value = ceCur.Q111; $("ceF").value = ceCur.factor;
  $("ceOx").value = ceCur.ox ?? "";
  $("ceOwn").innerHTML = ORDER12.map(k => `<label>{${k}}${["100", "110", "111"].includes(k) ? " *" : ""} <input type="number" min="0" step="0.01" data-ce="${k}" value="${ceCur.own[k] ?? ""}" placeholder="${["100", "110", "111"].includes(k) ? "needed" : "optional"}"></label>`).join("");
  $("ceDel").disabled = !ceCur.key; cePreview();
}
function ceRead() {
  const num = id => { const v = $(id).value; return v === "" ? null : Number(v); };
  Object.assign(ceCur, { name: $("ceName").value.trim(), mode: $("ceMode").value, base: $("ceBase").value, T: num("ceT"), conc: num("ceConc"), Q100: num("ceQ100") ?? 0.6, Q110: num("ceQ110") ?? 0.6, Q111: num("ceQ111") ?? 0.6, factor: num("ceF") ?? 1, ox: num("ceOx") });
  ceCur.own = {}; for (const el of $("ceOwn").querySelectorAll("[data-ce]")) if (el.value !== "") ceCur.own[el.dataset.ce] = Number(el.value);
}
function cePreview() {
  $("ceBaseBox").classList.toggle("hidden", ceCur.mode !== "base"); $("ceOwnBox").classList.toggle("hidden", ceCur.mode !== "own");
  $("ceConcRow").classList.toggle("hidden", PALC[ceCur.base] == null);
  const c = ceCompute(ceCur), r = c.r, h = k => r[k] != null ? (r[k]*60).toPrecision(3) : "–";
  $("cePrev").innerHTML = `<tr><td>plane</td><td>µm/h</td><td>µm/min</td></tr>` + ["100", "110", "111"].map(k => `<tr><td>{${k}}</td><td>${h(k)}</td><td>${r[k] != null ? r[k].toPrecision(3) : "–"}</td></tr>`).join("")
    + (r["100"] > 0 && r["111"] > 0 ? `<tr><td>R(100)/R(111)</td><td colspan="2">${(r["100"]/r["111"]).toFixed(0)}</td></tr>` : "")
    + (r["100"] > 0 ? `<tr><td>time for 100 µm on (100)</td><td colspan="2">${(100/r["100"]).toFixed(0)} min</td></tr>` : "")
    + `<tr><td>SiO₂ mask</td><td colspan="2">${c.sio2 != null ? (c.sio2*60).toPrecision(3) + " µm/h" : "not set"}</td></tr>`;
  $("ceSrc").textContent = c.ok ? c.src : ""; $("ceWarn").textContent = c.msg; $("ceWarn").classList.toggle("hidden", c.ok);
  $("ceSave").disabled = !c.ok;
}
function ceOpen(from) {
  ceFrom = from;
  const cur = from === "pit" ? S.rate : from === "corner" ? CL.rate : SIM.rate;
  const ex = CUSTOM.find(c => c.key === cur);
  ceCur = ex ? JSON.parse(JSON.stringify(ex)) : Object.assign(ceDefault(), BUILTIN.has(from === "pit" ? PIT2SIM[cur] || "PAL30" : cur) ? { base: from === "pit" ? PIT2SIM[cur] || "PAL30" : cur } : {});
  if (!ex) { ceCur.T = TBASE[ceCur.base]; ceCur.conc = PALC[ceCur.base] ?? null; }
  ceFill(); $("dlgEtch").showModal();
}
for (const b of document.querySelectorAll("[data-etch-open]")) b.addEventListener("click", () => ceOpen(b.dataset.etchOpen));
$("dlgEtch").addEventListener("input", () => { ceRead(); cePreview(); });
$("ceBase").addEventListener("change", () => { ceRead(); ceCur.T = TBASE[ceCur.base]; ceCur.conc = PALC[ceCur.base] ?? null; $("ceT").value = ceCur.T; $("ceConc").value = ceCur.conc ?? ""; cePreview(); });
$("ceList").addEventListener("change", e => { const ex = CUSTOM.find(c => c.key === e.target.value); ceCur = ex ? JSON.parse(JSON.stringify(ex)) : ceDefault(); ceFill(); });
$("ceNew").addEventListener("click", () => { ceCur = ceDefault(); ceFill(); });
$("ceSave").addEventListener("click", () => {
  ceRead(); const c = ceCompute(ceCur); if (!c.ok) return;
  if (!ceCur.name) {
    let nm = SRATES[ceCur.base].name.replace(/\d+(\.\d+)? °C/, `${ceCur.T} °C`);
    if (PALC[ceCur.base] != null && ceCur.conc) nm = nm.replace(/\d+(\.\d+)? wt%/, `${ceCur.conc} wt%`);
    ceCur.name = ceCur.mode === "own" ? "My etchant" : nm + (ceCur.factor !== 1 ? ` × ${ceCur.factor}` : "");
  }
  if (!ceCur.key) { let n = 1; while (CUSTOM.some(x => x.key === `CU${n}`)) n++; ceCur.key = `CU${n}`; CUSTOM.push(JSON.parse(JSON.stringify(ceCur))); }
  else CUSTOM[CUSTOM.findIndex(x => x.key === ceCur.key)] = JSON.parse(JSON.stringify(ceCur));
  saveCustom(); registerCustom();
  const k = ceCur.key;
  if (ceFrom === "pit") { S.rate = k; $("selRate").value = k; prepPit(); rebuild(false); }
  else if (ceFrom === "corner") { CL.rate = k; $("clRate").value = k; }
  else { SIM.rate = k; $("simRate").value = k; $("simRateSrc").textContent = SRATES[k].src; markDirty(); }
  $("dlgEtch").close();
});
$("ceDel").addEventListener("click", () => {
  const i = CUSTOM.findIndex(x => x.key === ceCur.key); if (i < 0) return;
  CUSTOM.splice(i, 1); saveCustom(); registerCustom(); prepPit(); if (S.mode === "pit") rebuild(false); ceCur = ceDefault(); ceFill();
});
// saving a file: inside the claude.ai artifact viewer through its downloads capability, elsewhere (GitHub Pages, a local copy) as a normal download
async function saveFile(name, text) {
  if (window.claude && typeof window.claude.use === "function") {
    let ns = null; try { ns = await window.claude.use("downloads"); } catch (e) {}
    if (!ns) return "This viewer cannot save files; open the GitHub page to export.";
    try { await ns.save({ filename: name, data: text }); return ""; } catch (e) { return e && e.code === "declined" ? "Export cancelled." : "The file could not be saved here."; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "application/json" })); a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000); return "";
}
$("ceExport").addEventListener("click", async () => {
  if (!CUSTOM.length) { $("ceWarn").textContent = "There are no saved etchants to export yet."; $("ceWarn").classList.remove("hidden"); return; }
  const m = await saveFile("custom-etchants.json", JSON.stringify({ format: "origami-etchants", version: 1, etchants: CUSTOM }, null, 2));
  $("ceWarn").textContent = m; $("ceWarn").classList.toggle("hidden", !m);
});
$("ceImport").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text()), list = Array.isArray(j) ? j : j.etchants;
    let n = 0;
    for (const c of list || []) {
      if (!c || !c.name || !["base", "own"].includes(c.mode)) continue;
      const ce = Object.assign(ceDefault(), c); let k = 1; while (CUSTOM.some(x => x.key === `CU${k}`)) k++; ce.key = `CU${k}`;
      if (ceCompute(ce).ok) { CUSTOM.push(ce); n++; }
    }
    saveCustom(); registerCustom(); ceCur = ceDefault(); ceFill(); $("ceWarn").textContent = `Imported ${n} etchant${n === 1 ? "" : "s"}.`; $("ceWarn").classList.remove("hidden");
  } catch (err) { $("ceWarn").textContent = "This file could not be read as an etchant list."; $("ceWarn").classList.remove("hidden"); }
  e.target.value = "";
});


