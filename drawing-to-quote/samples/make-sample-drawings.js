/*
 * 產生測試用 2D 製作圖：同一份圖面同時輸出 DXF / SVG（供 PDF、PNG 轉檔）
 *   node samples/make-sample-drawings.js            → samples/drawings/*.dxf, *.svg
 * 這些是「示範圖面」，用來驗證辨識流程，不是實際零件圖。
 */
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "drawings");
fs.mkdirSync(OUT, { recursive: true });

// A3 圖框 420×297，含標題欄
function titleBlock(t) {
  const x0 = 250, y0 = 10, rows = [["圖號", t.dno], ["CAD NO", t.cad], ["品名", t.name], ["材料", t.mat], ["數量", t.qty], ["表面處理", t.surf], ["熱處理", t.heat || "無"], ["比例", "1:1"], ["單位", "mm"]];
  const L = [], T = [];
  L.push([5, 5, 415, 5], [415, 5, 415, 292], [415, 292, 5, 292], [5, 292, 5, 5]);
  const h = 9, w1 = 40, w2 = 120;
  rows.forEach(([k, v], i) => {
    const y = y0 + (rows.length - 1 - i) * h;
    L.push([x0, y, x0 + w1 + w2, y], [x0, y + h, x0 + w1 + w2, y + h]);
    T.push({ x: x0 + 2, y: y + 2.5, h: 3.5, s: k }, { x: x0 + w1 + 3, y: y + 2.5, h: 3.5, s: v });
  });
  L.push([x0, y0, x0, y0 + rows.length * h], [x0 + w1, y0, x0 + w1, y0 + rows.length * h], [x0 + w1 + w2, y0, x0 + w1 + w2, y0 + rows.length * h]);
  return { L, T };
}

const DRAWINGS = [
  {
    file: "0202501-E08_滾輪",
    tb: { dno: "0202501-E08", cad: "S067-E08", name: "滾輪", mat: "S50C", qty: "2+2", surf: "染黑", heat: "高周波 HRC50" },
    build() {
      const L = [], C = [], T = [], D = [];
      // 前視圖：Ø80 × 60 剖面
      L.push([40, 120, 100, 120], [100, 120, 100, 200], [100, 200, 40, 200], [40, 200, 40, 120], [40, 145, 100, 145], [40, 175, 100, 175]);
      // 側視圖：同心圓
      C.push([180, 160, 40], [180, 160, 15], [180, 190, 3], [180, 130, 3], [150, 160, 3], [210, 160, 3]);
      D.push({ kind: "diameter", v: 80, s: "Ø80 g6", x: 20, y: 150, rot: 90 }, { kind: "diameter", v: 30, s: "Ø30 H7", x: 110, y: 160 }, { kind: "linear", v: 60, s: "60", x: 70, y: 110 });
      T.push({ x: 160, y: 95, h: 3.5, s: "4-Ø6 通" }, { x: 30, y: 80, h: 3.5, s: "外徑 Ra1.6" }, { x: 30, y: 72, h: 3.5, s: "未註公差 ±0.1" }, { x: 30, y: 64, h: 3.5, s: "去毛邊、倒角 C0.5" }, { x: 30, y: 56, h: 3.5, s: "退刀槽 2 處" });
      return { L, C, T, D };
    },
  },
  {
    file: "0202501-E10_分流塊",
    tb: { dno: "0202501-E10", cad: "S067-E10", name: "分流塊", mat: "SUS304", qty: "2", surf: "無" },
    build() {
      const L = [], C = [], T = [], D = [];
      L.push([30, 140, 150, 140], [150, 140, 150, 220], [150, 220, 30, 220], [30, 220, 30, 140]); // 上視 120×80
      L.push([30, 70, 150, 70], [150, 70, 150, 120], [150, 120, 30, 120], [30, 120, 30, 70]);     // 前視 高 50
      L.push([170, 140, 220, 140], [220, 140, 220, 220], [220, 220, 170, 220], [170, 220, 170, 140]); // 右視
      for (const [x, y] of [[45, 155], [135, 155], [45, 205], [135, 205], [90, 155], [90, 205]]) C.push([x, y, 3.3]);
      for (const [x, y] of [[60, 180], [75, 180], [105, 180], [120, 180]]) C.push([x, y, 2.5]);
      D.push({ kind: "linear", v: 120, s: "120±0.01", x: 90, y: 228 }, { kind: "linear", v: 80, s: "80", x: 22, y: 176, rot: 90 }, { kind: "linear", v: 50, s: "50", x: 22, y: 92, rot: 90 }, { kind: "linear", v: 35, s: "35", x: 60, y: 135 });
      T.push({ x: 160, y: 120, h: 3.5, s: "右視圖" }, { x: 30, y: 60, h: 3.5, s: "6-Ø6.6 通 沉頭Ø11 深6.5" }, { x: 30, y: 52, h: 3.5, s: "8-M5x0.8 深10" },
        { x: 30, y: 44, h: 3.5, s: "4-PT1/8 流道交叉孔 Ø6 深60" }, { x: 30, y: 36, h: 3.5, s: "流道面 Ra0.8 需清洗、氣密測試" });
      return { L, C, T, D };
    },
  },
  {
    file: "0202501-E12_感測器支架",
    tb: { dno: "0202501-E12", cad: "S067-E12", name: "感測器支架", mat: "SPCC t=2.0", qty: "10", surf: "烤漆 黑色" },
    build() {
      const L = [], C = [], T = [], D = [];
      L.push([30, 120, 210, 120], [210, 120, 210, 180], [210, 180, 30, 180], [30, 180, 30, 120], [90, 120, 90, 180], [150, 120, 150, 180]);
      for (const [x, y] of [[50, 140], [50, 160], [190, 140], [190, 160]]) C.push([x, y, 2.75]);
      D.push({ kind: "linear", v: 180, s: "180", x: 120, y: 188 }, { kind: "linear", v: 60, s: "60", x: 22, y: 146, rot: 90 });
      T.push({ x: 92, y: 110, h: 3.5, s: "UP 90° R2" }, { x: 152, y: 110, h: 3.5, s: "DOWN 90° R2" }, { x: 30, y: 70, h: 3.5, s: "4-Ø5.5 通" }, { x: 30, y: 62, h: 3.5, s: "2-M4 壓鉚螺帽" }, { x: 30, y: 54, h: 3.5, s: "展開圖 板厚 t=2.0" });
      return { L, C, T, D };
    },
  },
];

// ── DXF 輸出（R2007 / UTF-8）──
function toDXF(d) {
  const tb = titleBlock(d.tb), g = d.build();
  const o = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1021", "9", "$INSUNITS", "70", "4", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  const line = ([x1, y1, x2, y2]) => o.push("0", "LINE", "8", "0", "10", x1, "20", y1, "30", 0, "11", x2, "21", y2, "31", 0);
  [...tb.L, ...g.L].forEach(line);
  g.C.forEach(([x, y, r]) => o.push("0", "CIRCLE", "8", "0", "10", x, "20", y, "30", 0, "40", r));
  [...tb.T, ...g.T].forEach((t) => o.push("0", "TEXT", "8", "TEXT", "10", t.x, "20", t.y, "30", 0, "40", t.h, "1", t.s.replace(/Ø/g, "%%c").replace(/±/g, "%%p").replace(/°/g, "%%d")));
  g.D.forEach((m) => o.push("0", "DIMENSION", "8", "DIM", "10", m.x, "20", m.y, "11", m.x, "21", m.y, "70", m.kind === "diameter" ? 3 : 0, "42", m.v, "1", m.s.replace(/^Ø?\d+(\.\d+)?/, m.kind === "diameter" ? "%%c<>" : "<>").replace(/±/g, "%%p")));
  o.push("0", "ENDSEC", "0", "EOF");
  return o.join("\n") + "\n";
}

// ── SVG 輸出（A3，y 翻轉）──
function toSVG(d) {
  const tb = titleBlock(d.tb), g = d.build();
  const Y = (y) => 297 - y;
  const p = [`<svg xmlns="http://www.w3.org/2000/svg" width="420mm" height="297mm" viewBox="0 0 420 297"><rect width="420" height="297" fill="#fff"/><g stroke="#000" stroke-width="0.35" fill="none">`];
  [...tb.L, ...g.L].forEach(([a, b, c, e]) => p.push(`<line x1="${a}" y1="${Y(b)}" x2="${c}" y2="${Y(e)}"/>`));
  g.C.forEach(([x, y, r]) => p.push(`<circle cx="${x}" cy="${Y(y)}" r="${r}"/>`));
  p.push(`</g><g font-family="WenQuanYi Zen Hei, Noto Sans CJK TC, sans-serif" fill="#000">`);
  [...tb.T, ...g.T, ...g.D.map((m) => ({ x: m.x, y: m.y, h: 3.5, s: m.s, rot: m.rot }))].forEach((t) => p.push(`<text x="${t.x}" y="${Y(t.y)}" font-size="${t.h}"${t.rot ? ` transform="rotate(${-t.rot} ${t.x} ${Y(t.y)})"` : ""}>${t.s.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`));
  p.push("</g></svg>");
  return p.join("");
}

for (const d of DRAWINGS) {
  fs.writeFileSync(path.join(OUT, d.file + ".dxf"), toDXF(d));
  fs.writeFileSync(path.join(OUT, d.file + ".svg"), toSVG(d));
}
console.log("已產生", DRAWINGS.length, "張示範圖面 →", OUT);
module.exports = { DRAWINGS };
