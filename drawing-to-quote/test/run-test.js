// 基本回歸測試：node test/run-test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const E = require("../engine/estimator.js");
const { buildSheets } = require("../engine/report.js");
const { buildXlsx } = require("../engine/xlsx-writer.js");

assert.strictEqual(E.parseQty("2+2"), 4);
assert.strictEqual(E.parseQty("2組x3"), 6);
assert.strictEqual(E.parseQty("5 PCS"), 5);

const rows = E.parseCSV(fs.readFileSync(path.join(__dirname, "../samples/parts.csv"), "utf8"));
const est = E.estimateAll(rows);
assert.strictEqual(est.results.length, 8);
for (const r of est.results) {
  assert.ok(r.routes.length >= 2, `${r.part.name} 至少 2 條製程路線`);
  assert.ok(r.best.price.fair > 0 && Number.isFinite(r.best.price.fair));
  assert.ok(r.best.price.low <= r.best.price.fair && r.best.price.fair <= r.best.price.rush);
  // 批量越大單價越低
  const t = r.tierBest.map((x) => x.fair);
  for (let i = 1; i < t.length; i++) assert.ok(t[i] <= t[i - 1] + 1e-6, `${r.part.name} 批量單價應遞減`);
}
const byName = Object.fromEntries(est.results.map((r) => [r.part.name, r]));
assert.strictEqual(byName["滾輪"].part.shape, "round");
assert.strictEqual(byName["感測器支架"].best.id, "S1");
assert.strictEqual(byName["分流塊"].risk.level, "高");
assert.ok(byName["分流塊"].suggestions.some((s) => s.issue.includes("公差")));

// 數量 1000 時鈑金應改推沖壓
const sheet = { ...rows.find((r) => r["零件名稱"] === "感測器支架"), 數量: 2000 };
assert.strictEqual(E.estimatePart(sheet).best.id, "S3");

const xlsx = buildXlsx(buildSheets(est, { name: "test" }));
assert.strictEqual(String.fromCharCode(xlsx[0], xlsx[1]), "PK");
console.log("全部測試通過 ✔", est.results.map((r) => `${r.part.name}:${Math.round(r.best.price.fair)}`).join(" "));

// ── 2D 圖面辨識（DXF 示範圖）──
const DXF = require("../engine/dxf.js");
const DP = require("../engine/drawing-parser.js");
const ddir = path.join(__dirname, "../samples/drawings");
const rec = (f) => DP.recognize(DP.fromDXF(DXF.parseDXF(fs.readFileSync(path.join(ddir, f))), f)).fields;
const e08 = rec("0202501-E08_滾輪.dxf");
assert.deepStrictEqual([e08["圖號"], e08["材料"], e08["數量"], e08["外形"], e08["外徑OD"], e08["長L"], e08["孔數"], e08["表面處理"], e08["熱處理"]],
  ["0202501-E08", "S50C", "2+2", "round", 80, 60, 4, "染黑", "高周波"]);
const e10 = rec("0202501-E10_分流塊.dxf");
assert.deepStrictEqual([e10["材料"], e10["外形"], e10["長L"], e10["寬W"], e10["高H"], e10["攻牙數"], e10["PT牙數"], e10["孔數"], e10["公差"], e10["粗糙度"]],
  ["SUS304", "block", 120, 80, 50, 8, 4, 6, "嚴", "Ra0.8"]);
const e12 = rec("0202501-E12_感測器支架.dxf");
assert.deepStrictEqual([e12["材料"], e12["外形"], e12["板厚T"], e12["折彎數"], e12["長L"], e12["寬W"], e12["攻牙數"], e12["表面處理"]],
  ["SPCC", "sheet", 2, 2, 180, 60, 2, "烤漆"]);
// 辨識結果可直接估價
const est2 = E.estimateAll([e08, e10, e12]);
assert.strictEqual(est2.results.length, 3);
console.log("DXF 辨識測試通過 ✔", est2.results.map((r) => `${r.part.name}:${r.best.id}`).join(" "));

// ── 掃描 PDF 的 OCR 結果 → 欄位辨識（回歸測試；OCR 原始文字存在 test/fixtures）──
const truthScan = {
  scan_E08: { 圖號: "0202501-E08", 材料: "S50C", 數量: "2+2", 外形: "round", 長L: 60, 外徑OD: 80, 內徑ID: 30, 孔數: 4, 公差: "嚴", 粗糙度: "Ra1.6", 表面處理: "染黑", 熱處理: "高周波" },
  scan_E10: { 圖號: "0202501-E10", 材料: "SUS304", 數量: "2", 外形: "block", 長L: 120, 寬W: 80, 高H: 50, 孔數: 6, 攻牙數: 8, PT牙數: 4, 公差: "嚴", 粗糙度: "Ra0.8", 表面處理: "無" },
  scan_E12_rot: { 圖號: "0202501-E12", 材料: "SPCC", 數量: "10", 外形: "sheet", 長L: 180, 寬W: 60, 板厚T: 2, 孔數: 4, 攻牙數: 2, 折彎數: 2, 表面處理: "烤漆" },
};
let okN = 0, totN = 0; const miss = [];
for (const [f, t] of Object.entries(truthScan)) {
  const r = DP.recognize(JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", f + "_ocr.json"), "utf8"))).fields;
  for (const [k, v] of Object.entries(t)) { totN++; if (String(r[k] ?? "") === String(v)) okN++; else miss.push(`${f}.${k}=${r[k] ?? "∅"}(應為${v})`); }
}
assert.ok(okN / totN >= 0.9, `掃描辨識正確率 ${okN}/${totN} 低於 90%：${miss.join("、")}`);
console.log(`掃描 PDF 欄位辨識 ${okN}/${totN} = ${Math.round(okN / totN * 100)}% ✔${miss.length ? "（未中：" + miss.join("、") + "）" : ""}`);

// ── 計算檢核：英吋 DXF 換算、板件未填板厚 ──
const inch = DXF.parseDXF("0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n1\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n0\nDIMENSION\n70\n0\n42\n4\n1\n<>\n11\n0\n21\n0\n0\nENDSEC\n0\nEOF\n");
assert.strictEqual(DP.fromDXF(inch, "x.dxf").dims[0].value, 101.6);
const noT = E.estimatePart({ 圖號: "T1", 材料: "A6061", 數量: 1, 外形: "plate", 長L: 200, 寬W: 100 });
assert.ok(noT.part.warnings.some((w) => /板厚未填/.test(w)) && noT.best.price.fair > 0);
console.log("計算檢核測試通過 ✔");

// ── CAD 匯出 PDF：Ø 字元變體（ø/Φ/未對應符號）、直書逐字、疊式公差、「圖號 DWG No.」「個/台」──
const q603 = DP.recognize(JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "cad_q603_pdftext.json"), "utf8"))).fields;
assert.deepStrictEqual([q603["圖號"], q603["材料"], q603["數量"], q603["外形"], q603["外徑OD"], q603["內徑ID"], q603["孔數"], q603["公差"], q603["表面處理"]],
  ["2002224-25", "S50C", "1", "round", 130, 40, 6, "中等", "染黑"]);
assert.strictEqual(DP.norm("\u0000100"), "Ø100");
console.log("CAD 匯出 PDF 直徑／疊式公差測試通過 ✔");

// ── 軸類（Ø 以線條繪製、非文字）＋ 圖名 3 行規則 ＋ 代碼含空白 ──
const shaft = DP.recognize(JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "shaft_r854_pdftext.json"), "utf8"))).fields;
assert.deepStrictEqual([shaft["圖號"], shaft["CAD NO"], shaft["零件名稱"], shaft["圖名說明"], shaft["材料"], shaft["外形"], shaft["外徑OD"], shaft["長L"], shaft["公差"], shaft["外螺紋數"]],
  ["2002507-A02", "R854-A02", "傳動軸", "E23 DYNO 傳動軸 動力測試機", "SCM440", "round", 46, 561, "嚴", 1]);
assert.ok(!shaft["內徑ID"], "實心軸不應有內徑");
assert.strictEqual(q603["零件名稱"], "心軸座");
const shaftEst = E.estimatePart(shaft);
assert.strictEqual(shaftEst.part.shape, "round");
console.log(`軸類／圖名規則測試通過 ✔（傳動軸 估價 NT$${Math.round(shaftEst.best.price.fair)}/件，${shaftEst.best.name}，胚料 ${shaftEst.geometry.stockKg.toFixed(1)} kg）`);
