const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const NPM = path.dirname(require.resolve('three/package.json'));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  page.on('console', m => { if (m.type() === 'error') console.log('console.error', m.text()); });
  await page.route('**/three.min.js', r => r.fulfill({ path: NPM + '/build/three.min.js', contentType: 'text/javascript' }));
  await page.route('**/OrbitControls.js', r => r.fulfill({ path: NPM + '/examples/js/controls/OrbitControls.js', contentType: 'text/javascript' }));
  await page.route('https://fonts.googleapis.com/**', r => r.fulfill({ body: '', contentType: 'text/css' }));
  await page.goto('file://' + path.resolve(__dirname, '../../index.html'));
  await page.waitForTimeout(1000);
  await page.click('#segM button[data-m=sim]');
  for (const wf of (process.argv[2] || '100,110,111').split(',')) {
    await page.click(`#segW button[data-w="${wf}"]`);
    const n = await page.evaluate(w => window.__o3d.SPRESETS[w].length, wf);
    for (let i = 0; i < n; i++) {
      if (process.argv[3] && !process.argv[3].split(',').includes(String(i))) continue;
      await page.selectOption('#simQual', process.argv[4] || 'draft');
      await page.selectOption('#simPreset', String(i));
      await page.waitForTimeout(300);
      await page.waitForFunction(() => window.__o3d.SIM.res && !window.__o3d.SIM.running, null, { timeout: 300000 });
      await page.waitForTimeout(800);
      const info = await page.evaluate(() => ({ name: window.__o3d.SPRESETS[window.__o3d.S.wf][window.__o3d.SIM.preset].name, status: document.getElementById('simStatus').textContent, read: document.getElementById('simReadout').innerText.replace(/\n/g, ' | ') }));
      console.log(wf, i, JSON.stringify(info));
      await page.screenshot({ path: `all_${wf}_${i}.png`, clip: { x: 40, y: 180, width: 860, height: 1000 } }).catch(async () => page.screenshot({ path: `all_${wf}_${i}.png` }));
    }
  }
  await browser.close();
})();
