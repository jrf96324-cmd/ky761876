/*
 * 報表組裝：將 estimateAll() 結果轉為 Excel 工作表與詢價單文字
 */
(function (root) {
  const isNode = typeof module !== "undefined" && module.exports;
  const DB_DEFAULT = isNode ? require("./price-db.js") : root.PRICE_DB;
  const R0 = (v) => Math.round(v);
  const H = (v) => ({ v, s: "h" });

  function seq(route) {
    return route.price.lines.filter((l) => l.type !== "material").map((l) => l.process).join(" → ");
  }

  function buildSheets(est, project = {}, db = DB_DEFAULT) {
    const { results, summary } = est;
    const tiers = results[0]?.tierBest.map((t) => t.qty) || db.qtyTiers;
    const today = new Date().toISOString().slice(0, 10);
    const sheets = [];

    // 00 專案摘要
    sheets.push({ name: "00_專案摘要", colWidths: [22, 22, 18, 18], rows: [
      [{ v: `${project.name || "製作圖製程審查與估價"}`, s: "t" }],
      ["估價日期", today, "單價版本", db.version],
      ["圖面數量", { v: summary.count, s: "n0" }, "總件數", { v: results.reduce((a, r) => a + r.part.qty, 0), s: "n0" }],
      ["交期需求", project.dueDate || "", "報價截止日", project.quoteDeadline || ""],
      [],
      [H("項目"), H("金額 NT$"), H("說明"), H("")],
      ["可信區間", `${R0(summary.rangeLow).toLocaleString()} – ${R0(summary.rangeHigh).toLocaleString()}`, `可信度 高${summary.relCount["高"]}／中${summary.relCount["中"]}／低${summary.relCount["低"]}`],
      ["估價合計（成本價）", { v: R0(summary.total), s: "nb" }, `${db.region || ""}，管銷 ${R0((db.markup.overhead || 0) * 100)}%、利潤 ${R0(db.markup.profitFair * 100)}%`],
      ["議價下限", { v: R0(summary.totalLow), s: "n" }, `估價 ${db.markup.profitLow >= 0 ? "+" : ""}${R0(db.markup.profitLow * 100)}%`],
      ["急件參考", { v: R0(summary.totalRush), s: "n" }, `估價 +${R0(db.markup.profitRush * 100)}%`],
      ["估價比例", `整體 ${R0((db.ratio?.overall ?? 1) * 100)}%`, `材料 ${R0((db.ratio?.material ?? 1) * 100)}%／加工 ${R0((db.ratio?.machining ?? 1) * 100)}%／委外 ${R0((db.ratio?.outsource ?? 1) * 100)}%`],
      ["降本潛力 (首要建議)", { v: R0(summary.potential), s: "n" }, { v: summary.total ? summary.potential / summary.total : 0, s: "p" }],
      [],
      [H("風險等級"), H("件數"), H(""), H("")],
      ["高", { v: summary.riskCount["高"], s: "hi" }], ["中", { v: summary.riskCount["中"], s: "mid" }], ["低", { v: summary.riskCount["低"], s: "lo" }],
      [],
      ["說明", "價格為台灣南部加工成本價估算（材料+各加工步驟機時+委外，不加價），可用估價比例調整；供發包前初判與議價基準，正式價格以供應商報價為準。"],
    ], merges: ["A1:D1", "B19:D19"] });

    // 01 圖面辨識總表
    sheets.push({ name: "01_圖面辨識總表", freeze: 1, colWidths: [16, 12, 16, 24, 10, 8, 16, 22, 10, 10, 12, 12, 12, 10, 14, 30],
      rows: [["圖號", "CAD NO", "零件名稱", "圖名說明", "材料", "數量", "外形分類", "主要尺寸 mm", "胚料kg", "成品kg", "公差", "粗糙度", "表面處理", "熱處理", "辨識來源", "辨識警示"].map(H),
        ...results.map((r) => { const p = r.part; return [p.drawingNo, p.cadNo, p.name, p.desc, p.material, { v: p.qty, s: "n0" }, r.shapeLabel, r.geometry.outline,
          { v: +r.geometry.stockKg.toFixed(3), s: "" }, { v: +r.geometry.partKg.toFixed(3), s: "" }, p.tolerance, p.roughness, p.surface, p.heat, p.source || "人工輸入", p.warnings.join("；")]; })] });

    // 02 製程審查表
    sheets.push({ name: "02_製程審查表", freeze: 1, colWidths: [16, 16, 30, 60, 8, 50],
      rows: [["圖號", "零件名稱", "建議製程", "加工順序", "風險", "風險說明"].map(H),
        ...results.map((r) => [r.part.drawingNo, r.part.name, r.best.name, seq(r.best),
          { v: r.risk.level, s: { 高: "hi", 中: "mid", 低: "lo" }[r.risk.level] }, { v: r.risk.items.join("\n") || "—", s: "wrap" }])] });

    // 02B 各圖加工步驟明細（推薦路線）
    const cat = { material: "材料", machining: "加工", outsource: "委外" };
    const sp = [["圖號", "零件名稱", "步驟", "工序", "類別", "計算依據", "單件工時 min", "費率 NT$/hr", "架模 min", "單件執行費", "架模/批費分攤", "成本小計/件", "估價比例", "估價/件", "數量", "估價小計"].map(H)];
    results.forEach((r) => {
      const pr = r.best.price, q = r.part.qty;
      pr.lines.forEach((l) => sp.push([r.part.drawingNo, r.part.name, { v: l.step, s: "n0" }, l.process, cat[l.cat],
        { v: l.runMin != null ? `${l.runMin.toFixed(1)} min × ${l.rate}/hr${l.setupMin ? `，架模 ${l.setupMin} min ÷ ${q} 件` : ""}` : (l.detail || "") + (l.note ? `（${l.note}）` : ""), s: "wrap" },
        l.runMin != null ? +l.runMin.toFixed(1) : "", l.rate || "", l.setupMin != null ? l.setupMin : "",
        { v: +l.runPer.toFixed(1), s: "n" }, { v: +l.setupPer.toFixed(1), s: "n" }, { v: +l.cost.toFixed(1), s: "n" }, { v: l.factor, s: "p" },
        { v: +l.unitCost.toFixed(1), s: "n" }, { v: q, s: "n0" }, { v: R0(l.unitCost * q), s: "n" }]));
      if (pr.overhead) sp.push([r.part.drawingNo, r.part.name, "", "管銷", "", "", "", "", "", "", "", "", "", { v: +pr.overhead.toFixed(1), s: "n" }, { v: q, s: "n0" }, { v: R0(pr.overhead * q), s: "n" }]);
      sp.push([{ v: r.part.drawingNo, s: "b" }, { v: r.part.name, s: "b" }, "", { v: `合計（${r.best.name}）`, s: "b" }, "", "", "", "", "", "", "", { v: R0(pr.rawDirect), s: "nb" }, "", { v: R0(pr.fair), s: "nb" }, { v: q, s: "n0" }, { v: R0(r.lineTotal), s: "nb" }]);
      sp.push([]);
    });
    sheets.push({ name: "02B_加工步驟明細", freeze: 1, colWidths: [16, 14, 6, 26, 7, 40, 10, 10, 8, 11, 11, 11, 9, 11, 7, 12], rows: sp });

    // 03 多元製程比較
    const cmp = [["圖號", "零件名稱", "路線", "製程路線", "材料/件", "加工/件", "委外表處/件", "架模總額", "合理單價", "與推薦差異", "適用性", "說明"].map(H)];
    results.forEach((r) => r.routes.forEach((rt) => cmp.push([r.part.drawingNo, r.part.name, rt.id + (rt.recommended ? " ★推薦" : ""), rt.name,
      { v: R0(rt.price.material), s: "n" }, { v: R0(rt.price.machining), s: "n" }, { v: R0(rt.price.outsource), s: "n" }, { v: R0(rt.price.setupTotal), s: "n" },
      { v: R0(rt.price.fair), s: rt.recommended ? "nb" : "n" }, { v: rt.deltaPct, s: "p" }, rt.fit ? (rt.fitNote || "適用") : rt.fitNote, { v: rt.desc, s: "wrap" }])));
    sheets.push({ name: "03_多元製程比較", freeze: 1, colWidths: [16, 14, 10, 34, 10, 10, 11, 10, 11, 10, 14, 60], rows: cmp });

    // 04 降本建議表
    const cd = [["圖號", "零件名稱", "問題點", "修改建議", "原合理單價", "修改後單價", "單件降本", "降本比例", "批量降本", "注意事項"].map(H)];
    results.forEach((r) => r.suggestions.forEach((s) => cd.push([r.part.drawingNo, r.part.name, s.issue, { v: s.suggest, s: "wrap" },
      { v: R0(r.best.price.fair), s: "n" }, { v: R0(s.newPrice), s: "n" }, { v: R0(s.saving), s: "n" }, { v: s.savingPct, s: "p" }, { v: R0(s.saving * r.part.qty), s: "n" }, s.caution])));
    sheets.push({ name: "04_降本建議表", freeze: 1, colWidths: [16, 14, 24, 50, 11, 11, 10, 10, 11, 20], rows: cd });

    // 05 加工估價表
    const qh = ["圖號", "零件名稱", "數量", "推薦製程", "材料", "加工", "委外", "管銷", "議價下限", "估價/件", "急件參考", "小計", "估價可信度", "可信區間下限", "可信區間上限", "可信度說明", ...tiers.map((q) => `${q}件 單價`), "批量最佳路線"].map(H);
    const qr = results.map((r) => { const pr = r.best.price; return [r.part.drawingNo, r.part.name, { v: r.part.qty, s: "n0" }, r.best.name,
      { v: R0(pr.material), s: "n" }, { v: R0(pr.machining), s: "n" }, { v: R0(pr.outsource), s: "n" }, { v: R0(pr.overhead), s: "n" },
      { v: R0(pr.low), s: "n" }, { v: R0(pr.fair), s: "nb" }, { v: R0(pr.rush), s: "n" }, { v: R0(r.lineTotal), s: "nb" },
      { v: `${r.reliability.level} ${r.reliability.score}`, s: { 高: "lo", 中: "mid", 低: "hi" }[r.reliability.level] }, { v: R0(r.reliability.low * r.part.qty), s: "n" }, { v: R0(r.reliability.high * r.part.qty), s: "n" }, r.reliability.why.join("；"),
      ...r.tierBest.map((t) => ({ v: R0(t.fair), s: "n" })), r.tierBest[r.tierBest.length - 1].route]; });
    qr.push(["合計", "", "", "", "", "", "", "", { v: R0(summary.totalLow), s: "nb" }, "", { v: R0(summary.totalRush), s: "nb" }, { v: R0(summary.total), s: "nb" }]);
    sheets.push({ name: "05_加工估價表", freeze: 1, colWidths: [16, 14, 6, 30, 9, 9, 9, 9, 10, 10, 10, 12, 10, 12, 12, 36, ...tiers.map(() => 10), 28], rows: [qh, ...qr] });

    // 06 供應商詢價單
    const rfq = [
      [{ v: "詢 價 單", s: "t" }],
      ["專案名稱", project.name || ""], ["圖面數量", `${summary.count} 張`], ["交期需求", project.dueDate || ""], ["報價截止日", project.quoteDeadline || ""],
      ["回覆事項", "1.單件價格 2.批量價格 3.材料是否含料 4.表面處理是否含 5.交期 6.是否可配合修改圖面降本 7.是否需提供 STEP / DXF / PDF"],
      ["附件", "□ 製作圖 PDF  □ 3D STEP  □ 材料規範  □ 表面處理規範  □ 數量表"],
      [],
      ["項次", "圖號", "零件名稱", "材料", "數量", "表面處理", "內部參考價", "廠商A 單價", "廠商A 交期", "廠商B 單價", "廠商B 交期", "廠商C 單價", "廠商C 交期", "最低價", "備註"].map(H),
    ];
    results.forEach((r, i) => { const row = rfq.length + 1;
      rfq.push([{ v: i + 1, s: "n0" }, r.part.drawingNo, r.part.name, r.part.material, { v: r.part.qty, s: "n0" }, r.part.surface, { v: R0(r.best.price.fair), s: "n" },
        "", "", "", "", "", "", { v: `=IF(COUNT(H${row},J${row},L${row})=0,"",MIN(H${row},J${row},L${row}))`, s: "n" }, ""]); });
    sheets.push({ name: "06_供應商詢價單", colWidths: [8, 16, 16, 10, 7, 12, 12, 11, 10, 11, 10, 11, 10, 10, 18], rows: rfq, merges: ["A1:O1", "B6:O6", "B7:O7"] });

    // 07 統計儀表板
    const st = [[{ v: "統計儀表板", s: "t" }], [], ["成本結構", "金額 NT$", "占比"].map(H)];
    const mix = summary.costMix, mt = summary.total || 1;
    [["材料", mix.material], ["加工", mix.machining], ["委外表處/熱處理", mix.outsource], ["管銷利潤", mix.overheadProfit]].forEach(([k, v]) => st.push([k, { v: R0(v), s: "n" }, { v: v / mt, s: "p" }]));
    st.push([], ["製程類別", "金額 NT$", "占比"].map(H));
    Object.entries(summary.byProcess).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => st.push([k, { v: R0(v), s: "n" }, { v: v / mt, s: "p" }]));
    for (const [title, obj] of [["材料別", summary.byMaterial], ["外形分類", summary.byShape], ["資料來源", summary.bySource]]) {
      st.push([], [title, "金額 NT$", "占比", "圖面數", "總件數"].map(H));
      Object.entries(obj).sort((a, b) => b[1].amount - a[1].amount).forEach(([k, v]) => st.push([k, { v: R0(v.amount), s: "n" }, { v: v.amount / mt, s: "p" }, { v: v.count, s: "n0" }, { v: v.qty, s: "n0" }]));
    }
    if (summary.avgConfidence != null) st.push(["圖面辨識平均信心", { v: summary.avgConfidence / 100, s: "p" }]);
    st.push([], ["零件成本排行", "小計 NT$", "占比", "風險", "降本潛力/件"].map(H));
    [...results].sort((a, b) => b.lineTotal - a.lineTotal).forEach((r) => st.push([`${r.part.drawingNo} ${r.part.name}`, { v: R0(r.lineTotal), s: "n" }, { v: r.lineTotal / mt, s: "p" },
      { v: r.risk.level, s: { 高: "hi", 中: "mid", 低: "lo" }[r.risk.level] }, { v: R0(r.suggestions[0]?.saving || 0), s: "n" }]));
    sheets.push({ name: "07_統計儀表板", colWidths: [34, 14, 10, 8, 12], rows: st });

    // 08 單價資料庫
    const pd = [[{ v: `單價資料庫 ${db.version}`, s: "t" }], [db.note], [], ["材料", "名稱", "密度 g/cm³", "NT$/kg", "切削性", "切料費"].map(H)];
    Object.entries(db.materials).forEach(([k, m]) => pd.push([k, m.name, m.density, { v: m.pricePerKg, s: "n" }, m.machinability, m.cutFee]));
    pd.push([], ["機台", "名稱", "費率 NT$/hr", "架模 min"].map(H));
    Object.entries(db.machines).forEach(([k, m]) => pd.push([k, m.name, { v: m.rate, s: "n" }, m.setupMin]));
    pd.push([], ["表面處理", "名稱", "計價單位", "單價", "每批最低"].map(H));
    Object.entries(db.surfaces).forEach(([k, s]) => pd.push([k, s.name, s.unit, s.price, s.lotMin]));
    pd.push([], ["熱處理", "名稱", "計價單位", "單價", "每批最低"].map(H));
    Object.entries(db.heatTreats).forEach(([k, s]) => pd.push([k, s.name, s.unit, s.price, s.lotMin]));
    pd.push([], ["其他", "參數", "值"].map(H),
      ["雷射切割", "每公尺 = max(最低, 基本 + 每mm × 板厚) × 材質係數", `max(${db.laser.minPerM || 0}, ${db.laser.basePerM} + ${db.laser.perMmPerM}×t)`],
      ["快走絲", "NT$/mm²", db.wireEdm.fast.perMm2], ["慢走絲", "NT$/mm²", db.wireEdm.slow.perMm2],
      ["折彎", "每折 / 每折架模", `${db.bending.perBend} / ${db.bending.setupPerBend}`],
      ["焊接 鐵/不鏽鋼/鋁", "NT$/m", `${db.welding.steel} / ${db.welding.sus} / ${db.welding.al}`],
      ["管銷", "比例", db.markup.overhead], ["利潤 最低/合理/急件", "比例", `${db.markup.profitLow} / ${db.markup.profitFair} / ${db.markup.profitRush}`]);
    pd.push([], ["資料來源", "內容", "網址"].map(H), ...(db.sources || []).map((s) => [s.item, { v: s.text, s: "wrap" }, s.url]));
    sheets.push({ name: "08_單價資料庫", colWidths: [16, 60, 50, 12, 10, 10], rows: pd });
    return sheets;
  }

  function rfqText(est, project = {}) {
    const { results, summary } = est;
    return [
      "【詢價單】",
      `專案名稱：${project.name || ""}`,
      `圖面數量：${summary.count} 張`,
      `交期需求：${project.dueDate || ""}`,
      `報價截止日：${project.quoteDeadline || ""}`,
      "",
      "請供應商回覆：",
      "1. 單件價格  2. 批量價格  3. 材料是否含料  4. 表面處理是否含",
      "5. 交期  6. 是否可配合修改圖面降本  7. 是否需提供 STEP / DXF / PDF",
      "",
      "品項：",
      ...results.map((r, i) => `${i + 1}. ${r.part.drawingNo} ${r.part.name}｜${r.part.material}｜${r.part.qty} 件｜表處：${r.part.surface}`),
      "",
      "附件：□ 製作圖 PDF □ 3D STEP □ 材料規範 □ 表面處理規範 □ 數量表",
    ].join("\n");
  }

  const API = { buildSheets, rfqText };
  if (isNode) module.exports = API; else root.Report = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
