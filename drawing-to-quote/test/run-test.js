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
