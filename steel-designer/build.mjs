// 產生離線單機版：把 three.js 與程式打包內嵌成單一 HTML（不需網路）
import { build } from 'esbuild';
import fs from 'node:fs';

const src = fs.readFileSync('index.html', 'utf8');
const mod = src.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!mod) throw new Error('找不到 module script');
fs.writeFileSync('.entry.mjs', mod[1]);
const out = await build({ entryPoints: ['.entry.mjs'], bundle: true, format: 'iife', minify: true, write: false, target: 'es2020', legalComments: 'none' });
fs.unlinkSync('.entry.mjs');
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const body = src
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace(mod[0], () => '<script>' + js + '</script>');
fs.mkdirSync('dist', { recursive: true });
fs.writeFileSync('dist/steel-designer-offline.html',
  '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>' + body + '</body></html>');
console.log('dist/steel-designer-offline.html', (fs.statSync('dist/steel-designer-offline.html').size / 1024).toFixed(0) + ' KB');
