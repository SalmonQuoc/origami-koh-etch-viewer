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
