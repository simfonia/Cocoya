"""把單檔離線版 HTML 轉成 PDF（Moodle 課程用），使用 Edge headless 列印。

用法：python build/html2pdf.py
產出：docs/teaching/py_ai_train_run/dist/AI訓練積木參數教學.pdf
註：路徑以本腳本所在目錄（build/）為基準，可從任何 cwd 執行。
"""
import io
import os
import re
import subprocess
import urllib.parse

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE, '..'))          # build/ 的上一層 = py_ai_train_run/
PROJECT = os.path.abspath(os.path.join(ROOT, '..', '..', '..'))  # 專案根
DIST = os.path.join(ROOT, 'dist')
SRC = os.path.join(DIST, 'AI訓練積木參數教學_單檔版.html')
OUT = os.path.join(DIST, 'AI訓練積木參數教學.pdf')

EDGES = [
    r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Microsoft\Edge\Application\msedge.exe',
    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
]

# 與 index.html 的 Reveal.initialize({ width:1280, height:780 }) 對應
PAGE_SIZE = '13.333in,8.125in'


def find_browser():
    for p in EDGES:
        if os.path.exists(p):
            return p
    raise SystemExit('找不到 Edge/Chrome')


PRINT_CSS = ('<style id="a4-print-fix">@page{size:A4 portrait;margin:12mm}'
             '@media print{html:not(.print-pdf) body{padding:0 4mm}}</style>')


def make_print_variant(src, dst):
    """把 @page A4 樣式注入 </head> 前，產生僅供列印的暫存檔（不污染正式產物）。"""
    with io.open(src, 'r', encoding='utf-8') as f:
        h = f.read()
    if 'a4-print-fix' in h:
        return dst
    h = h.replace('</head>', PRINT_CSS + '\n</head>', 1)
    with io.open(dst, 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(h)
    return dst


def main():
    if not os.path.exists(SRC):
        raise SystemExit('請先執行 pack_single.py 產生單檔 HTML')
    exe = find_browser()
    src = os.environ.get('SRC_HTML', SRC)
    out = os.environ.get('OUT_PDF', OUT)
    # 預設 '' = @media print 講義模式（headless 唯一可產出內容的路徑）
    # 若設 '?print-pdf' 會走 Reveal 投影片排版，headless 下會產出空白 PDF，勿用
    query = os.environ.get('QUERY', '')
    variant = os.path.join(PROJECT, 'temp', '_print_variant.html')
    os.makedirs(os.path.dirname(variant), exist_ok=True)
    make_print_variant(src, variant)
    url = 'file:///' + urllib.parse.quote(variant.replace('\\', '/')) + query
    cmd = [
        exe, '--headless=new', '--disable-gpu', '--no-sandbox',
        '--no-pdf-header-footer',
        '--virtual-time-budget=20000',
        '--run-all-compositor-stages-before-draw',
        '--print-to-pdf=' + out, url,
    ]
    print('browser:', exe)
    print('url    :', url)
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if r.returncode != 0:
        print('stderr :', r.stderr[:500])
    if not os.path.exists(out):
        raise SystemExit('PDF 未產出')
    with io.open(out, 'rb') as f:
        data = f.read()
    pages = data.count(b'/Type /Page') or data.count(b'/Type/Page')
    boxes = set(re.findall(rb'/MediaBox\s*\[([^\]]*)\]', data))
    print('OK ->', out)
    print('size: %.1f KB, approx pages: %d' % (len(data) / 1024.0, pages))
    print('MediaBox:', boxes, '(A4 = 0 0 595 842)')


if __name__ == '__main__':
    main()
