/*
 * 產生「可直接雙擊 index.html 使用」的離線 OCR 檔（vendor/ocr-inline/）
 * 瀏覽器在 file:// 下禁止 Worker 載入本機檔與 fetch 字庫，
 * 因此把 OCR 核心、Worker 程式與字庫包成一般 <script> 可載入的字串。
 *
 *   node tools/build-inline-ocr.js <tesseract.js 套件資料夾的上層 node_modules>
 *   例：npm i tesseract.js@5.1.1 tesseract.js-core@5.1.1 @tesseract.js-data/eng@1.0.0 @tesseract.js-data/chi_tra@1.0.0
 *       node tools/build-inline-ocr.js ./node_modules
 */
const fs = require("fs"), path = require("path");
const nm = path.resolve(process.argv[2] || "node_modules");
const out = path.join(__dirname, "..", "vendor", "ocr-inline");
fs.mkdirSync(out, { recursive: true });
const put = (name, value) => {
  fs.writeFileSync(path.join(out, name + ".js"), `(window.__D2Q_OCR=window.__D2Q_OCR||{})[${JSON.stringify(name)}]=${JSON.stringify(value)};\n`);
  console.log(name, (fs.statSync(path.join(out, name + ".js")).size / 1048576).toFixed(1) + " MB");
};
put("core-simd", fs.readFileSync(path.join(nm, "tesseract.js-core/tesseract-core-simd-lstm.wasm.js"), "utf8"));
put("core", fs.readFileSync(path.join(nm, "tesseract.js-core/tesseract-core-lstm.wasm.js"), "utf8"));
put("worker", fs.readFileSync(path.join(nm, "tesseract.js/dist/worker.min.js"), "utf8"));
for (const l of ["eng", "chi_tra"]) put("lang-" + l, fs.readFileSync(path.join(nm, `@tesseract.js-data/${l}/4.0.0_best_int/${l}.traineddata.gz`)).toString("base64"));
fs.copyFileSync(path.join(nm, "tesseract.js/dist/tesseract.min.js"), path.join(__dirname, "..", "vendor", "tesseract", "tesseract.min.js"));
