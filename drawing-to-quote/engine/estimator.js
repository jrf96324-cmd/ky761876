/*
 * Drawing-to-Quote 多元製程估價引擎
 * ------------------------------------------------------------------
 * 輸入：零件資料（圖號、材料、外形、尺寸、特徵、公差、表處、數量）
 * 輸出：每個零件的多條可行製程路線（各含材料/加工/委外/管銷明細）、
 *       推薦路線、風險等級、降本建議（以實際重算差額表示）、批量分級價。
 */
(function (root) {
  const DB_DEFAULT = (typeof module !== "undefined" && module.exports) ? require("./price-db.js") : root.PRICE_DB;

  // ───────────────────────── 工具函式 ─────────────────────────
  const num = (v, d = 0) => { const n = parseFloat(String(v ?? "").replace(/[, ]/g, "")); return Number.isFinite(n) ? n : d; };
  const round = (v, d = 0) => { const p = 10 ** d; return Math.round(v * p) / p; };
  const ceilTo = (v, step) => Math.ceil(v / step) * step;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /** 數量 "2+2" / "4 PCS" / "2組x3" → 數字 */
  function parseQty(q) {
    if (typeof q === "number") return Math.max(1, Math.round(q));
    const s = String(q || "1").toUpperCase().replace(/PCS|EA|個|件|支|片|SET|組/g, "");
    if (/[X×*]/.test(s)) return Math.max(1, s.split(/[X×*]/).map((x) => num(x, 1)).reduce((a, b) => a * b, 1));
    return Math.max(1, Math.round(s.split("+").map((x) => num(x, 0)).reduce((a, b) => a + b, 0)) || 1);
  }

  function resolveMaterial(db, m) {
    const key = String(m || "").trim().toUpperCase().replace(/\s+/g, "");
    if (db.materials[key]) return key;
    for (const k of Object.keys(db.materials)) if (k.toUpperCase() === key) return k;
    if (db.materialAlias[key]) return db.materialAlias[key];
    for (const [a, k] of Object.entries(db.materialAlias).sort((x, y) => y[0].length - x[0].length)) if (key.includes(a.toUpperCase())) return k; // 長的別名先比（「鑄鐵」優先於「鐵」）
    for (const k of Object.keys(db.materials)) if (key.includes(k.toUpperCase())) return k;
    return null;
  }
  function resolveKey(table, alias, v) {
    const s = String(v ?? "").trim();
    if (table[s]) return s;
    if (alias && alias[s.toUpperCase()] !== undefined) return alias[s.toUpperCase()];
    if (alias && alias[s] !== undefined) return alias[s];
    for (const k of Object.keys(table)) if (s && (s.includes(k) || k.includes(s))) return k;
    return s ? null : "無";
  }

  // ───────────────────────── 零件正規化 ─────────────────────────
  const SHAPES = {
    round: "圓件/軸件/環件",
    block: "方塊/治具/分流塊",
    plate: "厚板件/外形輪廓",
    sheet: "薄板／鈑金件",
    frame: "架構件/焊接件",
  };
  const SHAPE_ALIAS = { "圓": "round", "軸": "round", "環": "round", "輪": "round", "方": "block", "塊": "block", "治具": "block",
    "板金": "sheet", "鈑金": "sheet", "薄板": "sheet", "板": "plate", "架": "frame", "焊": "frame" };

  function normalizePart(raw, db = DB_DEFAULT) {
    const p = {
      drawingNo: String(raw.drawingNo ?? raw["圖號"] ?? "").trim(),
      cadNo: String(raw.cadNo ?? raw["CAD NO"] ?? raw["CAD"] ?? "").trim(),
      name: String(raw.name ?? raw["零件名稱"] ?? raw["品名"] ?? "").trim(),
      desc: String(raw.desc ?? raw["圖名說明"] ?? "").trim(),
      materialInput: String(raw.material ?? raw["材料"] ?? "").trim(),
      qtyInput: raw.qty ?? raw["數量"] ?? 1,
      shapeInput: String(raw.shape ?? raw["外形"] ?? "").trim(),
      L: num(raw.L ?? raw["長L"]), W: num(raw.W ?? raw["寬W"]), H: num(raw.H ?? raw["高H"]),
      OD: num(raw.OD ?? raw["外徑OD"]), ID: num(raw.ID ?? raw["內徑ID"]), T: num(raw.T ?? raw["板厚T"]),
      solidity: num(raw.solidity ?? raw["實體率%"], 0) / 100,
      netWeightKg: num(raw.netWeightKg ?? raw["淨重kg"], 0),
      holes: num(raw.holes ?? raw["孔數"]), taps: num(raw.taps ?? raw["攻牙數"]), ptTaps: num(raw.ptTaps ?? raw["PT牙數"]),
      slots: num(raw.slots ?? raw["槽數"]), pockets: num(raw.pockets ?? raw["口袋數"]),
      deepHoles: num(raw.deepHoles ?? raw["深孔數"]), crossHoles: num(raw.crossHoles ?? raw["交叉孔數"]),
      sharpCorners: num(raw.sharpCorners ?? raw["內直角數"]), extThreads: num(raw.extThreads ?? raw["外螺紋數"]),
      grooves: num(raw.grooves ?? raw["退刀槽數"]), faces: num(raw.faces ?? raw["加工面數"]), reamHoles: num(raw.reamHoles ?? raw["精度孔數"]),
      bends: num(raw.bends ?? raw["折彎數"]), weldMm: num(raw.weldMm ?? raw["焊道長mm"]),
      cutMm: num(raw.cutMm ?? raw["雷切周長mm"]),
      tolerance: String(raw.tolerance ?? raw["公差"] ?? "一般").trim() || "一般",
      roughness: String(raw.roughness ?? raw["粗糙度"] ?? "Ra3.2").trim() || "Ra3.2",
      surfaceInput: String(raw.surface ?? raw["表面處理"] ?? "").trim(),
      heatInput: String(raw.heat ?? raw["熱處理"] ?? "").trim(),
      notes: String(raw.notes ?? raw["備註"] ?? "").trim(),
      source: String(raw.source ?? raw["辨識來源"] ?? "").trim(),
      verified: String(raw.verified ?? raw["尺寸驗證"] ?? "").trim(),
      ratio: (num(raw.ratio ?? raw["估價比例%"], 100) || 100) / 100,
      warnings: [],
    };
    p.qty = parseQty(p.qtyInput);
    p.material = resolveMaterial(db, p.materialInput);
    if (!p.material) { p.warnings.push(`材料「${p.materialInput || "未填"}」無法辨識，暫以 SS400 估算`); p.material = "SS400"; p.materialMissing = true; }
    p.surface = resolveKey(db.surfaces, db.surfaceAlias, p.surfaceInput);
    if (!p.surface) { p.warnings.push(`表面處理「${p.surfaceInput}」無對應單價，暫不計`); p.surface = "無"; p.surfaceUnknown = true; }
    if (!p.surfaceInput) p.surfaceBlank = true;
    p.heat = resolveKey(db.heatTreats, null, p.heatInput) || "無";
    if (!db.tolerance[p.tolerance]) p.tolerance = /嚴|0\.0[01]|精/.test(p.tolerance) ? "嚴" : /中/.test(p.tolerance) ? "中等" : "一般";
    if (!db.roughness[p.roughness]) p.roughness = "Ra3.2";

    // 外形判斷：使用者指定 → 依尺寸推斷（對應文件「四、製程判斷邏輯」）
    let shape = SHAPES[p.shapeInput] ? p.shapeInput : null;
    if (!shape) for (const [k, v] of Object.entries(SHAPE_ALIAS)) if (p.shapeInput.includes(k) || p.name.includes(k)) { shape = v; break; }
    if (!shape) {
      if (p.OD > 0) shape = "round";
      else if (p.bends > 0) shape = "sheet";
      else if (p.weldMm > 0) shape = "frame";
      else if (p.T > 0 && p.T <= 6) shape = "sheet";
      else if (p.T > 0 || (p.H > 0 && p.H < Math.min(p.L, p.W) * 0.25)) shape = "plate";
      else shape = "block";
    }
    p.shape = shape;
    if (shape === "plate" && !p.T) { p.T = p.H || 10; if (!p.H) p.warnings.push("板厚未填，暫以 10mm 估算，請補板厚"); }
    if (shape === "sheet" && !p.T) { if (p.H > 0 && p.H <= 6) p.T = p.H; else { p.T = 2; p.warnings.push("板厚未填，暫以 2mm 估算，請補板厚"); } }
    if ((shape === "plate" || shape === "sheet") && !p.H) p.H = p.T;
    if (shape === "round" && !p.L) p.L = p.H;
    if (!p.solidity) p.solidity = { round: 1.0, block: 0.7, plate: 0.85, sheet: 0.9, frame: 0.25 }[shape];
    if (!p.faces) p.faces = { round: 2, block: 3, plate: 2, sheet: 1, frame: 4 }[shape];
    if (!p.L || (shape !== "round" && !p.W) || (shape === "round" && !p.OD)) { p.warnings.push("主要尺寸不足，估價可信度低"); p.dimMissing = true; }
    // 穩定性：缺尺寸時依外形補合理預設值（並記錄），確保一定算得出價格、不會是 0
    p.fallback = [];
    const fb = (k, v, why) => { if (!(p[k] > 0)) { p[k] = Math.round(v * 10) / 10; p.fallback.push(`${{ L: "長L", W: "寬W", H: "高H", OD: "外徑OD", T: "板厚T" }[k]}≈${p[k]}（${why}）`); } };
    if (shape === "round") { if (!p.OD && p.L) fb("OD", Math.max(p.W, p.H) || p.L * 0.3, "未讀到外徑"); if (!p.L && p.OD) fb("L", p.OD * 0.8, "未讀到長度"); if (!p.L && !p.OD) { fb("OD", 50, "尺寸不足"); fb("L", 50, "尺寸不足"); } }
    else {
      if (!p.L) fb("L", Math.max(p.W, p.H, 100), "尺寸不足");
      if (!p.W) fb("W", p.L * 0.5, "未讀到寬度");
      if (shape === "block" || shape === "frame") fb("H", shape === "frame" ? Math.min(p.L, p.W) : Math.min(p.L, p.W) * 0.5, "未讀到高度");
      if ((shape === "plate" || shape === "sheet") && !p.T) fb("T", shape === "sheet" ? 2 : 10, "未讀到板厚");
      if ((shape === "plate" || shape === "sheet") && !p.H) p.H = p.T;
    }
    if (p.fallback.length) p.warnings.push("以預設值估算：" + p.fallback.join("、"));
    if (p.L > 0 && p.W > 0 && shape !== "round" && p.W > p.L) [p.L, p.W] = [p.W, p.L]; // 長 ≥ 寬
    return p;
  }

  // ───────────────────────── 幾何計算 ─────────────────────────
  const STD_BAR = [6, 8, 10, 12, 13, 16, 19, 20, 22, 25, 28, 30, 32, 35, 38, 40, 42, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 250, 280, 300];
  function stdBar(d) { return STD_BAR.find((s) => s >= d) || ceilTo(d, 10); }

  function geometry(p, db) {
    const mat = db.materials[p.material];
    const rho = mat.density; // g/cm³
    const g = {};
    if (p.shape === "round") {
      g.stockD = stdBar(p.OD + 3); g.stockL = p.L + 5 + 3; // 端面餘量 + 切斷刀寬
      g.stockVol = Math.PI / 4 * g.stockD ** 2 * g.stockL / 1000;      // cm³
      const outer = Math.PI / 4 * p.OD ** 2 * p.L / 1000, inner = Math.PI / 4 * p.ID ** 2 * p.L / 1000;
      g.partVol = (outer - inner) * Math.min(1, p.solidity);
      g.areaDm2 = (Math.PI * p.OD * p.L + Math.PI * p.ID * p.L + 2 * Math.PI / 4 * (p.OD ** 2 - p.ID ** 2)) / 1e4;
      g.finishTurnCm2 = (Math.PI * p.OD * p.L + Math.PI * p.ID * p.L + Math.PI / 2 * (p.OD ** 2 - p.ID ** 2)) / 100;
      g.outline = `Ø${p.OD}${p.ID ? "/Ø" + p.ID : ""}×${p.L}`;
      g.stock = `圓棒 Ø${g.stockD} × ${g.stockL}`;
    } else if (p.shape === "sheet") {
      const t = p.T;
      // 折彎成形件（高H 遠大於板厚）：依折數估展開尺寸 —— 1 折 L 型：長×(寬+高)；2 折 U 型：長×(寬+2高)；
      // ≥3 折盒／罩：(長+2高)×(寬+2高)（未扣折彎伸長量，偏保守）
      const formed = p.H > Math.max(3 * t, 6), nb = p.bends || 4;
      const bl = formed && nb >= 3 ? round(p.L + 2 * p.H, 1) : p.L, bw = formed ? round(p.W + (nb >= 2 ? 2 : 1) * p.H, 1) : p.W;
      g.blank = { L: bl, W: bw };
      g.stockVol = bl * bw * t / 1000 / 0.8; // 排版利用率 80%
      g.partVol = bl * bw * t / 1000 * p.solidity;
      g.cutMm = p.cutMm || 2 * (bl + bw) + p.holes * Math.PI * 8 + p.slots * 60;
      g.areaDm2 = 2 * bl * bw * p.solidity / 1e4;
      g.outline = formed ? `${p.L}×${p.W}×H${p.H} t${t}` : `${p.L}×${p.W}×t${t}`;
      g.stock = formed ? `板材展開 ${bl}×${bw}×t${t}（成形 ${p.L}×${p.W}×H${p.H}，排版利用率 80%）` : `板材 ${p.L}×${p.W}×t${t}（排版利用率 80%）`;
    } else if (p.shape === "frame") {
      const env = p.L * p.W * p.H / 1000;
      g.partVol = p.netWeightKg ? p.netWeightKg * 1000 / rho : env * p.solidity * 0.15; // 架構件實際材積遠小於包絡
      g.stockVol = g.partVol * 1.12;
      g.areaDm2 = g.partVol * 1000 / 5 / 1e4 * 2 + 2 * (p.L * p.W + p.L * p.H + p.W * p.H) / 1e4 * 0.15;
      g.outline = `${p.L}×${p.W}×${p.H} (架構)`;
      g.stock = p.netWeightKg ? `型材約 ${p.netWeightKg} kg` : "型材（依重量估算）";
    } else { // block / plate
      const sL = p.L + 6, sW = p.W + 6, sH = (p.H || p.T) + 3;
      g.stockVol = sL * sW * sH / 1000;
      g.partVol = p.L * p.W * (p.H || p.T) / 1000 * p.solidity;
      g.areaDm2 = 2 * (p.L * p.W + p.L * (p.H || p.T) + p.W * (p.H || p.T)) / 1e4;
      g.finishMillCm2 = 2 * (p.L * p.W) / 100 + (p.faces > 2 ? 2 * (p.L + p.W) * (p.H || p.T) / 100 : 0);
      g.cutMm = p.cutMm || 2 * (p.L + p.W);
      g.outline = `${p.L}×${p.W}×${p.H || p.T}`;
      g.stock = `${p.shape === "plate" ? "厚板" : "方料"} ${+(sL).toFixed(1)}×${+(sW).toFixed(1)}×${+(sH).toFixed(1)}（各邊加工餘量）`;
    }
    if (p.netWeightKg && p.shape !== "frame") g.partVol = p.netWeightKg * 1000 / rho;
    g.removeVol = Math.max(0, g.stockVol - g.partVol);
    // 計算檢核
    if (p.shape !== "frame" && g.stockVol * rho / 1000 > 300 && !p.__checked) p.warnings.push(`胚料約 ${Math.round(g.stockVol * rho / 1000)} kg，請確認尺寸單位或外形分類（是否為架構件）`);
    if (p.shape === "frame" && !p.netWeightKg && !p.__checked) p.warnings.push("架構件重量為估算值，建議填「淨重kg」提高準確度");
    if (p.shape === "round" && p.ID && p.ID >= p.OD) p.warnings.push("內徑 ≥ 外徑，請確認");
    p.__checked = true;
    g.stockKg = g.stockVol * rho / 1000;
    g.partKg = g.partVol * rho / 1000;
    return g;
  }

  // ───────────────────────── 成本元件 ─────────────────────────
  const laserPerM = (db, t) => Math.max(db.laser.minPerM || 0, db.laser.basePerM + db.laser.perMmPerM * t);
  function hr(db, machineKey, runMin, setupMin, label) {
    const m = db.machines[machineKey];
    const setup = setupMin ?? m.setupMin;
    return { type: "machine", process: label || m.name, machine: m.name, rate: m.rate, runMin, setupMin: setup,
      runCost: runMin / 60 * m.rate, setupCost: setup / 60 * m.rate };
  }
  function lot(process, runCost, setupCost, detail) { return { type: "piece", process, runCost, setupCost, detail }; }

  function materialCost(p, g, db, override) {
    const mat = db.materials[p.material];
    const kg = override?.kg ?? g.stockKg;
    return { type: "material", process: `材料 ${mat.name}`, kg, runCost: kg * mat.pricePerKg + (override?.cuts ?? 1) * mat.cutFee, setupCost: 0,
      detail: `${round(kg, 3)} kg × ${mat.pricePerKg} + 切料 ${mat.cutFee}` };
  }

  function finishFactors(p, db) {
    return { tol: db.tolerance[p.tolerance].factor, ra: db.roughness[p.roughness] };
  }

  // 特徵標準工時（分鐘／個）：優先取單價資料庫 ops，缺項用內建值
  const OPS_DEF = { drill: 0.8, tap: 1.2, pt: 2.5, slot: 4, pocket: 8, deepHole: 6, crossHole: 5, extThread: 3, groove: 1.5, reamHole: 3,
    chamferPerM: 4, fixturePerSetup: 6, inspectBase: 8, keyway: 12, knurl: 3, marking: 1.5, gearPerTooth: 0.6 };
  const opMin = (db, k) => (db.ops && db.ops[k] && Number.isFinite(db.ops[k].min) ? db.ops[k].min : OPS_DEF[k]);
  /** 每個特徵一列（鑽孔、攻牙、銑槽…），乘以材料難切係數 k；group＝工序比對欄位 */
  function featureParts(p, k, db, opts = {}) {
    const P = [];
    const f = (n, key, label, group) => { if (n > 0) P.push({ label: `${label} ×${n}`, min: n * opMin(db, key) * k, group, detail: `${n} 處 × ${opMin(db, key)} 分 × 難切係數 ${round(k, 2)}` }); };
    f(p.holes, "drill", "鑽孔", "鑽孔攻牙");
    f(p.reamHoles, "reamHole", "精度孔 鉸孔/搪孔", "鑽孔攻牙");
    f(p.taps, "tap", "攻牙", "鑽孔攻牙");
    f(p.ptTaps, "pt", "管牙 PT/NPT", "鑽孔攻牙");
    f(p.deepHoles, "deepHole", "深孔啄鑽", "鑽孔攻牙");
    f(p.crossHoles, "crossHole", "交叉孔", "鑽孔攻牙");
    f(p.slots, "slot", "銑槽", "銑削");
    f(p.pockets, "pocket", "口袋/凹槽", "銑削");
    if (!opts.noTurn) { f(p.extThreads, "extThread", "車外牙", "車削"); f(p.grooves, "groove", "退刀槽/溝槽", "車削"); }
    return P;
  }
  const sumMin = (P) => P.reduce((a, x) => a + x.min, 0);
  function featureMin(p, mc, db = DB_DEFAULT, opts) { return sumMin(featureParts(p, mc, db, opts)); }
  /** 同一機台的工時拆成多個步驟列出（架模只算在第一列），合計與整段計算相同 */
  function machineSteps(db, key, parts, setupMin, scale = 1, prefix) {
    const m = db.machines[key], ps = parts.filter((x) => x.min > 0.005);
    if (!ps.length) ps.push({ label: "加工", min: 0.5 });
    return ps.map((x, i) => ({ ...hr(db, key, x.min * scale, i === 0 ? (setupMin ?? m.setupMin) : 0, `${prefix || m.name}：${x.label}`),
      group: x.group, detail: x.detail ? x.detail + (scale !== 1 ? `，× ${round(scale, 2)}（此路線效率）` : "") : undefined }));
  }

  function surfaceAndHeat(p, g, db) {
    const items = [];
    const s = db.surfaces[p.surface];
    if (s && s.unit !== "none") {
      const per = s.unit === "kg" ? g.partKg * s.price : g.areaDm2 * s.price;
      items.push(lot(`表處 ${s.name}`, per, s.lotMin, `${s.unit === "kg" ? round(g.partKg, 2) + " kg" : round(g.areaDm2, 2) + " dm²"} × ${s.price}，每批最低 ${s.lotMin}`));
      items[items.length - 1].lotMin = s.lotMin; items[items.length - 1].outsource = true;
    }
    const h = db.heatTreats[p.heat];
    if (h && h.unit !== "none") {
      items.push(lot(`熱處理 ${h.name}`, g.partKg * 1.1 * h.price, h.lotMin, `${round(g.partKg, 2)} kg × ${h.price}，每批最低 ${h.lotMin}`));
      items[items.length - 1].lotMin = h.lotMin; items[items.length - 1].outsource = true;
    }
    return items;
  }

  function grindingOps(p, g, db, mc) {
    const ops = [];
    const needGrind = db.tolerance[p.tolerance].finishGrind || p.roughness === "Ra0.4" || p.surface === "研磨";
    if (!needGrind) return ops;
    if (p.shape === "round") {
      const cm2 = Math.PI * p.OD * p.L / 100 + (p.ID ? Math.PI * p.ID * p.L / 100 : 0);
      ops.push(hr(db, "grind_cyl", cm2 / 12 / Math.max(mc, 0.5) + 5, null, "外圓/內孔研磨"));
    } else {
      const cm2 = 2 * p.L * p.W / 100;
      ops.push(hr(db, "grind_surf", cm2 / 25 + 6, null, "平面研磨"));
    }
    return ops;
  }

  // ───────────────────────── 製程路線產生 ─────────────────────────
  function routesFor(p, db) {
    const g = geometry(p, db);
    const mat = db.materials[p.material];
    const mc = 1 / mat.machinability;            // 難切係數
    const { tol, ra } = finishFactors(p, db);
    const feat = featureMin(p, Math.sqrt(mc), db);
    const post = surfaceAndHeat(p, g, db);
    const grind = grindingOps(p, g, db, mat.machinability);
    // 去毛邊／倒角：圖面「未標示銳角皆以 C 去除」→ 依外形邊長計（每公尺 chamferPerM 分）
    const edgeM = (p.shape === "round" ? Math.PI * (2 * p.OD + (p.ID ? 2 * p.ID : 0)) : p.shape === "sheet" ? 2 * ((g.blank ? g.blank.L : p.L) + (g.blank ? g.blank.W : p.W)) : p.shape === "frame" ? 0 : 4 * (p.L + p.W + (p.H || p.T || 0))) / 1000;
    const chamMin = edgeM * opMin(db, "chamferPerM") * Math.sqrt(mc) * (p.shape === "sheet" ? 0.5 : 1);
    const deburr = { ...hr(db, "bench", 2 + (p.crossHoles + p.deepHoles) * 3 + (p.ptTaps ? 2 : 0) + chamMin, 0, `去毛邊/倒角去銳角/清洗（邊長 ${round(edgeM, 2)} m）`), group: "去毛邊清洗",
      detail: `基本 2 分 + 交叉/深孔 ${(p.crossHoles + p.deepHoles) * 3} 分 + 倒角 ${round(edgeM, 2)} m × ${opMin(db, "chamferPerM")} 分/m` };
    // 品檢：中等公差逐項量測、嚴公差三次元量測
    const nFeat = p.holes + p.taps + p.ptTaps + p.slots + p.pockets + (p.reamHoles || 0);
    const inspMin = p.tolerance === "嚴" ? opMin(db, "inspectBase") * 2 + nFeat * 1 : p.tolerance === "中等" ? opMin(db, "inspectBase") + nFeat * 0.5 : 0;
    const inspect = inspMin ? [{ ...hr(db, "inspect", inspMin, 10, p.tolerance === "嚴" ? `品檢：三次元量測（${nFeat} 特徵）` : `品檢：尺寸檢驗（${nFeat} 特徵）`), group: "品檢" }] : [];
    // 備註／品名關鍵字帶出的附加工序：鍵槽、滾齒、刻字（滾花併入車削）
    const NT = `${p.notes} ${p.name} ${p.desc}`;
    const kw = /鍵槽|KEYWAY|KEY\s*SEAT/i.test(NT) ? (+(NT.match(/(\d+)\s*[-xX×]?\s*(?:處)?\s*鍵槽/) || [])[1] || 1) : 0;
    const gm = NT.match(/(?:齒數|Z\s*[=＝])\s*(\d{1,3})/i), gearT = gm ? +gm[1] : /齒輪|GEAR|模數|MODULE/i.test(NT) ? 20 : 0;
    const knurl = /滾花|KNURL/i.test(NT) ? 1 : 0, mark = /刻字|打印|雷雕|打標|刻印|LASER\s*MARK/i.test(NT) ? 1 : 0;
    const extra = [
      ...(kw ? [{ ...hr(db, "keyseat", kw * opMin(db, "keyway") * Math.sqrt(mc), null, `插床/拉床：鍵槽 ×${kw}`), group: "銑削" }] : []),
      ...(gearT ? [{ ...hr(db, "gear_hob", gearT * opMin(db, "gearPerTooth") * Math.sqrt(mc) + 5, null, `滾齒機：滾齒 Z${gearT}`), group: "其他", detail: gm ? "" : "未讀到齒數，暫以 20 齒估" }] : []),
      ...(mark ? [{ ...hr(db, "laser_mark", opMin(db, "marking"), null, "雷射刻字/打印"), group: "其他" }] : []),
    ];
    const R = [];
    const add = (id, name, desc, ops, opts = {}) => R.push({ id, name, desc, ops: [...ops, ...extra, ...inspect, ...post], ...opts });
    const edmOps = p.sharpCorners > 0 ? [hr(db, "edm_sink", p.sharpCorners * 25 * Math.sqrt(mc), 60, `放電清角 ×${p.sharpCorners}`)] : [];

    if (p.shape === "round") {
      const roughMin = g.removeVol / (db.mrr.turnRough * mat.machinability);
      const finMin = g.finishTurnCm2 / db.mrr.finishTurnCm2PerMin * tol * ra / Math.sqrt(mat.machinability);
      const turnParts = [
        { label: `粗車（移除 ${round(g.removeVol, 1)} cm³）`, min: roughMin, group: "車削", detail: `${round(g.removeVol, 1)} cm³ ÷ (${db.mrr.turnRough} cm³/min × 切削性 ${mat.machinability})` },
        { label: `精車外徑/內孔/端面（${round(g.finishTurnCm2)} cm²）`, min: finMin, group: "車削", detail: `${round(g.finishTurnCm2)} cm² ÷ ${db.mrr.finishTurnCm2PerMin} × 公差 ${tol} × 粗糙度 ${ra}` },
        ...(p.grooves ? [{ label: `退刀槽/溝槽 ×${p.grooves}`, min: p.grooves * opMin(db, "groove"), group: "車削" }] : []),
        ...(p.extThreads ? [{ label: `車外牙 ×${p.extThreads}`, min: p.extThreads * opMin(db, "extThread") * Math.sqrt(mc), group: "車削" }] : []),
        ...(knurl ? [{ label: "滾花", min: opMin(db, "knurl"), group: "車削" }] : []),
        { label: `端面/切斷/調頭 ×${p.faces}`, min: 2 * p.faces / 2 + 1.5, group: "車削", detail: `${p.faces} 面 × 1 分 + 切斷 1.5 分` },
      ];
      const offAxis = p.holes + p.taps + p.ptTaps + p.slots + p.pockets + p.crossHoles + (p.reamHoles || 0);
      const millParts = offAxis ? [...featureParts(p, Math.sqrt(mc), db, { noTurn: true }), { label: "分度/裝夾校正", min: 4, group: "銑削" }] : [];
      const base = [materialCost(p, g, db)];
      add("R1", "CNC 車削" + (offAxis ? " + 三軸銑 (二次加工)" : ""), "標準路線：CNC 車床完成外徑/內徑/端面，偏心孔、槽、攻牙移至綜合加工機。",
        [...base, ...machineSteps(db, "cnc_lathe", turnParts), ...(offAxis ? machineSteps(db, "vmc3", [...millParts, { label: "上下料", min: 3, group: "銑削" }], 40, 1, "三軸銑（二次加工）") : []), ...grind, ...edmOps, deburr]);
      if (offAxis) add("R2", "車銑複合一次完成", "一次裝夾完成車、銑、鑽、攻，同心度與位置度佳；適合中量、位置公差嚴。",
        [...base, ...machineSteps(db, "millturn", [...turnParts, ...millParts], null, 0.85), ...grind, ...edmOps, deburr]);
      if (p.OD <= 32 && p.L <= 200) add("R3", "走心機/自動車床 (量產)", "小徑長軸件量產路線，架機時間長，適合 ≥500 件。",
        [...base, ...machineSteps(db, "swiss", [...turnParts, ...millParts], null, 0.45), ...grind, deburr], { minQty: 200 });
      if (p.tolerance === "一般" && !offAxis && p.extThreads === 0 && p.OD >= 20)
        add("R4", "傳統車床 (少量簡單件)", "少量、無嚴公差的簡單車件可交由傳統車床，免程式費。",
          [...base, ...machineSteps(db, "lathe_conv", turnParts, null, 1.8), deburr], { maxQty: 20 });
    }

    if (p.shape === "block" || p.shape === "plate") {
      const H = p.H || p.T;
      const roughMin = g.removeVol / (db.mrr.millRough * mat.machinability);
      // 大平面以面銑刀加工，效率隨面積提高：× √(最大面 cm² ÷ 100)，1～8 倍
      const faceBoost = Math.min(8, Math.max(1, Math.sqrt(p.L * p.W / 100 / 100)));
      const finMin = g.finishMillCm2 / (db.mrr.finishMillCm2PerMin * faceBoost) * tol * ra / Math.sqrt(mat.machinability);
      const setups3 = Math.max(1, p.faces);
      const handling = setups3 * opMin(db, "fixturePerSetup");
      const fixP = { label: `裝夾/校正 ×${setups3} 次`, min: handling, group: "銑削", detail: `${setups3} 次 × ${opMin(db, "fixturePerSetup")} 分` };
      const roughP = { label: `銑六面/粗銑（移除 ${round(g.removeVol, 1)} cm³）`, min: roughMin, group: "銑削", detail: `${round(g.removeVol, 1)} cm³ ÷ (${db.mrr.millRough} cm³/min × 切削性 ${mat.machinability})` };
      const finP = { label: `精銑（${round(g.finishMillCm2)} cm²）`, min: finMin, group: "銑削", detail: `${round(g.finishMillCm2)} cm² ÷ (${db.mrr.finishMillCm2PerMin}${faceBoost > 1 ? ` × 面銑效率 ${round(faceBoost, 2)}` : ""}) × 公差 ${tol} × 粗糙度 ${ra}` };
      const featP = featureParts(p, Math.sqrt(mc), db);
      // 大件（任一邊 > 800mm）改用龍門加工機
      const vmc = Math.max(p.L, p.W) > 800 ? "vmc_big" : "vmc3";
      const base = [materialCost(p, g, db)];
      add("M1", `${vmc === "vmc_big" ? "龍門" : "CNC 三軸"}銑削 (${setups3} 次裝夾)`, "整塊胚料三軸加工，每個加工方向一次裝夾、一次校正。",
        [...base, ...machineSteps(db, vmc, [fixP, roughP, finP, ...featP], (vmc === "vmc_big" ? 90 : 45) + (setups3 - 1) * 25), ...grind, ...edmOps, deburr]);
      if (p.faces >= 4) add("M2", "CNC 五軸 (一次裝夾)", "多面加工一次完成，減少裝夾誤差；機台費率高，適合位置公差嚴的多面件。",
        [...base, ...machineSteps(db, "vmc5", [{ label: "裝夾/校正 ×1 次", min: 4 / 0.75, group: "銑削" }, roughP, finP, ...featP], 120, 0.75), ...grind, ...edmOps, deburr]);
      // 雷射/水刀下料 → 銑面鑽孔
      const grp = mat.group;
      const flat = p.shape === "plate" || H <= 0.3 * Math.min(p.L, p.W); // 板狀件才適合切割下料
      if (flat && H <= (db.laser.maxT[grp] || 0)) {
        const cutM = (g.cutMm + p.pockets * 200) / 1000;
        const laserRun = cutM * laserPerM(db, H) * db.laser.matFactor[grp] + (1 + p.holes + p.pockets) * db.laser.pierce;
        const plateKg = p.L * p.W * H / 1e6 * mat.density / 0.85;
        const faceMin = p.faces > 1 || tol > 1 ? (2 * p.L * p.W / 100) / (db.mrr.finishMillCm2PerMin * faceBoost) * tol * ra / Math.sqrt(mat.machinability) : 0;
        const tps = p.taps + p.ptTaps + p.slots;
        const millP = [
          { label: `裝夾/校正 ×${p.faces} 面`, min: p.faces * 4 + 3, group: "銑削" },
          { label: `銑基準面（${round(2 * p.L * p.W / 100)} cm²）`, min: faceMin, group: "銑削" },
          ...(tps ? [{ label: `攻牙/管牙/銑槽 ×${tps}`, min: tps * 1.5 * Math.sqrt(mc), group: "鑽孔攻牙" }] : []),
          ...featureParts({ ...p, holes: 0, pockets: 0, taps: 0, ptTaps: 0, slots: 0 }, 1, db, { noTurn: true }),
        ];
        add("M3", "雷射切割下料 + CNC 銑面/鑽孔攻牙", "外形與通孔由雷射切出，CNC 只做基準面、螺牙與精度孔，大幅減少切削移除量。",
          [materialCost(p, g, db, { kg: plateKg, cuts: 0 }), lot("雷射切割", laserRun, db.laser.setup, `${round(cutM, 2)} m × t${H}，穿孔 ${1 + p.holes + p.pockets} 處`),
            ...machineSteps(db, "vmc3", millP, 40, 1, "CNC 銑面/鑽攻"), ...grind, ...edmOps, deburr]);
      } else if (flat && H <= 150) {
        const cutM = g.cutMm / 1000;
        const plateKg = p.L * p.W * H / 1e6 * mat.density / 0.85;
        add("M3W", "水刀切割下料 + CNC 銑削", "厚板以水刀下料（無熱影響），再 CNC 精修。",
          [materialCost(p, g, db, { kg: plateKg, cuts: 0 }), lot("水刀切割", cutM * db.waterjet.perM_per10mm * H / 10, db.waterjet.setup, `${round(cutM, 2)} m × t${H}`),
            ...machineSteps(db, "vmc3", [fixP, { ...roughP, label: "修邊/粗銑（水刀後餘量）", min: roughMin * 0.4 }, finP, ...featP], 45, 1, "CNC 精修"), ...grind, deburr]);
      }
      // 線切割：高精度輪廓 / 銳角內槽
      if (p.tolerance === "嚴" || p.sharpCorners > 0 || /^SKD|^SKH|^NAK/.test(p.material)) { // 中等公差以 CNC 精銑即可，不必線割
        const area = g.cutMm * H;
        const w = p.tolerance === "嚴" ? db.wireEdm.slow : db.wireEdm.fast;
        add("M4", `CNC 銑削 + ${w.name}輪廓`, "外形或內角以線切割完成，可得清角與高輪廓精度；適合模具鋼、嚴公差輪廓。",
          [...base, ...machineSteps(db, "vmc3", [fixP, { ...roughP, label: "粗銑（留線割餘量）", min: roughMin * 0.6 }, ...featP], 45, 1, "CNC 粗加工/孔"),
            lot(w.name, area * w.perMm2 * (p.tolerance === "嚴" ? 1.6 : 1), w.setup, `${round(area)} mm² × ${w.perMm2}`), ...grind, deburr]);
      }
      // 實體率低：改焊接或組合件
      if (p.solidity < 0.45 && p.shape === "block") {
        const plateKg = g.partKg * 1.25;
        const weldM = (p.weldMm || 2 * (p.L + p.W + H)) / 1000;
        const wp = db.welding[mat.group] || db.welding.steel;
        add("M5", "改板件焊接/鎖附組合 + 後加工", "移除量大（實體率低），改以板材雷切組焊或螺絲組合，再後加工基準面。需確認剛性與變形。",
          [materialCost(p, g, db, { kg: plateKg, cuts: 4 }), lot("雷射下料", weldM * 2 * laserPerM(db, 10) * (db.laser.matFactor[mat.group] || 1), db.laser.setup, "板件下料"),
            lot("焊接/組裝", weldM * wp, 600, `${round(weldM, 2)} m 焊道`), hr(db, "vmc3", 25 + feat, 60, "焊後基準面加工"), deburr]);
      }
    }

    if (p.shape === "sheet") {
      const t = p.T, grp = mat.group;
      const cutM = g.cutMm / 1000;
      const laserRun = cutM * laserPerM(db, t) * (db.laser.matFactor[grp] || 1) + (1 + p.holes + p.slots) * db.laser.pierce;
      const bf = 1 + Math.max(0, t - 3) * db.bending.heavyFactorPerMm;
      const bendOps = p.bends ? [lot(`折彎 ×${p.bends}`, p.bends * db.bending.perBend * bf, p.bends * db.bending.setupPerBend, `每折 ${db.bending.perBend}`)] : [];
      const tapOps = (p.taps + p.ptTaps) ? [hr(db, "drill_tap", (p.taps * 0.6 + p.ptTaps * 1.2), 15, "攻牙/壓鉚")] : [];
      const wp = db.welding[grp] || db.welding.steel;
      const weldOps = p.weldMm ? [lot("焊接+修磨", p.weldMm / 1000 * wp, 600, `${p.weldMm} mm 焊道`)] : [];
      const base = [materialCost(p, g, db, { kg: g.stockKg, cuts: 0 })];
      add("S1", "雷射切割" + (p.bends ? " + 折彎" : "") + (p.weldMm ? " + 焊接" : ""), "鈑金標準路線：展開圖雷切，CNC 折床成形。",
        [...base, lot("雷射切割", laserRun, db.laser.setup, `${round(cutM, 2)} m × t${t}`), ...bendOps, ...weldOps, ...tapOps, deburr]);
      if (p.weldMm && p.bends < 4) add("S2", "雷切 + 多折取代焊接", "以增加折彎/搭接設計取代焊道，減少焊接變形與修磨（需修改設計）。",
        [...base, lot("雷射切割", laserRun * 1.1, db.laser.setup, "含展開搭接舌片"), lot(`折彎 ×${p.bends + 2}`, (p.bends + 2) * db.bending.perBend * bf, (p.bends + 2) * db.bending.setupPerBend, ""), ...tapOps, deburr],
        { designChange: true });
      if (t <= 4) {
        const st = db.stamping;
        const die = st.dieBase + p.bends * st.diePerBend + (p.holes + p.slots) * st.diePerHole;
        add("S3", "沖壓模具 (量產)", "開沖壓模，單件成本極低；模具費以專案攤提，建議 ≥500 件再採用。",
          [...base, lot("沖壓成形", (1 + p.bends) * st.perStroke, die, `模具費 ${die.toLocaleString()} 攤提`), ...tapOps],
          { minQty: st.minQty });
      }
      if (p.bends === 0 && t >= 2) add("S4", "CNC 銑削外形 (少量/試作)", "不開雷切程式，以 CNC 直接銑外形；僅 1~5 件試作時考慮。",
        [materialCost(p, g, db, { kg: g.stockKg * 1.2 }), ...machineSteps(db, "vmc3", [{ label: "裝夾", min: 5, group: "銑削" }, { label: `銑外形（${round(g.cutMm / 1000, 2)} m）`, min: g.cutMm / 400 / mat.machinability, group: "銑削" }, ...featureParts(p, Math.sqrt(mc), db)], 40), deburr], { maxQty: 5 });
    }

    if (p.shape === "frame") {
      const grp = mat.group;
      const wp = db.welding[grp] || db.welding.steel;
      const weldMm = p.weldMm || 12 * 80;
      const members = Math.max(4, Math.round(weldMm / 120));
      const base = [materialCost(p, g, db, { kg: g.stockKg, cuts: members })];
      const post2 = hr(db, "vmc3", 30 * Math.sqrt(mc) + feat, 90, "焊後龍門/大型 CNC 加工");
      add("F1", "型材鋸切 + 焊接 + 退火 + 後加工", "標準架構件：方管/角鐵鋸切，治具點焊、滿焊，消除應力後加工基準面。",
        [...base, hr(db, "saw", members * 3, 10), lot("焊接+修磨", weldMm / 1000 * wp, 1500, `${weldMm} mm 焊道，含治具`),
          lot("消除應力退火", g.partKg * 20, db.welding.stressRelief, "整批"), post2, deburr]);
      if (grp === "al" || p.material === "A6063" || p.tolerance === "一般")
        add("F2", "鋁擠型 + 角座鎖附組合", "以標準鋁擠型與連接件組裝，免焊免退火、可調整；剛性與外觀需確認。",
          [lot("鋁擠型材料+連接件", members * 280 + (p.L + p.W + p.H) * 4 / 1000 * 450, 0, `約 ${members} 支型材`),
            lot("鋸切/攻牙/組裝", members * 60, 300, ""), deburr], { designChange: true });
      add("F3", "雷切板件 + 榫接焊接", "以雷切板件榫卯定位後焊接，減少治具與焊道，尺寸重現性佳。",
        [materialCost(p, g, db, { kg: g.stockKg * 1.1, cuts: 0 }), lot("雷射切割", members * 1.2 * laserPerM(db, 6) * (db.laser.matFactor[grp] || 1), db.laser.setup, ""),
          lot("焊接+修磨", weldMm * 0.7 / 1000 * wp, 900, "焊道減 30%"), lot("消除應力退火", g.partKg * 20, db.welding.stressRelief, ""), post2, deburr],
        { designChange: true });
    }
    return { g, routes: R };
  }

  // ───────────────────────── 單價計算 ─────────────────────────
  /**
   * 單價計算（成本價，不加價）
   * 每個步驟：成本 = 單件工時費/材料費 + 架模費 ÷ 數量（委外則 max(單件×數量, 每批最低) ÷ 數量）
   * 估價 = 成本 × 類別比例(材料/加工/委外) × 整體比例 × 該圖比例；再加管銷/利潤（預設 0）
   */
  function priceRoute(route, qty, db, partRatio = 1) {
    const R = { overall: 1, material: 1, machining: 1, outsource: 1, ...(db.ratio || {}) };
    let material = 0, machining = 0, outsource = 0, setupTotal = 0, rawDirect = 0;
    const lines = route.ops.map((o, i) => {
      let cost, cat, note = "", runPer, setupPer;
      if (o.lotMin != null) { // 委外：每批最低收費
        const lotCost = Math.max(o.runCost * qty, o.lotMin);
        cost = lotCost / qty; cat = "outsource"; runPer = o.runCost; setupPer = cost - o.runCost;
        if (o.runCost * qty < o.lotMin) note = `未達每批最低 ${o.lotMin}`;
      } else {
        runPer = o.runCost; setupPer = o.setupCost / qty; cost = runPer + setupPer;
        setupTotal += o.setupCost; cat = o.type === "material" ? "material" : "machining";
      }
      const factor = R[cat] * R.overall * partRatio;
      const unitCost = cost * factor;
      rawDirect += cost;
      if (cat === "material") material += unitCost; else if (cat === "outsource") outsource += unitCost; else machining += unitCost;
      return { ...o, step: i + 1, cat, runPer, setupPer, cost, factor, unitCost, note };
    });
    const direct = [material, machining, outsource].every(Number.isFinite) ? material + machining + outsource : 0;
    const m = db.markup;
    const overhead = direct * (m.overhead || 0);
    const minPer = (m.minOrder || 0) / qty;
    const at = (pr) => Math.max(direct + overhead + (direct + overhead) * pr, minPer);
    return {
      qty, material, machining, outsource, setupTotal, rawDirect, direct, overhead, lines,
      low: at(m.profitLow), fair: at(m.profitFair), rush: at(m.profitRush),
    };
  }

  // ───────────────────────── 風險評估 ─────────────────────────
  function assessRisk(p, db) {
    const items = [];
    const mat = db.materials[p.material];
    if (p.tolerance === "嚴") items.push({ w: 3, t: "嚴公差 (≤±0.01)，需研磨/恆溫量測" });
    else if (p.tolerance === "中等") items.push({ w: 1, t: "中等公差，需精加工" });
    if (p.roughness === "Ra0.4" || p.roughness === "Ra0.8") items.push({ w: 2, t: `表面粗糙度 ${p.roughness} 需研磨/拋光` });
    if (p.deepHoles) items.push({ w: 2, t: `深孔 ×${p.deepHoles}（L/D>5）易偏、排屑困難` });
    if (p.crossHoles) items.push({ w: 2, t: `交叉孔 ×${p.crossHoles}，內毛邊與清潔風險` });
    if (p.sharpCorners) items.push({ w: 2, t: `內直角/銳角 ×${p.sharpCorners} 需放電或線割` });
    if (p.ptTaps) items.push({ w: 1, t: `PT 管牙 ×${p.ptTaps}，需錐度牙規與洩漏測試` });
    if (p.faces >= 5) items.push({ w: 2, t: `${p.faces} 面加工，多次裝夾累積誤差` });
    if (mat.machinability < 0.25) items.push({ w: 2, t: `${p.material} 難切削，刀具耗損高` });
    if (p.weldMm && p.tolerance !== "一般") items.push({ w: 2, t: "焊接件要求精度，需退火與焊後加工" });
    if (p.shape === "block" && p.solidity < 0.45) items.push({ w: 1, t: "切削移除量大，材料浪費與變形風險" });
    if (p.materialMissing || p.dimMissing) items.push({ w: 3, t: "圖面資訊不足 (材料/尺寸)" });
    if (p.surfaceUnknown) items.push({ w: 1, t: "表面處理規格不明" });
    if (p.surface !== "無" && db.surfaces[p.surface].groups && !db.surfaces[p.surface].groups.includes(mat.group))
      items.push({ w: 3, t: `表處「${p.surface}」不適用 ${p.material}` });
    const score = items.reduce((a, b) => a + b.w, 0);
    return { score, level: score >= 6 ? "高" : score >= 3 ? "中" : "低", items: items.map((i) => i.t) };
  }

  // ───────────────────────── 降本建議（重算差額） ─────────────────────────
  function bestFair(p, db) {
    const { routes } = routesFor(p, db);
    let best = null;
    for (const r of routes) {
      if (r.designChange) continue;
      const pr = priceRoute(r, p.qty, db, p.ratio);
      if (!best || pr.fair < best.fair) best = pr;
    }
    return best ? best.fair : 0;
  }

  const ALT_MATERIAL = { SUS304: "A5052", SUS316: "SUS304", SKD11: "S45C", SKD61: "SCM440", A7075: "A6061", C1100: "C3604", PEEK: "POM", SUS303: "A6061", SCM440: "S45C" };
  const ALT_SURFACE = { "硬陽極": "陽極", "鍍硬鉻": "無電解鎳", "無電解鎳": "染黑", "鐵氟龍": "無電解鎳", "電解拋光": "鈍化", "粉體塗裝": "烤漆" };

  function costDown(p, base, db) {
    const out = [];
    const tryIt = (issue, suggest, mutate, caution) => {
      const q = clone(p); mutate(q);
      const v = bestFair(q, db);
      const save = base - v;
      if (save > base * 0.01) out.push({ issue, suggest, newPrice: v, saving: save, savingPct: save / base, caution: caution || "" });
    };
    if (p.tolerance !== "一般") tryIt(`公差等級「${p.tolerance}」`, "非配合面放寬為一般公差 (±0.1)，僅保留功能面精度", (q) => { q.tolerance = "一般"; }, "需確認配合面");
    if (["Ra0.4", "Ra0.8"].includes(p.roughness)) tryIt(`粗糙度 ${p.roughness}`, "非滑動/密封面改 Ra1.6~3.2", (q) => { q.roughness = "Ra1.6"; });
    if (p.sharpCorners) tryIt(`內直角 ×${p.sharpCorners}`, "內角改為標準刀具 R (R≥刀徑/2，建議 R3)，免放電/線割", (q) => { q.sharpCorners = 0; });
    if (p.deepHoles || p.crossHoles) tryIt(`深孔 ${p.deepHoles} / 交叉孔 ${p.crossHoles}`, "改通孔或兩端對鑽、分段加工；交叉孔改外部管路，並於圖面註明清洗要求", (q) => { q.deepHoles = Math.floor(q.deepHoles / 2); q.crossHoles = Math.floor(q.crossHoles / 2); });
    if (p.ptTaps) tryIt(`PT 管牙 ×${p.ptTaps}`, "非流體密封處改公制 M 牙；流體接頭改 G 牙 + O 環", (q) => { q.taps += q.ptTaps; q.ptTaps = 0; }, "流體密封處保留");
    if (p.faces >= 4) tryIt(`${p.faces} 面加工`, "重新配置孔位，增加基準面，減少加工方向至 3 面以內", (q) => { q.faces = 3; });
    if (ALT_MATERIAL[p.material]) tryIt(`材料 ${p.material} 難加工/單價高`, `評估改用 ${ALT_MATERIAL[p.material]}${p.material.startsWith("SUS") ? " + 適當表處" : ""}`,
      (q) => { q.material = ALT_MATERIAL[p.material]; if (db.surfaces[q.surface]?.groups && !db.surfaces[q.surface].groups.includes(db.materials[q.material].group)) q.surface = db.materials[q.material].group === "al" ? "陽極" : "無電解鎳"; },
      "需確認強度、耐蝕、耐磨與重量需求");
    if (ALT_SURFACE[p.surface] && p.qty <= 20) tryIt(`少量 (${p.qty} 件) + ${p.surface}`, `少量時簡化表處為「${ALT_SURFACE[p.surface]}」或與其他零件同批處理，避免最低收費`, (q) => { q.surface = ALT_SURFACE[p.surface]; }, "需確認功能需求");
    if (p.heat !== "無" && p.qty <= 10) tryIt(`少量熱處理 (${p.heat})`, "改用預硬材 (如 NAK80/調質 SCM440) 或與其他零件合併熱處理批次", (q) => { q.heat = "無"; }, "需確認硬度要求");
    if (p.surfaceBlank && p.shape !== "round" && p.material && db.materials[p.material].group === "steel")
      out.push({ issue: "表面處理未標示", suggest: "鐵件請明確標註（染黑/鍍鋅/烤漆），避免供應商自行加價或交貨生鏽", newPrice: base, saving: 0, savingPct: 0, caution: "報價前補齊" });
    if (p.materialMissing || p.dimMissing)
      out.push({ issue: "圖面資訊不足", suggest: "發包前補 PDF、STEP、材料、數量與主要尺寸", newPrice: base, saving: 0, savingPct: 0, caution: "影響報價可信度" });
    return out.sort((a, b) => b.saving - a.saving);
  }

  // ───────────────────────── 估價可信度 ─────────────────────────
  /**
   * 0–100 分：辨識信心、尺寸是否完整／被圖面量測驗證、材料與表處是否明確
   * 高 ≥ 80（估價區間 ±10%）、中 ≥ 60（±20%）、低（±35%）
   */
  function assessReliability(p, price) {
    let score = 100; const why = [];
    const conf = parseInt((p.source.match(/(\d+)%/) || [])[1], 10);
    if (Number.isFinite(conf)) { if (conf < 80) { score -= Math.round((80 - conf) * 0.6); why.push(`圖面辨識信心 ${conf}%`); } }
    if (p.fallback.length) { score -= 22 * p.fallback.length; why.push(`${p.fallback.length} 個尺寸用預設值`); }
    if (p.materialMissing) { score -= 15; why.push("材料未辨識"); }
    if (p.surfaceUnknown) { score -= 8; why.push("表處規格不明"); }
    if (p.shape === "frame" && !p.netWeightKg) { score -= 10; why.push("架構件重量為估算"); }
    const ver = p.verified ? p.verified.split(/[、,\s]+/).filter(Boolean) : [];
    if (ver.length) { score += 5 * ver.length; why.push(`圖面量測驗證 ${ver.join("、")}`); }
    score = Math.max(5, Math.min(100, score));
    const level = score >= 80 ? "高" : score >= 60 ? "中" : "低", spread = { 高: 0.1, 中: 0.2, 低: 0.35 }[level];
    return { score, level, spread, why, low: price * (1 - spread), high: price * (1 + spread) };
  }

  // ───────────────────────── 主流程 ─────────────────────────
  function estimatePart(raw, db = DB_DEFAULT, opts = {}) {
    const p = raw.__normalized ? raw : normalizePart(raw, db);
    const { g, routes } = routesFor(p, db);
    const priced = routes.map((r) => {
      const pr = priceRoute(r, p.qty, db, p.ratio);
      let fit = true, fitNote = "";
      if (r.minQty && p.qty < r.minQty) { fit = false; fitNote = `建議數量 ≥ ${r.minQty}`; }
      if (r.maxQty && p.qty > r.maxQty) { fit = false; fitNote = `適用數量 ≤ ${r.maxQty}`; }
      if (r.designChange) fitNote = fitNote || "需修改設計";
      const tiers = (opts.tiers || db.qtyTiers).map((q) => { const t = priceRoute(r, q, db, p.ratio); return { qty: q, low: t.low, fair: t.fair, rush: t.rush }; });
      return { id: r.id, name: r.name, desc: r.desc, designChange: !!r.designChange, fit, fitNote, price: pr, tiers };
    });
    const eligible = priced.filter((r) => r.fit && !r.designChange);
    const pool = eligible.length ? eligible : priced;
    const best = pool.reduce((a, b) => (b.price.fair < a.price.fair ? b : a), pool[0]);
    priced.forEach((r) => { r.recommended = r === best; r.deltaPct = best ? (r.price.fair - best.price.fair) / best.price.fair : 0; });
    const risk = assessRisk(p, db);
    const suggestions = costDown(p, best.price.fair, db);
    // 各數量最佳路線
    const tierBest = (opts.tiers || db.qtyTiers).map((q, i) => {
      let b = null;
      for (const r of priced) { if (r.designChange) continue; const t = r.tiers[i]; if (!b || t.fair < b.fair) b = { ...t, route: r.name }; }
      return b;
    });
    const reliability = assessReliability(p, best.price.fair);
    return { part: p, geometry: g, shapeLabel: SHAPES[p.shape], routes: priced, best, risk, suggestions, tierBest, reliability,
      process: best.name, lineTotal: best.price.fair * p.qty };
  }

  function estimateAll(rows, db = DB_DEFAULT, opts) {
    const results = rows.filter((r) => Object.values(r).some((v) => String(v ?? "").trim() !== "")).map((r) => estimatePart(r, db, opts));
    const total = results.reduce((a, r) => a + r.lineTotal, 0);
    const rangeLow = results.reduce((a, r) => a + r.reliability.low * r.part.qty, 0), rangeHigh = results.reduce((a, r) => a + r.reliability.high * r.part.qty, 0);
    const relCount = { 高: 0, 中: 0, 低: 0 }; results.forEach((r) => relCount[r.reliability.level]++);
    const totalLow = results.reduce((a, r) => a + r.best.price.low * r.part.qty, 0);
    const totalRush = results.reduce((a, r) => a + r.best.price.rush * r.part.qty, 0);
    const potential = results.reduce((a, r) => a + (r.suggestions[0]?.saving || 0) * r.part.qty, 0);
    const riskCount = { 高: 0, 中: 0, 低: 0 };
    results.forEach((r) => riskCount[r.risk.level]++);
    const byProcess = {};
    results.forEach((r) => { const k = r.best.name.split(/[ (（]/)[0]; byProcess[k] = (byProcess[k] || 0) + r.lineTotal; });
    const costMix = { material: 0, machining: 0, outsource: 0, overheadProfit: 0 };
    results.forEach((r) => { const pr = r.best.price, q = r.part.qty; costMix.material += pr.material * q; costMix.machining += pr.machining * q; costMix.outsource += pr.outsource * q; costMix.overheadProfit += (pr.fair - pr.direct) * q; });
    const group = (fn) => { const o = {}; results.forEach((r) => { const k = fn(r) || "—"; o[k] = o[k] || { amount: 0, count: 0, qty: 0 }; o[k].amount += r.lineTotal; o[k].count++; o[k].qty += r.part.qty; }); return o; };
    const byMaterial = group((r) => r.part.material);
    const byShape = group((r) => SHAPES[r.part.shape]);
    const bySource = group((r) => (r.part.source || "人工輸入").replace(/\s*\d+%$/, ""));
    const recog = results.map((r) => parseInt((r.part.source.match(/(\d+)%/) || [])[1], 10)).filter(Number.isFinite);
    const avgConfidence = recog.length ? recog.reduce((a, b) => a + b, 0) / recog.length : null;
    return { results, summary: { count: results.length, total, rangeLow, rangeHigh, relCount, totalLow, totalRush, potential, riskCount, byProcess, costMix, byMaterial, byShape, bySource, avgConfidence } };
  }

  // ───────────────────────── CSV ─────────────────────────
  const CSV_HEADERS = ["圖號", "CAD NO", "零件名稱", "圖名說明", "材料", "數量", "外形", "長L", "寬W", "高H", "外徑OD", "內徑ID", "板厚T",
    "實體率%", "淨重kg", "孔數", "攻牙數", "PT牙數", "槽數", "口袋數", "深孔數", "交叉孔數", "內直角數", "外螺紋數", "退刀槽數", "精度孔數",
    "加工面數", "折彎數", "焊道長mm", "雷切周長mm", "公差", "粗糙度", "表面處理", "熱處理", "備註", "估價比例%", "辨識來源", "尺寸驗證"];

  function parseCSV(text) {
    const rows = []; let row = [], cell = "", q = false;
    text = text.replace(/^﻿/, "");
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
      else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
    if (!nonEmpty.length) return [];
    const head = nonEmpty[0].map((h) => h.trim());
    return nonEmpty.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? "").trim()])));
  }
  function toCSV(rows, headers = CSV_HEADERS) {
    const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return "﻿" + [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
  }

  const API = { estimatePart, estimateAll, normalizePart, parseQty, parseCSV, toCSV, CSV_HEADERS, SHAPES, priceRoute, routesFor, round };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.Estimator = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
