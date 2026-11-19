#!/usr/bin/env node
/*
 * 用法：
 *   node cli.js <parts.csv|parts.json> [-o 輸出.xlsx] [--db 自訂單價.json] [--project 專案名稱] [--due 交期] [--deadline 報價截止日]
 * 未指定 -o 時於終端機列出摘要。
 */
const fs = require("fs");
const path = require("path");
const DB = require("./engine/price-db.js");
const E = require("./engine/estimator.js");
const { buildSheets, rfqText } = require("./engine/report.js");
const { buildXlsx } = require("./engine/xlsx-writer.js");

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : undefined; };
const out = opt("-o"), dbFile = opt("--db"), project = { name: opt("--project"), dueDate: opt("--due"), quoteDeadline: opt("--deadline") };
const input = args[0];
if (!input) { console.error("用法：node cli.js parts.csv -o 報價分析.xlsx"); process.exit(1); }

let db = DB;
if (dbFile) db = deepMerge(JSON.parse(JSON.stringify(DB)), JSON.parse(fs.readFileSync(dbFile, "utf8")));
function deepMerge(a, b) { for (const k of Object.keys(b)) a[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? deepMerge(a[k] || {}, b[k]) : b[k]; return a; }

const text = fs.readFileSync(input, "utf8");
const rows = input.endsWith(".json") ? JSON.parse(text) : E.parseCSV(text);
if (!project.name) project.name = path.basename(input).replace(/\.\w+$/, "");
const est = E.estimateAll(rows, db);

const nt = (v) => "NT$ " + Math.round(v).toLocaleString("en-US");
console.log(`\n${project.name}｜${est.summary.count} 張圖面｜單價 ${db.version}\n`);
for (const r of est.results) {
  console.log(`■ ${r.part.drawingNo} ${r.part.name} (${r.part.material} × ${r.part.qty})  風險:${r.risk.level}`);
  for (const rt of r.routes) console.log(`   ${rt.recommended ? "★" : " "} ${rt.id.padEnd(4)} ${nt(rt.price.fair).padStart(12)} ${rt.name}${rt.fitNote ? "  [" + rt.fitNote + "]" : ""}`);
  if (r.suggestions[0]) console.log(`   ↓ 降本：${r.suggestions[0].suggest}（-${(r.suggestions[0].savingPct * 100).toFixed(0)}%）`);
}
const s = est.summary;
console.log(`\n合計：最低 ${nt(s.totalLow)}｜合理 ${nt(s.total)}｜急件 ${nt(s.totalRush)}｜降本潛力 ${nt(s.potential)}`);
console.log(`風險：高 ${s.riskCount["高"]}／中 ${s.riskCount["中"]}／低 ${s.riskCount["低"]}\n`);

if (out) {
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, buildXlsx(buildSheets(est, project, db)));
  fs.writeFileSync(out.replace(/\.xlsx$/i, "") + "_詢價單.txt", rfqText(est, project));
  console.log(`已輸出：${out}（9 個工作表）與詢價單文字檔`);
}
