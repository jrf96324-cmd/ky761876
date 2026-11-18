// 產生單機離線版：node build-offline.mjs
import { readFileSync, writeFileSync } from "node:fs";
const src = readFileSync(new URL("./index.html", import.meta.url), "utf8")
  .replace(/<link rel="preconnect"[^>]*>\n?/, "")
  .replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>\n?/, "");
const out = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>html{color-scheme:light}[hidden]{display:none!important}body{margin:0}img{max-width:100%}</style>
</head>
<body>
${src}
</body>
</html>
`;
writeFileSync(new URL("./三菱PLC階梯圖產生器_單機版.html", import.meta.url), out);
console.log("已產生 三菱PLC階梯圖產生器_單機版.html");
