// End-to-end checks of the built page (index.html) in Chromium. Run: npm run test:browser
// (needs the playwright package and its Chromium; in CI: npx playwright install --with-deps chromium)
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch (e) {}
const PAGE = "file://" + fileURLToPath(new URL("../../index.html", import.meta.url));
const skip = !chromium && "playwright is not installed";

test("page: scenes, simulator kernel, drawing, mask designer, save and export, settings, custom etchant, presets, phone width", { skip, timeout: 240000 }, async t => {
  const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
  const p = await browser.newPage({ viewport: { width: 1300, height: 950 } });
  const errors = []; p.on("pageerror", e => errors.push(String(e))); p.on("console", m => { if (m.type() === "error" && !/fonts\.googleapis/.test(m.text())) errors.push(m.text()); });
  await p.goto(PAGE); await p.waitForTimeout(1200);
  const ev = f => p.evaluate(f);

  await t.test("explanations are off at first and the toolbar switch shows them", async () => {
    assert.equal(await ev(() => document.body.classList.contains("explain")), false);
    assert.ok(await ev(() => [...document.querySelectorAll(".note.src, .xinfo")].every(e => getComputedStyle(e).display === "none")));
    assert.ok(await ev(() => [...document.querySelectorAll("details")].every(d => !d.open)));
    await p.click("#bExplain");
    assert.ok(await ev(() => document.body.classList.contains("explain") && getComputedStyle(document.querySelector(".note.src")).display !== "none"));
    await p.click("#bExplain");
    assert.equal(await ev(() => document.body.classList.contains("explain")), false);
  });

  await t.test("every scene opens on every wafer", async () => {
    for (const w of ["100", "110", "111"]) {
      await p.click(`#segW button[data-w="${w}"]`);
      for (const m of ["model", "pit", "corner", "find", "sim"]) { await p.click(`#segM button[data-m="${m}"]`); await p.waitForTimeout(300); }
    }
    await p.click('#segW button[data-w="100"]');
  });

  await t.test("sections: only the first section of each panel is open at first, headings toggle", async () => {
    const open = await ev(() => [...document.querySelectorAll(".foldH")].filter(h => !h.classList.contains("closed")).map(h => h.textContent.trim()));
    assert.deepEqual(open, ["Cross-section", "Microscope view of the selected item", "Cross-section", "Selected face", "1Mask openings", "Corner result", "1Pick an example", "1Flat error"]);
    assert.ok(await ev(() => [...document.querySelectorAll(".foldH.closed + .foldBody")].every(b => getComputedStyle(b).display === "none")));
    await p.click('#segM button[data-m="sim"]');
    const h = p.locator("#panelSim .foldH", { hasText: "Edit or draw the mask" });
    await h.click(); assert.equal(await h.getAttribute("aria-expanded"), "true");
    assert.ok(await ev(() => document.getElementById("maskCanvas").clientWidth > 0));
    await h.press("Enter"); assert.equal(await h.getAttribute("aria-expanded"), "false");
    for (const m of ["model", "pit", "find", "sim"]) {   // the later checks use controls in every section
      await p.click(`#segM button[data-m="${m}"]`);
      await p.click(`aside.panel:not(.hidden) .foldAll [data-fold="1"]`);
    }
    await ev(() => { for (const h of document.querySelectorAll("#simBelow .foldH.closed, #findBelow .foldH.closed, #pitBelow .foldH.closed")) h.click(); });
    assert.equal(await ev(() => document.querySelectorAll(".foldH.closed").length), 0);
  });

  await t.test("zoom in the wafer map of Find orientation", async () => {
    await p.click('#segM button[data-m="find"]');
    await p.click('.zoomBar[data-for="fdCanvas"] [data-z="in"]'); await p.click('.zoomBar[data-for="fdCanvas"] [data-z="in"]');
    assert.ok(await ev(() => window.__o3d.EDZ.fdCanvas.z > 1));
    await p.click('.zoomBar[data-for="fdCanvas"] [data-z="fit"]');
    assert.equal(await ev(() => window.__o3d.EDZ.fdCanvas.z), 1);
  });

  await t.test("simulator runs with the Rust/WebAssembly kernel", async () => {
    await p.click('#segM button[data-m="sim"]');
    await p.selectOption("#simQual", "draft"); await p.dispatchEvent("#simQual", "change");
    await p.click("#bSimRun"); await p.waitForTimeout(200);
    await p.waitForFunction(() => !window.__o3d.SIM.running, null, { timeout: 90000 });
    assert.match(await p.textContent("#simStatus"), /Rust\/WebAssembly kernel/);
  });

  await t.test("drawing an outline adds a shape", async () => {
    const n0 = await ev(() => window.__o3d.SIM.shapes.length);
    await p.locator("#maskCanvas").scrollIntoViewIfNeeded(); await p.click("#bDraw");
    const bb = await p.locator("#maskCanvas").boundingBox(), cx = bb.x + bb.width/2, cy = bb.y + bb.height/2;
    for (const [dx, dy] of [[-40, -40], [40, -40], [0, 40]]) await p.mouse.click(cx + dx, cy + dy);
    await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    assert.equal(await ev(() => window.__o3d.SIM.shapes.length), n0 + 1);
  });

  await t.test("coordinates: cursor position and dragging the section line", async () => {
    const m = p.locator("#maskCanvas"); await m.scrollIntoViewIfNeeded();
    const bb = await m.boundingBox(), ed = await ev(() => window.__o3d.SIM.ed);
    await p.mouse.move(bb.x + ed.ox + 50*ed.s, bb.y + ed.oy - 30*ed.s); await p.waitForTimeout(100);
    const c = await ev(() => window.__o3d.EDC.maskCanvas);
    assert.ok(Math.abs(c[0] - 50) < 1 && Math.abs(c[1] - 30) < 1, JSON.stringify(c));
    // the section line A -> B: drag B, drag the line, type A, draw a new line
    await ev(() => { window.__o3d.SIM.cutLine = { a: [-50, 0], b: [50, 0] }; window.__o3d.SIM.cutOn = true; });
    await p.fill('.secUI[data-for="maskCanvas"] [data-sl="bx"]', "50"); await p.dispatchEvent('.secUI[data-for="maskCanvas"] [data-sl="bx"]', "change");
    const drag = async (from, to) => {   // the inputs below the editor may have scrolled the page: measure again
      await m.scrollIntoViewIfNeeded(); const B = await m.boundingBox(), E = await ev(() => window.__o3d.SIM.ed), at = (wx, wy) => [B.x + E.ox + wx*E.s, B.y + E.oy - wy*E.s];
      const [x0, y0] = at(...from), [x1, y1] = at(...to); await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x1, y1, { steps: 6 }); await p.mouse.up(); await p.waitForTimeout(100); };
    const line = () => ev(() => window.__o3d.SIM.cutLine);
    await drag([50, 0], [50, 40]);
    assert.deepEqual(await line(), { a: [-50, 0], b: [50, 40] });
    await drag([0, 20], [0, 30]);
    assert.deepEqual(await line(), { a: [-50, 10], b: [50, 50] });
    assert.equal(await p.inputValue('.secUI[data-for="maskCanvas"] [data-sl="by"]'), "50");
    await p.fill('.secUI[data-for="maskCanvas"] [data-sl="ax"]', "-30"); await p.dispatchEvent('.secUI[data-for="maskCanvas"] [data-sl="ax"]', "change");
    assert.deepEqual((await line()).a, [-30, 10]);
    await p.click('.secUI[data-for="maskCanvas"] [data-sl="draw"]');
    await drag([-20, -20], [30, -20]);
    assert.deepEqual(await line(), { a: [-20, -20], b: [30, -20] });
    assert.equal(await p.getAttribute('.secUI[data-for="maskCanvas"] [data-sl="draw"]', "aria-pressed"), "false");
    await p.click('.secUI[data-for="maskCanvas"] [data-sl="x"]');
    const l2 = await line(); assert.equal(l2.a[1], 0); assert.equal(l2.b[1], 0);
    // the section plot follows the line (the worker samples along A -> B)
    await p.waitForFunction(() => { const s = window.__o3d.SIM.res && window.__o3d.SIM.res.sec; return s && s.line && Math.abs(s.len - Math.hypot(window.__o3d.SIM.cutLine.b[0] - window.__o3d.SIM.cutLine.a[0], 0)) < 1; }, null, { timeout: 20000 });
    // etched pit: the same line, its own cross-section, and the 3D cut along a slanted line
    await p.click('#segM button[data-m="pit"]'); await p.waitForTimeout(400);
    await p.fill('.secUI[data-for="pitCanvas"] [data-sl="ay"]', "-60"); await p.dispatchEvent('.secUI[data-for="pitCanvas"] [data-sl="ay"]', "change");
    assert.equal(await ev(() => window.__o3d.S.pitLine.a[1]), -60);
    assert.ok(await ev(() => document.getElementById("pitSecCanvas").height > 50));
    await ev(() => { const c = document.getElementById("cCut"); c.checked = true; c.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.equal(await ev(() => window.__o3d.S.cut), true);
    await ev(() => { const c = document.getElementById("cCut"); c.checked = false; c.dispatchEvent(new Event("change", { bubbles: true })); });
    await p.click('#segM button[data-m="sim"]'); await p.waitForTimeout(300);
  });
  await t.test("mask film at its true thickness: SiO₂ thins and is used up; toggles take the accent colour", async () => {
    await p.click('#segM button[data-m="pit"]');
    const k57 = await ev(() => [...document.querySelectorAll("#selRate option")].find(o => /57/.test(o.textContent)).value);
    await p.selectOption("#selRate", k57); await p.dispatchEvent("#selRate", "change");
    await p.fill("#tSlider", "1000"); await p.dispatchEvent("#tSlider", "input"); await p.waitForTimeout(300);
    const film = () => ev(() => [...document.querySelectorAll("#readout dt")].find(d => d.textContent === "mask film").nextElementSibling.textContent);
    assert.match(await film(), /used up after 97 min/);   // 1 µm at 0.62 µm/h (Lec 10 p. 11)
    await p.selectOption("#panelPit [data-mf=mat]", "si3n4"); await p.waitForTimeout(200);
    assert.match(await film(), /Si₃N₄ 0\.15 µm/);
    assert.equal(await p.inputValue("#panelSim [data-mf=t0]"), "0.15");
    await p.selectOption("#panelPit [data-mf=mat]", "sio2");
    await p.click("#bExplain"); await p.mouse.move(0, 0); await p.waitForTimeout(400);   // past the colour transition
    const bg = await ev(() => [getComputedStyle(document.getElementById("bExplain")).backgroundColor, getComputedStyle(document.getElementById("bHelp")).backgroundColor]);
    assert.notEqual(bg[0], bg[1]);
    await p.click("#bExplain");
    await p.click('#segM button[data-m="sim"]');
  });

  await t.test("3D tools (zoom out, gizmo, scale bar, measuring) and 2D zoom out and measuring", async () => {
    await p.click('#segM button[data-m="model"]'); await p.waitForTimeout(200);
    assert.equal(await ev(() => document.querySelector('#stageTools [data-s="measure"]').offsetParent === null && document.getElementById("scaleBar").classList.contains("hidden")), true);   // no ruler on the paper model
    await p.click('#segM button[data-m="pit"]'); await p.waitForTimeout(300); await ev(() => window.scrollTo(0, 0));
    const z0 = await ev(() => window.__o3d.camera.zoom);
    await p.click('#stageTools [data-s="out"]');
    assert.ok(await ev(() => window.__o3d.camera.zoom) < z0);
    await p.click('#stageTools [data-s="fit"]'); await p.waitForTimeout(700);
    assert.match(await p.textContent("#scaleBar"), /\d (µm|mm)/);
    assert.match(await p.textContent("#gizmo .gzLeg"), /x \[100\] y \[010\] z \[001\]/);
    assert.match(await p.textContent("#gizmo .gzLeg"), /flat along/);
    await p.click('#stageTools [data-s="measure"]');
    const sb = await p.locator("#stage").boundingBox();
    await p.mouse.click(sb.x + sb.width*0.45, sb.y + sb.height*0.55); await p.mouse.click(sb.x + sb.width*0.6, sb.y + sb.height*0.5); await p.waitForTimeout(200);
    assert.equal(await ev(() => window.__o3d.ST3.pts.length), 2);
    assert.match(await p.textContent("#measLab"), /Δz/);
    await p.keyboard.press("Escape"); assert.equal(await ev(() => window.__o3d.ST3.meas), false);
    await p.click('.zoomBar[data-for="pitCanvas"] [data-z="out"]');
    assert.equal(await ev(() => window.__o3d.EDZ.pitCanvas.z), 0.5);
    await p.click('.zoomBar[data-for="pitCanvas"] [data-z="fit"]');
    await p.click('.zoomBar[data-for="pitCanvas"] [data-z="measure"]');
    const cv = p.locator("#pitCanvas"); await cv.scrollIntoViewIfNeeded();
    const bb = await cv.boundingBox(), ed = await ev(() => window.__o3d.S.pitEd);
    await p.mouse.move(bb.x + ed.ox - 200*ed.s, bb.y + ed.oy + 100*ed.s); await p.mouse.down();
    await p.mouse.move(bb.x + ed.ox + 200*ed.s, bb.y + ed.oy - 100*ed.s, { steps: 4 }); await p.mouse.up();
    const m = await ev(() => window.__o3d.EDM.pitCanvas);
    assert.ok(Math.abs(Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1]) - Math.hypot(400, 200)) < 2, JSON.stringify(m));
    await p.click('.zoomBar[data-for="pitCanvas"] [data-z="measure"]');
    await p.click('#segM button[data-m="sim"]');
  });

  await t.test("flat arrows can be hidden (setting kept)", async () => {
    await p.click('#segM button[data-m="sim"]'); await p.waitForTimeout(600);
    const txt = () => ev(() => document.getElementById("labels").textContent);
    assert.match(await txt(), /along flat/); assert.match(await txt(), /⊥ flat, outward/);
    const set = (k, on) => p.evaluate(([k, on]) => { const c = document.querySelector(`#dlgSet [data-arr="${k}"]`); c.checked = on; c.dispatchEvent(new Event("change", { bubbles: true })); }, [k, on]);
    await set("arrAlong", false); await set("arrPerp", false); await p.waitForTimeout(300);
    assert.doesNotMatch(await txt(), /along flat|⊥ flat/);
    assert.deepEqual(await ev(() => { const s = JSON.parse(localStorage.getItem("o3d-settings")); return [s.arrAlong, s.arrPerp]; }), [false, false]);
    await set("arrAlong", true); await set("arrPerp", true); await p.waitForTimeout(300);
    assert.match(await txt(), /along flat/);
  });

  await t.test("Show tab lists the scene's visibility options and drives the panel controls", async () => {
    await p.click('#segM button[data-m="sim"]'); await p.waitForTimeout(400);
    await p.click("#showTab"); assert.equal(await ev(() => document.getElementById("showPanel").classList.contains("hidden")), false);
    const box = p.locator('#showBody label:has-text("mask layer") input');
    await box.uncheck(); await p.waitForTimeout(200);
    assert.equal(await ev(() => document.getElementById("cSimMask").checked), false);
    await box.check(); await p.locator('#showBody label:has-text("axis gizmo") input').uncheck(); await p.waitForTimeout(200);
    assert.equal(await ev(() => document.getElementById("gizmo").classList.contains("hidden")), true);
    await p.locator('#showBody label:has-text("axis gizmo") input').check();
    await p.click('#segM button[data-m="pit"]'); await p.waitForTimeout(300);
    assert.match(await p.textContent("#showBody"), /final \{111\} shape/);
    await p.click("#showTab"); await p.click('#segM button[data-m="sim"]');
  });

  await t.test("custom etchant at 80 °C is faster than the 70 °C table (Arrhenius)", async () => {
    await p.click('[data-etch-open="sim"]'); await p.selectOption("#ceBase", "PAL40");
    await p.fill("#ceT", "80"); await p.dispatchEvent("#ceT", "input"); await p.click("#ceSave");
    const r = await ev(() => { const { SIM, SRATES } = window.__o3d; return [SRATES[SIM.rate].r["100"], SRATES.PAL40.r["100"]]; });
    assert.ok(r[0] > r[1] && Math.abs(r[0]/r[1] - Math.exp(0.6/8.617333262e-5*(1/343.15 - 1/353.15))) < 1e-9, JSON.stringify(r));
  });

  await t.test("a preset can be saved and loaded", async () => {
    await p.fill('.psBox[data-ps="sim"] [data-ps-name]', "test preset"); await p.click('.psBox[data-ps="sim"] [data-ps-save]');
    assert.match(await p.inputValue("#simPreset"), /^u:/);
  });

  await t.test("settings dialog switches the layout", async () => {
    await p.click("#bSettings"); await p.selectOption("#stLayout", "theater"); await p.waitForTimeout(200);
    assert.ok(await ev(() => document.body.classList.contains("theater")));
    await p.selectOption("#stLayout", "standard"); await ev(() => document.getElementById("dlgSet").close());
  });

  await t.test("names in an imported etchant file are shown as text, not run as HTML", async () => {
    const evil = { format: "origami-etchants", version: 1, etchants: [{ name: '<img src=x onerror="window.__pwned=1">', mode: "base", base: "PAL30", T: 70, conc: 30, factor: 1 }] };
    await p.setInputFiles("#ceImport", { name: "evil.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(evil)) });
    await p.waitForTimeout(300);
    assert.equal(await ev(() => window.__pwned), undefined);
    assert.equal(await ev(() => document.querySelectorAll("#simRate img, #selRate img, #ceList img").length), 0);
    assert.ok(await ev(() => [...document.querySelectorAll("#simRate option")].some(o => o.textContent.includes("<img"))));
  });

  await t.test("the page declares a Content Security Policy and pins three.js by hash", async () => {
    const [csp, sri] = await ev(() => [document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || "", [...document.querySelectorAll("script[src]")].map(s => s.integrity)]);
    assert.match(csp, /connect-src 'none'/); assert.match(csp, /default-src 'none'/);
    assert.ok(sri.length >= 2 && sri.every(h => /^sha384-/.test(h)), JSON.stringify(sri));
  });

  await t.test("mask designer: full screen, typed rectangle and polygon, undo and redo, written back to the simulator", async () => {
    await p.click('#segM button[data-m="sim"]'); await p.waitForTimeout(400);
    await ev(() => document.getElementById("bDesign").click()); await p.waitForTimeout(300);
    assert.ok(await ev(() => !document.getElementById("mdRoot").classList.contains("hidden")));
    const n0 = await ev(() => window.__o3d.SIM.shapes.length);
    await p.locator("#mdCanvas").focus();
    await p.keyboard.press("r"); await p.keyboard.type("10,-60"); await p.keyboard.press("Enter"); await p.keyboard.type("@40,20"); await p.keyboard.press("Enter");
    const r = await ev(() => window.__o3d.SIM.shapes.at(-1));
    assert.equal(r.type, "rect"); assert.deepEqual([r.cx, r.cy, r.w, r.h], [30, -50, 40, 20]);
    await p.keyboard.press("p"); for (const q of ["0,0", "@60,0", "@30<90"]) { await p.keyboard.type(q); await p.keyboard.press("Enter"); }
    await p.keyboard.press("Enter");
    assert.equal(await ev(() => window.__o3d.SIM.shapes.length), n0 + 2);
    assert.equal(await ev(() => window.__o3d.SIM.shapes.at(-1).pts.length), 3);
    await p.keyboard.press("Control+z"); assert.equal(await ev(() => window.__o3d.SIM.shapes.length), n0 + 1);
    await p.keyboard.press("Control+Shift+z"); assert.equal(await ev(() => window.__o3d.SIM.shapes.length), n0 + 2);
    await p.click('#mdRoot [data-md="done"]'); await p.waitForTimeout(200);
    assert.ok(await ev(() => document.getElementById("mdRoot").classList.contains("hidden")));
  });

  await t.test("mask export: DXF and SVG read back to the same outlines", async () => {
    const [a, b] = await ev(() => { const o = window.__o3d, sh = o.SIM.shapes, d = o.mdParseDXF(o.maskDXF(sh, { domain: [o.SIM.hx, o.SIM.hy] })), v = o.mdParseSVG(o.maskSVG(sh, { domain: [o.SIM.hx, o.SIM.hy] }));
      return [d.loops.length, v.loops.length]; });
    const n = await ev(() => window.__o3d.SIM.shapes.length);
    assert.ok(a >= n && b === a, `${a} DXF and ${b} SVG loops for ${n} shapes`);
  });

  await t.test("project file: save the ticked parts and open them again", async () => {
    const proj = await ev(() => window.__o3d.svProject(["view", "sim", "settings"]));
    assert.equal(proj.format, "origami-project"); assert.deepEqual(Object.keys(proj.parts), ["view", "sim", "settings"]);
    const n = proj.parts.sim.shapes.length;
    await ev(() => { window.__o3d.SIM.shapes = []; });
    const done = await p.evaluate(p0 => window.__o3d.svApply(p0, ["sim"]), proj);
    assert.deepEqual(done, ["etch simulator"]); assert.equal(await ev(() => window.__o3d.SIM.shapes.length), n);
    await p.click("#bProject"); assert.ok(await ev(() => document.getElementById("dlgSave").open));
    assert.ok(await ev(() => document.querySelectorAll("#svParts input").length >= 8)); await ev(() => document.getElementById("dlgSave").close());
  });

  await t.test("my projects: quick save, new, duplicate, rename, open and delete", async () => {
    const n0 = await ev(() => window.__o3d.SIM.shapes.length);
    await p.click("#bSave"); assert.ok(await ev(() => !document.getElementById("dlgSave").open));   // first save makes "Project 1"
    const rows = () => ev(() => [...document.querySelectorAll("#pjList .pjRow b")].map(b => b.textContent));
    await p.click("#bProject"); assert.deepEqual(await rows(), ["Project 1"]);
    assert.match(await ev(() => document.getElementById("bProject").textContent), /Project 1/);
    await p.click("#pjDup"); assert.deepEqual((await rows()).sort(), ["Project 1", "Project 1 (copy)"]);
    await p.fill("#pjName", "Copy <b>x</b>"); await p.click("#pjRen");
    assert.ok((await rows()).includes("Copy <b>x</b>"));   // names are shown as text
    await p.fill("#pjName", "Empty"); await p.click("#pjNew");
    assert.ok((await rows()).includes("Empty")); assert.match(await ev(() => document.getElementById("bProject").textContent), /Empty/);
    await p.click('#pjList .pjRow:has-text("Project 1") input'); await p.click("#pjOpen");
    assert.equal(await ev(() => window.__o3d.SIM.shapes.length), n0);
    await p.click('#pjList .pjRow:has-text("Empty") input'); await p.click("#pjDel");
    assert.equal((await rows()).length, 3);   // the first click only asks
    await p.click("#pjDel"); assert.deepEqual((await rows()).sort(), ["Copy <b>x</b>", "Project 1"]);
    assert.equal(await ev(() => JSON.parse(localStorage.getItem("o3d-projects")).length), 2);
    await ev(() => { localStorage.removeItem("o3d-projects"); localStorage.removeItem("o3d-project-cur"); document.getElementById("dlgSave").close(); });
  });

  await t.test("lock and layers: locked shapes are not picked or changed; grid types; list beside an enlarged editor", async () => {
    await p.click('#segM button[data-m="sim"]');
    await ev(() => document.getElementById("bDesign").click());
    const n = await ev(() => window.__o3d.MD.shapes.length); assert.ok(n >= 2);
    await ev(() => { window.__o3d.MD.sel = [0]; });
    await p.keyboard.press("Control+l");
    assert.equal(await ev(() => window.__o3d.SIM.shapes[0].lock), true);
    await ev(() => { window.__o3d.MD.sel = [0, 1]; });
    const x1 = await ev(() => window.__o3d.SIM.shapes[1].cx), x0 = await ev(() => window.__o3d.SIM.shapes[0].cx);
    await ev(() => window.__o3d.mdCommand("move 10,0"));
    assert.equal(await ev(() => window.__o3d.SIM.shapes[0].cx), x0);   // locked: stays
    assert.equal(await ev(() => window.__o3d.SIM.shapes[1].cx), x1 + 10);
    await p.keyboard.press("Control+a"); assert.ok(!(await ev(() => window.__o3d.MD.sel.includes(0))));
    await p.keyboard.press("Control+Shift+L"); assert.ok(!(await ev(() => window.__o3d.SIM.shapes[0].lock)));
    await ev(() => window.__o3d.mdCommand("undo")); await ev(() => window.__o3d.mdCommand("undo"));
    await p.click('#mdRoot [data-md="done"]');
    await ev(() => { const s = document.querySelector("#panelSim .gridSel"); s.value = "crystal"; s.dispatchEvent(new Event("change", { bubbles: true })); });
    assert.ok(await ev(() => [...document.querySelectorAll(".gridSel")].every(s => s.value === "crystal")));
    await ev(() => { const s = document.querySelector("#panelSim .gridSel"); s.value = "lines"; s.dispatchEvent(new Event("change", { bubbles: true })); });
    await ev(() => document.querySelector('#panelSim .enl.edl .enlBtn').click());
    const side = await ev(() => { const a = document.querySelector(".enlarged .edSide").getBoundingClientRect(), c = document.getElementById("maskCanvas").getBoundingClientRect(); return a.left > c.right - 1; });
    assert.ok(side, "the shape list sits right of the drawing");
    assert.ok(await ev(() => !!document.querySelector(".enlarged .enlBar .enlFs")));
    await ev(() => document.querySelector(".enlarged .enlBtn").click());
  });

  await t.test("corner lab: a hand-edited mask is kept in the project and restored", async () => {
    await p.click('#segM button[data-m="corner"]'); await p.waitForTimeout(400);
    assert.ok(await ev(() => window.__o3d.SIM.shapes.slice(0, 3).every(s => s.lock)));   // domain and mesas locked
    await ev(() => { const o = window.__o3d; o.mdOpen("corner"); o.MD.sel = [o.MD.shapes.length - 1]; o.mdCommand("move 5,0"); document.querySelector('#mdRoot [data-md="done"]').click(); });
    const proj = await ev(() => window.__o3d.svProject(["corner"]));
    assert.ok(Array.isArray(proj.parts.corner.mask) && proj.parts.corner.mask.length >= 3);
    await ev(() => document.getElementById("clRun").click()); assert.equal(await ev(() => window.__o3d.svProject(["corner"]).parts.corner.mask), undefined);
    await p.click('#segM button[data-m="sim"]');
    await p.evaluate(p0 => window.__o3d.svApply(p0, ["corner"]), proj);
    await p.click('#segM button[data-m="corner"]'); await p.waitForTimeout(300);
    assert.deepEqual(await ev(() => window.__o3d.SIM.shapes.map(s => s.cx)), proj.parts.corner.mask.map(s => s.cx));
    assert.ok(await ev(() => !document.getElementById("clEdited").classList.contains("hidden")));
  });

  await t.test("no sideways scroll at phone width", async () => {
    await p.setViewportSize({ width: 390, height: 844 });
    for (const m of ["model", "pit", "sim", "find"]) {
      await p.click(`#segM button[data-m="${m}"]`); await p.waitForTimeout(400);
      const [sw, iw] = await ev(() => [document.documentElement.scrollWidth, innerWidth]);
      assert.ok(sw <= iw, `${m}: ${sw} > ${iw}`);
    }
  });

  await browser.close();
  assert.deepEqual(errors, []);
});
