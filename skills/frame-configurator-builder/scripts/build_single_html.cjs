#!/usr/bin/env node
/* 把 three.js、OrbitControls、assets/lib/*.js 內嵌進單一 HTML（離線可用）。
 * 用法：node build_single_html.js <src.html> <out.html> --vendor <fetch_three.sh 的資料夾> [--lib <lib 資料夾>]
 * 來源 HTML 佔位字串：THREE 與 ORBIT 各放在獨立 <script> 內；LIBS 放在 App 的 IIFE 內（讓函式不污染 window）。
 *   寫法見 assets/starter.html：  <script>/*__THREE__*​/</script>  …  (function(){ "use strict"; /*__LIBS__*​/ …
 */
const fs = require('fs'), path = require('path');
const a = process.argv.slice(2), src = a[0], out = a[1];
const opt = k => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
const vendor = opt('--vendor'), libDir = opt('--lib') || path.join(__dirname, '..', 'assets', 'lib');
if (!src || !out || !vendor) { console.error('用法: node build_single_html.js <src.html> <out.html> --vendor <dir> [--lib <dir>]'); process.exit(1); }
const pkg = path.join(vendor, 'package');
const three = fs.readFileSync(path.join(pkg, 'build/three.min.js'), 'utf8');
const orbit = fs.readFileSync(path.join(pkg, 'examples/js/controls/OrbitControls.js'), 'utf8');
const libs = fs.readdirSync(libDir).filter(f => f.endsWith('.js')).sort()
  .map(f => `/* ---- ${f} ---- */\n` + fs.readFileSync(path.join(libDir, f), 'utf8')).join('\n');
let s = fs.readFileSync(src, 'utf8');
const marks = [['/*__THREE__*/', three, true], ['/*__ORBIT__*/', orbit, true], ['/*__LIBS__*/', libs, false]];
for (const [k, v, required] of marks) {
  if (!s.includes(k)) { if (required) { console.error('缺少佔位字串 ' + k); process.exit(1); } continue; }
  if (/<\/script/i.test(v)) { console.error(k + ' 內容含 </script，無法內嵌'); process.exit(1); }
  s = s.replace(k, () => v);
}
fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
fs.writeFileSync(out, s);
console.log(`OK ${out} (${(s.length / 1024).toFixed(0)} KB)`);
