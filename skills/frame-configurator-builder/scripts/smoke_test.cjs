#!/usr/bin/env node
/* 冒煙測試：WebGL 開／關兩種模式各跑一次，並模擬真實 Chrome 的全域 window.chrome（抓變數撞名）。
 * 收集頁面錯誤、截圖，並點擊所有 [data-export] 按鈕，把下載檔存到輸出資料夾。
 * 用法：node smoke_test.js <app.html> <out_dir> [--no-export]
 * 有頁面錯誤或 window.__errs 時 exit code = 1。
 * 需要 playwright（雲端環境已預裝；本機 npm i playwright 後 npx playwright install chromium）。
 */
const { chromium } = require('playwright'), path = require('path'), fs = require('fs');
const [file, outDir] = process.argv.slice(2), noExport = process.argv.includes('--no-export');
if (!file || !outDir) { console.error('用法: node smoke_test.js <app.html> <out_dir> [--no-export]'); process.exit(1); }
fs.mkdirSync(outDir, { recursive: true });
(async () => {
  let bad = false;
  const modes = [['gl', ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist']], ['nogl', ['--disable-webgl', '--disable-3d-apis']]];
  for (const [mode, args] of modes) {
    const b = await chromium.launch({ args });
    const p = await b.newPage({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
    await p.addInitScript(() => { window.chrome = { runtime: {} }; });
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + path.resolve(file)); await p.waitForTimeout(2000);
    await p.screenshot({ path: path.join(outDir, `${mode}.png`) });
    const files = [];
    if (!noExport) for (const h of await p.$$('[data-export]')) {
      const id = await h.getAttribute('id');
      try {
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), h.click({ timeout: 10000 })]);
        const sug = dl.suggestedFilename(), ext = path.extname(sug) || ({'btn-stp':'.stp','btn-csv':'.csv'}[id] || '.pdf');
        const fn = path.join(outDir, `${mode}_${id || 'export'}${ext}`); await dl.saveAs(fn);
        files.push(`${path.basename(fn)} (${fs.statSync(fn).size} B)`);
      } catch (e) { errs.push(`export #${id}: ${e.message.split('\n')[0]}`); }
    }
    const appErrs = await p.evaluate(() => window.__errs || []);
    console.log(`[${mode}] errors: ${JSON.stringify(errs.concat(appErrs))}\n  files: ${files.join(', ')}`);
    if (errs.length || appErrs.length) bad = true;
    await b.close();
  }
  process.exit(bad ? 1 : 0);
})();
