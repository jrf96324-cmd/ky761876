/*
 * 產生 vendor/pdfjs/cmaps-inline.js：把 pdf.js 的中日韓字型對照表（.bcmap）包成 <script> 可載入的資料。
 * 直接雙擊 index.html（file://）時，瀏覽器禁止 pdf.js 以 XHR 讀本機 cmaps/，
 * 中文（Big5、GB、UniCNS…）CAD 圖的文字層就讀不到 → 改由此檔從記憶體提供。
 *   node tools/build-inline-cmaps.js
 */
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "..", "vendor", "pdfjs", "cmaps");
const map = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".bcmap")).sort()) map[f.replace(/\.bcmap$/, "")] = fs.readFileSync(path.join(dir, f)).toString("base64");
const out = path.join(__dirname, "..", "vendor", "pdfjs", "cmaps-inline.js");
fs.writeFileSync(out, `/* pdf.js CMaps（${Object.keys(map).length} 個，base64）— 由 tools/build-inline-cmaps.js 產生 */\nwindow.__D2Q_CMAPS=${JSON.stringify(map)};\n`);
console.log(`已產生 ${out}（${Object.keys(map).length} 個，${(fs.statSync(out).size / 1048576).toFixed(1)} MB）`);
