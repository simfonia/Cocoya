"""把 Reveal.js 簡報打包成單一獨立 HTML（內嵌 CSS/JS，離線可用、可上傳 Moodle）。

用法：python build/pack_single.py
產出：docs/teaching/py_ai_train_run/dist/AI訓練積木參數教學_單檔版.html
規範：UTF-8 無 BOM、CRLF 行尾（與原檔一致）。
註：路徑以本腳本所在目錄（build/）為基準，可從任何 cwd 執行。
"""
import io
import os
import re

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE, '..'))   # build/ 的上一層 = py_ai_train_run/
DIST = os.path.join(ROOT, 'dist')
OUT = os.path.join(DIST, 'AI訓練積木參數教學_單檔版.html')


def read(p):
    with io.open(p, 'r', encoding='utf-8') as f:
        return f.read()


def main():
    html = read(os.path.join(ROOT, 'index.html'))
    reveal_css = read(os.path.join(ROOT, 'lib', 'reveal', 'reveal.css'))
    theme_css = read(os.path.join(ROOT, 'lib', 'reveal', 'theme', 'beige.css'))
    reveal_js = read(os.path.join(ROOT, 'lib', 'reveal', 'reveal.js'))

    # 依賴內容含 </style> 或 </script> 會提前關閉標籤 → 直接中止，不產出壞檔
    for name, blob, close in (('reveal.css', reveal_css, '</style'),
                              ('beige.css', theme_css, '</style'),
                              ('reveal.js', reveal_js, '</script>')):
        if close in blob:
            raise SystemExit('內嵌中止：%s 含有 %s' % (name, close))

    # <link rel="stylesheet" href="..."> → <style>...</style>
    def css_to_inline(m):
        return '<style>/* inlined: %s */\n%s</style>' % (m.group(1), m.group(2))

    links = re.findall(
        r'<link\s+rel="stylesheet"\s+href="([^"]+)"(?:\s+id="[^"]*")?\s*/?>', html)
    for href in links:
        rel = href.replace('/', os.sep)
        blob = reveal_css if href.endswith('reveal.css') else theme_css
        pattern = re.compile(
            r'<link\s+rel="stylesheet"\s+href="%s"(?:\s+id="[^"]*")?\s*/?>' % re.escape(href))
        html = pattern.sub(lambda m: '<style>/* inlined: %s */\n%s</style>'
                           % (href, blob), html, count=1)

    # <script src="..."></script> → <script>...</script>
    scripts = re.findall(r'<script\s+src="([^"]+)"\s*>\s*</script>', html)
    for src in scripts:
        pattern = re.compile(r'<script\s+src="%s"\s*>\s*</script>' % re.escape(src))
        html = pattern.sub(lambda m: '<script>/* inlined: %s */\n%s</script>'
                           % (src, reveal_js), html, count=1)

    leftovers = re.findall(r'<(?:link|script|img)\b[^>]*\b(?:href|src)="[^"]+"[^>]*>', html)
    leftovers = [t for t in leftovers if not t.startswith('<script') or 'src=' not in t]
    leftovers = [t for t in leftovers if 'href="http' not in t]
    if leftovers:
        raise SystemExit('仍有未內嵌的外部依賴：%s' % leftovers[:3])

    html = html.replace(
        '<!DOCTYPE html>',
        '<!DOCTYPE html>\n<!-- 單檔離線版：Reveal.js 與佈景主題已全部內嵌，'
        '可單獨上傳 Moodle 課程檔案、離線開啟或列印成 PDF。 -->', 1)

    os.makedirs(DIST, exist_ok=True)
    with io.open(OUT, 'w', encoding='utf-8', newline='\r\n') as f:
        f.write(html)

    size = os.path.getsize(OUT)
    sections = len(re.findall(r'<section>', html))
    print('OK ->', OUT)
    print('inlined css: %d, js: %d' % (len(links), len(scripts)))
    print('size: %.1f KB, sections: %d' % (size / 1024.0, sections))


if __name__ == '__main__':
    main()
