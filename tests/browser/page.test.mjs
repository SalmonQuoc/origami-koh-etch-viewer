// End-to-end checks of the built page (index.html) in Chromium. Run: npm run test:browser
// (needs the playwright package and its Chromium; in CI: npx playwright install --with-deps chromium)
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

let chromium = null;
try { ({ chromium } = await import("playwright")); } catch (e) {}
const PAGE = "file://" + fileURLToPath(new URL("../../index.html", import.meta.url));
const skip = !chromium && "playwright is not installed";

test("page: scenes, simulator kernel, drawing, settings, custom etchant, presets, phone width", { skip, timeout: 240000 }, async t => {
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
    assert.deepEqual(open, ["Cross-section", "Microscope view of the selected item", "Etch history", "Show", "1Mask openings", "Corner result", "1Pick an example", "1Flat error"]);
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
    await ev(() => { window.__o3d.SIM.cutAxis = "y"; window.__o3d.SIM.cutPos = 0; });
    const x = bb.x + ed.ox - 20*ed.s, y = bb.y + ed.oy;
    await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x, y + 40*ed.s, { steps: 6 }); await p.mouse.up();
    assert.equal(await ev(() => window.__o3d.SIM.cutPos), -40);
    assert.equal(await p.inputValue("#simCutNum"), "-40");
    await p.fill("#simCutNum", "25"); await p.dispatchEvent("#simCutNum", "change");
    assert.equal(await ev(() => window.__o3d.SIM.cutPos), 25);
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
    assert.equal(await ev(() => document.querySelector('#panelSim [data-arr="arrPerp"]').checked), false);
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
