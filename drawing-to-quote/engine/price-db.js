/*
 * 台灣南部（高雄／台南）加工成本單價資料庫，2026 Q4（不加價）
 * ------------------------------------------------------------------
 * 所有價格單位：新台幣 NT$。實際報價請以合作廠商報價回填校正。
 * 本檔可直接修改，或在網頁「單價設定」頁編輯後匯出 JSON 覆蓋。
 */
(function (root) {
  const PRICE_DB = {
    version: "南部-2026Q4",
    region: "台灣南部（高雄／台南）",
    currency: "NT$",
    note: "南部加工成本價（不加價：管銷 0%、利潤 0%）。依網路公開資料換算，未取得的項目沿用業界經驗值，請以實際詢價回填校正。",
    sources: [
      { item: "人工成本", text: "高雄 CNC 車床人員月薪約 35,000–45,000、傳統車床/銑床 27,500–31,500（求職網 2026）；2026 基本工資月薪 29,500、時薪 196（勞動部）", url: "https://www.mol.gov.tw/1607/1632/1633/87257/" },
      { item: "人工成本", text: "高雄 CNC/傳統車床職缺薪資", url: "https://www.yes123.com.tw/wk_index/joblist.asp?bb1=find&find_work_mode1=2_1012_0001_0006&s_find_work_mode1=%E8%BB%8A%E5%BA%8A%E4%BA%BA%E5%93%A1&find_zone_mode1=1_1001_0017_0000&s_find_zone_mode1=%E9%AB%98%E9%9B%84%E5%B8%82" },
      { item: "CNC 零售上限", text: "PRO360：CNC 車銑約 80–120 元/分鐘（單件零售、含利潤，作為上限參考）", url: "https://www.pro360.com.tw/price/cnc_milling" },
      { item: "雷射切割", text: "台中業者：SS41 1.2mm 約 12 元/米、6.0mm 約 108 元/米；最低出單 500 元；穿孔費 0.4–2 元；不鏽鋼≈鐵 1.7 倍、鋁≈2.7 倍（板厚係數法）", url: "https://www.zhongkai-laser.com/services" },
      { item: "雷射切割", text: "雷射切割計價方式（延米 × 板厚係數、穿孔另計）", url: "https://fiberglass-tubes.com/metal-laser-cutting/" },
      { item: "鋁材", text: "經濟部基本金屬監控平台：鋁板 1050/1mm 大盤價 2026/9 平均 193 元/kg；鋁 99.7% 出廠價 2026/6 平均 106.5 元/kg", url: "https://chart.metaltrade.tw/al/domestic/16/" },
      { item: "鋼材", text: "中鋼 2026/10、11 月盤熱軋/冷軋合計調漲約 1,500 元/噸", url: "https://www.storm.mg/article/11162043" },
      { item: "不鏽鋼", text: "燁聯 304 自 2026/8 起連四月調漲，累計 5,000 元/噸", url: "https://udn.com/news/story/7241/9845175" },
      { item: "S45C", text: "拍賣平台 S45C 圓棒零切列價，大尺寸約 80 元/kg（含零售利潤）", url: "https://biggo.com.tw/s/s45c+%E5%9C%93%E6%A3%92/" },
      { item: "線切割/熱處理/表處", text: "未找到台灣南部公開單價，沿用業界經驗值（請詢價校正）", url: "" },
    ],

    // ── 估價比例（可調）：成本 × 類別比例 × 整體比例 × 每張圖比例 ──
    ratio: { overall: 1.0, material: 1.0, machining: 1.0, outsource: 1.0 },

    // ── 管銷與利潤 ─────────────────────────────────────────────
    markup: {
      overhead: 0,        // 管銷費用（不加價模式 = 0）
      profitLow: -0.10,   // 議價下限：成本 -10%
      profitFair: 0,      // 估價 = 成本（不加價）
      profitRush: 0.30,   // 急件參考：+30%
      minOrder: 0,        // 單項最低出貨金額（不加價模式 = 0）
    },

    // ── 材料：密度 g/cm³、單價 NT$/kg、切削性指數（A6061 = 1.0）──
    // 單價為台灣材料行零切含稅前參考價；切料費另計 cutFee (每刀)
    materials: {
      "SS400":   { name: "SS400 一般鋼",       density: 7.85, pricePerKg: 36,   machinability: 0.45, cutFee: 20, group: "steel" },
      "S45C":    { name: "S45C 中碳鋼",        density: 7.85, pricePerKg: 58,   machinability: 0.38, cutFee: 20, group: "steel" },
      "S50C":    { name: "S50C 中碳鋼",        density: 7.85, pricePerKg: 62,   machinability: 0.35, cutFee: 20, group: "steel" },
      "SCM440":  { name: "SCM440 鉻鉬鋼",      density: 7.85, pricePerKg: 78,   machinability: 0.28, cutFee: 25, group: "steel" },
      "SUJ2":    { name: "SUJ2 軸承鋼",        density: 7.83, pricePerKg: 95,   machinability: 0.25, cutFee: 25, group: "steel" },
      "SKD11":   { name: "SKD11 冷作模具鋼",   density: 7.70, pricePerKg: 250,  machinability: 0.18, cutFee: 40, group: "tool" },
      "SKD61":   { name: "SKD61 熱作模具鋼",   density: 7.80, pricePerKg: 280,  machinability: 0.20, cutFee: 40, group: "tool" },
      "SUS303":  { name: "SUS303 易削不鏽鋼",  density: 7.93, pricePerKg: 150,  machinability: 0.30, cutFee: 30, group: "sus" },
      "SUS304":  { name: "SUS304 不鏽鋼",      density: 7.93, pricePerKg: 135,  machinability: 0.22, cutFee: 30, group: "sus" },
      "SUS316":  { name: "SUS316 不鏽鋼",      density: 7.98, pricePerKg: 195,  machinability: 0.19, cutFee: 30, group: "sus" },
      "A5052":   { name: "A5052 鋁合金",       density: 2.68, pricePerKg: 205,  machinability: 0.90, cutFee: 15, group: "al" },
      "A6061":   { name: "A6061-T6 鋁合金",    density: 2.70, pricePerKg: 215,  machinability: 1.00, cutFee: 15, group: "al" },
      "A6063":   { name: "A6063 鋁擠型",       density: 2.69, pricePerKg: 175,  machinability: 1.00, cutFee: 10, group: "al" },
      "A7075":   { name: "A7075-T651 航太鋁",  density: 2.81, pricePerKg: 330,  machinability: 0.90, cutFee: 20, group: "al" },
      "C3604":   { name: "C3604 快削黃銅",     density: 8.50, pricePerKg: 360,  machinability: 1.20, cutFee: 15, group: "cu" },
      "C1100":   { name: "C1100 紅銅",         density: 8.90, pricePerKg: 460,  machinability: 0.40, cutFee: 20, group: "cu" },
      "POM":     { name: "POM 塑鋼",           density: 1.41, pricePerKg: 190,  machinability: 1.30, cutFee: 10, group: "plastic" },
      "MC尼龍":  { name: "MC 尼龍",            density: 1.16, pricePerKg: 210,  machinability: 1.20, cutFee: 10, group: "plastic" },
      "PEEK":    { name: "PEEK 工程塑膠",      density: 1.31, pricePerKg: 6500, machinability: 0.80, cutFee: 20, group: "plastic" },
      "SPCC":    { name: "SPCC 冷軋鋼板",      density: 7.85, pricePerKg: 38,   machinability: 0.50, cutFee: 0,  group: "steel" },
      "SECC":    { name: "SECC 電鋅板",        density: 7.85, pricePerKg: 42,   machinability: 0.50, cutFee: 0,  group: "steel" },
      // 薄片／彈片常用材（2026Q4 南部參考，未取得公開報價，請以實際詢價校正）
      "SUS301":  { name: "SUS301 彈簧不鏽鋼",  density: 7.93, pricePerKg: 165,  machinability: 0.20, cutFee: 0,  group: "sus" },
      "SUS430":  { name: "SUS430 不鏽鋼",      density: 7.70, pricePerKg: 95,   machinability: 0.30, cutFee: 0,  group: "sus" },
      "SK85":    { name: "SK85(SK5) 彈簧鋼",   density: 7.85, pricePerKg: 70,   machinability: 0.30, cutFee: 0,  group: "steel" },
      "SPHC":    { name: "SPHC 熱軋鋼板",      density: 7.85, pricePerKg: 34,   machinability: 0.50, cutFee: 0,  group: "steel" },
      "SGCC":    { name: "SGCC 鍍鋅鋼板",      density: 7.85, pricePerKg: 44,   machinability: 0.50, cutFee: 0,  group: "steel" },
      "A1050":   { name: "A1050 純鋁板",       density: 2.71, pricePerKg: 195,  machinability: 0.90, cutFee: 0,  group: "al" },
      "C5191":   { name: "C5191 磷青銅",       density: 8.80, pricePerKg: 480,  machinability: 0.50, cutFee: 0,  group: "cu" },
      "PMMA":    { name: "壓克力 PMMA",        density: 1.19, pricePerKg: 220,  machinability: 1.20, cutFee: 0,  group: "plastic" },
      "PTFE":    { name: "鐵氟龍 PTFE",        density: 2.20, pricePerKg: 750,  machinability: 1.10, cutFee: 10, group: "plastic" },
      // ── 擴充材料（2026Q4 南部材料行零切經驗值；未取得公開報價者請以實際詢價校正）──
      "S20C":    { name: "S20C 低碳鋼",        density: 7.85, pricePerKg: 52,   machinability: 0.50, cutFee: 20, group: "steel" },
      "SCM415":  { name: "SCM415 滲碳鋼",      density: 7.85, pricePerKg: 75,   machinability: 0.40, cutFee: 25, group: "steel" },
      "SNCM439": { name: "SNCM439 鎳鉻鉬鋼",    density: 7.85, pricePerKg: 120,  machinability: 0.25, cutFee: 30, group: "steel" },
      "SK105":   { name: "SK105(SK3) 工具鋼",  density: 7.85, pricePerKg: 75,   machinability: 0.30, cutFee: 25, group: "tool" },
      "SKH51":   { name: "SKH51 高速鋼",       density: 8.15, pricePerKg: 900,  machinability: 0.12, cutFee: 60, group: "tool" },
      "P20":     { name: "P20(2311) 預硬塑膠模具鋼", density: 7.85, pricePerKg: 160, machinability: 0.35, cutFee: 40, group: "tool" },
      "NAK80":   { name: "NAK80 鏡面模具鋼",   density: 7.80, pricePerKg: 380,  machinability: 0.30, cutFee: 40, group: "tool" },
      "SUS420J2":{ name: "SUS420J2 麻田散不鏽鋼", density: 7.75, pricePerKg: 140, machinability: 0.30, cutFee: 30, group: "sus" },
      "SUS440C": { name: "SUS440C 高碳不鏽鋼", density: 7.75, pricePerKg: 260,  machinability: 0.18, cutFee: 35, group: "sus" },
      "SUS630":  { name: "SUS630(17-4PH) 析出硬化不鏽鋼", density: 7.78, pricePerKg: 330, machinability: 0.20, cutFee: 35, group: "sus" },
      "A2017":   { name: "A2017 硬鋁(杜拉鋁)", density: 2.79, pricePerKg: 260,  machinability: 1.00, cutFee: 15, group: "al" },
      "A2024":   { name: "A2024 超硬鋁",       density: 2.78, pricePerKg: 320,  machinability: 0.95, cutFee: 20, group: "al" },
      "A5083":   { name: "A5083 鋁鎂合金板",   density: 2.66, pricePerKg: 230,  machinability: 0.80, cutFee: 15, group: "al" },
      "FC250":   { name: "FC250 灰鑄鐵(連鑄棒)", density: 7.25, pricePerKg: 55,  machinability: 0.60, cutFee: 25, group: "steel" },
      "FCD450":  { name: "FCD450 球墨鑄鐵",    density: 7.10, pricePerKg: 65,   machinability: 0.45, cutFee: 25, group: "steel" },
      "C2801":   { name: "C2801 黃銅板",       density: 8.40, pricePerKg: 330,  machinability: 0.90, cutFee: 10, group: "cu" },
      "C1720":   { name: "C1720 鈹銅",         density: 8.25, pricePerKg: 2500, machinability: 0.35, cutFee: 30, group: "cu" },
      "TC4":     { name: "Ti-6Al-4V 鈦合金",   density: 4.43, pricePerKg: 1600, machinability: 0.12, cutFee: 60, group: "sus" },
      "UHMW":    { name: "UHMW-PE 超高分子量聚乙烯", density: 0.94, pricePerKg: 220, machinability: 1.10, cutFee: 10, group: "plastic" },
      "PP":      { name: "PP 聚丙烯",          density: 0.91, pricePerKg: 120,  machinability: 1.20, cutFee: 10, group: "plastic" },
      "PC":      { name: "PC 聚碳酸酯(耐力板)", density: 1.20, pricePerKg: 280, machinability: 1.00, cutFee: 10, group: "plastic" },
      "ABS":     { name: "ABS 塑膠",           density: 1.05, pricePerKg: 200,  machinability: 1.20, cutFee: 10, group: "plastic" },
      "BAKELITE":{ name: "電木(酚醛樹脂板)",   density: 1.40, pricePerKg: 260,  machinability: 0.70, cutFee: 10, group: "plastic" },
      "PU":      { name: "PU 聚氨酯(優力膠)",  density: 1.20, pricePerKg: 500,  machinability: 0.90, cutFee: 10, group: "plastic" },
      "PVC":     { name: "PVC 硬質塑膠板",     density: 1.40, pricePerKg: 110,  machinability: 1.20, cutFee: 10, group: "plastic" },
    },

    // 常用材料別名（圖面上常見寫法）
    materialAlias: {
      "AL5052": "A5052", "AL6061": "A6061", "6061": "A6061", "5052": "A5052", "7075": "A7075", "6063": "A6063",
      "SUS-304": "SUS304", "304": "SUS304", "316": "SUS316", "S45": "S45C", "45#": "S45C", "S50": "S50C",
      "SKD-11": "SKD11", "DC53": "SKD11", "黃銅": "C3604", "BRASS": "C3604", "銅": "C1100", "塑鋼": "POM",
"壓克力": "PMMA", "ACRYLIC": "PMMA", "鐵氟龍": "PTFE", "TEFLON": "PTFE", "SP": "SPCC", "SS41": "SS400",
      "SK5": "SK85", "SK-5": "SK85", "磷青銅": "C5191", "PBS": "C5191", "鍍鋅鋼板": "SGCC", "GI": "SGCC", "1050": "A1050", "熱軋": "SPHC", "彈簧鋼": "SK85",
      "鐵": "SS400", "A3": "SS400", "SS41": "SS400", "尼龍": "MC尼龍", "MC": "MC尼龍",
      "S20": "S20C", "SCM21": "SCM415", "SNCM8": "SNCM439", "4340": "SNCM439", "SK3": "SK105", "SKH9": "SKH51", "HSS": "SKH51", "高速鋼": "SKH51",
      "2311": "P20", "白鐵": "SUS304", "420": "SUS420J2", "440C": "SUS440C", "17-4PH": "SUS630", "630": "SUS630",
      "2017": "A2017", "杜拉鋁": "A2017", "2024": "A2024", "5083": "A5083", "鑄鐵": "FC250", "FC25": "FC250", "球墨鑄鐵": "FCD450", "FCD45": "FCD450",
      "黃銅板": "C2801", "鈹銅": "C1720", "鈦": "TC4", "TI6AL4V": "TC4", "GR5": "TC4", "超高分子": "UHMW", "UPE": "UHMW",
      "耐力板": "PC", "電木": "BAKELITE", "優力膠": "PU", "聚氨酯": "PU",
    },

    // ── 機台費率 NT$/hr（成本價）、標準架模時間 min ─────────────
    // 組成：人工（高雄月薪 3.5~4.5 萬 × 1.3 勞健保 ÷ 176 hr ≈ 260~330）+ 設備折舊 + 刀具耗材 + 電力廠租
    machines: {
      lathe_conv:   { name: "傳統車床",          rate: 450,  setupMin: 20 },
      cnc_lathe:    { name: "CNC 車床",          rate: 650,  setupMin: 30 },
      swiss:        { name: "走心式自動車床",    rate: 750,  setupMin: 240 },
      millturn:     { name: "車銑複合機",        rate: 1300, setupMin: 90 },
      mill_conv:    { name: "傳統銑床",          rate: 480,  setupMin: 20 },
      vmc3:         { name: "CNC 三軸綜合加工機", rate: 750,  setupMin: 45 },
      vmc5:         { name: "CNC 五軸加工機",    rate: 1800, setupMin: 120 },
      grind_surf:   { name: "平面研磨",          rate: 550,  setupMin: 20 },
      grind_cyl:    { name: "外圓/內孔研磨",     rate: 700,  setupMin: 30 },
      edm_sink:     { name: "放電加工 (含電極)", rate: 800, setupMin: 60 },
      drill_tap:    { name: "鑽孔攻牙機",        rate: 400,  setupMin: 15 },
      weld:         { name: "焊接 (MIG/TIG)",    rate: 600,  setupMin: 60 },
      bench:        { name: "鉗工/去毛邊/清洗",  rate: 350,  setupMin: 0 },
      saw:          { name: "型材鋸切",          rate: 350,  setupMin: 10 },
      // ── 擴充機台（南部代工經驗費率，含人工＋折舊＋耗材；請以實際詢價校正）──
      vmc_big:      { name: "龍門加工機",        rate: 1500, setupMin: 90 },
      hmc:          { name: "臥式綜合加工機",    rate: 1300, setupMin: 60 },
      boring:       { name: "搪床 (大孔精搪)",   rate: 900,  setupMin: 45 },
      gear_hob:     { name: "滾齒機",            rate: 900,  setupMin: 60 },
      keyseat:      { name: "插床/拉床 (鍵槽)",  rate: 600,  setupMin: 30 },
      hone:         { name: "搪磨 (內孔珩磨)",   rate: 800,  setupMin: 30 },
      lap:          { name: "研磨拋光 (手工)",   rate: 450,  setupMin: 0 },
      edm_hole:     { name: "細孔放電",          rate: 700,  setupMin: 20 },
      laser_mark:   { name: "雷射打標/刻字",     rate: 400,  setupMin: 10 },
      tumble:       { name: "震動研磨去毛邊",    rate: 300,  setupMin: 10 },
      inspect:      { name: "品檢 (三次元/量具)", rate: 900, setupMin: 10 },
      press:        { name: "壓床 (壓入/鉚合)",  rate: 450,  setupMin: 15 },
    },

    // ── 特徵標準工時（分鐘／個，A6061 基準；實際 × √難切係數）── 估價明細逐項列出
    ops: {
      drill:        { name: "鑽孔",              min: 0.8 },
      tap:          { name: "攻牙 (M3~M12)",     min: 1.2 },
      pt:           { name: "管牙 PT/NPT",       min: 2.5 },
      slot:         { name: "銑槽",              min: 4 },
      pocket:       { name: "口袋/凹槽",         min: 8 },
      deepHole:     { name: "深孔 (≥5D 啄鑽)",  min: 6 },
      crossHole:    { name: "交叉孔 (含去毛邊)", min: 5 },
      extThread:    { name: "車外牙",            min: 3 },
      groove:       { name: "退刀槽/溝槽",       min: 1.5 },
      reamHole:     { name: "精度孔 鉸孔/搪孔",  min: 3 },
      chamferPerM:  { name: "倒角 C 去銳角 (每公尺邊長)", min: 4 },
      fixturePerSetup: { name: "裝夾/校正 (每次)", min: 6 },
      inspectBase:  { name: "首件/尺寸檢驗",     min: 8 },
      keyway:       { name: "鍵槽 (插/銑)",      min: 12 },
      knurl:        { name: "滾花",              min: 3 },
      marking:      { name: "雷射刻字/打印",     min: 1.5 },
      gearPerTooth: { name: "滾齒 (每齒)",       min: 0.6 },
    },

    // ── 計件/計長型加工 ───────────────────────────────────────
    laser: {
      // 雷射切割：每公尺切割費 = (base + perMm × 板厚) × 材質係數；穿孔費每孔
      // 每公尺 = max(最低每米, 基本 + 每mm板厚 × t) × 材質係數（依台中實價 1.2mm≈12、6mm≈108 元/米擬合）
      basePerM: -12, perMmPerM: 20, minPerM: 10, pierce: 1.5, setup: 500,
      matFactor: { steel: 1.0, sus: 1.7, al: 2.7, cu: 3.0, tool: 1.2, plastic: 0.8 },
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
      // ── 擴充表面處理（委外經驗值）──
      "三價鉻鍍鋅": { name: "三價鉻鍍鋅 (環保)", unit: "kg",  price: 26,  lotMin: 400, groups: ["steel"] },
      "熱浸鍍鋅":   { name: "熱浸鍍鋅",          unit: "kg",   price: 18,  lotMin: 1500, groups: ["steel"] },
      "磷化":       { name: "磷酸鹽皮膜 (磷化)", unit: "kg",   price: 20,  lotMin: 400, groups: ["steel"] },
      "酸洗":       { name: "酸洗",              unit: "kg",   price: 12,  lotMin: 300 },
      "電著塗裝":   { name: "電著塗裝 (ED)",     unit: "dm2",  price: 8,   lotMin: 1000 },
      "PVD":        { name: "PVD 鍍鈦 (TiN/TiCN)", unit: "dm2", price: 60, lotMin: 1500 },
      "DLC":        { name: "DLC 類鑽碳鍍膜",    unit: "dm2",  price: 120, lotMin: 2500 },
      "化學拋光":   { name: "化學拋光",          unit: "dm2",  price: 12,  lotMin: 600 },
      "髮絲紋":     { name: "髮絲紋 (拉絲)",     unit: "dm2",  price: 10,  lotMin: 500 },
      "鍍銀":       { name: "鍍銀",              unit: "dm2",  price: 80,  lotMin: 1500, groups: ["cu"] },
      "鍍錫":       { name: "鍍錫",              unit: "dm2",  price: 15,  lotMin: 800, groups: ["cu", "steel"] },
      "鍍金":       { name: "鍍金 (薄金)",       unit: "dm2",  price: 300, lotMin: 3000, groups: ["cu"] },
    },
    surfaceAlias: { "黑色陽極": "黑陽極", "陽極處理": "陽極", "發黑": "染黑", "化學鎳": "無電解鎳", "硬鉻": "鍍硬鉻", "鍍鉻": "鍍硬鉻", "硬陽": "硬陽極", "": "無", "-": "無", "NONE": "無",
      "環保鍍鋅": "三價鉻鍍鋅", "熱鍍鋅": "熱浸鍍鋅", "皮膜": "磷化", "ED": "電著塗裝", "鍍鈦": "PVD", "TIN": "PVD", "拉絲": "髮絲紋", "HAIRLINE": "髮絲紋" },

    heatTreats: {
      "無":       { name: "無",                     unit: "none", price: 0,  lotMin: 0 },
      "調質":     { name: "調質 (淬火+高溫回火)",   unit: "kg",   price: 35, lotMin: 500 },
      "淬火回火": { name: "淬火回火",               unit: "kg",   price: 40, lotMin: 500 },
      "高周波":   { name: "高周波表面硬化",         unit: "kg",   price: 60, lotMin: 800 },
      "真空熱處理": { name: "真空熱處理 (SKD11/SKD61)", unit: "kg", price: 90, lotMin: 1200 },
      "滲碳":     { name: "滲碳淬火",               unit: "kg",   price: 70, lotMin: 1000 },
      "氮化":     { name: "氮化 / 軟氮化",           unit: "kg",   price: 65, lotMin: 1000 },
      "退火":     { name: "退火 (消除應力)",        unit: "kg",   price: 20, lotMin: 400 },
      // ── 擴充熱處理（委外經驗值）──
      "正常化":   { name: "正常化 (焼準)",          unit: "kg",   price: 22, lotMin: 400 },
      "固溶時效": { name: "固溶+時效 (SUS630/鋁 T6)", unit: "kg",  price: 80, lotMin: 1200 },
      "深冷":     { name: "深冷處理 (-196℃)",       unit: "kg",   price: 60, lotMin: 1000 },
      "火焰淬火": { name: "火焰表面淬火",           unit: "kg",   price: 45, lotMin: 800 },
      "鹽浴氮化": { name: "鹽浴軟氮化 (QPQ)",       unit: "kg",   price: 70, lotMin: 1000 },
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
