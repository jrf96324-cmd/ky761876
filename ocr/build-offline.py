#!/usr/bin/env python3
"""產生「離線單檔版」：把 OCR／PDF 引擎與繁中、英文語言資料內嵌進單一 HTML。
用法：
  npm i tesseract.js@5.1.1 tesseract.js-core@5.1.1 pdfjs-dist@3.11.174 @tesseract.js-data/chi_tra@1.0.0 @tesseract.js-data/eng@1.0.0
  python3 build-offline.py <node_modules 路徑> [輸出檔]
"""
import base64, gzip, pathlib, sys

nm = pathlib.Path(sys.argv[1])
here = pathlib.Path(__file__).resolve().parent
out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else here / 'OCR離線單檔版.html'

def patched_worker():
    # tesseract.js 5.1.1 的 bug：以內嵌資料載入語言時，initialize 誤用 l.data 當語言名稱，應為 l.code
    w = (nm / 'tesseract.js/dist/worker.min.js').read_bytes()
    bad = b'"string"==typeof t?t:t.data})).join("+")'
    assert w.count(bad) == 1, 'worker.min.js 版本不符，請使用 tesseract.js@5.1.1'
    return w.replace(bad, b'"string"==typeof t?t:t.code})).join("+")')

def gz(b):
    return base64.b64encode(gzip.compress(b, 9, mtime=0)).decode('ascii')

def lang(p):
    # 語言檔本身已是 gzip；以 -9 重新壓縮取較小者（引擎會自行解壓）
    b = (nm / p).read_bytes()
    r = gzip.compress(gzip.decompress(b), 9, mtime=0)
    return base64.b64encode(min(b, r, key=len)).decode('ascii')

def js(p):
    return (nm / p).read_bytes()

# 程式與核心以 gzip＋base64 內嵌，瀏覽器以 DecompressionStream 解壓（Chrome/Edge 80+、Safari 16.4+、Firefox 113+）
embed = {
    'tess': gz(js('tesseract.js/dist/tesseract.min.js')),
    'pdf': gz(js('pdfjs-dist/build/pdf.min.js')),
    # file:// 下 worker 內不能再 importScripts 另一個 blob，所以把 OCR 核心（非 SIMD 版，相容性最好）接在 worker 程式前面
    'worker': gz(js('tesseract.js-core/tesseract-core-lstm.wasm.js') + b'\n;self.TesseractCore=TesseractCore;\n' + patched_worker()),
    'pdfWorker': gz(js('pdfjs-dist/build/pdf.worker.min.js')),
    'lang_chi_tra': lang('@tesseract.js-data/chi_tra/4.0.0_best_int/chi_tra.traineddata.gz'),
    'lang_eng': lang('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'),
}
bundle = '<script>window.__EMBED__={' + ','.join(f'{k}:"{v}"' for k, v in embed.items()) + '};</script>'
html = (here / 'index.html').read_text(encoding='utf-8')
assert html.count('<!--OFFLINE_BUNDLE-->') == 1
out.write_text(html.replace('<!--OFFLINE_BUNDLE-->', bundle), encoding='utf-8')
print(f'{out}  {out.stat().st_size/1024/1024:.1f} MB')
