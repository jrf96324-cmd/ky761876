// 本機靜態伺服器：node tools/serve.js [port]
const http = require("http"), fs = require("fs"), path = require("path"), { exec } = require("child_process");
const root = path.resolve(__dirname, "..");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm",
  ".gz": "application/gzip", ".bcmap": "application/octet-stream", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".pdf": "application/pdf", ".dxf": "text/plain; charset=utf-8", ".csv": "text/csv; charset=utf-8", ".svg": "image/svg+xml" };
function start(port) {
  const srv = http.createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
    const full = path.resolve(root, rel);
    if (!full.startsWith(root + path.sep) && full !== root) { res.writeHead(403); return res.end(); }
    fs.readFile(full, (err, buf) => {
      if (err) { res.writeHead(404); return res.end("Not found"); }
      res.writeHead(200, { "Content-Type": MIME[path.extname(full).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-cache" }); res.end(buf);
    });
  });
  srv.on("error", (e) => (e.code === "EADDRINUSE" && port < 8785 ? start(port + 1) : (console.error(e.message), process.exit(1))));
  srv.listen(port, "127.0.0.1", () => {
    const url = `http://localhost:${port}/index.html`;
    console.log(`Drawing-to-Quote 執行中：${url}\n使用期間請勿關閉此視窗。`);
    if (!process.env.NO_OPEN) exec(process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`, () => {});
  });
}
start(+process.argv[2] || 8765);
