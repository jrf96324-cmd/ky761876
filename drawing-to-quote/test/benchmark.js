/*
 * 辨識＋估價 基準測試（以使用者上傳過的圖面為基準重建的測試圖）
 *   node test/benchmark.js
 * 1. 每張圖：辨識 → 估價，逐欄比對標準答案，列出正確率
 * 2. 同一批圖連續執行兩次，辨識欄位與估價金額必須完全相同（穩定性）
 * 任一項不符即以非 0 結束，表示「不可發佈」。
 */
const fs = require("fs");
const path = require("path");
const DXF = require("../engine/dxf.js");
const DP = require("../engine/drawing-parser.js");
const E = require("../engine/estimator.js");

const fx = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8"));
const dxf = (f) => DP.fromDXF(DXF.parseDXF(fs.readFileSync(path.join(__dirname, "../samples/drawings", f))), f);

// 標準答案（依原圖）
const CASES = [
  { name: "滾輪 DXF", input: () => dxf("0202501-E08_滾輪.dxf"), truth: { 圖號: "0202501-E08", 材料: "S50C", 數量: "2+2", 外形: "round", 外徑OD: 80, 長L: 60, 孔數: 4, 表面處理: "染黑", 熱處理: "高周波" } },
  { name: "分流塊 DXF", input: () => dxf("0202501-E10_分流塊.dxf"), truth: { 材料: "SUS304", 外形: "block", 長L: 120, 寬W: 80, 高H: 50, 攻牙數: 8, PT牙數: 4, 孔數: 6, 公差: "嚴" } },
  { name: "感測器支架 DXF", input: () => dxf("0202501-E12_感測器支架.dxf"), truth: { 材料: "SPCC", 外形: "sheet", 板厚T: 2, 折彎數: 2, 長L: 180, 寬W: 60, 表面處理: "烤漆" } },
  { name: "滾輪 掃描PDF", input: () => fx("scan_E08_ocr.json"), truth: { 圖號: "0202501-E08", 材料: "S50C", 數量: "2+2", 外形: "round", 長L: 60, 外徑OD: 80, 內徑ID: 30, 孔數: 4, 公差: "嚴", 表面處理: "染黑" } },
  { name: "分流塊 掃描PDF", input: () => fx("scan_E10_ocr.json"), truth: { 圖號: "0202501-E10", 材料: "SUS304", 數量: "2", 外形: "block", 長L: 120, 寬W: 80, 高H: 50, 孔數: 6, 攻牙數: 8, PT牙數: 4, 公差: "嚴", 粗糙度: "Ra0.8" } },
  { name: "感測器支架 掃描PDF(轉90°)", input: () => fx("scan_E12_rot_ocr.json"), truth: { 圖號: "0202501-E12", 材料: "SPCC", 數量: "10", 外形: "sheet", 長L: 180, 寬W: 60, 板厚T: 2, 孔數: 4, 攻牙數: 2, 折彎數: 2, 表面處理: "烤漆" } },
  { name: "心軸座 q603（法蘭）", input: () => fx("cad_q603_pdftext.json"), truth: { 圖號: "2002224-25", 零件名稱: "心軸座", 材料: "S50C", 數量: "1", 外形: "round", 外徑OD: 130, 內徑ID: 40, 孔數: 6, 公差: "中等", 表面處理: "染黑" } },
  { name: "傳動軸 r854（軸）", input: () => fx("shaft_r854_pdftext.json"), truth: { 圖號: "2002507-A02", "CAD NO": "R854-A02", 零件名稱: "傳動軸", 材料: "SCM440", 外形: "round", 外徑OD: 46, 長L: 561, 公差: "嚴", 外螺紋數: 1, 內直角數: "" } },
  { name: "支撐塊 n763（方塊＋Ø凹弧）", input: () => fx("block_n763_pdftext.json"), truth: { 圖號: "7101731-R10", "CAD NO": "N763-R10", 零件名稱: "支撐塊", 材料: "S50C", 外形: "block", 長L: 18, 孔數: 2, "寬W/高H": "11/14.5" } },
  { name: "滾輪座 r151（U 型座）", input: () => fx("roller_r151_pdftext.json"), truth: { 圖號: "1002303-14", "CAD NO": "R151-14", 零件名稱: "滾輪座", 材料: "SUS304", 數量: "4", 外形: "block", 長L: 130, "寬W/高H": "50/85", 攻牙數: 10, 內直角數: "" } },
  { name: "墊片（薄片 t0.5，側視標厚）", input: () => fx("thin_shim_pdftext.json"), truth: { 零件名稱: "墊片", 材料: "SUS304", 數量: "2", 外形: "sheet", 長L: 60, 寬W: 40, 板厚T: 0.5, 孔數: 2 } },
  { name: "彈片（薄片 t=1.0 註記）", input: () => fx("thin_spring_pdftext.json"), truth: { 零件名稱: "彈片", 材料: "SUS301", 數量: "10", 外形: "sheet", 長L: 80, 寬W: 20, 板厚T: 1, 孔數: 2 } },
];

function runOnce() {
  return CASES.map((c) => {
    const rec = DP.recognize(c.input());
    const f = rec.fields;
    const est = E.estimatePart({ ...f, 辨識來源: `x ${rec.score}%` });
    return { name: c.name, fields: f, price: Math.round(est.best.price.fair * 100) / 100, route: est.best.name, stock: est.geometry.stock, reliability: est.reliability.level };
  });
}

const run1 = runOnce(), run2 = runOnce();
const same = JSON.stringify(run1) === JSON.stringify(run2);

let ok = 0, tot = 0;
const rows = [];
CASES.forEach((c, i) => {
  const f = run1[i].fields, miss = [];
  let k = 0, n = 0;
  for (const [key, want] of Object.entries(c.truth)) {
    const got = key === "寬W/高H" ? [f["寬W"], f["高H"]].map(Number).sort((a, b) => a - b).join("/") : f[key];
    n++; tot++;
    if (String(got ?? "") === String(want)) { k++; ok++; } else miss.push(`${key}=${got ?? "∅"}（應為 ${want}）`);
  }
  rows.push(`${k === n ? "✔" : "✘"} ${c.name.padEnd(22)} ${k}/${n}  估價 NT$${Math.round(run1[i].price).toLocaleString().padStart(7)}  ${run1[i].stock}${miss.length ? "\n     未中：" + miss.join("、") : ""}`);
});
console.log(rows.join("\n"));
console.log(`\n欄位正確率 ${ok}/${tot} = ${(ok / tot * 100).toFixed(1)}%`);
console.log(`兩次執行結果${same ? "完全相同 ✔" : "不一致 ✘"}`);
if (!same) {
  run1.forEach((r, i) => { if (JSON.stringify(r) !== JSON.stringify(run2[i])) console.log("  差異：", r.name); });
}
const MIN = +(process.env.BENCH_MIN || 0.95);
if (!same || ok / tot < MIN) { console.log(`✘ 不可發佈（需兩次相同且正確率 ≥ ${MIN * 100}%）`); process.exit(1); }
console.log("✔ 可發佈");
