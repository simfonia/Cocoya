"""增量判斷：來源未變更時跳過打包（讓 build 可安全掛到編譯流程）。

比較來源檔（index.html + lib/reveal/** + 打包腳本本身）的 SHA256 與上次建置
寫入的 dist/.buildstamp.json；相同則印 SKIP 並以 exit code 0 結束。

用法：python build/incremental.py            # 有變更才回 exit 0，無變更 exit 10
      python build/incremental.py --force    # 強制重建
"""
import hashlib
import io
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(BASE, '..'))
DIST = os.path.join(ROOT, 'dist')
STAMP = os.path.join(DIST, '.buildstamp.json')

# 來源清單：簡報本體 + 離線依賴 + 打包腳本（腳本改了也要重建）
SOURCES = [
    os.path.join(ROOT, 'index.html'),
    os.path.join(ROOT, 'lib', 'reveal', 'reveal.css'),
    os.path.join(ROOT, 'lib', 'reveal', 'reveal.js'),
    os.path.join(ROOT, 'lib', 'reveal', 'theme', 'beige.css'),
    os.path.join(BASE, 'pack_single.py'),
    os.path.join(BASE, 'html2pdf.py'),
]

EXIT_SKIP = 10


def read_stamp():
    try:
        with io.open(STAMP, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (IOError, ValueError):
        return {}


def digest_parts():
    parts = []
    for p in SOURCES:
        name = os.path.basename(p)
        if not os.path.exists(p):
            parts.append('%s:MISSING' % name)
            continue
        h = hashlib.sha256()
        with io.open(p, 'rb') as f:
            h.update(f.read())
        parts.append('%s:%s' % (name, h.hexdigest()))
    return parts


def main():
    force = '--force' in sys.argv
    parts = digest_parts()
    now = hashlib.sha256('|'.join(parts).encode('utf-8')).hexdigest()
    old = read_stamp()
    changed = [p.split(':')[0] for p in parts if p not in old.get('files', [])]

    if not force and old.get('hash') == now:
        print('SKIP: 來源未變更，dist/ 產物已是最新（需強制重建請加 --force）')
        sys.exit(EXIT_SKIP)
    if not force and changed:
        print('CHANGED: ' + ', '.join(changed))
    elif force:
        print('FORCE: 忽略變更偵測，強制重建')

    os.makedirs(DIST, exist_ok=True)
    with io.open(STAMP, 'w', encoding='utf-8') as f:
        json.dump({'hash': now, 'files': parts}, f, ensure_ascii=False, indent=2)
    print('STAMP updated ->', STAMP)


if __name__ == '__main__':
    main()
