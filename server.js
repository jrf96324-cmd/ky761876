import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const dataFile = path.join(dataDir, "arrangements.json");
const port = Number(process.env.PORT || 3000);
const password = process.env.DAO_CAR_PASSWORD || "change-me";
const sessions = new Set();

const defaultData = {
  updatedAt: null,
  vehicles: [
    { id: crypto.randomUUID(), plate: "範例-001", driver: "王前賢", seats: 4, note: "可協助接送長輩" }
  ],
  trips: [
    {
      id: crypto.randomUUID(),
      date: new Date().toISOString().slice(0, 10),
      time: "07:30",
      activity: "範例活動",
      route: "道場 -> 活動會場",
      vehicleId: null,
      passengers: "林師兄、陳師姐",
      status: "待確認",
      note: "可直接修改這筆範例"
    }
  ]
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

async function ensureDataFile() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dataFile)) {
    await writeFile(dataFile, JSON.stringify(defaultData, null, 2), "utf8");
  }
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const index = item.indexOf("=");
      return index === -1 ? [item, ""] : [item.slice(0, index), decodeURIComponent(item.slice(index + 1))];
    }));
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  return sessions.has(cookies.dao_session);
}

function sendRedirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function setSessionCookie(res, token) {
  res.setHeader("Set-Cookie", `dao_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "dao_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
}

function getLanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .map((item) => `http://${item.address}:${port}`);
}

await ensureDataFile();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const authenticated = isAuthenticated(req);

    if (url.pathname === "/healthz" && req.method === "GET") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/login.html" && req.method === "GET") {
      const filePath = path.join(publicDir, "login.html");
      res.writeHead(200, { "Content-Type": mimeTypes[".html"], "Cache-Control": "no-store" });
      createReadStream(filePath).pipe(res);
      return;
    }

    if (url.pathname === "/login.js" && req.method === "GET") {
      const filePath = path.join(publicDir, "login.js");
      res.writeHead(200, { "Content-Type": mimeTypes[".js"], "Cache-Control": "no-store" });
      createReadStream(filePath).pipe(res);
      return;
    }

    if (url.pathname === "/styles.css" && req.method === "GET") {
      const filePath = path.join(publicDir, "styles.css");
      res.writeHead(200, { "Content-Type": mimeTypes[".css"] });
      createReadStream(filePath).pipe(res);
      return;
    }

    if (url.pathname === "/api/login" && req.method === "POST") {
      const body = JSON.parse(await readBody(req) || "{}");
      if (String(body.password || "") !== password) {
        sendJson(res, 401, { ok: false, error: "密碼錯誤" });
        return;
      }
      const token = crypto.randomUUID();
      sessions.add(token);
      setSessionCookie(res, token);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/logout" && req.method === "POST") {
      const cookies = parseCookies(req);
      sessions.delete(cookies.dao_session);
      clearSessionCookie(res);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (!authenticated) {
      if (url.pathname.startsWith("/api/")) {
        sendJson(res, 401, { error: "尚未登入" });
        return;
      }
      sendRedirect(res, "/login.html");
      return;
    }

    if (url.pathname === "/api/arrangements" && req.method === "GET") {
      const text = await readFile(dataFile, "utf8");
      sendJson(res, 200, JSON.parse(text));
      return;
    }

    if (url.pathname === "/api/arrangements" && req.method === "PUT") {
      const body = await readBody(req);
      const payload = JSON.parse(body);
      const normalized = {
        updatedAt: new Date().toISOString(),
        vehicles: Array.isArray(payload.vehicles) ? payload.vehicles.map(({ phone, ...vehicle }) => vehicle) : [],
        trips: Array.isArray(payload.trips) ? payload.trips : []
      };
      await writeFile(dataFile, JSON.stringify(normalized, null, 2), "utf8");
      sendJson(res, 200, normalized);
      return;
    }

    const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
    const safePath = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
    const filePath = path.join(publicDir, safePath);

    if (!filePath.startsWith(publicDir) || !existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("找不到頁面");
      return;
    }

    res.writeHead(200, {
      "Content-Type": mimeTypes[path.extname(filePath)] || "application/octet-stream"
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "伺服器錯誤" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`全道親車輛安排系統已啟動：http://localhost:${port}`);
  const lan = getLanAddresses();
  if (lan.length) console.log(`區網可用網址：${lan.join("  ")}`);
});
