/*
 * 輕量 DXF 解析器（ASCII DXF，R12 ~ R2018）
 * 讀取：LINE / CIRCLE / ARC / LWPOLYLINE / POLYLINE / TEXT / MTEXT / ATTRIB / DIMENSION / INSERT（展開圖塊）
 * 輸出：{ units, texts:[{s,x,y,h}], dims:[{kind,value,text}], circles:[{x,y,r}], geom:[...], bbox }
 * 座標 y 向上（CAD 慣例）；辨識器會自行翻轉。
 */
(function (root) {
  const UNITS = { 0: "未指定", 1: "inch", 2: "feet", 4: "mm", 5: "cm", 6: "m" };

  function decodeBytes(buf) {
    // DXF R2007+ 為 UTF-8；舊版中文 CAD 常為 Big5 (ANSI_950)
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let txt = new TextDecoder("utf-8").decode(u8);
    if (txt.includes("�")) {
      for (const enc of ["big5", "gbk"]) { try { const t = new TextDecoder(enc).decode(u8); if (!t.includes("�")) return t; txt = t; } catch (e) { /* 不支援此編碼 */ } }
    }
    return txt;
  }

  /** CAD 控制碼 → 一般文字 */
  function cleanText(s) {
    return String(s)
      .replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/%%[cC]/g, "Ø").replace(/%%[dD]/g, "°").replace(/%%[pP]/g, "±").replace(/%%[uUoO]/g, "")
      .replace(/\\[Pp]/g, "\n").replace(/\\S([^;]*?)[#^\/]([^;]*?);/g, " +$1/$2 ")  // 堆疊公差 \S+0.02^-0.01;
      .replace(/\\[ACcFfHhQTWp][^;\\]*;/g, "").replace(/\\[LlOoKkNn~]/g, "")
      .replace(/[{}]/g, "").replace(/\s+\n/g, "\n").trim();
  }

  function readPairs(text) {
    const lines = text.split(/\r?\n/);
    const pairs = [];
    for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1]]);
    return pairs;
  }

  function parseEntityList(pairs, start, endMarker) {
    // 回傳 [entities, nextIndex]；entity = { type, codes: [[code,val]...] }
    const ents = []; let cur = null; let i = start;
    for (; i < pairs.length; i++) {
      const [c, v] = pairs[i];
      if (c === 0) {
        const t = v.trim();
        if (cur) ents.push(cur);
        if (t === endMarker || t === "ENDSEC" || t === "EOF") { cur = null; break; }
        cur = { type: t, codes: [] };
      } else if (cur) cur.codes.push([c, v]);
    }
    if (cur) ents.push(cur);
    return [ents, i];
  }

  const g = (e, code, d) => { const f = e.codes.find((p) => p[0] === code); return f ? f[1] : d; };
  const gn = (e, code, d = 0) => { const v = parseFloat(g(e, code, d)); return Number.isFinite(v) ? v : d; };
  const gall = (e, code) => e.codes.filter((p) => p[0] === code).map((p) => p[1]);

  function parseDXF(input) {
    const text = typeof input === "string" ? input : decodeBytes(input);
    const pairs = readPairs(text);
    let units = 4;
    const blocks = {}; let entities = [];
    for (let i = 0; i < pairs.length; i++) {
      const [c, v] = pairs[i];
      if (c !== 2 || i === 0 || pairs[i - 1][0] !== 0 || pairs[i - 1][1].trim() !== "SECTION") continue;
      const name = v.trim();
      if (name === "HEADER") {
        for (let j = i + 1; j < pairs.length && !(pairs[j][0] === 0 && pairs[j][1].trim() === "ENDSEC"); j++)
          if (pairs[j][0] === 9 && pairs[j][1].trim() === "$INSUNITS" && pairs[j + 1]) units = parseInt(pairs[j + 1][1], 10);
      } else if (name === "BLOCKS") {
        const [list] = parseEntityList(pairs, i + 1, "ENDSEC");
        let curBlock = null;
        for (const e of list) {
          if (e.type === "BLOCK") { curBlock = { name: g(e, 2, "").trim(), bx: gn(e, 10), by: gn(e, 20), ents: [] }; blocks[curBlock.name] = curBlock; }
          else if (e.type === "ENDBLK") curBlock = null;
          else if (curBlock) curBlock.ents.push(e);
        }
      } else if (name === "ENTITIES") {
        [entities] = parseEntityList(pairs, i + 1, "ENDSEC");
      }
    }

    const out = { units: UNITS[units] || String(units), unitCode: units, texts: [], dims: [], circles: [], geom: [], blockTexts: [] };
    // 仿射矩陣 m = [a,b,c,d,e,f]：(x,y) → (a·x + c·y + e, b·x + d·y + f)
    const tf = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
    const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
    const I = [1, 0, 0, 1, 0, 0];

    function walk(list, m, depth, inBlock) {
      for (let k = 0; k < list.length; k++) {
        const e = list[k];
        const P = (cx, cy) => tf(m, gn(e, cx), gn(e, cy));
        const scl = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
        const rot = Math.atan2(m[1], m[0]);
        switch (e.type) {
          case "LINE": { const a = P(10, 20), b = P(11, 21); out.geom.push({ t: "L", a, b }); break; }
          case "CIRCLE": { const c = P(10, 20), r = gn(e, 40) * scl; out.geom.push({ t: "C", c, r }); if (!inBlock || depth <= 1) out.circles.push({ x: c.x, y: c.y, r }); break; }
          case "ARC": { const c = P(10, 20); out.geom.push({ t: "A", c, r: gn(e, 40) * scl, a0: (gn(e, 50) * Math.PI / 180) + rot, a1: (gn(e, 51) * Math.PI / 180) + rot }); break; }
          case "LWPOLYLINE": {
            const xs = gall(e, 10).map(Number), ys = gall(e, 20).map(Number);
            const pts = xs.map((x, idx) => tf(m, x, ys[idx]));
            out.geom.push({ t: "P", pts, closed: (gn(e, 70) & 1) === 1 }); break;
          }
          case "POLYLINE": {
            const pts = []; let j = k + 1;
            for (; j < list.length && list[j].type === "VERTEX"; j++) pts.push(tf(m, gn(list[j], 10), gn(list[j], 20)));
            k = j; out.geom.push({ t: "P", pts, closed: (gn(e, 70) & 1) === 1 }); break;
          }
          case "SPLINE": { const xs = gall(e, 10).map(Number), ys = gall(e, 20).map(Number); out.geom.push({ t: "P", pts: xs.map((x, idx) => tf(m, x, ys[idx])), closed: false }); break; }
          case "TEXT": case "ATTRIB": case "MTEXT": case "ATTDEF": {
            if (e.type === "ATTDEF") break;
            const raw = e.type === "MTEXT" ? gall(e, 3).join("") + g(e, 1, "") : g(e, 1, "");
            const s = cleanText(raw); if (!s) break;
            const p = P(10, 20), h = gn(e, 40, 2.5) * scl;
            s.split("\n").forEach((line, li) => line.trim() && out.texts.push({ s: line.trim(), x: p.x, y: p.y - li * h * 1.6, h, src: inBlock ? "block" : e.type }));
            break;
          }
          case "DIMENSION": {
            const type = gn(e, 70) & 7, meas = gn(e, 42, NaN);
            const txt = cleanText(g(e, 1, ""));
            const kind = type === 3 ? "diameter" : type === 4 ? "radius" : (type === 2 || type === 5) ? "angle" : type === 6 ? "ordinate" : "linear";
            let value = Number.isFinite(meas) ? meas * (kind === "angle" ? 180 / Math.PI : 1) : NaN;
            if ((!txt || txt.includes("<>")) && !Number.isFinite(value)) break;
            if (txt && !txt.includes("<>")) { const n = parseFloat(txt.replace(/^[^0-9.]*/, "")); if (Number.isFinite(n) && !Number.isFinite(value)) value = n; }
            const shown = txt ? txt.replace("<>", Number.isFinite(value) ? String(+value.toFixed(3)) : "") : String(+value.toFixed(3));
            const p = P(11, 21);
            out.dims.push({ kind: /Ø|⌀/.test(shown) && kind === "linear" ? "diameter" : kind, value, text: shown, x: p.x, y: p.y });
            // 標註本身的圖塊 (*D) 不展開，避免重複文字
            break;
          }
          case "INSERT": {
            const bn = g(e, 2, "").trim(), b = blocks[bn];
            if (b && depth < 4 && !bn.startsWith("*D")) {
              const r = gn(e, 50) * Math.PI / 180, sx = gn(e, 41, 1), sy = gn(e, 42, 1);
              const local = mul(mul([1, 0, 0, 1, gn(e, 10), gn(e, 20)], [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]), [sx, 0, 0, sy, -sx * b.bx, -sy * b.by]);
              walk(b.ents, mul(m, local), depth + 1, true);
            }
            break;
          }
          default: break;
        }
      }
    }
    walk(entities, I, 0, false);

    // 外框
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const ext = (p) => { if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return; x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
    for (const o of out.geom) {
      if (o.t === "L") { ext(o.a); ext(o.b); }
      else if (o.t === "C" || o.t === "A") { ext({ x: o.c.x - o.r, y: o.c.y - o.r }); ext({ x: o.c.x + o.r, y: o.c.y + o.r }); }
      else if (o.t === "P") o.pts.forEach(ext);
    }
    out.texts.forEach(ext);
    out.bbox = Number.isFinite(x0) ? { x0, y0, x1, y1 } : { x0: 0, y0: 0, x1: 100, y1: 100 };
    return out;
  }

  /** 繪製 DXF 預覽到 canvas */
  function drawDXF(dxf, canvas, opts = {}) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height, pad = 8;
    const { x0, y0, x1, y1 } = dxf.bbox;
    const s = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1e-6), (H - 2 * pad) / Math.max(y1 - y0, 1e-6));
    const X = (x) => pad + (x - x0) * s, Y = (y) => H - pad - (y - y0) * s;
    ctx.fillStyle = opts.bg || "#fff"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = opts.fg || "#14243a"; ctx.lineWidth = 1; ctx.beginPath();
    for (const o of dxf.geom) {
      if (o.t === "L") { ctx.moveTo(X(o.a.x), Y(o.a.y)); ctx.lineTo(X(o.b.x), Y(o.b.y)); }
      else if (o.t === "C") { ctx.moveTo(X(o.c.x + o.r), Y(o.c.y)); ctx.arc(X(o.c.x), Y(o.c.y), Math.max(o.r * s, 0.5), 0, Math.PI * 2); }
      else if (o.t === "A") { ctx.moveTo(X(o.c.x + o.r * Math.cos(o.a0)), Y(o.c.y + o.r * Math.sin(o.a0))); ctx.arc(X(o.c.x), Y(o.c.y), Math.max(o.r * s, 0.5), -o.a0, -o.a1, true); }
      else if (o.t === "P" && o.pts.length) { ctx.moveTo(X(o.pts[0].x), Y(o.pts[0].y)); o.pts.slice(1).forEach((p) => ctx.lineTo(X(p.x), Y(p.y))); if (o.closed) ctx.closePath(); }
    }
    ctx.stroke();
    ctx.fillStyle = opts.text || "#1f4f8f";
    for (const t of dxf.texts) { const fs = t.h * s; if (fs < 3) continue; ctx.font = `${Math.min(fs, 40)}px sans-serif`; ctx.fillText(t.s, X(t.x), Y(t.y)); }
    for (const d of dxf.dims) { const fs = 2.5 * s; if (fs < 3) continue; ctx.font = `${Math.min(fs, 30)}px sans-serif`; ctx.fillText(d.text, X(d.x), Y(d.y)); }
  }

  const API = { parseDXF, drawDXF, cleanText, decodeBytes };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.DXF = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
