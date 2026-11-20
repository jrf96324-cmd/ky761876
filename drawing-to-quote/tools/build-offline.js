/*
 * 打包離線單機版：node tools/build-offline.js [輸出.zip]
 * 產生可直接解壓使用的 ZIP（含程式、離線函式庫、OCR 字庫、示範圖面、啟動檔）。
 */
const fs = require("fs"), path = require("path"), zlib = require("zlib");
const root = path.resolve(__dirname, "..");
const out = path.resolve(process.argv[2] || path.join(root, "dist", "Drawing-to-Quote-離線版.zip"));
const TOP = "Drawing-to-Quote";
const INCLUDE = ["index.html", "README.md", "使用說明.txt", "START-Windows.bat", "start-mac-linux.sh", "cli.js", "package.json", "engine", "vendor", "samples", "tools/serve.ps1", "tools/serve.js", "test"];

function walk(p, list) {
  const st = fs.statSync(p);
  if (st.isDirectory()) fs.readdirSync(p).sort().forEach((f) => walk(path.join(p, f), list)); else list.push(p);
}
const files = []; INCLUDE.forEach((i) => { const p = path.join(root, i); if (fs.existsSync(p)) walk(p, files); });

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunks = [], central = []; let offset = 0;
const now = new Date(); const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1); const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
for (const f of files) {
  const rel = TOP + "/" + path.relative(root, f).split(path.sep).join("/");
  const data = fs.readFileSync(f), name = Buffer.from(rel, "utf8");
  const comp = zlib.deflateRawSync(data, { level: 9 }); const useDeflate = comp.length < data.length; const body = useDeflate ? comp : data;
  const crc = crc32(data), method = useDeflate ? 8 : 0;
  const isExec = /\.(sh)$/.test(f);
  const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(method, 8); h.writeUInt16LE(dosTime, 10); h.writeUInt16LE(dosDate, 12);
  h.writeUInt32LE(crc, 14); h.writeUInt32LE(body.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(name.length, 26); h.writeUInt16LE(0, 28);
  chunks.push(h, name, body);
  const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x0314, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(method, 10); c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14);
  c.writeUInt32LE(crc, 16); c.writeUInt32LE(body.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(((isExec ? 0o100755 : 0o100644) << 16) >>> 0, 38); c.writeUInt32LE(offset, 42);
  central.push(c, name); offset += 30 + name.length + body.length;
}
const cBuf = Buffer.concat(central); const e = Buffer.alloc(22);
e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cBuf.length, 12); e.writeUInt32LE(offset, 16);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([...chunks, cBuf, e]));
console.log(`已打包 ${files.length} 個檔案 → ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
