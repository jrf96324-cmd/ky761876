#!/usr/bin/env python3
"""產生 dist/ 下的單機版（全部內嵌、不需網路）與線上 Artifact 版。用法：python3 build.py"""
import pathlib, re
root = pathlib.Path(__file__).parent
dist = root / 'dist'; dist.mkdir(exist_ok=True)
html = (root / 'index.html').read_text(encoding='utf-8')

def inline(src):
    code = (root / src).read_text(encoding='utf-8').replace('</script', '<\\/script')
    return '<script>\n' + code + '\n</script>'

offline = re.sub(r'<link rel="stylesheet" href="https://fonts\.googleapis\.com[^>]*>\n?', '', html)
for src in ('vendor/three.min.js', 'app.js', 'export.js'):
    offline = offline.replace(f'<script src="{src}"></script>', inline(src))
offline = offline.replace('<title>室內空間 3D 設計器</title>', '<title>室內空間 3D 設計器（單機版）</title>')
assert '<script src=' not in offline
(dist / 'interior-designer-offline.html').write_text(offline, encoding='utf-8')

# Artifact 版：去掉文件骨架，three.js 改用 CDN，app/export 以附檔發布
skel = re.compile(r'^(<!doctype html>|<html lang="zh-Hant">|<head>|</head>|<body>|</body>|</html>|<meta charset="utf-8">|<meta name="viewport".*)$')
art = '\n'.join(l for l in html.split('\n') if not skel.match(l))
art = art.replace('<script src="vendor/three.min.js"></script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>')
(dist / 'artifact').mkdir(exist_ok=True)
(dist / 'artifact' / 'interior-designer.html').write_text(art, encoding='utf-8')
for f in ('app.js', 'export.js'):
    (dist / 'artifact' / f).write_text((root / f).read_text(encoding='utf-8'), encoding='utf-8')
print('ok', (dist / 'interior-designer-offline.html').stat().st_size, 'bytes')
