/*
 * 台灣本地加工單價資料庫（預設參考值，2026 Q4 中部/北部中小型加工廠行情）
 * ------------------------------------------------------------------
 * 所有價格單位：新台幣 NT$。實際報價請以合作廠商報價回填校正。
 * 本檔可直接修改，或在網頁「單價設定」頁編輯後匯出 JSON 覆蓋。
 */
(function (root) {
  const PRICE_DB = {
    version: "TW-2026Q4",
    currency: "NT$",
    note: "台灣中小型加工廠參考行情，含一般管銷前之成本價；請依實際詢價結果校正。",

    // ── 管銷與利潤 ─────────────────────────────────────────────
    markup: {
      overhead: 0.12,     // 管銷費用 (業務、運費、包裝)
      profitLow: 0.06,    // 單件最低（薄利）
      profitFair: 0.15,   // 合理估價
      profitRush: 0.30,   // 急件 / 少量上限
      minOrder: 300,      // 單項最低出貨金額 (每一料號每批)
    },

    // ── 材料：密度 g/cm³、單價 NT$/kg、切削性指數（A6061 = 1.0）──
    // 單價為台灣材料行零切含稅前參考價；切料費另計 cutFee (每刀)
    materials: {
      "SS400":   { name: "SS400 一般鋼",       density: 7.85, pricePerKg: 34,   machinability: 0.45, cutFee: 20, group: "steel" },
      "S45C":    { name: "S45C 中碳鋼",        density: 7.85, pricePerKg: 45,   machinability: 0.38, cutFee: 20, group: "steel" },
      "S50C":    { name: "S50C 中碳鋼",        density: 7.85, pricePerKg: 48,   machinability: 0.35, cutFee: 20, group: "steel" },
      "SCM440":  { name: "SCM440 鉻鉬鋼",      density: 7.85, pricePerKg: 62,   machinability: 0.28, cutFee: 25, group: "steel" },
      "SUJ2":    { name: "SUJ2 軸承鋼",        density: 7.83, pricePerKg: 85,   machinability: 0.25, cutFee: 25, group: "steel" },
      "SKD11":   { name: "SKD11 冷作模具鋼",   density: 7.70, pricePerKg: 230,  machinability: 0.18, cutFee: 40, group: "tool" },
      "SKD61":   { name: "SKD61 熱作模具鋼",   density: 7.80, pricePerKg: 260,  machinability: 0.20, cutFee: 40, group: "tool" },
      "SUS303":  { name: "SUS303 易削不鏽鋼",  density: 7.93, pricePerKg: 135,  machinability: 0.30, cutFee: 30, group: "sus" },
      "SUS304":  { name: "SUS304 不鏽鋼",      density: 7.93, pricePerKg: 125,  machinability: 0.22, cutFee: 30, group: "sus" },
      "SUS316":  { name: "SUS316 不鏽鋼",      density: 7.98, pricePerKg: 175,  machinability: 0.19, cutFee: 30, group: "sus" },
      "A5052":   { name: "A5052 鋁合金",       density: 2.68, pricePerKg: 145,  machinability: 0.90, cutFee: 15, group: "al" },
      "A6061":   { name: "A6061-T6 鋁合金",    density: 2.70, pricePerKg: 138,  machinability: 1.00, cutFee: 15, group: "al" },
      "A6063":   { name: "A6063 鋁擠型",       density: 2.69, pricePerKg: 130,  machinability: 1.00, cutFee: 10, group: "al" },
      "A7075":   { name: "A7075-T651 航太鋁",  density: 2.81, pricePerKg: 240,  machinability: 0.90, cutFee: 20, group: "al" },
      "C3604":   { name: "C3604 快削黃銅",     density: 8.50, pricePerKg: 340,  machinability: 1.20, cutFee: 15, group: "cu" },
      "C1100":   { name: "C1100 紅銅",         density: 8.90, pricePerKg: 420,  machinability: 0.40, cutFee: 20, group: "cu" },
      "POM":     { name: "POM 塑鋼",           density: 1.41, pricePerKg: 190,  machinability: 1.30, cutFee: 10, group: "plastic" },
      "MC尼龍":  { name: "MC 尼龍",            density: 1.16, pricePerKg: 210,  machinability: 1.20, cutFee: 10, group: "plastic" },
      "PEEK":    { name: "PEEK 工程塑膠",      density: 1.31, pricePerKg: 6500, machinability: 0.80, cutFee: 20, group: "plastic" },
      "SPCC":    { name: "SPCC 冷軋鋼板",      density: 7.85, pricePerKg: 36,   machinability: 0.50, cutFee: 0,  group: "steel" },
      "SECC":    { name: "SECC 電鋅板",        density: 7.85, pricePerKg: 40,   machinability: 0.50, cutFee: 0,  group: "steel" },
    },

    // 常用材料別名（圖面上常見寫法）
    materialAlias: {
      "AL5052": "A5052", "AL6061": "A6061", "6061": "A6061", "5052": "A5052", "7075": "A7075", "6063": "A6063",
      "SUS-304": "SUS304", "304": "SUS304", "316": "SUS316", "S45": "S45C", "45#": "S45C", "S50": "S50C",
      "SKD-11": "SKD11", "DC53": "SKD11", "黃銅": "C3604", "BRASS": "C3604", "銅": "C1100", "塑鋼": "POM",
      "鐵": "SS400", "A3": "SS400", "SS41": "SS400", "尼龍": "MC尼龍", "MC": "MC尼龍",
    },

    // ── 機台費率 NT$/hr、標準架模時間 min ─────────────────────
    machines: {
      lathe_conv:   { name: "傳統車床",          rate: 550,  setupMin: 20 },
      cnc_lathe:    { name: "CNC 車床",          rate: 850,  setupMin: 30 },
      swiss:        { name: "走心式自動車床",    rate: 950,  setupMin: 240 },
      millturn:     { name: "車銑複合機",        rate: 1600, setupMin: 90 },
      mill_conv:    { name: "傳統銑床",          rate: 600,  setupMin: 20 },
      vmc3:         { name: "CNC 三軸綜合加工機", rate: 950,  setupMin: 45 },
      vmc5:         { name: "CNC 五軸加工機",    rate: 2400, setupMin: 120 },
      grind_surf:   { name: "平面研磨",          rate: 700,  setupMin: 20 },
      grind_cyl:    { name: "外圓/內孔研磨",     rate: 900,  setupMin: 30 },
      edm_sink:     { name: "放電加工 (含電極)", rate: 1000, setupMin: 60 },
      drill_tap:    { name: "鑽孔攻牙機",        rate: 500,  setupMin: 15 },
      weld:         { name: "焊接 (MIG/TIG)",    rate: 750,  setupMin: 60 },
      bench:        { name: "鉗工/去毛邊/清洗",  rate: 450,  setupMin: 0 },
      saw:          { name: "型材鋸切",          rate: 450,  setupMin: 10 },
    },

    // ── 計件/計長型加工 ───────────────────────────────────────
    laser: {
      // 雷射切割：每公尺切割費 = (base + perMm × 板厚) × 材質係數；穿孔費每孔
      basePerM: 8, perMmPerM: 4, pierce: 2, setup: 300,
      matFactor: { steel: 1.0, sus: 1.6, al: 1.8, cu: 2.5, tool: 1.2, plastic: 1.0 },
      maxT: { steel: 25, sus: 20, al: 16, cu: 8, tool: 12, plastic: 20 },
    },
    waterjet: { perM_per10mm: 90, setup: 500 },               // 水刀：每公尺每 10mm 厚
    wireEdm: {
      // 線切割：切割面積 (切長 × 厚度) mm² 單價
      fast: { name: "快走絲線切割", perMm2: 0.045, setup: 300 },
      slow: { name: "慢走絲線切割", perMm2: 0.13,  setup: 500 },
    },
    bending: { perBend: 10, setupPerBend: 120, heavyFactorPerMm: 0.15 }, // 板厚>3mm 每mm加成
    welding: {
      // 每公尺焊道 (含點焊固定、修磨)
      steel: 450, sus: 850, al: 1100,
      stressRelief: 1500,   // 退火消除應力 (每批)
    },
    stamping: { dieBase: 35000, diePerBend: 9000, diePerHole: 1500, perStroke: 3, minQty: 500 },
    tapping: { normal: 6, pt: 15, deepHole: 35, crossHoleDeburr: 40 }, // 鑽孔攻牙機台外的人工附加

    // ── 表面處理（委外）：按 dm²、kg 或件計，每批最低收費 ───────
    surfaces: {
      "無":         { name: "無",                unit: "none", price: 0,   lotMin: 0 },
      "染黑":       { name: "染黑 (發黑)",       unit: "kg",   price: 28,  lotMin: 350, groups: ["steel", "tool"] },
      "鍍鋅":       { name: "電鍍鋅 (白/彩鋅)",  unit: "kg",   price: 22,  lotMin: 350, groups: ["steel"] },
      "鍍鎳":       { name: "電鍍鎳",            unit: "dm2",  price: 12,  lotMin: 600 },
      "無電解鎳":   { name: "無電解鎳 (化學鎳)", unit: "dm2",  price: 25,  lotMin: 900 },
      "鍍硬鉻":     { name: "鍍硬鉻",            unit: "dm2",  price: 45,  lotMin: 1200 },
      "陽極":       { name: "陽極處理 (本色)",   unit: "dm2",  price: 8,   lotMin: 500, groups: ["al"] },
      "黑陽極":     { name: "陽極處理 (黑色)",   unit: "dm2",  price: 10,  lotMin: 500, groups: ["al"] },
      "硬陽極":     { name: "硬質陽極",          unit: "dm2",  price: 30,  lotMin: 1200, groups: ["al"] },
      "噴砂":       { name: "噴砂",              unit: "dm2",  price: 5,   lotMin: 300 },
      "烤漆":       { name: "烤漆",              unit: "dm2",  price: 7,   lotMin: 600 },
      "粉體塗裝":   { name: "粉體塗裝",          unit: "dm2",  price: 9,   lotMin: 800 },
      "電解拋光":   { name: "電解拋光",          unit: "dm2",  price: 15,  lotMin: 800, groups: ["sus"] },
      "鈍化":       { name: "不鏽鋼鈍化",        unit: "kg",   price: 40,  lotMin: 500, groups: ["sus"] },
      "鐵氟龍":     { name: "鐵氟龍塗層",        unit: "dm2",  price: 35,  lotMin: 1500 },
      "研磨":       { name: "研磨 (見研磨製程)", unit: "none", price: 0,   lotMin: 0 },
    },
    surfaceAlias: { "黑色陽極": "黑陽極", "陽極處理": "陽極", "發黑": "染黑", "化學鎳": "無電解鎳", "硬鉻": "鍍硬鉻", "鍍鉻": "鍍硬鉻", "": "無", "-": "無", "NONE": "無" },

    heatTreats: {
      "無":       { name: "無",                     unit: "none", price: 0,  lotMin: 0 },
      "調質":     { name: "調質 (淬火+高溫回火)",   unit: "kg",   price: 35, lotMin: 500 },
      "淬火回火": { name: "淬火回火",               unit: "kg",   price: 40, lotMin: 500 },
      "高周波":   { name: "高周波表面硬化",         unit: "kg",   price: 60, lotMin: 800 },
      "真空熱處理": { name: "真空熱處理 (SKD11/SKD61)", unit: "kg", price: 90, lotMin: 1200 },
      "滲碳":     { name: "滲碳淬火",               unit: "kg",   price: 70, lotMin: 1000 },
      "氮化":     { name: "氮化 / 軟氮化",           unit: "kg",   price: 65, lotMin: 1000 },
      "退火":     { name: "退火 (消除應力)",        unit: "kg",   price: 20, lotMin: 400 },
    },

    // ── 公差/粗糙度對加工時間的加成 ───────────────────────────
    tolerance: {
      "一般": { factor: 1.00, label: "一般 (±0.1)",    finishGrind: false },
      "中等": { factor: 1.25, label: "中等 (±0.02~0.05)", finishGrind: false },
      "嚴":   { factor: 1.60, label: "嚴 (≤±0.01)",    finishGrind: true },
    },
    roughness: { "Ra6.3": 0.9, "Ra3.2": 1.0, "Ra1.6": 1.2, "Ra0.8": 1.5, "Ra0.4": 2.0 },

    // ── 切削去除率 (cm³/min，以 A6061=1.0 為基準，乘材料切削性) ─
    mrr: { turnRough: 45, millRough: 35, finishTurnCm2PerMin: 30, finishMillCm2PerMin: 22 },

    // 批量分級
    qtyTiers: [1, 5, 10, 50, 100, 500],
  };

  if (typeof module !== "undefined" && module.exports) module.exports = PRICE_DB;
  else root.PRICE_DB = PRICE_DB;
})(typeof globalThis !== "undefined" ? globalThis : this);
