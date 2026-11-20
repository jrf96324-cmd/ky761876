/*
 * 零依賴 XLSX 產生器（瀏覽器與 Node 共用）
 * 支援：多工作表、粗體/表頭底色、數字格式（千分位、百分比）、欄寬、凍結首列、合併儲存格。
 * sheet = { name, rows: [[cell...]], colWidths: [..], freeze: true, merges: ["A1:F1"] }
 * cell  = 值 或 { v, s }，s: "h"表頭 "b"粗體 "t"標題 "n0"整數 "n"金額 "p"百分比 "hi"高風險 "mid" "lo"
 */
(function (root) {
  const enc = new TextEncoder();
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function zip(files) { // files: [{name, data:Uint8Array}] — STORE (無壓縮)
    const parts = [], central = []; let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
      h.setUint16(10, 0, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, size, true); h.setUint32(22, size, true);
      h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
      parts.push(new Uint8Array(h.buffer), name, f.data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
      c.setUint16(12, 0, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, size, true); c.setUint32(24, size, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      central.push(new Uint8Array(c.buffer), name);
      offset += 30 + name.length + size;
    }
    const cSize = central.reduce((a, b) => a + b.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, cSize, true); e.setUint32(16, offset, true);
    const all = [...parts, ...central, new Uint8Array(e.buffer)];
    const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0;
    for (const a of all) { out.set(a, p); p += a.length; }
    return out;
  }

  const xml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "");
  const colName = (i) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  // style index map (cellXfs)
  const STY = { "": 0, h: 1, b: 2, t: 3, n0: 4, n: 5, p: 6, hi: 7, mid: 8, lo: 9, nb: 10, wrap: 11 };

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0"/><numFmt numFmtId="165" formatCode="0.0%"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="11"/><name val="Microsoft JhengHei"/></font><font><b/><sz val="15"/><color rgb="FF1F3A5F"/><name val="Microsoft JhengHei"/></font></fonts>
<fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F3A5F"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8C9C4"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFBE6B3"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFCFEBD6"/></patternFill></fill></fills>
<borders count="2"><border/><border><left style="thin"><color rgb="FFBFC7D1"/></left><right style="thin"><color rgb="FFBFC7D1"/></right><top style="thin"><color rgb="FFBFC7D1"/></top><bottom style="thin"><color rgb="FFBFC7D1"/></bottom></border></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="12">
<xf borderId="1" applyBorder="1"><alignment vertical="center"/></xf>
<xf fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf fontId="2" borderId="1" applyFont="1" applyBorder="1"/>
<xf fontId="3" applyFont="1"/>
<xf numFmtId="3" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="164" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" borderId="1" applyNumberFormat="1" applyBorder="1"/>
<xf fillId="3" borderId="1" applyFill="1" applyBorder="1"><alignment horizontal="center"/></xf>
<xf fillId="4" borderId="1" applyFill="1" applyBorder="1"><alignment horizontal="center"/></xf>
<xf fillId="5" borderId="1" applyFill="1" applyBorder="1"><alignment horizontal="center"/></xf>
<xf numFmtId="164" fontId="2" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf borderId="1" applyBorder="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

  function sheetXml(sh) {
    const rows = sh.rows.map((r, ri) => {
      const cells = r.map((c, ci) => {
        if (c === null || c === undefined || c === "") return "";
        const o = typeof c === "object" ? c : { v: c };
        const s = STY[o.s || (typeof o.v === "number" ? "n" : "")] || 0;
        const ref = colName(ci) + (ri + 1);
        if (typeof o.v === "number" && Number.isFinite(o.v)) return `<c r="${ref}" s="${s}"><v>${o.v}</v></c>`;
        if (typeof o.v === "string" && o.v.startsWith("=")) return `<c r="${ref}" s="${s}"><f>${xml(o.v.slice(1))}</f></c>`;
        return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(o.v ?? "")}</t></is></c>`;
      }).join("");
      return `<row r="${ri + 1}">${cells}</row>`;
    }).join("");
    const cols = sh.colWidths ? `<cols>${sh.colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    const fr = sh.freeze ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : "";
    const mg = sh.merges?.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join("")}</mergeCells>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${fr}${cols}<sheetData>${rows}</sheetData>${mg}</worksheet>`;
  }

  function buildXlsx(sheets) {
    const safe = sheets.map((s, i) => ({ ...s, name: String(s.name).replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || `Sheet${i + 1}` }));
    const files = [
      { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${safe.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
      { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${safe.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
      { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${safe.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${safe.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: "xl/styles.xml", data: STYLES },
      ...safe.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
    ].map((f) => ({ name: f.name, data: enc.encode(f.data) }));
    return zip(files);
  }

  const API = { buildXlsx, zip };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.XlsxWriter = API;
})(typeof globalThis !== "undefined" ? globalThis : this);
