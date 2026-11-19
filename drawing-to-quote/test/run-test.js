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
